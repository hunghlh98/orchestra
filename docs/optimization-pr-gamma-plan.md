# PR-γ Trim Plan — `commands/orchestra.md`

**Source:** `commands/orchestra.md` (225 lines, 2,203 words, 16,502 chars, ≈4,238 tokens)
**Target:** ~1,300 words (~3,000 tokens, **−1,200 tok per /orchestra invocation**)
**Q3 stance:** conservative — three sections marked KEEP-PROTECTED stay byte-for-byte.

---

## Q3-PROTECTED zones (DO NOT TOUCH)

| Lines | Section | Words | Why protected |
|---|---|---|---|
| 25–38 | `### Coordination protocol` | ~250 | Filesystem-coupled handoff rule; tells the model *not* to call SendMessage or poll. Load-bearing. |
| 144–157 | Routing-taxonomy table + prose | ~220 | The dispatch contract. Each row of the table is a runtime invariant. |
| 161–174 | `### Runtime hooks` table + warning | ~300 | "DO NOT replicate hook work manually" — prevents double-emission of events.jsonl entries. |

**Total KEEP-PROTECTED: ~770 words.** These cannot shrink.

That sets the floor: the trimmed file cannot go below ~770 + structural overhead (frontmatter, headings, code-block fences, sub-command bodies). Realistic minimum: ~1,200 words. Target ~1,300 leaves modest headroom.

---

## Zone-by-zone classification

### KEEP (unchanged — operational instructions or already-tight)

| Lines | Zone | Words | Verdict |
|---|---|---|---|
| 1–5 | YAML frontmatter | 30 | KEEP |
| 7–9 | Title + intro lede | 25 | KEEP |
| 11–19 | `## Parse arguments` | 50 | KEEP — load-bearing dispatch |
| 21–23 | Smart-router heading + lede | 25 | KEEP |
| 40 | `### Model actions` heading | 10 | KEEP |
| 44–50 | Step 1 `TeamCreate` code block | 50 | KEEP — exact primitive shape |
| 59–65 | Step 1 `Agent` code block | 50 | KEEP — exact primitive shape |
| 136 | "Conformance check" warning | 50 | KEEP — invariant rule |
| 138 | Step 3 (intent classification) | 50 | KEEP — load-bearing |
| 159 | Step 6 (artifact landing) | 30 | KEEP — load-bearing |
| 187–191 | `## /orchestra sprint` | 80 | KEEP — already terse |
| 202–208 | `## /orchestra commit` | 80 | KEEP — already terse |
| 210–225 | `## /orchestra help` | 150 | KEEP — usage text |

**KEEP subtotal: ~680 words** (plus 770 protected = **1,450 words floor**).

### COMPRESS (rewrite to fewer words, same meaning)

| Lines | Zone | Before | After | Saving |
|---|---|---|---|---|
| 42–43 | Step 1 prose ("Per PRD §8.5 / D-30, every /orchestra run MUST...") | 60 | 25 | **−35** |
| 52–57 | Step 1 explanation ("8 members are NOT joined upfront...") | 60 | 25 | **−35** |
| 67–134 | **Step 2 bootstrap (THE BIG ONE)** | 720 | 250 | **−470** |
| 140 | Step 4 (`--confidence` override) | 50 | 25 | **−25** |
| 142 | Step 5 intro (table + whitelist instruction) | 70 | 50 | **−20** |
| 158 | Step 5 closing ("This propagates the whitelist...") | 30 | 0 (delete) | **−30** |
| 193–200 | `## /orchestra release` numbered steps | 120 | 90 | **−30** |

**COMPRESS subtotal saving: ~645 words.**

### CUT (delete entirely — redundant with other surfaces)

| Lines | Zone | Words | Why cuttable |
|---|---|---|---|
| 176–185 | `### AskUserQuestion budget` table | 80 | Same table appears in `lead.md` and `product.md` agent bodies; per agent invokes the budget, not the dispatcher. The dispatcher does not ask questions. |

