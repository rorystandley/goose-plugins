import { describe, it, afterEach, expect, vi } from 'vitest';
import os from 'os';
import path from 'path';

function tmpPath() {
  return path.join(os.tmpdir(), `arch-idx-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

async function freshIndex(filePath) {
  vi.stubEnv('ARCHITECTURE_PATH', filePath);
  vi.resetModules();
  return import('../index.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── tools export shape ────────────────────────────────────────────────────────

describe('tools export', () => {
  it('exports a "tools" named export that is an Array', async () => {
    const { tools } = await freshIndex(tmpPath());
    expect(Array.isArray(tools)).toBe(true);
  });

  it('exports exactly 4 tools', async () => {
    const { tools } = await freshIndex(tmpPath());
    expect(tools).toHaveLength(4);
  });

  it('exports the correct tool names in order', async () => {
    const { tools } = await freshIndex(tmpPath());
    expect(tools.map(t => t.name)).toEqual([
      'remember_system',
      'remember_person',
      'remember_relationship',
      'generate_diagram',
    ]);
  });
});

// ── per-tool shape validation ─────────────────────────────────────────────────

describe('each tool has required Goose plugin interface fields', () => {
  it('every tool has name, description, riskLevel, parameters, execute', async () => {
    const { tools } = await freshIndex(tmpPath());
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.riskLevel).toBe('string');
      expect(typeof tool.parameters).toBe('object');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('every tool has riskLevel of "safe"', async () => {
    const { tools } = await freshIndex(tmpPath());
    for (const tool of tools) {
      expect(tool.riskLevel).toBe('safe');
    }
  });

  it('every tool parameters object has type "object" and a properties field', async () => {
    const { tools } = await freshIndex(tmpPath());
    for (const tool of tools) {
      expect(tool.parameters.type).toBe('object');
      expect(typeof tool.parameters.properties).toBe('object');
    }
  });
});

// ── remember_system ───────────────────────────────────────────────────────────

describe('remember_system tool', () => {
  it('has required parameters: name, label, description', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_system');
    expect(tool.parameters.required).toContain('name');
    expect(tool.parameters.required).toContain('label');
    expect(tool.parameters.required).toContain('description');
  });

  it('parameters.properties.external has type boolean', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_system');
    expect(tool.parameters.properties.external.type).toBe('boolean');
  });

  it('execute() resolves to "Noted."', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_system');
    const result = await tool.execute({ name: 'svc', label: 'Service', description: 'Test' });
    expect(result).toBe('Noted.');
  });

  it('execute() works when external is omitted (defaults to false)', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_system');
    await expect(
      tool.execute({ name: 'svc', label: 'Svc', description: 'Desc' })
    ).resolves.toBe('Noted.');
  });
});

// ── remember_person ───────────────────────────────────────────────────────────

describe('remember_person tool', () => {
  it('has required parameters: name and label', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_person');
    expect(tool.parameters.required).toContain('name');
    expect(tool.parameters.required).toContain('label');
  });

  it('description is NOT in the required array (it is optional)', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_person');
    expect(tool.parameters.required).not.toContain('description');
  });

  it('execute() resolves to "Noted."', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_person');
    const result = await tool.execute({ name: 'admin', label: 'Admin' });
    expect(result).toBe('Noted.');
  });
});

// ── remember_relationship ─────────────────────────────────────────────────────

describe('remember_relationship tool', () => {
  it('has required parameters: from, to, label', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_relationship');
    expect(tool.parameters.required).toContain('from');
    expect(tool.parameters.required).toContain('to');
    expect(tool.parameters.required).toContain('label');
  });

  it('execute() resolves to "Noted."', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'remember_relationship');
    const result = await tool.execute({ from: 'ui', to: 'api', label: 'calls' });
    expect(result).toBe('Noted.');
  });
});

// ── generate_diagram ──────────────────────────────────────────────────────────

describe('generate_diagram tool', () => {
  it('has no required parameters', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    expect(tool.parameters.required).toEqual([]);
  });

  it('format parameter has enum with plantuml, mermaid, likec4', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    const formats = tool.parameters.properties.format.enum;
    expect(formats).toContain('plantuml');
    expect(formats).toContain('mermaid');
    expect(formats).toContain('likec4');
  });

  it('execute() with no args returns a PlantUML diagram string', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    const result = await tool.execute();
    expect(result).toContain('@startuml');
    expect(result).toContain('@enduml');
  });

  it('execute() with format="mermaid" returns a Mermaid diagram string', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    const result = await tool.execute({ format: 'mermaid' });
    expect(result).toContain('C4Context');
  });

  it('execute() with format="likec4" returns a LikeC4 diagram string', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    const result = await tool.execute({ format: 'likec4' });
    expect(result).toContain('specification');
    expect(result).toContain('model');
  });

  it('execute() with format="plantuml" returns a PlantUML diagram string', async () => {
    const { tools } = await freshIndex(tmpPath());
    const tool = tools.find(t => t.name === 'generate_diagram');
    const result = await tool.execute({ format: 'plantuml' });
    expect(result).toContain('@startuml');
  });

  it('stored systems appear in the diagram output', async () => {
    const file = tmpPath();
    const { tools } = await freshIndex(file);
    const rememberSystem = tools.find(t => t.name === 'remember_system');
    const generateDiagram = tools.find(t => t.name === 'generate_diagram');
    await rememberSystem.execute({ name: 'api', label: 'API Gateway', description: 'Routes traffic', external: false });
    const result = await generateDiagram.execute({ format: 'plantuml' });
    expect(result).toContain('API Gateway');
  });
});
