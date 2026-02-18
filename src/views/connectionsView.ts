/**
 * WxO Builder - Connections & Connectors Tree View
 * Tree Data Provider for the Connections sidebar view.
 *
 * Tree structure:
 *  - Active (Green) — credentials configured
 *    - Live
 *    - Draft
 *  - Not Active (not green) — credentials not configured
 *  - Connectors (Catalog)
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import { listConnectors, listConnections } from '../api/connections';

export type ConnectionCategoryType = 'active' | 'active-live' | 'active-draft' | 'inactive' | 'catalog';

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<ConnectionItem | ConnectorItem | CategoryItem | InfoItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConnectionItem | ConnectorItem | CategoryItem | InfoItem | undefined | void> = new vscode.EventEmitter<ConnectionItem | ConnectorItem | CategoryItem | InfoItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<ConnectionItem | ConnectorItem | CategoryItem | InfoItem | undefined | void> = this._onDidChangeTreeData.event;

    private _connectionsCache: any[] = [];

    constructor() { }

    refresh(): void {
        this._connectionsCache = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ConnectionItem | ConnectorItem | CategoryItem | InfoItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConnectionItem | ConnectorItem | CategoryItem | InfoItem): Promise<(ConnectionItem | ConnectorItem | CategoryItem | InfoItem)[]> {
        if (!element) {
            // Root: Active, Not Active, Connectors
            return [
                new CategoryItem('Active (Green)', 'Connections with credentials configured', 'active', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryItem('Not Active', 'Connections without credentials', 'inactive', vscode.TreeItemCollapsibleState.Expanded),
                new CategoryItem('Connectors (Catalog)', 'Browse all available app connectors', 'catalog', vscode.TreeItemCollapsibleState.Collapsed),
            ];
        }

        if (element instanceof CategoryItem) {
            if (element.type === 'active') {
                // Children: Live, Draft
                return [
                    new CategoryItem('Live', 'Production environment', 'active-live', vscode.TreeItemCollapsibleState.Expanded),
                    new CategoryItem('Draft', 'Draft environment', 'active-draft', vscode.TreeItemCollapsibleState.Expanded),
                ];
            }

            if (element.type === 'active-live' || element.type === 'active-draft' || element.type === 'inactive') {
                try {
                    if (this._connectionsCache.length === 0) {
                        const data = await listConnections();
                        const apps: any[] = data?.applications || [];
                        const seen = new Set<string>();
                        this._connectionsCache = apps.filter((a: any) => {
                            const key = `${a.connection_id || a.app_id}:${a.environment || 'none'}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                    }

                    const wantActive = element.type !== 'inactive';

                    const filtered = this._connectionsCache.filter((a: any) => {
                        const creds = a.credentials_entered === true;
                        if (wantActive) {
                            if (!creds) return false;
                            const appEnv = (a.environment || 'draft').toLowerCase();
                            if (element.type === 'active-live') return appEnv === 'live';
                            return appEnv === 'draft' || appEnv === 'none' || !a.environment;
                        } else {
                            return !creds;
                        }
                    });

                    filtered.sort((a: any, b: any) => (a.app_id || '').localeCompare(b.app_id || ''));

                    if (filtered.length === 0) {
                        return [new InfoItem('None')];
                    }

                    return filtered.map((app: any) => new ConnectionItem(
                        app.app_id || 'Unknown',
                        app.connection_id || '',
                        app.app_id || '',
                        app.auth_type || app.security_scheme || null,
                        app.environment || null,
                        app.credentials_entered === true,
                        app,
                        vscode.TreeItemCollapsibleState.None
                    ));
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to fetch connections: ${e.message}`);
                    return [new InfoItem(`Error: ${e.message}`)];
                }
            }

            if (element.type === 'catalog') {
                try {
                    const data = await listConnectors(100);
                    // Catalog returns: { items: [...] } or array
                    const items: any[] = data?.items || (Array.isArray(data) ? data : []);

                    if (items.length === 0) {
                        return [new InfoItem('No connectors found in catalog')];
                    }

                    return items.map((app: any) => new ConnectorItem(
                        app.group_name || app.catalog_ref_id || app.name || 'Unnamed Connector',
                        app.ids ? app.ids[0] : (app.app_id || ''),
                        app.catalog_ref_id || '',
                        vscode.TreeItemCollapsibleState.None
                    ));
                } catch (e: any) {
                    return [new InfoItem(`Catalog unavailable: ${e.message}`)];
                }
            }
        }

        return [];
    }
}

// ─── Tree Item Classes ────────────────────────────────────────────────────────

export class CategoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly type: ConnectionCategoryType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = tooltip;
        this.contextValue = 'category';
        // Active = green (pass), inactive = gray (circle-slash), catalog = library
        if (type === 'catalog') {
            this.iconPath = new vscode.ThemeIcon('library');
        } else if (type === 'active' || type === 'active-live' || type === 'active-draft') {
            this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            this.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('descriptionForeground'));
        }
    }
}

export class ConnectorItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly appId: string,
        public readonly catalogRefId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `App ID: ${this.appId}\nRef: ${this.catalogRefId}`;
        this.description = this.catalogRefId;
        this.contextValue = 'connector';
        this.iconPath = new vscode.ThemeIcon('plug');
    }
}

export class ConnectionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly connectionId: string,
        public readonly appId: string,
        public readonly authType: string | null,
        public readonly environment: string | null,
        public readonly credentialsSet: boolean,
        public readonly rawData: any,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        // A connection is "active" if credentials_entered=true (regardless of draft/live env)
        const statusIcon = credentialsSet ? '✅' : '❌';
        const envLabel = environment ? ` [${environment}]` : ' [not configured]';
        const authLabel = authType ? ` • ${authType}` : '';

        this.description = `${statusIcon}${envLabel}${authLabel}`;
        this.tooltip = [
            `App ID: ${appId}`,
            `Connection ID: ${connectionId || 'N/A'}`,
            `Auth Type: ${authType || 'N/A'}`,
            `Environment: ${environment || 'not configured'}`,
            `Credentials Set: ${credentialsSet ? 'Yes ✅' : 'No ❌'}`,
            ``,
            `Click to view full details`,
        ].join('\n');

        // 'connection' = configured, 'connectionUnconfigured' = missing creds
        this.contextValue = credentialsSet ? 'connection' : 'connectionUnconfigured';
        this.iconPath = new vscode.ThemeIcon(credentialsSet ? 'pass' : 'warning');

        // Make it clickable to open details WebView panel
        this.command = {
            command: 'watsonx.viewConnectionDetails',
            title: 'View Connection Details',
            arguments: [this]
        };
    }
}

export class InfoItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'info';
        this.iconPath = new vscode.ThemeIcon('info');
    }
}
