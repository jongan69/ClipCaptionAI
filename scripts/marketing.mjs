#!/usr/bin/env bun
import {planCampaign, estimateCampaign, approveCampaign} from './marketing/planning.mjs';
import {executeCampaign} from './marketing/execution.mjs';
import {qaCampaign} from './marketing/qa.mjs';
import {inspectCampaign, exportCampaign, doctor} from './marketing/reporting.mjs';
import {withCampaignLock} from './marketing/lock.mjs';
import {reviewCampaign} from './marketing/review.mjs';
import {args, runDirectory} from './marketing/runtime.mjs';
import {requireArg} from './lib.mjs';

const action = process.argv[2];
const handlers = {
  doctor,
  plan: planCampaign,
  estimate: estimateCampaign,
  approve: approveCampaign,
  execute: executeCampaign,
  inspect: inspectCampaign,
  qa: qaCampaign,
  review: reviewCampaign,
  export: exportCampaign,
};
if (!handlers[action]) throw new Error(`Unknown marketing action: ${action || ''}`);
if (['doctor', 'plan', 'inspect'].includes(action)) await handlers[action]();
else await withCampaignLock(runDirectory(requireArg(args, 'run')), handlers[action]);
