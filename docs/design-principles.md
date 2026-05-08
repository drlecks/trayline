# Trayline — Design Principles

---

## Overall Feel

**Clean, calm, generous spacing.** This is a productivity tool used daily by non-engineers. It should feel closer to Notion or Linear than to a developer IDE. No dark grids, no node-graph chaos.

---

## Layout (Main Window)

```
┌─────────────────────────────────────────────────────────────────┐
│ [≡] Trayline  ·  Client Onboarding  ▼              [⚙] [🔔3] [👤]│  ← top bar
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  WORKFLOW    │              SELECTED STEP DETAIL                │
│              │                                                  │
│  ┌────────┐  │   ┌──────────────────────────────────────────┐  │
│  │📥 Intake│  │   │  📥 New Client Intake                    │  │
│  │  3 ●    │  │   │  Tray · Manual approval                  │  │
│  └────────┘  │   │  ────────────────────────────────────────│  │
│      ↓       │   │                                          │  │
│  ┌────────┐  │   │  3 cards waiting                         │  │
│  │⚙ Extract│  │   │  [+ New card]                           │  │
│  │  idle   │  │   │                                          │  │
│  └────────┘  │   │  • Acme Corp request    [Review ›]       │  │
│      ↓       │   │  • Beta Ltd inquiry     [Review ›]       │  │
│  ┌────────┐  │   │  • Gamma redesign       [Ready ✓]        │  │
│  │👤 Review│  │   │                                          │  │
│  │  1 ●    │  │   │  [Edit step config]                      │  │
│  └────────┘  │   │                                          │  │
│      ↓       │   └──────────────────────────────────────────┘  │
│  ┌────────┐  │                                                  │
│  │📧 Send  │  │                                                  │
│  │  ✓      │  │                                                  │
│  └────────┘  │                                                  │
│              │                                                  │
│  [+ Add step]│                                                  │
│              │                                                  │
├──────────────┴──────────────────────────────────────────────────┤
│                                            5h 12% · Weekly 38%  │  ← footer
└─────────────────────────────────────────────────────────────────┘
```

- **Left rail** — the workflow as a vertical stack of step cards. Each card shows name, type icon, and a live status indicator (card count / running / idle / error).
- **Right canvas** — when a step is selected, this panel shows everything about it: its cards, its config, its runs.
- **Top bar** — project switcher, skills, MCPs, notifications.
- **Footer** — always present, full-width strip across the bottom. Right side shows live AI usage indicators. See **Footer** section below.

---

## Status Indicators on Step Cards

**Tray** — shows count of cards in `pending` + `ready`. A small dot turns amber if anything is overdue (SLA), red if errors.

**Worker** — shows `idle`, `running ⚙`, `failed ⚠`, with last run time underneath.

### Step card visual states
- **Default** — soft background, light border
- **Selected** — accent left border (4px), slightly raised shadow
- **Running** — animated subtle pulse on the icon
- **Error** — red dot in corner

---

## Footer

A persistent strip at the bottom of every screen. Height ~28 px, same background as the rest of the chrome, separated by a 1 px subtle border on top.

The footer is **always present** — it does not get hidden when a project is open or when the user is deep in a workflow. The left half is reserved for future use (breadcrumbs, status text, version info). The right side currently displays live AI usage indicators:

- **5h window** — percentage of the active AI agent's 5-hour rolling rate-limit window consumed.
- **Weekly window** — percentage of the agent's weekly rate-limit window consumed.

Both values update every **10 seconds** via a poll to the main process. The values turn amber once they cross 80 %. When usage data is unavailable, each indicator shows `—` and the tooltip explains why.

**Current status:** Claude Code does not yet expose window state to other processes (the `/usage` command only works inside the TUI, and the CLI's JSON envelope only carries per-call token counts). The footer therefore shows `—` until either (a) an upstream CLI flag lands or (b) Trayline accumulates enough per-worker token data to estimate locally — see Phase 4.

Layout:
```
                                              5h 12% · Weekly 38%
```

Typography: 11 px monospace (JetBrains Mono), tabular numerals so digits don't reflow on each refresh. Hover tooltip shows the data source (`claude-code` / `placeholder` / `unavailable`) and the snapshot timestamp.

---

## Color Discipline

- One accent color per project, set in project settings (default soft blue)
- Trays = blue family / Workers = orange family / Errors = red — but desaturated, not vivid
- Background: `#FAFAF9` (warm off-white) light mode / `#0F0F0F` dark mode
- Minimum 24px around content blocks

---

## Typography

- **Inter** for UI
- **JetBrains Mono** for terminal, JSON, and code
- Sizes: 13px UI, 14px body, 18px headers, 24px page titles
- Line height 1.5 minimum

---

## Iconography (lucide-react)

Consistent set per concept:
- `inbox` — trays
- `cpu` — workers
- `alert-triangle` — errors
- `clock` — scheduled
- `user` — human review
- `blocks` — skills (top bar)
- `plug` — MCPs (top bar)

---

## Motion

- 150ms ease-out for hovers and selection
- 200ms slide-up for the run summary drawer
- A pulsing dot (1.5s loop) for running states
- Nothing flashy. Motion communicates state, never decorates.

---

## Worker Status Pill States

| State | Display |
|---|---|
| Idle | gray dot |
| Running | `⚙ Running 14s` — animated, accent color |
| Awaiting input | `⚡ Awaiting input` — pulsing amber |
| Done | `✓ Done 2m ago` — green check, fades after 30s |
| Failed | `⚠ Failed` — red triangle |

---

## Pitch / Brand Aesthetic (for marketing)

From the pitch document:
- Fonts: **Playfair Display** (serif, editorial) + **DM Sans** (clean body)
- Palette: cream `#FAF7F2`, ink `#1A1612`, accent `#C4622D` (warm terracotta)
- Tone: calm confidence — "your work in order, automatically"
- Not a developer tool. A tool for people who move things, not people who build things.
