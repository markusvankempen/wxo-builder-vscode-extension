# Contributing to WxO Builder

> **Note:** This extension is currently in **Beta**. Contributions are welcome!

WxO Builder is an open-source VS Code extension for IBM Watson Orchestrate. This page describes how you can join the project and contribute.

**Author:** Markus van Kempen (markus.van.kempen@gmail.com)  
**Date:** 17-Feb-2026

## Before You Start

- Read the [README](./README.md) to understand the extension's features.

## Style and Lint

This project uses the following tools to ensure code quality and a consistent code style:

- [ESLint](https://eslint.org/) — Linting Utility for TypeScript
- [Prettier](https://prettier.io/) — Code Formatter
- [commitlint](https://commitlint.js.org/) — Lint commit messages according to [Conventional Commits](https://www.conventionalcommits.org/)
- [Husky](https://typicode.github.io/husky/) — Git hooks (pre-commit and commit-msg)
- [lint-staged](https://github.com/lint-staged/lint-staged) — Run linters on staged files only

### Available Scripts

| Command | Description |
|---|---|
| `npm run compile` | Compile TypeScript to `out/` |
| `npm run watch` | Watch mode for development |
| `npm run lint` | Run ESLint on `src/` |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without modifying files |
| `npm run check` | Run lint + format check + compile (full CI check) |
| `npm run fix` | Auto-fix lint + format issues |
| `npm run test` | Run tests |
| `npm run package` | Package extension into `.vsix` |

## Set Up a Development Environment

1. Clone the repo:
   ```sh
   git clone https://github.com/markusvankempen/wxo-builder-vscode-extension.git
   cd wxo-builder-vscode-extension
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Run the full check to verify your environment:
   ```sh
   npm run check
   ```

4. Open in VS Code and press `F5` to launch the Extension Development Host.

## Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) to structure our commit messages. This is enforced by commitlint on each commit.

Format:
```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`

**Scopes:** `extension`, `api`, `panels`, `views`, `skills`, `agents`, `flows`, `diagnostics`, `deps`, `infra`, `docs`

Examples:
```
feat(agents): add chat testing interface
fix(api): handle empty response from tool invocation
docs(extension): update README with beta notice
chore(deps): upgrade eslint to v9
```

## Issues and Pull Requests

- Open an issue before starting significant work to discuss the approach.
- Use Draft PRs with `[WIP]` prefix for work-in-progress.
- All PRs must pass `npm run check` before merging.

## Project Structure

```
src/
├── api/           # Watson Orchestrate API clients (agents, skills, flows)
├── panels/        # Webview Panels (SkillEditor, AgentEditor, Diagnostics)
├── views/         # Tree Data Providers for sidebar views
└── extension.ts   # Extension entry point, command registration
```

## Legal

### License
Distributed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

SPDX-License-Identifier: Apache-2.0
