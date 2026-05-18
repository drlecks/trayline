# Phase N10 — Onboarding & Accessibility

**Estimate:** 3–5 days

**Depends on:** N9 (Credentials & Connectors)

---

## Goals

Make Trayline fully approachable for non-technical users from the moment the app opens, with no unguided steps and no configuration required outside the app:

1. **Reframe zero-setup principle** — local AI with guided in-app download IS the zero-setup path. Update compliance doc to reflect this design decision.
2. **Credential provider presets** — common email providers (Gmail, Outlook, Yahoo, iCloud) pre-fill all server settings, and an in-app App Password guide removes the need to know any technical detail.
3. **First-project onboarding** — when a user opens a freshly-generated project, a contextual guide tells them exactly what to do next. The existing generic UI tour is refactored into an opt-in overlay accessible from the guide.
4. **AI setup screen priority** — local AI is promoted as the primary recommended option; Claude Code is clearly marked as a power-user option.

---

## Context: why these changes

The core promise is "open the app, describe a task, have automation running in 15 minutes." Three barriers currently stand in the way of delivering that for a non-technical user:

- **Credential setup** requires knowing IMAP/SMTP host addresses and port numbers — technical facts Elena and Marco do not know.
- **After project creation**, the user lands on a project screen with no guidance on what to do first. The workflow exists on disk, but the next action is not obvious.
- **The AI setup screen** currently presents Claude Code and local LLM as equals. For a zero-installation user, local LLM is the right first choice but this isn't communicated.

---

## Task 1 — Compliance doc update (Gap 1 reframe)

Update `docs/new-feature-revision.md`:

- [x] Reframe Gap 1 ("AI adapter barrier") from an open gap to a resolved design decision:
  - Local AI with guided in-app model download IS the zero-setup path.
  - The one-time model download (~3–8 GB) is fully guided in the app, requires no terminal, no account, and no external site.
  - Claude Code is an opt-in power-user upgrade, clearly labelled as such. It is not required.
