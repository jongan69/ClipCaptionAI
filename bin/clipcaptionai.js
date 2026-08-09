#!/usr/bin/env node
process.env.CCA_WORKSPACE_ROOT ||= process.cwd();
await import('../scripts/clipkit.mjs');
