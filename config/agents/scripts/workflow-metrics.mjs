#!/usr/bin/env node

import { createReadStream, existsSync, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import process from "node:process";
import { allocateSharedUsage, inferSessionFeedback, interactionKinds } from "./workflow-feedback.mjs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const schemaVersion = 16;
const supportedSchemaVersions = new Set([14, 15, 16]);
const defaultDays = 14;
const defaultTableLimit = 25;
const maxWorkflowPathLength = 1024;
const maxArtifactFiles = 500;
const maxArtifactBytes = 20 * 1024 * 1024;
const staleLedgerLockMs = 30_000;
const execFileAsync = promisify(execFile);
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp() {
  process.stdout.write(`CVO workflow metrics

Usage:
  node scripts/workflow-metrics.mjs summary [options]
  node scripts/workflow-metrics.mjs annotate (--task-key <key>|--task-id <id>) [fields]
  node scripts/workflow-metrics.mjs interaction --task-id <id> --kind <correction|clarification|approval|acceptance|continuation|new-work|unknown> [--turn-id <id|current>]
  node scripts/workflow-metrics.mjs task start [classification]
  node scripts/workflow-metrics.mjs task status --task-id <id> [--format text|json]
  node scripts/workflow-metrics.mjs task receipt --task-id <id> --verification <state> --verification-checks <count>
  node scripts/workflow-metrics.mjs stage start --task-id <id> [stage fields]
  node scripts/workflow-metrics.mjs stage bind --task-id <id> --stage-id <id> [binding fields]
  node scripts/workflow-metrics.mjs stage finish --task-id <id> --stage-id <id> [result fields]
  node scripts/workflow-metrics.mjs criterion record --task-id <id> [criterion fields]
  node scripts/workflow-metrics.mjs artifact bind --task-id <id> [artifact fields]
  node scripts/workflow-metrics.mjs artifact verify --task-id <id> [artifact fields]
  node scripts/workflow-metrics.mjs outcome --result <result> [classification]
  node scripts/workflow-metrics.mjs hook --event <stop|session-end> --provider <codex|claude>
  node scripts/workflow-metrics.mjs fingerprint

Summary options:
  --root <path>          CVO workspace root (default: current directory)
  --sessions <path>      Codex sessions directory (default: ~/.codex/sessions)
  --claude-sessions <path> Claude projects directory (default: ~/.claude/projects)
  --annotations <path>   Append-only annotation log
  --days <number>        Recent window (default: 14)
  --time-zone <IANA>     Daily reporting zone (default: America/Los_Angeles)
  --format <type>        markdown, json, csv, logical-csv, stage-csv, or daily-csv (default: markdown)
  --table-limit <number> Recent attempt rows; 0 shows all (default: 25)

Annotation fields:
  --workflow-version <value>  --workflow-fingerprint <sha256>
  --workflow <value>          --repo <value>
  --task-type <value>         --risk <0-3>         --model <value>
  --routing-profile <user-selected|single-luna|single-terra|single-sol-high|hybrid-v3|hybrid-v3-fallback>
  --status <complete|blocked|abandoned>
  --accepted <true|false>     --verification <passed|partial|failed|not-run>
  --quality <1-5>             3 = neutral; 5 = fully correct and useful
  --estimated-cost-usd <number>
  --pre-delivery-fix-rounds <number>
  --fix-rounds <number>       --user-corrections <number>
  --must-fix-findings <number> --escaped-defects <number>
  --notes <sanitized text>

Outcome fields:
  --result <correct|changes-needed|blocked|abandoned>
  --workflow <value>  --repo <value>  --task-type <value>  --risk <0-3>
  --routing-profile <value>  --verification <passed|partial|failed|not-run>
  --quality <1-5>      Optional requester score; 3 = neutral, 5 = fully correct and useful
  --turn-id <id|current> Required for correct; identifies the accepting requester prompt
  --task-id <id>        Update the exact logical task (preferred)
  --session-id <value>  Override CODEX_SESSION_ID when needed

Logical-task gate fields:
  --acceptance-checks <positive integer>  Required at task start
  --criteria <id,id,...>                  Required criterion IDs; count must match acceptance checks
  --artifact-repos <id,id,...>            Required Git targets for remote-artifact routes
  --evidence-classes <positive integer>   Required at task start
  --delegation-mode <single|fan-out>      Defaults to single; fan-out needs 2 evidence classes
  --verification-checks <positive integer> Required when verification is not not-run

Stage start fields:
  --task-id <id>       --name <stage-name>       --role <role-name>
  --stage-class <class> Canonical class from workflows/registry.json
  --executor <coordinator|delegate>              --sequence <positive integer>
  --context-mode <none|bounded|full|forked|unknown>
  --parallel-group <safe-label>                  --requested-model <model>
  --provider <codex|claude|unknown>
  --objective-id <safe-id> --scope <safe-label> --access <read|write>
  --depends-on <stage-id,stage-id|none> --completion-signal stage-report-v1
  --fan-in-owner /root
  --session-id <value> Override CODEX_SESSION_ID when needed

Stage bind fields:
  --task-id <id>       --stage-id <id>       --agent-path <canonical-agent-path>
  --provider <codex|claude|unknown>          --provider-run-id <safe-id> (optional)

Stage finish fields:
  --task-id <id>       --stage-id <id>
  --status <completed|blocked|failed|skipped>
  --outcome <pass|changes-required|blocked|unknown|not-applicable>
  --verification-checks <non-negative integer>   --findings <non-negative integer>
  --observed-model <model>  --agent-path <path>  --handoff <stage-or-root>
  --report-readback <true|false> --failure-reason <spawn-failed|spawn-rejected>

Criterion record fields:
  --task-id <id>       --criterion-id <id>
  --state <passed|failed|blocked|unknown|not-applicable>
  --verification-class <class from workflows/registry.json>
  --artifact <safe artifact ID or digest>

Artifact fields:
  bind:   --task-id <id> --repo <label> --repo-path <path> --base-sha <40-char SHA>
  verify: --task-id <id> --repo <label> --repo-path <path> [--remote <name> --remote-ref <full ref>]

Examples:
  node scripts/workflow-metrics.mjs summary --days 14
  node scripts/workflow-metrics.mjs summary --days 30 --format logical-csv
  node scripts/workflow-metrics.mjs summary --days 30 --format stage-csv
  node scripts/workflow-metrics.mjs summary --days 14 --format daily-csv
  node scripts/workflow-metrics.mjs task start \
    --workflow workspace-audit --repo workspace --task-type audit --risk 2 \
    --routing-profile user-selected --acceptance-checks 3 \
    --criteria scope,evidence,review --evidence-classes 2
  node scripts/workflow-metrics.mjs stage start --task-id <logical-task-id> \
    --name evidence-collection --role investigator --executor delegate \
    --sequence 1 --context-mode bounded --provider codex \
    --requested-model gpt-5.6-sol --parallel-group research-1
  node scripts/workflow-metrics.mjs stage finish --task-id <logical-task-id> \
    --stage-id <stage-id> --status completed --outcome pass \
    --verification-checks 2 --findings 0 --observed-model gpt-5.6-sol \
    --agent-path /root/investigator --handoff synthesis
  node scripts/workflow-metrics.mjs annotate --task-key <key> \
    --workflow-version cvo-v18 \
    --workflow-fingerprint <sha256> --workflow frontend-feature \
    --repo frontend --task-type feature --risk 2 \
    --model gpt-5.6-terra --routing-profile hybrid-v3
  node scripts/workflow-metrics.mjs annotate --task-key <key> --accepted true
  node scripts/workflow-metrics.mjs annotate --task-key <key> --escaped-defects 1
  node scripts/workflow-metrics.mjs interaction --task-id <logical-task-id> \
    --kind acceptance --turn-id current
  node scripts/workflow-metrics.mjs outcome --task-id <logical-task-id> \
    --result correct --verification passed --verification-checks 2 \
    --turn-id current --quality 5
  node scripts/workflow-metrics.mjs fingerprint

Codex rollout and Claude transcript JSONL are best-effort telemetry sources,
not billing. Project hooks automatically mark delivered turns and ended
sessions; requester outcomes and quality remain optional enrichment.
`);
}

function expandHome(value) {
  if (value === "~") return homedir();
  if (value?.startsWith("~/")) return path.join(homedir(), value.slice(2));
  return value;
}

function parseArgs(argv) {
  const [command, ...rawRest] = argv;
  const rest = command === "task" && new Set(["start", "status", "receipt"]).has(rawRest[0])
    ? ["--task-action", rawRest[0], ...rawRest.slice(1)]
    : command === "stage" && new Set(["start", "bind", "finish"]).has(rawRest[0])
      ? ["--stage-action", rawRest[0], ...rawRest.slice(1)]
      : command === "criterion" && rawRest[0] === "record"
        ? ["--criterion-action", rawRest[0], ...rawRest.slice(1)]
        : command === "artifact" && new Set(["bind", "verify"]).has(rawRest[0])
          ? ["--artifact-action", rawRest[0], ...rawRest.slice(1)]
    : rawRest;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, name) {
  if (!options[name]) throw new Error(`Missing --${name}`);
  return options[name];
}

function numeric(options, name, { integer = false, min = 0, max } = {}) {
  if (options[name] === undefined) return undefined;
  const value = Number(options[name]);
  if (!Number.isFinite(value) || value < min || (max !== undefined && value > max)) {
    throw new Error(`Invalid --${name}`);
  }
  if (integer && !Number.isInteger(value)) throw new Error(`--${name} must be an integer`);
  return value;
}

function booleanValue(options, name) {
  if (options[name] === undefined) return undefined;
  if (options[name] === "true") return true;
  if (options[name] === "false") return false;
  throw new Error(`--${name} must be true or false`);
}

function safeText(value, name) {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length > 160) throw new Error(`--${name} must be 160 characters or fewer`);
  return normalized;
}

function safeKey(value, name) {
  const normalized = safeText(value, name);
  if (!/^[A-Za-z0-9._:/-]+$/.test(normalized)) {
    throw new Error(`Invalid characters in --${name}`);
  }
  return normalized;
}

function isStoredSafeKey(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._:/-]+$/.test(value);
}

function isCanonicalAgentPath(value) {
  return isStoredSafeKey(value) && /^\/root(?:\/[A-Za-z0-9._-]+)+$/.test(value);
}

function validStageDisposition(status, outcome) {
  if (status === "completed") return new Set(["pass", "changes-required", "unknown"]).has(outcome);
  if (status === "skipped") return outcome === "not-applicable";
  return new Set(["blocked", "unknown"]).has(outcome);
}

function stagePathFor(stages) {
  return [...stages]
    .sort((left, right) => left.sequence - right.sequence)
    .map((stage) => stage.name)
    .join(" > ");
}

function pathsFor(options) {
  const root = path.resolve(expandHome(options.root ?? process.cwd()));
  return {
    root,
    sessions: path.resolve(expandHome(options.sessions ?? path.join(homedir(), ".codex", "sessions"))),
    claudeSessions: path.resolve(expandHome(options["claude-sessions"] ?? path.join(homedir(), ".claude", "projects"))),
    annotations: path.resolve(expandHome(options.annotations ?? path.join(root, "metrics", "workflow-annotations.jsonl"))),
    accountAnalytics: path.resolve(expandHome(options["account-analytics"] ?? path.join(root, "metrics", "account-analytics.local.json")))
  };
}

const routingProfiles = new Set([
  "user-selected", "single-luna", "single-terra", "single-sol-high", "hybrid-v3", "hybrid-v3-fallback"
]);
const delegationModes = new Set(["single", "fan-out"]);
const stageExecutors = new Set(["coordinator", "delegate"]);
const stageContextModes = new Set(["none", "bounded", "full", "forked", "unknown"]);
const stageStatuses = new Set(["completed", "blocked", "failed", "skipped"]);
const stageOutcomes = new Set(["pass", "changes-required", "blocked", "unknown", "not-applicable"]);
const stageProviders = new Set(["codex", "claude", "unknown"]);
const stageAccessModes = new Set(["read", "write"]);
const spawnFailureReasons = new Set(["spawn-failed", "spawn-rejected"]);
const evidenceBearingStageClasses = new Set(["verification", "review", "challenge", "readback"]);
const singleProfileModels = {
  "single-luna": "gpt-5.6-luna",
  "single-terra": "gpt-5.6-terra",
  "single-sol-high": "gpt-5.6-sol"
};

function normalizeRoutingProfile(value, model, legacy = false) {
  if (!value) return undefined;
  if (routingProfiles.has(value)) return value;
  if (!legacy) throw new Error("Invalid --routing-profile");
  if (value === "single-sol") return "single-sol-high";
  if (value === "hybrid-v2") return "hybrid-v3";
  if (value === "serial") {
    return Object.entries(singleProfileModels).find(([, expected]) => expected === model)?.[0] ?? "unknown";
  }
  return "unknown";
}

function routingProfile(options, name = "routing-profile") {
  return options[name] && normalizeRoutingProfile(safeKey(options[name], name), undefined);
}

function positiveInteger(options, name) {
  const value = numeric(options, name, { integer: true, min: 1 });
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

function nonNegativeInteger(options, name) {
  return numeric(options, name, { integer: true, min: 0 });
}

function delegationMode(options) {
  const mode = options["delegation-mode"] ?? "single";
  if (!delegationModes.has(mode)) throw new Error("Invalid --delegation-mode");
  return mode;
}

function safeKeyList(value, name) {
  const values = value?.split(",").map((item) => safeKey(item, name)).filter(Boolean) ?? [];
  if (!values.length) throw new Error(`Missing --${name}`);
  if (new Set(values).size !== values.length) throw new Error(`--${name} must not contain duplicates`);
  return values;
}

function fullCommitSha(value, name) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error(`--${name} must be one full Git commit SHA`);
  return value;
}

