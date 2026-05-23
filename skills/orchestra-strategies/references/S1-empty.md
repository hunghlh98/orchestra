# S1 — empty invocation

## Trigger

- `$1` is empty (whitespace-only or absent).
- `$ARGUMENTS` empty.

## Trace

1. Preflight hook fires (`hooks/scripts/orchestra-preflight.js`); main thread Reads the `<orchestra-preflight>` block but does not act on `missing_fields`.
2. Emit the Usage block from `commands/orchestra.md` verbatim.
3. End turn. No agent spawn. No bootstrap. No persistence. No `EnterPlanMode`.

## Artifacts produced

None.

## Edge cases

- **Whitespace-only `$ARGUMENTS`** (e.g., `/orchestra   `): still classifies as S1. Trim before classifying.
- **User typed `/orchestra help`**: NOT S1. `$1 = "help"` triggers the freeform router (unknown subcommand). Router's Q1 reads "help" as restate-intent seed → 3× `AskUserQuestion` rather than usage block. If user wants usage, they invoke `/orchestra` bare.

## Cross-references

- `commands/orchestra.md` — canonical Usage block.
- `hooks/scripts/orchestra-preflight.js` — preflight emission contract.
