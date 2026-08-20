import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';

import {projectRoot} from '../lib.mjs';

const argumentSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(['text', 'number', 'boolean', 'select', 'array']).default('text'),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({value: z.string(), label: z.string()})).optional(),
});

const actionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().default(''),
  mode: z.enum(['sync', 'job']).default('job'),
  aliases: z.array(z.string()).default([]),
  args: z.array(argumentSchema).default([]),
  requirements: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  locks: z.array(z.string()).default([]),
  setup: z.array(z.string()).default([]),
});

const metadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().default(''),
  version: z.string().min(1),
  actions: z.array(actionSchema).min(1),
  workflows: z.array(z.record(z.string(), z.unknown())).optional(),
});

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && entry.name.endsWith('.adapter.mjs') ? [target] : [];
  });
};

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
};

export const hashValue = (value) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');

export async function discoverAdapters({root = projectRoot} = {}) {
  const files = [
    ...walk(path.join(root, 'adapters')),
    ...walk(path.join(root, 'scripts', 'adapters')),
  ]
    .map((file) => path.resolve(file))
    .sort();
  const adapters = [];
  const ids = new Set();

  for (const file of files) {
    const imported = await import(`${pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}`);
    const adapter = imported.default ?? imported.adapter;
    if (!adapter || typeof adapter.build !== 'function') {
      throw new Error(`${file} must export an adapter with a build(action, input) function.`);
    }
    const metadata = metadataSchema.parse(adapter.metadata);
    if (ids.has(metadata.id)) throw new Error(`Duplicate adapter id: ${metadata.id}`);
    ids.add(metadata.id);
    adapters.push({...adapter, metadata, source: file});
  }

  return adapters;
}

export async function getAdapter(id, options) {
  const adapter = (await discoverAdapters(options)).find(
    (candidate) => candidate.metadata.id === id,
  );
  if (!adapter) throw new Error(`Unknown adapter: ${id}`);
  return adapter;
}

export async function serializeCatalog(options) {
  const adapters = await discoverAdapters(options);
  return adapters.map(({metadata, source}) => ({
    ...JSON.parse(JSON.stringify(metadata)),
    source: path.relative(options?.root ?? projectRoot, source),
    capabilityFingerprint: hashValue(metadata),
  }));
}

export async function findAlias(name, options) {
  for (const adapter of await discoverAdapters(options)) {
    for (const action of adapter.metadata.actions) {
      if (action.aliases.includes(name)) return {adapter, action};
    }
    const workflow = adapter.metadata.workflows?.find((entry) =>
      [entry.command, ...(entry.aliases ?? [])].includes(name),
    );
    if (workflow) {
      const action = adapter.metadata.actions.find((entry) => entry.id === 'run');
      return {adapter, action, workflow};
    }
  }
  return null;
}