async function loadRegistry(root) {
  const file = path.join(root, "workflows", "registry.json");
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Workflow registry is unavailable: ${error.message}`);
  }
  const safeList = (value) => Array.isArray(value) && value.length > 0 && value.every(isStoredSafeKey) &&
    new Set(value).size === value.length;
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion < 1 ||
    !safeList(registry.taskTypes) || !safeList(registry.stageClasses) ||
    !safeList(registry.verificationClasses) || !registry.routes || !registry.workflows ||
    typeof registry.routes !== "object" || typeof registry.workflows !== "object") {
    throw new Error("Workflow registry has an invalid top-level schema");
  }
  const stageClasses = new Set(registry.stageClasses);
  const taskTypes = new Set(registry.taskTypes);
  for (const [routeId, route] of Object.entries(registry.routes)) {
    if (!isStoredSafeKey(routeId) || !safeList(route.taskTypes) || !safeList(route.allowedStageClasses) ||
      !Array.isArray(route.risks) || route.risks.length === 0 ||
      route.risks.some((risk) => !Number.isInteger(risk) || risk < 0 || risk > 3) ||
      new Set(route.risks).size !== route.risks.length ||
      !safeList(route.requiredForPassed) ||
      !route.requiredByRisk || typeof route.requiredByRisk !== "object" ||
      typeof route.requiresRemoteArtifact !== "boolean" ||
      route.taskTypes.some((value) => !taskTypes.has(value)) ||
      route.allowedStageClasses.some((value) => !stageClasses.has(value)) ||
      route.requiredForPassed.some((value) => !stageClasses.has(value) || !route.allowedStageClasses.includes(value)) ||
      Object.entries(route.requiredByRisk).some(([risk, values]) =>
        !new Set(["0", "1", "2", "3"]).has(risk) || !route.risks.includes(Number(risk)) ||
        !Array.isArray(values) ||
        values.some((value) => !stageClasses.has(value) || !route.allowedStageClasses.includes(value))) ||
      route.risks.some((risk) => requiredStageClassesFor(route, risk).some((stageClass) =>
        stageClassPrerequisites({ requiredStageClasses: requiredStageClassesFor(route, risk) }, stageClass)
          .some((prerequisite) => !route.allowedStageClasses.includes(prerequisite)))) ||
      (route.requiresRemoteArtifact &&
        !["publication", "readback"].every((value) => route.requiredForPassed.includes(value)))) {
      throw new Error(`Workflow registry route ${routeId} is invalid`);
    }
  }
  for (const [workflowId, routeId] of Object.entries(registry.workflows)) {
    if (!isStoredSafeKey(workflowId) || !registry.routes[routeId] || !workflowId.endsWith(`-${routeId}`)) {
      throw new Error(`Workflow registry entry ${workflowId} is invalid`);
    }
  }
  return registry;
}

function workflowDefinition(registry, workflowId) {
  const routeId = registry.workflows[workflowId];
  if (!routeId) throw new Error(`Unknown --workflow: ${workflowId}`);
  return { routeId, ...registry.routes[routeId] };
}

function requiredStageClassesFor(definition, risk) {
  return [...new Set([
    ...definition.requiredForPassed,
    ...(definition.requiredByRisk[String(risk)] ?? [])
  ])];
}

function stageClassPrerequisites(logical, stageClass) {
  if (stageClass === "implementation") return ["preflight"];
  if (stageClass === "verification") {
    return [logical.requiredStageClasses.includes("implementation") ? "implementation" : "preflight"];
  }
  if (stageClass === "publication") return ["review"];
  if (stageClass === "readback") return ["publication"];
  return [];
}

function latestStagesByClass(logical) {
  const latest = new Map();
  for (const stage of [...logical.stages.values()].sort((left, right) => left.sequence - right.sequence)) {
    latest.set(stage.stageClass, stage);
  }
  return latest;
}

function completedPassingStageClasses(logical) {
  return new Set([...latestStagesByClass(logical)]
    .filter(([, stage]) => stage.finish?.status === "completed" && stage.finish.outcome === "pass")
    .map(([stageClass]) => stageClass));
}

function logicalReadiness(logical) {
  const latestStages = latestStagesByClass(logical);
  const completedClasses = completedPassingStageClasses(logical);
  const missingClasses = logical.requiredStageClasses.filter((stageClass) => !completedClasses.has(stageClass));
  const incompleteCriteria = logical.criteria.filter((criterionId) =>
    !new Set(["passed", "not-applicable"]).has(logical.criterionEvidence.get(criterionId)?.state));
  const artifactStates = logical.artifactRepos.map((repo) => {
    const binding = logical.artifacts.filter((artifact) => artifact.repo === repo).at(-1);
    const verification = binding && logical.artifactVerifications
      .filter((artifact) => artifact.artifactId === binding.artifactId).at(-1);
    const readback = latestStages.get("readback");
    const proofIsCurrent = !logical.requiresRemoteArtifact || Boolean(readback &&
      Date.parse(verification?.timestamp) >= Date.parse(readback.timestamp));
    return {
      repo,
      bound: Boolean(binding),
      remoteVerified: Boolean(proofIsCurrent && binding?.clean && verification?.remoteVerified &&
        verification.remoteSha === binding.headSha),
      remote: verification?.remote ?? null,
      remoteRef: verification?.remoteRef ?? null
    };
  });
  return {
    missingClasses,
    incompleteCriteria,
    artifactStates,
    remoteArtifactVerified: artifactStates.length > 0 && artifactStates.every((artifact) => artifact.remoteVerified)
  };
}

async function appendEvent(options, event) {
  const { annotations } = pathsFor(options);
  await fs.mkdir(path.dirname(annotations), { recursive: true });
  await fs.appendFile(annotations, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

function parseLockOwner(contents) {
  try {
    const owner = JSON.parse(contents);
    if (typeof owner.token !== "string" || !Number.isInteger(owner.pid) || !Number.isFinite(owner.createdAtMs)) {
      return null;
    }
    return owner;
  } catch {
    return null;
  }
}

async function readLockOwner(file) {
  try {
    return parseLockOwner(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readLockSnapshot(file) {
  let handle;
  try {
    handle = await fs.open(file, "r");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    const [contents, stats] = await Promise.all([handle.readFile("utf8"), handle.stat()]);
    return { owner: parseLockOwner(contents), stats };
  } finally {
    await handle.close();
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function removeOwnedLock(file, token, identity) {
  const [owner, stats] = await Promise.all([
    readLockOwner(file),
    fs.stat(file).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))
  ]);
  if (!stats || (identity && (stats.dev !== identity.dev || stats.ino !== identity.ino)) ||
    (owner !== null && owner.token !== token)) return false;
  await fs.rm(file, { force: true });
  return true;
}

async function pauseBeforeLockPublicationForTest(target, temporary) {
  const lockKind = target.endsWith(".recovery") ? "recovery" : "primary";
  const signal = process.env.CVO_METRICS_TEST_PREPUBLISH_SIGNAL;
  const release = process.env.CVO_METRICS_TEST_PREPUBLISH_RELEASE;
  if (process.env.CVO_METRICS_TEST_PAUSE_LOCK !== lockKind || !signal || !release) return;
  try {
    await fs.writeFile(signal, `${JSON.stringify({ target, temporary })}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  const deadline = Date.now() + 5_000;
  while (!existsSync(release)) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for lock publication test release");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function publishOwnedLock(file, token) {
  const temporary = `${file}.owner-${process.pid}-${token}`;
  let handle;
  let identity;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    identity = await handle.stat();
    await handle.writeFile(`${JSON.stringify({ token, pid: process.pid, createdAtMs: Date.now() })}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await pauseBeforeLockPublicationForTest(file, temporary);
    try {
      await fs.link(temporary, file);
      return identity;
    } catch (error) {
      if (error.code === "EEXIST") return null;
      throw error;
    }
  } finally {
    await handle?.close();
    await removeOwnedLock(temporary, token, identity);
  }
}

async function recoverStaleLockFile(file) {
  const snapshot = await readLockSnapshot(file);
  if (!snapshot) return true;
  const { owner, stats } = snapshot;
  const ageMs = Date.now() - (owner?.createdAtMs ?? stats.mtimeMs);
  if (ageMs < staleLedgerLockMs || (owner && processIsAlive(owner.pid))) return false;

  const quarantine = `${file}.orphan-${randomUUID()}`;
  try {
    await fs.rename(file, quarantine);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
  const quarantined = await fs.stat(quarantine);
  if (quarantined.dev !== stats.dev || quarantined.ino !== stats.ino) {
    return false;
  }
  await fs.rm(quarantine, { force: true });
  return true;
}

async function recoverOrphanedLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  const recoveryToken = randomUUID();
  let recoveryIdentity;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    recoveryIdentity = await publishOwnedLock(recoveryPath, recoveryToken);
    if (recoveryIdentity) break;
    if (attempt === 1 || !(await recoverStaleLockFile(recoveryPath))) return false;
  }
  try {
    return await recoverStaleLockFile(lockPath);
  } finally {
    await removeOwnedLock(recoveryPath, recoveryToken, recoveryIdentity);
  }
}

async function withLedgerLock(options, operation) {
  const { annotations } = pathsFor(options);
  await fs.mkdir(path.dirname(annotations), { recursive: true });
  const lockPath = `${annotations}.lock`;
  const token = randomUUID();
  let lockIdentity;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    lockIdentity = await publishOwnedLock(lockPath, token);
    if (lockIdentity) break;
    if (await recoverOrphanedLock(lockPath)) continue;
    if (attempt === 49) throw new Error("Workflow ledger is busy");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  try {
    return await operation();
  } finally {
    await removeOwnedLock(lockPath, token, lockIdentity);
  }
}

async function appendAnnotation(options) {
  const allowedStatuses = new Set(["complete", "blocked", "abandoned"]);
  const allowedVerification = new Set(["passed", "partial", "failed", "not-run"]);
  if (options.status && !allowedStatuses.has(options.status)) throw new Error("Invalid --status");
  if (options.verification && !allowedVerification.has(options.verification)) {
    throw new Error("Invalid --verification");
  }
  const event = {
    schemaVersion,
    event: "annotation",
    taskKey: options["task-key"] && safeKey(options["task-key"], "task-key"),
    logicalTaskId: options["task-id"] && safeKey(options["task-id"], "task-id"),
    timestamp: new Date().toISOString(),
    workflowVersion: options["workflow-version"] && safeKey(options["workflow-version"], "workflow-version"),
    workflowFingerprint: options["workflow-fingerprint"] && safeKey(options["workflow-fingerprint"], "workflow-fingerprint"),
    workflowId: options.workflow && safeKey(options.workflow, "workflow"),
    repo: options.repo && safeKey(options.repo, "repo"),
    taskType: options["task-type"] && safeKey(options["task-type"], "task-type"),
    risk: numeric(options, "risk", { integer: true, min: 0, max: 3 }),
    model: options.model && safeKey(options.model, "model"),
    routingProfile: routingProfile(options),
    status: options.status,
    accepted: booleanValue(options, "accepted"),
    verification: options.verification,
    quality: numeric(options, "quality", { integer: true, min: 1, max: 5 }),
    estimatedCostUsd: numeric(options, "estimated-cost-usd"),
    preDeliveryFixRounds: numeric(options, "pre-delivery-fix-rounds", { integer: true }),
    fixRounds: numeric(options, "fix-rounds", { integer: true }),
    userCorrections: numeric(options, "user-corrections", { integer: true }),
    mustFixFindings: numeric(options, "must-fix-findings", { integer: true }),
    escapedDefects: numeric(options, "escaped-defects", { integer: true }),
    notes: safeText(options.notes, "notes")
  };
  if (!!event.taskKey === !!event.logicalTaskId) throw new Error("Provide exactly one of --task-key or --task-id");
  Object.keys(event).forEach((key) => event[key] === undefined && delete event[key]);
  if (Object.keys(event).length <= 4) throw new Error("Provide at least one annotation field");
  if (event.logicalTaskId) {
    const mutableFields = new Set([
      "quality", "estimatedCostUsd", "preDeliveryFixRounds", "userCorrections", "mustFixFindings", "escapedDefects", "notes"
    ]);
    const suppliedFields = Object.keys(event).filter(
      (key) => !new Set(["schemaVersion", "event", "logicalTaskId", "timestamp"]).has(key)
    );
    if (suppliedFields.some((key) => !mutableFields.has(key))) {
      throw new Error("Logical-task classification and outcomes are immutable; annotate quality counters or notes only");
    }
    const { annotations } = pathsFor(options);
    if (!((await loadMetadata(annotations)).logicalTasks.has(event.logicalTaskId))) {
      throw new Error("Unknown logical task");
    }
  }
  await appendEvent(options, event);
  if (!options.suppressOutput) process.stdout.write(`${event.logicalTaskId ?? event.taskKey}\n`);
}

async function workflowFingerprint(root) {
  let contextRevision;
  try {
    const expectedContextRevision = (await fs.readFile(path.join(root, "AI_CONTEXT_REVISION"), "utf8")).trim();
    if (!/^[0-9a-f]{40}$/.test(expectedContextRevision)) throw new Error("invalid optional context revision");
    const { stdout: actualContextRevision } = await execFileAsync(
      "git",
      ["-C", path.join(root, "ai-context"), "rev-parse", "HEAD"],
      { encoding: "utf8" }
    );
    const { stdout: contextStatus } = await execFileAsync(
      "git",
      ["-C", path.join(root, "ai-context"), "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" }
    );
    if (actualContextRevision.trim() === expectedContextRevision && !contextStatus.trim()) {
      contextRevision = expectedContextRevision;
    }
  } catch {
    contextRevision = undefined;
  }
  const files = [
    ".gitignore",
    ".claude/settings.json",
    ".codex/hooks.json",
    "AGENTS.md",
    "CLAUDE.md",
    "WORKFLOW_VERSION",
    "README.md",
    "metrics/.gitignore",
    "metrics/README.md",
  ];
  try {
    await fs.access(path.join(root, ".codex/config.toml"));
    files.push(".codex/config.toml");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const directoryRules = new Map([
    ["workflows", (relative) => relative.endsWith(".md") || relative.endsWith(".json")],
    ["agents", (relative) => relative.endsWith(".md") || path.basename(relative) === "manifest.json"],
    ["skills", (relative) => path.basename(relative) === "SKILL.md"],
    ["scripts", () => true],
    [".claude/agents", (relative) => relative.endsWith(".md")],
    [".codex/agents", (relative) => relative.endsWith(".toml")]
  ]);
  async function visit(relativeDirectory, include) {
    let entries;
    try {
      entries = await fs.readdir(path.join(root, relativeDirectory), { withFileTypes: true });
    } catch (error) {
      // A project that only partially adopts this scaffold (e.g. a global,
      // cross-project root) may be missing any of these directories entirely.
      // Hash whatever subset actually exists rather than hard-failing.
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) await visit(relative, include);
      else if (entry.isFile() && include(relative)) files.push(relative);
    }
  }
  for (const [directory, include] of directoryRules) await visit(directory, include);
  const hash = createHash("sha256");
  for (const relative of files.sort()) {
    let contents;
    try {
      contents = await fs.readFile(path.join(root, relative));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    hash.update(relative);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  if (contextRevision) {
    hash.update("ai-context\0");
    hash.update(contextRevision);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function readHookInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new Error("Hook input is empty");
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Hook input is not valid JSON");
  }
}

function boundedText(value, max = 160) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function optionalSafeKey(value, name) {
  if (!value) return undefined;
  try {
    return safeKey(value, name);
  } catch {
    return undefined;
  }
}

function parseWorkflowReceipt(message) {
  if (typeof message !== "string") return {};
  const prefix = /^\s*(?:[-+>]\s+)?(?:\*\*|__|`)?(?:Workflow|Pipeline) receipt(?:\s+\(metadata\))?(?:\*\*|__|`)?\s*:?\s*/i;
  const lines = message.split(/\r?\n/);
  const receiptLineIndex = lines.findIndex((candidate) => prefix.test(candidate));
  if (receiptLineIndex === -1) return {};

  const receipt = { receiptPresent: true };
  const applyPart = (part) => {
    let match;
    if ((match = part.match(/^(?:workflow|pipeline):\s*(.+)$/i))) receipt.workflowId = optionalSafeKey(match[1], "workflow");
    else if ((match = part.match(/^path:\s*(.+)$/i))) receipt.workflowPath = boundedText(match[1], maxWorkflowPathLength);
    else if ((match = part.match(/^risk:?\s+([0-3])$/i))) receipt.risk = Number(match[1]);
    else if ((match = part.match(/^delegation:?\s+(single|fan-out)$/i))) receipt.delegationMode = match[1].toLowerCase();
    else if ((match = part.match(/^stages:?\s+(\d+)\/(\d+)$/i))) {
      receipt.completedStages = Number(match[1]);
      receipt.totalStages = Number(match[2]);
    }
    else if ((match = part.match(/^verification:?\s+(?:(?:✅|⚠️?|❌|•)\s*)?(passed|partial|failed|not-run)(?:(?:\/(\d+))|(?:\s+\((\d+)\s+checks?\)))?$/i))) {
      receipt.verification = match[1].toLowerCase();
      const checks = match[2] ?? match[3];
      if (checks !== undefined) receipt.verificationChecks = Number(checks);
    } else if ((match = part.match(/^task:?\s+(.+)$/i))) {
      receipt.taskLabel = boundedText(match[1]);
      if (/^lt-[A-Za-z0-9-]+$/.test(match[1])) receipt.logicalTaskId = match[1];
    }
  };

  const inlineBody = lines[receiptLineIndex].replace(prefix, "");
  if (inlineBody) return {};
  let sawField = false;
  for (const line of lines.slice(receiptLineIndex + 1)) {
    const part = line.trim();
    if (!part) continue;
    if (/^━+$/.test(part)) {
      if (sawField) break;
      continue;
    }
    if (!/^(?:workflow|pipeline|path|stages|delegation|task|risk|verification):/i.test(part)) continue;
    applyPart(part);
    sawField = true;
  }

  Object.keys(receipt).forEach((key) => receipt[key] === undefined && delete receipt[key]);
  return receipt;
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function hookFingerprint(root) {
  try {
    return { workflowFingerprint: await workflowFingerprint(root), fingerprintStatus: "recorded" };
  } catch (error) {
    process.stderr.write(`CVO metrics fingerprint unavailable: ${boundedText(error.message)}\n`);
    return { fingerprintStatus: "unavailable" };
  }
}

async function recordHook(options) {
  const eventName = required(options, "event");
  if (!new Set(["stop", "session-end"]).has(eventName)) throw new Error("Invalid --event");
  const provider = options.provider ?? "codex";
  if (!new Set(["codex", "claude"]).has(provider)) throw new Error("Invalid --provider");
  const payload = await readHookInput();
  const root = path.resolve(options.root ?? scriptRoot);
  const hookOptions = { ...options, root };
  const sessionId = safeKey(required({ "session-id": payload.session_id }, "session-id"), "session-id");
  const model = optionalSafeKey(payload.model, "model");
  const timestamp = new Date().toISOString();

  if (eventName === "stop") {
    const observedTurnId = provider === "claude" ? payload.prompt_id : payload.turn_id;
    const turnId = safeKey(required({ "turn-id": observedTurnId }, "turn-id"), "turn-id");
    const receipt = parseWorkflowReceipt(payload.last_assistant_message);
    const workflowVersion = boundedText(await readOptionalFile(path.join(root, "WORKFLOW_VERSION")));
    await appendEvent(hookOptions, {
      schemaVersion,
      event: "automatic_delivery",
      provider,
      taskKey: `${sessionId}:${turnId}`,
      sessionId,
      turnId,
      timestamp,
      status: "delivered",
      model,
      workflowVersion,
      ...await hookFingerprint(root),
      ...receipt
    });
  } else {
    await appendEvent(hookOptions, {
      schemaVersion,
      event: "automatic_session_end",
      provider,
      sessionId,
      timestamp,
      model,
      reason: boundedText(payload.reason)
    });
    return unscoredTaskWarning(hookOptions, sessionId);
  }
}

async function unscoredTaskWarning(hookOptions, sessionId) {
  try {
    const metadata = await loadLifecycleMetadata(hookOptions);
    const unscored = [...metadata.logicalTasks.values()].filter((task) => task.rootSessionId === sessionId &&
      !task.outcome && !currentLogicalDelivery(task) && ![...task.stages.values()].some((stage) => !stage.finish));
    if (!unscored.length) return undefined;
    const ids = unscored.map((task) => task.logicalTaskId).join(", ");
    const message = boundedText(
      `CVO metrics: ${unscored.length} logical task(s) finished with no outcome recorded before session end: ${ids}. ` +
      "Run `task outcome` (correct/blocked/abandoned) for each, or it auto-closes as abandoned when the next task starts."
    );
    process.stderr.write(`${message}\n`);
    return message;
  } catch (error) {
    process.stderr.write(`CVO metrics unscored-task check unavailable: ${boundedText(error.message)}\n`);
    return undefined;
  }
}

async function runHook(options) {
  try {
    const lockOptions = { ...options, root: path.resolve(options.root ?? scriptRoot) };
    const warning = await withLedgerLock(lockOptions, () => recordHook(options));
    process.stdout.write(`${JSON.stringify(warning ? { continue: true, systemMessage: warning } : { continue: true })}\n`);
  } catch (error) {
    const message = boundedText(`CVO metrics hook failed: ${error.message}`);
    process.stderr.write(`${message}\n`);
    process.stdout.write(`${JSON.stringify({ continue: true, systemMessage: message })}\n`);
  }
}

async function listJsonl(root, sinceMs) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EACCES") return;
      throw error;
    }
    await Promise.all(entries.map(async (entry) => {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(item);
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return;
      const stats = await fs.stat(item);
      if (stats.mtimeMs >= sinceMs) files.push(item);
    }));
  }
  await visit(root);
  return files.sort();
}

function turnId(payload) {
  return payload.turn_id ?? payload.internal_chat_message_metadata_passthrough?.turn_id ?? null;
}

async function parseRollout(file) {
  const result = { file, meta: null, events: [], malformed: 0 };
  let activeTurnId = null;
  const responseIds = new Set();
  const nativeUsageTurns = new Set();
  const lines = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      result.malformed += 1;
      continue;
    }
    const timestampMs = Date.parse(record.timestamp ?? "");
    const payload = record.payload ?? {};
    if (record.type === "session_meta" && !result.meta) {
      result.meta = {
        id: payload.id ?? null,
        startedAtMs: timestampMs,
        sessionId: payload.session_id ?? payload.id ?? null,
        parentThreadId: payload.parent_thread_id ?? payload.source?.subagent?.thread_spawn?.parent_thread_id ?? null,
        agentPath: payload.agent_path ?? payload.source?.subagent?.thread_spawn?.agent_path ?? "/root",
        cwd: payload.cwd ? path.resolve(payload.cwd) : null
      };
      continue;
    }
    if (record.type === "turn_context") {
      activeTurnId = payload.turn_id ?? activeTurnId;
      result.events.push({ kind: "context", timestampMs, turnId: payload.root_turn_id ?? payload.turn_id, model: payload.model ?? null, effort: payload.effort ?? null });
      continue;
    }
    if (record.type === "token_usage_record" && payload.usage && payload.response_id && payload.turn_id) {
      const responseKey = `${payload.thread_id ?? result.meta?.id}:${payload.response_id}`;
      if (!responseIds.has(responseKey)) {
        responseIds.add(responseKey);
        nativeUsageTurns.add(payload.turn_id);
        result.events.push({ kind: "usage", timestampMs,
          turnId: payload.root_turn_id ?? payload.turn_id, source: "token_usage_record",
          usage: payload.usage });
      }
      continue;
    }
    if (record.type === "event_msg") {
      if (payload.type === "task_started" || payload.type === "task_complete") {
        activeTurnId = payload.turn_id ?? activeTurnId;
        result.events.push({
          kind: payload.type,
          timestampMs,
          turnId: payload.turn_id,
          durationMs: payload.duration_ms ?? null,
          timeToFirstTokenMs: payload.time_to_first_token_ms ?? null,
          receipt: payload.type === "task_complete" ? parseWorkflowReceipt(payload.last_agent_message) : undefined
        });
      } else if (payload.type === "token_count" && payload.info?.last_token_usage) {
        result.events.push({ kind: "usage", timestampMs, sourceTurnId: activeTurnId, source: "token_count", usage: payload.info.last_token_usage });
      } else if (payload.type === "item_completed" && payload.item?.type === "CommandExecution") {
        const exitCode = Number.isInteger(payload.item.exit_code)
          ? payload.item.exit_code
          : null;
        result.events.push({
          kind: "command",
          timestampMs,
          turnId: payload.turn_id,
          exitCode,
          failed: payload.item.status === "failed" ||
            (exitCode !== null && exitCode !== 0)
        });
      }
      continue;
    }
    if (record.type === "response_item" && payload.name) {
      const name = payload.name ?? "unknown";
      let argumentsValue = {};
      try {
        argumentsValue = JSON.parse(payload.arguments ?? payload.input ?? "{}");
      } catch {
        argumentsValue = {};
      }
      result.events.push({
        kind: name.endsWith("spawn_agent") ? "spawn" : name.endsWith("followup_task") ? "followup" : "tool",
        timestampMs,
        turnId: turnId(payload),
        forkTurns: argumentsValue.fork_turns ?? null,
        requestedModel: argumentsValue.model ?? null,
        requestedReasoningEffort: argumentsValue.reasoning_effort ?? null
      });
    }
  }
  // New records and legacy token_count events can describe the same response.
  // Prefer the response-ID source for each native turn; retain older turns as a fallback.
  result.events = result.events.filter((event) => event.source !== "token_count" ||
    !nativeUsageTurns.has(event.sourceTurnId));
  return result;
}

function claudeHumanPrompt(content) {
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.some((block) => block?.type !== "tool_result");
}

async function parseClaudeTranscript(file) {
  const result = {
    file,
    meta: null,
    events: [],
    malformed: 0,
    isSubagent: file.includes(`${path.sep}subagents${path.sep}`)
  };
  let activePromptId = null;
  const seenPrompts = new Set();
  const lines = readline.createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      result.malformed += 1;
      continue;
    }
    const timestampMs = Date.parse(record.timestamp ?? "");
    if (!result.meta && record.sessionId) {
      result.meta = {
        sessionId: record.sessionId,
        startedAtMs: null,
        cwd: record.cwd ? path.resolve(record.cwd) : null,
        isSubagent: result.isSubagent || record.isSidechain === true,
        agentKey: result.isSubagent
          ? createHash("sha256").update(file).digest("hex").slice(0, 12)
          : null
      };
    }
    const cwd = record.cwd ? path.resolve(record.cwd) : result.meta?.cwd;
    if (record.type === "user") {
      const content = record.message?.content;
      if (record.promptId) activePromptId = record.promptId;
      if (!result.isSubagent && record.promptId && claudeHumanPrompt(content)) {
        if (record.parentUuid === null && result.meta && !result.meta.isSubagent) {
          result.meta.startedAtMs ??= timestampMs;
        }
        if (!seenPrompts.has(activePromptId)) {
          seenPrompts.add(activePromptId);
          result.events.push({ kind: "prompt_start", timestampMs, promptId: activePromptId, cwd });
        }
      }
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type !== "tool_result") continue;
          result.events.push({
            kind: "tool_result",
            timestampMs,
            promptId: record.promptId ?? activePromptId,
            toolUseId: block.tool_use_id ?? null,
            failed: block.is_error === true,
            cwd
          });
        }
      }
      continue;
    }
    if (record.type === "assistant") {
      result.events.push({
        kind: "assistant",
        timestampMs,
        promptId: activePromptId,
        messageId: record.message?.id ?? null,
        model: record.message?.model ?? null,
        usage: record.message?.usage ?? null,
        content: Array.isArray(record.message?.content) ? record.message.content : [],
        cwd
      });
      continue;
    }
    if (record.type === "system" && record.subtype === "turn_duration" && activePromptId) {
      result.events.push({
        kind: "task_complete",
        timestampMs,
        promptId: activePromptId,
        durationMs: Number.isFinite(record.durationMs) ? record.durationMs : null,
        cwd
      });
    }
  }
  return result;
}

function initializeClaudeTracking(task) {
  task._claudeMessageIds ??= new Set();
  task._claudeToolUseIds ??= new Set();
  task._claudeToolNames ??= new Map();
  task._claudeAgentCallsByMessage ??= new Map();
  task._claudeSpawnLabels ??= new Set();
  task._claudeObservedSubagents ??= new Set();
}

function applyClaudeEvent(task, event, agentKey = null) {
  initializeClaudeTracking(task);
  const agentPrefix = agentKey ?? "root";
  if (agentKey) task._claudeObservedSubagents.add(agentKey);
  if (event.kind === "assistant") {
    if (agentKey) {
      if (event.model) task.delegatedModels.add(event.model);
    } else {
      task.model ??= event.model;
      if (event.model) task.modelSource = "claude-assistant-message";
      if (task.timeToFirstTokenMs === null && Number.isFinite(event.timestampMs)) {
        task.timeToFirstTokenMs = Math.max(0, event.timestampMs - task.startedAtMs);
      }
    }
    const messageKey = `${agentPrefix}:${event.messageId ?? event.timestampMs}`;
    if (!task._claudeMessageIds.has(messageKey) && event.usage) {
      task._claudeMessageIds.add(messageKey);
      const directInput = event.usage.input_tokens ?? 0;
      const cacheCreation = event.usage.cache_creation_input_tokens ?? 0;
      const cacheRead = event.usage.cache_read_input_tokens ?? 0;
      const output = event.usage.output_tokens ?? 0;
      task.usageEvents += 1;
      if (!task.usageSources.includes("claude-assistant-message")) task.usageSources.push("claude-assistant-message");
      task.inputTokens += directInput + cacheCreation + cacheRead;
      task.cachedInputTokens += cacheRead;
      task.outputTokens += output;
      task.reasoningOutputTokens += event.usage.output_tokens_details?.thinking_tokens ?? 0;
      task.totalTokens += directInput + cacheCreation + cacheRead + output;
    }
    for (const block of event.content) {
      if (block?.type !== "tool_use" || !block.id) continue;
      const toolKey = `${agentPrefix}:${block.id}`;
      if (task._claudeToolUseIds.has(toolKey)) continue;
      task._claudeToolUseIds.add(toolKey);
      task._claudeToolNames.set(toolKey, block.name ?? "unknown");
      task.toolCalls += 1;
      if (block.name === "Bash") task.commandCalls += 1;
      if (!agentKey && block.name === "Agent") {
        const role = optionalSafeKey(block.input?.subagent_type, "subagent-type") ?? "subagent";
        task.requestedDelegateRoutes.add(`claude:${role}`);
        if (block.input?.resume) {
          task.followups += 1;
        } else {
          task.boundedHistorySpawns += 1;
          const label = `claude:${role}:${task._claudeSpawnLabels.size + 1}`;
          task._claudeSpawnLabels.add(label);
          const count = (task._claudeAgentCallsByMessage.get(messageKey) ?? 0) + 1;
          task._claudeAgentCallsByMessage.set(messageKey, count);
        }
      }
    }
    return;
  }
  if (event.kind === "tool_result" && event.failed) {
    task.toolFailures += 1;
    const toolKey = `${agentPrefix}:${event.toolUseId}`;
    if (task._claudeToolNames.get(toolKey) === "Bash") {
      task.commandFailureExitCodes.set("unknown", (task.commandFailureExitCodes.get("unknown") ?? 0) + 1);
    }
  }
}

function finalizeClaudeTask(task) {
  initializeClaudeTracking(task);
  const requestedLabels = [...task._claudeSpawnLabels];
  task.specialistAgents.clear();
  for (let index = 0; index < task._claudeObservedSubagents.size; index += 1) {
    task.specialistAgents.add(requestedLabels[index] ?? `claude:subagent-observed:${index + 1}`);
  }
  const batchSizes = [...task._claudeAgentCallsByMessage.values()];
  task.parallelAgentBatches = batchSizes.filter((count) => count > 1).length;
  task.maxParallelAgents = batchSizes.length ? Math.max(...batchSizes) : 0;
  for (const key of Object.keys(task).filter((name) => name.startsWith("_claude"))) delete task[key];
  return task;
}

function buildClaudeTasks(transcripts, root, sinceMs, registeredSessions = new Set()) {
  const rootSessions = new Set(transcripts
    .filter((transcript) => !transcript.meta?.isSubagent &&
      (registeredSessions.has(transcript.meta?.sessionId) || inWorkspace(transcript.meta?.cwd, root) || transcript.events.some((event) => inWorkspace(event.cwd, root))))
    .map((transcript) => transcript.meta.sessionId));
  const scoped = transcripts.filter((transcript) => rootSessions.has(transcript.meta?.sessionId));
  const tasks = new Map();
  const bySession = new Map();
  for (const transcript of scoped.filter((candidate) => !candidate.meta.isSubagent)) {
    for (const event of transcript.events) {
      if (event.kind !== "prompt_start") continue;
      const task = newTask(transcript.meta.sessionId, event.promptId, "claude");
      task.startedAtMs = event.timestampMs;
      task.malformedLines += transcript.malformed;
      tasks.set(task.taskKey, task);
      const values = bySession.get(task.sessionId) ?? [];
      values.push(task);
      bySession.set(task.sessionId, values);
    }
  }
  for (const values of bySession.values()) values.sort((a, b) => a.startedAtMs - b.startedAtMs);
  for (const transcript of scoped) {
    const values = bySession.get(transcript.meta.sessionId) ?? [];
    for (const event of transcript.events) {
      if (event.kind === "prompt_start") continue;
      const direct = event.promptId
        ? tasks.get(`${transcript.meta.sessionId}:${event.promptId}`)
        : null;
      const task = direct ?? nearestTask(values, event.timestampMs);
      if (!task) continue;
      if (event.kind === "task_complete" && !transcript.meta.isSubagent) {
        task.complete = true;
        task.completedAtMs = event.timestampMs;
        task.durationMs = event.durationMs ?? task.completedAtMs - task.startedAtMs;
      } else {
        applyClaudeEvent(task, event, transcript.meta.isSubagent ? transcript.meta.agentKey : null);
      }
    }
    if (transcript.meta.isSubagent) {
      for (const task of values) task.malformedLines += transcript.malformed;
    }
  }
  return [...tasks.values()]
    .map(finalizeClaudeTask)
    .filter((task) => task.startedAtMs >= sinceMs);
}

function newTask(sessionId, turnId, provider = "codex") {
  return {
    taskKey: `${sessionId}:${turnId}`,
    sessionId,
    turnId,
    provider,
    startedAtMs: null,
    completedAtMs: null,
    durationMs: null,
    timeToFirstTokenMs: null,
    complete: false,
    model: null,
    delegatedModels: new Set(),
    requestedDelegateRoutes: new Set(),
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    usageEvents: 0,
    usageSources: [],
    modelSource: null,
    reasoningEffort: null,
    toolCalls: 0,
    commandCalls: 0,
    toolFailures: 0,
    commandFailureExitCodes: new Map(),
    specialistAgents: new Set(),
    fullHistorySpawns: 0,
    boundedHistorySpawns: 0,
    parallelAgentBatches: 0,
    maxParallelAgents: 0,
    followups: 0,
    malformedLines: 0,
    annotation: {}
  };
}

function nearestTask(tasks, timestampMs) {
  let candidate = null;
  for (const task of tasks) {
    if (task.startedAtMs === null || task.startedAtMs > timestampMs) continue;
    if (!candidate || task.startedAtMs > candidate.startedAtMs) candidate = task;
  }
  return candidate;
}

function applyEvent(task, event, agentPath) {
  if (event.kind === "context" && event.model) {
    if (agentPath === "/root") {
      task.model = event.model;
      task.modelSource = "codex-turn-context";
      task.reasoningEffort = event.effort ?? null;
    }
    else task.delegatedModels.add(event.model);
  }
  if (event.kind === "usage") {
    task.usageEvents += 1;
    if (event.source && !task.usageSources.includes(event.source)) task.usageSources.push(event.source);
    task.inputTokens += event.usage.input_tokens ?? 0;
    task.cachedInputTokens += event.usage.cached_input_tokens ?? 0;
    task.outputTokens += event.usage.output_tokens ?? 0;
    task.reasoningOutputTokens += event.usage.reasoning_output_tokens ?? 0;
    task.totalTokens += event.usage.total_tokens ?? 0;
    if (agentPath !== "/root") task.specialistAgents.add(agentPath);
  } else if (event.kind === "command") {
    task.commandCalls += 1;
    if (event.failed) {
      task.toolFailures += 1;
      const bucket = event.exitCode === null ? "unknown" : String(event.exitCode);
      task.commandFailureExitCodes.set(
        bucket,
        (task.commandFailureExitCodes.get(bucket) ?? 0) + 1
      );
    }
  } else if (event.kind === "tool") {
    task.toolCalls += 1;
  } else if (event.kind === "spawn") {
    task.toolCalls += 1;
    if (event.requestedModel) {
      task.requestedDelegateRoutes.add(
        event.requestedReasoningEffort
          ? `${event.requestedModel}:${event.requestedReasoningEffort}`
          : event.requestedModel
      );
    }
    if (event.forkTurns === "all" || event.forkTurns === null) task.fullHistorySpawns += 1;
    else task.boundedHistorySpawns += 1;
  } else if (event.kind === "followup") {
    task.toolCalls += 1;
    task.followups += 1;
  }
}

function mergeCounts(target, source) {
  for (const [key, count] of source) target.set(key, (target.get(key) ?? 0) + count);
  return target;
}

function buildRuns(tasks) {
  const runsBySession = new Map();
  for (const task of tasks) {
    const runKey = `${task.provider}:${task.sessionId}`;
    const run = runsBySession.get(runKey) ?? {
      runId: task.sessionId,
      provider: task.provider,
      startedAtMs: task.startedAtMs,
      completedAtMs: null,
      tasks: [],
      complete: true,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      toolFailures: 0,
      commandFailureExitCodes: new Map(),
      specialistAgents: new Set(),
      fullHistorySpawns: 0,
      boundedHistorySpawns: 0,
      parallelAgentBatches: 0,
      maxParallelAgents: 0,
      followups: 0
    };
    run.tasks.push(task.taskKey);
    run.startedAtMs = Math.min(run.startedAtMs, task.startedAtMs);
    run.completedAtMs = Math.max(run.completedAtMs ?? 0, task.completedAtMs ?? 0) || null;
    run.complete &&= task.complete;
    run.inputTokens += task.inputTokens;
    run.cachedInputTokens += task.cachedInputTokens;
    run.outputTokens += task.outputTokens;
    run.reasoningOutputTokens += task.reasoningOutputTokens;
    run.totalTokens += task.totalTokens;
    run.toolCalls += task.toolCalls;
    run.toolFailures += task.toolFailures;
    mergeCounts(run.commandFailureExitCodes, task.commandFailureExitCodes);
    for (const agent of task.specialistAgents) run.specialistAgents.add(agent);
    run.fullHistorySpawns += task.fullHistorySpawns;
    run.boundedHistorySpawns += task.boundedHistorySpawns;
    run.parallelAgentBatches += task.parallelAgentBatches;
    run.maxParallelAgents = Math.max(run.maxParallelAgents, task.maxParallelAgents);
    run.followups += task.followups;
    runsBySession.set(runKey, run);
  }
  return [...runsBySession.values()].sort((a, b) => a.startedAtMs - b.startedAtMs);
}

function inWorkspace(cwd, root) {
  return cwd === root || cwd?.startsWith(`${root}${path.sep}`);
}

function buildTasks(rollouts, root, sinceMs, registeredSessions = new Set()) {
  const scoped = rollouts.filter((rollout) => rollout.meta &&
    (inWorkspace(rollout.meta.cwd, root) || registeredSessions.has(rollout.meta.sessionId)));
  const tasks = new Map();
  const bySession = new Map();
  for (const rollout of scoped) {
    if (rollout.meta.parentThreadId) continue;
    for (const event of rollout.events) {
      if (!new Set(["task_started", "task_complete"]).has(event.kind) || !event.turnId) continue;
      const key = `${rollout.meta.sessionId}:${event.turnId}`;
      const task = tasks.get(key) ?? newTask(rollout.meta.sessionId, event.turnId);
      if (event.kind === "task_started") task.startedAtMs = event.timestampMs;
      else {
        task.complete = true;
        task.completedAtMs = event.timestampMs;
        task.durationMs = event.durationMs ?? task.durationMs;
        task.timeToFirstTokenMs = event.timeToFirstTokenMs ?? task.timeToFirstTokenMs;
      }
      tasks.set(key, task);
    }
  }
  for (const task of tasks.values()) {
    const values = bySession.get(task.sessionId) ?? [];
    values.push(task);
    bySession.set(task.sessionId, values);
  }
  for (const values of bySession.values()) values.sort((a, b) => a.startedAtMs - b.startedAtMs);
  for (const rollout of scoped) {
    const values = bySession.get(rollout.meta.sessionId) ?? [];
    for (const event of rollout.events) {
      if (event.kind === "task_started" || event.kind === "task_complete") continue;
      const direct = event.turnId ? tasks.get(`${rollout.meta.sessionId}:${event.turnId}`) : null;
      const task = direct ?? nearestTask(values, event.timestampMs);
      if (task) applyEvent(task, event, rollout.meta.agentPath);
    }
    for (const task of values) task.malformedLines += rollout.malformed;
  }
  return [...tasks.values()].filter((task) => task.startedAtMs >= sinceMs);
}

async function loadMetadata(file) {
  const attempts = new Map();
  const logicalTasks = new Map();
  const automaticDeliveries = new Map();
  const sessionEnds = new Map();
  if (!existsSync(file)) return { attempts, logicalTasks, automaticDeliveries, sessionEnds };
  const lines = (await fs.readFile(file, "utf8")).split("\n").filter(Boolean);
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`Malformed annotation JSON at ${file}:${index + 1}`);
    }
    if (!supportedSchemaVersions.has(event.schemaVersion)) {
      throw new Error(`Unsupported workflow annotation schema at ${file}:${index + 1}`);
    }
    if (event.event === "automatic_delivery") {
      event.provider ??= "codex";
      const deliveredAt = Date.parse(event.timestamp);
      const expectedKey = `${event.sessionId}:${event.turnId}`;
      const hasValidVerification = event.verification === undefined ||
        (new Set(["passed", "partial", "failed", "not-run"]).has(event.verification) &&
          (event.verification === "not-run"
            ? event.verificationChecks === undefined || event.verificationChecks === 0
            : Number.isInteger(event.verificationChecks) && event.verificationChecks > 0));
      if (!event.taskKey || event.taskKey !== expectedKey || event.status !== "delivered" ||
        !Number.isFinite(deliveredAt) || !new Set(["recorded", "unavailable"]).has(event.fingerprintStatus) ||
        !new Set(["codex", "claude"]).has(event.provider) ||
        !hasValidVerification || (event.delegationMode && !delegationModes.has(event.delegationMode)) ||
        (event.completedStages !== undefined && (!Number.isInteger(event.completedStages) ||
          !Number.isInteger(event.totalStages) || event.completedStages < 0 ||
          event.totalStages < event.completedStages)) ||
        (event.risk !== undefined && (!Number.isInteger(event.risk) || event.risk < 0 || event.risk > 3))) {
        throw new Error(`Invalid automatic delivery at ${file}:${index + 1}`);
      }
      automaticDeliveries.set(event.taskKey, event);
      continue;
    }
    if (event.event === "automatic_session_end") {
      event.provider ??= "codex";
      if (!event.sessionId || !new Set(["codex", "claude"]).has(event.provider) ||
        !Number.isFinite(Date.parse(event.timestamp))) {
        throw new Error(`Invalid automatic session end at ${file}:${index + 1}`);
      }
      const key = `${event.provider}:${event.sessionId}`;
      if (Date.parse(event.timestamp) >= Date.parse(sessionEnds.get(key)?.timestamp ?? "1970-01-01")) sessionEnds.set(key, event);
      continue;
    }
    if (event.event === "logical_task_started") {
      if (!event.logicalTaskId || !event.rootSessionId || logicalTasks.has(event.logicalTaskId)) {
        throw new Error(`Invalid or duplicate logical task at ${file}:${index + 1}`);
      }
      const startedAt = Date.parse(event.timestamp);
      const profile = normalizeRoutingProfile(event.routingProfile, event.model, true);
      const hasPreflight = Number.isInteger(event.acceptanceChecks) && event.acceptanceChecks > 0 &&
        Number.isInteger(event.evidenceClasses) && event.evidenceClasses > 0 &&
        delegationModes.has(event.delegationMode ?? "single");
      const hasCriterionContract = Array.isArray(event.criteria) && event.criteria.length === event.acceptanceChecks &&
        event.criteria.length > 0 && event.criteria.every(isStoredSafeKey) &&
        new Set(event.criteria).size === event.criteria.length && Number.isInteger(event.registryVersion) &&
        event.registryVersion > 0 && isStoredSafeKey(event.routeId) &&
        Array.isArray(event.allowedStageClasses) && event.allowedStageClasses.length > 0 &&
        event.allowedStageClasses.every(isStoredSafeKey) &&
        new Set(event.allowedStageClasses).size === event.allowedStageClasses.length &&
        Array.isArray(event.requiredStageClasses) && event.requiredStageClasses.length > 0 &&
        event.requiredStageClasses.every((value) => event.allowedStageClasses.includes(value)) &&
        new Set(event.requiredStageClasses).size === event.requiredStageClasses.length &&
        Array.isArray(event.verificationClasses) && event.verificationClasses.length > 0 &&
        event.verificationClasses.every(isStoredSafeKey) &&
        new Set(event.verificationClasses).size === event.verificationClasses.length &&
        typeof event.requiresRemoteArtifact === "boolean" && Array.isArray(event.artifactRepos) &&
        event.artifactRepos.every(isStoredSafeKey) &&
        new Set(event.artifactRepos).size === event.artifactRepos.length &&
        (!event.requiresRemoteArtifact || event.artifactRepos.length > 0);
      if (![event.timestamp, event.workflowVersion, event.workflowFingerprint, event.workflowId, event.repo, event.taskType, profile].every(Boolean) ||
        !Number.isFinite(startedAt) || !Number.isInteger(event.risk) || event.risk < 0 || event.risk > 3 || profile === "unknown" ||
        (event.schemaVersion >= 6 && (!hasPreflight || (event.delegationMode === "fan-out" && event.evidenceClasses < 2))) ||
        (event.schemaVersion >= 13 && !hasCriterionContract)) {
        throw new Error(`Invalid logical task at ${file}:${index + 1}`);
      }
      logicalTasks.set(event.logicalTaskId, {
        ...event,
        routingProfile: profile,
        annotations: new Map(),
        deliveries: [],
        stages: new Map(),
        criterionEvidence: new Map(),
        artifacts: [],
        artifactVerifications: [],
        feedback: [],
        interactions: new Map(),
        outcome: null
      });
      continue;
    }
    if (event.event === "logical_task_stage_started") {
      const task = logicalTasks.get(event.logicalTaskId);
      const startedAt = Date.parse(event.timestamp);
      const duplicateSequence = task && [...task.stages.values()].some((stage) => stage.sequence === event.sequence);
      const stageSchema = event.schemaVersion >= 10;
      const ownedStage = event.schemaVersion >= 11;
      const candidateStagePath = task && stagePathFor([...task.stages.values(), event]);
      const completedClasses = task?.schemaVersion >= 13 ? completedPassingStageClasses(task) : new Set();
      const missingPrerequisites = task?.schemaVersion >= 13 && isStoredSafeKey(event.stageClass)
        ? stageClassPrerequisites(task, event.stageClass).filter((value) => !completedClasses.has(value))
        : [];
      const enforcedStage = task?.schemaVersion >= 15;
      const duplicateObjective = enforcedStage && [...task.stages.values()]
        .some((stage) => !stage.finish && stage.objectiveId === event.objectiveId);
      const dependenciesPass = !enforcedStage || (Array.isArray(event.dependsOn) && event.dependsOn.every((stageId) => {
        const dependency = task.stages.get(stageId);
        return dependency?.finish?.status === "completed" && dependency.finish.outcome === "pass";
      }));
      const activeWrite = enforcedStage && event.access === "write" && [...logicalTasks.values()].some((logical) =>
        !logical.outcome && [...logical.stages.values()].some((stage) => !stage.finish && stage.access === "write"));
      const activeDelegates = enforcedStage && event.executor === "delegate"
        ? [...logicalTasks.values()].reduce((count, logical) => count + (logical.outcome ? 0 :
          [...logical.stages.values()].filter((stage) => !stage.finish && stage.executor === "delegate").length), 0)
        : 0;
      const parallelCount = enforcedStage && event.parallelGroup
        ? [...task.stages.values()].filter((stage) => stage.parallelGroup === event.parallelGroup).length
        : 0;
      const parallelOwnerMismatch = enforcedStage && event.parallelGroup && [...task.stages.values()]
        .some((stage) => stage.parallelGroup === event.parallelGroup &&
          stage.fanInOwner !== event.fanInOwner);
      if (!task || task.outcome || !isStoredSafeKey(event.stageId) || task.stages.has(event.stageId) ||
        !isStoredSafeKey(event.name) || !isStoredSafeKey(event.role) ||
        !stageExecutors.has(event.executor) || !stageContextModes.has(event.contextMode) ||
        (event.executor === "coordinator" && event.contextMode !== "none") ||
        !stageProviders.has(event.provider ?? "unknown") ||
        !Number.isInteger(event.sequence) || event.sequence < 1 || duplicateSequence ||
        (event.parallelGroup !== undefined && !isStoredSafeKey(event.parallelGroup)) ||
        (event.requestedModel !== undefined && !isStoredSafeKey(event.requestedModel)) ||
        (stageSchema && (!stageProviders.has(event.provider) || !isStoredSafeKey(event.requestedModel))) ||
        (ownedStage && event.rootSessionId !== task.rootSessionId) ||
        (event.schemaVersion >= 12 && candidateStagePath.length > maxWorkflowPathLength) ||
        (task.schemaVersion >= 13 && (!isStoredSafeKey(event.stageClass) ||
          !task.allowedStageClasses.includes(event.stageClass) || missingPrerequisites.length > 0)) ||
        (enforcedStage && (!isStoredSafeKey(event.objectiveId) || !isStoredSafeKey(event.scope) ||
          !stageAccessModes.has(event.access) || !Array.isArray(event.dependsOn) ||
          event.dependsOn.some((value) => !isStoredSafeKey(value)) ||
          new Set(event.dependsOn).size !== event.dependsOn.length ||
          event.completionSignal !== "stage-report-v1" || event.fanInOwner !== "/root" ||
          duplicateObjective || !dependenciesPass || activeWrite || activeDelegates >= 4 || parallelCount >= 4)) ||
        parallelOwnerMismatch ||
        !Number.isFinite(startedAt) || startedAt < Date.parse(task.timestamp)) {
        throw new Error(`Invalid logical task stage start at ${file}:${index + 1}`);
      }
      task.stages.set(event.stageId, { ...event, provider: event.provider ?? "unknown", binding: null, finish: null });
      continue;
    }
    if (event.event === "logical_task_stage_bound") {
      const task = logicalTasks.get(event.logicalTaskId);
      const stage = task?.stages.get(event.stageId);
      const boundAt = Date.parse(event.timestamp);
      const activeBindingReuse = task?.schemaVersion >= 15 && [...logicalTasks.values()].some((logical) =>
        !logical.outcome && [...logical.stages.values()].some((candidate) => !candidate.finish && candidate.binding &&
          ((logical.rootSessionId === task.rootSessionId && candidate.binding.agentPath === event.agentPath) ||
            (event.providerRunId !== undefined && candidate.binding.providerRunId === event.providerRunId))));
      if (!task || task.outcome || task.schemaVersion < 15 || !stage || stage.finish || stage.binding ||
        stage.executor !== "delegate" || event.rootSessionId !== task.rootSessionId ||
        event.provider !== stage.provider || !isCanonicalAgentPath(event.agentPath) ||
        (event.providerRunId !== undefined && !isStoredSafeKey(event.providerRunId)) || activeBindingReuse ||
        !Number.isFinite(boundAt) || boundAt < Date.parse(stage.timestamp)) {
        throw new Error(`Invalid logical task stage binding at ${file}:${index + 1}`);
      }
      stage.binding = event;
      continue;
    }
    if (event.event === "logical_task_stage_finished") {
      const task = logicalTasks.get(event.logicalTaskId);
      const stage = task?.stages.get(event.stageId);
      const finishedAt = Date.parse(event.timestamp);
      const stageSchema = event.schemaVersion >= 10;
      const ownedStage = event.schemaVersion >= 11;
      const requiresEvidence = task?.schemaVersion >= 13 && stage && evidenceBearingStageClasses.has(stage.stageClass) &&
        event.status === "completed" && event.outcome === "pass";
      const enforcedDelegate = task?.schemaVersion >= 15 && stage?.executor === "delegate";
      const allowedUnboundFailure = enforcedDelegate && !stage.binding && event.status === "failed" &&
        event.outcome === "unknown" && spawnFailureReasons.has(event.failureReason);
      const validFailureReason = event.failureReason === undefined || allowedUnboundFailure;
      if (!task || task.outcome || !stage || stage.finish ||
        !stageStatuses.has(event.status) || !stageOutcomes.has(event.outcome) ||
        !validStageDisposition(event.status, event.outcome) ||
        (event.verificationChecks !== undefined && (!Number.isInteger(event.verificationChecks) || event.verificationChecks < 0)) ||
        (event.findings !== undefined && (!Number.isInteger(event.findings) || event.findings < 0)) ||
        (event.observedModel !== undefined && !isStoredSafeKey(event.observedModel)) ||
        (event.agentPath !== undefined && !isStoredSafeKey(event.agentPath)) ||
        (event.handoff !== undefined && !isStoredSafeKey(event.handoff)) ||
        (requiresEvidence && (!Number.isInteger(event.verificationChecks) || event.verificationChecks < 1)) ||
        (stageSchema && (
          !Number.isInteger(event.verificationChecks) || !Number.isInteger(event.findings) ||
          !isStoredSafeKey(event.observedModel) || !isStoredSafeKey(event.handoff))) ||
        (ownedStage && (event.rootSessionId !== task.rootSessionId ||
          !isStoredSafeKey(event.agentPath))) ||
        (task?.schemaVersion >= 15 && event.reportReadback !== undefined && typeof event.reportReadback !== "boolean") ||
        !validFailureReason ||
        (enforcedDelegate && !stage.binding && !allowedUnboundFailure) ||
        (enforcedDelegate && stage.binding && event.agentPath !== stage.binding.agentPath) ||
        (enforcedDelegate && event.status === "completed" && (!stage.binding || event.reportReadback !== true)) ||
        !Number.isFinite(finishedAt) || finishedAt < Date.parse(stage.timestamp)) {
        throw new Error(`Invalid logical task stage finish at ${file}:${index + 1}`);
      }
      stage.finish = event;
      continue;
    }
    if (event.event === "logical_task_criterion_recorded") {
      const task = logicalTasks.get(event.logicalTaskId);
      const recordedAt = Date.parse(event.timestamp);
      if (!task || task.outcome || !task.criteria?.includes(event.criterionId) ||
        !new Set(["passed", "failed", "blocked", "unknown", "not-applicable"]).has(event.state) ||
        !isStoredSafeKey(event.verificationClass) || !task.verificationClasses?.includes(event.verificationClass) ||
        !isStoredSafeKey(event.artifact) ||
        event.rootSessionId !== task.rootSessionId || !Number.isFinite(recordedAt) ||
        recordedAt < Date.parse(task.timestamp)) {
        throw new Error(`Invalid logical task criterion record at ${file}:${index + 1}`);
      }
      task.criterionEvidence.set(event.criterionId, event);
      continue;
    }
    if (event.event === "logical_task_artifact_bound") {
      const task = logicalTasks.get(event.logicalTaskId);
      const recordedAt = Date.parse(event.timestamp);
      if (!task || task.outcome || !/^[0-9a-f]{64}$/.test(event.artifactId) ||
        !isStoredSafeKey(event.repo) || !task.artifactRepos?.includes(event.repo) ||
        !/^[0-9a-f]{40}$/.test(event.baseSha) || !/^[0-9a-f]{40}$/.test(event.headSha) ||
        !/^[0-9a-f]{64}$/.test(event.dirtyPatchSha256) || typeof event.clean !== "boolean" ||
        event.artifactId !== artifactIdFor(event.repo, event) ||
        event.rootSessionId !== task.rootSessionId || !Number.isFinite(recordedAt) ||
        recordedAt < Date.parse(task.timestamp)) {
        throw new Error(`Invalid logical task artifact binding at ${file}:${index + 1}`);
      }
      task.artifacts.push(event);
      continue;
    }
    if (event.event === "logical_task_artifact_verified") {
      const task = logicalTasks.get(event.logicalTaskId);
      const binding = task?.artifacts.find((artifact) => artifact.artifactId === event.artifactId);
      const recordedAt = Date.parse(event.timestamp);
      if (!task || task.outcome || !binding || event.repo !== binding.repo ||
        typeof event.remoteVerified !== "boolean" ||
        (event.remoteSha !== undefined && !/^[0-9a-f]{40}$/.test(event.remoteSha)) ||
        event.remoteVerified !== (event.remoteSha !== undefined) ||
        (event.remoteVerified && event.remoteSha !== binding.headSha) ||
        (event.remoteVerified && (!isStoredSafeKey(event.remote) || !isStoredSafeKey(event.remoteRef))) ||
        (!event.remoteVerified && (event.remote !== undefined || event.remoteRef !== undefined)) ||
        event.rootSessionId !== task.rootSessionId || !Number.isFinite(recordedAt) ||
        recordedAt < Date.parse(binding.timestamp)) {
        throw new Error(`Invalid logical task artifact verification at ${file}:${index + 1}`);
      }
      task.artifactVerifications.push(event);
      continue;
    }
    if (event.event === "logical_task_interaction") {
      const task = logicalTasks.get(event.logicalTaskId);
      if (!task || event.rootSessionId !== task.rootSessionId ||
        !isStoredSafeKey(event.turnId) || !interactionKinds.has(event.kind) ||
        !Number.isFinite(Date.parse(event.timestamp)) || Date.parse(event.timestamp) < Date.parse(task.timestamp) ||
        task.interactions.has(event.turnId)) throw new Error(`Invalid interaction at ${file}:${index + 1}`);
      task.interactions.set(event.turnId, event);
      continue;
    }
    if (event.event === "logical_task_feedback") {
      const task = logicalTasks.get(event.logicalTaskId);
      const feedbackAt = Date.parse(event.timestamp);
      const reopensCorrectOutcome = task?.outcome?.result === "correct";
      const previousAt = task?.outcome?.timestamp ?? task?.feedback.at(-1)?.timestamp ?? task?.timestamp;
      const hasVerificationEvidence = event.verification === "not-run"
        ? event.verificationChecks === undefined
        : Number.isInteger(event.verificationChecks) && event.verificationChecks > 0;
      const hasValidQuality = event.quality === undefined ||
        (Number.isInteger(event.quality) && event.quality >= 1 && event.quality <= 5);
      if (!task || (task.outcome && !reopensCorrectOutcome) || event.result !== "changes-needed" ||
        (event.turnId !== undefined && !isStoredSafeKey(event.turnId)) ||
        !new Set(["passed", "partial", "failed", "not-run"]).has(event.verification) ||
        (event.schemaVersion >= 6 && !hasVerificationEvidence) ||
        !hasValidQuality ||
        !Number.isFinite(feedbackAt) || feedbackAt < Date.parse(previousAt) ||
        !Number.isInteger(event.fixRounds) || event.fixRounds !== task.feedback.length + 1 ||
        !Number.isInteger(event.userCorrections) || event.userCorrections !== task.feedback.length + 1) {
        throw new Error(`Invalid logical task feedback at ${file}:${index + 1}`);
      }
      task.feedback.push(event);
      if (reopensCorrectOutcome) task.outcome = null;
      continue;
    }
    if (event.event === "logical_task_outcome") {
      const task = logicalTasks.get(event.logicalTaskId);
      if (!task || task.outcome) throw new Error(`Invalid or duplicate logical task outcome at ${file}:${index + 1}`);
      const completedAt = Date.parse(event.timestamp);
      const previousAt = task.feedback.at(-1)?.timestamp ?? task.timestamp;
      const expectedStatus = { correct: "complete", blocked: "blocked", abandoned: "abandoned" }[event.result];
      const expectedAccepted = event.result === "correct" ? true : event.result === "blocked" ? false : undefined;
      const hasVerificationEvidence = event.verification === "not-run"
        ? event.verificationChecks === undefined
        : Number.isInteger(event.verificationChecks) && event.verificationChecks > 0;
      const hasValidQuality = event.quality === undefined ||
        (Number.isInteger(event.quality) && event.quality >= 1 && event.quality <= 5);
      const acceptanceInteraction = task.interactions.get(event.turnId);
      const priorDeliveries = [...automaticDeliveries.values()].filter((delivery) =>
        delivery.logicalTaskId === task.logicalTaskId && delivery.sessionId === task.rootSessionId);
      const acceptedDelivery = currentLogicalDelivery({ ...task, deliveries: priorDeliveries });
      const hasAcceptance = event.result !== "correct" || event.schemaVersion < 16 || Boolean(
        acceptanceInteraction?.kind === "acceptance" && acceptedDelivery &&
        Date.parse(acceptanceInteraction.timestamp) >= Date.parse(acceptedDelivery.timestamp)
      );
      const hasOpenStage = [...task.stages.values()].some((stage) => !stage.finish);
      const readiness = task.schemaVersion >= 13 ? logicalReadiness(task) : undefined;
      if (!new Set(["correct", "blocked", "abandoned"]).has(event.result) ||
        !new Set(["complete", "blocked", "abandoned"]).has(event.status) ||
        !new Set(["passed", "partial", "failed", "not-run"]).has(event.verification) ||
        !Number.isFinite(completedAt) || completedAt < Date.parse(previousAt) ||
        event.status !== expectedStatus || event.accepted !== expectedAccepted ||
        (event.schemaVersion >= 6 && !hasVerificationEvidence) ||
        !hasValidQuality ||
        !hasAcceptance ||
        (event.result === "abandoned" && event.verification !== "not-run") ||
        (task.schemaVersion >= 13 && event.result === "correct" &&
          (event.verification !== "passed" || readiness.missingClasses.length > 0 ||
            readiness.incompleteCriteria.length > 0 ||
            (task.requiresRemoteArtifact && !readiness.remoteArtifactVerified))) ||
        hasOpenStage ||
        event.fixRounds !== task.feedback.length ||
        event.userCorrections !== (task.feedback.length || undefined)) {
        throw new Error(`Invalid logical task outcome at ${file}:${index + 1}`);
      }
      task.outcome = event;
      continue;
    }
    if (event.event !== "annotation") continue;
    const key = event.taskKey ?? event.logicalTaskId;
    if (!key) continue;
    const target = event.logicalTaskId ? logicalTasks.get(event.logicalTaskId)?.annotations : attempts;
    if (!target) throw new Error(`Unknown logical task at ${file}:${index + 1}`);
    const current = target.get(key) ?? {};
    const merged = { ...current, ...event };
    if (merged.routingProfile) merged.routingProfile = normalizeRoutingProfile(merged.routingProfile, merged.model, true);
    merged.userCorrections = Math.max(current.userCorrections ?? 0, event.userCorrections ?? 0);
    merged.mustFixFindings = Math.max(current.mustFixFindings ?? 0, event.mustFixFindings ?? 0);
    merged.escapedDefects = Math.max(current.escapedDefects ?? 0, event.escapedDefects ?? 0);
    target.set(key, merged);
  }
  for (const delivery of automaticDeliveries.values()) {
    const task = delivery.logicalTaskId && logicalTasks.get(delivery.logicalTaskId);
    if (task && task.rootSessionId === delivery.sessionId) task.deliveries.push(delivery);
  }
  for (const task of logicalTasks.values()) {
    task.deliveries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  }
  return { attempts, logicalTasks, automaticDeliveries, sessionEnds };
}

function enrichCodexMetadata(metadata, rollouts) {
  for (const rollout of rollouts) {
    if (!rollout.meta) continue;
    const sessionId = rollout.meta.sessionId;
    if (!rollout.meta.parentThreadId) for (const event of rollout.events) {
      if (event.kind !== "task_complete" || !event.turnId || !event.receipt?.logicalTaskId) continue;
      const item = metadata.logicalTasks.get(event.receipt.logicalTaskId);
      if (!item || item.rootSessionId !== sessionId) continue;
      const taskKey = `${sessionId}:${event.turnId}`;
      if (metadata.automaticDeliveries.has(taskKey)) continue;
      const delivery = { ...event.receipt, provider: "codex", source: "codex-transcript",
        sessionId, turnId: event.turnId, taskKey, status: "delivered",
        timestamp: new Date(event.timestampMs).toISOString(), fingerprintStatus: "unavailable" };
      // Derive delivery only from a completed response with this task's exact receipt.
      // Keep this separate from hook history; neither source establishes user acceptance.
      const stages = [...item.stages.values()].filter((stage) => Date.parse(stage.timestamp) <= event.timestampMs);
      if (delivery.workflowId !== item.workflowId || delivery.workflowPath !== stagePathFor(stages) ||
        delivery.totalStages !== stages.length || stages.some((stage) => !stage.finish || Date.parse(stage.finish.timestamp) > event.timestampMs) ||
        delivery.completedStages !== stages.filter((stage) => stage.finish.status === "completed").length ||
        !new Set(["passed", "partial", "failed", "not-run"]).has(delivery.verification) ||
        !Number.isInteger(delivery.verificationChecks) || delivery.verificationChecks < (delivery.verification === "not-run" ? 0 : 1)) continue;
      metadata.automaticDeliveries.set(taskKey, delivery);
      item.deliveries.push(delivery);
    }
  }
  for (const item of metadata.logicalTasks.values()) {
    item.deliveries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    for (const stage of item.stages.values()) {
      if (stage.provider !== "codex" || stage.finish?.failureReason) continue;
      const agentPath = stage.binding?.agentPath ?? (stage.executor === "coordinator" ? "/root" : stage.finish?.agentPath);
      const start = Date.parse(stage.timestamp);
      const end = stage.finish ? Date.parse(stage.finish.timestamp) : Date.now();
      const contexts = rollouts.filter((rollout) => rollout.meta?.sessionId === item.rootSessionId &&
        rollout.meta.agentPath === agentPath && (!stage.binding?.providerRunId || rollout.meta.id === stage.binding.providerRunId) &&
        rollout.events.some((event) => event.timestampMs >= start && event.timestampMs <= end))
        .flatMap((rollout) => {
          const events = rollout.events.filter((event) => event.kind === "context" && event.model && event.timestampMs <= end)
            .sort((a, b) => a.timestampMs - b.timestampMs);
          return [events.filter((event) => event.timestampMs <= start).at(-1), ...events.filter((event) => event.timestampMs > start)].filter(Boolean);
        });
      const models = [...new Set(contexts.map((event) => event.model))];
      stage.observedModels = models;
      stage.observedModel = models.length === 1 ? models[0] : models.length > 1 ? "multiple" : stage.finish?.observedModel ?? "unknown";
      stage.observedModelSource = models.length ? "codex-turn-context" : "stage-report";
    }
  }
}

async function readCodexRollouts(sessions, rootSessionIds) {
  const files = existsSync(sessions) ? (await listJsonl(sessions, 0)).filter((file) => {
    // Native filenames contain the thread ID. Keep nonstandard filenames for
    // imported logs, and always verify session metadata when parsing candidates.
    const id = path.basename(file).match(/^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i)?.[1];
    return !id || rootSessionIds.has(id);
  }) : [];
  const rollouts = [];
  const pending = [...files];
  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) {
      const file = pending.shift();
      if (file) rollouts.push(await parseRollout(file));
    }
  }));
  return rollouts;
}

async function loadLifecycleMetadata(options) {
  const { annotations, sessions } = pathsFor(options);
  const metadata = await loadMetadata(annotations);
  const roots = new Set([...metadata.logicalTasks.values()].map((item) => item.rootSessionId));
  if (roots.size) enrichCodexMetadata(metadata, await readCodexRollouts(sessions, roots));
  return metadata;
}

function currentLogicalDelivery(item) {
  const openStage = [...item.stages.values()].some((stage) => !stage.finish);
  if (openStage) return null;
  const stages = [...item.stages.values()].sort((left, right) => left.sequence - right.sequence);
  const stagePath = stagePathFor(stages);
  const completedStages = stages.filter((stage) => stage.finish?.status === "completed").length;
  const latestStageAt = [...item.stages.values()]
    .map((stage) => Date.parse(stage.finish?.timestamp ?? stage.timestamp))
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), 0);
  const interactionAt = [...item.interactions.values()]
    .filter((item) => item.kind !== "acceptance" && item.kind !== "new-work")
    .reduce((latest, item) => Math.max(latest, Date.parse(item.timestamp)), 0);
  const after = Math.max(Date.parse(item.feedback.at(-1)?.timestamp ?? item.timestamp), latestStageAt, interactionAt);
  return item.deliveries.filter((delivery) => Date.parse(delivery.timestamp) >= after &&
    (!stages.length || (delivery.workflowPath === stagePath &&
      delivery.completedStages === completedStages && delivery.totalStages === stages.length))).at(-1) ?? null;
}

function logicalTaskWindow(tasks, lifecycle, sinceMs) {
  const logical = [];
  for (const item of lifecycle.values()) {
    const start = Date.parse(item.timestamp);
    const delivery = currentLogicalDelivery(item);
    const outcomeAtMs = item.outcome ? Date.parse(item.outcome.timestamp) : null;
    const deliveredAtMs = delivery ? Date.parse(delivery.timestamp) : outcomeAtMs;
    const activityEnd = deliveredAtMs ?? Infinity;
    if ((outcomeAtMs ?? activityEnd) < sinceMs) continue;
    // `task start` runs inside the first tracked turn, after that turn's start event.
    // Include that still-active turn without pulling in a turn already complete at lifecycle start.
    const laterTaskStart = Math.min(...[...lifecycle.values()]
      .filter((candidate) => candidate.rootSessionId === item.rootSessionId && Date.parse(candidate.timestamp) > start)
      .map((candidate) => Date.parse(candidate.timestamp)));
    const attempts = tasks.filter((task) => task.sessionId === item.rootSessionId &&
      (task.startedAtMs >= start || (task.completedAtMs ?? Infinity) >= start) &&
      task.startedAtMs <= activityEnd && task.startedAtMs < laterTaskStart);
    const stages = [...item.stages.values()].sort((left, right) => left.sequence - right.sequence);
    const stagePath = stagePathFor(stages) || undefined;
    const quality = item.annotations.get(item.logicalTaskId) ?? {};
    const correctionCount = item.feedback.length;
    const criteriaTotal = item.criteria?.length ?? 0;
    const criteriaPassed = [...item.criterionEvidence.values()]
      .filter((criterion) => new Set(["passed", "not-applicable"]).has(criterion.state)).length;
    const readiness = item.schemaVersion >= 13 ? logicalReadiness(item) : undefined;
    const observedCorrections = Math.max(
      quality.userCorrections ?? 0,
      correctionCount,
      item.outcome?.userCorrections ?? 0
    );
    const annotation = {
      workflowVersion: item.workflowVersion,
      workflowFingerprint: item.workflowFingerprint,
      workflowId: item.workflowId,
      repo: item.repo,
      taskType: item.taskType,
      risk: item.risk,
      model: item.model,
      routingProfile: item.routingProfile,
      delegationMode: item.delegationMode,
      acceptanceChecks: item.acceptanceChecks,
      evidenceClasses: item.evidenceClasses,
      deliveryStatus: delivery ? "delivered" : undefined,
      workflowPath: delivery?.workflowPath,
      estimatedCostUsd: quality.estimatedCostUsd,
      preDeliveryFixRounds: quality.preDeliveryFixRounds,
      mustFixFindings: quality.mustFixFindings,
      escapedDefects: quality.escapedDefects,
      notes: quality.notes,
      fixRounds: correctionCount,
      verification: delivery?.verification,
      verificationChecks: delivery?.verificationChecks,
      ...(item.outcome ?? {}),
      quality: quality.quality ?? item.outcome?.quality ?? item.feedback.at(-1)?.quality,
      userCorrections: observedCorrections || undefined
    };
    Object.keys(annotation).forEach((key) => annotation[key] === undefined && delete annotation[key]);
    logical.push({
      logicalTaskId: item.logicalTaskId,
      rootSessionId: item.rootSessionId,
      provider: attempts.find((task) => task.provider)?.provider ?? delivery?.provider ?? "unknown",
      startedAtMs: start,
      completedAtMs: outcomeAtMs,
      complete: Boolean(item.outcome),
      durationMs: outcomeAtMs ? outcomeAtMs - start : null,
      delivered: Boolean(deliveredAtMs),
      deliveredAtMs,
      deliveryDurationMs: deliveredAtMs ? deliveredAtMs - start : null,
      attempts,
      attemptKeys: attempts.map((task) => task.taskKey),
      feedbackCount: correctionCount,
      interactions: [...item.interactions.values(), ...item.feedback.filter((event) => event.turnId)
        .map((event) => ({ turnId: event.turnId, kind: "correction", timestamp: event.timestamp }))],
      unidentifiedCorrections: item.feedback.filter((event) => !event.turnId).length,
      initialTurnIds: attempts.slice(0, 1).map((task) => task.turnId),
      criteriaTotal,
      criteriaPassed,
      artifactBound: readiness ? readiness.artifactStates.length > 0 &&
        readiness.artifactStates.every((artifact) => artifact.bound) : Boolean(item.artifacts.at(-1)),
      remoteArtifactVerified: readiness?.remoteArtifactVerified ??
        (item.artifactVerifications.at(-1)?.remoteVerified ?? false),
      stages,
      stagePath,
      stageCount: stages.length,
      completedStages: stages.filter((stage) => stage.finish?.status === "completed").length,
      blockedStages: stages.filter((stage) => new Set(["blocked", "failed"]).has(stage.finish?.status)).length,
      openStages: stages.filter((stage) => !stage.finish).length,
      delegatedStages: stages.filter((stage) => stage.executor === "delegate").length,
      parallelGroups: new Set(stages.map((stage) => stage.parallelGroup).filter(Boolean)),
      stageContextModes: new Set(stages.map((stage) => stage.contextMode)),
      stageProviders: new Set(stages.map((stage) => stage.provider)),
      stageRequestedModels: new Set(stages.map((stage) => stage.requestedModel).filter(Boolean)),
      stageObservedModels: new Set(stages.flatMap((stage) => stage.observedModels?.length ? stage.observedModels : [stage.finish?.observedModel]).filter(Boolean)),
      stageAgentPaths: new Set(stages.map((stage) => stage.finish?.agentPath).filter(Boolean)),
      stageVerificationChecks: stages.reduce((sum, stage) => sum + (stage.finish?.verificationChecks ?? 0), 0),
      stageFindings: stages.reduce((sum, stage) => sum + (stage.finish?.findings ?? 0), 0),
      stageDurationMs: stages.reduce((sum, stage) => {
        const finishedAt = Date.parse(stage.finish?.timestamp ?? "");
        const startedAt = Date.parse(stage.timestamp);
        return sum + (Number.isFinite(finishedAt) ? finishedAt - startedAt : 0);
      }, 0),
      annotation,
      model: attempts.find((task) => task.model)?.model ?? null,
      modelSource: attempts.find((task) => task.modelSource)?.modelSource ?? null,
      reasoningEffort: attempts.find((task) => task.reasoningEffort)?.reasoningEffort ?? null,
      usageStatus: attempts.some((task) => task.usageEvents > 0) ? "observed" : "unavailable",
      usageSources: [...new Set(attempts.flatMap((task) => task.usageSources))],
      deliverySource: delivery ? delivery.source ?? "provider-hook" : null,
      delegatedModels: new Set(attempts.flatMap((task) => [...task.delegatedModels])),
      requestedDelegateRoutes: new Set(attempts.flatMap((task) => [...task.requestedDelegateRoutes])),
      inputTokens: attempts.reduce((sum, task) => sum + task.inputTokens, 0),
      cachedInputTokens: attempts.reduce((sum, task) => sum + task.cachedInputTokens, 0),
      outputTokens: attempts.reduce((sum, task) => sum + task.outputTokens, 0),
      reasoningOutputTokens: attempts.reduce((sum, task) => sum + task.reasoningOutputTokens, 0),
      totalTokens: attempts.reduce((sum, task) => sum + task.totalTokens, 0),
      toolCalls: attempts.reduce((sum, task) => sum + task.toolCalls, 0),
      toolFailures: attempts.reduce((sum, task) => sum + task.toolFailures, 0),
      specialistAgents: new Set(attempts.flatMap((task) => [...task.specialistAgents])),
      fullHistorySpawns: attempts.reduce((sum, task) => sum + task.fullHistorySpawns, 0),
      boundedHistorySpawns: attempts.reduce((sum, task) => sum + task.boundedHistorySpawns, 0),
      parallelAgentBatches: attempts.reduce((sum, task) => sum + task.parallelAgentBatches, 0),
      maxParallelAgents: attempts.reduce((maximum, task) => Math.max(maximum, task.maxParallelAgents), 0),
      followups: attempts.reduce((sum, task) => sum + task.followups, 0),
      commandFailureExitCodes: attempts.reduce((counts, task) => mergeCounts(counts, task.commandFailureExitCodes), new Map())
    });
  }
  allocateSharedUsage(logical);
  return logical.sort((a, b) => a.startedAtMs - b.startedAtMs);
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function average(values) {
  const known = values.filter(Number.isFinite);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

function summarize(tasks) {
  const terminalFailures = new Set(["blocked", "abandoned"]);
  const completed = tasks.filter((task) => task.complete && !terminalFailures.has(task.annotation.status));
  const terminal = tasks.filter((task) => task.complete);
  const open = tasks.filter((task) =>
    !task.complete && !task.delivered && !task.automaticDelivery && !terminalFailures.has(task.annotation.status)
  );
  const automaticallyCaptured = tasks.filter((task) => task.automaticDelivery && task.automaticDelivery.source !== "codex-transcript");
  const delivered = tasks.filter((task) => task.delivered || task.automaticDelivery || task.complete);
  const awaitingOutcome = tasks.filter((task) => (task.delivered || task.automaticDelivery) && !task.complete);
  const acceptedKnown = completed.filter((task) => typeof task.annotation.accepted === "boolean");
  const terminalOutcomeKnown = terminal.filter((task) => typeof task.annotation.accepted === "boolean" || task.annotation.status === "abandoned");
  const terminalAcceptedKnown = terminal.filter((task) => typeof task.annotation.accepted === "boolean");
  const verificationKnown = completed.filter((task) => typeof task.annotation.verification === "string");
  const terminalVerificationKnown = terminal.filter((task) => typeof task.annotation.verification === "string");
  const qualityKnown = tasks.filter((task) => Number.isFinite(task.annotation.quality));
  const staged = tasks.filter((task) => Number.isInteger(task.stageCount) && task.stageCount > 0);
  const costKnown = completed.filter((task) => Number.isFinite(task.annotation.estimatedCostUsd));
  const fixRoundsKnown = completed.filter((task) => Number.isFinite(task.annotation.fixRounds));
  const preDeliveryFixRoundsKnown = terminal.filter((task) => Number.isFinite(task.annotation.preDeliveryFixRounds));
  const preflightKnown = completed.filter((task) =>
    Number.isInteger(task.annotation.acceptanceChecks) && task.annotation.acceptanceChecks > 0 &&
    Number.isInteger(task.annotation.evidenceClasses) && task.annotation.evidenceClasses > 0
  );
  const verificationEvidenceKnown = completed.filter((task) =>
    task.annotation.verification === "not-run" ||
    (Number.isInteger(task.annotation.verificationChecks) && task.annotation.verificationChecks > 0)
  );
  const firstPassKnown = completed.filter((task) =>
    typeof task.annotation.accepted === "boolean" && Number.isFinite(task.annotation.fixRounds)
  );
  const inputTotal = completed.reduce((sum, task) => sum + task.inputTokens, 0);
  const tokenTotals = {
    input: tasks.reduce((sum, task) => sum + task.inputTokens, 0),
    cachedInput: tasks.reduce((sum, task) => sum + task.cachedInputTokens, 0),
    output: tasks.reduce((sum, task) => sum + task.outputTokens, 0),
    reasoningOutput: tasks.reduce((sum, task) => sum + task.reasoningOutputTokens, 0),
    total: tasks.reduce((sum, task) => sum + task.totalTokens, 0)
  };
  return {
    tasks: tasks.length,
    completed: completed.length,
    terminal: terminal.length,
    open: open.length,
    automaticallyCaptured: automaticallyCaptured.length,
    transcriptRecovered: tasks.filter((task) => task.automaticDelivery?.source === "codex-transcript").length,
    usageObserved: tasks.filter((task) => task.usageStatus === "observed").length,
    usageUnavailable: tasks.filter((task) => task.usageStatus === "unavailable").length,
    automaticReceiptKnown: automaticallyCaptured.filter((task) => task.automaticDelivery.receiptPresent).length,
    delivered: delivered.length,
    awaitingOutcome: awaitingOutcome.length,
    blocked: tasks.filter((task) => task.annotation.status === "blocked").length,
    abandoned: tasks.filter((task) => task.annotation.status === "abandoned").length,
    correct: terminal.filter((task) => task.annotation.accepted === true).length,
    verifiedCorrect: terminal.filter((task) => task.annotation.accepted === true && task.annotation.verification === "passed").length,
    terminalOutcomeKnown: terminalOutcomeKnown.length,
    terminalAcceptedKnown: terminalAcceptedKnown.length,
    acceptedKnown: acceptedKnown.length,
    accepted: acceptedKnown.filter((task) => task.annotation.accepted).length,
    verificationKnown: verificationKnown.length,
    terminalVerificationKnown: terminalVerificationKnown.length,
    verificationPassed: verificationKnown.filter((task) => task.annotation.verification === "passed").length,
    qualityKnown: qualityKnown.length,
    stageCoverage: staged.length,
    stages: tasks.reduce((sum, task) => sum + (task.stageCount ?? 0), 0),
    completedStages: tasks.reduce((sum, task) => sum + (task.completedStages ?? 0), 0),
    blockedStages: tasks.reduce((sum, task) => sum + (task.blockedStages ?? 0), 0),
    openStages: tasks.reduce((sum, task) => sum + (task.openStages ?? 0), 0),
    delegatedStages: tasks.reduce((sum, task) => sum + (task.delegatedStages ?? 0), 0),
    parallelStageGroups: tasks.reduce((sum, task) => sum + (task.parallelGroups?.size ?? 0), 0),
    averageStageDurationMs: average(staged.map((task) => task.stageDurationMs)),
    stageVerificationChecks: tasks.reduce((sum, task) => sum + (task.stageVerificationChecks ?? 0), 0),
    stageFindings: tasks.reduce((sum, task) => sum + (task.stageFindings ?? 0), 0),
    costKnown: costKnown.length,
    fixRoundsKnown: fixRoundsKnown.length,
    preDeliveryFixRoundsKnown: preDeliveryFixRoundsKnown.length,
    preflightKnown: preflightKnown.length,
    verificationEvidenceKnown: verificationEvidenceKnown.length,
    firstPassKnown: firstPassKnown.length,
    firstPassAccepted: firstPassKnown.filter((task) => task.annotation.accepted && task.annotation.fixRounds === 0).length,
    elapsedP50Ms: percentile(completed.map((task) => task.durationMs ?? task.completedAtMs - task.startedAtMs), 0.5),
    elapsedP90Ms: percentile(completed.map((task) => task.durationMs ?? task.completedAtMs - task.startedAtMs), 0.9),
    averageElapsedMs: average(completed.map((task) => task.durationMs ?? task.completedAtMs - task.startedAtMs)),
    deliveryElapsedP50Ms: percentile(delivered.map((task) => task.deliveryDurationMs), 0.5),
    deliveryElapsedP90Ms: percentile(delivered.map((task) => task.deliveryDurationMs), 0.9),
    averageDeliveryElapsedMs: average(delivered.map((task) => task.deliveryDurationMs)),
    openAgeP50Ms: percentile(open.map((task) => Date.now() - task.startedAtMs), 0.5),
    openAgeP90Ms: percentile(open.map((task) => Date.now() - task.startedAtMs), 0.9),
    openAgeMaxMs: open.length ? Math.max(...open.map((task) => Date.now() - task.startedAtMs)) : null,
    timeToFirstTokenP50Ms: percentile(completed.map((task) => task.timeToFirstTokenMs), 0.5),
    averageInputTokens: average(completed.map((task) => task.inputTokens)),
    averageOutputTokens: average(completed.map((task) => task.outputTokens)),
    averageReasoningOutputTokens: average(completed.map((task) => task.reasoningOutputTokens)),
    averageTotalTokens: average(completed.map((task) => task.totalTokens)),
    inputTokensTotal: tokenTotals.input,
    cachedInputTokensTotal: tokenTotals.cachedInput,
    outputTokensTotal: tokenTotals.output,
    reasoningOutputTokensTotal: tokenTotals.reasoningOutput,
    totalTokensTotal: tokenTotals.total,
    cacheRate: inputTotal ? completed.reduce((sum, task) => sum + task.cachedInputTokens, 0) / inputTotal : null,
    averageToolCalls: average(completed.map((task) => task.toolCalls)),
    averageSpecialists: average(completed.map((task) => task.specialistAgents.size)),
    averageCostUsd: average(completed.map((task) => task.annotation.estimatedCostUsd)),
    averageQuality: average(tasks.map((task) => task.annotation.quality)),
    averageFixRounds: average(completed.map((task) => task.annotation.fixRounds)),
    averagePreDeliveryFixRounds: average(terminal.map((task) => task.annotation.preDeliveryFixRounds)),
    fullHistorySpawns: tasks.reduce((sum, task) => sum + task.fullHistorySpawns, 0),
    boundedHistorySpawns: tasks.reduce((sum, task) => sum + task.boundedHistorySpawns, 0),
    parallelAgentBatches: tasks.reduce((sum, task) => sum + task.parallelAgentBatches, 0),
    maxParallelAgents: tasks.reduce((maximum, task) => Math.max(maximum, task.maxParallelAgents), 0),
    followups: tasks.reduce((sum, task) => sum + task.followups, 0),
    toolFailures: tasks.reduce((sum, task) => sum + task.toolFailures, 0),
    commandFailureExitCodes: [...tasks.reduce(
      (counts, task) => mergeCounts(counts, task.commandFailureExitCodes),
      new Map()
    ).entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })),
    userCorrections: tasks.reduce((sum, task) => sum + (task.annotation.userCorrections ?? 0), 0),
    preDeliveryFixRounds: tasks.reduce((sum, task) => sum + (task.annotation.preDeliveryFixRounds ?? 0), 0),
    mustFixFindings: tasks.reduce((sum, task) => sum + (task.annotation.mustFixFindings ?? 0), 0),
    escapedDefects: tasks.reduce((sum, task) => sum + (task.annotation.escapedDefects ?? 0), 0)
  };
}

function summarizeRuns(runs) {
  const completed = runs.filter((run) => run.complete);
  const inputTotal = completed.reduce((sum, run) => sum + run.inputTokens, 0);
  const tokenTotals = {
    input: runs.reduce((sum, run) => sum + run.inputTokens, 0),
    cachedInput: runs.reduce((sum, run) => sum + run.cachedInputTokens, 0),
    output: runs.reduce((sum, run) => sum + run.outputTokens, 0),
    reasoningOutput: runs.reduce((sum, run) => sum + run.reasoningOutputTokens, 0),
    total: runs.reduce((sum, run) => sum + run.totalTokens, 0)
  };
  return {
    runs: runs.length,
    completed: completed.length,
    open: runs.length - completed.length,
    elapsedP50Ms: percentile(completed.map((run) => run.completedAtMs - run.startedAtMs), 0.5),
    elapsedP90Ms: percentile(completed.map((run) => run.completedAtMs - run.startedAtMs), 0.9),
    averageElapsedMs: average(completed.map((run) => run.completedAtMs - run.startedAtMs)),
    averageTasks: average(runs.map((run) => run.tasks.length)),
    averageInputTokens: average(completed.map((run) => run.inputTokens)),
    averageOutputTokens: average(completed.map((run) => run.outputTokens)),
    averageReasoningOutputTokens: average(completed.map((run) => run.reasoningOutputTokens)),
    averageTotalTokens: average(completed.map((run) => run.totalTokens)),
    inputTokensTotal: tokenTotals.input,
    cachedInputTokensTotal: tokenTotals.cachedInput,
    outputTokensTotal: tokenTotals.output,
    reasoningOutputTokensTotal: tokenTotals.reasoningOutput,
    totalTokensTotal: tokenTotals.total,
    cacheRate: inputTotal ? completed.reduce((sum, run) => sum + run.cachedInputTokens, 0) / inputTotal : null,
    averageToolCalls: average(completed.map((run) => run.toolCalls)),
    averageSpecialists: average(completed.map((run) => run.specialistAgents.size)),
    fullHistorySpawns: runs.reduce((sum, run) => sum + run.fullHistorySpawns, 0),
    boundedHistorySpawns: runs.reduce((sum, run) => sum + run.boundedHistorySpawns, 0),
    parallelAgentBatches: runs.reduce((sum, run) => sum + run.parallelAgentBatches, 0),
    maxParallelAgents: runs.reduce((maximum, run) => Math.max(maximum, run.maxParallelAgents), 0),
    followups: runs.reduce((sum, run) => sum + run.followups, 0),
    toolFailures: runs.reduce((sum, run) => sum + run.toolFailures, 0),
    commandFailureExitCodes: [...runs.reduce(
      (counts, run) => mergeCounts(counts, run.commandFailureExitCodes),
      new Map()
    ).entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  };
}

function observedDelegationMatchesPlan(task) {
  const mode = task.annotation?.delegationMode;
  if (!delegationModes.has(mode)) return true;

  // Legacy attempt rows do not carry the stage ledger needed to prove topology.
  if (!Array.isArray(task.stages)) return mode !== "fan-out";

  const delegates = task.stages.filter((stage) => stage.executor === "delegate");
  const parallelGroups = new Map();
  for (const stage of delegates) {
    if (!stage.parallelGroup) continue;
    const group = parallelGroups.get(stage.parallelGroup) ?? {
      agentPaths: new Set(),
      missingAgentPath: false,
      fullyCompleted: true
    };
    if (stage.finish?.agentPath) group.agentPaths.add(stage.finish.agentPath);
    else group.missingAgentPath = true;
    if (stage.finish?.status !== "completed") group.fullyCompleted = false;
    parallelGroups.set(stage.parallelGroup, group);
  }

  if (mode === "fan-out") {
    const groups = [...parallelGroups.values()];
    return groups.some((group) => group.fullyCompleted && !group.missingAgentPath && group.agentPaths.size >= 2 && group.agentPaths.size <= 4) &&
      groups.every((group) => !group.missingAgentPath && group.agentPaths.size <= 4);
  }

  const agentPaths = delegates.map((stage) => stage.finish?.agentPath);
  return agentPaths.every(Boolean) && new Set(agentPaths).size <= 1;
}

function cohortKey(task) {
  const a = task.annotation;
  const model = a.model ?? task.model;
  const profile = normalizeRoutingProfile(a.routingProfile, model, true);
  if (![a.workflowVersion, a.workflowFingerprint, a.workflowId, a.repo, a.taskType, a.risk, model, profile].every((value) => value !== undefined && value !== null) || profile === "unknown") {
    return null;
  }
  if (singleProfileModels[profile] && singleProfileModels[profile] !== model) return null;
  if (a.workflowFingerprint.startsWith("unknown")) return null;
  if (!observedDelegationMatchesPlan(task)) return null;
  return [task.provider ?? "codex", a.workflowVersion, a.workflowFingerprint, a.workflowId, a.repo, a.taskType, a.risk, model, profile, a.delegationMode ?? "legacy", task.stagePath ?? "unreported"].join("|");
}

function providerSummaries(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const values = groups.get(task.provider ?? "unknown") ?? [];
    values.push(task);
    groups.set(task.provider ?? "unknown", values);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, values]) => ({ provider, summary: summarize(values) }));
}

function specialistCount(task) {
  return task.specialistAgents instanceof Set
    ? task.specialistAgents.size
    : task.specialistAgents?.length ?? 0;
}

function collectionCount(value) {
  if (value instanceof Set || Array.isArray(value)) return value.size ?? value.length;
  return 0;
}

function display(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function durationSeconds(value) {
  if (!Number.isFinite(value)) return "N/A";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
}

function currency(value, digits = 3) {
  return Number.isFinite(value) ? `$${value.toFixed(digits)}` : "N/A";
}

function reportingTimeZone(options) {
  const timeZone = options["time-zone"] ?? "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new Error("Invalid --time-zone");
  }
  return timeZone;
}

async function loadAccountAnalytics(file) {
  if (!existsSync(file)) return null;
  try {
    const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
    if (!snapshot || typeof snapshot !== "object" || typeof snapshot.observedAt !== "string") return null;
    return snapshot;
  } catch {
    return null;
  }
}

function localDay(timestampMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(timestampMs);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dailyWorkload(tasks, timeZone) {
  const days = new Map();
  for (const task of tasks) {
    const day = localDay(task.startedAtMs, timeZone);
    const total = days.get(day) ?? {
      day,
      attempts: 0,
      completedAttempts: 0,
      openAttempts: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      toolFailures: 0
    };
    total.attempts += 1;
    total.completedAttempts += task.complete ? 1 : 0;
    total.openAttempts += task.complete ? 0 : 1;
    total.inputTokens += task.inputTokens;
    total.cachedInputTokens += task.cachedInputTokens;
    total.outputTokens += task.outputTokens;
    total.reasoningOutputTokens += task.reasoningOutputTokens;
    total.totalTokens += task.totalTokens;
    total.toolCalls += task.toolCalls;
    total.toolFailures += task.toolFailures;
    days.set(day, total);
  }
  return [...days.values()]
    .map((day) => ({ ...day, cacheRate: day.inputTokens ? day.cachedInputTokens / day.inputTokens : null }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const string = String(value);
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function csvReport(tasks) {
  const fields = ["taskKey", "logicalTaskId", "provider", "runId", "startedAt", "complete", "status", "automaticallyCaptured", "receiptPresent", "workflowVersion", "workflowFingerprint", "workflowId", "workflowPath", "repo", "taskType", "risk", "model", "routingProfile", "delegatedModels", "requestedDelegateRoutes", "durationMs", "deliveryDurationMs", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens", "usageStatus", "usageSources", "modelSource", "reasoningEffort", "deliverySource", "toolCalls", "specialists", "fullHistorySpawns", "boundedHistorySpawns", "parallelAgentBatches", "maxParallelAgents", "followups", "toolFailures", "commandFailureExitCodes", "accepted", "verification", "verificationChecks", "preDeliveryFixRounds", "userCorrections", "mustFixFindings", "escapedDefects"];
  const rows = [fields.join(",")];
  for (const task of tasks) {
    const a = task.annotation;
    const row = {
      taskKey: task.taskKey,
      logicalTaskId: task.logicalTaskId,
      provider: task.provider,
      runId: task.sessionId,
      startedAt: new Date(task.startedAtMs).toISOString(),
      complete: task.complete,
      status: a.status ?? (task.complete ? "complete" : "open"),
      automaticallyCaptured: Boolean(task.automaticDelivery && task.automaticDelivery.source !== "codex-transcript"),
      receiptPresent: Boolean(task.automaticDelivery?.receiptPresent),
      workflowVersion: a.workflowVersion,
      workflowFingerprint: a.workflowFingerprint,
      workflowId: a.workflowId,
      workflowPath: a.workflowPath,
      repo: a.repo,
      taskType: a.taskType,
      risk: a.risk,
      usageStatus: task.usageStatus,
      usageSources: task.usageSources?.join("+"),
      modelSource: task.modelSource,
      reasoningEffort: task.reasoningEffort,
      deliverySource: task.deliverySource ?? (task.automaticDelivery ? task.automaticDelivery.source ?? "provider-hook" : undefined),
      model: a.model ?? task.model,
      routingProfile: a.routingProfile,
      delegatedModels: [...task.delegatedModels].sort().join("+"),
      requestedDelegateRoutes: [...task.requestedDelegateRoutes].sort().join("+"),
      durationMs: task.durationMs ?? (task.completedAtMs ? task.completedAtMs - task.startedAtMs : null),
      deliveryDurationMs: task.deliveryDurationMs,
      inputTokens: task.inputTokens,
      cachedInputTokens: task.cachedInputTokens,
      outputTokens: task.outputTokens,
      reasoningOutputTokens: task.reasoningOutputTokens,
      totalTokens: task.totalTokens,
      toolCalls: task.toolCalls,
      specialists: specialistCount(task),
      fullHistorySpawns: task.fullHistorySpawns,
      boundedHistorySpawns: task.boundedHistorySpawns,
      parallelAgentBatches: task.parallelAgentBatches,
      maxParallelAgents: task.maxParallelAgents,
      followups: task.followups,
      toolFailures: task.toolFailures,
      commandFailureExitCodes: [...task.commandFailureExitCodes.entries()].map(([code, count]) => `${code}:${count}`).join("+"),
      accepted: a.accepted,
      verification: a.verification,
      verificationChecks: a.verificationChecks,
      preDeliveryFixRounds: a.preDeliveryFixRounds,
      userCorrections: a.userCorrections,
      mustFixFindings: a.mustFixFindings,
      escapedDefects: a.escapedDefects
    };
    rows.push(fields.map((field) => csvEscape(row[field])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function logicalCsvReport(tasks) {
  const fields = ["logicalTaskId", "provider", "runId", "startedAt", "complete", "delivered", "deliveredAt", "status", "result", "workflowVersion", "workflowFingerprint", "workflowId", "workflowPath", "stagePath", "stageCount", "completedStages", "blockedStages", "openStages", "delegatedStages", "parallelGroups", "stageContextModes", "stageProviders", "stageRequestedModels", "stageObservedModels", "stageAgentPaths", "stageVerificationChecks", "stageFindings", "stageDurationMs", "repo", "taskType", "risk", "model", "routingProfile", "delegationMode", "acceptanceChecks", "criteriaPassed", "criteriaTotal", "artifactBound", "remoteArtifactVerified", "evidenceClasses", "verificationChecks", "attempts", "usageAttribution", "sharedAttemptCount", "durationMs", "deliveryDurationMs", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens", "usageStatus", "usageSources", "modelSource", "reasoningEffort", "deliverySource", "toolCalls", "specialists", "accepted", "verification", "quality", "preDeliveryFixRounds", "fixRounds", "userCorrections", "mustFixFindings", "escapedDefects"];
  const rows = [fields.join(",")];
  for (const task of tasks) {
    const a = task.annotation;
    const row = {
      logicalTaskId: task.logicalTaskId,
      provider: task.provider,
      runId: task.rootSessionId,
      startedAt: new Date(task.startedAtMs).toISOString(),
      complete: task.complete,
      delivered: task.delivered,
      deliveredAt: task.deliveredAtMs ? new Date(task.deliveredAtMs).toISOString() : undefined,
      status: a.status ?? "open",
      result: a.result,
      workflowVersion: a.workflowVersion,
      workflowFingerprint: a.workflowFingerprint,
      workflowId: a.workflowId,
      workflowPath: a.workflowPath,
      stagePath: task.stagePath,
      stageCount: task.stageCount,
      completedStages: task.completedStages,
      blockedStages: task.blockedStages,
      openStages: task.openStages,
      delegatedStages: task.delegatedStages,
      parallelGroups: [...task.parallelGroups].join("+"),
      stageContextModes: [...task.stageContextModes].join("+"),
      stageProviders: [...task.stageProviders].join("+"),
      stageRequestedModels: [...task.stageRequestedModels].join("+"),
      stageObservedModels: [...task.stageObservedModels].join("+"),
      stageAgentPaths: [...task.stageAgentPaths].join("+"),
      stageVerificationChecks: task.stageVerificationChecks,
      stageFindings: task.stageFindings,
      stageDurationMs: task.stageDurationMs,
      repo: a.repo,
      taskType: a.taskType,
      risk: a.risk,
      usageStatus: task.usageStatus,
      usageSources: task.usageSources?.join("+"),
      modelSource: task.modelSource,
      reasoningEffort: task.reasoningEffort,
      deliverySource: task.deliverySource ?? (task.automaticDelivery ? task.automaticDelivery.source ?? "provider-hook" : undefined),
      model: a.model ?? task.model,
      routingProfile: normalizeRoutingProfile(a.routingProfile, a.model ?? task.model, true),
      delegationMode: a.delegationMode,
      acceptanceChecks: a.acceptanceChecks,
      criteriaPassed: task.criteriaPassed,
      criteriaTotal: task.criteriaTotal,
      artifactBound: task.artifactBound,
      remoteArtifactVerified: task.remoteArtifactVerified,
      evidenceClasses: a.evidenceClasses,
      verificationChecks: a.verificationChecks,
      attempts: task.attemptKeys.length,
      usageAttribution: task.usageAttribution,
      sharedAttemptCount: task.sharedAttemptCount,
      durationMs: task.durationMs,
      deliveryDurationMs: task.deliveryDurationMs,
      inputTokens: task.inputTokens,
      cachedInputTokens: task.cachedInputTokens,
      outputTokens: task.outputTokens,
      reasoningOutputTokens: task.reasoningOutputTokens,
      totalTokens: task.totalTokens,
      toolCalls: task.toolCalls,
      specialists: specialistCount(task),
      accepted: a.accepted,
      verification: a.verification,
      quality: a.quality,
      preDeliveryFixRounds: a.preDeliveryFixRounds,
      fixRounds: a.fixRounds,
      userCorrections: a.userCorrections,
      mustFixFindings: a.mustFixFindings,
      escapedDefects: a.escapedDefects
    };
    rows.push(fields.map((field) => csvEscape(row[field])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function stageCsvReport(tasks) {
  const fields = ["logicalTaskId", "rootSessionId", "stageId", "startSchemaVersion", "finishSchemaVersion", "sequence", "name", "stageClass", "role", "executor", "contextMode", "provider", "requestedModel", "agentPath", "observedModel", "parallelGroup", "startedAt", "finishedAt", "durationMs", "status", "outcome", "verificationChecks", "findings", "handoff", "objectiveId", "scope", "access", "dependsOn", "completionSignal", "fanInOwner", "delegationVerification", "boundAgentPath", "providerRunId", "reportReadback", "failureReason", "observedModelSource", "reportedModel"];
  const rows = [fields.join(",")];
  for (const task of tasks) {
    for (const stage of task.stages) {
      const finishedAt = stage.finish?.timestamp;
      const row = {
        logicalTaskId: task.logicalTaskId,
        rootSessionId: stage.rootSessionId ?? task.rootSessionId,
        stageId: stage.stageId,
        startSchemaVersion: stage.schemaVersion,
        finishSchemaVersion: stage.finish?.schemaVersion,
        sequence: stage.sequence,
        name: stage.name,
        stageClass: stage.stageClass,
        role: stage.role,
        executor: stage.executor,
        contextMode: stage.contextMode,
        provider: stage.provider,
        requestedModel: stage.requestedModel,
        agentPath: stage.finish?.agentPath,
        observedModel: stage.observedModel ?? stage.finish?.observedModel,
        observedModelSource: stage.observedModelSource ?? "stage-report",
        reportedModel: stage.finish?.observedModel,
        parallelGroup: stage.parallelGroup,
        startedAt: stage.timestamp,
        finishedAt,
        durationMs: finishedAt ? Date.parse(finishedAt) - Date.parse(stage.timestamp) : undefined,
        status: stage.finish?.status ?? "open",
        outcome: stage.finish?.outcome,
        verificationChecks: stage.finish?.verificationChecks,
        findings: stage.finish?.findings,
        handoff: stage.finish?.handoff,
        objectiveId: stage.objectiveId,
        scope: stage.scope,
        access: stage.access,
        dependsOn: stage.dependsOn?.join("+"),
        completionSignal: stage.completionSignal,
        fanInOwner: stage.fanInOwner,
        delegationVerification: stage.objectiveId
          ? stage.executor === "delegate" ? stage.binding ? "enforced-bound" : "enforced-unbound" : "enforced-coordinator"
          : "legacy-unverified",
        boundAgentPath: stage.binding?.agentPath,
        providerRunId: stage.binding?.providerRunId,
        reportReadback: stage.finish?.reportReadback,
        failureReason: stage.finish?.failureReason
      };
      rows.push(fields.map((field) => csvEscape(row[field])).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

function dailyCsvReport(days) {
  const fields = ["day", "attempts", "completedAttempts", "openAttempts", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens", "cacheRate", "toolCalls", "toolFailures"];
  const rows = [fields.join(",")];
  for (const day of days) rows.push(fields.map((field) => csvEscape(day[field])).join(","));
  return `${rows.join("\n")}\n`;
}

function markdownReport(report, tableLimit) {
  const { overall, runs, runSummary, cohorts, tasks, logicalTaskSummary, logicalTasks, logicalCohorts, dailyWorkload, timeZone, accountAnalytics, automaticallyEndedSessions, providers } = report;
  const lines = [
    "# CVO Workflow Metrics",
    "",
    `- Workspace: \`${report.root}\``,
    `- Window starts: ${report.since}`,
    `- Codex rollouts matched: ${report.codexRolloutsMatched} of ${report.codexFilesScanned} scanned`,
    `- Claude transcripts matched: ${report.claudeTranscriptsMatched} of ${report.claudeFilesScanned} scanned`,
    "",
    "> Best-effort local telemetry. Codex rollouts and Claude transcripts represent workflow pressure, not billing.",
    "",
    ...(accountAnalytics ? [
      "## Account capacity snapshot",
      "",
      `Manual signed-in account reading observed: ${accountAnalytics.observedAt}. It is not derived from rollout logs.`,
      "",
      "| Account metric | Value |",
      "| --- | ---: |",
      `| Weekly plan allowance remaining | ${accountAnalytics.weeklyUsageRemainingPercent}% (resets ${accountAnalytics.weeklyUsageResetsAt}) |`,
      `| Flexible credits remaining / usage events | ${accountAnalytics.creditsRemaining} / ${accountAnalytics.creditUsageEvents} |`,
      `| Auto-reload | ${accountAnalytics.autoReloadEnabled ? "on" : "off"} |`,
      `| Account turns / skills / plugin calls (${accountAnalytics.range?.label ?? "range"}) | ${accountAnalytics.turns} / ${accountAnalytics.skillsUsed} / ${accountAnalytics.pluginCalls} |`,
      `| Built-in Code review PRs / issues / reactions | ${accountAnalytics.codeReview?.prsReviewed ?? "N/A"} / ${accountAnalytics.codeReview?.issuesFound ?? "N/A"} / ${accountAnalytics.codeReview?.reactions ?? "N/A"} |`,
      ""
    ] : []),
    "| Metric | Value |",
    "| --- | ---: |",
    `| Attempts / completed / open | ${overall.tasks} / ${overall.completed} / ${overall.open} |`,
    `| Transcript receipt recovery | ${overall.transcriptRecovered} turns |`,
    `| Usage observed / unavailable | ${overall.usageObserved} / ${overall.usageUnavailable} turns |`,
    `| Hook delivery capture / receipt coverage | ${overall.automaticallyCaptured}/${overall.tasks} turns / ${overall.automaticReceiptKnown}/${overall.automaticallyCaptured} captured |`,
    `| Automatically recorded session ends | ${automaticallyEndedSessions} |`,
    `| Session runs / completed / open | ${runSummary.runs} / ${runSummary.completed} / ${runSummary.open} |`,
    `| Logical tasks / terminal / open | ${logicalTaskSummary.tasks} / ${logicalTaskSummary.terminal} / ${logicalTaskSummary.open} |`,
    `| Logical deliveries / awaiting optional outcome | ${logicalTaskSummary.delivered} / ${logicalTaskSummary.awaitingOutcome} |`,
    `| Logical terminal outcomes: correct / blocked / abandoned | ${logicalTaskSummary.correct} / ${logicalTaskSummary.blocked} / ${logicalTaskSummary.abandoned} |`,
    `| Logical outcome-record coverage | ${logicalTaskSummary.terminalOutcomeKnown}/${logicalTaskSummary.terminal} terminal |`,
    `| Logical verified-correct coverage | ${logicalTaskSummary.verifiedCorrect}/${logicalTaskSummary.terminal} terminal |`,
    `| Logical verification coverage | ${logicalTaskSummary.verificationPassed}/${logicalTaskSummary.terminalVerificationKnown} known of ${logicalTaskSummary.terminal} terminal |`,
    `| Logical preflight-gate coverage | ${logicalTaskSummary.preflightKnown}/${logicalTaskSummary.terminal} terminal |`,
    `| Logical verification-evidence coverage | ${logicalTaskSummary.verificationEvidenceKnown}/${logicalTaskSummary.terminal} terminal |`,
    `| Logical tasks with verified delegation topology classified for comparison | ${logicalTasks.filter((task) => cohortKey(task)).length}/${logicalTaskSummary.tasks} tracked |`,
    `| Logical first-pass coverage | ${logicalTaskSummary.firstPassAccepted}/${logicalTaskSummary.firstPassKnown} known of ${logicalTaskSummary.completed} completed |`,
    `| Logical average annotated cost | ${currency(logicalTaskSummary.averageCostUsd)} (${logicalTaskSummary.costKnown}/${logicalTaskSummary.completed} covered) |`,
    `| Logical average quality / pre-delivery fixes / post-delivery corrections | ${display(logicalTaskSummary.averageQuality, 1)} (${logicalTaskSummary.qualityKnown}/${logicalTaskSummary.tasks}) / ${display(logicalTaskSummary.averagePreDeliveryFixRounds, 1)} (${logicalTaskSummary.preDeliveryFixRoundsKnown}/${logicalTaskSummary.terminal}) / ${display(logicalTaskSummary.averageFixRounds, 1)} (${logicalTaskSummary.fixRoundsKnown}/${logicalTaskSummary.terminal}) |`,
    `| Logical pre-delivery fixes / post-delivery corrections / must-fix / escaped | ${logicalTaskSummary.preDeliveryFixRounds} / ${logicalTaskSummary.userCorrections} / ${logicalTaskSummary.mustFixFindings} / ${logicalTaskSummary.escapedDefects} |`,
    `| Logical cycle average / p50 / p90 | ${durationSeconds(logicalTaskSummary.averageElapsedMs)} / ${durationSeconds(logicalTaskSummary.elapsedP50Ms)} / ${durationSeconds(logicalTaskSummary.elapsedP90Ms)} |`,
    `| Logical delivery time average / p50 / p90 | ${durationSeconds(logicalTaskSummary.averageDeliveryElapsedMs)} / ${durationSeconds(logicalTaskSummary.deliveryElapsedP50Ms)} / ${durationSeconds(logicalTaskSummary.deliveryElapsedP90Ms)} |`,
    `| Open logical age p50 / p90 / max | ${durationSeconds(logicalTaskSummary.openAgeP50Ms)} / ${durationSeconds(logicalTaskSummary.openAgeP90Ms)} / ${durationSeconds(logicalTaskSummary.openAgeMaxMs)} |`,
    `| Logical average input / output / reasoning / total | ${display(logicalTaskSummary.averageInputTokens)} / ${display(logicalTaskSummary.averageOutputTokens)} / ${display(logicalTaskSummary.averageReasoningOutputTokens)} / ${display(logicalTaskSummary.averageTotalTokens)} |`,
    `| Logical token totals: input / cached / output / reasoning / total | ${logicalTaskSummary.inputTokensTotal} / ${logicalTaskSummary.cachedInputTokensTotal} / ${logicalTaskSummary.outputTokensTotal} / ${logicalTaskSummary.reasoningOutputTokensTotal} / ${logicalTaskSummary.totalTokensTotal} |`,
    `| Logical cached input | ${percentage(logicalTaskSummary.cacheRate)} |`,
    `| Logical average tools / specialists | ${display(logicalTaskSummary.averageToolCalls, 1)} / ${display(logicalTaskSummary.averageSpecialists, 1)} |`,
    `| Orchestrator stage coverage | ${logicalTaskSummary.stageCoverage}/${logicalTaskSummary.tasks} logical tasks |`,
    `| Stages: total / completed / blocked / open / delegated | ${logicalTaskSummary.stages} / ${logicalTaskSummary.completedStages} / ${logicalTaskSummary.blockedStages} / ${logicalTaskSummary.openStages} / ${logicalTaskSummary.delegatedStages} |`,
    `| Parallel stage groups / stage checks / finding references | ${logicalTaskSummary.parallelStageGroups} / ${logicalTaskSummary.stageVerificationChecks} / ${logicalTaskSummary.stageFindings} |`,
    `| Session span average / p50 / p90 | ${durationSeconds(runSummary.averageElapsedMs)} / ${durationSeconds(runSummary.elapsedP50Ms)} / ${durationSeconds(runSummary.elapsedP90Ms)} |`,
    `| Average turns per run | ${display(runSummary.averageTasks, 1)} |`,
    `| Legacy attempt blocked / abandoned | ${overall.blocked} / ${overall.abandoned} |`,
    `| Legacy attempt accepted coverage | ${overall.accepted}/${overall.acceptedKnown} known of ${overall.completed} completed |`,
    `| Legacy attempt verification coverage | ${overall.verificationPassed}/${overall.verificationKnown} known of ${overall.completed} completed |`,
    `| Legacy attempts classified for comparison | ${tasks.filter((task) => cohortKey(task)).length}/${overall.completed} completed |`,
    `| Legacy attempt first-pass coverage | ${overall.firstPassAccepted}/${overall.firstPassKnown} known of ${overall.completed} completed |`,
    `| Attempt cycle p50 / p90 | ${durationSeconds(overall.elapsedP50Ms)} / ${durationSeconds(overall.elapsedP90Ms)} |`,
    `| Time to first token p50 | ${durationSeconds(overall.timeToFirstTokenP50Ms)} |`,
    `| Average input / output / reasoning / total | ${display(overall.averageInputTokens)} / ${display(overall.averageOutputTokens)} / ${display(overall.averageReasoningOutputTokens)} / ${display(overall.averageTotalTokens)} |`,
    `| Attempt token totals: input / cached / output / reasoning / total | ${overall.inputTokensTotal} / ${overall.cachedInputTokensTotal} / ${overall.outputTokensTotal} / ${overall.reasoningOutputTokensTotal} / ${overall.totalTokensTotal} |`,
    `| Cached input | ${percentage(overall.cacheRate)} |`,
    `| Average tools / specialists | ${display(overall.averageToolCalls, 1)} / ${display(overall.averageSpecialists, 1)} |`,
    `| Legacy attempt average annotated cost | ${currency(overall.averageCostUsd)} (${overall.costKnown}/${overall.completed} covered) |`,
    `| Legacy attempt average quality / fixes | ${display(overall.averageQuality, 1)} (${overall.qualityKnown}/${overall.tasks}) / ${display(overall.averageFixRounds, 1)} (${overall.fixRoundsKnown}/${overall.completed}) |`,
    `| Full / bounded spawns | ${overall.fullHistorySpawns} / ${overall.boundedHistorySpawns} |`,
    `| Observed parallel agent batches / peak agents | ${overall.parallelAgentBatches} / ${overall.maxParallelAgents || "N/A"} |`,
    `| Follow-ups / tool failures | ${overall.followups} / ${overall.toolFailures} |`,
    `| Failed command exit codes | ${overall.commandFailureExitCodes.map(([code, count]) => `${code}:${count}`).join(", ") || "none"} |`,
    `| Legacy attempt corrections / must-fix / escaped | ${overall.userCorrections} / ${overall.mustFixFindings} / ${overall.escapedDefects} |`,
    "",
    "## Provider coverage",
    "",
    "| Provider | Attempts | Completed | Input | Output | Tools | Specialists | Full / bounded spawns | Parallel batches / peak |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...providers.map(({ provider, summary }) => `| ${provider} | ${summary.tasks} | ${summary.completed} | ${summary.inputTokensTotal} | ${summary.outputTokensTotal} | ${display(summary.averageToolCalls, 1)} avg | ${display(summary.averageSpecialists, 1)} avg | ${summary.fullHistorySpawns} / ${summary.boundedHistorySpawns} | ${summary.parallelAgentBatches} / ${summary.maxParallelAgents || "N/A"} |`),
    "",
    "## Daily local workload",
    "",
    `Pacific-time workload from individual Codex turns and Claude prompts. This is technical activity, not ChatGPT credits or provider billing. Time zone: ${timeZone}.`,
    "",
    "| Day | Attempts | Completed / open | Raw input | Cache reuse | Output | Tools / failures |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const day of dailyWorkload) {
    lines.push(`| ${day.day} | ${day.attempts} | ${day.completedAttempts} / ${day.openAttempts} | ${day.inputTokens} | ${percentage(day.cacheRate)} | ${day.outputTokens} | ${day.toolCalls} / ${day.toolFailures} |`);
  }
  if (!dailyWorkload.length) lines.push("| — | 0 | 0 / 0 | 0 | N/A | 0 | 0 / 0 |");
  lines.push(
    "",
    "## Legacy attempt cohorts",
    "",
    "| Provider | Version | Fingerprint | Workflow | Repo | Type | Risk | Coordinator | Routing | Attempts | Completed | p50 | Avg input | Cache | Tools | Specialists | Accepted coverage | Escaped |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const cohort of cohorts) {
    const [provider, version, fingerprint, workflow, repo, type, risk, model, routingProfile] = cohort.key.split("|");
    lines.push(`| ${provider} | ${version} | ${fingerprint.slice(0, 12)} | ${workflow} | ${repo} | ${type} | ${risk} | ${model} | ${routingProfile} | ${cohort.summary.tasks} | ${cohort.summary.completed} | ${durationSeconds(cohort.summary.elapsedP50Ms)} | ${display(cohort.summary.averageInputTokens)} | ${percentage(cohort.summary.cacheRate)} | ${display(cohort.summary.averageToolCalls, 1)} | ${display(cohort.summary.averageSpecialists, 1)} | ${cohort.summary.accepted}/${cohort.summary.acceptedKnown} | ${cohort.summary.escapedDefects} |`);
  }
  if (!cohorts.length) lines.push("| — | — | — | — | — | — | — | — | — | 0 | 0 | — | — | — | — | — | — | — |");
  lines.push("", "## Logical-task cohorts", "", `Classified logical tasks: ${logicalTasks.filter((task) => cohortKey(task)).length}/${logicalTaskSummary.tasks} tracked.`);
  if (logicalCohorts.length) lines.push(...logicalCohorts.map((cohort) => `- ${cohort.key}: ${cohort.summary.tasks} tasks, ${cohort.summary.completed} completed`));
  else lines.push("- none");
  const selectedRuns = tableLimit === 0 ? runs : runs.slice(-tableLimit);
  lines.push("", "## Inferred session feedback", "",
    "Low-confidence estimate, separate from explicit quality and verified correctness. A closed session waits 24 hours; resuming withdraws the old estimate. Missing history or unclassified follow-ups stay unknown.", "",
    "| Session | State | Inferred rating | Corrections | Clarifications | Reason |",
    "| --- | --- | ---: | ---: | ---: | --- |");
  for (const run of report.runs) {
    const value = run.inferredFeedback;
    if (value) lines.push(`| ${run.runId} | ${value.state} | ${value.rating ?? "unknown"} | ${value.corrections} | ${value.clarifications} | ${value.reason} |`);
  }
  lines.push("", "## Session runs", "", "A run groups the tracked turns in one root session. It is a context and tool-pressure span, not a user task or a replacement for attempt outcomes.", "", "| Started | Provider | Run ID | Turns | Status | Duration | Input | Cache | Tools | Specialists | Full / bounded spawns | Parallel batches / peak | Failures |", "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const run of selectedRuns) {
    const duration = run.completedAtMs ? run.completedAtMs - run.startedAtMs : null;
    lines.push(`| ${new Date(run.startedAtMs).toISOString().slice(0, 16).replace("T", " ")} | ${run.provider} | ${run.runId} | ${run.tasks.length} | ${run.complete ? "complete" : "open"} | ${durationSeconds(duration)} | ${run.inputTokens} | ${display(run.inputTokens ? run.cachedInputTokens / run.inputTokens * 100 : null, 1)}% | ${run.toolCalls} | ${specialistCount(run)} | ${run.fullHistorySpawns} / ${run.boundedHistorySpawns} | ${run.parallelAgentBatches} / ${run.maxParallelAgents || "N/A"} | ${run.toolFailures} |`);
  }
  const selectedLogical = tableLimit === 0 ? logicalTasks : logicalTasks.slice(-tableLimit);
  lines.push("", "## Logical tasks", "", "An explicit lifecycle groups multiple root turns and delegated activity. Shared turns use an equal-share token estimate so totals count each token once; tool and finding references may still overlap. Provider telemetry remains the source of raw usage.", "", "| Started | Logical task ID | Attempts | Mode | Actual stage path | Stages | Gates | Status | Pre / post fixes | Age or duration | Total tokens | Outcome |", "| --- | --- | ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |");
  for (const task of selectedLogical) {
    const gates = task.annotation.acceptanceChecks && task.annotation.evidenceClasses
      ? `${task.criteriaPassed}/${task.criteriaTotal || task.annotation.acceptanceChecks} criteria / ${task.annotation.evidenceClasses} evidence / ${task.annotation.verificationChecks ?? "pending"} verification`
      : "legacy";
    const elapsed = task.complete ? durationSeconds(task.durationMs) : durationSeconds(Date.now() - task.startedAtMs);
    const status = task.annotation.status ?? (task.delivered ? "delivered; awaiting outcome" : "open");
    const stageStatus = task.stageCount
      ? `${task.completedStages}/${task.stageCount} done; ${task.delegatedStages} delegated; ${collectionCount(task.parallelGroups)} parallel groups`
      : "unreported";
    lines.push(`| ${new Date(task.startedAtMs).toISOString().slice(0, 16).replace("T", " ")} | ${task.logicalTaskId} | ${task.attempts.length} | ${task.annotation.delegationMode ?? "legacy"} | ${task.stagePath ?? task.annotation.workflowPath ?? "unknown"} | ${stageStatus} | ${gates} | ${status} | ${task.annotation.preDeliveryFixRounds ?? 0} / ${task.feedbackCount} | ${elapsed} | ${task.totalTokens} | ${task.annotation.result ?? (task.feedbackCount ? "changes-needed" : "not provided")} |`);
  }
  const selectedStages = selectedLogical.flatMap((task) => task.stages.map((stage) => ({ logicalTaskId: task.logicalTaskId, ...stage })));
  lines.push("", "## Orchestrator stage ledger", "", "Specialists report structured results to the coordinator. The coordinator validates and appends only privacy-safe stage metadata. Finding references may repeat across review and correction stages; they are not a unique-defect count.", "", "| Task | Seq | Stage | Executor / agent path | Context | Provider | Requested / observed model | Parallel group | Status / outcome | Checks | Finding refs | Handoff |", "| --- | ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |");
  for (const stage of selectedStages) {
    const agentPath = stage.finish ? stage.finish.agentPath ?? "unknown (legacy)" : "pending";
    const stageLabel = stage.stageClass ? `${stage.name} (${stage.stageClass})` : stage.name;
    lines.push(`| ${stage.logicalTaskId} | ${stage.sequence} | ${stageLabel} | ${stage.executor} / ${agentPath} | ${stage.contextMode} | ${stage.provider} | ${stage.requestedModel} / ${stage.observedModel ?? stage.finish?.observedModel ?? "pending"} | ${stage.parallelGroup ?? "—"} | ${stage.finish ? `${stage.finish.status} / ${stage.finish.outcome}` : "open"} | ${stage.finish?.verificationChecks ?? 0} | ${stage.finish?.findings ?? 0} | ${stage.finish?.handoff ?? "pending"} |`);
  }
  if (!selectedStages.length) lines.push("| — | — | — | — | — | — | — | — | — | 0 | 0 | — |");
  const selected = tableLimit === 0 ? tasks : tasks.slice(-tableLimit);
  lines.push("", "## Attempt keys", "", "Each key is one Codex turn or Claude prompt. Delivery comes from the Stop hook or a matching completed transcript receipt, labeled separately. Unavailable usage is not measured zero. Explicit keys remain useful for delayed annotations.", "", "| Started | Provider | Attempt key | Capture | Path | Status | Input | Cache | Output | Tools | Specialists | Delegated models | Cohort |", "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const task of selected) {
    const status = task.annotation.status ?? (task.complete ? "complete" : "open");
    lines.push(`| ${new Date(task.startedAtMs).toISOString().slice(0, 16).replace("T", " ")} | ${task.provider} | ${task.taskKey} | ${task.automaticDelivery?.source === "codex-transcript" ? "transcript receipt" : task.automaticDelivery ? (task.automaticDelivery.receiptPresent ? "hook + receipt" : "hook") : "transcript only"} | ${task.annotation.workflowPath ?? "unknown"} | ${status} | ${task.usageStatus === "unavailable" ? "unavailable" : task.inputTokens} | ${display(task.inputTokens ? task.cachedInputTokens / task.inputTokens * 100 : null, 1)}% | ${task.outputTokens} | ${task.toolCalls} | ${specialistCount(task)} | ${[...task.delegatedModels].sort().join(", ") || "unknown"} | ${cohortKey(task) ?? "unannotated"} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function summary(options) {
  const { root, sessions, claudeSessions, annotations, accountAnalytics: accountAnalyticsFile } = pathsFor(options);
  const days = numeric(options, "days", { min: 1 }) ?? defaultDays;
  const tableLimit = numeric(options, "table-limit", { integer: true }) ?? defaultTableLimit;
  const timeZone = reportingTimeZone(options);
  const format = options.format ?? "markdown";
  if (!new Set(["markdown", "json", "csv", "logical-csv", "stage-csv", "daily-csv"]).has(format)) throw new Error("Invalid --format");
  if (!existsSync(sessions) && !existsSync(claudeSessions)) {
    throw new Error(`No provider telemetry directories exist: ${sessions}, ${claudeSessions}`);
  }
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const codexFiles = existsSync(sessions) ? await listJsonl(sessions, 0) : [];
  const claudeFiles = existsSync(claudeSessions) ? await listJsonl(claudeSessions, 0) : [];
  async function parseFiles(files, parser) {
    const parsed = [];
    const pending = [...files];
    const workers = Array.from({ length: Math.min(8, pending.length) }, async () => {
      while (pending.length) {
        const file = pending.shift();
        if (file) parsed.push(await parser(file));
      }
    });
    await Promise.all(workers);
    return parsed;
  }
  const [codexRollouts, claudeTranscripts] = await Promise.all([
    parseFiles(codexFiles, parseRollout),
    parseFiles(claudeFiles, parseClaudeTranscript)
  ]);
  const metadata = await loadMetadata(annotations);
  const accountAnalytics = await loadAccountAnalytics(accountAnalyticsFile);
  enrichCodexMetadata(metadata, codexRollouts);
  const registeredSessions = new Set([...metadata.logicalTasks.values()].map((item) => item.rootSessionId));
  const workspaceSessions = new Set([
    ...codexRollouts.filter((rollout) => !rollout.meta?.parentThreadId && inWorkspace(rollout.meta?.cwd, root)).map((rollout) => rollout.meta.sessionId),
    ...claudeTranscripts.filter((transcript) => !transcript.meta?.isSubagent &&
      (inWorkspace(transcript.meta?.cwd, root) || transcript.events.some((event) => inWorkspace(event.cwd, root)))).map((transcript) => transcript.meta.sessionId)
  ]);
  const candidateTasks = [
    ...buildTasks(codexRollouts, root, 0, registeredSessions),
    ...buildClaudeTasks(claudeTranscripts, root, 0, registeredSessions)
  ];
  // A registered task can start outside CVO. Admit only its task window, not
  // unrelated turns from that home-directory session into workspace reporting.
  const registeredAttemptKeys = new Set(logicalTaskWindow(candidateTasks, metadata.logicalTasks, 0).flatMap((item) => item.attemptKeys));
  const allTasks = candidateTasks.filter((task) => workspaceSessions.has(task.sessionId) || registeredAttemptKeys.has(task.taskKey))
    .map((task) => {
      const candidateDelivery = metadata.automaticDeliveries.get(task.taskKey) ?? null;
      const automaticDelivery = candidateDelivery?.provider === task.provider ? candidateDelivery : null;
      const automaticAnnotation = automaticDelivery ? {
        status: "delivered",
        workflowVersion: automaticDelivery.workflowVersion,
        workflowFingerprint: automaticDelivery.workflowFingerprint,
        workflowId: automaticDelivery.workflowId,
        risk: automaticDelivery.risk,
        model: automaticDelivery.model,
        delegationMode: automaticDelivery.delegationMode,
        verification: automaticDelivery.verification,
        verificationChecks: automaticDelivery.verificationChecks,
        workflowPath: automaticDelivery.workflowPath
      } : {};
      Object.keys(automaticAnnotation).forEach(
        (key) => automaticAnnotation[key] === undefined && delete automaticAnnotation[key]
      );
      return {
        ...task,
        usageStatus: task.usageEvents > 0 ? "observed" : "unavailable",
        automaticDelivery,
        deliveryDurationMs: automaticDelivery ? Date.parse(automaticDelivery.timestamp) - task.startedAtMs : null,
        annotation: { ...automaticAnnotation, ...(metadata.attempts.get(task.taskKey) ?? {}) }
      };
    })
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
  const allLogicalTasks = logicalTaskWindow(allTasks, metadata.logicalTasks, 0);
  const tasks = allTasks.filter((task) => task.startedAtMs >= sinceMs);
  const logicalTasks = logicalTaskWindow(tasks, metadata.logicalTasks, sinceMs);
  const fullRuns = buildRuns(allTasks);
  for (const run of fullRuns) {
    const attempts = allTasks.filter((task) => task.provider === run.provider && task.sessionId === run.runId);
    const sessionLogicalTasks = allLogicalTasks.filter((task) => task.rootSessionId === run.runId && task.provider === run.provider);
    const roots = (run.provider === "codex" ? codexRollouts : claudeTranscripts)
      .filter((item) => item.meta?.sessionId === run.runId && !item.meta?.parentThreadId && !item.meta?.isSubagent);
    const earliest = Math.min(...attempts.map((task) => task.startedAtMs));
    const historyComplete = roots.some((item) => Number.isFinite(item.meta?.startedAtMs) && item.meta.startedAtMs <= earliest) && roots.every((item) => item.malformed === 0);
    const latestActivityAtMs = Math.max(0, ...roots.flatMap((item) => item.events.map((event) => event.timestampMs)).filter(Number.isFinite));
    run.inferredFeedback = inferSessionFeedback({ attempts, logicalTasks: sessionLogicalTasks,
      sessionEnd: metadata.sessionEnds.get(`${run.provider}:${run.runId}`), historyComplete, latestActivityAtMs });
  }
  for (const logical of logicalTasks) for (const task of logical.attempts) task.logicalTaskId = logical.logicalTaskId;
  const runs = buildRuns(tasks);
  for (const run of runs) run.inferredFeedback = fullRuns.find((item) => item.runId === run.runId && item.provider === run.provider)?.inferredFeedback;
  const daily = dailyWorkload(tasks, timeZone);
  const groups = new Map();
  for (const task of tasks) {
    const key = cohortKey(task);
    if (!key) continue;
    const values = groups.get(key) ?? [];
    values.push(task);
    groups.set(key, values);
  }
  const logicalGroups = new Map();
  for (const task of logicalTasks) {
    const key = cohortKey(task);
    if (!key) continue;
    const values = logicalGroups.get(key) ?? [];
    values.push(task);
    logicalGroups.set(key, values);
  }
  const report = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    root,
    since: new Date(sinceMs).toISOString(),
    timeZone,
    filesScanned: codexFiles.length + claudeFiles.length,
    codexFilesScanned: codexFiles.length,
    claudeFilesScanned: claudeFiles.length,
    rolloutsMatched: codexRollouts.filter((rollout) => (inWorkspace(rollout.meta?.cwd, root) || registeredSessions.has(rollout.meta?.sessionId))).length +
      claudeTranscripts.filter((transcript) => !transcript.meta?.isSubagent &&
        (inWorkspace(transcript.meta?.cwd, root) || transcript.events.some((event) => inWorkspace(event.cwd, root)))).length,
    codexRolloutsMatched: codexRollouts.filter((rollout) => (inWorkspace(rollout.meta?.cwd, root) || registeredSessions.has(rollout.meta?.sessionId))).length,
    claudeTranscriptsMatched: claudeTranscripts.filter((transcript) => !transcript.meta?.isSubagent &&
      (inWorkspace(transcript.meta?.cwd, root) || transcript.events.some((event) => inWorkspace(event.cwd, root)))).length,
    automaticallyEndedSessions: [...metadata.sessionEnds.values()].filter(
      (event) => Date.parse(event.timestamp) >= sinceMs
    ).length,
    overall: summarize(tasks),
    runSummary: summarizeRuns(runs),
    logicalTaskSummary: summarize(logicalTasks),
    inferredFeedbackSummary: {
      source: "inferred", windowHours: 24,
      ratedSessions: runs.filter((run) => Number.isFinite(run.inferredFeedback?.rating)).length,
      averageRating: average(runs.map((run) => run.inferredFeedback?.rating)),
      states: Object.fromEntries([...new Set(runs.map((run) => run.inferredFeedback?.state))]
        .map((state) => [state, runs.filter((run) => run.inferredFeedback?.state === state).length]))
    },
    providers: providerSummaries(tasks),
    accountAnalytics,
    dailyWorkload: daily,
    cohorts: [...groups.entries()].map(([key, values]) => ({ key, summary: summarize(values) })),
    logicalCohorts: [...logicalGroups.entries()].map(([key, values]) => ({ key, summary: summarize(values) })),
    runs: runs.map((run) => ({
      ...run,
      commandFailureExitCodes: [...run.commandFailureExitCodes.entries()],
      specialistAgents: [...run.specialistAgents]
    })),
    tasks: tasks.map((task) => ({
      ...task,
      commandFailureExitCodes: [...task.commandFailureExitCodes.entries()],
      specialistAgents: [...task.specialistAgents],
      delegatedModels: [...task.delegatedModels],
      requestedDelegateRoutes: [...task.requestedDelegateRoutes],
      annotation: task.annotation
    })),
    logicalTasks: logicalTasks.map((task) => ({
      ...task,
      attempts: task.attemptKeys,
      parallelGroups: [...task.parallelGroups],
      stageContextModes: [...task.stageContextModes],
      stageProviders: [...task.stageProviders],
      stageRequestedModels: [...task.stageRequestedModels],
      stageObservedModels: [...task.stageObservedModels],
      stageAgentPaths: [...task.stageAgentPaths],
      commandFailureExitCodes: [...task.commandFailureExitCodes.entries()],
      specialistAgents: [...task.specialistAgents],
      delegatedModels: [...task.delegatedModels],
      requestedDelegateRoutes: [...task.requestedDelegateRoutes]
    }))
  };
  if (format === "json") process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else if (format === "csv") process.stdout.write(csvReport(tasks));
  else if (format === "logical-csv") process.stdout.write(logicalCsvReport(logicalTasks));
  else if (format === "stage-csv") process.stdout.write(stageCsvReport(logicalTasks));
  else if (format === "daily-csv") process.stdout.write(dailyCsvReport(daily));
  else process.stdout.write(markdownReport(report, tableLimit));
}

async function recordOutcome(options) {
  const result = required(options, "result");
  if (!options["task-id"] && result === "correct") {
    throw new Error("A correct outcome requires a logical --task-id and an acceptance interaction");
  }
  const allowedResults = options["task-id"]
    ? new Set(["correct", "changes-needed", "blocked", "abandoned"])
    : new Set(["changes-needed", "blocked"]);
  if (!allowedResults.has(result)) throw new Error("Invalid --result for this outcome form");
  if (options.quality !== undefined && !options["task-id"]) {
    throw new Error("--quality is only valid for a logical task with --task-id");
  }
  required(options, "verification");
  if (options["task-id"]) return recordLogicalOutcome(options, result);
  for (const field of ["workflow", "repo", "task-type", "risk", "routing-profile"]) required(options, field);

  const { root, sessions, annotations } = pathsFor(options);
  if (!existsSync(sessions)) throw new Error(`Sessions directory does not exist: ${sessions}`);
  const sinceMs = Date.now() - defaultDays * 24 * 60 * 60 * 1000;
  const files = await listJsonl(sessions, sinceMs);
  const parsed = await Promise.all(files.map((file) => parseRollout(file)));
  const metadata = await loadMetadata(annotations);
  const tasks = buildTasks(parsed, root, sinceMs)
    .map((task) => ({ ...task, annotation: metadata.attempts.get(task.taskKey) ?? {} }))
    .filter((task) => task.complete)
    .sort((a, b) => b.completedAtMs - a.completedAtMs);

  let task;
  if (options["task-key"]) {
    const taskKey = safeKey(options["task-key"], "task-key");
    task = tasks.find((candidate) => candidate.taskKey === taskKey);
  } else {
    const sessionId = safeKey(
      required({ "session-id": options["session-id"] ?? process.env.CODEX_SESSION_ID }, "session-id"),
      "session-id"
    );
    task = tasks.find((candidate) => candidate.sessionId === sessionId);
  }
  if (!task) throw new Error("No completed attempt matched this workspace and session");
  if (typeof task.annotation.accepted === "boolean") {
    throw new Error(`The latest completed attempt already has an outcome: ${task.taskKey}`);
  }

  const workflowVersion = (await fs.readFile(path.join(root, "WORKFLOW_VERSION"), "utf8")).trim();
  const observedModel = options.model ?? task.model;
  if (!observedModel) throw new Error("The completed attempt has no observable coordinator model; pass --model explicitly");
  const expectedSingleModel = {
    "single-luna": "gpt-5.6-luna",
    "single-terra": "gpt-5.6-terra",
    "single-sol-high": "gpt-5.6-sol"
  }[routingProfile(options)];
  if (expectedSingleModel && observedModel !== expectedSingleModel) {
    throw new Error(`Routing profile ${options["routing-profile"]} does not match observed model ${observedModel}`);
  }
  const accepted = result === "correct";
  const status = result === "blocked" ? "blocked" : "complete";
  await appendAnnotation({
    ...options,
    suppressOutput: true,
    "task-key": task.taskKey,
    "workflow-version": workflowVersion,
    "workflow-fingerprint": await workflowFingerprint(root),
    model: observedModel,
    status,
    accepted: String(accepted),
    "fix-rounds": result === "blocked" ? undefined : result === "changes-needed" ? "1" : "0",
    "user-corrections": result === "changes-needed" ? "1" : undefined
  });
  process.stdout.write(`Recorded ${result} for ${task.taskKey}\n`);
}

async function ownedLogicalTask(options, { allowTerminal = false } = {}) {
  const taskId = safeKey(required(options, "task-id"), "task-id");
  const metadata = await loadLifecycleMetadata(options);
  const logical = metadata.logicalTasks.get(taskId);
  if (!logical) throw new Error("Unknown logical task");
  if (logical.outcome && !allowTerminal) throw new Error("Logical task already has a terminal outcome");
  const sessionId = safeKey(
    required({ "session-id": options["session-id"] ?? process.env.CODEX_SESSION_ID }, "session-id"),
    "session-id"
  );
  if (sessionId !== logical.rootSessionId) throw new Error("Logical task belongs to a different root session");
  return { logical, sessionId, taskId };
}

async function interactionTurnId(options, sessionId) {
  const requested = options["turn-id"] ?? "current";
  if (requested !== "current") return safeKey(requested, "turn-id");
  const { sessions, claudeSessions } = pathsFor(options);
  const candidates = [];
  for (const [directory, parser] of [[sessions, parseRollout], [claudeSessions, parseClaudeTranscript]]) {
    if (!existsSync(directory)) continue;
    const files = (await listJsonl(directory, 0)).filter((file) => file.includes(sessionId));
    for (const file of files) {
      const parsed = await parser(file);
      if (parsed.meta?.sessionId !== sessionId || parsed.meta?.parentThreadId || parsed.meta?.isSubagent) continue;
      candidates.push(...parsed.events.filter((event) => ["task_started", "prompt_start"].includes(event.kind)));
    }
  }
  const latest = candidates.sort((a, b) => b.timestampMs - a.timestampMs)[0];
  const id = latest?.turnId ?? latest?.promptId;
  if (!id) throw new Error("Current prompt ID unavailable; pass the observed --turn-id");
  return safeKey(id, "turn-id");
}

async function recordInteraction(options) {
  const { logical, sessionId, taskId } = await ownedLogicalTask(options, { allowTerminal: true });
  const kind = required(options, "kind");
  if (!interactionKinds.has(kind)) throw new Error("Invalid --kind");
  const turnId = await interactionTurnId(options, sessionId);
  const previous = logical.interactions.get(turnId);
  if (previous) {
    if (previous.kind !== kind) throw new Error("Prompt already classified with a different kind");
    process.stdout.write(`Interaction already recorded for ${turnId}\n`);
    return;
  }
  await appendEvent(options, {
    schemaVersion, event: "logical_task_interaction", logicalTaskId: taskId,
    rootSessionId: sessionId, turnId, kind, timestamp: new Date().toISOString()
  });
  process.stdout.write(`Recorded ${kind} interaction for ${taskId}\n`);
}

async function recordCriterion(options) {
  if (required(options, "criterion-action") !== "record") throw new Error("Invalid criterion action");
  const { logical, sessionId, taskId } = await ownedLogicalTask(options);
  if (logical.schemaVersion < 13) throw new Error("Criteria are available only for registry-backed logical tasks");
  const criterionId = safeKey(required(options, "criterion-id"), "criterion-id");
  if (!logical.criteria.includes(criterionId)) throw new Error(`Criterion ${criterionId} was not declared at task start`);
  const state = required(options, "state");
  if (!new Set(["passed", "failed", "blocked", "unknown", "not-applicable"]).has(state)) {
    throw new Error("Invalid --state");
  }
  const verificationClass = safeKey(required(options, "verification-class"), "verification-class");
  if (!logical.verificationClasses.includes(verificationClass)) {
    throw new Error(`Unknown --verification-class: ${verificationClass}`);
  }
  const event = {
    schemaVersion,
    event: "logical_task_criterion_recorded",
    logicalTaskId: taskId,
    rootSessionId: sessionId,
    timestamp: new Date().toISOString(),
    criterionId,
    state,
    verificationClass,
    artifact: safeKey(required(options, "artifact"), "artifact")
  };
  await appendEvent(options, event);
  process.stdout.write(`Recorded ${state} for ${criterionId}\n`);
}

async function workingTreeDigest(repoRoot) {
  const [unstaged, staged, untrackedOutput] = await Promise.all([
    execFileAsync("git", ["-C", repoRoot, "diff", "--binary", "--no-ext-diff", "--"],
      { encoding: "buffer", maxBuffer: maxArtifactBytes + 1024 * 1024 }),
    execFileAsync("git", ["-C", repoRoot, "diff", "--cached", "--binary", "--no-ext-diff", "HEAD", "--"],
      { encoding: "buffer", maxBuffer: maxArtifactBytes + 1024 * 1024 }),
    execFileAsync("git", ["-C", repoRoot, "ls-files", "--others", "--exclude-standard", "-z"],
      { encoding: "buffer", maxBuffer: maxArtifactBytes + 1024 * 1024 })
  ]);
  const untracked = untrackedOutput.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  if (untracked.length > maxArtifactFiles) throw new Error(`Artifact has more than ${maxArtifactFiles} untracked files`);
  const hash = createHash("sha256");
  hash.update("unstaged\0");
  hash.update(unstaged.stdout);
  hash.update("\0staged\0");
  hash.update(staged.stdout);
  let bytes = unstaged.stdout.length + staged.stdout.length;
  if (bytes > maxArtifactBytes) throw new Error(`Artifact identity exceeds ${maxArtifactBytes} bytes`);
  for (const relative of untracked) {
    const target = path.join(repoRoot, relative);
    const stats = await fs.lstat(target);
    if (!stats.isFile() && !stats.isSymbolicLink()) throw new Error(`Unsupported untracked artifact: ${relative}`);
    bytes += Buffer.byteLength(relative) + stats.size;
    if (bytes > maxArtifactBytes) throw new Error(`Artifact identity exceeds ${maxArtifactBytes} bytes`);
    const contents = stats.isSymbolicLink() ? Buffer.from(await fs.readlink(target)) : await fs.readFile(target);
    bytes += contents.length - stats.size;
    if (bytes > maxArtifactBytes) throw new Error(`Artifact identity exceeds ${maxArtifactBytes} bytes`);
    hash.update("\0untracked\0");
    hash.update(relative);
    hash.update("\0");
    hash.update(contents);
  }
  return {
    dirtyPatchSha256: hash.digest("hex"),
    clean: unstaged.stdout.length === 0 && staged.stdout.length === 0 && untracked.length === 0
  };
}

async function computeArtifactIdentity(repoPath, baseSha) {
  const { stdout: rootOutput } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const repoRoot = rootOutput.trim();
  await execFileAsync("git", ["-C", repoRoot, "cat-file", "-e", `${baseSha}^{commit}`]);
  const { stdout: headOutput } = await execFileAsync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  const headSha = fullCommitSha(headOutput.trim(), "head-sha");
  await execFileAsync("git", ["-C", repoRoot, "merge-base", "--is-ancestor", baseSha, headSha]);
  return { repoRoot, baseSha, headSha, ...await workingTreeDigest(repoRoot) };
}

function artifactIdFor(repo, identity) {
  return createHash("sha256")
    .update([repo, identity.baseSha, identity.headSha, identity.dirtyPatchSha256].join("\0"))
    .digest("hex");
}

async function recordArtifact(options) {
  const action = required(options, "artifact-action");
  if (!new Set(["bind", "verify"]).has(action)) throw new Error("Invalid artifact action");
  const { logical, sessionId, taskId } = await ownedLogicalTask(options);
  if (logical.schemaVersion < 13) throw new Error("Artifacts are available only for registry-backed logical tasks");
  const repoPath = path.resolve(expandHome(required(options, "repo-path")));
  const repo = safeKey(required(options, "repo"), "repo");
  if (!logical.artifactRepos.includes(repo)) throw new Error(`Artifact repo ${repo} was not declared at task start`);
  if (action === "bind") {
    const baseSha = fullCommitSha(required(options, "base-sha"), "base-sha");
    const identity = await computeArtifactIdentity(repoPath, baseSha);
    const artifactId = artifactIdFor(repo, identity);
    await appendEvent(options, {
      schemaVersion,
      event: "logical_task_artifact_bound",
      logicalTaskId: taskId,
      rootSessionId: sessionId,
      timestamp: new Date().toISOString(),
      artifactId,
      repo,
      baseSha: identity.baseSha,
      headSha: identity.headSha,
      dirtyPatchSha256: identity.dirtyPatchSha256,
      clean: identity.clean
    });
    process.stdout.write(`${artifactId}\n`);
    return;
  }

  const binding = logical.artifacts.filter((artifact) => artifact.repo === repo).at(-1);
  if (!binding) throw new Error(`Logical task has no bound artifact for ${repo}`);
  const identity = await computeArtifactIdentity(repoPath, binding.baseSha);
  const artifactId = artifactIdFor(binding.repo, identity);
  if (artifactId !== binding.artifactId) throw new Error("Artifact identity changed after it was bound");
  const hasRemote = options.remote !== undefined || options["remote-ref"] !== undefined;
  if (hasRemote && (!options.remote || !options["remote-ref"])) {
    throw new Error("Provide both --remote and --remote-ref");
  }
  let remote;
  let remoteRef;
  let remoteSha;
  if (hasRemote) {
    if (!binding.clean) throw new Error("Remote verification requires a clean bound artifact");
    remote = safeKey(options.remote, "remote");
    remoteRef = safeKey(options["remote-ref"], "remote-ref");
    const { stdout } = await execFileAsync("git", ["-C", identity.repoRoot, "ls-remote", "--exit-code", remote, remoteRef], { encoding: "utf8" });
    const matches = stdout.trim().split("\n").filter(Boolean);
    if (matches.length !== 1) throw new Error(`Remote ref ${remoteRef} did not resolve exactly once`);
    remoteSha = fullCommitSha(matches[0].split(/\s+/)[0], "remote-sha");
    if (remoteSha !== identity.headSha) throw new Error("Remote ref does not match the bound artifact HEAD");
  }
  await appendEvent(options, {
    schemaVersion,
    event: "logical_task_artifact_verified",
    logicalTaskId: taskId,
    rootSessionId: sessionId,
    timestamp: new Date().toISOString(),
    artifactId,
    repo,
    remoteVerified: Boolean(remoteSha),
    remoteSha,
    remote,
    remoteRef
  });
  process.stdout.write(`Verified artifact ${artifactId}${remoteSha ? ` at ${remoteSha}` : " locally"}\n`);
}

async function showTaskStatus(options) {
  const { annotations } = pathsFor(options);
  const taskId = safeKey(required(options, "task-id"), "task-id");
  const logical = (await loadLifecycleMetadata(options)).logicalTasks.get(taskId);
  if (!logical) throw new Error("Unknown logical task");
  const openStage = [...logical.stages.values()].find((stage) => !stage.finish);
  const delivery = currentLogicalDelivery(logical);
  const state = logical.outcome?.result ?? (openStage ? "open-stage" : delivery ? "awaiting-feedback" : "active");
  const passedCriteria = [...logical.criterionEvidence.values()]
    .filter((criterion) => new Set(["passed", "not-applicable"]).has(criterion.state)).length;
  const readiness = logical.schemaVersion >= 13 ? logicalReadiness(logical) : undefined;
  const result = {
    taskId,
    state,
    workflowId: logical.workflowId,
    risk: logical.risk,
    stagePath: stagePathFor(logical.stages.values()),
    openStage: openStage?.name ?? null,
    criteria: { passed: passedCriteria, total: logical.criteria?.length ?? 0 },
    artifacts: readiness?.artifactStates ?? [],
    remoteArtifactVerified: readiness?.remoteArtifactVerified ?? false,
    missingStageClasses: readiness?.missingClasses ?? [],
    incompleteCriteria: readiness?.incompleteCriteria ?? [],
    delegationEnforcement: logical.schemaVersion >= 15 ? "enforced" : "legacy-unverified",
    next: logical.outcome ? "none" : openStage ? `finish stage ${openStage.stageId}` :
      delivery ? "record requester outcome" : readiness?.missingClasses.length ?
        `start required stage class ${readiness.missingClasses[0]}` :
        readiness?.incompleteCriteria.length ? `record criterion ${readiness.incompleteCriteria[0]}` :
          logical.requiresRemoteArtifact && !readiness?.remoteArtifactVerified ? "bind and verify declared artifacts" :
            "deliver the result"
  };
  const format = options.format ?? "text";
  if (!new Set(["text", "json"]).has(format)) throw new Error("Invalid --format");
  if (format === "json") process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write([
    `Task: ${result.taskId}`,
    `State: ${result.state}`,
    `Workflow: ${result.workflowId}`,
    `Stages: ${result.stagePath || "none"}`,
    `Criteria: ${result.criteria.passed}/${result.criteria.total}`,
    `Next: ${result.next}`
  ].join("\n") + "\n");
}

async function printTaskReceipt(options) {
  const { annotations } = pathsFor(options);
  const taskId = safeKey(required(options, "task-id"), "task-id");
  const logical = (await loadMetadata(annotations)).logicalTasks.get(taskId);
  if (!logical) throw new Error("Unknown logical task");
  const stages = [...logical.stages.values()];
  if (stages.some((stage) => !stage.finish)) throw new Error("Finish open stages before generating the receipt");
  const verification = required(options, "verification");
  const labels = { passed: "✅ PASSED", partial: "⚠️ PARTIAL", failed: "❌ FAILED", "not-run": "• NOT-RUN" };
  if (!labels[verification]) throw new Error("Invalid --verification");
  const checks = numeric(options, "verification-checks", { integer: true, min: verification === "not-run" ? 0 : 1 });
  if (checks === undefined || (verification === "not-run" && checks !== 0)) throw new Error("Supply the actual --verification-checks count");
  const stagePath = stagePathFor(stages);
  if (stagePath.length > maxWorkflowPathLength) throw new Error("Recorded stage path exceeds the receipt parser limit");
  process.stdout.write([
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "Workflow receipt (metadata)", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Workflow:     ${logical.workflowId}`, `Path:         ${stagePath}`,
    `Stages:       ${stages.filter((stage) => stage.finish.status === "completed").length}/${stages.length}`,
    `Delegation:   ${logical.delegationMode}`, `Task:         ${taskId}`, `Risk:         ${logical.risk}`,
    `Verification: ${labels[verification]} (${checks} checks)`, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ].join("\n") + "\n");
}

