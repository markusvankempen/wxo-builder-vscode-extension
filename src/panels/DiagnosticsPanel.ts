/**
 * WxO Builder - Diagnostics Panel (BETA)
 * Webview panel for running health checks on WxO configuration and connectivity.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import * as vscode from "vscode";
import { getIamToken } from "../api/client";
import { listSkills } from "../api/skills";

export class DiagnosticsPanel {
    public static currentPanel: DiagnosticsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._setWebviewMessageListener(this._panel.webview);
    }

    public static render(extensionUri: vscode.Uri) {
        if (DiagnosticsPanel.currentPanel) {
            DiagnosticsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                "watsonxDiagnostics",
                "Watson Orchestrate Diagnostics",
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                }
            );

            DiagnosticsPanel.currentPanel = new DiagnosticsPanel(panel, extensionUri);
        }
    }

    public dispose() {
        DiagnosticsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Watson Orchestrate Diagnostics</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
            .card { background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 15px; margin-bottom: 10px; border-radius: 4px; }
            .status-pass { color: var(--vscode-testing-iconPassed); font-weight: bold; }
            .status-fail { color: var(--vscode-testing-iconFailed); font-weight: bold; }
            .status-warn { color: var(--vscode-list-warningForeground); font-weight: bold; }
            button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 12px; cursor: pointer; }
            button:hover { background-color: var(--vscode-button-hoverBackground); }
            code { background-color: var(--vscode-textBlockQuote-background); padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>Diagnostics</h1>
        <p>Check your connection to Watson Orchestrate.</p>
        
        <button id="run-btn">Run Diagnostics</button>
        <div id="results" style="margin-top: 20px;"></div>

        <script>
            const vscode = acquireVsCodeApi();
            const runBtn = document.getElementById('run-btn');
            const resultsDiv = document.getElementById('results');

            runBtn.addEventListener('click', () => {
                resultsDiv.innerHTML = '<p>Running checks...</p>';
                vscode.postMessage({ command: 'runDiagnostics' });
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'diagnosticResults') {
                    renderResults(message.results);
                }
            });

            function renderResults(results) {
                let html = '';
                results.forEach(res => {
                    const statusClass = res.status === 'PASS' ? 'status-pass' : 'status-fail';
                    html += \`
                        <div class="card">
                            <h3>\${res.name} <span class="\${statusClass}">\${res.status}</span></h3>
                            <p>\${res.message}</p>
                            \${res.details ? \`<pre><code>\${JSON.stringify(res.details, null, 2)}</code></pre>\` : ''}
                        </div>
                    \`;
                });
                resultsDiv.innerHTML = html;
            }
        </script>
      </body>
      </html>
    `;
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                if (message.command === "runDiagnostics") {
                    const results = await this._runChecks();
                    webview.postMessage({ command: "diagnosticResults", results });
                }
            },
            undefined,
            this._disposables
        );
    }

    private async _runChecks() {
        const results = [];

        // 1. Check Configuration
        const cfg = vscode.workspace.getConfiguration('wxo-builder');
        const apiKey = cfg.get<string>('apiKey') || process.env.WO_API_KEY;
        const instanceUrl = cfg.get<string>('instanceUrl') || process.env.WO_INSTANCE_URL;

        if (apiKey && instanceUrl) {
            results.push({ name: 'Configuration', status: 'PASS', message: 'API Key and Instance URL found.' });
        } else {
            results.push({ name: 'Configuration', status: 'FAIL', message: 'Missing API Key or Instance URL.', details: { apiKey: !!apiKey, instanceUrl: !!instanceUrl } });
        }

        // 2. Check Auth (IAM Token Request)
        try {
            const token = await getIamToken();
            results.push({ name: 'Authentication', status: 'PASS', message: 'Successfully acquired IAM Token.' });
        } catch (err: any) {
            results.push({ name: 'Authentication', status: 'FAIL', message: 'Failed to acquire IAM Token.', details: err.message });
        }

        // 3. Check API Connectivity (List Skills)
        try {
            const data = await listSkills(1);
            results.push({ name: 'API Connectivity', status: 'PASS', message: 'Successfully connected to Watson Orchestrate API.' });
        } catch (err: any) {
            results.push({ name: 'API Connectivity', status: 'FAIL', message: 'Failed to connect to Watson Orchestrate API.', details: err.message });
        }

        return results;
    }
}
