/** Derive WxO security array from connection/application. */
function connectionToSecurity(app: any): any[] {
    const scheme = app?.security_scheme;
    if (Array.isArray(scheme) && scheme.length > 0) return scheme;
    if (scheme && typeof scheme === 'object' && scheme.type) return [scheme];
    const auth = (app?.auth_type || '').toLowerCase();
    if (auth === 'api_key' || auth === 'apikey' || auth === 'api-key') {
        return [{ type: 'apiKey', in: 'query', name: 'apiKey' }];
    }
    if (auth === 'bearer' || auth === 'oauth2') {
        return [{ type: 'http', scheme: 'bearer', name: 'Authorization' }];
    }
    return [{ type: 'apiKey', in: 'query', name: 'apiKey' }];
}

/**
 * WxO Builder - Skill/Tool Editor Panel (BETA)
 * Webview panel for viewing, editing, testing, and deploying tools/skills.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import * as vscode from "vscode";
import { getSkill, updateSkill, deleteSkill, invokeToolRemote, deploySkill } from "../api/skills";
import { ensureTestAgentForTool } from "../api/agents";
import { listConnections } from "../api/connections";
import fetch from "node-fetch";

const log = (msg: string, ...args: any[]) => {
    if (vscode.workspace.getConfiguration('wxo-builder').get<boolean>('debug', true)) {
        console.log('[WxO Editor]', msg, ...args);
    }
};

function validateOas(oas: any): string[] {
    const errors: string[] = [];
    if (!oas || typeof oas !== 'object') return ['Content is not a valid object.'];

    // WxO skill format (from Edit / API response): binding.openapi, input_schema
    const binding = oas?.binding?.openapi;
    if (binding && typeof binding === 'object') {
        if (!binding.http_method) errors.push('binding.openapi.http_method is required');
        if (!binding.http_path) errors.push('binding.openapi.http_path is required');
        if (!oas.input_schema || typeof oas.input_schema !== 'object') errors.push('input_schema is required for WxO tools');
        if (!oas.name && !oas.display_name) errors.push('name or display_name is required');
        return errors;
    }

    // OpenAPI format: openapi, info, paths
    if (!oas?.openapi) errors.push('Missing required field: openapi');
    else if (typeof oas.openapi !== 'string') errors.push('openapi must be a string (e.g. "3.0.1")');
    if (!oas?.info) errors.push('Missing required field: info');
    else {
        if (!oas.info.title) errors.push('info.title is required');
        if (oas.info.version === undefined || oas.info.version === null) errors.push('info.version is recommended');
    }
    if (oas?.paths !== undefined && (typeof oas.paths !== 'object' || Array.isArray(oas.paths))) errors.push('paths must be an object');
    if (oas?.servers !== undefined && !Array.isArray(oas.servers)) errors.push('servers must be an array');
    return errors;
}

export class SkillEditorPanel {
    public static currentPanel: SkillEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _skillId: string | null;
    private _extensionUri: vscode.Uri;
    private _isCreateMode: boolean;
    private _customContent: any;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, skillId: string | null, customContent?: any) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._skillId = skillId;
        this._isCreateMode = !skillId;
        this._customContent = customContent;
        log('Panel created:', { skillId: skillId ?? '(create mode)', isCreateMode: this._isCreateMode });
        this._panel.onDidDispose(() => { log('Panel disposed'); this.dispose(); }, null, this._disposables);
        this._setWebviewMessageListener(this._panel.webview);
    }

    public static async render(extensionUri: vscode.Uri, skillId: string | null, customContent?: any) {
        log('render() called:', { skillId: skillId ?? '(create)', hasCustomContent: !!customContent });
        let panelTitle = skillId ? `Edit Tool: ${skillId}` : `Create New Tool`;

        if (SkillEditorPanel.currentPanel) {
            if (SkillEditorPanel.currentPanel._skillId !== skillId) {
                log('Replacing panel (different skillId)');
                SkillEditorPanel.currentPanel.dispose();
            } else {
                log('Reusing existing panel, revealing');
                // If creating, we might want to update content if customContent is provided
                if (!skillId && customContent) {
                    SkillEditorPanel.currentPanel._customContent = customContent;
                    await SkillEditorPanel.currentPanel._loadData();
                }
                SkillEditorPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
                return;
            }
        }

        log('Creating new webview panel');
        const panel = vscode.window.createWebviewPanel(
            "skillEditor",
            panelTitle,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
            }
        );

        SkillEditorPanel.currentPanel = new SkillEditorPanel(panel, extensionUri, skillId, customContent);
        await SkillEditorPanel.currentPanel._loadData();
    }

    /** Fetches service homepage to extract title/description for tool info. */
    private async _fetchServiceInfo(urlObj: URL): Promise<{ title?: string; description?: string }> {
        try {
            const host = urlObj.hostname;
            let baseUrl = `${urlObj.protocol}//${host}`;
            if (host.startsWith('api.')) {
                const root = host.replace(/^api\./, '');
                baseUrl = `${urlObj.protocol}//www.${root}`;
            } else if (!host.startsWith('www.')) {
                baseUrl = `${urlObj.protocol}//www.${host}`;
            }
            const res = await fetch(baseUrl, { headers: { 'Accept': 'text/html' } });
            const html = await res.text();
            let title: string | undefined;
            let description: string | undefined;
            const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
            if (metaDesc) description = metaDesc[1].trim();
            if (!description) {
                const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
                if (ogDesc) description = ogDesc[1].trim();
            }
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) title = titleMatch[1].trim();
            if (!title) {
                const parts = host.replace(/^api\.|^www\./g, '').split('.');
                title = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ' API' : 'Generated Tool';
            }
            return { title, description };
        } catch {
            return {};
        }
    }

    private _pathToOperationId(path: string): string {
        const seg = path.replace(/^\//, '').split('/').filter(Boolean);
        const last = seg[seg.length - 1] || 'operation';
        const base = last.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]/gi, '_');
        return base || 'generatedOperation';
    }

    private _pathToSummary(path: string): string {
        const seg = path.replace(/^\//, '').split('/').filter(Boolean);
        const last = seg[seg.length - 1] || 'data';
        const base = last.replace(/\.[a-z0-9]+$/i, '');
        return base.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim() || 'Generated Operation';
    }

    private async _loadData() {
        log('_loadData() start:', { isCreateMode: this._isCreateMode, skillId: this._skillId });
        try {
            if (this._isCreateMode) {
                let connections: Array<{ connection_id: string; app_id: string; security?: any[] }> = [];
                try {
                    const connData = await listConnections();
                    const apps = connData?.applications ?? (Array.isArray(connData) ? connData : []);
                    connections = apps
                        .filter((a: any) => a.connection_id || a.app_id)
                        .map((a: any) => ({
                            connection_id: a.connection_id || a.app_id,
                            app_id: a.app_id || a.connection_id || 'Unknown',
                            security: connectionToSecurity(a)
                        }));
                } catch {
                    log('Could not fetch connections');
                }
                if (this._customContent) {
                    log('_loadData: using customContent');
                    this._panel.webview.html = this._getWebviewContent(this._customContent, connections);
                } else {
                    // Blank default — no URL until user loads a template or imports
                    const template = {
                        "openapi": "3.0.1",
                        "info": {
                            "title": "New Tool",
                            "version": "1.0.0",
                            "description": "Description of your new tool. Load a template or import OpenAPI to get started.",
                            "x-ibm-skill-name": "New Tool Service",
                            "x-ibm-skill-id": "new-tool-v1"
                        },
                        "restrictions": "editable",
                        "servers": [],
                        "paths": {}
                    };
                    log('_loadData: using blank default template');
                    this._panel.webview.html = this._getWebviewContent(template, connections);
                }
            } else {
                if (this._skillId) {
                    log('_loadData: fetching skill from API:', this._skillId);
                    const skill = await getSkill(this._skillId);
                    log('_loadData: skill fetched, keys:', Object.keys(skill || {}));
                    // Update panel title with friendly name
                    const friendlyName = skill.display_name || skill.name || this._skillId;
                    this._panel.title = `Edit Tool: ${friendlyName}`;
                    this._panel.webview.html = this._getWebviewContent(skill, []);
                }
            }
            log('_loadData() complete');
        } catch (e: any) {
            console.error('[WxO Editor] _loadData failed:', e);
            vscode.window.showErrorMessage(`Failed to load tool: ${e.message}`);
        }
    }

    public dispose() {
        SkillEditorPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(data: any, connections: Array<{ connection_id: string; app_id: string }> = []) {
        // Base64-encode JSON to avoid template literal / HTML injection
        const jsonStr = JSON.stringify(data, null, 2);
        const dataBase64 = Buffer.from(jsonStr, 'utf8').toString('base64');
        const connectionsBase64 = Buffer.from(JSON.stringify(connections), 'utf8').toString('base64');
        const mode = this._isCreateMode ? 'create' : 'edit';
        log('_getWebviewContent:', { jsonLen: jsonStr.length, base64Len: dataBase64.length, mode });

        const escapeHtml = (s: string) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/`/g, '&#96;');

        // Use external script file to avoid document.write/script injection issues in webview
        const scriptUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'skillEditor.js')
        );

        let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tool Editor</title>
        <style>
             :root {
                --tab-border: 1px solid var(--vscode-widget-border);
                --tab-active-bg: var(--vscode-editor-background);
                --tab-inactive-bg: var(--vscode-editor-inactiveSelectionBackground);
                --tab-text: var(--vscode-editor-foreground);
            }
            body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; overflow: hidden; }
            
            .main-content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
            .tab-content { display: none; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; }
            .tab-content.active { display: flex; }
            
            /* Tabs */
            .tabs { display: flex; border-bottom: var(--tab-border); margin-bottom: 20px; }
            .tab { padding: 8px 16px; cursor: pointer; border: var(--tab-border); border-bottom: none; background-color: var(--tab-inactive-bg); margin-right: 4px; border-radius: 4px 4px 0 0; opacity: 0.7; }
            .tab.active { background-color: var(--tab-active-bg); border-bottom: 1px solid var(--vscode-editor-background); margin-bottom: -1px; opacity: 1; font-weight: bold; }
            
            
            /* Form Style */
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, textarea { display: block; width: 100%; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; box-sizing: border-box; font-family: var(--vscode-font-family); }
            .form-group { margin-bottom: 15px; }
            textarea.code-editor { font-family: 'Courier New', Courier, monospace; flex-grow: 1; resize: none; }
            
            /* Test Tab */
            .test-controls { margin-bottom: 10px; padding: 10px; border: 1px solid var(--vscode-widget-border); background: var(--vscode-editor-inactiveSelectionBackground); }
            .test-option { margin-bottom: 10px; }
            .response-area { background-color: var(--vscode-editor-background); padding: 10px; border: 1px solid var(--vscode-widget-border); min-height: 120px; max-height: 300px; overflow: auto; white-space: pre-wrap; font-family: monospace; font-size: 0.88em; }
            
            /* Toolbar */
            .toolbar { display: flex; gap: 10px; justify-content: space-between; margin-top: 15px; border-top: 1px solid var(--vscode-widget-border); padding-top: 15px; }
            .actions-right { display: flex; gap: 10px; }
            
            button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; border-radius: 2px; }
            button:hover { background-color: var(--vscode-button-hoverBackground); }
            .secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            .secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
            .danger { background-color: var(--vscode-errorForeground); color: white; }
            .danger:hover { opacity: 0.9; }

            .create-actions { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--vscode-widget-border); }

            fieldset { border-radius: 4px; }
            fieldset legend { font-size: 0.95em; }
            table th, table td { padding: 4px 6px; }
            code { background: var(--vscode-editor-inactiveSelectionBackground); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family, 'Courier New', monospace); font-size: 0.9em; }

        </style>
      </head>
      <body>
        <div id="skill-initial-data" data-json="${dataBase64}" data-mode="${mode}" data-connections="${connectionsBase64}" style="display:none"></div>
        <h2>${this._isCreateMode ? 'Create New Tool (OpenAPI Definition)' : `Edit Tool: <span style="font-weight:normal">${escapeHtml(data.display_name || data.name || data.info?.title || '')}</span> <span style="font-size: 0.6em; opacity: 0.6;">${escapeHtml(this._skillId || '')}</span>`}</h2>
        
        ${this._isCreateMode ? `
        <div class="create-actions">
            <label style="margin-top:0;">Quick Start Template:</label>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <select id="template-select" style="flex-grow: 1; min-width: 180px; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);">
                    <option value="blank">Blank (no URL)</option>
                    <option value="weather">Weather (weatherapi.com) - Current weather by location</option>
                    <option value="world-time">World Time Tool (timeapi.io) - Get time for any timezone</option>
                    <option value="aviation-weather">Aviation Weather METAR (aviationweather.gov)</option>
                    <option value="dad-jokes">Dad Jokes (icanhazdadjoke.com) - Random dad jokes</option>
                    <option value="news-search">News Search - q, qInTitle, sources, domains (correct schema)</option>
                    <option value="news-app">News App (NewsAPI) - q, apiKey, pageSize</option>
                    <option value="universities">University Search (hipolabs.com)</option>
                    <option value="zip-code">Zip Code Info (zippopotam.us)</option>
                    <option value="currency">Currency Exchange (frankfurter.app)</option>
                    <option value="finance-yahoo">Yahoo Finance (Stocks)</option>
                </select>
                <button class="secondary" onclick="loadSelectedTemplate()">Load Template</button>
                <button class="secondary" onclick="requestImport()">Import OpenAPI File</button>
            </div>
        </div>
        ` : ''}

        <div class="tabs">
            <div class="tab active" data-tab="form" onclick="openTab('form')">Form View</div>
            <div class="tab" data-tab="json" onclick="openTab('json')">JSON Editor</div>
            <div class="tab" data-tab="test" onclick="openTab('test')">Test Tool</div>
        </div>

        <div id="form" class="tab-content active">
            <div style="overflow-y: auto; padding-right: 10px; flex: 1; min-height: 0;" id="form-container">
                <!-- Info Section (Name, Description editable in both modes) -->
                <fieldset style="border: 1px solid var(--vscode-widget-border); padding: 12px; margin-bottom: 12px;">
                    <legend style="font-weight: bold; padding: 0 6px;">Info</legend>
                    
                    <div class="form-group">
                        <label>${this._isCreateMode ? 'Name (Title)' : 'Display Name'}</label>
                        <input type="text" id="name" placeholder="Tool Name">
                    </div>
                    
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="description" rows="3"></textarea>
                    </div>

                    ${this._isCreateMode ? `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Version</label>
                            <input type="text" id="version" placeholder="1.0.0">
                        </div>
                        <div class="form-group">
                            <label>Skill ID <span style="opacity:0.5; font-size:0.85em;">(x-ibm-skill-id)</span></label>
                            <input type="text" id="skill-id" placeholder="skill-id-v1">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Skill Name <span style="opacity:0.5; font-size:0.85em;">(x-ibm-skill-name)</span></label>
                        <input type="text" id="skill-name" placeholder="Skill Name">
                    </div>
                    ` : '<p style="opacity:0.7; font-size:0.9em;">Only display name and description can be changed after creation. API, paths, parameters, and connection are fixed.</p>'}
                </fieldset>

                <!-- Settings Section -->
                <fieldset style="border: 1px solid var(--vscode-widget-border); padding: 12px; margin-bottom: 12px;">
                    <legend style="font-weight: bold; padding: 0 6px;">Settings</legend>
                    
                    <div class="form-group">
                        <label>Permission</label>
                        <select id="permission" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);">
                            <option value="read_write">Read/Write (Active)</option>
                            <option value="read_only">Read Only (Inactive)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Restrictions</label>
                        <input type="text" id="restrictions" placeholder="e.g. editable">
                    </div>

                    <div class="form-group">
                        <label>Tags (comma separated)</label>
                        <input type="text" id="tags" placeholder="tag1, tag2">
                    </div>
                    ${this._isCreateMode ? `
                    <div class="form-group">
                        <label>Connection <span style="opacity:0.5; font-size:0.85em;">(optional — set at creation, cannot change later)</span></label>
                        <select id="connection-id" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);">
                            <option value="">— None —</option>
                        </select>
                    </div>
                    <div class="form-group" id="api-key-param-group">
                        <label>API key param name <span style="opacity:0.5; font-size:0.85em;">(e.g. apiKey, key — used when connection injects credentials)</span></label>
                        <input type="text" id="api-key-param-name" placeholder="apiKey" value="apiKey" style="width: 100%; padding: 8px;">
                    </div>
                    ` : ''}
                </fieldset>

                ${this._isCreateMode ? `
                <!-- Servers Section (create only — not editable after creation) -->
                <fieldset style="border: 1px solid var(--vscode-widget-border); padding: 12px; margin-bottom: 12px;">
                    <legend style="font-weight: bold; padding: 0 6px;">Servers</legend>
                    <div id="servers-container"></div>
                </fieldset>

                <!-- Paths / Operations Section (create only — not editable after creation) -->
                <fieldset style="border: 1px solid var(--vscode-widget-border); padding: 12px; margin-bottom: 12px;">
                    <legend style="font-weight: bold; padding: 0 6px;">Paths &amp; Operations</legend>
                    <div id="paths-container"></div>
                </fieldset>
                <p style="opacity: 0.8; font-size: 0.9em;">Note: Editing these fields updates the OpenAPI definition. Use the JSON Editor for full control.</p>
                ` : `
                <!-- Edit mode: show read-only API summary (binding/input not editable) -->
                <fieldset style="border: 1px solid var(--vscode-widget-border); padding: 12px; margin-bottom: 12px;">
                    <legend style="font-weight: bold; padding: 0 6px;">API (read-only)</legend>
                    <div id="paths-container"></div>
                </fieldset>
                `}
            </div>
        </div>

        <div id="json" class="tab-content">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                <div style="display:flex; gap:6px;">
                    <button id="export-openapi-btn" class="secondary" type="button">Export OpenAPI File</button>
                    ${!this._isCreateMode ? '<button id="view-diff-btn" class="secondary" type="button">View Diff</button>' : ''}
                    <button id="validate-btn" class="secondary" type="button">Validate</button>
                </div>
            </div>
            <div id="validation-errors" style="display:none; margin-bottom:8px; padding:8px; background:var(--vscode-inputValidation-errorBackground); border:1px solid var(--vscode-inputValidation-errorBorder); border-radius:4px; font-size:0.9em;"></div>
            <textarea id="json-editor" class="code-editor" spellcheck="false"></textarea>
        </div>

        <div id="test" class="tab-content">
            <div id="auth-helper" style="display:none; margin-bottom:8px; padding:8px; border:1px solid var(--vscode-inputValidation-warningBorder); background:var(--vscode-inputValidation-warningBackground); border-radius:4px; font-size:0.85em;">
                <div style="font-weight:bold; margin-bottom:4px;">🔑 Auth</div>
                <div id="auth-helper-info"></div>
                <div id="auth-fields"></div>
            </div>
            <div id="test-tool-info" style="background: var(--vscode-editor-inactiveSelectionBackground); padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 0.82em; max-height: 80px; overflow-y: auto;"></div>
            <div class="test-controls" style="margin-bottom:8px; padding:8px; font-size:0.9em;">
                <div style="display:flex; gap:8px;">
                    <div style="flex:0 0 70px;"><label style="margin:0 0 2px 0; font-size:0.85em;">Method</label><input type="text" id="local-method" placeholder="GET" style="text-transform:uppercase;"></div>
                    <div style="flex:1;"><label style="margin:0 0 2px 0; font-size:0.85em;">URL</label><input type="text" id="local-url" placeholder="https://api.example.com/endpoint"></div>
                </div>
            </div>
            ${this._isCreateMode ? '<div style="margin-bottom:8px;"><button id="generate-btn" class="secondary" style="width:100%" disabled>Generate from Response</button></div>' : ''}
            <div style="margin-bottom:8px;">
                <label style="font-size:0.9em;">Params (JSON) <button id="params-from-url-btn" class="secondary" type="button" style="font-size:0.8em; padding:2px 8px; margin-left:6px;">From URL</button></label>
                <textarea id="test-params" class="code-editor" rows="4" placeholder='{}' style="font-size:0.88em;"></textarea>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                <button id="run-test-btn">▶ Run Local</button>
                <button id="run-remote-btn" class="secondary" title="Invoke via Watson Orchestrate">☁️ Run Remote</button>
                <button id="copy-curl-btn" class="secondary" title="Copy last request as cURL">Copy as cURL</button>
            </div>
            <label style="font-size:0.9em;">Response</label>
            <div id="test-response" class="response-area">Waiting...</div>
        </div>

        <div class="toolbar">
            <div style="display:flex; gap:8px; align-items:center;">
                ${this._isCreateMode ? '' : '<button id="delete-btn" class="danger">Delete</button>'}
            </div>

            <div class="actions-right">
                <button id="cancel-btn" class="secondary">Close</button>
                <button id="save-btn">${this._isCreateMode ? 'Create Tool' : 'Update Tool'}</button>
            </div>
        </div>

            <script src="${scriptUri}"></script>

      </body>
      </html>
    `;
        return html;
    }

    private _getTemplate(templateId: string): any {
        switch (templateId) {
            case 'weather':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Weather Tool",
                        "version": "1.0.0",
                        "description": "Get current weather for a location. Uses WeatherAPI.com. Optionally assign a connection for the API key at creation.",
                        "x-ibm-skill-name": "Weather Tool",
                        "x-ibm-skill-id": "weather-tool-v1"
                    },
                    "components": {
                        "securitySchemes": {
                            "ApiKeyAuth": { "type": "apiKey", "in": "query", "name": "key" }
                        }
                    },
                    "security": [{ "ApiKeyAuth": [] }],
                    "servers": [{ "url": "https://api.weatherapi.com/v1" }],
                    "paths": {
                        "/current.json": {
                            "get": {
                                "operationId": "getCurrentWeather",
                                "summary": "Get Current Weather",
                                "description": "Get current weather for a city or location (e.g. Toronto,On). API key required via connection or key param.",
                                "parameters": [
                                    { "name": "q", "in": "query", "required": true, "description": "City name or lat,lon (e.g. Toronto,On or 43.65,-79.38)", "schema": { "type": "string", "default": "Toronto,On" } },
                                    { "name": "key", "in": "query", "required": false, "description": "API key (or use connection)", "schema": { "type": "string", "title": "key" } }
                                ],
                                "responses": {
                                    "200": {
                                        "description": "Current weather data",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "location": { "type": "object", "properties": { "name": { "type": "string" }, "region": { "type": "string" }, "country": { "type": "string" } } },
                                                        "current": { "type": "object", "properties": { "temp_c": { "type": "number" }, "condition": { "type": "object" }, "wind_kph": { "type": "number" }, "humidity": { "type": "integer" } } }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'world-time':
                return {
                    "openapi": "3.0.0",
                    "info": {
                        "title": "World Time Skill",
                        "version": "2.0.0",
                        "description": "Get current time for any timezone.",
                        "x-ibm-skill-name": "World Time Skill",
                        "x-ibm-skill-id": "world-time-skill-v2"
                    },
                    "servers": [{ "url": "https://timeapi.io/api" }],
                    "paths": {
                        "/Time/current/zone": {
                            "get": {
                                "operationId": "getCityTime",
                                "summary": "Get Time",
                                "description": "Get current time for a specific timezone (e.g. Europe/Amsterdam).",
                                "parameters": [{
                                    "name": "timeZone",
                                    "in": "query",
                                    "required": true,
                                    "description": "The IANA time zone identifier (e.g. 'Europe/Amsterdam', 'America/New_York').",
                                    "schema": { "type": "string" }
                                }],
                                "responses": {
                                    "200": {
                                        "description": "Success",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "dateTime": { "type": "string", "description": "Current date/time in ISO format." },
                                                        "time": { "type": "string", "description": "Current time in HH:mm format." },
                                                        "timeZone": { "type": "string" },
                                                        "dayOfWeek": { "type": "string" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'aviation-weather':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Aviation Weather METAR Skill",
                        "version": "1.0.0",
                        "description": "Get latest METAR weather report for a given airport ICAO code.",
                        "x-ibm-skill-name": "Aviation Weather METAR Skill",
                        "x-ibm-skill-id": "aviation-weather-metar-skill-v1"
                    },
                    "servers": [{ "url": "https://aviationweather.gov/api/data/metar" }],
                    "paths": {
                        "/": {
                            "get": {
                                "operationId": "getMetar",
                                "summary": "Get METAR Weather Report",
                                "description": "Retrieve the latest METAR weather report for a specified airport ICAO code.",
                                "parameters": [
                                    {
                                        "name": "ids",
                                        "in": "query",
                                        "required": true,
                                        "description": "ICAO airport code (e.g., 'KJFK', 'EHAM').",
                                        "schema": { "type": "string" }
                                    },
                                    {
                                        "name": "format",
                                        "in": "query",
                                        "required": false,
                                        "description": "Response format (default: 'json').",
                                        "schema": { "type": "string", "default": "json" }
                                    }
                                ],
                                "responses": {
                                    "200": {
                                        "description": "Successful METAR weather report response.",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "data": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "object",
                                                                "properties": {
                                                                    "raw_text": { "type": "string" },
                                                                    "station_id": { "type": "string" },
                                                                    "temp_c": { "type": "number" },
                                                                    "wind_speed_kt": { "type": "integer" }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'dad-jokes':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Dad Jokes Skill",
                        "version": "1.0.0",
                        "description": "Get a random dad joke. Guaranteed to make you groan.",
                        "x-ibm-skill-name": "Dad Jokes Skill",
                        "x-ibm-skill-id": "dad-jokes-skill-v1"
                    },
                    "servers": [{ "url": "https://icanhazdadjoke.com" }],
                    "paths": {
                        "/": {
                            "get": {
                                "operationId": "getRandomJoke",
                                "summary": "Get Random Dad Joke",
                                "description": "Fetch a random dad joke.",
                                "parameters": [],
                                "responses": {
                                    "200": {
                                        "description": "A random dad joke.",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "id": { "type": "string", "description": "Unique joke ID." },
                                                        "joke": { "type": "string", "description": "The dad joke text." },
                                                        "status": { "type": "integer", "description": "HTTP status code." }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'news-search':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "News Search",
                        "version": "1.0.0",
                        "description": "Search for news articles. Requires at least one of: q, qInTitle, sources, domains. Assign a connection (NewsAPI, etc.) when creating.",
                        "x-ibm-skill-name": "News Search Skill",
                        "x-ibm-skill-id": "news-search-skill-v1"
                    },
                    "components": {
                        "securitySchemes": {
                            "ApiKeyAuth": { "type": "apiKey", "in": "query", "name": "apiKey" }
                        }
                    },
                    "security": [{ "ApiKeyAuth": [] }],
                    "servers": [{ "url": "https://newsapi.org/v2" }],
                    "paths": {
                        "/everything": {
                            "get": {
                                "operationId": "searchNews",
                                "summary": "Search News",
                                "description": "Search news articles. Set at least one of q, qInTitle, sources, or domains.",
                                "parameters": [
                                    { "name": "q", "in": "query", "required": false, "description": "Topic to search for", "schema": { "type": "string", "title": "Topic" } },
                                    { "name": "qInTitle", "in": "query", "required": false, "description": "Search in article titles only", "schema": { "type": "string", "title": "Title Search" } },
                                    { "name": "sources", "in": "query", "required": false, "description": "Comma-separated source IDs", "schema": { "type": "string", "title": "Sources" } },
                                    { "name": "domains", "in": "query", "required": false, "description": "Comma-separated domains (e.g. bbc.co.uk)", "schema": { "type": "string", "title": "Domains" } },
                                    { "name": "pageSize", "in": "query", "required": false, "description": "Number of articles to return", "schema": { "type": "integer", "title": "Page Size", "default": 5 } }
                                ],
                                "responses": {
                                    "200": {
                                        "description": "News articles",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "properties": {
                                                        "articles": { "type": "array", "items": { "type": "object" } },
                                                        "totalResults": { "type": "integer" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'news-app':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "News App",
                        "version": "1.0.0",
                        "description": "Get news articles from NewsAPI. Assign a NewsAPI connection for apiKey, or pass it as a parameter.",
                        "x-ibm-skill-name": "News App Skill",
                        "x-ibm-skill-id": "news-app-skill-v1"
                    },
                    "components": {
                        "securitySchemes": {
                            "ApiKeyAuth": { "type": "apiKey", "in": "query", "name": "apiKey" }
                        }
                    },
                    "security": [{ "ApiKeyAuth": [] }],
                    "servers": [{ "url": "https://newsapi.org" }],
                    "paths": {
                        "/v2/everything": {
                            "get": {
                                "operationId": "getNews",
                                "summary": "Get News",
                                "description": "Get news articles. Use connection for apiKey or pass q, apiKey, pageSize.",
                                "parameters": [
                                    { "name": "q", "in": "query", "required": false, "description": "Topic to search for", "schema": { "type": "string", "title": "q", "default": "tesla" } },
                                    { "name": "apiKey", "in": "query", "required": false, "description": "API key (or use connection)", "schema": { "type": "string", "title": "apiKey" } },
                                    { "name": "pageSize", "in": "query", "required": false, "description": "Number of articles to return", "schema": { "type": "string", "title": "pageSize", "default": "5" } }
                                ],
                                "responses": {
                                    "200": {
                                        "description": "News articles",
                                        "content": {
                                            "application/json": {
                                                "schema": {
                                                    "type": "object",
                                                    "description": "Success",
                                                    "properties": {
                                                        "status": { "type": "string" },
                                                        "articles": {
                                                            "type": "array",
                                                            "items": {
                                                                "type": "object",
                                                                "properties": {
                                                                    "url": { "type": "string" },
                                                                    "title": { "type": "string" },
                                                                    "author": { "type": "string" },
                                                                    "source": { "type": "object", "properties": { "id": { "type": "string" }, "name": { "type": "string" } } },
                                                                    "content": { "type": "string" },
                                                                    "urlToImage": { "type": "string" },
                                                                    "description": { "type": "string" },
                                                                    "publishedAt": { "type": "string" }
                                                                }
                                                            }
                                                        },
                                                        "totalResults": { "type": "integer" }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                };

            case 'universities':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "University Search",
                        "version": "1.0.0",
                        "description": "Search for universities by name or country.",
                        "x-ibm-skill-name": "University Search Skill",
                        "x-ibm-skill-id": "uni-search-skill-v1"
                    },
                    "servers": [{ "url": "http://universities.hipolabs.com" }],
                    "paths": {
                        "/search": {
                            "get": {
                                "operationId": "searchUniversities",
                                "summary": "Search Universities",
                                "parameters": [
                                    { "name": "country", "in": "query", "required": false, "schema": { "type": "string", "default": "United States" }, "description": "Country to search in" },
                                    { "name": "name", "in": "query", "required": false, "schema": { "type": "string", "default": "Stanford" }, "description": "Name of university" }
                                ],
                                "responses": { "200": { "description": "List of universities" } }
                            }
                        }
                    }
                };

            case 'zip-code':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Zip Code Info",
                        "version": "1.0.0",
                        "description": "Get location information for a US Zip Code.",
                        "x-ibm-skill-name": "Zip Code Skill",
                        "x-ibm-skill-id": "zip-code-skill-v1"
                    },
                    "servers": [{ "url": "http://api.zippopotam.us" }],
                    "paths": {
                        "/us/{zipcode}": {
                            "get": {
                                "operationId": "getZipInfo",
                                "summary": "Get Zip Code Info",
                                "parameters": [
                                    { "name": "zipcode", "in": "path", "required": true, "schema": { "type": "string", "default": "90210" }, "description": "US Zip Code" }
                                ],
                                "responses": { "200": { "description": "Location info" } }
                            }
                        }
                    }
                };

            case 'currency':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Currency Exchange",
                        "version": "1.0.0",
                        "description": "Get current exchange rates.",
                        "x-ibm-skill-name": "Currency Skill",
                        "x-ibm-skill-id": "currency-skill-v1"
                    },
                    "servers": [{ "url": "https://api.frankfurter.app" }],
                    "paths": {
                        "/latest": {
                            "get": {
                                "operationId": "getExchangeRates",
                                "summary": "Get Latest Rates",
                                "parameters": [
                                    { "name": "from", "in": "query", "required": false, "schema": { "type": "string", "default": "USD" }, "description": "Base currency" },
                                    { "name": "to", "in": "query", "required": false, "schema": { "type": "string", "default": "EUR,GBP" }, "description": "Target currencies (comma separated)" }
                                ],
                                "responses": { "200": { "description": "Exchange rates" } }
                            }
                        }
                    }
                };

            case 'finance-yahoo':
                return {
                    "openapi": "3.0.1",
                    "info": {
                        "title": "Stock Quote (Yahoo)",
                        "version": "1.0.0",
                        "description": "Get market data for a stock symbol from Yahoo Finance.",
                        "x-ibm-skill-name": "Stock Quote Skill",
                        "x-ibm-skill-id": "stock-quote-skill-v1"
                    },
                    "servers": [{ "url": "https://query1.finance.yahoo.com" }],
                    "paths": {
                        "/v8/finance/chart/{symbol}": {
                            "get": {
                                "operationId": "getChart",
                                "summary": "Get Chart Data",
                                "parameters": [
                                    { "name": "symbol", "in": "path", "required": true, "schema": { "type": "string", "default": "IBM" }, "description": "Stock Symbol (e.g. IBM, AAPL)" },
                                    { "name": "interval", "in": "query", "required": false, "schema": { "type": "string", "enum": ["1m", "5m", "15m", "1d", "1wk", "1mo"], "default": "1d" }, "description": "Data interval" },
                                    { "name": "range", "in": "query", "required": false, "schema": { "type": "string", "enum": ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"], "default": "1mo" }, "description": "Data range" }
                                ],
                                "responses": { "200": { "description": "Chart data" } }
                            }
                        }
                    }
                };

            default: // 'blank'
                return null; // Will fall through to default template in _loadData
        }
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                log('Message from webview:', message.command);
                switch (message.command) {
                    case "loadTemplate":
                        const templateId = message.templateId || 'blank';
                        this._customContent = this._getTemplate(templateId);
                        await this._loadData();
                        return;

                    case "importFile":
                        // We need to trigger this via main thread, but we can do it here reasonably if we accept some UI disjoint
                        // Better: Send command to extension to pick file, then reload panel with content
                        vscode.commands.executeCommand('watsonx.importToolFile', this);
                        return;

                    case "copyToClipboard":
                        if (typeof message.text === 'string') {
                            vscode.env.clipboard.writeText(message.text);
                            vscode.window.showInformationMessage('Copied to clipboard.');
                        }
                        return;

                    case "exportOpenAPI":
                        try {
                            const content = message.content;
                            const defaultName = (content?.info?.title || 'openapi').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
                            const uri = await vscode.window.showSaveDialog({
                                defaultUri: vscode.Uri.file(defaultName),
                                filters: { 'OpenAPI JSON': ['json'], 'All files': ['*'] }
                            });
                            if (uri) {
                                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(content, null, 2), 'utf8'));
                                vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Export failed: ${e.message}`);
                        }
                        return;

                    case "viewDiff":
                        try {
                            const left = await vscode.workspace.openTextDocument({ content: message.original || '', language: 'json' });
                            const right = await vscode.workspace.openTextDocument({ content: message.current || '', language: 'json' });
                            await vscode.commands.executeCommand('vscode.diff', left.uri, right.uri, 'OpenAPI: Original vs Current');
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Diff failed: ${e.message}`);
                        }
                        return;

                    case "validateOpenAPI":
                        try {
                            const errors = validateOas(message.content);
                            this._panel.webview.postMessage({ command: 'validationResult', errors });
                        } catch (e: any) {
                            this._panel.webview.postMessage({ command: 'validationResult', errors: [e.message || 'Validation failed'] });
                        }
                        return;

                    case "saveSkill": {
                        const saveErrors = validateOas(message.content);
                        if (saveErrors.length > 0) {
                            const choice = await vscode.window.showWarningMessage(
                                `OpenAPI validation issues:\n${saveErrors.join('\n')}\n\nContinue anyway?`,
                                { modal: true },
                                "Update Anyway", "Cancel"
                            );
                            if (choice !== "Update Anyway") return;
                        } else {
                            const confirmSave = await vscode.window.showWarningMessage(
                                `Are you sure you want to update tool "${this._skillId}"?`,
                                { modal: true },
                                "Update", "Cancel"
                            );
                            if (confirmSave !== "Update") return;
                        }
                        try {
                            if (this._skillId) {
                                await updateSkill(this._skillId, message.content);
                                vscode.window.showInformationMessage('Tool updated successfully.');
                                this._loadData();
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to update tool: ${e.message}`);
                        }
                        return; }

                    case "createTool": {
                        const createErrors = validateOas(message.content);
                        if (createErrors.length > 0) {
                            const choice = await vscode.window.showWarningMessage(
                                `OpenAPI validation issues:\n${createErrors.join('\n')}\n\nContinue anyway?`,
                                { modal: true },
                                "Create Anyway", "Cancel"
                            );
                            if (choice !== "Create Anyway") return;
                        } else {
                            const confirmCreate = await vscode.window.showInformationMessage(
                                "Create new tool from this definition?",
                                { modal: true },
                                "Create", "Cancel"
                            );
                            if (confirmCreate !== "Create") return;
                        }
                        try {
                            const oas = message.content;
                            const toolSpec = {
                                name: (oas.info.title || "New Tool").replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]+/, ''),
                                description: oas.info.description || "No description",
                                tool_type: "openapi",
                                permission: "read_write" // Fixed: API expects specific enum values
                            };
                            const result = await deploySkill(toolSpec, oas);
                            vscode.window.showInformationMessage(`Tool created successfully! ID: ${result.toolId}`);
                            this.dispose();
                            vscode.commands.executeCommand('watsonx.refreshSkills');
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to create tool: ${e.message}`);
                        }
                        return; }

                    case "deleteSkill":
                        // Delete Logic 
                        const confirmDelete = await vscode.window.showWarningMessage(
                            `Are you sure you want to DELETE tool "${this._skillId}"? This cannot be undone.`,
                            { modal: true },
                            "Delete Tool", "Cancel"
                        );
                        if (confirmDelete === "Delete Tool") {
                            try {
                                if (this._skillId) {
                                    await deleteSkill(this._skillId);
                                    vscode.window.showInformationMessage('Tool deleted successfully.');
                                    this.dispose();
                                    vscode.commands.executeCommand('watsonx.refreshSkills');
                                }
                            } catch (e: any) {
                                vscode.window.showErrorMessage(`Failed to delete tool: ${e.message}`);
                            }
                        }
                        return;

                    case "testTool": // Remote invoking via WxO (agentic runs API)
                        try {
                            if (this._skillId) {
                                const startMs = Date.now();
                                let agentId = vscode.workspace.getConfiguration('wxo-builder').get<string>('agentId');
                                if (!agentId) agentId = await ensureTestAgentForTool(this._skillId);
                                const { data } = await invokeToolRemote(this._skillId, message.content || {}, agentId);
                                const elapsed = Date.now() - startMs;
                                this._panel.webview.postMessage({
                                    command: 'testResult',
                                    result: { status: 200, elapsed_ms: elapsed, data }
                                });
                            } else {
                                this._panel.webview.postMessage({ command: 'testResult', result: { error: 'No tool ID — save the tool first before testing via WxO.' } });
                            }
                        } catch (e: any) {
                            this._panel.webview.postMessage({ command: 'testResult', result: { error: e.message } });
                        }
                        return;

                    case "testLocal": // Local invoking directly via fetch
                        try {
                            const { url, method, params } = message;
                            const authHeaders: Record<string, string> = message.authHeaders || {};
                            const authQueryParams: Record<string, string> = message.authQueryParams || {};

                            let fetchOptions: any = {
                                method: method,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json',
                                    ...authHeaders  // inject auth headers (API key, Bearer token, etc.)
                                }
                            };
                            let requestUrl = '';

                            if (method.toUpperCase() === 'GET') {
                                let finalUrl = url;
                                const queryParams = new URLSearchParams();

                                // Inject auth query params first (e.g. ?api_key=...)
                                Object.keys(authQueryParams).forEach(k => queryParams.append(k, authQueryParams[k]));

                                if (params && Object.keys(params).length > 0) {
                                    Object.keys(params).forEach(key => {
                                        const placeholder = `{${key}}`;
                                        if (finalUrl.includes(placeholder)) {
                                            finalUrl = finalUrl.replace(placeholder, encodeURIComponent(params[key]));
                                        } else {
                                            queryParams.append(key, params[key]);
                                        }
                                    });
                                }

                                const queryStr = queryParams.toString();
                                if (queryStr) {
                                    finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryStr;
                                }

                                requestUrl = finalUrl;
                            } else {
                                // For POST/PUT: auth query params go in URL, body params as JSON
                                requestUrl = url;
                                if (Object.keys(authQueryParams).length > 0) {
                                    const aqp = new URLSearchParams(authQueryParams).toString();
                                    requestUrl += (requestUrl.includes('?') ? '&' : '?') + aqp;
                                }
                                fetchOptions.body = JSON.stringify(params);
                            }

                            const response = await fetch(requestUrl, fetchOptions);
                            const text = await response.text();

                            let result;
                            try {
                                result = JSON.parse(text);
                            } catch {
                                result = text;
                            }

                            this._panel.webview.postMessage({
                                command: 'testResult',
                                result: {
                                    status: response.status,
                                    statusText: response.statusText,
                                    requestUrl: requestUrl,
                                    data: result
                                }
                            });

                        } catch (e: any) {
                            this._panel.webview.postMessage({ command: 'testResult', result: { error: e.message } });
                        }
                        return;

                    case "testRemote": {
                        // Invoke via agentic runs API (POST /v1/orchestrate/runs); WxO injects connection credentials
                        try {
                            const toolId = this._skillId;
                            if (!toolId) {
                                this._panel.webview.postMessage({
                                    command: 'testRemoteResult',
                                    result: { error: 'Tool has no ID. Save the tool first before running a remote test.' }
                                });
                                return;
                            }
                            const params = message.params || {};
                            let agentId = vscode.workspace.getConfiguration('wxo-builder').get<string>('agentId');
                            if (!agentId) agentId = await ensureTestAgentForTool(toolId);
                            const { data, threadId, reasoning } = await invokeToolRemote(toolId, params, agentId);
                            this._panel.webview.postMessage({
                                command: 'testRemoteResult',
                                result: { threadId, data, reasoning }
                            });
                        } catch (e: any) {
                            this._panel.webview.postMessage({ command: 'testRemoteResult', result: { error: e.message } });
                        }
                        return;
                    }
                    case "fetchAndGenerate": {
                        try {
                            const { url, method, params, apiKeyParamName } = message;
                            const m = (method || 'GET').trim().toUpperCase();
                            let requestUrl = url;
                            const fetchOpts: any = { method: m, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
                            if (m === 'GET' && params && Object.keys(params).length > 0) {
                                const u = new URL(url);
                                Object.keys(params).forEach((k: string) => u.searchParams.set(k, params[k]));
                                requestUrl = u.toString();
                            } else if (m !== 'GET' && params) {
                                fetchOpts.body = JSON.stringify(params);
                            }
                            const response = await fetch(requestUrl, fetchOpts);
                            const text = await response.text();
                            let responseBody: any;
                            try { responseBody = JSON.parse(text); } catch { responseBody = text; }
                            if (!response.ok) {
                                this._panel.webview.postMessage({ command: 'error', message: `Fetch failed: ${response.status} ${response.statusText}` });
                                return;
                            }
                            const urlObj = new URL(url);
                            const oasParams: any[] = [];
                            if (params && typeof params === 'object') {
                                Object.keys(params).forEach((key: string) => {
                                    const val = params[key];
                                    const schema: any = { type: typeof val };
                                    if (val !== undefined && val !== null) schema.default = val;
                                    oasParams.push({
                                        name: key,
                                        in: 'query',
                                        required: false,
                                        schema
                                    });
                                });
                            }
                            const serviceInfo = await this._fetchServiceInfo(urlObj);
                            const paramNames = params && typeof params === 'object' ? Object.keys(params) : [];
                            const apiKeyParam = (apiKeyParamName || 'apiKey').trim() || 'apiKey';
                            const hasApiKeyParam = paramNames.some((k: string) =>
                                k === apiKeyParam || ['key', 'apiKey', 'api_key'].includes(k));
                            const secName = hasApiKeyParam && paramNames.includes(apiKeyParam) ? apiKeyParam
                                : hasApiKeyParam ? paramNames.find((k: string) => ['key', 'apiKey', 'api_key'].includes(k)) || apiKeyParam
                                : apiKeyParam;
                            const newOas: any = {
                                openapi: '3.0.1',
                                info: {
                                    title: serviceInfo.title || 'Generated Tool',
                                    description: serviceInfo.description || `Tool generated from ${url}`,
                                    version: '1.0.0',
                                    'x-ibm-skill-name': serviceInfo.title || 'Generated Tool Service',
                                    'x-ibm-skill-id': `generated-${Date.now()}`
                                },
                                servers: [{ url: urlObj.origin }],
                                paths: {
                                    [urlObj.pathname || '/']: {
                                        [m.toLowerCase()]: {
                                            operationId: this._pathToOperationId(urlObj.pathname || '/'),
                                            summary: this._pathToSummary(urlObj.pathname || '/'),
                                            parameters: m === 'GET' ? oasParams : [],
                                            responses: {
                                                '200': {
                                                    description: 'Success',
                                                    content: {
                                                        'application/json': {
                                                            schema: inferSchema(responseBody) || { type: 'object' }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            };
                            if (hasApiKeyParam) {
                                newOas.components = { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'query', name: secName } } };
                                newOas.security = [{ ApiKeyAuth: [] }];
                            }
                            this._panel.webview.postMessage({ command: 'updateJson', content: newOas });
                            vscode.window.showInformationMessage('Tool form generated from URL response!');
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Fetch failed: ${e.message}`);
                        }
                        return;
                    }
                    case "generateOaS":
                        try {
                            const { url, method, params, responseBody, apiKeyParamName } = message;
                            // Schema generation logic
                            const urlObj = new URL(url);
                            const baseUrl = urlObj.origin;
                            const path = urlObj.pathname;

                            // Infer parameters (include default to store e.g. API key in tool JSON)
                            const oasParams: any[] = [];
                            if (params) {
                                Object.keys(params).forEach(key => {
                                    const val = params[key];
                                    const schema: any = { type: typeof val };
                                    if (val !== undefined && val !== null) schema.default = val;
                                    oasParams.push({
                                        name: key,
                                        in: 'query',
                                        required: false,
                                        schema
                                    });
                                });
                            }

                            // Infer response schema
                            const responseSchema = inferSchema(responseBody) || { type: "object" };
                            const serviceInfo = await this._fetchServiceInfo(urlObj);
                            const paramNames = params && typeof params === 'object' ? Object.keys(params) : [];
                            const apiKeyParam = (apiKeyParamName || 'apiKey').trim() || 'apiKey';
                            const hasApiKeyParam = paramNames.some((k: string) =>
                                k === apiKeyParam || ['key', 'apiKey', 'api_key'].includes(k));
                            const secName = hasApiKeyParam && paramNames.includes(apiKeyParam) ? apiKeyParam
                                : hasApiKeyParam ? paramNames.find((k: string) => ['key', 'apiKey', 'api_key'].includes(k)) || apiKeyParam
                                : apiKeyParam;

                            const newOas: any = {
                                "openapi": "3.0.1",
                                "info": {
                                    "title": serviceInfo.title || "Generated Tool",
                                    "description": serviceInfo.description || `Tool generated from ${url}`,
                                    "version": "1.0.0",
                                    "x-ibm-skill-name": serviceInfo.title || "Generated Tool Service",
                                    "x-ibm-skill-id": `generated-${Date.now()}`
                                },
                                "servers": [{ "url": baseUrl }],
                                "paths": {
                                    [path]: {
                                        [method.toLowerCase()]: {
                                            "operationId": this._pathToOperationId(path),
                                            "summary": this._pathToSummary(path),
                                            "parameters": method.toLowerCase() === 'get' ? oasParams : [],
                                            "responses": {
                                                "200": {
                                                    "description": "Success",
                                                    "content": {
                                                        "application/json": {
                                                            "schema": responseSchema
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            };
                            if (hasApiKeyParam) {
                                newOas.components = { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'query', name: secName } } };
                                newOas.security = [{ ApiKeyAuth: [] }];
                            }
                            this._panel.webview.postMessage({ command: 'updateJson', content: newOas });
                            vscode.window.showInformationMessage('OpenAPI Definition generated from Response!');

                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to generate OAS: ${e.message}`);
                        }
                        return;

                    case "error":
                        vscode.window.showErrorMessage(message.message);
                        return;

                    case "close":
                        this.dispose();
                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    // Public method to reload with new content (for import)
    public async reloadWithContent(content: any) {
        this._customContent = content;
        await this._loadData();
    }
}

// Helper to infer JSON schema
function inferSchema(data: any): any {
    if (data === null) return { type: 'string', nullable: true };
    if (typeof data === 'string') return { type: 'string' };
    if (typeof data === 'number') return { type: Number.isInteger(data) ? 'integer' : 'number' };
    if (typeof data === 'boolean') return { type: 'boolean' };
    if (Array.isArray(data)) {
        const itemSchema = data.length > 0 ? inferSchema(data[0]) : { type: 'string' };
        return {
            type: 'array',
            items: itemSchema
        };
    }
    if (typeof data === 'object') {
        const properties: any = {};
        Object.keys(data).forEach(key => {
            properties[key] = inferSchema(data[key]);
            if (data[key] && typeof data[key] === 'string' && data[key].length > 10) {
                properties[key].description = `Example: ${data[key].substring(0, 30)}...`;
            }
        });
        return {
            type: 'object',
            properties: properties
        };
    }
    return { type: 'string' };
}
