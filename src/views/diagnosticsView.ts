/**
 * WxO Builder - Diagnostics Tree View (BETA)
 * Tree Data Provider for the Status & Diagnostics sidebar view.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import * as vscode from 'vscode';
import { getIamToken } from '../api/client';
import { listSkills } from '../api/skills';

export class DiagnosticsTreeProvider implements vscode.TreeDataProvider<DiagnosticItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DiagnosticItem | undefined | void> = new vscode.EventEmitter<DiagnosticItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DiagnosticItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DiagnosticItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DiagnosticItem): Promise<DiagnosticItem[]> {
        if (element) {
            return [];
        } else {
            const items: DiagnosticItem[] = [];

            // 1. Configuration Check (Configure only here — live/draft indicator)
            const config = vscode.workspace.getConfiguration('wxo-builder');
            const apiKey = config.get<string>('apiKey') || process.env.WO_API_KEY;
            const instanceUrl = config.get<string>('instanceUrl') || process.env.WO_INSTANCE_URL;
            const scope = config.get<string>('scope') || 'draft';

            items.push(new DiagnosticItem(
                'Configuration',
                apiKey && instanceUrl ? `Ready (${scope})` : 'Incomplete',
                apiKey && instanceUrl ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None,
                apiKey && instanceUrl ? 'pass' : 'fail',
                scope === 'live' ? 'Production (live) environment' : 'Development (draft) environment'
            ));

            // 2. Auth Check
            try {
                await getIamToken();
                items.push(new DiagnosticItem('Authentication', 'Authorized', vscode.TreeItemCollapsibleState.None, 'pass'));
            } catch (e: any) {
                items.push(new DiagnosticItem('Authentication', 'Failed', vscode.TreeItemCollapsibleState.None, 'fail', e.message));
            }

            // 3. Connectivity Check
            try {
                await listSkills(1);
                items.push(new DiagnosticItem('API Connection', 'Connected', vscode.TreeItemCollapsibleState.None, 'pass'));
            } catch (e: any) {
                items.push(new DiagnosticItem('API Connection', 'Disconnected', vscode.TreeItemCollapsibleState.None, 'fail', e.message));
            }

            // 4. Action: Open Panel
            const openPanelItem = new DiagnosticItem('Open Full Diagnostics Panel', '', vscode.TreeItemCollapsibleState.None, 'info');
            openPanelItem.command = {
                command: 'watsonx.openDiagnostics',
                title: 'Open Full Diagnostics Panel'
            };
            items.push(openPanelItem);

            return items;
        }
    }
}

export class DiagnosticItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly status: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'pass' | 'fail' | 'warn' | 'info',
        public readonly details?: string
    ) {
        super(label, collapsibleState);
        this.description = status;
        this.tooltip = details || `${label}: ${status}`;

        if (type === 'pass') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (type === 'fail') {
            this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
        } else if (type === 'warn') {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
        } else {
            this.iconPath = new vscode.ThemeIcon('link-external');
        }
    }
}
