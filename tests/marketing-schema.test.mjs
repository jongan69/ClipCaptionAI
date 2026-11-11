import assert from 'node:assert/strict';
import test from 'node:test';
import {CampaignBrief} from '../scripts/marketing/schemas.mjs';
import {requireGenerationBindings} from '../scripts/marketing/media.mjs';

test('variant identifiers cannot escape artifact directories or collide', () => {
  const brief = (ids) => ({
    id: 'campaign',
    product: {id: 'demo', name: 'Demo'},
    objective: 'Test',
    variants: ids.map((id) => ({id, cta: 'Go'})),
  });
  assert.equal(CampaignBrief.safeParse(brief(['portrait-1', 'square_2'])).success, true);
  for (const ids of [['../outside'], ['a/b'], ['..'], ['same', 'same']])
    assert.equal(CampaignBrief.safeParse(brief(ids)).success, false);
});

test('generation requires a declared output consumed by the variant', () => {
  const intent = {type: 'generation', output: '/tmp/shot.mp4'};
  const variant = {id: 'portrait', intents: [intent], timeline: [], slides: []};
  assert.throws(() => requireGenerationBindings(variant), /GENERATION_OUTPUT_UNBOUND/);
  assert.throws(
    () => requireGenerationBindings({...variant, intents: [{type: 'generation'}]}),
    /GENERATION_OUTPUT_UNBOUND/,
  );
  assert.doesNotThrow(() =>
    requireGenerationBindings({...variant, timeline: [{src: intent.output}]}),
  );
  assert.doesNotThrow(() =>
    requireGenerationBindings({...variant, slides: [{src: intent.output}]}),
  );
  assert.doesNotThrow(() => requireGenerationBindings({...variant, intents: []}));
});
