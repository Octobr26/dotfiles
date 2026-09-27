import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./workflow-metrics.mjs", import.meta.url));

function receipt(taskId, label = "Pipeline") {
  return `${label} receipt (metadata)\n${label}: workspace-change\nPath:\nStages: 0/0\nTask: ${taskId}\nVerification: passed (1 checks)`;
}

function recordInteraction(root, taskId, kind, turnId) {
  run(root, ["interaction", "--task-id", taskId, "--kind", kind, "--turn-id", turnId, "--session-id", "session-a"]);
}

function recordDelivery(root, taskId, turnId = "delivery") {
  const message = run(root, ["task", "receipt", "--task-id", taskId, "--verification", "passed", "--verification-checks", "1"]).stdout;
  run(root, ["hook", "--event", "stop"], { input: JSON.stringify({ session_id: "session-a", turn_id: turnId, last_assistant_message: message }) });
}

function sessionFixture(root, taskId, { session = "session-a", now = Date.now() } = {}) {
  const hour = 3_600_000;
  const eventsFile = path.join(root, "metrics/events.jsonl");
  const events = readFileSync(eventsFile, "utf8").trim().split("\n").map(JSON.parse);
  for (const event of events) {
    const offset = event.event === "logical_task_started" ? 74 : event.event === "logical_task_interaction" ? 26 :
      event.event === "automatic_session_end" ? 25 : 25.1;
    event.timestamp = new Date(now - offset * hour).toISOString();
  }
  writeFileSync(eventsFile, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  const rows = [{ type: "session_meta", timestamp: new Date(now - 75 * hour).toISOString(), payload: { id: session, cwd: root } }];
  for (const [id, start, end] of [["first", 73, 72], ["second", 26.1, 25.2]]) {
    rows.push({ type: "event_msg", timestamp: new Date(now - start * hour).toISOString(), payload: { type: "task_started", turn_id: id } });
    rows.push({ type: "event_msg", timestamp: new Date(now - end * hour - 1).toISOString(), payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, total_tokens: 110 } } } });
    rows.push({ type: "event_msg", timestamp: new Date(now - end * hour).toISOString(), payload: { type: "task_complete", turn_id: id } });
  }
  write(root, `sessions/${session}.jsonl`, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  mkdirSync(path.join(root, "claude-sessions"), { recursive: true });
  return ["--sessions", path.join(root, "sessions"), "--claude-sessions", path.join(root, "claude-sessions")];
}

for (const kind of ["clarification", "approval"]) test(`Pipeline receipts link delivery; ${kind} reopens work and is idempotent`, () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  run(root, ["hook", "--event", "stop"], { input: JSON.stringify({ session_id: "session-a", turn_id: "first", last_assistant_message: receipt(taskId) }) });
  assert.equal(JSON.parse(run(root, ["task", "status", "--task-id", taskId, "--format", "json"]).stdout).state, "awaiting-feedback");
  const args = ["interaction", "--task-id", taskId, "--kind", kind, "--turn-id", "second", "--session-id", "session-a"];
  run(root, args); run(root, args);
  const events = readFileSync(path.join(root, "metrics/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(events.filter((event) => event.event === "logical_task_interaction").length, 1);
  finishStage(root, taskId, "preflight", 1);
  const newReceipt = receipt(taskId).replace("Path:", "Path: preflight-work").replace("Stages: 0/0", "Stages: 1/1");
  run(root, ["hook", "--event", "stop"], { input: JSON.stringify({ session_id: "session-a", turn_id: "second", last_assistant_message: newReceipt }) });
  assert.equal(JSON.parse(run(root, ["task", "status", "--task-id", taskId, "--format", "json"]).stdout).state, "awaiting-feedback");
  run(root, [...args.slice(0, -1), "other-session"], { expectedStatus: 1 });
});

test("session inference uses full history even when its initial prompt is outside the display window", () => {
  const root = createWorkspace(); const taskId = startTask(root);
  run(root, ["interaction", "--task-id", taskId, "--kind", "correction", "--turn-id", "second", "--session-id", "session-a"]);
  run(root, ["hook", "--event", "stop"], { input: JSON.stringify({ session_id: "session-a", turn_id: "second", last_assistant_message: receipt(taskId) }) });
  run(root, ["hook", "--event", "session-end"], { input: JSON.stringify({ session_id: "session-a" }) });
  const paths = sessionFixture(root, taskId);
  const narrow = JSON.parse(run(root, ["summary", "--format", "json", "--days", "2", ...paths]).stdout);
  const broad = JSON.parse(run(root, ["summary", "--format", "json", "--days", "4", ...paths]).stdout);
  assert.equal(narrow.tasks.length, 1); assert.equal(broad.tasks.length, 2);
  assert.equal(narrow.runs[0].inferredFeedback.rating, 4);
  assert.deepEqual(narrow.runs[0].inferredFeedback, broad.runs[0].inferredFeedback);
  assert.equal(narrow.logicalTaskSummary.correct, 0);
  assert.equal(narrow.logicalTaskSummary.averageQuality, null);
});

test("same-turn explicit and inferred corrections deduplicate; distinct prompts remain distinct", () => {
  const root = createWorkspace(); const taskId = startTask(root);
  run(root, ["interaction", "--task-id", taskId, "--kind", "correction", "--turn-id", "second", "--session-id", "session-a"]);
  const feedbackArgs = ["outcome", "--task-id", taskId, "--result", "changes-needed", "--verification", "not-run", "--turn-id", "second", "--session-id", "session-a"];
  run(root, feedbackArgs); run(root, feedbackArgs);
  run(root, ["hook", "--event", "stop"], { input: JSON.stringify({ session_id: "session-a", turn_id: "second", last_assistant_message: receipt(taskId) }) });
  run(root, ["hook", "--event", "session-end"], { input: JSON.stringify({ session_id: "session-a" }) });
  const paths = sessionFixture(root, taskId);
  const report = JSON.parse(run(root, ["summary", "--format", "json", "--days", "4", ...paths]).stdout);
  assert.equal(report.logicalTasks[0].feedbackCount, 1);
  assert.equal(report.runs[0].inferredFeedback.corrections, 1);
  assert.equal(report.runs[0].inferredFeedback.unidentifiedCorrections, 0);
});

test("report allocations conserve tokens when a provider turn straddles two logical tasks", () => {
  const root = createWorkspace(); const taskId = startTask(root);
  const now = Date.now(); const paths = sessionFixture(root, taskId, { now });
  const file = path.join(root, "metrics/events.jsonl");
  const initial = JSON.parse(readFileSync(file, "utf8").trim());
  const second = { ...initial, logicalTaskId: "lt-second-task", timestamp: new Date(now - 72.5 * 3_600_000).toISOString() };
  writeFileSync(file, [initial, second].map((event) => JSON.stringify(event)).join("\n") + "\n");
  const report = JSON.parse(run(root, ["summary", "--format", "json", "--days", "4", ...paths]).stdout);
  assert.equal(report.overall.totalTokensTotal, 220);
  assert.equal(report.logicalTaskSummary.totalTokensTotal, 220);
  assert.equal(report.logicalTasks[0].sharedAttemptCount, 1);
  assert.equal(report.logicalTasks[1].sharedAttemptCount, 1);
  const narrow = JSON.parse(run(root, ["summary", "--format", "json", "--days", "2", ...paths]).stdout);
  assert.equal(narrow.logicalTaskSummary.totalTokensTotal, narrow.overall.totalTokensTotal);
});

test("Claude inference requires the original root prompt, not merely a timestamped later record", () => {
  const root = createWorkspace(); const session = "claude-root"; const hour = 3_600_000;
  const now = Date.now();
  run(root, ["hook", "--event", "session-end", "--provider", "claude"], { input: JSON.stringify({ session_id: session }) });
  const file = path.join(root, "metrics/events.jsonl");
  const end = JSON.parse(readFileSync(file, "utf8")); end.timestamp = new Date(now - 25 * hour).toISOString();
  writeFileSync(file, JSON.stringify(end) + "\n");
  mkdirSync(path.join(root, "sessions"));
  const rows = [
    { type: "user", sessionId: session, promptId: "one", parentUuid: "missing-parent", cwd: root,
      timestamp: new Date(now - 26 * hour).toISOString(), message: { content: "Scoped work" } },
    { type: "system", subtype: "turn_duration", sessionId: session, timestamp: new Date(now - 25.5 * hour).toISOString() }
  ];
  const log = `claude-sessions/${session}.jsonl`;
  const paths = ["--sessions", path.join(root, "sessions"), "--claude-sessions", path.join(root, "claude-sessions")];
  write(root, log, rows.map(JSON.stringify).join("\n") + "\n");
  const truncated = JSON.parse(run(root, ["summary", "--format", "json", "--days", "2", ...paths]).stdout);
  assert.equal(truncated.runs[0].inferredFeedback.rating, null);
  assert.equal(truncated.runs[0].inferredFeedback.reason, "incomplete-session-history");
  rows[0].parentUuid = null;
  write(root, log, rows.map(JSON.stringify).join("\n") + "\n");
  const complete = JSON.parse(run(root, ["summary", "--format", "json", "--days", "2", ...paths]).stdout);
  assert.equal(complete.runs[0].inferredFeedback.rating, 5);
});

function write(root, relative, contents = "test\n") {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), "cvo-workflow-test-"));
  for (const relative of [
    ".gitignore",
    ".claude/settings.json",
    ".codex/config.toml",
    ".codex/hooks.json",
    "AGENTS.md",
    "CLAUDE.md",
    "WORKFLOW_VERSION",
    "README.md",
    "metrics/.gitignore",
    "metrics/README.md",
    "workflows/README.md",
    "scripts/workflow-metrics.mjs",
    "agents/investigator.md",
    "skills/contract-review/SKILL.md",
    ".claude/agents/investigator.md",
    ".codex/agents/investigator.toml"
  ]) {
    write(root, relative, relative === "WORKFLOW_VERSION" ? "test-v1\n" : undefined);
  }

  write(root, "workflows/registry.json", `${JSON.stringify({
    schemaVersion: 1,
    taskTypes: ["audit", "change"],
    verificationClasses: ["source", "test", "review", "readback"],
    stageClasses: ["preflight", "implementation", "verification", "review", "challenge", "publication", "readback"],
    routes: {
      audit: {
        taskTypes: ["audit"],
        risks: [0, 1, 2, 3],
        allowedStageClasses: ["preflight", "verification", "review"],
        requiredForPassed: ["preflight", "review"],
        requiredByRisk: {},
        requiresRemoteArtifact: false
      },
      change: {
        taskTypes: ["change"],
        risks: [0, 1, 2],
        allowedStageClasses: ["preflight", "implementation", "verification", "review"],
        requiredForPassed: ["preflight", "implementation", "verification", "review"],
        requiredByRisk: {},
        requiresRemoteArtifact: false
      },
      "high-risk-change": {
        taskTypes: ["change"],
        risks: [3],
        allowedStageClasses: ["preflight", "implementation", "verification", "review", "challenge", "publication", "readback"],
        requiredForPassed: ["preflight", "implementation", "verification", "review", "challenge", "publication", "readback"],
        requiredByRisk: {},
        requiresRemoteArtifact: true
      }
    },
    workflows: {
      "workspace-audit": "audit",
      "workspace-change": "change",
      "workspace-high-risk-change": "high-risk-change"
    }
  }, null, 2)}\n`);

  const context = path.join(root, "ai-context");
  mkdirSync(context);
  git(context, "init", "-q");
  git(context, "config", "user.name", "Workflow Test");
  git(context, "config", "user.email", "workflow-test@example.invalid");
  write(context, "context.md");
  git(context, "add", "context.md");
  git(context, "commit", "-qm", "context");
  write(root, "AI_CONTEXT_REVISION", `${git(context, "rev-parse", "HEAD")}\n`);
  return root;
}

