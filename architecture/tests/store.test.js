import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

function tmpPath() {
  return path.join(os.tmpdir(), `arch-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

async function freshStore(filePath) {
  vi.stubEnv('ARCHITECTURE_PATH', filePath);
  vi.resetModules();
  return import('../store.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── addSystem ─────────────────────────────────────────────────────────────────

describe('addSystem', () => {
  it('stores a system with all fields', async () => {
    const { addSystem, getArchitectureData } = await freshStore(tmpPath());
    addSystem('api', 'API Gateway', 'Routes traffic', false);
    expect(getArchitectureData().systems['api']).toEqual({
      label: 'API Gateway',
      description: 'Routes traffic',
      external: false,
    });
  });

  it('marks external systems correctly', async () => {
    const { addSystem, getArchitectureData } = await freshStore(tmpPath());
    addSystem('stripe', 'Stripe', 'Payments', true);
    expect(getArchitectureData().systems['stripe'].external).toBe(true);
  });

  it('defaults external to false when not provided', async () => {
    const { addSystem, getArchitectureData } = await freshStore(tmpPath());
    addSystem('svc', 'My Service', 'Does things');
    expect(getArchitectureData().systems['svc'].external).toBe(false);
  });

  it('overwrites an existing system when the same name is re-added', async () => {
    const { addSystem, getArchitectureData } = await freshStore(tmpPath());
    addSystem('svc', 'Old Label', 'Old desc', false);
    addSystem('svc', 'New Label', 'New desc', true);
    const sys = getArchitectureData().systems['svc'];
    expect(sys.label).toBe('New Label');
    expect(sys.external).toBe(true);
  });

  it('persists to disk so a re-loaded store sees the data', async () => {
    const file = tmpPath();
    const { addSystem } = await freshStore(file);
    addSystem('persisted', 'Persisted', 'Should survive reload', false);
    const { getArchitectureData } = await freshStore(file);
    expect(getArchitectureData().systems['persisted']).toBeDefined();
  });
});

// ── addPerson ─────────────────────────────────────────────────────────────────

describe('addPerson', () => {
  it('stores a person with label and description', async () => {
    const { addPerson, getArchitectureData } = await freshStore(tmpPath());
    addPerson('admin', 'Admin', 'Manages the system');
    expect(getArchitectureData().people['admin']).toEqual({
      label: 'Admin',
      description: 'Manages the system',
    });
  });

  it('defaults description to empty string when omitted', async () => {
    const { addPerson, getArchitectureData } = await freshStore(tmpPath());
    addPerson('user', 'End User');
    expect(getArchitectureData().people['user'].description).toBe('');
  });

  it('overwrites an existing person when the same name is re-added', async () => {
    const { addPerson, getArchitectureData } = await freshStore(tmpPath());
    addPerson('user', 'Old Name', 'Old desc');
    addPerson('user', 'New Name', 'New desc');
    expect(getArchitectureData().people['user'].label).toBe('New Name');
  });
});

// ── addRelationship ───────────────────────────────────────────────────────────

describe('addRelationship', () => {
  it('stores a relationship', async () => {
    const { addRelationship, getArchitectureData } = await freshStore(tmpPath());
    addRelationship('api', 'db', 'reads from');
    const rels = getArchitectureData().relationships;
    expect(rels).toHaveLength(1);
    expect(rels[0]).toEqual({ from: 'api', to: 'db', label: 'reads from' });
  });

  it('deduplicates by from+to — second add updates the label', async () => {
    const { addRelationship, getArchitectureData } = await freshStore(tmpPath());
    addRelationship('api', 'db', 'reads from');
    addRelationship('api', 'db', 'reads and writes to');
    const rels = getArchitectureData().relationships;
    expect(rels).toHaveLength(1);
    expect(rels[0].label).toBe('reads and writes to');
  });

  it('does NOT deduplicate relationships with different from+to pairs', async () => {
    const { addRelationship, getArchitectureData } = await freshStore(tmpPath());
    addRelationship('a', 'b', 'calls');
    addRelationship('b', 'a', 'responds to');
    expect(getArchitectureData().relationships).toHaveLength(2);
  });

  it('can store multiple independent relationships', async () => {
    const { addRelationship, getArchitectureData } = await freshStore(tmpPath());
    addRelationship('ui', 'api', 'sends requests to');
    addRelationship('api', 'db', 'queries');
    addRelationship('api', 'stripe', 'charges via');
    expect(getArchitectureData().relationships).toHaveLength(3);
  });
});

// ── getArchitectureData ───────────────────────────────────────────────────────

describe('getArchitectureData', () => {
  it('returns empty store when data file does not exist', async () => {
    const { getArchitectureData } = await freshStore(tmpPath());
    expect(getArchitectureData()).toEqual({ systems: {}, people: {}, relationships: [] });
  });

  it('returns deep copies — mutating the result does not affect the store', async () => {
    const { addSystem, getArchitectureData } = await freshStore(tmpPath());
    addSystem('svc', 'Service', 'Desc', false);
    const data = getArchitectureData();
    data.systems['svc'].label = 'MUTATED';
    expect(getArchitectureData().systems['svc'].label).toBe('Service');
  });

  it('loads existing data from disk on first import', async () => {
    const file = tmpPath();
    const seed = {
      systems: { 'seed-svc': { label: 'Seed', description: 'From disk', external: false } },
      people: {},
      relationships: [],
    };
    fs.writeFileSync(file, JSON.stringify(seed, null, 2), 'utf8');
    const { getArchitectureData } = await freshStore(file);
    expect(getArchitectureData().systems['seed-svc']).toBeDefined();
  });
});

// ── getArchitectureAsText ─────────────────────────────────────────────────────

describe('getArchitectureAsText', () => {
  it('returns null when the store is empty', async () => {
    const { getArchitectureAsText } = await freshStore(tmpPath());
    expect(getArchitectureAsText()).toBeNull();
  });

  it('includes systems section when systems are present', async () => {
    const { addSystem, getArchitectureAsText } = await freshStore(tmpPath());
    addSystem('api', 'API Gateway', 'Routes traffic', false);
    const text = getArchitectureAsText();
    expect(text).toContain('Systems:');
    expect(text).toContain('API Gateway');
    expect(text).toContain('internal');
  });

  it('labels external systems as "external" in text output', async () => {
    const { addSystem, getArchitectureAsText } = await freshStore(tmpPath());
    addSystem('stripe', 'Stripe', 'Payments', true);
    expect(getArchitectureAsText()).toContain('external');
  });

  it('includes people section when people are present', async () => {
    const { addPerson, getArchitectureAsText } = await freshStore(tmpPath());
    addPerson('admin', 'Admin', 'Manages things');
    const text = getArchitectureAsText();
    expect(text).toContain('People:');
    expect(text).toContain('Admin');
  });

  it('includes relationships section when relationships are present', async () => {
    const { addRelationship, getArchitectureAsText } = await freshStore(tmpPath());
    addRelationship('ui', 'api', 'sends requests to');
    const text = getArchitectureAsText();
    expect(text).toContain('Relationships:');
    expect(text).toContain('ui');
    expect(text).toContain('api');
  });
});

// ── ARCHITECTURE_PATH env var ─────────────────────────────────────────────────

describe('ARCHITECTURE_PATH environment variable', () => {
  it('writes to the path specified by ARCHITECTURE_PATH', async () => {
    const file = tmpPath();
    const { addSystem } = await freshStore(file);
    addSystem('env-svc', 'Env Service', 'Test', false);
    expect(fs.existsSync(file)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(raw.systems['env-svc']).toBeDefined();
  });

  it('creates the parent directory if it does not exist', async () => {
    const dir = path.join(os.tmpdir(), `arch-test-dir-${Date.now()}`);
    const file = path.join(dir, 'nested', 'arch.json');
    const { addSystem } = await freshStore(file);
    addSystem('mkdirp-test', 'MkdirP Test', 'Should auto-create dirs', false);
    expect(fs.existsSync(file)).toBe(true);
  });
});
