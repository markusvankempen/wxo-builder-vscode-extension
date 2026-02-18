/**
 * WxO Builder - Agent Editor Panel (BETA)
 * Webview panel for creating, editing, deleting, and chat-testing agents.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import * as vscode from "vscode";
import { getAgent, updateAgent, createAgent, deleteAgent, invokeAgent } from "../api/agents";
import { listSkills } from "../api/skills";
import { listModels, getDefaultModelId, ModelResource } from "../api/models";

export class AgentEditorPanel {
    public static currentPanel: AgentEditorPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _agentId: string | null;
    private _extensionUri: vscode.Uri;
    private _isCreateMode: boolean;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, agentId: string | null) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._agentId = agentId;
        this._isCreateMode = !agentId;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._setWebviewMessageListener(this._panel.webview);
    }

    public static async render(extensionUri: vscode.Uri, agentId: string | null) {
        // Fetch agent name early for a friendly panel title
        let panelTitle = agentId ? `Edit Agent: ${agentId}` : `Create New Agent`;
        let agentName = '';
        if (agentId) {
            try {
                const agentData = await getAgent(agentId);
                agentName = agentData.name || agentData.display_name || '';
                if (agentName) {
                    panelTitle = `Edit Agent: ${agentName}`;
                }
            } catch {
                // Fallback to ID if fetch fails
            }
        }

        if (AgentEditorPanel.currentPanel) {
            if (AgentEditorPanel.currentPanel._agentId !== agentId) {
                AgentEditorPanel.currentPanel.dispose();
            } else {
                AgentEditorPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
                return;
            }
        }

        const panel = vscode.window.createWebviewPanel(
            "agentEditor",
            panelTitle,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        AgentEditorPanel.currentPanel = new AgentEditorPanel(panel, extensionUri, agentId);
        await AgentEditorPanel.currentPanel._loadData();
    }

    private async _loadData() {
        try {
            let agent: any = {};
            if (!this._isCreateMode && this._agentId) {
                agent = await getAgent(this._agentId);
            } else {
                const defaultModelId = await getDefaultModelId();
                agent = {
                    name: "New Agent",
                    description: "A helpful AI agent.",
                    instructions: "You are a helpful assistant.",
                    tools: [],
                    model_id: defaultModelId
                };
            }

            let availableModels: ModelResource[] = [];
            try {
                availableModels = await listModels();
            } catch {
                // Keep empty; dropdown will use fallback options
            }

            const skills = await listSkills(100);

            // Normalize skills to a flat list of tools
            let availableTools: any[] = [];
            if (Array.isArray(skills)) {
                availableTools = skills;
            } else if (skills && skills.tools && Array.isArray(skills.tools)) {
                availableTools = skills.tools;
            } else if (skills && skills.data && Array.isArray(skills.data)) {
                availableTools = skills.data;
            }

            this._panel.webview.html = this._getWebviewContent(agent, availableTools, availableModels);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load agent data: ${e.message}`);
        }
    }

    public dispose() {
        AgentEditorPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _modelOptionsHtml(agent: any, availableModels: ModelResource[]): string {
        const current = agent.model_id || agent.llm || '';
        const preferredId = 'groq/openai/gpt-oss-120b';
        const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        if (availableModels.length > 0) {
            const preferred = availableModels.find(m => m.id === preferredId);
            const rest = availableModels.filter(m => m.id !== preferredId);
            const options: string[] = [];
            if (preferred) {
                options.push(`<option value="${escape(preferred.id)}" ${current === preferred.id ? 'selected' : ''}>${escape(preferred.label || preferred.id)} - Default</option>`);
            }
            rest.forEach(m => {
                options.push(`<option value="${escape(m.id)}" ${current === m.id ? 'selected' : ''}>${escape(m.label || m.id)}</option>`);
            });
            if (!preferred && current && !availableModels.some(m => m.id === current)) {
                options.push(`<option value="${escape(current)}" selected>${escape(current)}</option>`);
            }
            return options.join('');
        }
        const fallbacks = [
            { id: preferredId, label: 'GPT-OSS 120B (Groq) - Default' },
            { id: 'watsonx/ibm/granite-13b-chat-v2', label: 'IBM Granite 13B' },
            { id: 'watsonx/ibm/granite-20b-multilingual', label: 'IBM Granite 20B Multilingual' },
            { id: 'watsonx/meta-llama/llama-3-70b-instruct', label: 'Meta Llama 3 70B' },
            { id: 'watsonx/meta-llama/llama-3-8b-instruct', label: 'Meta Llama 3 8B' }
        ];
        let html = fallbacks.map(f => `<option value="${escape(f.id)}" ${current === f.id ? 'selected' : ''}>${escape(f.label)}</option>`).join('');
        if (current && !fallbacks.some(f => f.id === current)) {
            html += `<option value="${escape(current)}" selected>${escape(current)}</option>`;
        }
        return html;
    }

    private _getWebviewContent(agent: any, availableTools: any[], availableModels: ModelResource[] = []) {
        // The API may return tool associations under different keys
        let assignedTools: string[] = [];
        if (agent.tools && Array.isArray(agent.tools)) {
            // Could be array of objects with id property, or array of strings
            assignedTools = agent.tools.map((t: any) => typeof t === 'string' ? t : t.id);
        } else if (agent.tool_ids && Array.isArray(agent.tool_ids)) {
            assignedTools = agent.tool_ids;
        } else if (agent.skills && Array.isArray(agent.skills)) {
            assignedTools = agent.skills.map((t: any) => typeof t === 'string' ? t : t.id);
        } else if (agent.skill_ids && Array.isArray(agent.skill_ids)) {
            assignedTools = agent.skill_ids;
        }

        console.log('Agent data:', JSON.stringify(agent));
        console.log('Assigned tool IDs:', JSON.stringify(assignedTools));
        console.log('Available tools count:', availableTools.length);

        const mode = this._isCreateMode ? 'create' : 'edit';

        // Map assigned tool IDs to names if possible
        const assignedToolObjects = assignedTools.map((id: string) => {
            const tool = availableTools.find((t: any) => t.id === id);
            return { id, name: tool ? (tool.display_name || tool.name || id) : id };
        });

        // Filter available tools to exclude already assigned ones
        const unassignedTools = availableTools.filter((t: any) => !assignedTools.includes(t.id));

        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Agent Editor</title>
        <style>
            :root {
                --tab-border: 1px solid var(--vscode-widget-border);
                --tab-active-bg: var(--vscode-editor-background);
                --tab-inactive-bg: var(--vscode-editor-inactiveSelectionBackground);
                --tab-text: var(--vscode-editor-foreground);
            }
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
            
            /* Tabs */
            .tabs { display: flex; border-bottom: var(--tab-border); margin-bottom: 20px; }
            .tab { padding: 8px 16px; cursor: pointer; border: var(--tab-border); border-bottom: none; background-color: var(--tab-inactive-bg); margin-right: 4px; border-radius: 4px 4px 0 0; opacity: 0.7; }
            .tab.active { background-color: var(--tab-active-bg); border-bottom: 1px solid var(--vscode-editor-background); margin-bottom: -1px; opacity: 1; font-weight: bold; }
            
            .tab-content { display: none; flex-grow: 1; overflow: hidden; }
            .tab-content.active { display: flex; gap: 20px; flex-direction: row; }
            
            .column { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            
            label { display: block; margin-bottom: 5px; font-weight: bold; margin-top: 10px; }
            input, textarea, select { width: 100%; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; margin-bottom: 10px; box-sizing: border-box; }
            textarea { resize: vertical; min-height: 100px; }
            
            button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; border-radius: 2px; }
            button:hover { background-color: var(--vscode-button-hoverBackground); }
            .secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
            .danger { background-color: var(--vscode-errorForeground); color: white; }
            
            .tool-list { flex-grow: 1; overflow-y: auto; border: 1px solid var(--vscode-widget-border); padding: 10px; background-color: var(--vscode-editor-background); }
            .tool-item { padding: 8px; margin-bottom: 5px; background-color: var(--vscode-list-hoverBackground); cursor: grab; display: flex; justify-content: space-between; align-items: center; }
            .tool-item:hover { background-color: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
            .remove-btn { background: none; border: none; color: var(--vscode-errorForeground); cursor: pointer; font-size: 16px; padding: 0 5px; }
            
            .drop-zone { border: 2px dashed var(--vscode-widget-border); padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); margin-bottom: 10px; min-height: 50px; display: flex; align-items: center; justify-content: center; }
            .drop-zone.drag-over { border-color: var(--vscode-focusBorder); background-color: var(--vscode-list-dropBackground); }
            
            /* Chat Style */
            .chat-container { display: flex; flex-direction: column; height: 100%; border: 1px solid var(--vscode-widget-border); padding: 10px; }
            .chat-history { flex-grow: 1; overflow-y: auto; margin-bottom: 10px; border: 1px solid var(--vscode-widget-border); padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); }
            .chat-message { margin-bottom: 10px; padding: 8px; border-radius: 4px; max-width: 80%; }
            .chat-message.user { align-self: flex-end; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-left: auto; }
            .chat-message.assistant { align-self: flex-start; background-color: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); margin-right: auto; }
            .chat-input-area { display: flex; gap: 10px; }

            .toolbar { margin-top: 15px; border-top: 1px solid var(--vscode-widget-border); padding-top: 15px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <h2 style="margin-top:0;">${this._isCreateMode ? 'Create New Agent' : `Edit Agent: ${agent.name || agent.display_name || this._agentId} <span style="font-size: 0.55em; opacity: 0.5; font-weight: normal;">(${this._agentId})</span>`}</h2>

        <div class="tabs">
            <div class="tab active" onclick="openTab('config')">Configuration</div>
            ${!this._isCreateMode ? '<div class="tab" onclick="openTab(' + "'chat'" + ')">Test Chat</div>' : ''}
        </div>

        <div id="config" class="tab-content active">
            <div class="column">
                <h3>Details</h3>
                <label>Name</label>
                <input type="text" id="name" value="${agent.name || ''}">
                
                <label>Description</label>
                <textarea id="description" rows="3">${agent.description || ''}</textarea>
                
                <label>Model ID</label>
                <select id="model-id">
                    ${this._modelOptionsHtml(agent, availableModels)}
                </select>

                <label>Instructions</label>
                <textarea id="instructions" style="flex-grow: 1;">${agent.instructions || ''}</textarea>
            </div>

            <div class="column" style="margin-left: 20px;">
                <h3>Assigned Tools</h3>
                <div id="assigned-list" class="tool-list" ondrop="drop(event)" ondragover="allowDrop(event)">
                    <div class="drop-zone">Drag tools here to assign</div>
                    ${assignedToolObjects.map((t: any) => `
                        <div class="tool-item">
                            <div>
                                <span>${t.name}</span><br/>
                                <span style="font-size: 10px; opacity: 0.5;">${t.id}</span>
                            </div>
                            <button class="remove-btn" onclick="removeTool('${t.id}')">×</button>
                        </div>
                    `).join('')}
                </div>

                <h3>Available Tools</h3>
                <div id="available-list" class="tool-list">
                    ${unassignedTools.map((t: any) => `
                        <div class="tool-item" draggable="true" ondragstart="drag(event)" data-id="${t.id}" data-name="${t.name || t.display_name}">
                            <span>${t.name || t.display_name}</span>
                            <span style="font-size: 10px; opacity: 0.7;">${t.id}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <div id="chat" class="tab-content" style="flex-direction: column;">
             <div class="chat-container">
                <div id="chat-history" class="chat-history">
                    <div style="text-align: center; opacity: 0.7; margin-top: 20px;">Start a conversation with your agent...</div>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Type a message..." onkeypress="handleEnter(event)">
                    <button id="send-btn">Send</button>
                </div>
            </div>
        </div>

        <div class="toolbar">
            ${this._isCreateMode ? '<div></div>' : '<button id="delete-btn" class="danger">Delete Agent</button>'}
            <div>
                 <button id="cancel-btn" class="secondary" style="margin-right: 10px;">Close</button>
                 <button id="save-btn">${this._isCreateMode ? 'Create Agent' : 'Save Changes'}</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const mode = '${mode}';
            let assignedToolIds = ${JSON.stringify(assignedTools)};

            // DOM Elements
            const nameInput = document.getElementById('name');
            const descInput = document.getElementById('description');
            const instrInput = document.getElementById('instructions');
            const modelInput = document.getElementById('model-id');

            // Tabs
            function openTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
                document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
                
                if (tabName === 'config') {
                    document.getElementById('config').style.display = 'flex';
                } else {
                    document.getElementById('chat').style.display = 'flex';
                }
                
                // Active class mapping is simplistic here
                const tabs = document.querySelectorAll('.tab');
                if (tabName === 'config') tabs[0].classList.add('active');
                if (tabName === 'chat' && tabs[1]) tabs[1].classList.add('active');
            }

            // Drag and Drop
            function allowDrop(ev) { ev.preventDefault(); document.querySelector('.drop-zone').classList.add('drag-over'); }
            function drag(ev) { ev.dataTransfer.setData("text/plain", JSON.stringify({ id: ev.target.dataset.id, name: ev.target.dataset.name })); }
            function drop(ev) {
                ev.preventDefault();
                document.querySelector('.drop-zone').classList.remove('drag-over');
                const data = ev.dataTransfer.getData("text/plain");
                if (!data) return;
                const tool = JSON.parse(data);
                addTool(tool.id, tool.name);
            }

            function addTool(id, name) {
                if (assignedToolIds.includes(id)) return;
                assignedToolIds.push(id);
                
                const list = document.getElementById('assigned-list');
                const div = document.createElement('div');
                div.className = 'tool-item';
                div.innerHTML = \`<span>\${name}</span><button class="remove-btn" onclick="removeTool('\${id}')">×</button>\`;
                list.appendChild(div);
                
                const availableItem = document.querySelector(\`#available-list .tool-item[data-id="\${id}"]\`);
                if (availableItem) availableItem.remove();
            }

            window.removeTool = function(id) {
                assignedToolIds = assignedToolIds.filter(tid => tid !== id);
                const buttons = document.querySelectorAll('.remove-btn');
                buttons.forEach(btn => { if (btn.getAttribute('onclick').includes(id)) btn.parentElement.remove(); });
            };

            // Save / Create
            document.getElementById('save-btn').addEventListener('click', () => {
                const agentData = {
                    name: nameInput.value,
                    description: descInput.value,
                    instructions: instrInput.value,
                    model_id: modelInput.value,
                    tools: assignedToolIds
                };
                vscode.postMessage({ command: mode === 'create' ? 'createAgent' : 'saveAgent', content: agentData });
            });

            if (document.getElementById('delete-btn')) {
                document.getElementById('delete-btn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'deleteAgent' });
                });
            }
            
            document.getElementById('cancel-btn').addEventListener('click', () => {
                vscode.postMessage({ command: 'close' });
            });

            // Chat Logic
            const chatHistory = document.getElementById('chat-history');
            const chatInput = document.getElementById('chat-input');
            const sendBtn = document.getElementById('send-btn');

            function addMessage(role, text, reasoning) {
                const msgDiv = document.createElement('div');
                msgDiv.className = \`chat-message \${role}\`;
                if (reasoning && reasoning.trim()) {
                    const reasoningDiv = document.createElement('div');
                    reasoningDiv.style.cssText = 'font-size:0.85em; opacity:0.85; margin-bottom:8px; white-space:pre-wrap; border-left:3px solid var(--vscode-focusBorder); padding-left:8px;';
                    reasoningDiv.innerText = '🧠 ' + reasoning.trim();
                    msgDiv.appendChild(reasoningDiv);
                }
                const textDiv = document.createElement('div');
                textDiv.innerText = text;
                textDiv.style.whiteSpace = 'pre-wrap';
                msgDiv.appendChild(textDiv);
                chatHistory.appendChild(msgDiv);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }

            function handleEnter(e) {
                if (e.key === 'Enter') sendMessage();
            }

            if (sendBtn) {
                sendBtn.addEventListener('click', sendMessage);
            }

            function sendMessage() {
                const text = chatInput.value.trim();
                if (!text) return;
                
                addMessage('user', text);
                chatInput.value = '';
                
                // Show loading placeholder
                const loadingDiv = document.createElement('div');
                loadingDiv.id = 'loading-msg';
                loadingDiv.className = 'chat-message assistant';
                loadingDiv.innerText = 'Thinking...';
                chatHistory.appendChild(loadingDiv);
                
                vscode.postMessage({ command: 'invokeAgent', message: text });
            }

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'chatResponse') {
                    const loading = document.getElementById('loading-msg');
                    if (loading) loading.remove();
                    
                    if (message.error) {
                        addMessage('assistant', 'Error: ' + message.error);
                    } else {
                        addMessage('assistant', message.response || '', message.reasoning);
                    }
                }
            });

        </script>
      </body>
      </html>
    `;
    }

    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.command) {
                    case "createAgent":
                        try {
                            const { name, description, model_id, instructions, tools } = message.content;
                            const result = await createAgent(name, description, model_id, instructions);

                            // If tools were assigned, we need to update the agent to add them
                            if (tools && tools.length > 0 && result.id) {
                                await updateAgent(result.id, { tools });
                            }

                            vscode.window.showInformationMessage(`Agent created successfully! ID: ${result.id}`);
                            this.dispose();
                            vscode.commands.executeCommand('watsonx.refreshSkills');
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to create agent: ${e.message}`);
                        }
                        return;

                    case "saveAgent":
                        try {
                            if (this._agentId) {
                                const payload = { ...message.content };
                                if (payload.model_id !== undefined) {
                                    payload.llm = payload.model_id;
                                    delete payload.model_id;
                                }
                                await updateAgent(this._agentId, payload);
                                vscode.window.showInformationMessage('Agent updated successfully.');
                                this._loadData();
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Failed to update agent: ${e.message}`);
                        }
                        return;

                    case "deleteAgent":
                        const confirm = await vscode.window.showWarningMessage(
                            "Are you sure you want to delete this agent?",
                            { modal: true }, "Delete", "Cancel"
                        );
                        if (confirm === "Delete") {
                            try {
                                if (this._agentId) {
                                    await deleteAgent(this._agentId);
                                    vscode.window.showInformationMessage('Agent deleted successfully.');
                                    this.dispose();
                                    vscode.commands.executeCommand('watsonx.refreshSkills');
                                }
                            } catch (e: any) {
                                vscode.window.showErrorMessage(`Failed to delete agent: ${e.message}`);
                            }
                        }
                        return;

                    case "invokeAgent":
                        try {
                            if (this._agentId) {
                                const result = await invokeAgent(this._agentId, message.message);
                                this._panel.webview.postMessage({
                                    command: 'chatResponse',
                                    response: result.response,
                                    reasoning: result.reasoning
                                });
                            }
                        } catch (e: any) {
                            this._panel.webview.postMessage({ command: 'chatResponse', error: e.message });
                        }
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
}
