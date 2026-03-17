# Changelog

**Author:** markus.van.kempen@gmail.com  
**Date:** 14-Mar-2026

All notable changes to this project will be documented in this file.

## [1.6.4] - 2026-03-16

### Fixed

- **Evaluations Recent Traces refresh**: The Evaluations activity now retries trace lookup across short and extended time windows and no longer keeps stale empty trace results cached for an agent.
- **Recent trace diagnostics**: Added `npm run test:ui:recent-traces-agent` to verify recent trace visibility for a target agent such as `rbac_tester_agent` and write a diagnostic report under `out/tests/ui-operations/`.
- **UI test compile blocker**: Fixed the Knowledge Base editor UI-operation test so `npm run compile:tests` succeeds again before running the recent-traces diagnostic.

### Changed

- **Release version bumped**: Extension version advanced to `1.6.4` and packaged output now targets the trace-refresh release.

## [1.6.3] - 2026-03-16

### Added

- **Recent traces in Evaluations**: Added an agent-scoped `Recent Traces` section that opens the existing trace detail panel directly from the Evaluations activity.
- **Inspect run UI-operation test**: Added `npm run test:ui:inspect-agent-run` to exercise the live inspect-run flow against a configured Watsonx Orchestrate agent.

### Changed

- **Documentation refreshed for 1.6.3**: README, USER_GUIDE, and test docs now describe recent trace visibility and the new inspect-run UI-operation test.
- **Release version bumped**: Extension version advanced to `1.6.3` and packaged output now targets the new release.

## [1.6.2] - 2026-03-16

### Added

- **Knowledge Base editor**: Added create and edit flows for knowledge bases with local document upload, remote file URL support, structured JSON-backed form fields, connection dependency helper dropdowns, and advanced JSON editing for external vector index and conversational-search configuration.
- **Knowledge Base UI flow test**: Added `npm run test:ui:knowledge-base-editor` to cover create, patch, export, and cleanup for the new editor flow.
- **Evaluation insights drill-in**: Added agent-scoped sections for stored runs, test cases, attached tools, and a live run inspector that uses the extension's cloud run/thread APIs instead of any CLI abstraction.

### Changed

- **Documentation refreshed for 1.6.2**: README and USER_GUIDE now describe the new Knowledge Base editor flow and current UI test coverage.
- **Evaluations view reworked**: The Evaluations activity now separates stored evaluation artifacts from runtime inspection so the view exposes underlying test-case and tool context without mixing unrelated resource types.
- **Internal OpenAPI reference expanded**: `tests/scripts/InternalDocs/watson-orchestrate-openapi.json` now includes the extension-used knowledge base, toolkit, evaluations, runtime credential, and flow fallback endpoints that were previously missing.

## [1.6.1] - 2026-03-14

### Fixed

- **Named system auth isolation**: Systems loaded from `WxO/Systems/systems.json` no longer fall back to the workspace API key in the activity views or Sync panel. This fixes 403 `tenant-id in the Bearer token` errors when the selected system belongs to a different instance.
- **System API key env aliases**: Per-system credentials now resolve from both `WXO_API_KEY_<name>` and `WO_<NAME>_API_KEY` style environment variables, including names like `NEWv1`.
- **Systems panel editing**: The Sync Panel Systems tab now exposes an `Edit` action per system, shows whether a key is present, and includes a `Clear form` action to make updates explicit.

### Documentation

- **Credential precedence clarified**: README, USER_GUIDE, and SETUP now document that workspace-mode auth resolves the workspace `.env` before VS Code settings, and that named-system API keys are stored in VS Code SecretStorage.
- **Trial auth format corrected**: Setup docs now describe trial keys as MCSP API keys (typically starting with `azE6`) instead of the older `username:password` wording.

## [1.6.0] - 2026-03-14

### Added

- **CRUD test scripts** (`tests/scripts/crud/`): Executable tests for Create, Read, Update, Delete on agents, connections, tools, toolkits, knowledge bases, evaluations, and flows. Shared `woFetch` helper loads `.env` and obtains bearer token (MCSP or IAM). Run with `npm run test:crud:all` or per-object (e.g. `npm run test:crud:agents`).
- **Knowledge Bases full CRUD**: CRUD test creates a minimal KB via multipart document upload, then gets and deletes it. No longer requires optional env vars for Get/Delete.
- **UI operation test scripts** (`tests/scripts/ui-operations/`): Tests that mirror UI export/import: export agent, tool, toolkit, knowledge base; import toolkit; activate/deactivate skill. Run with `npm run test:ui:all`.
- **Unified test command**: `npm run test:object-operations` runs all CRUD and UI operation tests.

