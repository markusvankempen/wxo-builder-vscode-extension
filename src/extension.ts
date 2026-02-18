/**
 * WxO Builder - VS Code Extension for Watson Orchestrate (BETA)
 * Extension entry point: activation, command registration, provider setup.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { SkillsTreeProvider } from './views/skillsView.js';
import { AgentsTreeProvider } from './views/agentsView.js';
import { FlowsTreeProvider } from './views/flowsView.js';
import { ConnectionsTreeProvider } from './views/connectionsView.js';
import { DiagnosticsTreeProvider } from './views/diagnosticsView.js';

const readFile = promisify(fs.readFile);

export async function activate(context: vscode.ExtensionContext) {
    console.log('WxO Builder is now active!');

    // Register Tree Data Providers
    const skillsProvider = new SkillsTreeProvider();
    vscode.window.registerTreeDataProvider('watsonx-skills', skillsProvider);

    const agentsProvider = new AgentsTreeProvider();
    vscode.window.registerTreeDataProvider('watsonx-agents', agentsProvider);

    const flowsProvider = new FlowsTreeProvider();
    vscode.window.registerTreeDataProvider('watsonx-flows', flowsProvider);

    const connectionsProvider = new ConnectionsTreeProvider();
    vscode.window.registerTreeDataProvider('watsonx-connections', connectionsProvider);

    const diagnosticsProvider = new DiagnosticsTreeProvider();
    vscode.window.registerTreeDataProvider('watsonx-diagnostics', diagnosticsProvider);

    // Register Commands
    let disposable = vscode.commands.registerCommand('watsonx.configure', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'wxo-builder');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.openExtension', () => {
        vscode.env.openExternal(vscode.Uri.parse('vscode:extension/markusvankempen.wxo-builder'));
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.refreshSkills', () => {
        skillsProvider.refresh();
        agentsProvider.refresh();
        flowsProvider.refresh();
        connectionsProvider.refresh();
        diagnosticsProvider.refresh();
        vscode.window.showInformationMessage('Refreshing Watson Orchestrate resources...');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.refreshConnections', () => {
        connectionsProvider.refresh();
        vscode.window.showInformationMessage('Refreshing Connections & Connectors...');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deleteConnection', async (node: any) => {
        if (node && node.appId) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete connection "${node.label}"?`,
                { modal: true }, "Delete", "Cancel"
            );
            if (confirm === "Delete") {
                try {
                    const { deleteConnection } = require('./api/connections');
                    await deleteConnection(node.appId);
                    vscode.window.showInformationMessage('Connection deleted successfully.');
                    connectionsProvider.refresh();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to delete connection: ${e.message}`);
                }
            }
        } else {
            vscode.window.showErrorMessage('No connection selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.addConnection', async (node: any) => {
        if (node && node.appId) {
            try {
                const { createConnection } = require('./api/connections');
                await createConnection(node.appId);
                vscode.window.showInformationMessage(`Connection for "${node.label}" created successfully.`);
                connectionsProvider.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to create connection: ${e.message}`);
            }
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deploySkill', () => {
        vscode.window.showInformationMessage('Use "Create Tool" to list your tool via API.');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.createTool', async () => {
        const { SkillEditorPanel } = require('./panels/SkillEditorPanel');
        // Just open the panel directly now, UI handles the rest
        await SkillEditorPanel.render(context.extensionUri, null);
    });
    context.subscriptions.push(disposable);

    // New command to handle import from the UI
    disposable = vscode.commands.registerCommand('watsonx.importToolFile', async (panelInstance: any) => {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import Tool Definition',
            filters: {
                'OpenAPI Definition': ['json']
            }
        });

        if (fileUri && fileUri[0]) {
            try {
                const contentValues = await readFile(fileUri[0].fsPath, 'utf8');
                const jsonContent = JSON.parse(contentValues);
                // Call reload on the panel instance
                if (panelInstance && panelInstance.reloadWithContent) {
                    await panelInstance.reloadWithContent(jsonContent);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to import file: ${error.message}`);
            }
        }
    });
    context.subscriptions.push(disposable);


    disposable = vscode.commands.registerCommand('watsonx.editSkill', async (node: any) => {
        console.log('[WxO] editSkill called:', { node: node?.label, skillId: node?.skillId, hasNode: !!node });
        if (node && node.skillId) {
            const { SkillEditorPanel } = require('./panels/SkillEditorPanel');
            await SkillEditorPanel.render(context.extensionUri, node.skillId);
        } else {
            vscode.window.showErrorMessage('No skill selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.copySkill', async (node: any) => {
        if (node && node.skillId) {
            try {
                const { getSkill, skillToOas } = require('./api/skills');
                const { SkillEditorPanel } = require('./panels/SkillEditorPanel');
                const skill = await getSkill(node.skillId);
                const oas = skillToOas(skill);
                await SkillEditorPanel.render(context.extensionUri, null, oas);
                vscode.window.showInformationMessage(`Opened copy of "${node.label}". Edit and click Create Tool to add as a new tool.`);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to copy tool: ${e.message}`);
            }
        } else {
            vscode.window.showErrorMessage('No tool selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deleteSkill', async (node: any) => {
        if (node && node.skillId) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete tool "${node.label}"?`,
                { modal: true }, "Delete", "Cancel"
            );
            if (confirm === "Delete") {
                try {
                    const { deleteSkill } = require('./api/skills');
                    await deleteSkill(node.skillId);
                    vscode.window.showInformationMessage('Tool deleted successfully.');
                    vscode.commands.executeCommand('watsonx.refreshSkills');
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to delete tool: ${e.message}`);
                }
            }
        } else {
            vscode.window.showErrorMessage('No tool selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.openToolConnection', async (node: any) => {
        if (node && node.skillId && node.securityInfo) {
            const sec = node.securityInfo;
            const connId = sec.connectionId || '(not configured)';
            const authType = sec.type || 'unknown';
            const paramName = sec.name ? `"${sec.name}"` : 'N/A';
            const paramIn = sec.in || 'N/A';

            const message = `🔑 Connection Required for "${node.label}"\n\nAuth Type: ${authType}\nParameter: ${paramName} (in ${paramIn})\nConnection ID: ${connId}`;

            const action = await vscode.window.showInformationMessage(
                message,
                'Open WxO Connections UI',
                'Copy Connection Info',
                'Close'
            );

            if (action === 'Open WxO Connections UI') {
                // Open the Watson Orchestrate connections settings page
                const { woFetch } = require('./api/client');
                const instanceUrl = vscode.workspace.getConfiguration('wxo-builder').get<string>('instanceUrl') || process.env.WO_INSTANCE_URL || '';
                const connectionsUrl = instanceUrl
                    ? `${instanceUrl.replace(/\/instances\/.*/, '')}/settings/connections`
                    : 'https://www.ibm.com/docs/en/watsonx/watson-orchestrate/base?topic=managing-app-connections-credentials';
                vscode.env.openExternal(vscode.Uri.parse(connectionsUrl));
            } else if (action === 'Copy Connection Info') {
                const info = `Tool: ${node.label}\nID: ${node.skillId}\nAuth Type: ${authType}\nParameter: ${sec.name} (in ${paramIn})\nConnection ID: ${connId}`;
                await vscode.env.clipboard.writeText(info);
                vscode.window.showInformationMessage('Connection info copied to clipboard.');
            }
        } else {
            vscode.window.showInformationMessage('This tool does not have a connection configured.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.testTool', async (node: any) => {
        if (!node || !node.skillId) {
            vscode.window.showErrorMessage('No tool selected. Right-click a tool in the Tools view.');
            return;
        }

        const toolId = node.skillId;
        const toolName = node.label || toolId;

        try {
            // Fetch the full tool definition to get input_schema
            const { getSkill, invokeToolRemote } = require('./api/skills');
            const { ensureTestAgentForTool } = require('./api/agents');
            const toolDef = await getSkill(toolId);

            const inputSchema = toolDef?.input_schema || toolDef?.binding?.openapi?.input_schema || {};
            const properties: Record<string, any> = inputSchema.properties || {};
            const required: string[] = inputSchema.required || [];

            // Collect parameters from user via input boxes
            const params: Record<string, any> = {};
            const propNames = Object.keys(properties);

            if (propNames.length > 0) {
                const proceed = await vscode.window.showInformationMessage(
                    `🔧 Test "${toolName}"\n\nThis tool has ${propNames.length} parameter(s). You'll be prompted for each one.`,
                    'Enter Parameters', 'Run with Defaults', 'Cancel'
                );

                if (proceed === 'Cancel' || !proceed) return;

                if (proceed === 'Enter Parameters') {
                    for (const propName of propNames) {
                        const prop = properties[propName];
                        const isRequired = required.includes(propName);
                        const placeholder = prop.default !== undefined ? String(prop.default) : '';
                        const prompt = `${propName}${isRequired ? ' (required)' : ' (optional)'}: ${prop.description || prop.type || ''}`;

                        const value = await vscode.window.showInputBox({
                            title: `Test "${toolName}" — Parameter: ${propName}`,
                            prompt,
                            placeHolder: placeholder || `Enter ${propName}`,
                            value: placeholder,
                            ignoreFocusOut: true
                        });

                        if (value === undefined && isRequired) {
                            vscode.window.showWarningMessage(`Cancelled — required parameter "${propName}" not provided.`);
                            return;
                        }

                        if (value !== undefined && value !== '') {
                            // Try to parse as JSON for objects/arrays/numbers, otherwise use as string
                            try {
                                params[propName] = JSON.parse(value);
                            } catch {
                                params[propName] = value;
                            }
                        } else if (placeholder) {
                            try {
                                params[propName] = JSON.parse(placeholder);
                            } catch {
                                params[propName] = placeholder;
                            }
                        }
                    }
                }
                // 'Run with Defaults' → params stays empty, API uses defaults
            }

            // Show output channel
            const outputChannel = vscode.window.createOutputChannel(`WxO Tool: ${toolName}`);
            outputChannel.show(true);
            outputChannel.appendLine(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            outputChannel.appendLine(`🔧 Tool: ${toolName}`);
            outputChannel.appendLine(`🆔 ID:   ${toolId}`);
            if (node.securityInfo) {
                outputChannel.appendLine(`🔑 Auth: ${node.securityInfo.type} (${node.securityInfo.name || 'N/A'})`);
                outputChannel.appendLine(`🔗 Conn: ${node.securityInfo.connectionId || '(not configured)'}`);
            }
            outputChannel.appendLine(`📥 Parameters: ${JSON.stringify(params, null, 2)}`);
            outputChannel.appendLine(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            outputChannel.appendLine(`⏳ Invoking via Watson Orchestrate (agentic runs)...`);

            let agentId = vscode.workspace.getConfiguration('wxo-builder').get<string>('agentId');
            if (!agentId) {
                outputChannel.appendLine(`   Ensuring WxoBuilderTestAgent has this tool...`);
                agentId = await ensureTestAgentForTool(toolId);
            }
            const startTime = Date.now();
            try {
                const { data: result } = await invokeToolRemote(toolId, params, agentId);
                const elapsed = Date.now() - startTime;
                outputChannel.appendLine(`✅ Success! (${elapsed}ms)`);
                outputChannel.appendLine(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                outputChannel.appendLine(`📤 Result:`);
                outputChannel.appendLine(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
            } catch (invokeErr: any) {
                const elapsed = Date.now() - startTime;
                outputChannel.appendLine(`❌ Failed! (${elapsed}ms)`);
                outputChannel.appendLine(`Error: ${invokeErr.message}`);
                if (node.securityInfo && !node.securityInfo.connectionId) {
                    outputChannel.appendLine('');
                    outputChannel.appendLine('⚠️  This tool requires a connection that is not yet configured.');
                    outputChannel.appendLine('   Right-click the tool → "Configure Connection" to set it up.');
                }
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load tool definition: ${e.message}`);
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.createAgent', async () => {
        const { AgentEditorPanel } = require('./panels/AgentEditorPanel');
        await AgentEditorPanel.render(context.extensionUri, null);
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.viewConnectionDetails', (node: any) => {
        const { ConnectionDetailsPanel } = require('./panels/ConnectionDetailsPanel');
        ConnectionDetailsPanel.render(node);
    });
    context.subscriptions.push(disposable);


    disposable = vscode.commands.registerCommand('watsonx.editAgent', async (node: any) => {
        if (node && node.agentId) {
            const { AgentEditorPanel } = require('./panels/AgentEditorPanel');
            await AgentEditorPanel.render(context.extensionUri, node.agentId);
        } else {
            vscode.window.showErrorMessage('No agent selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deleteAgent', async (node: any) => {
        if (node && node.agentId) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete agent "${node.label}"?`,
                { modal: true }, "Delete", "Cancel"
            );
            if (confirm === "Delete") {
                try {
                    const { deleteAgent } = require('./api/agents');
                    await deleteAgent(node.agentId);
                    vscode.window.showInformationMessage('Agent deleted successfully.');
                    vscode.commands.executeCommand('watsonx.refreshSkills');
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to delete agent: ${e.message}`);
                }
            }
        } else {
            vscode.window.showErrorMessage('No agent selected.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.editFlow', async (node: any) => {
        console.log('watsonx.editFlow called with node:', JSON.stringify(node));
        if (node && node.flowId) {
            try {
                const { getFlow } = require('./api/flows');
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Fetching Flow JSON: ${node.label}`,
                    cancellable: false
                }, async () => {
                    const flowData = await getFlow(node.flowId);
                    const doc = await vscode.workspace.openTextDocument({
                        content: JSON.stringify(flowData, null, 2),
                        language: 'json'
                    });
                    await vscode.window.showTextDocument(doc);
                });
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to view flow: ${e.message}`);
            }
        } else {
            console.error('watsonx.editFlow: No flowId found in node', node);
            vscode.window.showErrorMessage('No flow selected or flow missing ID.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deleteFlow', async (node: any) => {
        console.log('watsonx.deleteFlow called with node:', JSON.stringify(node));
        if (node && node.flowId) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete flow "${node.label}"?`,
                { modal: true }, "Delete", "Cancel"
            );
            if (confirm === "Delete") {
                try {
                    const { deleteFlow } = require('./api/flows');
                    await deleteFlow(node.flowId);
                    vscode.window.showInformationMessage('Flow deleted successfully.');
                    flowsProvider.refresh();
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to delete flow: ${e.message}`);
                }
            }
        } else {
            console.error('watsonx.deleteFlow: No flowId found in node', node);
            vscode.window.showErrorMessage('No flow selected or flow missing ID.');
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.viewSkillInfo', async (node: any) => {
        // Reuses Edit View for now, as it shows full info
        vscode.commands.executeCommand('watsonx.editSkill', node);
    });
    context.subscriptions.push(disposable);

    const toggleSkillState = async (node: any, state: 'read_write' | 'read_only') => {
        if (node && node.skillId) {
            try {
                const { updateSkill } = require('./api/skills');
                await updateSkill(node.skillId, { permission: state });
                vscode.window.showInformationMessage(`Tool set to ${state === 'read_write' ? 'Active' : 'Inactive'} (Permission: ${state})`);
                vscode.commands.executeCommand('watsonx.refreshSkills');
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to update tool state: ${e.message}`);
            }
        } else {
            vscode.window.showErrorMessage('No tool selected.');
        }
    };

    disposable = vscode.commands.registerCommand('watsonx.activateSkill', (node: any) => toggleSkillState(node, 'read_write'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.deactivateSkill', (node: any) => toggleSkillState(node, 'read_only'));
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.openDiagnostics', () => {
        try {
            const { DiagnosticsPanel } = require('./panels/DiagnosticsPanel');
            DiagnosticsPanel.render(context.extensionUri);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to open Diagnostics: ${e.message}`);
        }
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.openDocumentation', () => {
        // Open README in preview
        const readmePath = vscode.Uri.file(path.join(context.extensionPath, 'README.md'));
        vscode.commands.executeCommand('markdown.showPreview', readmePath);
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('watsonx.openChangelog', () => {
        // Open CHANGELOG in preview
        const changelogPath = vscode.Uri.file(path.join(context.extensionPath, 'CHANGELOG.md'));
        vscode.commands.executeCommand('markdown.showPreview', changelogPath);
    });
    context.subscriptions.push(disposable);
}

export async function deactivate() {
}