function run(root, args, { input, expectedStatus = 0 } = {}) {
  const annotations = path.join(root, "metrics", "events.jsonl");
  const result = spawnSync(process.execPath, [cli, ...args, "--root", root, "--annotations", annotations], {
    encoding: "utf8",
    input
  });
  assert.equal(result.status, expectedStatus, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  return result;
}

async function waitForPath(target, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(target)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${target}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function startTask(root, workflow = "workspace-change", artifactRepos = "workspace", session = "session-a") {
  const args = [
    "task", "start",
    "--workflow", workflow,
    "--repo", "workspace",
    "--task-type", "change",
    "--risk", workflow.includes("high-risk") ? "3" : "2",
    "--routing-profile", "user-selected",
    "--acceptance-checks", "2",
    "--criteria", "scope,verification",
    "--evidence-classes", "2",
    "--delegation-mode", "single",
    "--session-id", session
  ];
  if (workflow.includes("high-risk")) args.push("--artifact-repos", artifactRepos);
  return run(root, args).stdout.trim();
}

function finishStage(root, taskId, stageClass, sequence) {
  const stageId = run(root, [
    "stage", "start",
    "--task-id", taskId,
    "--name", `${stageClass}-work`,
    "--stage-class", stageClass,
    "--role", "test-role",
    "--executor", "coordinator",
    "--sequence", String(sequence),
    "--context-mode", "none",
    "--provider", "codex",
    "--requested-model", "user-selected",
    "--objective-id", `${stageClass}-${sequence}`,
    "--scope", "workspace",
    "--access", stageClass === "implementation" ? "write" : "read",
    "--depends-on", "none",
    "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root",
    "--session-id", "session-a"
  ]).stdout.trim();
  run(root, [
    "stage", "finish",
    "--task-id", taskId,
    "--stage-id", stageId,
    "--status", "completed",
    "--outcome", "pass",
    "--verification-checks", "1",
    "--findings", "0",
    "--observed-model", "unknown",
    "--agent-path", "/root/test",
    "--handoff", "next",
    "--session-id", "session-a"
  ]);
}

test("parses multiline workflow receipts", () => {
  const root = createWorkspace();
  const multiline = [
    "Done",
    "Workflow receipt (metadata)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "Workflow:     workspace-change",
    "Path:         implementation > verification",
    "Stages:       2/2",
    "Delegation:   single",
    "Task:         lt-test-multiline",
    "Risk:         2",
    "Verification: ✅ PASSED (7 checks)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");
  run(root, ["hook", "--event", "stop", "--provider", "codex"], {
    input: JSON.stringify({
      session_id: "session-a",
      turn_id: "multiline",
      model: "test-model",
      last_assistant_message: multiline
    })
  });

  const events = readFileSync(path.join(root, "metrics", "events.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map((event) => ({
    workflowId: event.workflowId,
    task: event.logicalTaskId,
    checks: event.verificationChecks
  })), [
    { workflowId: "workspace-change", task: "lt-test-multiline", checks: 7 }
  ]);
});