### Changed

- **Tools CRUD test**: OpenAPI tool create/update now sends required `permission`, `http_method`, and `http_path` in the binding.
- **Toolkits CRUD test**: Create uses `server_url` with a public MCP endpoint (API accepts `server_url` or `source`).
- **Evaluations CRUD test**: Treats 404 (evaluations API not available on some instances) as skipped so the test still passes.
- **Documentation**: README and USER_GUIDE updated with Testing section (CRUD and UI scripts). USER_GUIDE CRUD table now shows Knowledge Bases as Create ✅ (API).

---

## [1.5.0] - 2026-03-14

### Added

- **Knowledge Bases view**: Browse RAG/document stores. Export metadata, delete. Integrates with Watson Orchestrate `knowledge-bases` API.
- **Evaluations view**: Browse evaluation runs per agent. Expand agents to see runs (date, status, metrics). Export as CSV, delete runs.
- **Agent export with/without dependencies**: Choose "Agents + tools + connections" or "Agents only" when exporting agents.
- **Toolkit export/import**: Export toolkit as JSON; import toolkit from JSON file. Context menu and title bar commands.
- **Knowledge Base export/delete**: Right-click a KB to export metadata or delete.
- **Evaluation export/delete**: Right-click an evaluation run to export CSV or delete.
- **Sync panel: Knowledge Bases & Toolkits**: Export types include Knowledge Bases and Toolkits. Import supports toolkits from sync-export.json.
- **CRUD & Import/Export summary**: USER_GUIDE.md now includes a table of supported operations per object type.

### Changed

- **Sync panel export**: Toolkits and Knowledge Bases added as export types. Toolkits are now fetched standalone (in addition to toolkit tools in tools list).
- **Sync panel import**: Toolkits can be selected and imported from exported JSON. Import report includes toolkits created count.
- **Documentation**: README, USER_GUIDE, and CHANGELOG updated for Knowledge Bases, Evaluations, and import/export with/without dependencies.

## [1.4.0] - 2026-03-03

### Added
- **WxO Project Dir view**: New activity bar view that browses the entire `WxO/` workspace directory as a file tree. Supports New File, New Folder, Rename, Delete, Reveal in Explorer, Open in Terminal, Copy Path, and Open file actions. File types (`.env_*`, YAML, JSON, Python, shell) get distinct icons.
- **Toolkits (MCP) view**: MCP server toolkits are now shown in a dedicated view with nested tools. Toolkit tools are hidden from the standard Tools view to avoid confusion.
- **Plugins view search**: Search/filter support added to the Plugins view title bar.
- **Toolkits view search**: Search/filter support added to the Toolkits view title bar.
- **User Guide link in Sync Panel**: Clickable 📖 User Guide link in the Export/Import/Sync panel header opens the full user guide in Markdown preview.
- **Documentation accessible from all views**: Every activity bar view now has Documentation and Changelog entries in its title bar overflow menu (`...`). The docs button opens `USER_GUIDE.md` in Markdown preview.
- **Works in all VS Code-based IDEs**: Fully compatible with Cursor, Windsurf, Gitpod, GitHub Codespaces, and any other editor built on the VS Code extension API.

### Fixed
- **Trial API key not recognised**: Export, import, and diagnostics checks now correctly accept `trialApiKey` as a valid trial credential — no longer requires a standard `apiKey` to be set.
- **exportTool missing from Tools title bar**: Export Tool button was absent from the Tools view title bar; now present alongside Import Tool.
- **exportAgent missing from Agents title bar**: Export Agent button was absent from the Agents view title bar; now present alongside Import Agent.
- **Documentation button opened README**: The Documentation / Help command now opens `USER_GUIDE.md` instead of `README.md`.
- **Export from title bar respects tree selection**: `exportTool` and `exportAgent` title bar buttons now correctly pick up the current tree view selection, so clicking Export from the title bar exports the selected items rather than showing "No item selected".
- **"Configure API Key" error now actionable**: The error notification shown when credentials are missing now includes an **Open Settings** button that jumps directly to the `wxo-builder` settings section.

### Changed
- **Activity bar title bar consistency**: All eight views (Tools, Agents, Flows, Connections, Plugins, Toolkits, Diagnostics, WxO Project Dir) now have a consistent set of title bar buttons: Select System, Refresh, Search, Create, Import, Export, Sync Panel, Documentation, Changelog, and Open Extension.
- **USER_GUIDE.md fully rewritten**: Covers all views, commands, settings, IDE compatibility, screenshots, and troubleshooting. Replaces old WxO ToolBox content.
- **SETUP.md fully rewritten**: Reflects actual credential flow (VS Code Settings → env vars), multi-environment setup, trial key auth, and accurate mermaid sequence diagrams.
- **DOCUMENTATION.md removed**: Content merged into USER_GUIDE.md. README now links to USER_GUIDE.md and SETUP.md.