- [ ] Update the "Zero-setup principle" compliance rule (#1) to reflect this: "No installation beyond Trayline itself, except the optional one-time local AI model download which is fully guided in-app."
- [ ] Remove Gap 1 from the "Active gaps" section and move it to a "Resolved gaps" section.

---

## Task 2 — AI setup screen: promote local LLM

In `AdapterSetupScreen.tsx`:

- [x] Reorder adapters so `local-llm` is always rendered first.
- [x] Add a **"Recommended · No subscription needed"** badge to the local-llm card.
- [x] Add a **"Power user · Requires Anthropic subscription"** note to the Claude Code card.
- [x] Update header copy from `"Trayline needs an AI to run your workflows."` to `"Set up your AI. The local model works out of the box — download it once, use it forever, no account needed."`.
- [x] No behaviour changes — only visual/copy changes and ordering.

---

## Task 3 — Credential provider presets

### 3a. Provider preset definitions

Create `src/renderer/lib/credential-providers.ts` (renderer-only, no backend needed):

```typescript
export interface ProviderPreset {
  id: string
  name: string
  imap?: { host: string; port: number; secure: boolean }
  smtp?: { host: string; port: number; secure: boolean }
  authGuide?: {
    passwordLabel: string   // e.g. "App Password"
    steps: string[]         // numbered plain-English instructions
    settingsUrl: string     // URL to open in the user's browser
    helpText: string        // one-line note shown below the password field
  }
}

export const CREDENTIAL_PROVIDERS: ProviderPreset[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Go to your Google Account (myaccount.google.com).',
        'Open Security → 2-Step Verification (enable it if not already on).',
        'Scroll down to "App passwords" and click it.',
        'Select app: Mail, device: Other — type "Trayline" — click Generate.',
        'Copy the 16-character code and paste it in the field below.',
      ],
      settingsUrl: 'https://myaccount.google.com/apppasswords',
      helpText: 'Gmail requires an App Password, not your regular Google password.',
    },
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Go to account.microsoft.com → Security → Advanced security options.',
        'Under "App passwords", click Create a new app password.',
        'Copy the generated password and paste it in the field below.',
      ],
      settingsUrl: 'https://account.microsoft.com/security',
      helpText: 'Microsoft accounts with 2FA require an App Password.',
    },
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Sign in to Yahoo Account Security (login.yahoo.com/account/security).',
        'Under "Manage app passwords", click Generate password.',
        'Select "Other app", name it "Trayline", click Generate.',
        'Copy the password and paste it below.',
      ],
      settingsUrl: 'https://login.yahoo.com/account/security',
      helpText: 'Yahoo requires an App Password for third-party email clients.',
    },
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: true },
    authGuide: {
      passwordLabel: 'App-Specific Password',
      steps: [
        'Go to appleid.apple.com and sign in.',
        'Under Sign-In and Security → App-Specific Passwords, click Generate.',
        'Name it "Trayline", click Create.',
        'Copy the password and paste it below.',
      ],
      settingsUrl: 'https://appleid.apple.com',
      helpText: 'iCloud requires an App-Specific Password for third-party clients.',
    },
  },
  {
    id: 'custom',
    name: 'Custom / other',
  },
]
```

### 3b. Update `ImapCredentialDialog.tsx`

- [ ] Add a `selectedProvider` state (default: `null`).
- [ ] Render a **provider picker row** at the top of the form: pill buttons for each provider (`CREDENTIAL_PROVIDERS`). "Custom / other" is always last.
- [ ] When a provider (not custom) is selected:
  - Auto-fill `host`, `port`, `secure` from the preset. Keep `name` editable (default to provider name if empty).
  - If the provider has `authGuide`: change the password field label to `authGuide.passwordLabel` and show the guide block below the password field (see below).
- [ ] When "Custom / other" is selected: show bare fields as today, no guide.
- [ ] **App Password guide block** (shown when `authGuide` is present):
  ```
  ┌─────────────────────────────────────────────────────────────────┐
  │ ⓘ Gmail requires an App Password, not your regular password.    │
  │                                                                 │
  │ How to get one:                     [Open Gmail settings ↗]     │
  │  1. Go to myaccount.google.com …                                │
  │  2. Open Security → 2-Step …                                    │
  │  3. …                                                           │
  │  4. …                                                           │
  │  5. Copy the 16-char code and paste it below.                  │
  └─────────────────────────────────────────────────────────────────┘
  ```
  - The guide block is always visible when a provider with `authGuide` is selected (no collapse needed — these steps are exactly what the user needs).
  - "Open Gmail settings" button calls `window.trayline.app.openUrl(authGuide.settingsUrl)`.
- [ ] Host, port, and SSL fields remain visible but read-only (showing pre-filled values) when a named provider is selected. "Custom / other" leaves them editable.

### 3c. Update `SmtpCredentialDialog.tsx`

- [ ] Same provider picker, same auto-fill, same guide pattern as IMAP.
- [ ] Only SMTP providers appear in the picker (filter by `preset.smtp !== undefined`).
- [ ] `From name` and `From address` are never pre-filled — user always provides these.
- [ ] Host, port, secure are read-only when a named provider is selected.

### 3d. Update `CredentialsScreen.tsx` type picker

Currently the "+ Add" button opens a type picker: HTTP / IMAP / SMTP.

- [ ] Keep the same structure (3 types). No changes to the top-level picker — the provider selection happens inside the IMAP/SMTP dialogs as added in 3b/3c.

---

## Task 4 — First-project onboarding

### 4a. Project store — track freshly created projects

In `src/renderer/stores/project-store.ts`:

- [x] Add `justCreatedProject: string | null` state (default `null`).
- [x] Add `setJustCreatedProject(name: string | null)` action.
- [x] In `WorkflowAuthorScreen.tsx`: after `openProject()` is called from `PostGenBanner`, also call `setJustCreatedProject(outcome.project.name)`.

### 4b. `FirstProjectGuide` component

Create `src/renderer/components/onboarding/FirstProjectGuide.tsx`:

- [x] Props: `{ hasSourceStep: boolean; sourceStepId?: string; firstTrayId?: string; onDismiss: () => void; onTour: () => void }`
- [x] Renders as the right-panel content when no step is selected and the project is fresh.
- [ ] **Layout:**
  ```
  ┌────────────────────────────────────────────────────────────────┐
  │  ✦  Your workflow is ready.                                    │
  │                                                                │
  │  Here's what to do next:                                       │
  │                                                                │
  │  [  1  ]  ─────────────────────────────────────────────────   │
  │           Open your Source step                                │
  │           Click it in the left rail to configure what         │
  │           data to fetch and when.           [Go to Source ›]  │
  │                                                                │
  │  [  2  ]  ─────────────────────────────────────────────────   │
  │           Add a credential (if your source needs one)         │
  │           Go to Credentials in the top bar to add             │
  │           a Gmail or HTTP connection.                          │
  │                                                                │
  │  [  3  ]  ─────────────────────────────────────────────────   │
  │           Click "Run now" on your Source to test it           │
  │           Cards will appear in the tray below                 │
  │           and your workers will start automatically.          │
  │                                                                │
  │  ─────────────────────────────────────────────────────────    │
  │  [Take a quick tour]                    [Dismiss]             │
  └────────────────────────────────────────────────────────────────┘
  ```
  **If `hasSourceStep` is false** (manual intake workflow), show instead:
  ```
  Step 1: Open the first tray in your workflow       [Go to tray ›]
          Then click "+ New card" to add something to process.
  
  Step 2: Your workers will process the card
          automatically once you mark it as ready.
  
  Step 3: Check the next tray for results
          Review and approve or edit before the workflow continues.
  ```

- [ ] "Go to Source/tray" button → calls `setSelectedStepId(...)` from the store.
- [ ] "Take a quick tour" → calls `onTour()` (opens the `OnboardingTour` overlay).
- [ ] "Dismiss" → calls `onDismiss()`.
- [ ] No tests required (UI component; see testing policy).

### 4c. Wire `FirstProjectGuide` into `ProjectScreen.tsx`

- [x] Import `FirstProjectGuide`.
- [x] In the right panel: if `selectedStepId === null` and `active.name === justCreatedProject`:
  - Render `<FirstProjectGuide ... />` instead of the current empty-state placeholder.
- [x] `onDismiss` → `setJustCreatedProject(null)` → guide disappears, right panel shows normal empty state.
- [x] `onTour` → dispatches `window.dispatchEvent(new Event('trayline:open-tour'))` (reuses existing App.tsx event listener).
- [x] When the user selects any step (`setSelectedStepId`), auto-clears `justCreatedProject` via store action.

### 4d. Refactor `OnboardingTour` trigger

Currently the tour auto-fires on app boot when `!settings.onboardingComplete`.

- [x] **Remove** the auto-trigger from `App.tsx` boot sequence (both on initial load and `handleAdapterReady`).
- [x] The tour is now triggered only via `window.dispatchEvent(new Event('trayline:open-tour'))`:
  - From `FirstProjectGuide`'s "Take a quick tour" button.
  - From **Settings → Help → Run onboarding tour** (existing listener unchanged).
- [x] `settings.onboardingComplete` is still set to `true` when the tour is closed.
- [x] No new store action needed — reuses the existing `trayline:open-tour` custom event.

### 4e. Update `OnboardingTour` content

The existing tour steps assume the user is in a project (left rail, detail panel). Now that the tour only fires from inside a project, the steps are always contextually valid. Minor copy updates only:

- [x] Step 5 ("You're ready"): removed context packs mention; updated to: *"That's it. Describe a new workflow, add cards, and let the workers do the rest. Re-run this tour from Settings → Help anytime."*
- [x] No structural changes to the tour component.

---

## Task 5 — Documentation updates

- [ ] **`docs/new-feature-revision.md`**: Apply Gap 1 reframe (Task 1). Add note about N10 changes to the active gaps section.
- [ ] **`docs/user-flows.md`**: Add flow 6.22 "First project — guided onboarding" describing the `FirstProjectGuide` flow and the refactored `OnboardingTour` trigger.
- [ ] **`docs/features.md`**: Add section 7.21 "First Project Guide" and update 7.14 "AI setup screen" to reflect the priority reordering and updated copy.
- [ ] **`docs/implementation/tasks.md`**: Add N10 entry and check it off on completion.

---

## Acceptance criteria

- Opening the app with no AI adapter installed shows local LLM first with a "Recommended" badge; Claude Code is below it with a "Power user" label.
- Clicking "+ Add" → IMAP in the Credentials screen shows a provider picker at the top of the form. Selecting Gmail auto-fills host/port/SSL and shows the App Password guide with numbered steps and an "Open Gmail settings" link. Host/port fields are read-only.
- Selecting "Custom / other" shows bare editable fields with no guide — identical to today's behaviour.
- Same provider picker behaviour in the SMTP dialog.
- After the Workflow Author generates a project and the user clicks "Open project", the right panel shows the `FirstProjectGuide` instead of an empty state.
- The guide shows Source-specific steps if the workflow has a Source; manual-intake steps otherwise.
- Clicking "Go to Source" in the guide selects the source step and dismisses the guide.
- Clicking any step in the left rail dismisses the guide.
- "Take a quick tour" launches the `OnboardingTour` overlay from inside the project.
- The `OnboardingTour` no longer fires automatically on app boot.
- "Run onboarding tour" in Settings still works.
- `npm run typecheck` passes; `npm test` passes.
