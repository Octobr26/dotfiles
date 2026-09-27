import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateSharedUsage, inferSessionFeedback } from './workflow-feedback.mjs';

const hour = 60 * 60 * 1000;
const closedAt = 100 * hour;
function input(overrides = {}) {
  return {
    now: closedAt + 24 * hour,
    sessionEnd: { timestamp: new Date(closedAt).toISOString() },
    historyComplete: true,
    attempts: [{ taskKey: 's:t', startedAtMs: closedAt - hour, completedAtMs: closedAt - 1, complete: true }],
    logicalTasks: [{ delivered: true, openStages: 0, annotation: {}, interactions: [], unidentifiedCorrections: 0 }],
    ...overrides
  };
}
test('closure is pending until 24 hours, then positive and explicitly inferred', () => {
  assert.equal(inferSessionFeedback(input({ now: closedAt + 24 * hour - 1 })).state, 'pending');
  const result = inferSessionFeedback(input());
  assert.equal(result.rating, 5);
  assert.equal(result.state, 'probably-satisfied');
  assert.equal(result.source, 'inferred');
  assert.equal(result.confidence, 'low');
});
test('resume withdraws the previous rating; closing again restarts the wait', () => {
  const resumed = input();
  resumed.attempts.push({ taskKey: 's:t2', startedAtMs: closedAt + hour, completedAtMs: closedAt + 2 * hour, complete: true });
  assert.equal(inferSessionFeedback(resumed).state, 'resumed');
  resumed.logicalTasks[0].interactions = [{ turnId: 't2', kind: 'new-work' }];
  resumed.sessionEnd.timestamp = new Date(closedAt + 3 * hour).toISOString();
  assert.equal(inferSessionFeedback(resumed).state, 'pending');
  resumed.now += 3 * hour;
  assert.equal(inferSessionFeedback(resumed).rating, 5);
});
test('corrections and clarifications lower the proxy; approvals, acceptance, and new work do not', () => {
  const value = input();
  value.logicalTasks[0].interactions = [
    { turnId: 'a', kind: 'correction' }, { turnId: 'b', kind: 'clarification' },
    { turnId: 'c', kind: 'approval' }, { turnId: 'd', kind: 'new-work' },
    { turnId: 'e', kind: 'acceptance' }
  ];
  assert.equal(inferSessionFeedback(value).rating, 3);
  value.logicalTasks[0].interactions.push({ turnId: 'f', kind: 'correction' });
  assert.equal(inferSessionFeedback(value).state, 'likely-friction');
  for (let n = 0; n < 6; n++) value.logicalTasks[0].interactions.push({ turnId: `f${n}`, kind: 'correction' });
  assert.equal(inferSessionFeedback(value).rating, 1);
});
test('one prompt classified on two tasks is counted once, explicit quality is untouched', () => {
  const value = input();
  value.logicalTasks[0].annotation.quality = 2;
  value.logicalTasks[0].interactions = [{ turnId: 'a', kind: 'correction' }];
  value.logicalTasks.push({ ...value.logicalTasks[0] });
  assert.equal(inferSessionFeedback(value).corrections, 1);
  assert.equal(value.logicalTasks[0].annotation.quality, 2);
  assert.equal(inferSessionFeedback(value).explicitQualityPresent, true);
});
test('missing closure/history, unresolved work and unidentified feedback cannot imply satisfaction', () => {
  assert.equal(inferSessionFeedback(input({ sessionEnd: null })).rating, null);
  assert.equal(inferSessionFeedback(input({ historyComplete: false })).rating, null);
  for (const replacement of [
    { delivered: false }, { openStages: 1 }, { annotation: { status: 'blocked' } },
    { annotation: { status: 'abandoned' } }, { unidentifiedCorrections: 1 },
    { interactions: [{ turnId: 'a', kind: 'unknown' }] }
  ]) {
    const value = input(); Object.assign(value.logicalTasks[0], replacement);
    assert.equal(inferSessionFeedback(value).rating, null);
  }
});
test('unfinished attempts and work crossing a close invalidate positive inference', () => {
  const value = input(); value.attempts[0].complete = false;
  assert.equal(inferSessionFeedback(value).rating, null);
  value.attempts[0].complete = true;
  value.attempts[0].completedAtMs = closedAt + 1;
  assert.equal(inferSessionFeedback(value).state, 'resumed');
});
test('explicit blocked untracked work stays unknown; tracked repair can supersede an old failed attempt', () => {
  const value = input({ logicalTasks: [] });
  value.attempts[0].annotation = { status: 'blocked', accepted: false };
  assert.equal(inferSessionFeedback(value).rating, null);
  value.logicalTasks.push({ delivered: true, openStages: 0, annotation: { accepted: true },
    attemptKeys: ['s:t'], interactions: [], unidentifiedCorrections: 0 });
  assert.equal(inferSessionFeedback(value).rating, 5);
});
test('shared usage is conserved, deterministic and explicitly estimated', () => {
  const attempt = { taskKey: 's:t', inputTokens: 101, cachedInputTokens: 80, outputTokens: 9, reasoningOutputTokens: 3, totalTokens: 110 };
  const a = { logicalTaskId: 'a', attempts: [attempt] };
  const b = { logicalTaskId: 'b', attempts: [attempt] };
  allocateSharedUsage([b, a]);
  assert.equal(a.totalTokens + b.totalTokens, 110);
  assert.equal(a.inputTokens + b.inputTokens, 101);
  assert.equal(a.usageAttribution, 'equal-share-estimate');
  assert.equal(a.sharedAttemptCount, 1);
  assert.equal(attempt.inputTokens, 101);
  const c = { logicalTaskId: 'c', attempts: [attempt] };
  allocateSharedUsage([c]);
  assert.equal(c.totalTokens, 110);
  assert.equal(c.usageAttribution, 'whole-turn');
});
