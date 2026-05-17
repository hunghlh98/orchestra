# Code-review language-specific extras

Companion to `skills/code-review/SKILL.md`. Generic language checks when no per-language `*-development` skill is loaded for `local.yaml.primary_language`. Canonical convention sets live in the language skills (e.g., `skills/java-development/references/jpa-write-conventions.md`).

## Universal (any language)

Apply these regardless of stack:

- Imports / dependencies are sorted and unused entries removed.
- Public functions have intention-revealing names; private helpers can be shorter.
- No commented-out code blocks (delete instead).
- No `TODO` without a tracking reference (`TODO(#123)` is OK; bare `TODO` is not).
- Tests adjacent to source they exercise; test names describe behavior, not impl.
- No magic numbers (extract to named constants).

## Java / Spring

(If `java-development` skill is loaded, defer to it.)

- `final` on fields and parameters where applicable.
- Optional return for "absent" values; never return `Optional<Collection>`.
- Constructor injection over `@Autowired` fields.
- `@Transactional` boundary at use-case granularity; no nested propagation surprises.
- `:param` JPQL or `PreparedStatement` for all DB queries containing user input.

## TypeScript / JavaScript

- `const` over `let`; `let` over `var`.
- Strict typing — no `any` without explanatory comment.
- Async functions either `await` or return Promises; never mix.
- React: functional components + hooks; class components only if a specific lifecycle requires it.
- No console.log in production code paths.

## Python

- Type hints on public function signatures (`def fetch(id: UUID) -> Optional[User]:`).
- `with` blocks for any file / socket / lock resource.
- `dataclasses` or `pydantic` for data carriers, not bare `dict`.
- F-strings over `.format()` or `%`-formatting.
- No mutable default arguments (`def f(items=[])`).

## Go

- Errors returned, not panicked (except in true unrecoverable cases).
- `defer` for cleanup; place defer immediately after resource acquisition.
- No naked returns in functions >5 lines.
- `interface{}` only at API boundaries; concrete types internally.
- Goroutine lifecycles bounded by context cancellation.

## Rust

- No `unwrap()` / `expect()` in library code; only in `main()` or tests.
- `?` operator over manual `match err` patterns.
- Lifetime annotations explicit when the elision rules don't apply.
- `Result<T, E>` over panic for recoverable errors.
- Tests in `#[cfg(test)] mod tests` adjacent to implementation.

## SQL / migrations

- All schema changes in versioned migration files (`V<N>__<description>.sql` for Flyway, `<YYYYMMDDHHMMSS>_<description>.sql` for others).
- No `DROP COLUMN` without prior nullable + backfill + read-only deploy cycle.
- Indexes added under non-blocking strategy (e.g., `CREATE INDEX CONCURRENTLY` on Postgres).
- Foreign keys carry `ON DELETE` semantics explicitly (CASCADE / RESTRICT / SET NULL).
