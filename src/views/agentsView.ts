/**
 * WxO Builder - Agents Tree View (BETA)
 * Tree Data Provider for the Agents sidebar view.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import { listAgents } from '../api/agents';

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AgentItem | undefined | void> = new vscode.EventEmitter<AgentItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<AgentItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AgentItem): Promise<AgentItem[]> {
        if (element) {
            return [];
        } else {
            try {
                const data = await listAgents(50);
                console.log('Fetched Agents Data:', JSON.stringify(data));

                let agents: any[] = [];
                if (Array.isArray(data)) {
                    agents = data;
                } else if (data && data.assistants && Array.isArray(data.assistants)) {
                    agents = data.assistants;
                } else if (data && data.data && Array.isArray(data.data)) {
                    agents = data.data;
                }

                console.log(`Parsed ${agents.length} agents.`);

                if (agents.length === 0) {
                    return [new AgentItem('No Agents Found', 'Create one in Watson Orchestrate', '', vscode.TreeItemCollapsibleState.None)];
                }

                return agents.map((agent: any) => {
                    return new AgentItem(
                        agent.name || agent.id || 'Unnamed Agent',
                        agent.description || 'No description',
                        agent.id || '',
                        vscode.TreeItemCollapsibleState.None
                    );
                });

            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch agents: ${error.message}`);
                return [];
            }
        }
    }
}

export class AgentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private descriptionText: string,
        public readonly agentId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}-${this.descriptionText}`;
        this.description = this.descriptionText;
        this.contextValue = 'agent';
        this.iconPath = new vscode.ThemeIcon('hubot');
    }
}
