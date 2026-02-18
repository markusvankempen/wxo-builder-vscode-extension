/**
 * WxO Builder - Connection Details WebView Panel
 * Displays full details for a single Watson Orchestrate connection in a rich WebView.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import * as vscode from 'vscode';
import { ConnectionItem } from '../views/connectionsView';

export class ConnectionDetailsPanel {
    public static currentPanel: ConnectionDetailsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, connection: ConnectionItem) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtml(connection);

        this._panel.webview.onDidReceiveMessage(
            (message: any) => {
                if (message.command === 'openBrowser') {
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                }
            },
            undefined,
            this._disposables
        );
    }

    public static render(connection: ConnectionItem) {
        const title = `Connection: ${connection.appId}`;

        if (ConnectionDetailsPanel.currentPanel) {
            ConnectionDetailsPanel.currentPanel._panel.title = title;
            ConnectionDetailsPanel.currentPanel._panel.webview.html =
                ConnectionDetailsPanel.currentPanel._getHtml(connection);
            ConnectionDetailsPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'connectionDetails',
            title,
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        ConnectionDetailsPanel.currentPanel = new ConnectionDetailsPanel(panel, connection);
    }

    public dispose() {
        ConnectionDetailsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    private _getHtml(conn: ConnectionItem): string {
        const raw = conn.rawData || {};
        const isConfigured = conn.credentialsSet;
        const statusColor = isConfigured ? '#4caf50' : '#f44336';
        const statusText = isConfigured ? '✅ Credentials Configured' : '❌ Credentials Missing';
        const envBadgeColor = conn.environment === 'live' ? '#2196f3' : conn.environment === 'draft' ? '#ff9800' : '#9e9e9e';

        // Build a table of all raw fields
        const rawRows = Object.entries(raw)
            .map(([k, v]) => {
                const val = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '—');
                return `<tr>
                    <td style="padding:8px 12px; font-weight:600; opacity:0.75; white-space:nowrap; border-bottom:1px solid var(--border);">${k}</td>
                    <td style="padding:8px 12px; font-family:monospace; word-break:break-all; border-bottom:1px solid var(--border);">${escapeHtml(val)}</td>
                </tr>`;
            })
            .join('');

        // WxO Connections UI URL (best guess)
        const instanceUrl = vscode.workspace.getConfiguration('watsonx').get<string>('instanceUrl') || '';
        const connectionsUrl = instanceUrl ? `${instanceUrl.replace(/\/$/, '')}/connections` : '';

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connection Details</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --card: var(--vscode-sideBar-background, #1e1e2e);
    --border: var(--vscode-widget-border, #3c3c3c);
    --accent: var(--vscode-textLink-foreground, #4fc3f7);
    --input-bg: var(--vscode-input-background);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 13px;
    background: var(--bg);
    color: var(--fg);
    padding: 20px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .app-icon {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    flex-shrink: 0;
  }
  .header-text h1 {
    font-size: 1.3em;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.78em;
    font-weight: 600;
    margin-right: 6px;
  }
  .status-badge {
    background: ${statusColor}22;
    color: ${statusColor};
    border: 1px solid ${statusColor}55;
  }
  .env-badge {
    background: ${envBadgeColor}22;
    color: ${envBadgeColor};
    border: 1px solid ${envBadgeColor}55;
  }
  .section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .section-title {
    padding: 10px 14px;
    font-weight: 700;
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
    border-bottom: 1px solid var(--border);
    background: var(--vscode-sideBarSectionHeader-background, rgba(255,255,255,0.04));
  }
  .kv-grid {
    display: grid;
    grid-template-columns: 160px 1fr;
  }
  .kv-grid .key {
    padding: 9px 14px;
    font-weight: 600;
    opacity: 0.7;
    border-bottom: 1px solid var(--border);
    font-size: 0.9em;
  }
  .kv-grid .val {
    padding: 9px 14px;
    font-family: monospace;
    word-break: break-all;
    border-bottom: 1px solid var(--border);
    font-size: 0.9em;
  }
  .kv-grid .key:last-of-type,
  .kv-grid .val:last-of-type { border-bottom: none; }
  table { width: 100%; border-collapse: collapse; }
  .actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  button {
    padding: 7px 16px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.9em;
    font-weight: 600;
    background: var(--btn-bg);
    color: var(--btn-fg);
    transition: opacity 0.15s;
  }
  button:hover { opacity: 0.85; }
  button.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
  }
  .warning-box {
    background: #ff980022;
    border: 1px solid #ff980055;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 0.9em;
  }
  .success-box {
    background: #4caf5022;
    border: 1px solid #4caf5055;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 0.9em;
  }
</style>
</head>
<body>

<div class="header">
  <div class="app-icon">🔗</div>
  <div class="header-text">
    <h1>${escapeHtml(conn.appId)}</h1>
    <span class="badge status-badge">${statusText}</span>
    ${conn.environment ? `<span class="badge env-badge">${escapeHtml(conn.environment)}</span>` : ''}
    ${conn.authType ? `<span class="badge" style="background:#9c27b022;color:#ce93d8;border:1px solid #9c27b055;">${escapeHtml(conn.authType)}</span>` : ''}
  </div>
</div>

${!isConfigured ? `
<div class="warning-box">
  ⚠️ <strong>Credentials not configured.</strong> This connection exists but has no credentials set.
  Click <strong>"Configure in WxO UI"</strong> below to set up credentials.
</div>` : `
<div class="success-box">
  ✅ <strong>Connection is active.</strong> Credentials are configured${conn.environment === 'draft' ? ' (draft environment)' : ''}.
</div>`}

<div class="section">
  <div class="section-title">Core Details</div>
  <div class="kv-grid">
    <div class="key">App ID</div>
    <div class="val">${escapeHtml(conn.appId)}</div>
    <div class="key">Connection ID</div>
    <div class="val">${escapeHtml(conn.connectionId || '—')}</div>
    <div class="key">Auth Type</div>
    <div class="val">${escapeHtml(conn.authType || '—')}</div>
    <div class="key">Environment</div>
    <div class="val">${escapeHtml(conn.environment || '—')}</div>
    <div class="key">Credentials Set</div>
    <div class="val">${isConfigured ? '✅ Yes' : '❌ No'}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Raw API Response</div>
  <table>
    <tbody>${rawRows}</tbody>
  </table>
</div>

<div class="actions">
  ${connectionsUrl ? `<button onclick="openBrowser('${connectionsUrl}')">🌐 Configure in WxO UI</button>` : ''}
  <button class="secondary" onclick="copyJson()">📋 Copy Raw JSON</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const rawData = ${JSON.stringify(raw)};

  function openBrowser(url) {
    vscode.postMessage({ command: 'openBrowser', url });
  }

  function copyJson() {
    // Can't use clipboard API in webview directly, show in a pre block
    const pre = document.getElementById('json-dump');
    if (pre) {
      pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
    } else {
      const el = document.createElement('pre');
      el.id = 'json-dump';
      el.style.cssText = 'margin-top:12px;padding:12px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;overflow:auto;font-size:0.85em;white-space:pre-wrap;';
      el.textContent = JSON.stringify(rawData, null, 2);
      document.body.appendChild(el);
    }
  }
</script>
</body>
</html>`;
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
