import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(suffix = '') {
  const dir = path.join(os.tmpdir(), `goose-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a fresh module import with env vars pointing at temp dirs. */
async function freshPlugin(dataDir, backupDir, keep = '7') {
  vi.stubEnv('GOOSE_DATA_DIR', dataDir);
  vi.stubEnv('GOOSE_BACKUP_DIR', backupDir);
  vi.stubEnv('GOOSE_BACKUP_KEEP', keep);
  vi.resetModules();
  return import('../index.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Plugin export shape
// ---------------------------------------------------------------------------

describe('tools export', () => {
  it('exports a "tools" named export that is an Array', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    expect(Array.isArray(tools)).toBe(true);
  });

  it('exports exactly 1 tool', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    expect(tools).toHaveLength(1);
  });

  it('exports a tool named backup_data', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    expect(tools[0].name).toBe('backup_data');
  });
});

// ---------------------------------------------------------------------------
// Tool interface shape
// ---------------------------------------------------------------------------

describe('backup_data tool interface', () => {
  it('has name, description, riskLevel, parameters, execute', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    const tool = tools[0];
    expect(typeof tool.name).toBe('string');
    expect(typeof tool.description).toBe('string');
    expect(typeof tool.riskLevel).toBe('string');
    expect(typeof tool.parameters).toBe('object');
    expect(typeof tool.execute).toBe('function');
  });

  it('has riskLevel of "safe"', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    expect(tools[0].riskLevel).toBe('safe');
  });

  it('parameters has type "object"', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    expect(tools[0].parameters.type).toBe('object');
  });

  it('parameters has no required fields (tool takes no arguments)', async () => {
    const dataDir = tmpDir('-src');
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(dataDir, backupDir);
    const { required = [] } = tools[0].parameters;
    expect(required).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Successful backup
// ---------------------------------------------------------------------------

describe('backup_data execute — success', () => {
  let dataDir, backupDir;

  beforeEach(() => {
    dataDir = tmpDir('-src');
    backupDir = tmpDir('-dst');
    // Seed the source data directory with a few files
    fs.writeFileSync(path.join(dataDir, 'memory.json'), '{}');
    fs.writeFileSync(path.join(dataDir, 'missions.json'), '{}');
    fs.mkdirSync(path.join(dataDir, 'business-ideas'));
  });

  it('returns a string', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(typeof result).toBe('string');
  });

  it('output contains "Backup complete:"', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Backup complete:');
  });

  it('output contains "Snapshot:"', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Snapshot:');
  });

  it('output contains "Files saved:"', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Files saved:');
  });

  it('output contains "Snapshots remaining:"', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Snapshots remaining:');
  });

  it('actually creates a dated snapshot directory', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    await tools[0].execute();
    const entries = fs.readdirSync(backupDir);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('copies source files into the snapshot', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    await tools[0].execute();
    const dated = fs.readdirSync(backupDir)[0];
    const copiedData = path.join(backupDir, dated, path.basename(dataDir));
    expect(fs.existsSync(path.join(copiedData, 'memory.json'))).toBe(true);
    expect(fs.existsSync(path.join(copiedData, 'missions.json'))).toBe(true);
  });

  it('lists seeded files in the output', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('memory.json');
    expect(result).toContain('missions.json');
  });

  it('reports 1 snapshot remaining after first run', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Snapshots remaining: 1');
  });
});

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

describe('backup_data execute — pruning', () => {
  let dataDir, backupDir;

  beforeEach(() => {
    dataDir = tmpDir('-src');
    backupDir = tmpDir('-dst');
    fs.writeFileSync(path.join(dataDir, 'memory.json'), '{}');
  });

  it('keeps only GOOSE_BACKUP_KEEP snapshots when limit is exceeded', async () => {
    // Pre-seed 5 old dated snapshots
    for (let i = 1; i <= 5; i++) {
      const name = `2026-01-0${i}`;
      fs.mkdirSync(path.join(backupDir, name));
    }

    // Run with keep=3 — 5 old + 1 new = 6 total, should prune to 3
    const { tools } = await freshPlugin(dataDir, backupDir, '3');
    const result = await tools[0].execute();

    const remaining = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));

    expect(remaining.length).toBe(3);
    expect(result).toContain('Snapshots remaining: 3');
  });

  it('keeps the most recent snapshots when pruning', async () => {
    // Pre-seed older snapshots
    fs.mkdirSync(path.join(backupDir, '2025-01-01'));
    fs.mkdirSync(path.join(backupDir, '2025-06-15'));

    const { tools } = await freshPlugin(dataDir, backupDir, '2');
    await tools[0].execute();

    const dirs = fs.readdirSync(backupDir).sort();
    // 2025-01-01 should have been pruned (oldest), today's snapshot should exist
    expect(dirs).not.toContain('2025-01-01');
  });

  it('does not prune when snapshot count is within limit', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir, '7');
    await tools[0].execute();
    const dirs = fs.readdirSync(backupDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name));
    // Only 1 snapshot exists, keep=7, nothing pruned
    expect(dirs.length).toBe(1);
  });

  it('output does not mention pruning when nothing was pruned', async () => {
    const { tools } = await freshPlugin(dataDir, backupDir, '7');
    const result = await tools[0].execute();
    expect(result).not.toContain('Pruned');
  });

  it('output mentions how many snapshots were pruned when pruning occurs', async () => {
    fs.mkdirSync(path.join(backupDir, '2025-01-01'));
    fs.mkdirSync(path.join(backupDir, '2025-01-02'));
    fs.mkdirSync(path.join(backupDir, '2025-01-03'));

    const { tools } = await freshPlugin(dataDir, backupDir, '2');
    const result = await tools[0].execute();
    expect(result).toContain('Pruned');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('backup_data execute — error handling', () => {
  it('returns an error string if the source directory does not exist', async () => {
    const missingDataDir = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(missingDataDir, backupDir);
    const result = await tools[0].execute();
    expect(result).toContain('Backup failed');
    expect(result).toContain('does not exist');
  });

  it('returns a string (not throws) when source is missing', async () => {
    const missingDataDir = path.join(os.tmpdir(), 'nope-' + Date.now());
    const backupDir = tmpDir('-dst');
    const { tools } = await freshPlugin(missingDataDir, backupDir);
    await expect(tools[0].execute()).resolves.toEqual(expect.any(String));
  });
});
