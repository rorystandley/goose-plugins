# goose-plugins

A collection of [Goose](https://github.com/rorystandley/goose) AI agent plugins, published to npm under the `@goose-plugins` scope.

[![CI](https://github.com/rorystandley/goose-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/rorystandley/goose-plugins/actions/workflows/ci.yml)

---

## Packages

| Package | Description |
|---|---|
| [`@goose-plugins/architecture`](./architecture) | Architecture memory and C4 Context diagram generator |

---

## Using a plugin

```bash
npm install @goose-plugins/architecture
```

Goose auto-discovers any `@goose-plugins/*` package in `node_modules` — restart Goose after installing. See the individual package README for full usage docs and configuration options.

---

## Repository structure

```
goose-plugins/
├── .github/
│   └── workflows/
│       ├── ci.yml          # runs tests for any changed package
│       └── publish.yml     # publishes any package via tag
├── architecture/           # @goose-plugins/architecture
│   ├── index.js
│   ├── store.js
│   ├── tests/
│   └── package.json
└── README.md
```

Each plugin is a self-contained package — its own `package.json`, its own tests, and its own npm publish lifecycle.

---

## Developing locally

```bash
git clone https://github.com/rorystandley/goose-plugins
cd goose-plugins/architecture
npm install
npm test              # run tests once
npm run test:watch    # watch mode during development
```

Tests use isolated temp files for each test case — nothing writes to your real `data/` directory.

---

## CI

`ci.yml` triggers on every push and pull request to `main`. It uses path filtering to only test packages with changed files, so a change to `architecture/` won't trigger tests for other packages.

Each package is tested against **Node 18 and Node 20**. Tests must pass on both before a PR can merge.

---

## Publishing

Publishing uses a tag convention: `<package-name>-v<semver>`.

```bash
# Publish @goose-plugins/architecture version 1.2.0
git tag architecture-v1.2.0
git push origin architecture-v1.2.0
```

`publish.yml` picks up the tag and automatically:

1. Extracts `package=architecture` and `version=1.2.0` from the tag
2. Runs `npm test` inside `architecture/` — the publish is aborted if tests fail
3. Sets the version in `package.json` from the tag (no manual version bump needed)
4. Publishes `@goose-plugins/architecture@1.2.0` to npm with `--access public`

---

## Adding a new plugin

1. Create a `<plugin-name>/` directory at the repo root
2. Add a `package.json`:
   ```json
   {
     "name": "@goose-plugins/<plugin-name>",
     "version": "1.0.0",
     "type": "module",
     "engines": { "node": ">=18.0.0" }
   }
   ```
3. Add `index.js` exporting a `tools` array following the [Goose plugin interface](https://github.com/rorystandley/goose/blob/develop/docs/plugins.md)
4. Add `tests/` with [Vitest](https://vitest.dev) tests (`npm install --save-dev vitest` inside the package dir)
5. In `.github/workflows/ci.yml`: add a filter entry for `<plugin-name>/**` and copy the `test-architecture` job block, updating the name and `working-directory`
6. Publish: `git tag <plugin-name>-v1.0.0 && git push origin <plugin-name>-v1.0.0` — no changes to `publish.yml` needed
