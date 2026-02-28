/**
 * Architecture plugin for Goose.
 *
 * Provides tools for building and querying an architecture memory store
 * (systems, people, relationships) and generating C4 Context diagrams in
 * PlantUML, Mermaid, or LikeC4 format.
 *
 * Data is persisted to data/architecture.json (set ARCHITECTURE_PATH to override).
 */

import { addSystem, addPerson, addRelationship, getArchitectureData } from './store.js';

// ---------------------------------------------------------------------------
// Diagram renderers
// ---------------------------------------------------------------------------

function generatePlantUML(systems, people, relationships) {
  const lines = [
    '@startuml',
    '!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml',
    '',
    'title System Context Diagram',
    '',
  ];

  for (const [key, p] of Object.entries(people)) {
    lines.push(`Person(${key}, "${p.label}", "${p.description}")`);
  }
  for (const [key, s] of Object.entries(systems)) {
    const fn = s.external ? 'System_Ext' : 'System';
    lines.push(`${fn}(${key}, "${s.label}", "${s.description}")`);
  }
  if (relationships.length) {
    lines.push('');
    for (const r of relationships) {
      lines.push(`Rel(${r.from}, ${r.to}, "${r.label}")`);
    }
  }
  lines.push('');
  lines.push('@enduml');
  return lines.join('\n');
}

function generateMermaid(systems, people, relationships) {
  const lines = ['C4Context'];
  for (const [key, p] of Object.entries(people)) {
    lines.push(`  Person(${key}, "${p.label}", "${p.description}")`);
  }
  for (const [key, s] of Object.entries(systems)) {
    const fn = s.external ? 'System_Ext' : 'System';
    lines.push(`  ${fn}(${key}, "${s.label}", "${s.description}")`);
  }
  for (const r of relationships) {
    lines.push(`  Rel(${r.from}, ${r.to}, "${r.label}")`);
  }
  return lines.join('\n');
}

function generateLikeC4(systems, people, relationships) {
  const lines = [
    'specification {',
    '  element system',
    '  element person',
    '}',
    '',
    'model {',
  ];

  for (const [key, p] of Object.entries(people)) {
    lines.push(`  person ${key} '${p.label}' {`);
    lines.push(`    description '${p.description}'`);
    lines.push('  }');
  }
  for (const [key, s] of Object.entries(systems)) {
    lines.push(`  system ${key} '${s.label}' {`);
    lines.push(`    description '${s.description}'`);
    if (s.external) lines.push(`    tag external`);
    lines.push('  }');
  }
  for (const r of relationships) {
    lines.push(`  ${r.from} -> ${r.to} '${r.label}'`);
  }

  lines.push('}', '', 'views {', '  view index {', '    include *', '  }', '}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const remember_system = {
  name: 'remember_system',
  description: 'Store a system or service in the architecture memory. Use for any software system, service, database, or external platform. Persists across all conversations and interfaces.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      name:        { type: 'string',  description: 'Unique key (no spaces, use hyphens), e.g. "payment-service"' },
      label:       { type: 'string',  description: 'Human-readable name, e.g. "Payment Service"' },
      description: { type: 'string',  description: 'Short description of what this system does' },
      external:    { type: 'boolean', description: 'true if this is a third-party system not owned by us (e.g. Stripe, Slack)' },
    },
    required: ['name', 'label', 'description'],
  },
  execute: async ({ name, label, description, external = false }) => {
    try { addSystem(name, label, description, external); } catch { /* silent */ }
    return 'Noted.';
  },
};

const remember_person = {
  name: 'remember_person',
  description: 'Store a person, user type, or role in the architecture memory. Use for actors and personas in the system context (C4 "Person" element).',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      name:        { type: 'string', description: 'Unique key, e.g. "end-user" or "admin"' },
      label:       { type: 'string', description: 'Human-readable name or role, e.g. "End User" or "Admin"' },
      description: { type: 'string', description: 'What this person does in the system context' },
    },
    required: ['name', 'label'],
  },
  execute: async ({ name, label, description = '' }) => {
    try { addPerson(name, label, description); } catch { /* silent */ }
    return 'Noted.';
  },
};

const remember_relationship = {
  name: 'remember_relationship',
  description: 'Store a relationship between two systems or people in the architecture memory. Use the keys from remember_system / remember_person.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      from:  { type: 'string', description: 'Key of the source system or person' },
      to:    { type: 'string', description: 'Key of the target system or person' },
      label: { type: 'string', description: 'Description of the relationship, e.g. "Sends payments to"' },
    },
    required: ['from', 'to', 'label'],
  },
  execute: async ({ from, to, label }) => {
    try { addRelationship(from, to, label); } catch { /* silent */ }
    return 'Noted.';
  },
};

const generate_diagram = {
  name: 'generate_diagram',
  description: 'Generate a C4 Context architecture diagram from the stored systems, people, and relationships. Returns diagram DSL that can be pasted into a renderer.',
  riskLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['plantuml', 'mermaid', 'likec4'],
        description: 'Output format. plantuml (default) — paste into any PlantUML renderer. mermaid — renders in GitHub/Notion/Obsidian. likec4 — use with npx likec4 start.',
      },
    },
    required: [],
  },
  execute: async ({ format = 'plantuml' } = {}) => {
    try {
      const { systems, people, relationships } = getArchitectureData();
      if (format === 'mermaid') return generateMermaid(systems, people, relationships);
      if (format === 'likec4') return generateLikeC4(systems, people, relationships);
      return generatePlantUML(systems, people, relationships);
    } catch (err) {
      return `Error generating diagram: ${err.message}`;
    }
  },
};

// ---------------------------------------------------------------------------
// Plugin export — standard interface expected by loadPlugins()
// ---------------------------------------------------------------------------

export const tools = [
  remember_system,
  remember_person,
  remember_relationship,
  generate_diagram,
];
