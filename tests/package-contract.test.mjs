import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const importsIn = (file) => {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports.filter((value) => value.startsWith('.'));
};

test('packed distribution contains the complete local runtime import graph', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-package-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const packed = spawnSync(
    process.execPath,
    ['pm', 'pack', '--destination', directory, '--ignore-scripts'],
    {cwd: root, encoding: 'utf8'},
  );
  assert.equal(packed.status, 0, packed.stderr);
  const archive = fs.readdirSync(directory).find((file) => file.endsWith('.tgz'));
  assert.ok(archive);
  const extracted = spawnSync('tar', ['-xzf', path.join(directory, archive), '-C', directory], {
    encoding: 'utf8',
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const packageRoot = path.join(directory, 'package');
  const files = fs.readdirSync(packageRoot, {recursive: true}).map(String);
  assert.equal(files.includes('.env'), false);
  assert.equal(
    files.some((file) => /^(outputs|campaigns|node_modules)\//.test(file)),
    false,
  );
  const missing = [];
  for (const file of files.filter((name) => /\.(mjs|cjs|js|tsx?|mts)$/.test(name))) {
    for (const target of importsIn(path.join(packageRoot, file))) {
      const resolved = path.resolve(packageRoot, path.dirname(file), target);
      const exists = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '/index.ts', '/index.mjs'].some(
        (extension) => fs.existsSync(resolved + extension),
      );
      if (!exists) missing.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(missing, [], 'All shipped source imports must resolve inside the tarball.');
});
