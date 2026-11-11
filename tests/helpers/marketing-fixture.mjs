import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../..');
const cli = path.join(root, 'bin', 'clipcaptionai.js');
export const executable = (file, source) => {
  fs.writeFileSync(file, `#!/usr/bin/env bun\n${source}`);
  fs.chmodSync(file, 0o755);
};
export const run = (command, args, env) =>
  spawnSync(command, args, {cwd: root, env, encoding: 'utf8'});
export const runCli = (args, env) => run(process.execPath, [cli, ...args], env);
export const parseChildJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, true, result.stdout);
  const text = envelope.data.logs?.stdout?.text ?? envelope.data.stdout;
  return text ? JSON.parse(text.trim().split('\n').at(-1)) : envelope.data;
};

export const fixture = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-marketing-'));
  const bin = path.join(directory, 'bin');
  const campaigns = path.join(directory, 'campaigns');
  const state = path.join(directory, 'state');
  fs.mkdirSync(bin, {recursive: true});
  const helpFile = path.join(directory, 'higgs-help.txt');
  fs.writeFileSync(helpFile, 'fake higgs v1');
  executable(
    path.join(bin, 'rotato'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='--help') console.log('inspect render fake-v1');
else if(args[0]==='inspect') console.log(JSON.stringify({devices:[{index:0}],overlays:[{id:'headline'}]}));
else if(args[0]==='render'){if(args.includes('--json')){console.error('--json is only valid for inspect');process.exit(2);} const i=args.indexOf('--output'); if(i>=0)fs.writeFileSync(args[i+1],'video'); console.log(JSON.stringify({ok:true}));}
`,
  );
  executable(
    path.join(bin, 'higgs'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='--help') console.log(fs.readFileSync(${JSON.stringify(helpFile)},'utf8'));
else if(args.includes('cost')) console.log(JSON.stringify({credits:args.includes('fake-two')?2:3}));
else {const i=args.indexOf('--output'); if(i>=0)fs.writeFileSync(args[i+1],'generated'); if(process.env.HIGGS_CALLS)fs.appendFileSync(process.env.HIGGS_CALLS,args.join(' ')+'\\n'); console.log(process.env.HIGGS_BAD_RESULT?'invalid-provider-json':JSON.stringify({id:'fake-job',status:'complete'}));}
`,
  );
  executable(
    path.join(bin, 'bunx'),
    `
const fs=require('fs'); const args=process.argv.slice(2);
if(args[0]==='remotion'&&(args[1]==='render'||args[1]==='still')){
  const propsArg=args.find((arg)=>arg.startsWith('--props='));
  const props=propsArg?JSON.parse(fs.readFileSync(propsArg.slice(8),'utf8')):{};
  fs.writeFileSync(args[4],args[1]==='still'?'final-image:'+props.timeline?.[1]?.headline:props.voice?'voice-track':'final-video');
  console.log('Rendered '+args[4]);
} else process.exit(2);
`,
  );
  executable(
    path.join(bin, 'ffprobe'),
    `console.log(JSON.stringify({streams:[{codec_type:'video',codec_name:'h264',width:1080,height:1920},{codec_type:'audio',codec_name:'aac'}],format:{duration:'5'}}));`,
  );
  executable(
    path.join(bin, 'ffmpeg'),
    `
const fs=require('fs'); const args=process.argv.slice(2); const output=args.at(-1);
if(output&&output!=='-'&&args.some((arg)=>arg.startsWith('loudnorm='))){
  const input=args[args.indexOf('-i')+1]; const rendered=fs.readFileSync(input,'utf8');
  fs.writeFileSync(output,rendered==='voice-track'?rendered:'normalized-video');
}
`,
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CCA_CAMPAIGNS_ROOT: campaigns,
    CCA_STATE_ROOT: state,
    CCA_DISABLE_OLLAMA: '1',
    CCA_HIGGSFIELD_BIN: path.join(bin, 'higgs'),
    HIGGS_CALLS: path.join(directory, 'higgs-calls.txt'),
  };
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return {directory, bin, campaigns, env, helpFile};
};
