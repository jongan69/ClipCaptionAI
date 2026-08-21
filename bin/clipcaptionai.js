#!/usr/bin/env bun
process.env.CCA_WORKSPACE_ROOT ||= process.cwd();
await import('../scripts/clipkit.mjs');