test("accepts iterative stage paths through 1024 and bounds receipt paths to the same limit", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const longName = (sequence) => `iteration-${sequence}-${"x".repeat(140)}`;
  for (let sequence = 1; sequence <= 6; sequence += 1) {
    run(root, [
      "stage", "start", "--task-id", taskId, "--name", longName(sequence), "--stage-class", "preflight",
      "--role", "planner", "--executor", "coordinator", "--sequence", String(sequence), "--context-mode", "none",
      "--provider", "codex", "--requested-model", "user-selected", "--objective-id", `iteration-${sequence}`,
      "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
      "--fan-in-owner", "/root", "--session-id", "session-a"
    ]);
  }
  const status = JSON.parse(run(root, ["task", "status", "--task-id", taskId, "--format", "json"]).stdout);
  assert.ok(status.stagePath.length > 512 && status.stagePath.length <= 1024);
  const rejected = run(root, [
    "stage", "start", "--task-id", taskId, "--name", longName(7), "--stage-class", "preflight",
    "--role", "planner", "--executor", "coordinator", "--sequence", "7", "--context-mode", "none",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "iteration-7",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(rejected.stderr, /1024 characters or fewer/);

  run(root, ["hook", "--event", "stop", "--provider", "codex"], {
    input: JSON.stringify({
      session_id: "session-receipt-bound",
      turn_id: "receipt-bound",
      model: "test-model",
      last_assistant_message: [
        "Workflow receipt (metadata)",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "Workflow: workspace-change",
        `Path: ${"y".repeat(1200)}`,
        "Stages: 1/1",
        "Delegation: single",
        "Task: lt-receipt-bound",
        "Risk: 2",
        "Verification: passed (1 checks)",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      ].join("\n")
    })
  });
  const events = readFileSync(path.join(root, "metrics", "events.jsonl"), "utf8").trimEnd().split("\n").map(JSON.parse);
  const receipt = events.find((event) => event.turnId === "receipt-bound");
  assert.equal(receipt.workflowPath.length, 1024);
});

test("rejects unknown workflow classifications", () => {
  const root = createWorkspace();
  const result = run(root, [
    "task", "start",
    "--workflow", "custom-one-off-label",
    "--repo", "workspace",
    "--task-type", "change",
    "--risk", "2",
    "--routing-profile", "user-selected",
    "--acceptance-checks", "1",
    "--criteria", "scope",
    "--evidence-classes", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(result.stderr, /Unknown --workflow/);

  const wrongRisk = run(root, [
    "task", "start",
    "--workflow", "workspace-change",
    "--repo", "workspace",
    "--task-type", "change",
    "--risk", "3",
    "--routing-profile", "user-selected",
    "--acceptance-checks", "1",
    "--criteria", "scope",
    "--evidence-classes", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(wrongRisk.stderr, /does not allow risk 3/);

  const missingArtifactTarget = run(root, [
    "task", "start",
    "--workflow", "workspace-high-risk-change",
    "--repo", "workspace",
    "--task-type", "change",
    "--risk", "3",
    "--routing-profile", "user-selected",
    "--acceptance-checks", "1",
    "--criteria", "scope",
    "--evidence-classes", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(missingArtifactTarget.stderr, /requires --artifact-repos/);
});

test("gates a positive outcome on criteria and required stage classes", () => {
  const root = createWorkspace();
  const taskId = startTask(root);

  const legacyCorrect = run(root, [
    "outcome",
    "--result", "correct",
    "--verification", "passed"
  ], { expectedStatus: 1 });
  assert.match(legacyCorrect.stderr, /requires a logical --task-id and an acceptance interaction/);

  const unaccepted = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--verification", "passed",
    "--verification-checks", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(unaccepted.stderr, /Missing --turn-id/);

  for (const criterion of ["scope", "verification"]) {
    run(root, [
      "criterion", "record",
      "--task-id", taskId,
      "--criterion-id", criterion,
      "--state", "passed",
      "--verification-class", criterion === "scope" ? "source" : "test",
      "--artifact", "artifact-1",
      "--session-id", "session-a"
    ]);
  }

  const unclassified = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted",
    "--verification", "passed",
    "--verification-checks", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(unclassified.stderr, /requires an acceptance interaction/);

  recordInteraction(root, taskId, "acceptance", "accepted");

  const premature = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted",
    "--verification", "passed",
    "--verification-checks", "2",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(premature.stderr, /Required stage classes are not satisfied/);

  ["preflight", "implementation", "verification", "review"]
    .forEach((stageClass, index) => finishStage(root, taskId, stageClass, index + 1));

  const status = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(status.state, "active");
  assert.deepEqual(status.criteria, { passed: 2, total: 2 });

  const failedVerificationId = run(root, [
    "stage", "start",
    "--task-id", taskId,
    "--name", "verification-regression",
    "--stage-class", "verification",
    "--role", "test-role",
    "--executor", "coordinator",
    "--sequence", "5",
    "--context-mode", "none",
    "--provider", "codex",
    "--requested-model", "user-selected",
    "--objective-id", "verification-regression",
    "--scope", "workspace",
    "--access", "read",
    "--depends-on", "none",
    "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root",
    "--session-id", "session-a"
  ]).stdout.trim();
  run(root, [
    "stage", "finish",
    "--task-id", taskId,
    "--stage-id", failedVerificationId,
    "--status", "failed",
    "--outcome", "unknown",
    "--verification-checks", "1",
    "--findings", "1",
    "--observed-model", "unknown",
    "--agent-path", "/root/test",
    "--handoff", "verification-recovery",
    "--session-id", "session-a"
  ]);
  const regressed = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted",
    "--verification", "passed",
    "--verification-checks", "2",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(regressed.stderr, /Required stage classes are not satisfied: verification/);
  finishStage(root, taskId, "verification", 6);

  const reviewId = run(root, [
    "stage", "start",
    "--task-id", taskId,
    "--name", "review-evidence-check",
    "--stage-class", "review",
    "--role", "test-role",
    "--executor", "coordinator",
    "--sequence", "7",
    "--context-mode", "none",
    "--provider", "codex",
    "--requested-model", "user-selected",
    "--objective-id", "review-evidence-check",
    "--scope", "workspace",
    "--access", "read",
    "--depends-on", "none",
    "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root",
    "--session-id", "session-a"
  ]).stdout.trim();
  const noEvidence = run(root, [
    "stage", "finish",
    "--task-id", taskId,
    "--stage-id", reviewId,
    "--status", "completed",
    "--outcome", "pass",
    "--verification-checks", "0",
    "--findings", "0",
    "--observed-model", "unknown",
    "--agent-path", "/root/test",
    "--handoff", "outcome",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(noEvidence.stderr, /requires at least one verification check/);
  run(root, [
    "stage", "finish",
    "--task-id", taskId,
    "--stage-id", reviewId,
    "--status", "completed",
    "--outcome", "pass",
    "--verification-checks", "1",
    "--findings", "0",
    "--observed-model", "unknown",
    "--agent-path", "/root/test",
    "--handoff", "outcome",
    "--session-id", "session-a"
  ]);

  recordDelivery(root, taskId);
  recordInteraction(root, taskId, "acceptance", "accepted-final");
  run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted-final",
    "--verification", "passed",
    "--verification-checks", "2",
    "--session-id", "session-a"
  ]);
  const terminal = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(terminal.state, "correct");

  run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "changes-needed",
    "--turn-id", "rejected",
    "--verification", "failed",
    "--verification-checks", "1",
    "--session-id", "session-a"
  ]);
  const reopened = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(reopened.state, "active");

  recordInteraction(root, taskId, "acceptance", "accepted-again");
  const uncorrected = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted-again",
    "--verification", "passed",
    "--verification-checks", "1",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(uncorrected.stderr, /requires fresh correction and verification stages/);

  finishStage(root, taskId, "implementation", 8);
  finishStage(root, taskId, "verification", 9);
  recordDelivery(root, taskId, "corrected-delivery");
  recordInteraction(root, taskId, "acceptance", "accepted-correction");
  run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted-correction",
    "--verification", "passed",
    "--verification-checks", "1",
    "--session-id", "session-a"
  ]);
  const corrected = JSON.parse(run(root, ["task", "status", "--task-id", taskId, "--format", "json"]).stdout);
  assert.equal(corrected.state, "correct");
});

test("uses the task-start route contract after the registry changes", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const annotations = path.join(root, "metrics", "events.jsonl");
  const started = JSON.parse(readFileSync(annotations, "utf8").trim());
  assert.deepEqual(started.requiredStageClasses, ["preflight", "implementation", "verification", "review"]);
  assert.equal(started.requiresRemoteArtifact, false);

  const registryPath = path.join(root, "workflows", "registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  registry.routes.change.allowedStageClasses = ["preflight", "review"];
  registry.routes.change.requiredForPassed = ["preflight", "review"];
  registry.verificationClasses = ["review"];
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  run(root, [
    "criterion", "record",
    "--task-id", taskId,
    "--criterion-id", "scope",
    "--state", "passed",
    "--verification-class", "source",
    "--artifact", "source-ledger",
    "--session-id", "session-a"
  ]);
  finishStage(root, taskId, "preflight", 1);
  finishStage(root, taskId, "implementation", 2);
});

test("allows audit verification after preflight without an implementation stage", () => {
  const root = createWorkspace();
  const taskId = run(root, [
    "task", "start",
    "--workflow", "workspace-audit",
    "--repo", "workspace",
    "--task-type", "audit",
    "--risk", "1",
    "--routing-profile", "user-selected",
    "--acceptance-checks", "1",
    "--criteria", "evidence",
    "--evidence-classes", "1",
    "--session-id", "session-a"
  ]).stdout.trim();

  finishStage(root, taskId, "preflight", 1);
  finishStage(root, taskId, "verification", 2);
});

test("rejects a replayed positive outcome that bypasses readiness gates", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const annotations = path.join(root, "metrics", "events.jsonl");
  const current = readFileSync(annotations, "utf8");
  writeFileSync(annotations, `${current}${JSON.stringify({
    schemaVersion: 14,
    event: "logical_task_outcome",
    logicalTaskId: taskId,
    timestamp: new Date().toISOString(),
    result: "correct",
    status: "complete",
    accepted: true,
    verification: "passed",
    verificationChecks: 1,
    fixRounds: 0
  })}\n`);

  const replay = run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ], { expectedStatus: 1 });
  assert.match(replay.stderr, /Invalid logical task outcome/);
});

