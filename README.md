# orchestra

A Claude Code plugin that gives one developer a multi-agent SDLC pipeline behind a single entry point.

> **Status:** v1.0.0 in development. See the contract chain in `docs/`:
>
> - [`docs/PRD-001.md`](docs/PRD-001.md) — full v1.0.0 specification (the *why* and *what*)
> - [`docs/DESIGN-001-infra.md`](docs/DESIGN-001-infra.md) — load-bearing infra architecture (the *how*)
> - [`docs/WORKFLOW-001-infra.md`](docs/WORKFLOW-001-infra.md) — PR-by-PR rollout plan (the *when*)

## Install (consumer-side)

```
claude plugin install hunghlh98/orchestra
```

## Validate (this repo)

```
npm test
```

Runs all six validators against the repo state:

| Validator | Purpose |
|---|---|
| `validate.js` | Manifests parse; plugin.json/CHANGELOG/VERSION self-consistent |
| `test-hooks.js` | Hook contract assertions (full set in PR #2/#3) |
| `test-agents.js` | Agent frontmatter shape (full set in PR #5) |
| `test-bash-strip.js` | No implementer-tier agent has `Bash` (full set in PR #5) |
| `validate-drift.js` | Document-alignment drift detection (full algorithm in PR #2) |
| `test-removability.js` | 1:1 install-modules ↔ runtime-toggles for hook/skill/mcp |

## License

MIT.
