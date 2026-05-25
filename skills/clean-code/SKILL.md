---
name: clean-code
description: "Clean Code principles — meaningful names, small focused functions, exception-based error handling, F.I.R.S.T. tests (Fast / Independent / Repeatable / Self-validating / Timely), and 22 code-smell heuristics — for authoring and grading source. Use when @backend / @frontend write or modify source under src/main/** or src/test/**, when @reviewer scores S-REVIEW-001 craft, or when the dispatcher sizes TASKS row complexity from function-shape signals."
allowed-tools: Read, Glob, Grep, Skill
origin: vendored from github.com/wondelai/skills@1.1.0 (MIT, Wondel.ai sp. z o.o.) — frontmatter trimmed for orchestra schema; body trimmed for orchestra surface; references/* unchanged.
license: MIT
metadata:
  author: wondelai
  version: "1.1.0"
---

# Clean Code Framework

A disciplined approach to writing code that communicates intent, minimizes surprises, and welcomes change. Apply when writing new code, reviewing PRs, refactoring legacy systems, or advising on code quality.

## When to use

- `@backend` / `@frontend` authoring or modifying source under `src/main/**` or `src/test/**`.
- `@reviewer` grading `S-REVIEW-001` — score 0–10 per "Scoring" rubric.
- The dispatcher evaluating TASKS row complexity (long functions, deep nesting → split into smaller story-points).

Skip when reviewing pure config (`.yml`, `.json`), generated code, or build files.

## Core Principle

**Code is read far more often than it is written. Optimize for the reader.** Every naming choice, function boundary, and formatting decision either adds clarity or adds cost. The ratio of time spent reading code to writing code is well over 10:1.

Clean code is not about following rules mechanically — it is about caring for the craft. A clean codebase reads like well-written prose: names reveal intent, functions tell a story one step at a time, no surprises in dark corners. The Boy Scout Rule applies: always leave the code cleaner than you found it.

## Scoring

**Goal: 10/10.** When reviewing or writing code, rate it 0-10 based on adherence to the principles below.

- **9-10:** Names reveal intent, functions small and focused, error handling consistent, tests clean + comprehensive.
- **7-8:** Mostly clean with minor naming ambiguities or a few long functions. Tests exist but may lack edge cases.
- **5-6:** Mixed — good patterns alongside unclear names, duplicated logic, or inconsistent error handling.
- **3-4:** Significant readability issues — long functions doing multiple things, misleading names, poor/missing tests.
- **1-2:** Code works but is nearly unreadable — magic numbers, cryptic abbreviations, no structure, no tests.

## The Clean Code Framework

Six disciplines for writing code that communicates clearly and adapts to change.

### 1. Meaningful Names

Names should reveal intent, avoid disinformation, and make code read like prose. If a name requires a comment to explain it, the name is wrong.

| Context | Pattern | Example |
|---------|---------|---------|
| **Variables** | Intention-revealing name | `elapsedTimeInDays` not `d` or `elapsed` |
| **Booleans** | Predicate phrasing | `isActive`, `hasPermission`, `canEdit` |
| **Functions** | Verb + noun describing action | `calculateMonthlyRevenue()` not `calc()` |
| **Classes** | Noun describing responsibility | `InvoiceGenerator` not `InvoiceManager` |
| **Constants** | Searchable, all-caps with context | `MAX_RETRY_ATTEMPTS = 3` not `3` inline |
| **Collections** | Plural nouns or descriptive phrases | `activeUsers` not `list` or `data` |

See: [references/naming-conventions.md](references/naming-conventions.md)

### 2. Functions

Functions should be small, do one thing, do it well. Ideal: 4-6 lines, zero to two arguments, single level of abstraction.

| Context | Pattern | Example |
|---------|---------|---------|
| **Long function** | Extract into named steps | `validateInput(); transformData(); saveRecord();` |
| **Flag argument** | Split into two functions | `renderForPrint()` and `renderForScreen()` not `render(isPrint)` |
| **Deep nesting** | Extract inner blocks | Move nested `if`/`for` bodies into named functions |
| **Multiple returns** | Guard clauses at top | Early return for error cases, single happy path |
| **Many arguments** | Introduce parameter object | `new DateRange(start, end)` not `report(start, end, format, locale)` |
| **Side effects** | Make effects explicit | Rename `checkPassword()` to `checkPasswordAndInitSession()` or separate |

See: [references/functions-and-methods.md](references/functions-and-methods.md)

### 3. Comments and Formatting

A comment is a failure to express yourself in code. Good code is self-documenting. When comments are necessary, explain *why*, never *what*. Formatting creates the visual structure that makes code scannable.

| Context | Pattern | Example |
|---------|---------|---------|
| **Explaining "what"** | Replace with better name | Rename `// check if eligible` to `isEligible()` |
| **Explaining "why"** | Keep as comment | `// RFC 7231 requires this header for proxies` |
| **Commented-out code** | Delete it | Trust version control to remember |
| **File organization** | Newspaper metaphor | High-level functions at top, details below |
| **Related code** | Group vertically | Keep caller near callee in the same file |
| **Team formatting** | Agree on rules once | Use automated formatters (Prettier, Black, gofmt) |

See: [references/comments-formatting.md](references/comments-formatting.md)

### 4. Error Handling

Error handling is a separate concern from business logic. Use exceptions rather than return codes, provide context with every exception, never return or pass null.

| Context | Pattern | Example |
|---------|---------|---------|
| **Null returns** | Return empty collection or Optional | `return Collections.emptyList()` not `return null` |
| **Error codes** | Replace with exceptions | `throw new InsufficientFundsException(balance, amount)` |
| **Third-party APIs** | Wrap with adapter | `PortfolioService` wraps vendor API, translates exceptions |
| **Null arguments** | Fail fast with assertion | `Objects.requireNonNull(user, "user must not be null")` |
| **Special cases** | Null Object pattern | `GuestUser` with default behavior instead of null checks |
| **Context in errors** | Include operation + state | `"Failed to save invoice #1234 for customer 'Acme'"` |

See: [references/error-handling.md](references/error-handling.md)

### 5. Unit Testing

Tests are first-class code. Must be clean, readable, maintained with the same discipline as production code. Dirty tests are worse than no tests — they become a liability slowing every change.

F.I.R.S.T.: Fast, Independent, Repeatable, Self-validating, Timely. One concept per test. Build-Operate-Check (Arrange-Act-Assert) structure.

| Context | Pattern | Example |
|---------|---------|---------|
| **Test structure** | Arrange-Act-Assert | Setup, execute, verify — clearly separated |
| **Test naming** | Scenario + expected behavior | `shouldRejectExpiredToken` not `test1` |
| **Shared setup** | Extract builder/factory | `aUser().withRole(ADMIN).build()` |
| **Multiple scenarios** | Parameterized tests | One test method, multiple input/output pairs |
| **Flaky tests** | Remove external dependencies | Mock time, network, file system |
| **Test readability** | Domain-specific helpers | `assertThatInvoice(inv).isPaidInFull()` |

See: [references/testing-principles.md](references/testing-principles.md)

### 6. Code Smells and Heuristics

Code smells are surface indicators of deeper design problems. Learn to recognize them quickly and apply targeted refactorings.

| Context | Pattern | Example |
|---------|---------|---------|
| **Duplication** | Extract shared logic | Common validation → `validateEmail()` helper |
| **Long parameter list** | Introduce parameter object | `SearchCriteria` groups related params |
| **Feature envy** | Move method to data's class | `order.calculateTotal()` not `calculator.total(order)` |
| **Dead code** | Delete it | Remove unused functions, unreachable branches |
| **Magic numbers** | Named constants | `MAX_LOGIN_ATTEMPTS = 5` not bare `5` |
| **Shotgun surgery** | Consolidate related changes | Group scattered logic into a single module |

See: [references/code-smells.md](references/code-smells.md)

## Reference Files

- [naming-conventions.md](references/naming-conventions.md) — intention-revealing names, before/after examples.
- [functions-and-methods.md](references/functions-and-methods.md) — small functions, argument counts, step-down rule.
- [comments-formatting.md](references/comments-formatting.md) — good vs bad comments, newspaper metaphor.
- [error-handling.md](references/error-handling.md) — exceptions over return codes, Special Case pattern.
- [testing-principles.md](references/testing-principles.md) — TDD laws, F.I.R.S.T., clean test patterns.
- [code-smells.md](references/code-smells.md) — comprehensive smell catalog with targeted refactorings.

Based on Robert C. Martin's *Clean Code: A Handbook of Agile Software Craftsmanship* (2008).
