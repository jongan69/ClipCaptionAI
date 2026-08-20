# Marketing platform

Campaign commands use the shared adapter catalog and filesystem job broker. The examples assume an installed package; from a repository checkout replace `clipcaptionai` with `bun run clipkit --`.

```sh
clipcaptionai marketing plan --campaign examples/marketing/campaign.example.yaml --wait
clipcaptionai marketing estimate --run <run-id> --wait
clipcaptionai marketing approve --run <run-id> --budget-credits 12
clipcaptionai marketing execute --run <run-id> --wait
clipcaptionai marketing inspect --run <run-id>
clipcaptionai marketing qa --run <run-id> --wait
clipcaptionai marketing export --run <run-id> --wait
```

`plan`, `estimate`, `execute`, `qa`, and `export` detach unless `--wait` is supplied. Runs are stored under `campaigns/<run-id>/`; set `CCA_CAMPAIGNS_ROOT` to move them. Assets are content-hashed and events are append-only. Campaign records contain the shared broker job IDs rather than a second queue.

Approval binds the plan hash, installed-tool capability fingerprint, CLI-derived estimate hash, and total credit budget. Any plan, estimate, adapter, CLI-help, or model change invalidates it. Live generation intents provide current installed-CLI cost argv and submission argv; paid submission additionally requires `--live-execution`. `--dry-run` never submits. Technical QA reports decoding, format, timing, stream, black-frame, silence, caption-zone, CTA, capture-freshness, and Rotato-template checks separately from claims, human visual review, and publication approval.

Product capture is command-only: manifests own argv arrays, cwd, outputs, seed, repository commit, and device profile. No shell interpolation or GUI automation is used.

Rotato templates live at `templates/rotato/<id>/template.json` beside their real `scene.rotato`. Generate `inspectFingerprint` from the current `rotato inspect <scene> --json` result. Semantic slots compile to inspected device indexes and overlay IDs; drift fails with `TEMPLATE_INSPECT_MISMATCH`.
