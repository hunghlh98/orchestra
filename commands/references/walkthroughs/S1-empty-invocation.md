---
strategy: S1
entry: /orchestra
precondition: $1 empty, $ARGUMENTS empty
---

# S1 — empty invocation

**Trigger.** `$1` is empty (whitespace-only or absent); `$ARGUMENTS` empty.

**Trace.**

1. Preflight hook fires; main thread reads the `<orchestra-preflight>` block but does not act on `missing_fields`.
2. Emit the Usage block verbatim.
3. End turn. No agent spawn. No bootstrap. No persistence. No `EnterPlanMode`.

**Artifacts produced.** None.

**Edge cases.**

- Whitespace-only `$ARGUMENTS` (e.g., `/orchestra   `): still classifies as S1. Trim before classifying.
- User typed an unknown subcommand keyword (e.g., a help token): NOT S1. `$1` set to that keyword triggers the freeform router (unknown subcommand). Router's Q1 reads the keyword as restate-intent seed → 3× `AskUserQuestion` rather than usage block. If user wants usage, they invoke `/orchestra` bare.
