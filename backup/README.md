# @goose-plugins/backup

Deterministic data backup plugin for [Goose](https://github.com/rorystandley/goose) — snapshots the Goose data directory on a schedule with automatic pruning, and reports real file system facts rather than LLM-generated summaries.

---

## What it does

This plugin gives Goose one new tool:

| Tool | Description |
|---|---|
| `backup_data` | Create a dated snapshot of the Goose data directory, prune old snapshots, and return a plain-text summary of exactly what happened |

All facts in the summary (date, file list, snapshot count) are read directly from the file system after each operation — the LLM cannot fabricate them.

---

## Usage

The intended use is a scheduled mission that calls the tool and posts the result verbatim. Add this to `data/missions.json`:

```json
{
  "name": "data-backup",
  "cron": "0 2 * * *",
  "maxIterations": 2,
  "task": "Call backup_data. Your entire response must be exactly what the tool returns — copy it verbatim, no additions, no changes.",
  "contextId": "mission-data-backup",
  "slackChannel": "YOUR_CHANNEL_ID",
  "timezone": "Europe/London",
  "enabled": true
}
```

You can also ask Goose directly:

```
"Run the data backup"
"Create a snapshot of the data directory"
```

### Example output

```
Backup complete: 2026-03-07
Snapshot: /Users/yourname/Documents/goose-backups/2026-03-07
Files saved:
  - facts.json
  - memory.json
  - missions.json
  - monitors.json
Pruned 1 old snapshot.
Snapshots remaining: 7
```

---

## Installation

```bash
npm install @goose-plugins/backup
```

Restart Goose — it auto-discovers any `@goose-plugins/*` package in `node_modules`.

> **Want to build your own plugin?**
> See the [Goose plugin guide](https://github.com/rorystandley/goose/blob/develop/docs/plugins.md) for the full plugin interface, local development workflow, and publishing instructions.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `GOOSE_DATA_DIR` | `~/Apps/goose/data` | Source directory to snapshot |
| `GOOSE_BACKUP_DIR` | `~/Documents/goose-backups` | Root directory where dated snapshots are created |
| `GOOSE_BACKUP_KEEP` | `7` | Number of snapshots to keep; older ones are pruned after each run |

---

## How snapshots are stored

Each run creates a dated subdirectory under `GOOSE_BACKUP_DIR`:

```
~/Documents/goose-backups/
├── 2026-03-05/
│   └── data/
├── 2026-03-06/
│   └── data/
└── 2026-03-07/        ← today's snapshot
    └── data/
```

After copying, any snapshots beyond the `GOOSE_BACKUP_KEEP` limit are deleted oldest-first.

---

## Why a plugin instead of a prompt mission?

A prompt-based backup mission asks the LLM to call several shell commands in sequence, then write a summary. In practice the LLM can skip steps, miscount snapshots, or report success when commands silently failed.

This plugin runs the entire operation in a single deterministic Node.js function and returns real file system data. The LLM just posts what the tool returns — there is nothing to hallucinate.

---

## Part of the Goose ecosystem

This plugin follows the standard [Goose plugin interface](https://github.com/rorystandley/goose/blob/develop/docs/plugins.md). See that guide for details on how plugins are loaded, how to configure persistence paths, and how to publish your own.
