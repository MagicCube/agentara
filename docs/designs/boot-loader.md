# BootLoader Design

## Design Goals

The BootLoader has two primary design goals: **safety** and **isolation**.

- **Safety**: The Kernel must never start in an incomplete or invalid environment. The BootLoader ensures all prerequisites are met before the Kernel runs.
- **Isolation**: The Kernel assumes a verified environment. It does not perform integrity checks itself; it runs only after the BootLoader has passed control.

## Philosophy

> Verify first, ignite later.

The BootLoader acts as a gatekeeper. It runs before the Kernel and guarantees that when the Kernel starts:

1. **All directories exist** — Every path the Kernel and its subsystems need is present.
2. **Configuration exists** — `config.yaml` is present with valid defaults if none existed.

If any prerequisite fails, the BootLoader handles it (e.g., create directories, seed config) or fails fast. The Kernel is never invoked until the environment is ready.

## Lifecycle

```
bootstrap()
    ├── _verifyIntegrity()   → ensure dirs + config
    └── _igniteKernel()     → dynamic import Kernel, call __internalInitialize()
```

`_igniteKernel()` is called only after `_verifyIntegrity()` completes successfully.

## _verifyIntegrity

Responsibilities:

1. **$AGENTARA_HOME**
   - If the directory does not exist: create it and copy contents from `./user-home` to `$AGENTARA_HOME`.
   - If it exists: ensure required subdirectories are present (create any that are missing).

2. **Required directories** (from `config.paths`):
   - `sessions`, `memory`, `memory/logs`, `workspace`, `workspace/projects`, `workspace/uploads`, `workspace/outputs`, `data`, `.claude`, `.claude/skills`
   - Create any that do not exist. Do not overwrite existing files; only ensure directories exist.

3. **config.yaml**
   - If missing: generate a default `config.yaml` with standard values.
   - If present: validate schema (to be implemented). On invalid config, fail fast.

## _igniteKernel

- Dynamically imports `@/kernel` to avoid loading the Kernel before integrity is verified.
- Calls `Kernel.__internalInitialize()`.
- On failure: propagates the error; no retry or fallback at this layer.

## Error Handling

- **Integrity failures**: Fix when possible (create dirs, seed config). If unfixable (e.g., permissions), throw and abort.
- **Kernel initialization failure**: Propagate; do not swallow.

## Dependencies

- `config.paths` (from `@/shared/config`) — for directory paths
- `./user-home` — template for first-run setup
- No dependency on Kernel; Kernel is loaded lazily via `import()`.
