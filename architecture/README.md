# @goose-plugins/architecture

Architecture memory and C4 Context diagram generator plugin for [Goose](https://github.com/rorystandley/goose).

Teach Goose about your systems, services, and the people who use them, then ask it to generate a C4 Context diagram whenever you need one.

---

## What it does

This plugin gives Goose four new tools:

| Tool | Description |
|---|---|
| `remember_system` | Store a software system, service, database, or external platform |
| `remember_person` | Store a person, user type, or role (C4 "Person" element) |
| `remember_relationship` | Store a directional relationship between two systems or people |
| `generate_diagram` | Generate a C4 Context diagram from everything stored so far |

Everything is persisted to `data/architecture.json` so it survives restarts and is available across all Goose interfaces (Slack, CLI, voice, web).

---

## Usage

Once installed, just talk to Goose:

```
Tell Goose about your systems:
  "remember that our payment service talks to Stripe"
  "we have a React web app used by end users"

Generate a diagram:
  "generate a C4 context diagram in Mermaid format"
  "draw our architecture as PlantUML"
  "give me the architecture in LikeC4 format"
```

Goose handles the rest — calling the tools, storing the data, and returning the diagram DSL ready to paste into a renderer.

### Diagram formats

| Format | Renderer |
|---|---|
| `plantuml` (default) | [plantuml.com](https://www.plantuml.com/plantuml/uml/), any PlantUML editor |
| `mermaid` | GitHub, Notion, Obsidian, [mermaid.live](https://mermaid.live) |
| `likec4` | `npx likec4 start` ([likec4.dev](https://likec4.dev)) |

---

## Installation

```bash
npm install @goose-plugins/architecture
```

Restart Goose — it auto-discovers any `@goose-plugins/*` package in `node_modules`.

> **Want to build your own plugin?**
> See the [Goose plugin guide](https://github.com/rorystandley/goose/blob/develop/docs/plugins.md) for the full plugin interface, local development workflow, and publishing instructions.

---

## Data

Architecture data is stored as JSON:

```json
{
  "systems": {
    "payment-service": { "label": "Payment Service", "description": "Handles billing", "external": false },
    "stripe": { "label": "Stripe", "description": "Payment processor", "external": true }
  },
  "people": {
    "end-user": { "label": "End User", "description": "Customer using the app" }
  },
  "relationships": [
    { "from": "payment-service", "to": "stripe", "label": "Sends charges to" }
  ]
}
```

Relationships are deduplicated by `from`+`to` pair — adding the same pair again updates the label.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `ARCHITECTURE_PATH` | `data/architecture.json` | Override where architecture data is persisted |

---

## Part of the Goose ecosystem

This plugin follows the standard [Goose plugin interface](https://github.com/rorystandley/goose/blob/develop/docs/plugins.md). See that guide for details on how plugins are loaded, how to add persistence, and how to publish your own.
