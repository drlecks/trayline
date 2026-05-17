# Phase N7 — Local LLM Adapter

**Estimate:** 4–6 days

**Depends on:** N6.2 (AI Setup Wizard), N6.3

---

## Goals

Non-technical users who don't have Claude Code installed currently hit a hard wall on first launch. This phase eliminates that wall by bundling a local inference runtime (`node-llama-cpp`) with the app and letting users download a small open-weight model (Gemma, Phi, Qwen, etc.) on first run — no accounts, no API keys, no external software.

This phase adds:
1. A **local LLM adapter** (`local-llm`) that runs GGUF models in-process via `node-llama-cpp`
2. A **model catalog** (`local-models.json`) listing downloadable models — easy to extend without touching code
3. A **model download service** (main process) that streams the model file with progress reporting
4. A **download modal overlay** in the first-run screen so users can pick and download a model in one step
5. **Updated `AdapterSetupScreen`** that shows both cloud (Claude Code) and local adapter options with appropriate CTAs per adapter type

**What this does not do:** auto-select the local adapter — user preference persists via existing `defaultAdapterId`. Does not expose effort/model selection beyond what's downloaded.

**MCP support is intentionally excluded and will not be added to this adapter.** MCPs require an agentic tool-use loop that does not exist in a text-only local model. Any worker or source step that has MCPs configured will be blocked at pre-flight when the local adapter is selected, with a clear user-facing warning pointing them to switch to an external adapter. See the Compatibility section and task 6.

---

## Branch strategy

This phase is large enough to warrant its own integration branch.

```
develop
└── feature/local-llm        ← base branch for this entire phase
    ├── feature/local-llm/1-types-catalog      ← task group 2 + 3
    ├── feature/local-llm/2-service            ← task group 4
    ├── feature/local-llm/3-adapter            ← task group 5 + 6
    ├── feature/local-llm/4-ipc               ← task group 7
    └── feature/local-llm/5-ui                ← task group 8 + 9
```

Workflow:
1. Create `feature/local-llm` from `develop` before writing any code.
2. Each sub-branch above forks from `feature/local-llm` and merges back into it (not into `develop`) via short-lived PRs.
3. When all sub-branches are merged and the feature is working end-to-end, the user reviews the whole `feature/local-llm` branch and decides whether to merge it into `develop`.
4. **Do not merge `feature/local-llm` into `develop` without explicit user confirmation.** This is a large-footprint change.

---

## How the local LLM differs from Claude Code — architecture rationale

Understanding this distinction is critical before implementing.

### Claude Code is an agent

When you invoke `claude -p` with a prompt, Claude Code does not just generate text. It:
- Has access to built-in **tools**: read file, write file, execute bash, search, web browse
- Runs in a **loop**: thinks → picks a tool → executes it → observes the result → thinks again
- Can **create files, edit files, run commands** as side effects
- Terminates when it decides the task is done

This is why Claude Code can execute a `process.md` that says "create a project structure with the following files" — it literally runs file-creation commands in the background.

### `node-llama-cpp` is a text predictor

When you call `session.prompt(text)`, the library reads every token in your prompt and predicts what tokens come next, until it decides to stop. That is all it does. There are no built-in tools, no file access, no internet, no loop. It is **text in → text out**.

If a `process.md` says "create a folder and write files to it", the local LLM will write a text description of doing that, not actually do it. The files will not be created.

### What this means for Trayline workers

Trayline's worker design already handles this correctly for the majority of use cases. The worker contract (`trayline-worker-contract` skill) tells the model: "read the card data, do your job, return a JSON object." Your code (the worker runner) handles all card movement, file operations, and routing. The AI's only job is to produce a JSON output.

This means:

- **Text transformation workers** — summarise, classify, extract, translate, draft, score, validate format — are **fully compatible** with local LLM.
- **Workers that rely on Claude Code's agentic tools** (reading external files, running commands, browsing the web) **are not compatible** with local LLM and should continue to use Claude Code.

For the vast majority of business automation use cases (the Trayline target audience), text transformation is exactly what is needed. The local adapter covers these completely.

---

## Prompting schemes audit — which app flows work locally

The following is a full audit of every place the app passes a prompt to an adapter, and whether that flow is compatible with a text-only local LLM.

### ✅ Worker runs (`worker-runner.ts` + `source-runner.ts` for worker steps)