## [1.2.1] - 2026-03-01

### Fixed
- **Plugin Update Reliability**: Resolved a `422 Unprocessable Entity` error that occurred when attempting to rename a plugin's display name without modifying its description. The extension now safely retains the existing description text behind the scenes.
- **Python Plugin Version Pinning**: Explicitly patched the Webview edit pipeline to enforce strict pinning of `ibm-watsonx-orchestrate>=2.5.0` within `requirements.txt` upon upload. This permanently resolves the `AgentPostInvokePayload` parsing crash inside Watson Orchestrate's Python execution engine.
- **Webview UI Feedback**: Clicking "Update Plugin" inside the visual editor now correctly disables the button until the backend finishes and reports success (or failure) back to the user interface, preventing duplicate dispatch requests during network latency.

## [0.0.11] - 2026-02-24

### Added
- **Export/Import Tools, Agents, Flows, Connections**: Context menu Export and Import for each view. Export to JSON; Import from JSON or folder.
- **Export with dependencies**: Option to include connection dependencies when exporting tools, flows, or agents. Modal popup to choose (e.g. "Tools + connections" vs "Tools only").
- **Python tool 3-file export**: Python tools export as `tool-spec.json`, `tool.py`, and `requirements.txt` — ADK/CLI compatible, matches "Load from file" format.
- **Import from folder**: Import tools from a folder containing `tool-spec.json` + `tool.py` + `requirements.txt` (same layout as Load from file).
- **Multi-select for Fix for CLI**: Select multiple Python tools and right-click to fix all for CLI visibility.

### Changed
- Export options use modal popup (like Delete) instead of quick pick.
- Connections export includes full connection data when exporting with dependencies.

## [0.0.10] - 2026-02-22

### Added
- **Update Agent Prompt with Tools Info**: Button in Agent Editor Configuration tab that fills description, instructions, tags, welcome message, and quick prompts based on assigned tools.
- **Python Tool Input/Output Schema UI**: Visual parameter table (Name, Type, Description, Required, Delete) for input parameters; add/edit/delete in the Form view. Output type selector (object, string, string-binary). "Load parameters from JSON" button to sync JSON into the table. Copy Agent and Load Spec populate the table and output selector from existing schemas.

### Fixed
- **JSON Editor / openTab**: Tab switching in Tool Editor and Agent Editor now works reliably; JSON editor displays content correctly.

## [0.0.9] - 2026-02-22

### Added
- **Monaco JSON Editor**: Agent Editor and Tool Editor JSON tabs now use Monaco Editor with syntax highlighting, formatting, and a Format button.

### Fixed
- **Flows in Tools view**: Agentic workflows (flows) no longer appear under "Standard Tools". They now appear only in the Flows view.

## [0.0.8] - 2026-02-20

### Changed
- **Removed Preview/BETA badge**: Set `preview: false` so the extension no longer shows "Preview" or "BETA" in the title bar.

## [0.0.7] - 2026-02-20

### Added
- **Export as MCP Server**: Right-click an agent in the Agents view → **Export as MCP Server** to generate a self-contained MCP server project. Includes `chat`, `run_tool`, `list_tools`, and `get_agent` tools for use with Cursor, Claude Desktop, or other MCP clients.

### Changed
- **Removed BETA designation**: Extension is no longer labeled as Beta in descriptions and documentation.

## [0.0.6] - 2026-02-19

### Added
- **Agent Editor – Welcome message, Quick prompts, Agent style**: Edit chat starter settings (welcome_message, quick_prompts) and agent style (`default`, `react`, `planner`, `react_intrinsic`) in the Configuration tab.
- **Agent Editor – JSON Editor tab**: Edit the full agent as JSON and save. Supports name, description, instructions, llm, style, tools, tags, hidden, hide_reasoning, welcome_message, quick_prompts. Note documents additional API fields.
- **Agent Editor – Tags, Hidden, Hide reasoning**: Form fields and JSON support for tags (comma-separated), hidden (hide from agent list), hide_reasoning (hide thought process from end users).
- **Scrollable WebViews**: Edit Agent and Create Agent panels are scrollable when content overflows.

### Changed
- Code and documentation cleanup.

## [0.0.5] - 2026-02-19

