# 1. IT TOOK ME 3 WEEKS TO REALIZE I PARTITIONED THE CODEBASE INCORRECTLY
```
Project: Extract specifications from 4 repositories (web, mobile, backend, admin) to create a unified spec document, feeding it into an agentic coding loop.

The initial plan seemed highly logical: partition the codebase into chunks for the model to read sequentially, as fitting all 4 repos into a single context window is impossible. Extract specs for each repo individually, then merge them.

For the first 3 weeks, everything executed according to plan. I generated specs for each repo sequentially. Each spec read well, contained complete features, and appeared accurate.

The critical failure emerged at the final step—merging the specs. The specs across the 4 repos did not align. The "user onboarding" feature in the web spec described one flow, the mobile spec described a slightly divergent flow, and the backend spec detailed an API entirely omitted from the web spec. When combining all 4, the source of truth was lost.

I paused operations and initiated a spec review with the respective repo leads. The root cause was unexpected: It was NOT a model hallucination. It was NOT weak prompting. The fundamental error was MY CODEBASE PARTITIONING STRATEGY.

I had partitioned along REPOSITORY boundaries. However, features do not adhere to repository boundaries. Features live across BUSINESS LOGIC boundaries—a single feature traverses multiple repositories.

Here are the 6 critical lessons learned from this incident, documented for developers building agentic coding loops on multi-repo codebases.

---

CLARIFICATION: THIS CHUNKING IS NOT RAG CHUNKING

When discussing "codebase chunking" in this context, I am NOT referring to slicing code into smaller fragments for a vector database. That is RAG chunking.

I am referring to: the strategy of partitioning the codebase into logical segments for the model to process sequentially due to context window limitations.

These are fundamentally different operations:

* RAG chunking: Splitting code into ~500 token segments, embedding them, and retrieving top-K on demand.
* Context partitioning: Dividing the codebase into logical batches, where the model reads the entire batch in one pass for deep semantic understanding.

My project utilized context partitioning, not RAG. RAG is an entirely different architectural choice with its own trade-offs (addressed at the end of this document).

---

WHY LARGER MODELS ARE NOT THE SOLUTION

My immediate reflex: "Sonnet isn't capable enough, upgrade to Opus." Incorrect. Opus provided marginal improvements in articulation, but the merged specs remained misaligned.

The bottleneck is not "model intelligence." The bottleneck is: "Does the model possess sufficient SIMULTANEOUS context to comprehend a cross-repo feature?"

Larger models perform superior reasoning on provided context, but they cannot infer context residing in an unseen repository. A model analyzing the web spec has zero visibility into backend APIs. A model analyzing the backend spec cannot know the payload parameters the mobile app sends. Each model generates a spec based on a fragment; none perceive the complete architecture.

The actual engineering problem: How to partition the codebase into batches where EACH BATCH contains the complete context for a singular, cohesive business unit.

---

6 FAILURES ENCOUNTERED DUE TO INCORRECT CODEBASE PARTITIONING

ERROR 1 - PARTITIONING BY REPO INSTEAD OF FEATURE

This was my root cause. My division: 1 batch = 1 repo. It sounded rational because repos have explicit physical boundaries. However, the "user onboarding" feature actually consists of:

- UI flow in the web repo (React components)
- UI flow in the mobile repo (React Native)
- API endpoints in the backend repo (Node)
- Admin tracking in the admin repo (Vue)

The model reading the web repo wrote a web-isolated onboarding spec. The model reading the backend repo wrote a backend-isolated spec. Both described isolated halves of the same feature without merge instructions.

FIX: Partition by FEATURE/DOMAIN, not repository. Each batch must contain the code for a single feature spanning all relevant repos. Execution: Build a feature map first (e.g., Feature X maps to Files Y across all 4 repos), then construct the batches.

ERROR 2 - UNDEFINED BATCH BOUNDARIES

After deciding to partition by feature, the definition of a "feature" remains ambiguous. Is onboarding 1 feature or 3 (signup, profile setup, tutorial)? Where is the boundary?

If defined too broadly, the batch exceeds the context window. If defined too narrowly, the batch fits but severs relationships between sub-features.

FIX: Utilize existing artifacts to enforce boundaries. Example: 1 Jira user story = 1 feature. 1 epic = 1 feature group. Do not invent a feature map from scratch—leverage existing product management definitions.

ERROR 3 - LACK OF SHARED CONTEXT ACROSS BATCHES
Notes: I provided the model with the onboarding batch but omitted the domain glossary, shared naming conventions, cross-repo data schemas, and global business rules.

Consequence: The model read the web batch and identified a variable named "userProfile", read the backend batch and found "user_profile", and read the admin batch and found "UserDTO". The model failed to recognize these as the EXACT SAME ENTITY. The output spec treated them as three distinct entities.

FIX: Create a universal CONTEXT PACK injected into EVERY batch. The pack must include: glossary, naming map, core data schemas, and the top 10 global business rules. Keep it concise—maximum 2000 tokens. Prepend this pack to every batch before the feature code.

ERROR 4 - LACK OF CROSS-REFERENCING BETWEEN SPECS

Each generated spec existed as an isolated file. The web spec stated: "On user click signup, call API /register". The backend spec stated: "API /register receives request and creates user". Both referenced the same integration point with no connective linkage. During the merge phase, I had to manually hunt for matching pairs, leading to omissions.

FIX: Mandate ID assignments for every integration point in the spec output. Web spec must output: "Calls API [API-001]". Backend spec must output: "API [API-001] handles...". During the merge phase, matching becomes a simple ID resolution task requiring zero semantic parsing.

Spending 1 day to establish an ID convention saved a week of manual verification.

ERROR 5 - NO VERIFICATION BEFORE MERGING

I implicitly trusted the model. Reviewing individual repo specs looked logically sound, so I saved them and proceeded. The misalignment was only discovered during the final merge, requiring a full re-run of multiple batches.

FIX: Implement a dedicated VERIFICATION STEP after every batch generation. Two approaches:

Approach 1 - Deterministic tooling: Execute grep/AST parsers on the actual codebase to cross-check the generated spec. If the spec claims "5 endpoints exist", run a script to count the actual endpoints.

Approach 2 - Reverse checking: Instruct a secondary model to read the generated spec and prompt: "Based on this spec, predict the exact function names present in the code." Diff the output against the actual function list. High variance = inaccurate spec.

Failing fast (early verification) is 10x cheaper than end-stage verification.

ERROR 6 - FAILING TO SEPARATE "CONFIRMED" FROM "INFERRED" KNOWLEDGE

Models naturally output highly confident, fluent specs even when guessing. It is impossible to read the spec and distinguish between empirical fact and model hallucination.

I read "user receives a confirmation email after registration" in the spec and assumed it was factual. Code inspection revealed zero email logic; the model hallucinated it based on standard onboarding patterns.

FIX: Force the model to output 2 distinct sections per feature:
- CONFIRMED: Strictly based on provided code (must include file path + line number references).
- INFERRED: Logical assumptions based on patterns, flagged for human verification.

The INFERRED section dictates where human review time is spent. The CONFIRMED section is trusted via its provided evidence trace.

---

WHEN TO USE RAG VS. CONTEXT PARTITIONING

Post-mortem realization: There are AT LEAST 5 strategies for providing context to an agent, not just RAG.

1. CONTEXT PARTITIONING: Dividing the codebase into logical batches, reading the full batch.
   Use case: Deep comprehension of a single business unit, moderate codebase size, batches fit the context window.

2. SYMBOLIC SEARCH (grep, ripgrep, LSP): Exact match finding, jump-to-definition.
   Use case: Exact symbol/function resolution. Deterministic, zero cost, lowest latency.

3. AST TRAVERSAL: Navigating syntax trees, following call graphs.
   Use case: Mapping dependencies and execution flows. Deterministic.

4. RAG / VECTOR SEARCH: Embedding chunks, similarity-based top-K retrieval.
   Use case: Massive codebases impossible to partition manually, ambiguous queries ("where is the edge case handled?"), fuzzy semantic matching.

5. AGENTIC EXPLORATION: Autonomous agent reads files, follows imports, dynamically decides next read.
   Use case: Highly complex tasks with unknown dependencies. Maximum flexibility, maximum token cost.

Production-grade agent systems COMBINE multiple strategies. Cursor, Aider, and Cody do not rely purely on RAG. They orchestrate symbolic + AST + embedding + agentic strategies dynamically based on the task.

My initial architectural flaw was assuming "exceeds context window = must use RAG." Incorrect. Exceeding context requires STRATEGIC CONTEXT PARTITIONING. RAG is merely 1 of 5 available strategies.

---

3 SELF-CHECK QUESTIONS FOR AGENTIC CODING WORKFLOWS

These insights derive from a multi-repo spec extraction case study, but the principles scale across most codebase tasks:

1. Along what boundaries am I partitioning the codebase? Technical (repos, files, folders) or Business (features, domains)? If technical, are features being fragmented?
2. Does every batch provided to the model contain sufficient SHARED CONTEXT (glossaries, schemas, business rules), or is the model forced to guess conventions?
3. Is there a VERIFICATION STEP validating each batch immediately, or am I blindly trusting the output until the final merge?

If you answer "no" to any of these, you are positioned where I was 3 weeks ago. Larger models will not save you. Larger context windows will not save you. The point of failure is your CODEBASE PARTITIONING STRATEGY, not the LLM.

The most effective agent is not the smartest agent. It is the agent provided with context structured by business logic, delivered at the right time, in the correct format.
```