test("artifact verification detects local drift and proves a remote SHA", () => {
  const root = createWorkspace();
  const taskId = startTask(root, "workspace-high-risk-change", "workspace,secondary");
  const repository = path.join(root, "artifact-repo");
  const remote = path.join(root, "artifact-remote.git");
  mkdirSync(repository);
  git(repository, "init", "-q");
  git(repository, "config", "user.name", "Workflow Test");
  git(repository, "config", "user.email", "workflow-test@example.invalid");
  write(repository, "file.txt", "initial\n");
  git(repository, "add", "file.txt");
  git(repository, "commit", "-qm", "initial");
  git(root, "init", "--bare", "-q", remote);
  git(repository, "remote", "add", "origin", remote);
  git(repository, "push", "-qu", "origin", "HEAD:main");
  const head = git(repository, "rev-parse", "HEAD");

  run(root, [
    "artifact", "bind",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--base-sha", head,
    "--session-id", "session-a"
  ]);
  run(root, [
    "artifact", "verify",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--remote", "origin",
    "--remote-ref", "refs/heads/main",
    "--session-id", "session-a"
  ]);
  const verifiedStatus = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(verifiedStatus.remoteArtifactVerified, false);
  assert.deepEqual(verifiedStatus.artifacts, [
    { repo: "workspace", bound: true, remoteVerified: false, remote: "origin", remoteRef: "refs/heads/main" },
    { repo: "secondary", bound: false, remoteVerified: false, remote: null, remoteRef: null }
  ]);

  for (const criterion of ["scope", "verification"]) {
    run(root, [
      "criterion", "record",
      "--task-id", taskId,
      "--criterion-id", criterion,
      "--state", "passed",
      "--verification-class", criterion === "scope" ? "source" : "test",
      "--artifact", "artifact-1",
      "--session-id", "session-a"
    ]);
  }
  ["preflight", "implementation", "verification", "review", "challenge", "publication", "readback"]
    .forEach((stageClass, index) => finishStage(root, taskId, stageClass, index + 1));
  recordInteraction(root, taskId, "acceptance", "accepted");
  const incompleteRemoteProof = run(root, [
    "outcome",
    "--task-id", taskId,
    "--result", "correct",
    "--turn-id", "accepted",
    "--verification", "passed",
    "--verification-checks", "2",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(incompleteRemoteProof.stderr, /remotely verified bound artifact/);

  run(root, [
    "artifact", "bind",
    "--task-id", taskId,
    "--repo", "secondary",
    "--repo-path", repository,
    "--base-sha", head,
    "--session-id", "session-a"
  ]);
  run(root, [
    "artifact", "verify",
    "--task-id", taskId,
    "--repo", "secondary",
    "--repo-path", repository,
    "--remote", "origin",
    "--remote-ref", "refs/heads/main",
    "--session-id", "session-a"
  ]);
  const staleProof = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(staleProof.remoteArtifactVerified, false);

  run(root, [
    "artifact", "verify",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--remote", "origin",
    "--remote-ref", "refs/heads/main",
    "--session-id", "session-a"
  ]);
  const allVerified = JSON.parse(run(root, [
    "task", "status",
    "--task-id", taskId,
    "--format", "json"
  ]).stdout);
  assert.equal(allVerified.remoteArtifactVerified, true);

  write(repository, "file.txt", "changed\n");
  const drift = run(root, [
    "artifact", "verify",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--remote", "origin",
    "--remote-ref", "refs/heads/main",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(drift.stderr, /Artifact identity changed/);

  run(root, [
    "artifact", "bind",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--base-sha", head,
    "--session-id", "session-a"
  ]);
  const dirtyRemote = run(root, [
    "artifact", "verify",
    "--task-id", taskId,
    "--repo", "workspace",
    "--repo-path", repository,
    "--remote", "origin",
    "--remote-ref", "refs/heads/main",
    "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(dirtyRemote.stderr, /requires a clean bound artifact/);
});

test("reads schema 14 histories and rejects older annotation schemas", () => {
  const compatibleRoot = createWorkspace();
  const compatibleAnnotations = path.join(compatibleRoot, "metrics", "events.jsonl");
  const compatibleTask = startTask(compatibleRoot);
  const legacyTaskEvent = JSON.parse(readFileSync(compatibleAnnotations, "utf8").trim());
  legacyTaskEvent.schemaVersion = 14;
  writeFileSync(compatibleAnnotations, `${JSON.stringify(legacyTaskEvent)}\n`);
  const compatibleStatus = JSON.parse(run(compatibleRoot, [
    "task", "status", "--task-id", compatibleTask, "--format", "json"
  ]).stdout);
  assert.equal(compatibleStatus.delegationEnforcement, "legacy-unverified");

  const root = createWorkspace();
  const annotations = path.join(root, "metrics", "events.jsonl");
  writeFileSync(annotations, `${JSON.stringify({
    schemaVersion: 13,
    event: "logical_task_started",
    logicalTaskId: "lt-retired-task",
    rootSessionId: "session-a",
    timestamp: new Date(Date.now() - 1_000).toISOString(),
    workflowVersion: "test-v0",
    workflowFingerprint: "a".repeat(64),
    workflowId: "retired-label",
    repo: "workspace",
    taskType: "change",
    risk: 2,
    routingProfile: "user-selected",
    delegationMode: "single",
    acceptanceChecks: 1,
    evidenceClasses: 1
  })}\n`);

  const status = run(root, [
    "task", "status",
    "--task-id", "lt-retired-task",
    "--format", "json"
  ], { expectedStatus: 1 });
  assert.match(status.stderr, /Unsupported workflow annotation schema/);
});

function fingerprint(root) {
  return run(root, ["fingerprint"]).stdout.trim();
}

test("fingerprints the new nested workflow directory set", () => {
  const root = createWorkspace();
  const before = fingerprint(root);
  write(root, "workflows/policies/routing.md", "routing changed\n");
  const after = fingerprint(root);
  assert.match(before, /^[0-9a-f]{64}$/);
  assert.notEqual(after, before);
});

test("a Codex adapter change alters the fingerprint", () => {
  const root = createWorkspace();
  const before = fingerprint(root);
  write(root, ".codex/agents/investigator.toml", "changed\n");
  assert.notEqual(fingerprint(root), before);
});

test("a Claude adapter change alters the fingerprint", () => {
  const root = createWorkspace();
  const before = fingerprint(root);
  write(root, ".claude/agents/investigator.md", "changed\n");
  assert.notEqual(fingerprint(root), before);
});

test("the agent manifest alters the fingerprint", () => {
  const root = createWorkspace();
  write(root, "agents/manifest.json", "{}\n");
  const before = fingerprint(root);
  write(root, "agents/manifest.json", "{\"schemaVersion\":1}\n");
  assert.notEqual(fingerprint(root), before);
});

function startStage(root, taskId, {
  sequence = 1,
  objective = `objective-${sequence}`,
  access = "read",
  executor = "delegate",
  provider = "codex",
  dependsOn = "none",
  parallelGroup,
  session = "session-a"
} = {}) {
  const args = [
    "stage", "start", "--task-id", taskId,
    "--name", `stage-${sequence}`,
    "--stage-class", "preflight",
    "--role", executor === "delegate" ? "investigator" : "planner",
    "--executor", executor,
    "--sequence", String(sequence),
    "--context-mode", executor === "coordinator" ? "none" : "bounded",
    "--provider", provider,
    "--requested-model", "user-selected",
    "--objective-id", objective,
    "--scope", "workspace",
    "--access", access,
    "--depends-on", dependsOn,
    "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root",
    "--session-id", session
  ];
  if (parallelGroup) args.push("--parallel-group", parallelGroup);
  return run(root, args).stdout.trim();
}

function bindStage(root, taskId, stageId, agentPath = "/root/investigator", provider = "codex", providerRunId, session = "session-a") {
  const args = [
    "stage", "bind", "--task-id", taskId, "--stage-id", stageId,
    "--agent-path", agentPath, "--provider", provider, "--session-id", session
  ];
  if (providerRunId) args.push("--provider-run-id", providerRunId);
  return run(root, args);
}

function finishDelegate(root, taskId, stageId, overrides = {}) {
  const values = {
    status: "completed", outcome: "pass", checks: "1", findings: "0",
    model: "gpt-5.6-sol", agentPath: "/root/investigator", handoff: "root", readback: "true",
    ...overrides
  };
  const args = [
    "stage", "finish", "--task-id", taskId, "--stage-id", stageId,
    "--status", values.status, "--outcome", values.outcome,
    "--verification-checks", values.checks, "--findings", values.findings,
    "--observed-model", values.model, "--agent-path", values.agentPath,
    "--handoff", values.handoff, "--report-readback", values.readback,
    "--session-id", "session-a"
  ];
  if (values.failureReason) args.push("--failure-reason", values.failureReason);
  return run(root, args, { expectedStatus: values.expectedStatus ?? 0 });
}

test("schema 15 reserve-bind-finish records enforced delegate identity", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const stageId = startStage(root, taskId);
  bindStage(root, taskId, stageId, "/root/investigator", "codex", "run-1");
  finishDelegate(root, taskId, stageId);
  const status = JSON.parse(run(root, ["task", "status", "--task-id", taskId, "--format", "json"]).stdout);
  assert.equal(status.delegationEnforcement, "enforced");
  const csv = run(root, ["summary", "--format", "stage-csv"]).stdout;
  assert.match(csv, /enforced-bound/);
  assert.match(csv, /run-1/);
});

test("schema 15 rejects duplicate objectives and enforces passing dependencies", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const first = startStage(root, taskId, { objective: "same-objective" });
  const duplicate = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "duplicate", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "2", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "same-objective",
    "--scope", "workspace", "--access", "read", "--depends-on", "none",
    "--completion-signal", "stage-report-v1", "--fan-in-owner", "/root", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(duplicate.stderr, /objective/i);
  const missingDependency = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "missing-dependent", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "3", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "missing-dependent",
    "--scope", "workspace", "--access", "read", "--depends-on", "st-missing",
    "--completion-signal", "stage-report-v1", "--fan-in-owner", "/root", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(missingDependency.stderr, /Missing dependency/);
  const dependency = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "dependent", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "4", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "dependent-objective",
    "--scope", "workspace", "--access", "read", "--depends-on", first,
    "--completion-signal", "stage-report-v1", "--fan-in-owner", "/root", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(dependency.stderr, /not completed\/pass/);
  bindStage(root, taskId, first);
  finishDelegate(root, taskId, first);
  assert.match(startStage(root, taskId, { sequence: 5, objective: "ready-dependent", dependsOn: first }), /^st-/);
});

test("schema 15 enforces one writer across coordinator and delegate stages and releases it", () => {
  const root = createWorkspace();
  const firstTask = startTask(root);
  const writer = startStage(root, firstTask, { access: "write", executor: "coordinator" });
  const secondTask = run(root, [
    "task", "start", "--workflow", "workspace-change", "--repo", "workspace", "--task-type", "change",
    "--risk", "2", "--routing-profile", "user-selected", "--acceptance-checks", "1", "--criteria", "scope",
    "--evidence-classes", "1", "--delegation-mode", "single", "--session-id", "session-b"
  ]).stdout.trim();
  const conflict = run(root, [
    "stage", "start", "--task-id", secondTask, "--name", "writer", "--stage-class", "preflight",
    "--role", "implementer", "--executor", "delegate", "--sequence", "1", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "writer-2",
    "--scope", "workspace", "--access", "write", "--depends-on", "none",
    "--completion-signal", "stage-report-v1", "--fan-in-owner", "/root", "--session-id", "session-b"
  ], { expectedStatus: 1 });
  assert.match(conflict.stderr, /writer/i);
  run(root, [
    "stage", "finish", "--task-id", firstTask, "--stage-id", writer, "--status", "completed", "--outcome", "pass",
    "--verification-checks", "1", "--findings", "0", "--observed-model", "unknown", "--agent-path", "/root",
    "--handoff", "root", "--session-id", "session-a"
  ]);
  assert.match(startStage(root, secondTask, { access: "write", session: "session-b" }), /^st-/);
});

test("schema 15 caps parallel groups at four stages", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  for (let sequence = 1; sequence <= 4; sequence += 1) {
    startStage(root, taskId, { sequence, parallelGroup: "group-a" });
  }
  const fifth = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "stage-5", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "5", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "objective-5",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--parallel-group", "group-a", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(fifth.stderr, /four|parallel/i);
});

test("schema 15 parallel groups retain a four-stage lifetime cap after completion", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const stages = [];
  for (let sequence = 1; sequence <= 4; sequence += 1) {
    stages.push(startStage(root, taskId, { sequence, executor: "coordinator", parallelGroup: "group-a" }));
  }
  run(root, [
    "stage", "finish", "--task-id", taskId, "--stage-id", stages[0], "--status", "completed",
    "--outcome", "pass", "--verification-checks", "1", "--findings", "0", "--observed-model", "unknown",
    "--agent-path", "/root", "--handoff", "root", "--session-id", "session-a"
  ]);
  const fifthArgs = [
    "stage", "start", "--task-id", taskId, "--name", "stage-5", "--stage-class", "preflight",
    "--role", "planner", "--executor", "coordinator", "--sequence", "5", "--context-mode", "none",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "objective-5",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--parallel-group", "group-a", "--session-id", "session-a"
  ];
  assert.match(run(root, fifthArgs, { expectedStatus: 1 }).stderr, /four|parallel/i);

  const annotations = path.join(root, "metrics", "events.jsonl");
  const events = readFileSync(annotations, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  const template = events.findLast((event) => event.event === "logical_task_stage_started");
  events.push({
    ...template,
    stageId: "st-replayed-fifth",
    timestamp: new Date().toISOString(),
    sequence: 5,
    name: "stage-5",
    objectiveId: "objective-5"
  });
  writeFileSync(annotations, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const replay = run(root, ["task", "status", "--task-id", taskId, "--format", "json"], { expectedStatus: 1 });
  assert.match(replay.stderr, /Invalid logical task stage start/);
});

test("schema 15 requires root-owned fan-in at command time and replay", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  startStage(root, taskId, { parallelGroup: "group-a" });
  const rejected = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "wrong-owner", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "2", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "wrong-owner",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root/coordinator", "--parallel-group", "group-a", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(rejected.stderr, /fan-in-owner.*\/root/i);

  const replayRoot = createWorkspace();
  const replayTask = startTask(replayRoot);
  startStage(replayRoot, replayTask, { parallelGroup: "group-a" });
  startStage(replayRoot, replayTask, { sequence: 2, objective: "second", parallelGroup: "group-a" });
  const annotations = path.join(replayRoot, "metrics", "events.jsonl");
  const events = readFileSync(annotations, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  const second = events.find((event) => event.event === "logical_task_stage_started" && event.sequence === 2);
  second.fanInOwner = "/root/coordinator";
  writeFileSync(annotations, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const replay = run(replayRoot, ["task", "status", "--task-id", replayTask, "--format", "json"], { expectedStatus: 1 });
  assert.match(replay.stderr, /Invalid logical task stage start/);
});

test("schema 15 rejects duplicate and mismatched binding plus completion without binding or readback", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const stageId = startStage(root, taskId);
  const mismatch = run(root, ["stage", "bind", "--task-id", taskId, "--stage-id", stageId,
    "--agent-path", "/root/investigator", "--provider", "claude", "--session-id", "session-a"], { expectedStatus: 1 });
  assert.match(mismatch.stderr, /provider/i);
  const unbound = finishDelegate(root, taskId, stageId, { expectedStatus: 1 });
  assert.match(unbound.stderr, /bound/i);
  bindStage(root, taskId, stageId, "/root/investigator", "codex", "run-1");
  const duplicate = run(root, ["stage", "bind", "--task-id", taskId, "--stage-id", stageId,
    "--agent-path", "/root/other", "--provider", "codex", "--session-id", "session-a"], { expectedStatus: 1 });
  assert.match(duplicate.stderr, /already bound/i);
  const secondStage = startStage(root, taskId, { sequence: 2, objective: "second-binding" });
  const reusedPath = run(root, ["stage", "bind", "--task-id", taskId, "--stage-id", secondStage,
    "--agent-path", "/root/investigator", "--provider", "codex", "--provider-run-id", "run-2",
    "--session-id", "session-a"], { expectedStatus: 1 });
  assert.match(reusedPath.stderr, /agent path/i);
  const reusedRun = run(root, ["stage", "bind", "--task-id", taskId, "--stage-id", secondStage,
    "--agent-path", "/root/other", "--provider", "codex", "--provider-run-id", "run-1",
    "--session-id", "session-a"], { expectedStatus: 1 });
  assert.match(reusedRun.stderr, /provider run ID/i);
  const noReadback = finishDelegate(root, taskId, stageId, { readback: "false", expectedStatus: 1 });
  assert.match(noReadback.stderr, /readback/i);
});

test("schema 15 scopes agent paths by root session while provider run IDs remain global", () => {
  const root = createWorkspace();
  const taskA = startTask(root, "workspace-change", "workspace", "session-a");
  const taskB = startTask(root, "workspace-change", "workspace", "session-b");
  const stageA = startStage(root, taskA, { session: "session-a", objective: "session-a-stage" });
  const stageB = startStage(root, taskB, { session: "session-b", objective: "session-b-stage" });
  bindStage(root, taskA, stageA, "/root/investigator", "codex", "run-a", "session-a");
  bindStage(root, taskB, stageB, "/root/investigator", "codex", "run-b", "session-b");
  assert.equal(JSON.parse(run(root, ["task", "status", "--task-id", taskB, "--format", "json"]).stdout).taskId, taskB);

  const taskC = startTask(root, "workspace-change", "workspace", "session-c");
  const stageC = startStage(root, taskC, { session: "session-c", objective: "session-c-stage" });
  const reusedRun = run(root, [
    "stage", "bind", "--task-id", taskC, "--stage-id", stageC, "--agent-path", "/root/other",
    "--provider", "codex", "--provider-run-id", "run-a", "--session-id", "session-c"
  ], { expectedStatus: 1 });
  assert.match(reusedRun.stderr, /provider run ID/i);

  const annotations = path.join(root, "metrics", "events.jsonl");
  const events = readFileSync(annotations, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  const bindingB = events.find((event) => event.event === "logical_task_stage_bound" && event.logicalTaskId === taskB);
  bindingB.providerRunId = "run-a";
  writeFileSync(annotations, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
  const replay = run(root, ["task", "status", "--task-id", taskB, "--format", "json"], { expectedStatus: 1 });
  assert.match(replay.stderr, /Invalid logical task stage binding/);
});

test("schema 15 spawn failure releases an unbound writer reservation", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const stageId = startStage(root, taskId, { access: "write" });
  finishDelegate(root, taskId, stageId, {
    status: "failed", outcome: "unknown", checks: "0", readback: "false", failureReason: "spawn-failed"
  });
  assert.match(startStage(root, taskId, { sequence: 2, objective: "retry", access: "write" }), /^st-/);
});

test("concurrent schema 15 writer reservations have exactly one winner", async () => {
  const root = createWorkspace();
  const taskA = startTask(root);
  const taskB = run(root, [
    "task", "start", "--workflow", "workspace-change", "--repo", "workspace", "--task-type", "change",
    "--risk", "2", "--routing-profile", "user-selected", "--acceptance-checks", "1", "--criteria", "scope",
    "--evidence-classes", "1", "--delegation-mode", "single", "--session-id", "session-b"
  ]).stdout.trim();
  const annotations = path.join(root, "metrics", "events.jsonl");
  const launch = (taskId, session, objective) => new Promise((resolve) => {
    const child = spawn(process.execPath, [cli,
      "stage", "start", "--task-id", taskId, "--name", objective, "--stage-class", "preflight",
      "--role", "implementer", "--executor", "coordinator", "--sequence", "1", "--context-mode", "none",
      "--provider", "codex", "--requested-model", "user-selected", "--objective-id", objective,
      "--scope", "workspace", "--access", "write", "--depends-on", "none", "--completion-signal", "stage-report-v1",
      "--fan-in-owner", "/root", "--session-id", session, "--root", root, "--annotations", annotations
    ], { encoding: "utf8" });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stderr }));
  });
  const results = await Promise.all([launch(taskA, "session-a", "writer-a"), launch(taskB, "session-b", "writer-b")]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(results.filter((result) => /writer/i.test(result.stderr)).length, 1);
});

test("schema 15 caps unfinished delegate reservations across active tasks without parallel groups", () => {
  const root = createWorkspace();
  const sessions = ["session-a", "session-b", "session-c", "session-d", "session-e"];
  const tasks = sessions.map((session) => startTask(root, "workspace-change", "workspace", session));
  const stages = tasks.slice(0, 4).map((taskId, index) =>
    startStage(root, taskId, { session: sessions[index], objective: `delegate-${index + 1}` }));
  const fifth = run(root, [
    "stage", "start", "--task-id", tasks[4], "--name", "delegate-5", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "1", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "delegate-5",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--session-id", sessions[4]
  ], { expectedStatus: 1 });
  assert.match(fifth.stderr, /four unfinished delegate/i);
  finishDelegate(root, tasks[0], stages[0], {
    status: "failed", outcome: "unknown", checks: "0", readback: "false", failureReason: "spawn-failed"
  });
  assert.match(startStage(root, tasks[4], { session: sessions[4], objective: "delegate-5" }), /^st-/);
});

test("ledger lock recovers an orphan conservatively and preserves a live owner", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const lock = path.join(root, "metrics", "events.jsonl.lock");
  writeFileSync(lock, `${JSON.stringify({ token: "orphan", pid: 2147483647, createdAtMs: Date.now() - 60_000 })}\n`);
  assert.match(startStage(root, taskId), /^st-/);
  assert.equal(existsSync(lock), false);

  const liveOwner = `${JSON.stringify({ token: "live", pid: process.pid, createdAtMs: Date.now() - 60_000 })}\n`;
  writeFileSync(lock, liveOwner);
  const blocked = run(root, [
    "stage", "start", "--task-id", taskId, "--name", "live-lock", "--stage-class", "preflight",
    "--role", "investigator", "--executor", "delegate", "--sequence", "2", "--context-mode", "bounded",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "live-lock",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(blocked.stderr, /ledger is busy/i);
  assert.equal(readFileSync(lock, "utf8"), liveOwner);
  rmSync(lock);
});

test("ledger lock recovers dead old primary and recovery owners", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const lock = path.join(root, "metrics", "events.jsonl.lock");
  const recovery = `${lock}.recovery`;
  const deadOldOwner = (token) => `${JSON.stringify({
    token,
    pid: 2147483647,
    createdAtMs: Date.now() - 60_000
  })}\n`;
  writeFileSync(lock, deadOldOwner("primary-orphan"));
  writeFileSync(recovery, deadOldOwner("recovery-orphan"));

  assert.match(startStage(root, taskId), /^st-/);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(recovery), false);
});

test("ledger lock contention sees only fully published primary and recovery owners", async () => {
  for (const lockKind of ["primary", "recovery"]) {
    const root = createWorkspace();
    const taskId = startTask(root);
    const annotations = path.join(root, "metrics", "events.jsonl");
    const lock = `${annotations}.lock`;
    if (lockKind === "recovery") {
      writeFileSync(lock, `${JSON.stringify({ token: "dead-primary", pid: 2147483647, createdAtMs: Date.now() - 60_000 })}\n`);
    }
    const signal = path.join(root, `metrics/${lockKind}-prepared.json`);
    const release = path.join(root, `metrics/${lockKind}-release`);
    const child = spawn(process.execPath, [cli,
      "stage", "start", "--task-id", taskId, "--name", `${lockKind}-publisher`, "--stage-class", "preflight",
      "--role", "planner", "--executor", "coordinator", "--sequence", "1", "--context-mode", "none",
      "--provider", "codex", "--requested-model", "user-selected", "--objective-id", `${lockKind}-publisher`,
      "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
      "--fan-in-owner", "/root", "--session-id", "session-a", "--root", root, "--annotations", annotations
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        CVO_METRICS_TEST_PAUSE_LOCK: lockKind,
        CVO_METRICS_TEST_PREPUBLISH_SIGNAL: signal,
        CVO_METRICS_TEST_PREPUBLISH_RELEASE: release
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const completed = new Promise((resolve) => child.on("close", (status) => resolve({ status, stdout, stderr })));
    try {
      await waitForPath(signal);
      const prepared = JSON.parse(readFileSync(signal, "utf8"));
      const expectedTarget = lockKind === "primary" ? lock : `${lock}.recovery`;
      assert.equal(prepared.target, expectedTarget);
      assert.equal(existsSync(expectedTarget), false, `${lockKind} lock published before owner was complete`);
      assert.ok(JSON.parse(readFileSync(prepared.temporary, "utf8")).token);
      assert.match(startStage(root, taskId, {
        sequence: 2,
        objective: `${lockKind}-contender`,
        executor: "coordinator"
      }), /^st-/);
    } finally {
      writeFileSync(release, "release\n");
    }
    const result = await completed;
    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const prepared = JSON.parse(readFileSync(signal, "utf8"));
    assert.equal(existsSync(prepared.temporary), false);
    assert.deepEqual(readdirSync(path.dirname(annotations)).filter((name) => name.includes(".owner-")), []);
  }
});

test("failure reason is accepted only for an exact unbound spawn failure", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const bound = startStage(root, taskId);
  bindStage(root, taskId, bound);
  const rejected = finishDelegate(root, taskId, bound, {
    status: "failed", outcome: "unknown", checks: "0", readback: "false",
    failureReason: "spawn-failed", expectedStatus: 1
  });
  assert.match(rejected.stderr, /failure-reason/i);

  const replayRoot = createWorkspace();
  const replayTask = startTask(replayRoot);
  const replayStage = startStage(replayRoot, replayTask);
  bindStage(replayRoot, replayTask, replayStage);
  const annotations = path.join(replayRoot, "metrics", "events.jsonl");
  const illegalFinish = {
    schemaVersion: 15,
    event: "logical_task_stage_finished",
    logicalTaskId: replayTask,
    rootSessionId: "session-a",
    stageId: replayStage,
    timestamp: new Date().toISOString(),
    status: "failed",
    outcome: "unknown",
    verificationChecks: 0,
    findings: 0,
    observedModel: "unknown",
    agentPath: "/root/investigator",
    handoff: "root",
    reportReadback: false,
    failureReason: "spawn-failed"
  };
  writeFileSync(annotations, `${readFileSync(annotations, "utf8")}${JSON.stringify(illegalFinish)}\n`);
  const replay = run(replayRoot, ["task", "status", "--task-id", replayTask, "--format", "json"], { expectedStatus: 1 });
  assert.match(replay.stderr, /Invalid logical task stage finish/);
});

test("concurrent terminal outcomes and criterion mutations use the common ledger lock", async () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  const annotations = path.join(root, "metrics", "events.jsonl");
  const launchOutcome = () => new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, "outcome", "--task-id", taskId, "--result", "blocked",
      "--verification", "not-run", "--session-id", "session-a", "--root", root, "--annotations", annotations],
    { encoding: "utf8" });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stderr }));
  });
  const outcomes = await Promise.all([launchOutcome(), launchOutcome()]);
  assert.equal(outcomes.filter(({ status }) => status === 0).length, 1);
  assert.equal(outcomes.filter(({ stderr }) => /terminal outcome/i.test(stderr)).length, 1);

  const criterionRoot = createWorkspace();
  const criterionTask = startTask(criterionRoot);
  const lock = path.join(criterionRoot, "metrics", "events.jsonl.lock");
  const liveOwner = `${JSON.stringify({ token: "live", pid: process.pid, createdAtMs: Date.now() })}\n`;
  writeFileSync(lock, liveOwner);
  const criterion = run(criterionRoot, [
    "criterion", "record", "--task-id", criterionTask, "--criterion-id", "scope", "--state", "passed",
    "--verification-class", "source", "--artifact", "source-1", "--session-id", "session-a"
  ], { expectedStatus: 1 });
  assert.match(criterion.stderr, /ledger is busy/i);
  assert.equal(readFileSync(lock, "utf8"), liveOwner);
  rmSync(lock);
});