**How it works:** card data JSON + `process.md` + skills (always including `trayline-worker-contract`) + context packs → adapter → parsed JSON output → card movement handled entirely by runner code.

**Local LLM compatible:** Yes. The model's only job is to produce a JSON object. The runner's `extractTrailingJson` function already strips ANSI codes and finds the JSON block even if prose surrounds it. The `trayline-worker-contract` skill explicitly says "Output ONLY JSON."

**Risk:** Small models may still prefix JSON with brief reasoning text ("Here is the output:") or wrap it in markdown fences. Mitigation: the local LLM adapter's `spawn()` must inject a short system-level reinforcement as the first line of every prompt it sends: `"Respond with a single JSON object only. No prose, no markdown fences, no explanations."` This comes before the skill content.

### ✅ Author service (`author-service.ts`)

**How it works:** The user's free-text workflow description is passed to `adapter.spawn()` with the `trayline-author` system skill. Expected output is a WorkflowPlan JSON object. **The scaffold step (creating actual files and folders) is done entirely by `scaffold-service.ts` in TypeScript code — the AI only generates a JSON plan.** There is nothing in the author flow that requires file system access or tool use from the model.

**Local LLM compatible:** Yes, structurally. The model just produces JSON.

**Risk:** Medium. Generating deeply nested JSON with long embedded string values (a full `process.md` body inside a JSON string field) is genuinely harder for small models. A 1.5B parameter model may:
- Produce invalid JSON (unescaped newlines inside string values) — partially mitigated by the existing `sanitizeJsonStrings` function in `author-service.ts`
- Truncate the output early if the context window fills up
- Miss fields in the plan schema

**Recommendation for V1:** document in the UI that workflow generation ("Describe your workflow") works better with Claude Code. The local adapter can be used for all worker runs; the author feature should note it may produce simpler or incomplete plans with small models. Do not block the author service for local LLM — let it try and fail gracefully via the existing `AuthorError` paths.

### ⚠️ Source step runs (`source-runner.ts` for source steps)

**How it works:** source steps run `source.md` as the instruction file. The expected output is a JSON array of items. Source steps almost universally require fetching data from external services — typically via MCP tools (`web-browse`, `fetch`, `github`, etc.) that Claude Code activates during its agentic loop.

**Local LLM compatible:** No, in practice.

Two reasons:
1. **No MCP support**: the local adapter does not pass MCPs to `node-llama-cpp` (MCPs spawn external processes that the library cannot interact with).
2. **No internet access**: even if MCPs were passed, the local model has no mechanism to make HTTP requests. It would generate plausible-looking but entirely hallucinated data.

**Mitigation:** The worker runner already has a pre-flight check (`adapterReadinessService.isReadyToRun`). We add a parallel check: if the adapter is `local-llm` and the step is a source step, abort the run with a clear error: `"Source steps require internet access and cannot run with the local AI adapter. Switch to Claude Code in Settings to run this source."` This prevents silent hallucination failures.

### ✅ `trayline-scaffold` skill — NOT an active prompt

This skill.md exists as documentation for power users who edit the system prompts manually. The app **never passes it to any adapter at runtime**. All scaffolding (file and folder creation) is done by `scaffold-service.ts` in TypeScript. This was confirmed by source search — no call site passes `trayline-scaffold` to `adapter.spawn()`. Safe to ignore.

### Audit summary

| Flow | Compatible | Risk | Action needed |
|---|---|---|---|
| Worker text transformation runs | **Yes** | Low | JSON-only system prompt reinforcement in `spawn()` |
| Author service (workflow design) | **Partially** | Medium | Note in UI; let it fail gracefully |
| Source step runs | **No** | High (hallucination) | Pre-flight abort with clear error message |
| Scaffold service | N/A | None | No changes needed |

---

## Architecture overview

```
node-llama-cpp (native binding, bundled with app)
  └── loads GGUF model from {userData}/trayline-models/<filename>
        └── LocalLlmSession implements AISession
              └── streams tokens as stdout async iterable
                    └── worker runner receives output exactly like Claude Code
```

The local adapter conforms to the same `AITerminalAdapter` interface as `claude-code.ts`. No engine changes required — the registry picks it up like any other adapter.

---

## New npm dependency

`node-llama-cpp` (v3) — Node.js bindings for llama.cpp. Ships pre-built native binaries for Windows/macOS/Linux x64 and arm64. Requires `electron-rebuild` (or `@electron/rebuild`) to relink the native `.node` binary against the correct Electron ABI at build time.