# 2. Useful Hook

How to make Claude Code reuse exist code without create new one

When it tries to create that file, however, our hook is going to run. ​It's going to launch that separate copy of Claude code, which is going to do some research ​and find that there is in fact an existing query that can be reused. ​It's going to provide some advice and say, hey, you could probably go and update this ​other existing query to suit your purposes perfectly. ​And we'll see some feedback from Claude, our primary instance that we are interacting with ​saying, ah, yes, there is this existing query. ​Let's just modify that existing query rather than attempting to write out a brand new one. ​Now the downside to this hook is that it's going to take some additional time and expense ​to run every single time that I want to edit something inside the queries directory. ​But the upside is that I'm going to end up with a lot less duplicate code inside my queries ​directory. 

To make Claude Code reuse existing queries rather than creating new ones, you can implement a hook that:

Watches for changes made inside the queries directory.
When a change is detected, launches a separate instance of Claude Code to review the new or modified query.
This review instance compares the new query against existing queries in the directory.
If it finds a similar existing query, it sends feedback to the original Claude Code instance.
The original instance then removes the duplicate query and modifies the existing one to suit the new requirements.
This approach helps keep the queries directory clean and avoids code duplication by enforcing reuse.

The hook typically:

Checks if the change is inside the queries directory.
Runs a prompt to ask Claude Code to review the change and existing queries.
Uses the Claude Code SDK programmatically to run this review.
Based on the review, it either accepts the change or signals Claude Code to fix it.