test("skill and canonical-agent changes alter the fingerprint", () => {
  const root = createWorkspace();
  const initial = fingerprint(root);
  write(root, "skills/contract-review/SKILL.md", "skill changed\n");
  const skillChanged = fingerprint(root);
  assert.notEqual(skillChanged, initial);
  write(root, "agents/investigator.md", "agent changed\n");
  assert.notEqual(fingerprint(root), skillChanged);
});

test("fingerprint succeeds when ai-context is absent", () => {
  const root = createWorkspace();
  rmSync(path.join(root, "ai-context"), { recursive: true, force: true });
  assert.match(fingerprint(root), /^[0-9a-f]{64}$/);
});

test("fingerprint succeeds against a minimal, partial scaffold (no metrics/, no manifest, no WORKFLOW_VERSION)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cvo-workflow-partial-"));
  write(root, "AGENTS.md", "generic router\n");
  write(root, "workflows/README.md", "generic pipelines\n");
  const before = fingerprint(root);
  assert.match(before, /^[0-9a-f]{64}$/);
  write(root, "workflows/README.md", "generic pipelines, changed\n");
  assert.notEqual(fingerprint(root), before);
});

test("stop hook succeeds against a root with no WORKFLOW_VERSION file (generic, non-CVO project)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "cvo-workflow-generic-root-"));
  write(root, "workflows/README.md", "generic pipelines\n");
  const annotations = path.join(root, "events.jsonl");
  const result = spawnSync(process.execPath, [
    cli, "hook", "--event", "stop", "--provider", "claude", "--root", root, "--annotations", annotations
  ], { encoding: "utf8", input: JSON.stringify({ session_id: "generic-session", prompt_id: "generic-turn" }) });
  assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
  const events = readFileSync(annotations, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "automatic_delivery");
  assert.equal(events[0].workflowVersion, undefined);
});

