# WxO Builder (Watsonx Orchestrate Development Tool) - BETA

> **Note:** This extension is currently in **Beta**. Features are subject to change, and you may encounter issues. Please report any bugs or feedback to the [repository issues page](https://github.com/markusvankempen/wxo-builder-vscode-extension/issues).

This extension integrates IBM Watson Orchestrate into Visual Studio Code, allowing you to build, deploy, and manage tools, agents, and connections directly from your IDE.

## Installation

*   **VS Code Marketplace** (when published): Search for "WxO Builder" in the Extensions view.
*   **From VSIX**: Download a `.vsix` package and use **Install from VSIX…** from the Extensions menu.
*   **Develop**: Clone the repo, run `npm install` and `npm run compile`, then press **F5** to launch the Extension Development Host.

## Features

### 🛠️ **Tool Creator & Manager**
Build and manage Watsonx Orchestrate tools with a full-featured editor.

*   **Create Tools Easily**:
    *   Start from a **blank template** or use **built-in templates**: Weather (weatherapi.com), World Time, Dad Jokes, Aviation Weather METAR, News Search, University Search, Zip Code, Currency Exchange, Yahoo Finance.
    *   **Load Template** or **Import OpenAPI File** to get started quickly.
*   **Form View**: Edit tool metadata (Title, Description, Version, Permission, Restrictions, Tags).
*   **JSON Editor**:
    *   Full control over the OpenAPI definition.
    *   **Export OpenAPI File** to save the spec locally.
    *   **Validate** — checks OpenAPI and WxO schema structure.
    *   **View Diff** (edit mode) — compare original vs current before saving.
*   **Test & Debug**:
    *   **Run Local**: Call the API endpoint directly to verify before deployment.
    *   **Run Remote**: Invoke via Watson Orchestrate with connection credentials injected.
    *   **Copy as cURL**: Copy the last test request as a cURL command.
    *   **Generate from Response**: Auto-generate schema from actual API responses.

### 🔗 **Connections & Connectors**
*   **Active Connections**: View configured app connections with status (✅ / ❌).
*   **Connectors Catalog**: Browse 100+ application connectors.
*   **Configure Connection**: Right-click a tool to configure credentials in the WxO UI.

### 🤖 **Agents & Flows**
*   **Agents**: List, create, edit, and delete AI assistants.
*   **Flows**: List and manage orchestration flows.

### 📊 **Status & Diagnostics**
*   **Health Checks**: Configuration, authentication, and API connectivity.
*   **Configure** (Status & Diagnostics view only): Set API Key, Instance URL, and scope (draft/live).
*   **Scope Indicator**: Shows whether you're in draft or live environment.

## Getting Started

1.  **Open the WxO Builder** view in the Activity Bar.
2.  **Configure**: Open **Status & Diagnostics**, click **Configure**, or open Settings (`Cmd+,` / `Ctrl+,`) and search for `wxo-builder`.
    *   **API Key**: Your IBM Cloud API Key.
    *   **Instance URL**: Your Watson Orchestrate instance URL.
    *   **Scope**: `draft` (development) or `live` (production).
3.  **Explore your Resources**:
    *   Your existing Tools, Agents, and Flows will appear in the sidebar automatically.
4.  **Test a Tool**:
    *   Find a tool in the **Tools** view.
    *   Click the **▶ (Test Tool)** icon or right-click and select **Test Tool**.
    *   Enter any required parameters in the input box.
    *   Results will appear in the **WxO Tool Output channel**.
5.  **Manage Connections**:
    *   Check the **Connections** view to see if your apps (like Slack) are connected.
    *   Look for the **✅** icon. If you see **❌**, right-click the tool that requires it and select **Configure Connection**.

## Testing Tools (Local & Remote)

The extension allows two modes of testing:
1.  **Local (Direct HTTP)**: Calls the API endpoint directly from VS Code. Useful for verifying the API spec before deployment.
2.  **Tool (WxO)**: Calls the deployed tool via Watson Orchestrate. Verifies that the tool is correctly deployed and the binding is working.

## Troubleshooting

- **Tools not appearing**: 
  - Check the **Status & Diagnostics** view.
  - Click **Refresh** at the top of the Tools view.
- **403 Forbidden on Update**: 
  - Some tool fields are read-only. The extension handles this by only sending modifiable fields, but ensuring you have `read_write` permission on the tool is essential.
- **500 Error on Create**:
  - Often caused by invalid schemas. Try using the "Generate from Response" feature in the Test tab to ensure your schema matches the API payload.

For more help, click the **Book** icon (Documentation) in the generic menu.

## Configuration Reference

| Setting | Description |
|--------|-------------|
| `wxo-builder.apiKey` | IBM Cloud API Key for Watson Orchestrate |
| `wxo-builder.instanceUrl` | Watson Orchestrate instance URL |
| `wxo-builder.scope` | Environment: `draft` or `live` |
| `wxo-builder.agentId` | Optional agent ID for remote tool testing |
| `wxo-builder.debug` | Enable debug logging |

## License

Apache-2.0 — See [LICENSE](LICENSE) for details.

## Author

**Markus van Kempen**
