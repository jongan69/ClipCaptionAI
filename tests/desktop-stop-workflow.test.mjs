import assert from 'node:assert/strict';
import test from 'node:test';

import {requestWorkflowStop} from '../desktop/src/lib/stopWorkflow.ts';

test('desktop cancellation sends the active session to the bridge', async () => {
  const sessions = [];
  await requestWorkflowStop('active-session', async (session) => {
    sessions.push(session);
    return {stopped: true};
  });
  assert.deepEqual(sessions, ['active-session']);
});

test('desktop cancellation surfaces unavailable, declined, and failed requests', async () => {
  await assert.rejects(requestWorkflowStop('session'), /desktop app/);
  await assert.rejects(
    requestWorkflowStop('session', async () => ({stopped: false, reason: 'Session unavailable'})),
    /Session unavailable/,
  );
  await assert.rejects(
    requestWorkflowStop('session', async () => ({stopped: false})),
    /could not be stopped/,
  );
  await assert.rejects(
    requestWorkflowStop('session', async () => {
      throw new Error('IPC disconnected');
    }),
    /IPC disconnected/,
  );
});