Add to `package.json` under `dependencies`. Add a `postinstall` script: `electron-rebuild -f -w node-llama-cpp`.

---

## Model catalog — `src/main/ai-terminals/local-models.json`

JSON array, one object per downloadable model. Fields:

```jsonc
[
  {
    "id": "qwen2.5-1.5b",
    "label": "Qwen 2.5 1.5B (Recommended)",
    "description": "Fastest local model — runs on any machine. Good for simple, focused tasks.",
    "filename": "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    "url": "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    "sizeMb": 986,
    "sizeBytes": 1034000000,
    "recommended": true,
    "minRamMb": 2048
  },
  {
    "id": "qwen2.5-3b",
    "label": "Qwen 2.5 3B",
    "description": "Balanced quality and speed — handles most workflow tasks well.",
    "filename": "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    "url": "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    "sizeMb": 1920,
    "sizeBytes": 2013000000,
    "recommended": false,
    "minRamMb": 4096
  },
  {
    "id": "phi-4-mini",
    "label": "Phi-4 Mini (Microsoft)",
    "description": "Strongest reasoning in a small package — best for complex multi-step instructions.",
    "filename": "Phi-4-mini-instruct-Q4_K_M.gguf",
    "url": "https://huggingface.co/bartowski/phi-4-mini-instruct-GGUF/resolve/main/phi-4-mini-instruct-Q4_K_M.gguf",
    "sizeMb": 2480,
    "sizeBytes": 2600000000,
    "recommended": false,
    "minRamMb": 6144
  }
]
```

**Note:** verify all HuggingFace URLs before shipping — bartowski's repo slugs occasionally change on model revisions. The filename and URL are the only fields that affect runtime behaviour; all others are display-only.

Model files are stored at `{app.getPath('userData')}/trayline-models/<filename>` and survive app updates. To add a new model later, add one entry to this JSON — no TypeScript changes needed.

---

## Tasks

### 1. Branch setup

- [x] From `develop`, create `feature/local-llm`:
  ```bash
  git checkout develop && git pull origin develop
  git checkout -b feature/local-llm
  git push -u origin feature/local-llm
  ```
- [x] All sub-task branches fork from `feature/local-llm` and merge back into it, not into `develop`.

### 2. Package & build wiring

- [x] Add `node-llama-cpp` to `dependencies` in `package.json`
- [x] Add `@electron/rebuild` to `devDependencies`
- [x] Add `postinstall` script: `electron-rebuild -f -w node-llama-cpp`
- [x] Confirm pre-built binary loads in the Electron main process (smoke test: `const { getLlama } = require('node-llama-cpp')` without error)

### 3. Shared types

- [x] **`src/shared/types.ts`** — extend `AdapterBlockerKind`:
  ```typescript
  export type AdapterBlockerKind =
    | 'not_installed'
    | 'model_not_downloaded'   // local-llm: runtime present but no model file on disk
  ```
- [x] Add `LocalModelEntry` interface (used by IPC):
  ```typescript
  export interface LocalModelEntry {
    id: string
    label: string
    description: string
    filename: string
    sizeMb: number
    sizeBytes: number
    recommended: boolean
    minRamMb: number
    downloaded: boolean        // resolved at runtime by local-model-service
    downloadedAt?: number      // ms timestamp, if downloaded
  }
  ```
- [x] Add IPC progress type:
  ```typescript
  export interface ModelDownloadProgress {
    modelId: string
    downloadedBytes: number
    totalBytes: number
    percent: number            // 0–100
  }
  ```

### 4. Local model service — `src/main/services/local-model-service.ts`

Owns the model files on disk and the in-flight download.

- [x] `getModelsDir()` → `path.join(app.getPath('userData'), 'trayline-models')` — creates the directory if missing
- [x] `getCatalog(): LocalModelCatalogEntry[]` — reads and parses `local-models.json` from the app's resources directory (not the renderer bundle)
- [x] `isDownloaded(filename: string): boolean` — synchronously checks file existence in `getModelsDir()`
- [x] `getModelPath(filename: string): string` — full absolute path
- [x] `listWithStatus(): LocalModelEntry[]` — merges catalog with downloaded flags (resolves `downloaded` and `downloadedAt`)
- [x] `downloadModel(modelId: string, onProgress: (p: ModelDownloadProgress) => void): Promise<void>`:
  - Looks up model in catalog by id
  - Creates `getModelsDir()` if missing
  - Opens a write stream to `<modelsDir>/<filename>.part`
  - Uses `https.get` (or `fetch` with `AbortController`) to stream the file
  - Reports progress on each chunk via `onProgress`
  - On complete: `fs.rename` from `.part` to final filename (atomic)
  - On error: deletes the `.part` file
