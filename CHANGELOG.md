# Changelog

All notable changes to this project will be documented in this file.

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
