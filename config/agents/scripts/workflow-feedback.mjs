export const satisfactionWindowMs = 24 * 60 * 60 * 1000;
export const interactionKinds = new Set(['correction', 'clarification', 'approval', 'acceptance', 'continuation', 'new-work', 'unknown']);
const tokenFields = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens', 'totalTokens'];

// A whole provider turn can straddle task boundaries. Allocation is an estimate,
// but every token belongs to the aggregate exactly once.
export function allocateSharedUsage(logicalTasks) {
  const owners = new Map();
  for (const task of logicalTasks) {
    for (const attempt of task.attempts) {
      const values = owners.get(attempt.taskKey) ?? [];
      values.push(task.logicalTaskId);
      owners.set(attempt.taskKey, values);
    }
  }
  for (const values of owners.values()) values.sort();
  for (const task of logicalTasks) {
    task.sharedAttemptCount = task.attempts.filter((attempt) => owners.get(attempt.taskKey).length > 1).length;
    task.usageAttribution = task.sharedAttemptCount ? 'equal-share-estimate' : 'whole-turn';
    for (const field of tokenFields) {
      task[field] = task.attempts.reduce((sum, attempt) => {
        const values = owners.get(attempt.taskKey);
        const tokens = attempt[field] ?? 0;
        const rank = values.indexOf(task.logicalTaskId);
        return sum + Math.floor(tokens / values.length) + (rank < tokens % values.length ? 1 : 0);
      }, 0);
    }
  }
}

export function inferSessionFeedback({ attempts, logicalTasks, sessionEnd, historyComplete, latestActivityAtMs = 0, now = Date.now() }) {
  const interactions = new Map();
  // The same prompt can touch two tasks; the strongest friction label wins.
  const severity = { unknown: 0, approval: 1, acceptance: 1, continuation: 1, 'new-work': 1, clarification: 2, correction: 3 };
  for (const task of logicalTasks) {
    for (const item of task.interactions ?? []) {
      if (!interactions.has(item.turnId) || severity[item.kind] > severity[interactions.get(item.turnId).kind]) {
        interactions.set(item.turnId, item);
      }
    }
  }
  const classified = [...interactions.values()];
  const corrections = classified.filter((item) => item.kind === 'correction').length;
  const clarifications = classified.filter((item) => item.kind === 'clarification').length;
  const unidentifiedCorrections = logicalTasks.reduce((sum, task) => sum + (task.unidentifiedCorrections ?? 0), 0);
  const result = {
    source: 'inferred', confidence: 'low', windowHours: 24,
    state: 'unknown', rating: null, corrections, clarifications, unidentifiedCorrections,
    classifiedInteractions: classified.length,
    explicitQualityPresent: logicalTasks.some((task) => Number.isFinite(task.annotation?.quality))
  };
  const unknown = (reason, state = 'unknown') => ({ ...result, state, reason });
  if (result.explicitQualityPresent) return unknown('explicit-rating-takes-precedence', 'explicit-feedback');
  if (!historyComplete) return unknown('incomplete-session-history');
  if (!sessionEnd) return unknown('no-session-end');
  const closedAt = Date.parse(sessionEnd.timestamp);
  if (!Number.isFinite(closedAt)) return unknown('invalid-session-end');
  const latest = Math.max(latestActivityAtMs, ...attempts.map((task) => Math.max(task.startedAtMs ?? 0, task.completedAtMs ?? 0)),
    ...classified.map((item) => Date.parse(item.timestamp) || 0));
  if (latest > closedAt) return unknown('activity-after-close', 'resumed');
  if (now - closedAt < satisfactionWindowMs) return unknown('waiting-24-hours', 'pending');
  if (!attempts.length || attempts.some((task) => !task.complete)) return unknown('unfinished-attempts');
  const trackedAttempts = new Set(logicalTasks.flatMap((task) => task.attemptKeys ?? []));
  if (attempts.some((task) => !trackedAttempts.has(task.taskKey) &&
    (task.annotation?.accepted === false || ['blocked', 'abandoned'].includes(task.annotation?.status) ||
      ['partial', 'failed'].includes(task.annotation?.verification)))) return unknown('unresolved-attempt');
  if (logicalTasks.some((task) => !task.delivered || task.openStages > 0 ||
    ['blocked', 'abandoned'].includes(task.annotation?.status) || ['partial', 'failed'].includes(task.annotation?.verification))) {
    return unknown('unresolved-work');
  }
  if (unidentifiedCorrections || classified.some((item) => item.kind === 'unknown')) return unknown('unclassified-feedback');
  // Do not silently score historical multi-prompt sessions whose follow-ups were
  // never classified. A prompt can be an approval or an entirely new request.
  const knownTurns = new Set(classified.map((item) => item.turnId));
  const initialTurns = new Set(logicalTasks.flatMap((task) => task.initialTurnIds ?? []));
  const unexplained = attempts.slice(1).filter((task) => {
    const id = task.turnId ?? task.taskKey?.slice(task.taskKey.indexOf(':') + 1);
    return !knownTurns.has(id) && !initialTurns.has(id);
  }).length;
  result.unclassifiedFollowups = unexplained;
  if (unexplained) return { ...result, reason: 'unclassified-followups' };
  const rating = Math.max(1, 5 - corrections - clarifications);
  return { ...result, rating, state: rating === 5 ? 'probably-satisfied' : rating >= 3 ? 'some-friction' : 'likely-friction', reason: 'closed-without-resume' };
}
