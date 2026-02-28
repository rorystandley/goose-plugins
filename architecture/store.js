/**
 * Architecture memory store.
 *
 * Persists systems, people, and relationships to data/architecture.json.
 * Follows the same pattern as src/agent/facts.js — module-level load,
 * silent failures, returns copies to prevent external mutation.
 */

import fs from 'fs';
import path from 'path';

const ARCHITECTURE_PATH = process.env.ARCHITECTURE_PATH
  || path.join(process.cwd(), 'data', 'architecture.json');

function emptyStore() {
  return { systems: {}, people: {}, relationships: [] };
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(ARCHITECTURE_PATH, 'utf8'));
  } catch {
    return emptyStore();
  }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(ARCHITECTURE_PATH), { recursive: true });
    fs.writeFileSync(ARCHITECTURE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* silent */ }
}

let store = load();

// ---------------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------------

export function addSystem(name, label, description, external = false) {
  try {
    store.systems[name] = { label, description, external: Boolean(external) };
    save(store);
  } catch { /* silent */ }
}

export function addPerson(name, label, description = '') {
  try {
    store.people[name] = { label, description };
    save(store);
  } catch { /* silent */ }
}

export function addRelationship(from, to, label) {
  try {
    // Deduplicate by from+to — update label if the pair already exists
    store.relationships = store.relationships.filter(
      r => !(r.from === from && r.to === to),
    );
    store.relationships.push({ from, to, label });
    save(store);
  } catch { /* silent */ }
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export function getArchitectureData() {
  // Deep copy each entry so callers cannot mutate stored objects
  return {
    systems: Object.fromEntries(
      Object.entries(store.systems).map(([k, v]) => [k, { ...v }]),
    ),
    people: Object.fromEntries(
      Object.entries(store.people).map(([k, v]) => [k, { ...v }]),
    ),
    relationships: store.relationships.map(r => ({ ...r })),
  };
}

/**
 * Returns a one-line-per-section human-readable summary for system prompt
 * injection, or null if the store is empty.
 */
export function getArchitectureAsText() {
  const { systems, people, relationships } = store;
  const systemEntries = Object.entries(systems);
  const peopleEntries = Object.entries(people);

  if (!systemEntries.length && !peopleEntries.length && !relationships.length) {
    return null;
  }

  const lines = [];

  if (systemEntries.length) {
    const list = systemEntries
      .map(([, s]) => `${s.label} (${s.external ? 'external' : 'internal'}) — ${s.description}`)
      .join(' | ');
    lines.push(`Systems: ${list}`);
  }

  if (peopleEntries.length) {
    const list = peopleEntries
      .map(([, p]) => `${p.label}${p.description ? ` — ${p.description}` : ''}`)
      .join(' | ');
    lines.push(`People: ${list}`);
  }

  if (relationships.length) {
    const list = relationships
      .map(r => `${r.from} → ${r.to} "${r.label}"`)
      .join(' | ');
    lines.push(`Relationships: ${list}`);
  }

  return lines.join('\n');
}