async function recordStage(options) {
  const action = required(options, "stage-action");
  if (!new Set(["start", "bind", "finish"]).has(action)) throw new Error("Invalid stage action");
  const { annotations } = pathsFor(options);
  const taskId = safeKey(required(options, "task-id"), "task-id");
  const metadata = await loadLifecycleMetadata(options);
  const logical = metadata.logicalTasks.get(taskId);
  if (!logical) throw new Error("Unknown logical task");
  if (logical.outcome) throw new Error("Logical task already has a terminal outcome");
  const sessionId = safeKey(
    required({ "session-id": options["session-id"] ?? process.env.CODEX_SESSION_ID }, "session-id"),
    "session-id"
  );
  if (sessionId !== logical.rootSessionId) throw new Error("Logical task belongs to a different root session");

  if (action === "start") {
    if (currentLogicalDelivery(logical)) {
      throw new Error("Logical task is delivered; record the follow-up interaction before another stage");
    }
    const executor = required(options, "executor");
    const contextMode = required(options, "context-mode");
    const provider = required(options, "provider");
    if (!stageExecutors.has(executor)) throw new Error("Invalid --executor");
    if (!stageContextModes.has(contextMode)) throw new Error("Invalid --context-mode");
    if (!stageProviders.has(provider)) throw new Error("Invalid --provider");
    if (executor === "coordinator" && contextMode !== "none") {
      throw new Error("Coordinator stages must use --context-mode none");
    }
    const sequence = positiveInteger(options, "sequence");
    if ([...logical.stages.values()].some((stage) => stage.sequence === sequence)) {
      throw new Error("Stage sequence already exists for this logical task");
    }
    const name = safeKey(required(options, "name"), "name");
    let stageClass;
    if (logical.schemaVersion >= 13) {
      stageClass = safeKey(required(options, "stage-class"), "stage-class");
      if (!logical.allowedStageClasses.includes(stageClass)) {
        throw new Error(`Stage class ${stageClass} is not allowed for ${logical.workflowId}`);
      }
      const prerequisites = stageClassPrerequisites(logical, stageClass);
      const completedClasses = completedPassingStageClasses(logical);
      const missing = prerequisites.filter((value) => !completedClasses.has(value));
      if (missing.length) throw new Error(`Stage class ${stageClass} requires completed: ${missing.join(", ")}`);
    } else if (options["stage-class"]) {
      stageClass = safeKey(options["stage-class"], "stage-class");
    }
    if (stagePathFor([...logical.stages.values(), { sequence, name }]).length > maxWorkflowPathLength) {
      throw new Error(`Stage path must be ${maxWorkflowPathLength} characters or fewer`);
    }
    let objectiveId;
    let scope;
    let access;
    let dependsOn;
    let completionSignal;
    let fanInOwner;
    if (logical.schemaVersion >= 15) {
      objectiveId = safeKey(required(options, "objective-id"), "objective-id");
      scope = safeKey(required(options, "scope"), "scope");
      access = required(options, "access");
      if (!stageAccessModes.has(access)) throw new Error("Invalid --access");
      const rawDependencies = required(options, "depends-on");
      dependsOn = rawDependencies === "none" ? [] : safeKeyList(rawDependencies, "depends-on");
      completionSignal = required(options, "completion-signal");
      if (completionSignal !== "stage-report-v1") throw new Error("--completion-signal must be stage-report-v1");
      fanInOwner = safeKey(required(options, "fan-in-owner"), "fan-in-owner");
      if (fanInOwner !== "/root") throw new Error("--fan-in-owner must be /root");
      if ([...logical.stages.values()].some((stage) => !stage.finish && stage.objectiveId === objectiveId)) {
        throw new Error(`Unfinished stage objective already exists: ${objectiveId}`);
      }
      for (const dependencyId of dependsOn) {
        const dependency = logical.stages.get(dependencyId);
        if (!dependency) throw new Error(`Missing dependency stage: ${dependencyId}`);
        if (dependency.finish?.status !== "completed" || dependency.finish.outcome !== "pass") {
          throw new Error(`Dependency stage is not completed/pass: ${dependencyId}`);
        }
      }
      if (access === "write") {
        const activeWriter = [...metadata.logicalTasks.values()].flatMap((task) =>
          task.outcome ? [] : [...task.stages.values()].filter((stage) => !stage.finish && stage.access === "write"));
        if (activeWriter.length) throw new Error(`Another unfinished writer reservation exists: ${activeWriter[0].stageId}`);
      }
      if (executor === "delegate") {
        const activeDelegates = [...metadata.logicalTasks.values()].reduce((count, task) => count +
          (task.outcome ? 0 : [...task.stages.values()].filter((stage) =>
            !stage.finish && stage.executor === "delegate").length), 0);
        if (activeDelegates >= 4) throw new Error("The ledger already has four unfinished delegate reservations");
      }
      if (options["parallel-group"]) {
        const group = safeKey(options["parallel-group"], "parallel-group");
        const members = [...logical.stages.values()].filter((stage) => stage.parallelGroup === group);
        if (members.length >= 4) throw new Error(`Parallel group ${group} already has four stages`);
        if (members.some((stage) => stage.fanInOwner !== fanInOwner)) {
          throw new Error(`Parallel group ${group} must retain one fan-in owner`);
        }
      }
    }
    const event = {
      schemaVersion,
      event: "logical_task_stage_started",
      logicalTaskId: taskId,
      rootSessionId: sessionId,
      stageId: options["stage-id"]
        ? safeKey(options["stage-id"], "stage-id")
        : `st-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      sequence,
      name,
      stageClass,
      role: safeKey(required(options, "role"), "role"),
      executor,
      contextMode,
      provider,
      requestedModel: safeKey(required(options, "requested-model"), "requested-model"),
      parallelGroup: options["parallel-group"] && safeKey(options["parallel-group"], "parallel-group"),
      objectiveId,
      scope,
      access,
      dependsOn,
      completionSignal,
      fanInOwner
    };
    if (logical.stages.has(event.stageId)) throw new Error("Stage ID already exists for this logical task");
    Object.keys(event).forEach((key) => event[key] === undefined && delete event[key]);
    await appendEvent(options, event);
    process.stdout.write(`${event.stageId}\n`);
    return;
  }

  const stageId = safeKey(required(options, "stage-id"), "stage-id");
  const stage = logical.stages.get(stageId);
  if (!stage) throw new Error("Unknown stage for this logical task");
  if (stage.finish) throw new Error("Stage already has a terminal report");
  if (action === "bind") {
    if (logical.schemaVersion < 15) throw new Error("Stage binding is available only for schema-15 logical tasks");
    if (stage.executor !== "delegate") throw new Error("Only delegate stages may be bound");
    if (stage.binding) throw new Error("Stage is already bound");
    const provider = required(options, "provider");
    if (provider !== stage.provider) throw new Error(`Binding provider must match reserved provider ${stage.provider}`);
    const agentPath = safeKey(required(options, "agent-path"), "agent-path");
    if (!isCanonicalAgentPath(agentPath)) throw new Error("--agent-path must be a canonical /root/... path");
    const providerRunId = options["provider-run-id"] && safeKey(options["provider-run-id"], "provider-run-id");
    const activeBindings = [...metadata.logicalTasks.values()].flatMap((task) => task.outcome ? [] :
      [...task.stages.values()].filter((candidate) => !candidate.finish && candidate.binding)
        .map((candidate) => ({ candidate, rootSessionId: task.rootSessionId })));
    if (activeBindings.some(({ candidate, rootSessionId }) =>
      rootSessionId === logical.rootSessionId && candidate.binding.agentPath === agentPath)) {
      throw new Error(`Active agent path is already bound: ${agentPath}`);
    }
    if (providerRunId && activeBindings.some(({ candidate }) => candidate.binding.providerRunId === providerRunId)) {
      throw new Error(`Active provider run ID is already bound: ${providerRunId}`);
    }
    const event = {
      schemaVersion,
      event: "logical_task_stage_bound",
      logicalTaskId: taskId,
      rootSessionId: sessionId,
      stageId,
      timestamp: new Date().toISOString(),
      provider,
      agentPath,
      providerRunId
    };
    Object.keys(event).forEach((key) => event[key] === undefined && delete event[key]);
    await appendEvent(options, event);
    process.stdout.write(`Bound stage ${stageId} to ${agentPath}\n`);
    return;
  }
  const status = required(options, "status");
  const outcome = required(options, "outcome");
  if (!stageStatuses.has(status)) throw new Error("Invalid --status");
  if (!stageOutcomes.has(outcome) || !validStageDisposition(status, outcome)) {
    throw new Error("Invalid --outcome for stage status");
  }
  const verificationChecks = nonNegativeInteger(options, "verification-checks");
  if (verificationChecks === undefined) throw new Error("Missing --verification-checks");
  if (logical.schemaVersion >= 13 && status === "completed" && outcome === "pass" &&
    evidenceBearingStageClasses.has(stage.stageClass) && verificationChecks < 1) {
    throw new Error(`Stage class ${stage.stageClass} requires at least one verification check`);
  }
  const agentPath = safeKey(required(options, "agent-path"), "agent-path");
  const reportReadback = booleanValue(options, "report-readback");
  const failureReason = options["failure-reason"] && safeKey(options["failure-reason"], "failure-reason");
  const exactUnboundSpawnFailure = logical.schemaVersion >= 15 && stage.executor === "delegate" && !stage.binding &&
    status === "failed" && outcome === "unknown" && spawnFailureReasons.has(failureReason);
  if (failureReason !== undefined && !exactUnboundSpawnFailure) {
    throw new Error("--failure-reason is valid only for an unbound failed/unknown delegate spawn failure");
  }
  if (logical.schemaVersion >= 15 && stage.executor === "delegate") {
    if (!stage.binding && !exactUnboundSpawnFailure) throw new Error("Delegate stage must be bound before finish");
    if (stage.binding && agentPath !== stage.binding.agentPath) throw new Error("--agent-path does not match the stage binding");
    if (status === "completed" && reportReadback !== true) {
      throw new Error("Completed delegate stage requires --report-readback true");
    }
  }
  const event = {
    schemaVersion,
    event: "logical_task_stage_finished",
    logicalTaskId: taskId,
    rootSessionId: sessionId,
    stageId,
    timestamp: new Date().toISOString(),
    status,
    outcome,
    verificationChecks,
    findings: nonNegativeInteger(options, "findings"),
    observedModel: safeKey(required(options, "observed-model"), "observed-model"),
    agentPath,
    handoff: safeKey(required(options, "handoff"), "handoff"),
    reportReadback,
    failureReason
  };
  if (event.findings === undefined) throw new Error("Missing --findings");
  await appendEvent(options, event);
  process.stdout.write(`Recorded ${status} stage ${stageId} for ${taskId}\n`);
}

async function startLogicalTask(options) {
  for (const field of ["workflow", "repo", "task-type", "risk", "routing-profile"]) required(options, field);
  const risk = numeric(options, "risk", { integer: true, min: 0, max: 3 });
  const acceptanceChecks = positiveInteger(options, "acceptance-checks");
  const criteria = safeKeyList(options.criteria, "criteria");
  if (criteria.length !== acceptanceChecks) {
    throw new Error("--criteria count must equal --acceptance-checks");
  }
  const evidenceClasses = positiveInteger(options, "evidence-classes");
  const mode = delegationMode(options);
  if (mode === "fan-out" && evidenceClasses < 2) {
    throw new Error("fan-out requires at least 2 independent --evidence-classes");
  }
  const { root, annotations } = pathsFor(options);
  const registry = await loadRegistry(root);
  const workflow = safeKey(options.workflow, "workflow");
  const taskType = safeKey(options["task-type"], "task-type");
  const definition = workflowDefinition(registry, workflow);
  if (!definition.taskTypes.includes(taskType)) {
    throw new Error(`Workflow ${workflow} does not allow task type ${taskType}`);
  }
  if (!definition.risks.includes(risk)) {
    throw new Error(`Workflow ${workflow} does not allow risk ${risk}`);
  }
  const sessionId = safeKey(required({ "session-id": options["session-id"] ?? process.env.CODEX_SESSION_ID }, "session-id"), "session-id");
  const metadata = await loadLifecycleMetadata(options);
  const openTask = [...metadata.logicalTasks.values()].find(
    (task) => task.rootSessionId === sessionId && !task.outcome && !currentLogicalDelivery(task)
  );
  const event = {
    schemaVersion,
    event: "logical_task_started",
    logicalTaskId: options["task-id"] ? safeKey(options["task-id"], "task-id") : `lt-${randomUUID()}`,
    rootSessionId: sessionId,
    timestamp: new Date().toISOString(),
    workflowVersion: (await fs.readFile(path.join(root, "WORKFLOW_VERSION"), "utf8")).trim(),
    workflowFingerprint: await workflowFingerprint(root),
    workflowId: workflow,
    routeId: definition.routeId,
    registryVersion: registry.schemaVersion,
    allowedStageClasses: [...definition.allowedStageClasses],
    requiredStageClasses: requiredStageClassesFor(definition, risk),
    verificationClasses: [...registry.verificationClasses],
    requiresRemoteArtifact: definition.requiresRemoteArtifact,
    artifactRepos: options["artifact-repos"] ? safeKeyList(options["artifact-repos"], "artifact-repos") : [],
    repo: safeKey(options.repo, "repo"),
    taskType,
    risk,
    routingProfile: routingProfile(options),
    delegationMode: mode,
    acceptanceChecks,
    criteria,
    evidenceClasses
  };
  if (event.requiresRemoteArtifact && event.artifactRepos.length === 0) {
    throw new Error(`Workflow ${workflow} requires --artifact-repos`);
  }
  if (metadata.logicalTasks.has(event.logicalTaskId)) throw new Error("Logical task ID already exists");
  if (openTask) {
    if ([...openTask.stages.values()].some((stage) => !stage.finish)) {
      throw new Error(`Open stage remains on ${openTask.logicalTaskId}; finish it before starting a new task`);
    }
    const correctionCount = openTask.feedback.length;
    await appendEvent(options, {
      schemaVersion,
      event: "logical_task_outcome",
      logicalTaskId: openTask.logicalTaskId,
      timestamp: event.timestamp,
      result: "abandoned",
      status: "abandoned",
      verification: "not-run",
      fixRounds: correctionCount,
      userCorrections: correctionCount || undefined,
      closeReason: "superseded-by-new-task"
    });
    process.stderr.write(`Closed ${openTask.logicalTaskId} as abandoned before starting a new task\n`);
  }
  await appendEvent(options, event);
  process.stdout.write(`${event.logicalTaskId}\n`);
}

async function recordLogicalOutcome(options, result) {
  const taskId = safeKey(options["task-id"], "task-id");
  const quality = numeric(options, "quality", { integer: true, min: 1, max: 5 });
  if (!new Set(["passed", "partial", "failed", "not-run"]).has(options.verification)) {
    throw new Error("Invalid --verification");
  }
  const verificationChecks = options.verification === "not-run"
    ? undefined
    : positiveInteger(options, "verification-checks");
  if (options.verification === "not-run" && options["verification-checks"] !== undefined) {
    throw new Error("--verification-checks is only valid when verification is not not-run");
  }
  const metadata = await loadLifecycleMetadata(options);
  const logical = metadata.logicalTasks.get(taskId);
  if (!logical) throw new Error("Unknown logical task");
  const reopensCorrectOutcome = result === "changes-needed" && logical.outcome?.result === "correct";
  if (logical.outcome && !reopensCorrectOutcome) throw new Error("Logical task already has a terminal outcome");
  if ([...logical.stages.values()].some((stage) => !stage.finish)) {
    throw new Error("Logical task has an open stage; finish it before recording requester feedback");
  }
  const sessionId = safeKey(
    required({ "session-id": options["session-id"] ?? process.env.CODEX_SESSION_ID }, "session-id"),
    "session-id"
  );
  if (sessionId !== logical.rootSessionId) throw new Error("Logical task belongs to a different root session");
  const acceptanceTurnId = result === "correct"
    ? await interactionTurnId({ ...options, "turn-id": required(options, "turn-id") }, sessionId)
    : undefined;
  if (acceptanceTurnId && logical.interactions.get(acceptanceTurnId)?.kind !== "acceptance") {
    throw new Error("A correct outcome requires an acceptance interaction for the same --turn-id");
  }
  if (result === "changes-needed") {
    const turnId = options["turn-id"] ? await interactionTurnId(options, sessionId) : undefined;
    if (turnId && logical.feedback.some((event) => event.turnId === turnId)) {
      process.stdout.write(`Feedback already recorded for ${turnId}\n`);
      return;
    }
    const correctionCount = logical.feedback.length + 1;
    await appendEvent(options, {
      schemaVersion,
      event: "logical_task_feedback",
      turnId,
      logicalTaskId: taskId,
      timestamp: new Date().toISOString(),
      result,
      verification: options.verification,
      verificationChecks,
      quality,
      fixRounds: correctionCount,
      userCorrections: correctionCount
    });
    process.stdout.write(`Recorded changes-needed feedback for ${taskId}; task remains open\n`);
    return;
  }
  if (result === "correct" && logical.schemaVersion >= 13) {
    if (options.verification !== "passed") throw new Error("A correct outcome requires --verification passed");
    if (logical.feedback.length) {
      const feedbackAt = Date.parse(logical.feedback.at(-1).timestamp);
      const freshStages = [...logical.stages.values()].filter((stage) =>
        stage.finish?.status === "completed" && stage.finish.outcome === "pass" &&
        Date.parse(stage.finish.timestamp) > feedbackAt);
      if (!freshStages.some((stage) => new Set(["implementation", "correction"]).has(stage.stageClass)) ||
        !freshStages.some((stage) => stage.stageClass === "verification")) {
        throw new Error("A corrected task requires fresh correction and verification stages after the latest changes-needed feedback");
      }
    }
    const readiness = logicalReadiness(logical);
    if (readiness.missingClasses.length) {
      throw new Error(`Required stage classes are not satisfied: ${readiness.missingClasses.join(", ")}`);
    }
    if (readiness.incompleteCriteria.length) {
      throw new Error(`Acceptance criteria are not satisfied: ${readiness.incompleteCriteria.join(", ")}`);
    }
    if (logical.requiresRemoteArtifact && !readiness.remoteArtifactVerified) {
      throw new Error("A remotely verified bound artifact is required for a correct outcome");
    }
    const delivery = currentLogicalDelivery(logical);
    const acceptance = logical.interactions.get(acceptanceTurnId);
    if (!delivery || Date.parse(acceptance.timestamp) < Date.parse(delivery.timestamp)) {
      throw new Error("A correct outcome requires a delivered receipt before the acceptance interaction");
    }
  }
  if (result === "abandoned" && options.verification !== "not-run") {
    throw new Error("An abandoned task must use --verification not-run");
  }
  const correctionCount = logical.feedback.length;
  await appendEvent(options, {
    schemaVersion,
    event: "logical_task_outcome",
    turnId: acceptanceTurnId,
    logicalTaskId: taskId,
    timestamp: new Date().toISOString(),
    result,
    status: result === "blocked" ? "blocked" : result === "abandoned" ? "abandoned" : "complete",
    accepted: result === "abandoned" ? undefined : result === "correct",
    verification: options.verification,
    verificationChecks,
    quality,
    fixRounds: correctionCount,
    userCorrections: correctionCount || undefined
  });
  process.stdout.write(`Recorded ${result} for ${taskId}\n`);
}

async function printFingerprint(options) {
  const { root } = pathsFor(options);
  process.stdout.write(`${await workflowFingerprint(root)}\n`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help" || options.help) return printHelp();
  if (command === "annotate") return withLedgerLock(options, () => appendAnnotation(options));
  if (command === "interaction") return withLedgerLock(options, () => recordInteraction(options));
  if (command === "task" && options["task-action"] === "start") {
    return withLedgerLock(options, () => startLogicalTask(options));
  }
  if (command === "task" && options["task-action"] === "status") return showTaskStatus(options);
  if (command === "task" && options["task-action"] === "receipt") return printTaskReceipt(options);
  if (command === "stage") return withLedgerLock(options, () => recordStage(options));
  if (command === "criterion") return withLedgerLock(options, () => recordCriterion(options));
  if (command === "artifact") return withLedgerLock(options, () => recordArtifact(options));
  if (command === "outcome") return withLedgerLock(options, () => recordOutcome(options));
  if (command === "hook") return runHook(options);
  if (command === "fingerprint") return printFingerprint(options);
  if (command === "summary") return summary(options);
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`Workflow metrics failed: ${error.message}\n`);
  process.exitCode = 1;
});