**CUT subtotal saving: ~80 words.**

### Total trim budget

```
Original:               2,203 words
KEEP-PROTECTED:           770 words   (no change)
KEEP:                     680 words   (no change)
COMPRESS savings:        −645 words
CUT savings:             −80 words
─────────────────────────────────────
Projected after trim: ~1,478 words
                      (~3,300 tokens, ~−940 tok per invocation)
```

**Reality check:** my Q3-conservative projection in the baseline report was −1,188 tok. Refined plan projects −940 tok (about 21% under, accounting for the protected zones). Still firmly the largest single saving across the entire optimization workstream.

---

## The big cut: Step 2 before/after

This is 65% of the total saving. Auditable side-by-side below.

### BEFORE (lines 67–134, ~720 words)

```
**Step 2 — Bootstrap if `local.yaml` is absent.** Tiered: script-first for the unambiguous
cases (~95% of installs), Pattern B fallback for genuinely contested cases. The bootstrap
is meta (it establishes the project's mode, not the feature's intent), but most of that
classification is deterministic filesystem inspection that a script handles faster and
more reliably than two AI agents.

​```
2a. Run the bootstrap inspector:
      result=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-local.js "<cwd>")
    Parse the JSON: { status, yaml_content, yaml_path, decision }.
    decision.confidence is one of HIGH | MEDIUM | LOW.

2b. If status === "exists": local.yaml already there; skip bootstrap, continue
    to Step 3.

2c. If decision.confidence === "HIGH" (clean greenfield OR clean brownfield):
      Use Claude Code's Write tool to put yaml_content at yaml_path.
      The PreToolUse:Write hook fires; metrics-collector emits the
      `local.bootstrapped` event with mode/primary_language/framework
      automatically (PRD §9.9 hook-only invariant). DO NOT manually
      append to events.jsonl — the hook owns it.
      Continue to Step 3.

2d. If decision.confidence === "MEDIUM" (e.g., source files but no commits):
      Use the Write tool with yaml_content as-is (the script flagged
      `inferred: true` already). The metrics-collector hook fires the
      same way as 2c. Continue to Step 3.
      (Rationale: MEDIUM-confidence cases benefit from inference but
      not from full Pattern B...)

2e. If decision.confidence === "LOW" or status === "ambiguous": fall back
    to Pattern B (the original two-agent flow). This branch handles
    rare cases like "git history exists but no source files" or
    "user intent contradicts filesystem state"...

      [7 sub-steps i–vii with detailed prose, ~450 words]
​```
```

### AFTER (~250 words, all decision logic preserved)

```
**Step 2 — Bootstrap if `local.yaml` is absent.** Script-first decision tree;
Pattern B fallback only for ambiguous cases.

​```
2a. result=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-local.js "<cwd>")
    Parse: { status, yaml_content, yaml_path, decision.confidence }
    decision.confidence ∈ { HIGH, MEDIUM, LOW }

2b. status === "exists" → skip to Step 3.

2c. confidence === "HIGH" or "MEDIUM" → Write yaml_content at yaml_path.
    metrics-collector hook fires automatically; DO NOT manually emit.
    Continue to Step 3.

2d. confidence === "LOW" or status === "ambiguous" → Pattern B fallback:
    i.   Spawn @product (subagent_type: orchestra:product). Prompt: run
         project-discovery, write draft to
         .orchestra/pipeline/bootstrap/local.yaml.draft, end turn.
         (No SendMessage — filesystem-coupled per Coordination protocol above.)
    ii.  On idle: Read draft. Missing/malformed → re-spawn once.
         2nd failure → DEADLOCK.
    iii. Spawn @lead with the draft. Prompt: validate; write
         lead-verdict.yaml { agree: bool, suggested_revision? }. End turn.
    iv.  On idle: Read verdict. agree:true → goto vi.
         agree:false → one revision round only.
    v.   Spawn @product with suggested_revision; rewrite draft. Treat next
         draft as final (Pattern B is exactly one round).
    vi.  Write final yaml_content at yaml_path with bootstrapped_by: listing
         both agent ids. metrics-collector hook fires automatically.
    vii. 3 rejection rounds → DEADLOCK-bootstrap.md, halt (PRD §9.6.1).
