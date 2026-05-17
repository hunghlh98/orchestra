# Transactional impact deep-dive

Extended scans for Spring `@Transactional` boundary auditing. Loaded when `@backend` is auditing more than 2 propagation levels or `@reviewer` flags a `REQUIRES_NEW` nested inside an outer transaction.

## Boundary scan (extended)

```bash
# Methods annotated @Transactional (boundary owners)
rg -n -t java '@Transactional(?:\([^)]*\))?\s*$\n(?:\s*public|\s*private|\s*protected)' src/ -A 1

# Inner calls from @Transactional methods to other @Transactional methods
# (Spring default propagation REQUIRED reuses the outer transaction; REQUIRES_NEW starts a new one)
rg -n -t java '@Transactional.*propagation\s*=\s*Propagation\.(REQUIRES_NEW|NESTED)' src/
```

Flag for `@reviewer`: any `REQUIRES_NEW` inside a method that's already `@Transactional` — outer commit happens only if outer scope completes; surprising rollback semantics.

## Output shape (impact summary)

When invoked by `@backend` for impact analysis, return a structured impact summary:

```markdown
## Impact analysis: <target>

### Direct callers
- src/main/java/com/acme/web/TransferController.java:34 — calls transferFunds in handleTransfer
- src/main/java/com/acme/scheduled/RetryJob.java:78 — calls transferFunds in retryFailed

### Transactional boundaries
- TransferController.handleTransfer is NOT @Transactional (relies on TransferService.transferFunds)
- RetryJob.retryFailed IS @Transactional (REQUIRED) — uses outer transaction

### Injected by
- 3 components autowire TransferService (TransferController, RetryJob, AdminApi)

### Test coverage
- 4 tests reference transferFunds (TransferServiceTest, IntegrationTest, ...)

### Risk flags
- ⚠ TransferController.handleTransfer adds @Transactional in this PR — was previously not transactional. Verify intent.
```

## Common refactor scans

| Refactor | ripgrep command shape |
|---|---|
| Rename method | `rg -n '\.<old-name>\s*\('` then `\b<old-name>\b` for member-ref syntax |
| Move package | `rg -n 'import com\.acme\.<old-pkg>\.'` |
| Change method signature (add param) | `rg -n '\.<method>\s*\([^)]*\)'` — count call sites; each needs an update |
| Deprecate | `rg -n '@Deprecated' src/` then walk callers |

## Worked example

`@backend` is renaming `TransferService.transferFunds` → `TransferService.executeTransfer`:

```
$ rg -n -t java '\.transferFunds\s*\(' src/
src/main/java/com/acme/web/TransferController.java:34: transferService.transferFunds(req)
src/main/java/com/acme/scheduled/RetryJob.java:78:    service.transferFunds(failed)
src/test/java/com/acme/TransferServiceTest.java:42:   service.transferFunds(buildRequest())
```

Read-side output: 3 direct call sites. No method-reference uses (`::transferFunds`). All 3 sites need updating in this PR. Beyond 3 sites — recommend splitting into "rename" + "callers updated" commits for cleaner review.
