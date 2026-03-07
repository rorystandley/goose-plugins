/**
 * Backup plugin for Goose.
 *
 * Provides a single `backup_data` tool that deterministically:
 *   1. Creates a dated snapshot of the Goose data directory
 *   2. Prunes old snapshots, keeping only the N most recent
 *   3. Returns a plain-text summary of exactly what happened
 *
 * All facts in the summary (date, file list, snapshot count) come from the
 * real file system — the LLM cannot fabricate them.
 *
 * Configuration (environment variables, all optional):
 *   GOOSE_DATA_DIR      — source directory to back up (default: ~/Apps/goose/data)
 *   GOOSE_BACKUP_DIR    — destination root           (default: ~/Documents/goose-backups)
 *   GOOSE_BACKUP_KEEP   — number of snapshots to keep (default: 7)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function getConfig() {
  return {
    dataDir:   resolvePath(process.env.GOOSE_DATA_DIR   ?? '~/Apps/goose/data'),
    backupDir: resolvePath(process.env.GOOSE_BACKUP_DIR ?? '~/Documents/goose-backups'),
    keep:      parseInt(process.env.GOOSE_BACKUP_KEEP   ?? '7', 10),
  };
}

function todayLabel() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const backup_data = {
  name: 'backup_data',
  description: 'Create a dated snapshot of the Goose data directory, then prune old snapshots. Returns a summary of what was saved and how many snapshots now exist. No parameters needed.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => {
    const { dataDir, backupDir, keep } = getConfig();
    const date = todayLabel();
    const snapshotDir = path.join(backupDir, date);

    // 1. Validate source
    if (!fs.existsSync(dataDir)) {
      return `Backup failed: source directory does not exist: ${dataDir}`;
    }

    // 2. Create snapshot directory
    try {
      fs.mkdirSync(snapshotDir, { recursive: true });
    } catch (err) {
      return `Backup failed: could not create ${snapshotDir}: ${err.message}`;
    }

    // 3. Copy data directory into snapshot
    try {
      execSync(`cp -r ${JSON.stringify(dataDir)} ${JSON.stringify(snapshotDir)}/`, {
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const stderr = err.stderr?.toString().trim() ?? err.message;
      return `Backup failed during copy: ${stderr}`;
    }

    // 4. List what was saved (top-level entries inside the copied data dir)
    const copiedDataDir = path.join(snapshotDir, path.basename(dataDir));
    let savedFiles = [];
    try {
      savedFiles = fs.readdirSync(copiedDataDir).sort();
    } catch {
      savedFiles = ['(could not list)'];
    }

    // 5. Prune old snapshots — keep only the N most recent dated dirs
    let prunedCount = 0;
    try {
      const entries = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name)
        .sort()
        .reverse();                     // newest first

      const toRemove = entries.slice(keep);
      for (const name of toRemove) {
        fs.rmSync(path.join(backupDir, name), { recursive: true, force: true });
        prunedCount++;
      }
    } catch (err) {
      // Non-fatal — report but continue
      return `Backup saved to ${snapshotDir} but pruning failed: ${err.message}`;
    }

    // 6. Count remaining snapshots
    let remaining = 0;
    try {
      remaining = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .length;
    } catch {
      remaining = -1;
    }

    // 7. Build summary — every fact comes from the real file system
    const fileList = savedFiles.map(f => `  - ${f}`).join('\n');
    const pruneNote = prunedCount > 0
      ? `\nPruned ${prunedCount} old snapshot${prunedCount > 1 ? 's' : ''}.`
      : '';

    return [
      `Backup complete: ${date}`,
      `Snapshot: ${snapshotDir}`,
      `Files saved:\n${fileList}`,
      `${pruneNote}`,
      `Snapshots remaining: ${remaining}`,
    ].join('\n').trim();
  },
};

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const tools = [backup_data];
