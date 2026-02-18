/**
 * WxO Builder - Flows Tree View (BETA)
 * Tree Data Provider for the Flows sidebar view.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import { listFlows } from '../api/flows';

export class FlowsTreeProvider implements vscode.TreeDataProvider<FlowItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FlowItem | undefined | void> = new vscode.EventEmitter<FlowItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FlowItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FlowItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FlowItem): Promise<FlowItem[]> {
        if (element) {
            return [];
        } else {
            try {
                const data = await listFlows(50);
                console.log('Fetched Flows Data:', JSON.stringify(data));

                let flows: any[] = [];
                if (Array.isArray(data)) {
                    flows = data;
                }

                console.log(`Parsed ${flows.length} flows.`);

                if (flows.length === 0) {
                    return [new FlowItem('No Flows Found', 'Create one in Watson Orchestrate', '', vscode.TreeItemCollapsibleState.None)];
                }

                return flows.map((flow: any) => {
                    const id = flow.id || '';
                    return new FlowItem(
                        flow.name || id || 'Unnamed Flow',
                        flow.description || 'No description',
                        id,
                        vscode.TreeItemCollapsibleState.None
                    );
                });

            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch flows: ${error.message}`);
                return [];
            }
        }
    }
}

export class FlowItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private descriptionText: string,
        public readonly flowId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}-${this.descriptionText}`;
        this.description = this.descriptionText;
        if (this.flowId) {
            this.contextValue = 'flow';
        } else {
            this.contextValue = 'info';
        }
        this.iconPath = new vscode.ThemeIcon(this.flowId ? 'symbol-event' : 'info');
    }
}
