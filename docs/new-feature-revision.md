# Trayline — New Feature Revision Rules

> **Purpose:** Before any new feature or implementation phase is written, the author must check every rule in this document. If a proposed feature cannot satisfy the rules below, it must be redesigned or deprioritised. This document is the product compass, not a wishlist — it defines what Trayline is allowed to become.

---

## The Core Promise

> **A person who has never heard of an AI agent should be able to open Trayline, describe a daily task in plain English, and have a working automation running within 15 minutes — without touching a terminal, without creating an account, and without reading a manual.**

Every feature, every phase, every UI decision is judged against this sentence. If it advances the promise, it belongs. If it complicates it, it needs a very strong justification.

---

## The Five Canonical Users

These are real people Trayline is built for. They are not developers. They are not "power users." They manage real processes in real offices, and they need automation to become accessible — right now.

When designing a feature, ask: "Could Elena use this?" If no, ask why not. If the answer is "she'd need to know what a cron expression is" or "she'd need to read the docs" — that is a design failure, not a user failure.

---

### Persona 1 — Elena, Executive Assistant

**Profile:** Manages schedules, communications, and meeting prep for two senior executives. Uses email, calendar, and Word every day. Has never run a terminal command.

**Her workflow:**
> "Every morning, read the emails I received overnight, identify any that need a decision or reply from my boss, and send me a summary so I can brief him at 9 AM."

**Trayline realisation:**
```
[IMAP Source — Gmail, hourly]
  → [Tray — auto]
  → [Worker — classify: urgent/FYI/no-action, extract decision items]
  → [Tray — manual: Elena reviews flagged items]
  → [Outlet — SMTP email digest to elena@company.com]
```

**This must always work.** If Elena cannot set up this workflow without IT help, something is broken.

---

### Persona 2 — Marco, Customer Support Lead

**Profile:** Runs a 5-person support team. Drowns in tickets. Knows Excel well. Never written code.

**His workflow:**
> "When a support email arrives, automatically classify it as critical / standard / question, draft a first-response, and put anything critical in a review queue so I can approve the reply before it goes out."

**Trayline realisation:**
```
[IMAP Source — support@company.com, every 10 min]
  → [Tray — auto]
  → [Worker — classify + draft reply]
  → [Tray — manual: Marco reviews critical drafts]
  → [Outlet — SMTP, sends approved reply]
```

**This must always work.** If Marco cannot see card status at a glance and approve with one click, the feature set is incomplete.

---

### Persona 3 — Sara, Operations Manager

**Profile:** Runs weekly team meetings and is responsible for following up on action items. Takes notes in Word, spends 30 min after every meeting turning notes into tasks.

**Her workflow:**
> "I paste the transcript of any meeting into a tray. The app summarises it in 5 lines and extracts a bulleted task list for each person mentioned. I review the result and can edit before archiving."

**Trayline realisation:**
```
[Tray — manual intake: Sara pastes transcript]
  → [Worker — generate 5-line summary + per-person task list]
  → [Tray — manual: Sara reviews and edits]
```

**This must always work.** No IMAP, no HTTP, no credentials required. Just text in, structured output out.

---

### Persona 4 — Tom, Founder & Newsletter Author

**Profile:** Writes a weekly tech digest for 500 subscribers. Spends 2 hours every Friday reading HN, filtering the good stuff, writing summaries. Knows what an API is but has never written one.

**His workflow:**
> "Every day, fetch the top 10 Hacker News stories. Every Friday morning, batch them into a digest email with a one-paragraph summary of the week's best stories, and send it to my list."

**Trayline realisation:**
```
[Source — HTTP GET, HN API, every 30 min, skip_existing]
  → [Tray — auto]
  → [Batch Worker — daily digest draft, scheduled Friday 8am]
  → [Tray — manual: Tom reviews before sending]
  → [Outlet — SMTP to newsletter list]
```

**This must always work.** Tom can describe this in one sentence; Trayline should generate this workflow automatically from that description.

---

### Persona 5 — Ana, Content Localisation Coordinator

**Profile:** Coordinates translations for a SaaS company. Receives source strings from developers and sends them to translators. Uses Notion and Slack. No code experience.

**Her workflow:**
> "I paste any piece of text (product copy, an email, a UI label). The app translates it into English, Spanish, French, and Italian, and returns the result as a clean i18n JSON object with a structured key I can give directly to the developers."

**Trayline realisation:**
```
[Tray — manual intake: Ana pastes source text + provides a key name]
  → [Worker — translate to en, es, fr, it; output valid i18n JSON]
  → [Tray — manual: Ana reviews the result]
```

**This must always work.** No external services. No credentials. The AI does the translation; Ana reviews and copies the JSON.

---

## Compliance Checklist for New Features

Run this checklist against every new feature or implementation phase **before** writing a single line of code. If any item is "No" and cannot be reasonably resolved, the feature must be redesigned or marked explicitly as a "power user extension" — not part of the core product.

---

### 1. Zero-setup principle

- [ ] Can a user benefit from this feature without installing anything new beyond Trayline?
- [ ] If the feature requires external credentials (IMAP, SMTP, HTTP), is there clear in-app guidance that does not assume prior technical knowledge?
- [ ] Does the feature work with the local-llm adapter (no subscription, no CLI install required)?
- [ ] If it only works with Claude Code, is this limitation clearly surfaced and does it not block the app from being useful at all?

**Warning signs:** "The user must run a command," "The user must obtain an API key from a developer portal," "The user must know what a cron expression is."

---

### 2. Plain-English authoring

- [ ] Can the Workflow Author generate this feature's step type from a plain-English description?
- [ ] If the feature introduces a new step kind, does the author prompt produce sensible defaults for it?
- [ ] Are the configuration fields labelled in plain English (not technical jargon)?
- [ ] Is every required field either auto-populated by the author or explainable in one sentence visible in the UI?

**Warning signs:** "The user must write JSON," "The user must know the field name," "The user must look this up in the docs."

---

### 3. Linear mental model preservation

- [ ] Does the feature fit inside the Source → Tray → Worker → Tray → Outlet linear model?
- [ ] Does it introduce any branching, fan-out, or graph concepts that break the linear stack metaphor?
- [ ] Can it be explained to a non-technical user in one sentence using the words: "comes in," "waits," "gets processed," "goes out"?

**Warning signs:** "The user must wire nodes," "conditional branches," "parallel lanes," "merging outputs."

---

### 4. Trust and transparency

- [ ] Is everything this feature touches stored as readable files on disk?
- [ ] Does the feature avoid introducing hidden state, cloud sync, or opaque background processes?
- [ ] If credentials or secrets are involved, are they stored in the OS keychain (never in a file)?
- [ ] Can the user understand what the feature did by reading the card history or audit log?

**Warning signs:** "State lives in memory only," "the file is binary," "credentials stored in localStorage."

---

### 5. Five-persona regression test

Before shipping, confirm that each of the five canonical workflows still functions end-to-end:

| Persona | Workflow description | Status |
|---|---|---|
| Elena — Executive Assistant | IMAP source → classify → digest email outlet | ☐ |
| Marco — Support Lead | IMAP source → classify + draft → manual review → SMTP outlet | ☐ |
| Sara — Operations Manager | Manual transcript intake → summarise + extract tasks → review | ☐ |
| Tom — Newsletter Author | HTTP source (HN API) → batch digest → manual review → SMTP outlet | ☐ |
| Ana — Localisation Coordinator | Manual text intake → translate to 4 languages as i18n JSON → review | ☐ |

If any canonical workflow cannot be completed end-to-end with the new feature in place, the feature must not ship.