​```
```

**Information preserved:**
- Decision tree structure (2a–2d) ✓
- Script invocation shape ✓
- HIGH/MEDIUM merger ("both go to Write+hook fires automatically") — saves repeating the rationale that didn't change behavior
- Pattern B 7 sub-steps ✓ (compressed but each retains its rule)
- DEADLOCK escalation at 3 rounds ✓
- Hook-ownership invariant ("DO NOT manually emit") ✓

**Information dropped:**
- Rationale prose ("The bootstrap is meta...", "Rationale: MEDIUM-confidence cases...", "This branch handles rare cases like 'git history exists but no source files'") — repeats what the conditions themselves communicate
- Pattern B narrative ("the original two-agent flow") — already covered by sub-steps

---

## Smaller cuts — audit list

### COMPRESS Step 1 prose (lines 42–43 + 52–57)

**BEFORE:** "Per PRD §8.5 / D-30, every `/orchestra` run MUST instantiate the persistent team BEFORE any other work. The actual primitive is two-step: `TeamCreate` creates the team container, then `Agent` calls (one per member) join teammates with `team_name` + `name` parameters."

**AFTER:** "Every `/orchestra` run starts with `TeamCreate` (container) followed by `Agent` calls (members joined on demand)."

### COMPRESS Step 4 (line 140)

**BEFORE:** "Parse `--confidence high|medium|low` from `$ARGUMENTS` if present; if so, append `confidence.user-override` to the events.jsonl line @lead writes (or override @lead's classification before downstream agents read it). Confidence here is for the FEATURE workflow, distinct from the bootstrap which is always Pattern B."

**AFTER:** "If `--confidence` flag present in `$ARGUMENTS`, override @lead's feature-confidence classification before downstream agents read it."

### CUT AskUserQuestion budget table (lines 176–185)

The table appears verbatim in `agents/lead.md` and is referenced from each agent's body. The dispatcher itself doesn't ask questions — agents do. The dispatcher's only job here is routing.

**Risk if cut:** If a future model reading the dispatcher loses the question-budget context and asks too many questions, that would manifest at agent invocation, not dispatch. Each agent already has the rule.

**Mitigation:** Add one sentence above sub-commands: "Each spawned agent applies the §8.11 question budget per their own body."

### COMPRESS `## /orchestra release` (lines 193–200)

Drop one redundant numbered step ("Update CHANGELOG.md Unreleased → versioned entry; bump VERSION") since it's covered by the @ship agent's workflow.

---

## Verification before applying (Task 11)

After the trim is applied, re-validation will confirm:
- ✓ All 3 Q3-PROTECTED zones byte-identical pre/post-trim
- ✓ Routing-taxonomy table intact (line content unchanged)
- ✓ The 6 numbered Workflow steps still present in some form
- ✓ argument-hint and frontmatter unchanged
- ✓ npm test passes (9/9 validators)
- ✓ `claude plugin validate .` passes
- ✓ Bootstrap script smoke against throwaway dir still works

---

## Open questions for the user before Task 11

1. **Is cutting the AskUserQuestion budget table OK?** Agents have it; dispatcher might not need it. (Default if unanswered: cut.)
2. **Is the Step 2 compression aggressive enough, or too aggressive?** I removed all the rationale prose. If you want some narrative back (for future you reading the dispatcher), tell me which sentences to restore.
3. **Final word target — 1,478 (this plan) or push lower?** I can squeeze further by also compressing Steps 5/6 prose more, but at risk of losing operational clarity.

---

*Generated by Task 10. Apply via Task 11.*