- [x] `cancelDownload(modelId: string): void` — calls `AbortController.abort()` on the in-flight request; rejects the `downloadModel` promise
- [x] `deleteModel(modelId: string): Promise<void>` — removes model file
- [x] Write `local-model-service.test.ts`:
  - `isDownloaded()` returns false when no file exists, true when it does
  - `listWithStatus()` merges catalog correctly — downloaded flag reflects actual disk state
  - `downloadModel()` writes the file and calls onProgress (mock `https.get`)
  - `cancelDownload()` cleans up the `.part` file

### 5. Local LLM adapter — `src/main/ai-terminals/local-llm.ts`

- [x] `checkReadiness(): Promise<AdapterReadiness>`:
  - Calls `localModelService.listWithStatus()`
  - If no model has `downloaded: true` → returns `installed: false` with one blocker: `{ kind: 'model_not_downloaded', message: 'No local model has been downloaded yet.' }`
  - If at least one model is downloaded → returns `installed: true, version: <model label>, blockers: []`
- [x] `detectInstalled()` — delegates to `checkReadiness().then(r => r.installed)` (deprecated shim)
- [x] `getVersion()` — returns the first downloaded model's label (deprecated shim)
- [x] `listModels()` — returns only downloaded models as `ModelInfo[]`, keyed by `id`
- [x] `listEfforts()` — returns `[]` (local models don't expose effort tiers)
- [x] `getUsage()` — returns `null`
- [x] `clearContext()` — no-op (each `spawn()` creates a fresh context; model is stateless across runs)
- [x] `supportsMcps: false` — add this optional flag to the `AITerminalAdapter` interface in `adapter.ts`; set to `true` by default so existing adapters are unaffected; the local adapter sets it `false`
- [x] `spawn(opts: SpawnOptions): Promise<AISession>`:
  - Reads the worker's `processFile`, assembles the prompt exactly as `claude-code.ts` does (skills + context packs + `renderProcessTemplate`)
  - **Prepends a JSON-enforcement line** as the very first line of the assembled prompt: `"Respond with a single JSON object only. No prose, no markdown fences, no explanations before or after the JSON."` — this is the mitigation for small models that tend to add preamble.
  - Picks the first downloaded model (from `localModelService.listWithStatus()`)
  - Calls `getLlama()` (cached singleton) → `llama.loadModel({ modelPath })` → `model.createContext()` → `context.getSequence()`
  - Creates a `LlamaChatSession` from `node-llama-cpp`
  - Streams generation via `session.prompt(fullPrompt, { onTextChunk })` — each chunk pushed into token queue
  - Returns a `LocalLlmSession` implementing `AISession`:
    - `pid: -1`
    - `stdout`: async iterable yielding text chunks as they stream
    - `stderr`: empty async iterable
    - `awaitingInput: false` (local model is one-shot, no interactive input)
    - `sendInput()`: no-op
    - `kill()`: signals abort to the llama generation
    - `result()`: resolves with `{ exitCode: 0, output, terminalLog, startedAt, endedAt }` when generation ends
  - Writes `terminal.log` to `opts.workingDir` on completion (same pattern as Claude Code adapter)
- [x] Write `local-llm.test.ts`:
  - `checkReadiness()` returns `model_not_downloaded` blocker when no models are downloaded
  - `checkReadiness()` returns `installed: true` when at least one model file exists
  - `listModels()` returns only downloaded models
  - `spawn()` integration smoke test with a mock `node-llama-cpp` (`vi.mock`)

### 6. MCP incompatibility — hard blocks and warnings

MCP support is a firm "never" for the local adapter. The goal is not just to block runs, but to surface the incompatibility early and clearly so the user is never surprised at run time.

#### 6a. Runtime pre-flight hard blocks

- [x] **`src/main/services/worker-runner.ts`** — before spawning, if `adapter.supportsMcps === false` and `mcpIds.length > 0`, abort with audit row `run_aborted_mcp_not_ready` and error: `"This worker uses MCPs which require an external AI agent. Switch to Claude Code (or another cloud adapter) in Settings → AI Terminal to run it."`
- [x] **`src/main/services/source-runner.ts`** — same check: if `adapter.supportsMcps === false`, abort before spawning with: `"Source steps fetch data from external services and require an external AI agent. Switch to Claude Code in Settings → AI Terminal to run this source."`

#### 6b. Worker detail view warning banner

When the active default adapter is `local-llm` and a worker step has one or more MCPs configured, the worker detail panel must show a visible warning — before the user tries to run it.

- [x] **`src/renderer/components/worker/WorkerDetail.tsx`** (or equivalent) — read `adapterStore.defaultAdapterId` and the worker's `mcps` array. If adapter is `local-llm` and `mcps.length > 0`, render an amber warning banner above the Run button:
  > **This worker uses MCPs and cannot run with the local AI model.**  
  > Switch to Claude Code in [Settings → AI Terminal](#) to enable it.
- [x] The "Run" button itself is not disabled (user may switch adapter before running), but the banner is prominent enough that they know what to expect.

#### 6c. Source step detail view warning

- [x] **Source step detail panel** — same pattern: if adapter is `local-llm`, show an amber banner:
  > **Source steps require an external AI agent to fetch data.**  
  > Switch to Claude Code in [Settings → AI Terminal](#) to run this source.

#### 6d. Settings panel warning when switching to local adapter

When the user selects "Local AI (offline)" as their default adapter in Settings → AI Terminal, check whether any installed project has workers or source steps that use MCPs.

- [x] In the Settings AI Terminal section, after the user selects `local-llm` as default: query all projects for steps that have MCPs configured. If any exist, show an inline callout below the adapter selector:
  > **Some of your workers use MCPs and will not run with the local AI model.** Those steps will still work with Claude Code — you can switch adapters at any time.
- [x] This check runs client-side on the adapter selection change. It does not block the switch — it is informational only.

#### 6e. MCP screen — adapter compatibility indicator

In the MCPs management screen (the list of installed MCPs), add a small indicator next to each MCP showing which adapters support it.

- [x] Add a "Requires external agent" badge (or tooltip) on each MCP entry in the MCP list panel. Copy: `"Not available with local AI model"`.
- [x] This is a static label — all MCPs get it, because no MCP works with the local adapter.

#### 6f. Immediate error response on Run click — fail before the run is created

MCP-credential errors (missing credentials, disabled MCP) create a run entry and then mark it failed — that is correct, because the failure is a run-time condition discovered during execution. Adapter incompatibility is different: it is known before execution starts, so we should reject the call **before** allocating a run ID or creating the run directory. This way the renderer gets an IPC-level error, not a near-instant failed run that the user has to hunt down in the runs tab.

- [x] **`src/main/services/worker-runner.ts`** — move the `adapter.supportsMcps === false` check to **before** `nextRunId()` and `fs.mkdir(runDir)`. Throw directly from `runInner` before any run state is created:
  ```typescript
  if (adapter.supportsMcps === false && mcpIds.length > 0) {
    throw new Error(
      'This worker uses MCPs which require an external AI agent. ' +
      'Switch to Claude Code (or another cloud adapter) in Settings → AI Terminal.'
    )
  }
  ```
  Because this throw happens before any run directory or audit entry is created, `triggerRun` will reject and the IPC call will surface as an error — not a failed run in the list.

- [x] **`src/main/services/source-runner.ts`** — same placement: check `adapter.supportsMcps === false` before run allocation and throw so the IPC call rejects.

- [x] **`src/renderer/components/project/WorkerDetailPanel.tsx`** — in the "Run now" button click handler, wrap the `worker.triggerRun` call in a try/catch (or `.catch`). On error, display an inline error alert directly below the Run button (not a toast, not a modal) — matches the existing `run.error` red box style (`border-red-200 bg-red-50 text-red-800`) but scoped to the trigger action, not a specific run:
  ```
  ┌─────────────────────────────────────────────────────────┐
  │  ✕  This worker uses MCPs which require an external AI  │
  │     agent. Switch to Claude Code in Settings →          │
  │     AI Terminal.                [Go to Settings]        │
  └─────────────────────────────────────────────────────────┘
  ```
  The "Go to Settings" link navigates to Settings → AI Terminal. The alert is dismissed on the next successful run trigger or when the user navigates away.

- [x] **`src/renderer/components/project/SourceDetailPanel.tsx`** — same pattern in the source "Run now" handler: catch the IPC error and show the inline alert with copy: `"Source steps require an external AI agent. Switch to Claude Code in Settings → AI Terminal."`

### 7. Stale `.part` file cleanup on startup

- [x] **`src/main/services/local-model-service.ts`** — add `cleanupStaleParts(): Promise<void>`: scans `getModelsDir()` for any `*.part` files and deletes them. These are left by interrupted downloads (app crash, force quit, network error mid-stream).
- [x] **`src/main/index.ts`** — call `localModelService.cleanupStaleParts()` inside `app.whenReady()`, before `adapterReadinessService.checkAll()`. Order matters: clean up before the readiness check so a leftover `.part` file is never mistaken for a valid model (it won't be — `isDownloaded` checks the final filename, not `.part` — but cleanup keeps `trayline-models/` tidy).

### 8. Batch run guard

The `supportsMcps` check in task 6 covers single-card runs (`runInner`), but `worker-runner.ts` has a separate code path for batch runs (`runBatchInner`) with its own MCP resolution. Both must be guarded.

- [x] **`src/main/services/worker-runner.ts` — `runBatchInner`** — add the same early throw before run allocation:
  ```typescript
  if (adapter.supportsMcps === false && batchMcpIds.length > 0) {
    throw new Error(
      'This worker uses MCPs which require an external AI agent. ' +
      'Switch to Claude Code (or another cloud adapter) in Settings → AI Terminal.'
    )
  }
  ```
- [x] The renderer's batch-run trigger handler also needs the same try/catch + inline error alert pattern as the single-run handler (task 6f). (Covered by the existing `handleRunNow` catch in `WorkerDetailPanel` — batch and single runs share the same IPC call and catch block.)

### 9. Registry

- [x] **`src/main/ai-terminals/registry.ts`** — add:
  ```typescript
  import { localLlmAdapter } from './local-llm'
  register(localLlmAdapter)
  ```
- [x] **`src/main/ai-terminals/mock.ts`** — add `supportsMcps: true` (explicit, so tests that rely on MCP pre-flight pass-through are not broken by the default-true assumption). The mock adapter is `kind: 'mock'` and never used in production runs, but the field should be set to avoid ambiguity.

### 10. IPC channels

- [x] **`src/shared/ipc-channels.ts`** — add:
  ```
  local-model:list             → LocalModelEntry[]
  local-model:download         → starts download (modelId arg), resolves when done
  local-model:cancel           → cancels in-flight download (modelId arg)
  local-model:delete           → deletes downloaded model file (modelId arg)
  local-model:recheck-adapter  → re-runs local-llm checkReadiness, returns AdapterReadiness
  ```
  Events (main → renderer):
  ```
  local-model:progress          → ModelDownloadProgress
  local-model:download-complete → { modelId: string }
  local-model:download-error    → { modelId: string; error: string }
  ```
- [x] **`src/main/ipc/handlers.ts`** — wire the five invoke handlers and the three event emitters
- [x] **`src/preload/index.ts`** — expose under `window.trayline.localModel`:
  - `list()`, `download(modelId)`, `cancel(modelId)`, `delete(modelId)`, `recheckAdapter()`
  - `onProgress(cb)`, `onDownloadComplete(cb)`, `onDownloadError(cb)`

### 11. Model download modal — `src/renderer/components/adapter/ModelDownloadModal.tsx`

Full-window overlay shown when the user clicks "Download local model" on the `AdapterSetupScreen`.

- [x] **Idle state** (no active download):
  - Title: "Download a local AI model"
  - Subtitle: "Pick a model to download. Trayline will use it to run your workflows — no internet required after this."
  - List of `LocalModelEntry` cards: label, description, size in MB, "Recommended" badge if flagged
  - Each card has a radio selector; the `recommended` model is pre-selected
  - "Download" button (primary) — disabled until a model is selected
  - "Cancel" text button — closes the modal without downloading
- [x] **Downloading state** (after "Download" is clicked):
  - Model name + "Downloading…" header
  - Progress bar (inline Tailwind CSS — no shadcn Progress component in this project) — percent from `onProgress` events
  - "X.X MB of Y.Y MB" byte counter below the bar
  - "Cancel download" link — calls `localModel.cancel(modelId)` then resets to idle
  - Dismissal is blocked while downloading (no close button, no backdrop click)
- [x] **Complete state** (after `download-complete` event):
  - "Model ready" message with a checkmark
  - "Start using Trayline" button → calls `localModel.recheckAdapter()` → if `installed: true`, calls `onReady()` prop
- [x] **Error state**:
  - Error message from `download-error` event
  - "Try again" → resets to idle
- [x] Props: `open: boolean`, `onOpenChange: (v: boolean) => void`, `onReady: () => void`

### 12. Updated `AdapterSetupScreen.tsx` and wizard suppression for local-llm

- [x] Detect `local-llm` adapter by `adapter.id` and render a variant card:
  - **No install guide link** (no `installUrl` on local adapter)
  - Show a short description line below the adapter name explaining it runs offline
  - Show **"Download local model"** as the primary button
  - When clicked: opens `ModelDownloadModal` with `onReady={onReady}`
  - If readiness shows `installed: true` (model already downloaded on a return visit): render the same "Check again" / "Setup guide" buttons as other adapters
- [x] Keep existing Claude Code card rendering unchanged
- [x] Add a `description` field to adapter cards (sourced from adapter list IPC), show it in small muted text under the display name:
  - Claude Code: `"Cloud-powered — most capable. Requires external installation."`
  - Local AI: `"Runs entirely on your machine — no account or internet needed after setup."`
- [x] Import and render `ModelDownloadModal` at the bottom of the component
- [x] **Suppress `AdapterSetupWizard` for local-llm.** The existing wizard (built in N6.2) handles the `not_installed` blocker kind with install instructions and a `fixCommand`. It has no step for `model_not_downloaded`. Do not open the wizard for local-llm on any path — remove the "Setup guide" button from the local-llm adapter card entirely. The download modal is the wizard for local-llm.

### 13. Adapter display metadata (IPC layer)

- [x] Add `description` and `requiresExternalInstall: boolean` to the adapter list IPC response payload in `handlers.ts`
- [x] Add `description` field to each adapter (`claude-code.ts`, `local-llm.ts`, `mock.ts`) so the renderer doesn't need to hard-code adapter IDs for branching logic

### 14. Settings panel — local model management

After first-run, the user needs a way to manage downloaded models from Settings. The Settings → AI Terminal section already exists; add a "Local AI model" subsection beneath it.

- [x] **`src/renderer/components/settings/SettingsPanel.tsx`** (or equivalent) — when `local-llm` is a registered adapter, render a "Local AI model" subsection:
  - List of downloaded models with: name, size on disk, download date, and a **Delete** button (calls `localModel.delete(modelId)`, then refreshes the list and rechecks adapter readiness)
  - A **"Download another model"** link/button that opens the `ModelDownloadModal` (reusing the existing component, same flow as first-run but with `onReady` being a no-op since the gate is already dismissed)
  - If no model is downloaded: shows a prompt "No local model downloaded" with a "Download now" button
- [x] After a model is deleted, call `adapter.recheck('local-llm')` to update the adapter readiness state. If no models remain, the adapter becomes not-ready — the gate will show on next launch, but the current session continues (do not re-show the gate mid-session).

### 15. Author service warning in workflow creation UI

The audit flags that small local models may produce invalid or incomplete workflow plans. The `AuthorError` paths already handle parse failures gracefully, but the user should be warned *before* they try.

- [x] In the **"Describe your workflow"** UI (workflow author dialog/screen), when the active default adapter is `local-llm`, show a soft inline note below the description textarea:
  > **Using local AI model.** Workflow generation works best with Claude Code — local models may produce simpler or incomplete plans. You can edit the result after creation.
- [x] This is informational only — do not block the Generate button. The `AuthorError` paths handle failure gracefully.

### 17. Documentation & alignment audit

- [x] **`docs/tech-stack.md`** — add `node-llama-cpp` to Backend/System section; note that `@electron/rebuild` is required at build time; add `local-models.json` catalog reference
- [x] **`docs/features.md`** — describe the model download modal and local adapter card variant in the first-run gate section; add note about which worker types are local-compatible
- [x] **`docs/user-flows.md`** — add flow 6.17 "First Launch — Download Local Model" (idle → downloading → complete → app opens)
- [x] **`docs/app-description.md`** — update "AI agent" section to reflect that no external install is required when local model is used; update any language that implies Claude Code is the only option
- [x] **`docs/skills-and-mcps.md`** — add a note that MCPs are not available when using the local adapter; document the `supportsMcps` adapter flag
- [x] **`docs/data-model.md`** — no changes needed (card model is unchanged); verify nothing implies Claude Code exclusively
- [x] **`docs/design-principles.md`** — no changes expected; verify
- [ ] **`docs/implementation/tasks.md`** — check off N7 on completion (done after merge to develop)
- [x] Read through all docs listed above and flag any language that assumes Claude Code is the only AI option — update to say "AI adapter" or "Local AI / Claude Code" as appropriate

---

## Acceptance criteria

- A fresh install with no Claude Code shows both "Claude Code" and "Local AI (offline)" cards on the gate screen
- Clicking "Download local model" opens the download modal, shows model choices with sizes, pre-selects the recommended model
- Download progress bar updates in real-time; cancel stops the download and cleans up the `.part` file
- After download completes, clicking "Start using Trayline" dismisses the gate and opens the app normally
- The local adapter appears in Settings → AI Terminal alongside Claude Code
- A worker run using the local adapter completes end-to-end: reads `process.md`, assembles the prompt, streams tokens, writes `terminal.log`, moves the card
- Clicking "Run" on a worker that has MCPs configured while the local adapter is active shows an inline error alert immediately below the Run button — no run entry is created in the runs tab
- The inline error alert contains a "Go to Settings" link that navigates directly to Settings → AI Terminal
- A worker that has MCPs configured fails before running with a clear error message when the local adapter is selected — the error names the adapter and links to Settings
- A source step fails before running with a clear error message when the local adapter is selected
- A worker with MCPs shows an amber warning banner in its detail view before the user even tries to run it
- A source step shows an amber warning banner when the local adapter is the default
- Switching to the local adapter in Settings shows an inline callout if any existing worker or source step uses MCPs
- Every MCP in the MCPs screen carries a "Requires external agent" badge
- The model catalog is a standalone JSON file — adding a new model entry requires no TypeScript changes
- If Claude Code is installed, the gate is not shown (existing behaviour unchanged)
- Settings → AI Terminal shows a "Local AI model" subsection listing downloaded models with delete and download-more actions
- Deleting the last downloaded model marks the local adapter as not-ready (shown in Settings) but does not re-show the gate in the current session
- Stale `.part` files from interrupted downloads are removed on next app launch
- Clicking "Run" on a batch worker with MCPs shows the same inline error and no batch run entry is created
- The workflow author dialog shows a soft warning note when the local adapter is the active default
- The "Setup guide" button is not shown on the local-llm adapter card — the download modal is its equivalent
- `npm test` passes, including the new service and adapter tests

---

## Implementation notes

- `node-llama-cpp` loads models lazily — the first `spawn()` call will be slower (cold model load, 2–10 s). Subsequent runs reuse the same `llama` instance (module-level singleton). Do not call `getLlama()` on every spawn — cache it at module level.
- Model loading (`.loadModel`) blocks the main process thread during load. This is acceptable for V1 since the worker runner is already running asynchronously. Document this in comments.
- The `.part` download pattern prevents Trayline from treating a partial download as a valid model if the app crashes mid-download.
- `node-llama-cpp` pre-built binaries are tied to the llama.cpp ABI version. Pin to a specific minor version (`"~3.x.x"`) and test after any upgrade.
- HuggingFace download URLs in `local-models.json` must be verified before shipping. Bartowski's repos are the most reliable source for up-to-date GGUF conversions.
- The JSON-enforcement prefix added by the local adapter's `spawn()` must not be written to `prompt.txt` — it is an adapter-level concern, not part of the user's process.md. Write `prompt.txt` with the original assembled prompt (skills + context + process.md), and apply the prefix only to what gets sent to the model.
- **Scheduled and watcher-triggered runs:** when the scheduler or file watcher auto-triggers a worker that has MCPs while local-llm is the default adapter, the pre-flight throw prevents the run and no run entry is created. The user will not see an inline error (they're not looking at the UI); the amber warning banner in the worker detail view is the prevention path for this case. This is expected and correct — document it in comments near the guard in `worker-runner.ts`.
- **Model selection with multiple downloads:** `spawn()` picks the first downloaded model from `listWithStatus()`. If the user has downloaded multiple models, there is no per-run model selector in V1 — this is a known limitation. Model management in Settings lets them delete unwanted models to control which one is active.