test("session end warns when a finished logical task has no recorded outcome", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  finishStage(root, taskId, "preflight", 1);
  const result = run(root, ["hook", "--event", "session-end"], { input: JSON.stringify({ session_id: "session-a" }) });
  const message = JSON.parse(result.stdout).systemMessage;
  assert.match(message, /finished with no outcome recorded/);
  assert.ok(message.includes(taskId));
});

test("session end stays quiet once the logical task has a recorded outcome", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  finishStage(root, taskId, "preflight", 1);
  run(root, [
    "outcome", "--task-id", taskId, "--result", "abandoned", "--verification", "not-run", "--session-id", "session-a"
  ]);
  const result = run(root, ["hook", "--event", "session-end"], { input: JSON.stringify({ session_id: "session-a" }) });
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
});

test("session end stays quiet while a logical task still has an open stage", () => {
  const root = createWorkspace();
  const taskId = startTask(root);
  run(root, [
    "stage", "start", "--task-id", taskId, "--name", "preflight-work", "--stage-class", "preflight",
    "--role", "test-role", "--executor", "coordinator", "--sequence", "1", "--context-mode", "none",
    "--provider", "codex", "--requested-model", "user-selected", "--objective-id", "preflight-1",
    "--scope", "workspace", "--access", "read", "--depends-on", "none", "--completion-signal", "stage-report-v1",
    "--fan-in-owner", "/root", "--session-id", "session-a"
  ]);
  const result = run(root, ["hook", "--event", "session-end"], { input: JSON.stringify({ session_id: "session-a" }) });
  assert.deepEqual(JSON.parse(result.stdout), { continue: true });
});