### Added
- **Test and Generate Tool tab**: Renamed from "Test Tool" tab in Create Tool. After clicking Generate (from Response or URL), the view switches to Form View instead of JSON for easier editing.
- **Auto-create connection from URL**: Paste a full URL with API key; the Form view auto-fills servers, path, API key param name, and title so you can create connection and tool in one step.

### Changed
- **Marketplace Visibility**: Updated extension manifest (`package.json`) with optimized categories and keywords for better discoverability.
- **Enhanced Metadata**: Added `homepage`, `preview`, and improved `categories` (Machine Learning, Data Science).
- **SEO/Tags**: Added a robust set of keywords including `GenAI`, `LLM`, `Agentic AI`, and `IBM Cloud`.
- **Package metadata**: LICENSE (Markus van Kempen), README, CONTRIBUTING, DOCUMENTATION, CHANGELOG updated with author and date 19-Feb-2026.


## [0.0.4] - 2026-02-18

### Added
- **Detailed Documentation**: README updated with comprehensive feature descriptions and screenshots.
- **Improved Imagery**: Added screenshots for Tool Creator, JSON Editor, Testing, and Agent Management.
- **Repository Links**: All links now point to the new dedicated GitHub repository.

## [0.0.3] - 2026-02-18

### Added
- **Weather Tool template**: OpenAPI template for api.weatherapi.com (q, key params; optional connection).
- **Copy as cURL**: Copy the last local test request as a cURL command from the Test tab.
- **Export OpenAPI File**: Export the current OpenAPI JSON from the JSON Editor.
- **View Diff** (edit mode): Compare original vs current schema before saving.
- **Validation**: Validate OpenAPI and WxO skill schema; supports both formats. Pre-save validation with "Continue Anyway" option.
- **Blank template**: Create-new-tool no longer pre-fills httpbin.org URL; starts with empty servers/paths.
- **Scope config**: `wxo-builder.scope` (draft/live) to indicate environment; shown in Status & Diagnostics.

### Changed
- **Configure button**: Shown only in Status & Diagnostics view (removed from Tools, Agents, Connections, Flows).
- **Load Template before Import**: Reordered create-actions; Load Template and Import OpenAPI File on same row.
- **API key param in Generate**: Generate from Response and fetchAndGenerate now respect the API key param name (e.g. `key` for WeatherAPI).
- **syncForm**: Infers API key param name from operation parameters when schema lacks security info; no longer overwrites user's `key` with `apiKey`.

### Fixed
- **Validation for WxO format**: Edit/copy tools in WxO format (binding, input_schema) now validate correctly instead of reporting "Missing openapi".
- **Diagnostics config**: Uses `wxo-builder` config namespace (was `watsonx-orchestrate`).

## [0.0.2] - 2026-02-17

### Added
- **New Tool Templates**: Added University Search, Zip Code Information, Currency Exchange, and Yahoo Finance templates.
- **Tool Settings**: Added support for Permission (read_write/read_only), Restrictions, and Tags directly in the Tool Form.
- **Agent Model Selection**: Replaced Model ID text input with a dropdown containing common Watsonx models (Granite, Llama-3, etc.).
- **Flow Management**: Added Edit and Delete actions to the Flows view context menu.
- **Documentation / Help Menu**: Added a book icon to the Tools view title bar menu to quickly open the extension's documentation.
- **License and Author**: Updated README with Apache-2.0 license and author information.

### Changed
- **Tool Creation Improvement**: Automatically infer schemas from API responses in the Test tab.
- **Form View Refinement**: Improved layout for the "Info" section with better spacing and stacking.
- **Enhanced Save Logic**: Corrected metadata synchronization when updating existing tools (Version, Skill ID, etc.).
- **Standalone Tool Fix**: Ensure `input_schema` is always generated (even if empty) to fix "not editable" issues in the Watsonx Orchestrate UI.

### Fixed
- **Delete Tool 500 Error**: Resolved issue where deleting a tool returned a 500 status due to API response parsing.
- **Empty Metadata on Edit**: Added fallbacks to ensure Version, Skill ID, and Skill Name are populated when editing tools created via API.
- **Agent Creation Fix**: Resolved 422 error by ensuring the `style` field is included in the creation payload.
- **Remote Testing Disabled**: Temporarily disabled remote testing (Watsonx Orchestrate invocation) as the backend endpoint is currently returning 404.

## [0.0.1] - 2026-02-14

### Added
- Initial Beta release of WxO Builder.
- Tool Creator with Form and JSON views.
- Agents and Flows list views.
- Diagnostics panel.