Example: 
Here's a simplified outline and example of how you might implement a query hook using the Claude Code SDK to encourage reuse of existing queries:

Key steps in the hook:

Detect if the change is inside the src/queries directory.
If yes, launch a separate Claude Code instance to review the new or modified query.
Provide the new query code and existing queries as context to the reviewer instance.
Ask the reviewer if a similar query already exists.
If yes, signal the main Claude Code instance to remove the duplicate and reuse the existing query.

```node
const { ClaudeCode } = require('claude-code-sdk'); // hypothetical SDK import

async function queryHook(changedFilePath, changedFileContent) {
  // Only run hook for files in src/queries
  if (!changedFilePath.startsWith('src/queries')) {
    return;
  }

  // Initialize a new Claude Code instance for review
  const reviewer = new ClaudeCode({ /* your API key and config */ });

  // Prepare prompt for reviewer
  const prompt = `
    You are reviewing a new or modified SQL query function added to the project.
    Here is the new query code:
    ${changedFileContent}

    Here are existing queries in the src/queries directory:
    [Provide summaries or code snippets of existing queries]

    Does a similar query already exist? If yes, please suggest reusing it instead of adding a duplicate.
  `;

  // Run the review
  const reviewResponse = await reviewer.run(prompt);

  if (reviewResponse.includes('reuse existing query')) {
    // Signal main Claude Code instance to fix duplication
    // This could be done by exiting with a special code or sending feedback
    process.exit(2); // example exit code to indicate duplication found
  }
}

module.exports = queryHook;
```
