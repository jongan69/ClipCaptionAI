# Tool adapters

ClipCaptionAI discovers repository-owned modules named `*.adapter.mjs` under `adapters/` and `scripts/adapters/`. The same validated catalog drives the CLI and desktop app.

```bash
clipcaptionai adapters list
clipcaptionai adapters describe remotion
clipcaptionai remotion compositions --wait
clipcaptionai ollama pull qwen3:4b
clipcaptionai ytdlp formats URL --json
clipcaptionai stock download --query "morning sunlight walk" --count 6 --out outputs/stock/health-week --wait
clipcaptionai workflow list
clipcaptionai workflow run caption --video input.mp4 --wait
```

Actions marked as jobs detach by default and print a job ID. Add `--wait` for foreground compatibility. Job management is shared across agents and the desktop app:

```bash
clipcaptionai jobs list
clipcaptionai jobs status JOB_ID
clipcaptionai jobs logs JOB_ID
clipcaptionai jobs wait JOB_ID
clipcaptionai jobs cancel JOB_ID
clipcaptionai jobs prune --days 7
```

## Module contract

An adapter exports serializable `metadata` and a safe `build()` function. Metadata declares actions, argument schemas, requirements, secret names, resource locks, setup behavior, aliases, and a version. `build(action, input)` returns `{command, args, cwd, env}`; `args` must be an array and execution never uses a shell. An optional `collect()` returns result data and artifact paths.

```js
export default {
  metadata: {
    id: 'example',
    title: 'Example',
    description: 'Example tool',
    version: '1',
    actions: [
      {
        id: 'run',
        title: 'Run',
        description: 'Run it',
        mode: 'job',
        aliases: [],
        args: [{name: 'args', type: 'array'}],
        requirements: ['example'],
        secrets: [],
        locks: ['outputs'],
        setup: [],
      },
    ],
  },
  build(_action, input) {
    return {command: 'example', args: input.args ?? []};
  },
};
```

Catalog validation fails on duplicate IDs or malformed metadata. Adding a valid adapter requires no routing or desktop UI edit.

The `stock` adapter uses the Pexels API with portrait, large-image, and minimum 1080×1920 filters. Downloads include a manifest with the creator, Pexels source URL, license URL, dimensions, and SHA-256 hash. Results link back to [Pexels](https://www.pexels.com/) and preserve photographer credit. Configure `PEXELS_API_KEY`; the key is never passed to the desktop renderer or printed in job logs.

## Job storage

Jobs use the platform application-data directory, or `CCA_STATE_ROOT` in isolated automation. Each job owns an atomic JSON record plus redacted stdout/stderr logs and result data. Workers survive CLI/desktop closure. Resource locks are atomic filesystem directories; stale running jobs are marked `interrupted` and are never retried automatically.
