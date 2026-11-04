# Phase N13 — AI Prompt Source

**Branch:** `phase/phase-n13-ai-source`
**Depends on:** develop (post-N12)

---

## Overview

Adds a fourth Source channel, `ai_prompt`, where the AI itself is the data channel. On every scheduled run the source sends the user's prompt to the AI adapter; the AI answers with a list, and each item becomes one card in the next step.

Typical uses: "find new public tenders that match our services", "list this week's industry news about X", "suggest three follow-up ideas for our newsletter every Monday".

See [`data-model.md`](../data-model.md) (AI prompt channel variant) for the exact schema and behaviour.

---

## Design decisions

- **Output contract.** The runner appends fixed instructions to the user's prompt: return only a JSON array, give each item a unique `dedup.key` field, return `[]` when nothing is new. It also adds run context (current time, previous run, up to 50 recently delivered IDs).
- **Tolerant parsing.** Bare array, `{ items: [...] }`, a single object, or plain text are all accepted so a slightly-off answer still produces cards rather than a failed run.
- **Dedup.** Same `seen-ids.json` protocol as IMAP. Default key `id`; items without it fall back to a content hash. Duplicates inside a single run collapse.
- **First run defaults to `process_all`** — an AI source has no backlog to skip.
- **Longer timeout** — `timeout_seconds`, default 300 (other AI source passes use 60 s).
- **No second AI pass** — the step-level `prompt` is ignored for this channel.
- **Cost awareness** — selecting the channel in the UI swaps the default hourly schedule for daily at 09:00 and shows a credits hint.

---

## Tasks

- [x] `AiPromptChannel` type added to `SourceChannel` union (`src/shared/types.ts`)
- [x] `ai-source-channel.ts` — prompt wrapper, output normaliser, dedup ID helper, with co-located tests
- [x] `source-runner.ts` — `ai_prompt` branch with dedup, first-run policy, audit entries and atomic seen-ids write; runner tests added
- [x] Source settings panel — "AI prompt" channel option, prompt and time-limit fields, dedup section, Instructions field hidden
- [x] Rail warning when an AI prompt source has no prompt written
- [x] Docs: data-model, features, user-flows, tech-stack

## Out of scope (follow-ups)

- Workflow author (`workflow-plan.ts` / author prompt) generating `ai_prompt` sources from a description.

---

## Acceptance criteria

- An AI prompt source with a prompt creates one card per returned item on its first run.
- Running again with an overlapping answer creates cards only for new items.
- An empty prompt fails the run with a clear message and never calls the AI.
- An AI failure fails the run, creates no cards and leaves `seen-ids.json` untouched.
