// Flat ESLint config for ClipCaptionAI.
//
// Scope (kept intentionally tight):
//   - scripts/**/*.mjs + desktop main/preload/shared (plain JS, node)
//   - desktop/src/**/*.{ts,tsx} (React renderer, strict TS)
//   - tests/**/*.mjs
// Remotion src/ (TSX) is covered by `npm run typecheck` (tsc strict) and is
// intentionally not linted yet — add it once typescript-eslint has been
// tuned on desktop/src first.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'desktop/dist-renderer/**',
      'dist-desktop/**',
      'release/**',
      'models/**',
      'outputs/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'desktop/**/*.mjs', 'desktop/**/*.cjs', 'tests/**/*.mjs', '*.mjs'],
    languageOptions: {
      globals: {...globals.node},
    },
    rules: {
      // CLI scripts are the product; console is their UI.
      'no-console': 'off',
      // Unused helpers after incremental refactors are a real hygiene problem.
      'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    },
  },
  {
    // Legacy fallback renderer — runs inside Electron's renderer process.
    files: ['desktop/renderer.js'],
    languageOptions: {
      globals: {...globals.browser},
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['desktop/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {jsx: true},
      },
    },
    rules: {
      // IPC payloads cross a serialization boundary — unknown/any at the
      // bridge edges is expected; avoid them elsewhere via review.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    },
  },
  {
    // CommonJS files (preload, notarize hook) — `require` is required there.
    // Must come AFTER the tseslint recommended spread, which re-enables
    // no-require-imports.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
];
