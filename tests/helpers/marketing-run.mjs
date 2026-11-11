import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture, root, run} from './marketing-fixture.mjs';
export const execute = (fx, action, args = []) =>
  run(process.execPath, [path.join(root, 'scripts/marketing.mjs'), action, ...args], fx.env);
export const success = (result) => {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
};
export const setup = (t, {paid = false, output = false, slides = false} = {}) => {
  const fx = fixture(t);
  const generated = path.join(fx.directory, 'generated.mp4');
  const campaign = path.join(fx.directory, 'campaign.json');
  fs.writeFileSync(
    campaign,
    JSON.stringify({
      id: 'safety',
      product: {id: 'demo', name: 'Demo'},
      objective: 'Verify safe execution.',
      variants: [
        {
          id: 'vertical',
          durationSeconds: 5,
          ...(slides
            ? {format: 'carousel', slides: [{src: generated, headline: 'Demo', durationSeconds: 5}]}
            : {}),
          cta: 'Go',
          intents: paid
            ? [
                {
                  type: 'generation',
                  provider: 'higgsfield',
                  estimateArgv: ['generate', 'cost', 'fake'],
                  argv: ['generate', 'create', ...(output ? ['--output', generated] : [])],
                  output: generated,
                },
              ]
            : [],
          timeline: slides
            ? []
            : [
                ...(paid
                  ? [{type: 'video', src: generated, startSeconds: 0, durationSeconds: 4}]
                  : []),
                {type: 'end-card', startSeconds: 4, durationSeconds: 1, text: 'Go'},
              ],
        },
      ],
    }),
  );
  success(execute(fx, 'plan', ['--campaign', campaign, '--run-id', 'safety']));
  success(execute(fx, 'estimate', ['--run', 'safety']));
  success(execute(fx, 'approve', ['--run', 'safety', '--budget-credits', paid ? '3' : '0']));
  return {...fx, directoryRun: path.join(fx.campaigns, 'safety'), generated};
};
