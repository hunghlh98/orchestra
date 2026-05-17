// hooks/lib/event-shapers.js
// Pure event-classification + identifier-derivation helpers extracted from
// metrics-collector.js. No filesystem IO. Inputs: hook stdin shape (parsed
// JSON). Outputs: event row objects ready for safeAppend to events.jsonl.

import { matchField, extractBootstrapFields, extractIntentFields, extractSummaryFields } from "./field-extract.js";

// classify — Hook stdin → event row (or null when the event isn't logged).
// All branches return either an object with { ts, event, run_id, ... } or null.
// Mirrors the matcher → event-shape table in commands/orchestra.md.
export function classify(input) {
  const ts = new Date().toISOString();
  const run_id = input.session_id || "unknown";
  const hookEvent = input.hook_event_name;
  const toolName = input.tool_name;

  if (hookEvent === "UserPromptSubmit") {
    const prompt = input.prompt || "";
    return {
      ts, event: "prompt.submitted",
      matched_orchestra: typeof prompt === "string" && prompt.trimStart().startsWith("/orchestra"),
      run_id,
    };
  }
  if (hookEvent === "PreToolUse" && (toolName === "Task" || toolName === "Agent")) {
    const ti = input?.tool_input || {};
    const promptText = typeof ti.prompt === "string" ? ti.prompt : "";
    return {
      ts, event: "task.subagent.invoked",
      subagent_type: ti.subagent_type || "unknown",
      agent_role: deriveAgentRole(ti.subagent_type, ti.name),
      phase: matchField(promptText, /^phase:\s*([a-z-]+)/m) || null,
      agent_name: ti.name || null,
      team_name: ti.team_name || null,
      tool: toolName,
      prompt_summary: promptText.slice(0, 200),
      run_id,
    };
  }
  if (hookEvent === "PreToolUse" && toolName === "TeamCreate") {
    const ti = input?.tool_input || {};
    return {
      ts, event: "team.created", run_id,
      team_name: ti.team_name || "unknown",
      agent_type: ti.agent_type || "unknown",
      description: typeof ti.description === "string" ? ti.description.slice(0, 200) : "",
    };
  }
  if (hookEvent === "PreToolUse" && toolName === "TeamDelete") {
    return { ts, event: "team.shutdown", run_id };
  }
  if (hookEvent === "PreToolUse" && toolName === "Skill") {
    const ti = input?.tool_input || {};
    return {
      ts, event: "skill.invoked", run_id,
      skill: typeof ti.skill === "string" ? ti.skill : "unknown",
      args_summary: typeof ti.args === "string" ? ti.args.slice(0, 200) : "",
    };
  }
  if (hookEvent === "PreToolUse" && (toolName === "TaskCreate" || toolName === "TaskUpdate")) {
    const ti = input?.tool_input || {};
    return {
      ts, event: "agent.plan.task", run_id,
      tool: toolName,
      claude_task_id: ti.taskId ? String(ti.taskId) : null,
      task_subject: typeof ti.subject === "string" ? ti.subject.slice(0, 200) : null,
      task_status: typeof ti.status === "string" ? ti.status : null,
    };
  }
  if (hookEvent === "PreToolUse" && typeof toolName === "string" && toolName.startsWith("mcp__orchestra-")) {
    return { ts, event: "mcp.tool.called", tool: toolName, run_id };
  }
  if (hookEvent === "PreToolUse" && (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    const filePath = input?.tool_input?.file_path || "";
    if (typeof filePath !== "string") return null;
    if (filePath.endsWith("/.orchestra/local.yaml")) {
      const fields = extractBootstrapFields(input?.tool_input);
      return {
        ts, event: "local.bootstrapped", run_id,
        mode: fields.mode || "unknown",
        project_mode: fields.mode || "unknown",
        primary_language: fields.primary_language || "unknown",
        framework: fields.framework || "unknown",
      };
    }
    const planMatch = filePath.match(/\/\.orchestra\/tasks\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (planMatch) {
      const fileName = planMatch[3];
      return {
        ts, event: "artifact.written", run_id,
        feature_id: fileName.replace(/\.md$/, ""),
        artifact_type: "PLAN",
        artifact_id: `${planMatch[1]}-${planMatch[2]}-${fileName.replace(/\.md$/, "")}`,
        file_name: fileName,
        agent_role: planMatch[2].replace(/^@/, ""),
        plan_run_id: planMatch[1],
        tool: toolName,
      };
    }
    const pipelineMatch = filePath.match(/\/\.orchestra\/pipeline\/([^/]+)\/([^/]+)$/);
    if (pipelineMatch) {
      const fileName = pipelineMatch[2];
      const artifactType = inferArtifactType(fileName);
      const event = {
        ts, event: "artifact.written", run_id,
        feature_id: pipelineMatch[1],
        artifact_type: artifactType,
        artifact_id: deriveArtifactId(artifactType, fileName),
        file_name: fileName,
        tool: toolName,
      };
      if (fileName === "intent.yaml") {
        const fields = extractIntentFields(input?.tool_input);
        if (fields.intent) event.intent = fields.intent;
        if (fields.confidence) event.confidence = fields.confidence;
        if (fields.pattern) event.pattern = fields.pattern;
        if (fields.autonomy_level) event.autonomy_level = fields.autonomy_level;
      }
      if (/^SUMMARY-.+\.md$/.test(fileName)) {
        const fields = extractSummaryFields(input?.tool_input);
        if (fields.team_name) event.team_name = fields.team_name;
        if (fields.terminal_state) event.terminal_state = fields.terminal_state;
        if (fields.duration_seconds) event.duration_seconds = fields.duration_seconds;
      }
      return event;
    }
    return null;
  }
  if (hookEvent === "SubagentStop") {
    // Caller supplies the subagent identity via input._sub (resolved by IO-side
    // findJustStoppedSubagent before invoking classify). Keeps classify pure.
    const sub = input?._sub;
    return {
      ts, event: "subagent.stopped", run_id,
      subagent_session_id: sub?.sid || null,
      agent_role: sub?.role || null,
    };
  }
  if (hookEvent === "Stop") {
    return { ts, event: "session.stopped", run_id };
  }
  return null;
}

// inferArtifactType — basename → artifact type tag.
// Patterns:
//   1. New per-feature shape: <NNN>-<slug>-<TYPE>(-<rest>)?.<ext>.
//      001-todo-api-PRD.md → "PRD"; 001-todo-api-ESCALATE-ADR-0007.md → "ESCALATE-ADR";
//      001-todo-api-openapi.yaml → "API".
//   2. Global singletons: SAD.md, ADR-NNNN-<slug>.md, RELEASE-vX.Y.Z.md, intent.yaml.
// Falls back to "unknown" so the event still logs (run_id + file_name preserve traceability).
export function inferArtifactType(fileName) {
  if (fileName === "intent.yaml") return "intent";
  if (fileName === "SAD.md") return "SAD";
  if (/-(openapi|asyncapi)\.(?:yaml|yml)$/.test(fileName)) return "API";
  const newForm = fileName.match(/^\d+-[a-z][a-z0-9-]*?-(ESCALATE-ADR|[A-Z][A-Z0-9]*)(?:-[\w.-]*)?\.[a-z]+$/);
  if (newForm) return newForm[1];
  const legacy = fileName.match(/^([A-Z][A-Z0-9-]*?)-\d/);
  if (legacy) return legacy[1];
  return "unknown";
}

// deriveArtifactId — basename → stable id (matches frontmatter id: field).
// New per-feature: full basename without ext. Legacy: type+number prefix.
export function deriveArtifactId(artifactType, fileName) {
  if (fileName === "intent.yaml") return "intent.yaml";
  if (fileName === "SAD.md") return "SAD";
  const newForm = fileName.match(/^(\d+-[a-z][a-z0-9-]*-(?:ESCALATE-ADR|[A-Z][A-Z0-9]*)(?:-[\w.-]*)?)\.[a-z]+$/);
  if (newForm) return newForm[1];
  const apiBare = fileName.match(/^(\d+-[a-z][a-z0-9-]*-(?:openapi|asyncapi))\.(?:yaml|yml)$/);
  if (apiBare) return apiBare[1];
  const legacy = fileName.match(/^([A-Z][A-Z0-9-]*-[\w.]+?)(?:-[\w.]+)?\.[a-z]+$/);
  if (legacy) return legacy[1];
  return artifactType || "unknown";
}

// deriveAgentRole — strips "orchestra:" prefix from subagent_type
// (e.g., "orchestra:lead" → "lead"); falls back to ti.name without "@".
export function deriveAgentRole(subagentType, agentName) {
  if (typeof subagentType === "string" && subagentType.length > 0) {
    return subagentType.replace(/^orchestra:/, "");
  }
  if (typeof agentName === "string" && agentName.startsWith("@")) {
    return agentName.slice(1);
  }
  return null;
}
