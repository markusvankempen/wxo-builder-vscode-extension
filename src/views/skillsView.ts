/**
 * WxO Builder - Skills/Tools Tree View (BETA)
 * Tree Data Provider for the Tools sidebar view.
 * Groups tools by whether they require a connection (API key, OAuth, etc.)
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import { listSkills } from '../api/skills';

type SkillTreeItem = SkillCategoryItem | SkillItem;

export class SkillsTreeProvider implements vscode.TreeDataProvider<SkillTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SkillTreeItem | undefined | void> = new vscode.EventEmitter<SkillTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SkillTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private _allSkills: any[] = [];

    constructor() { }

    refresh(): void {
        this._allSkills = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SkillTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SkillTreeItem): Promise<SkillTreeItem[]> {
        // Root level: load all skills and return two categories
        if (!element) {
            try {
                const data = await listSkills(100);

                let myskills: any[] = [];
                if (Array.isArray(data)) {
                    myskills = data;
                } else if (data?.items && Array.isArray(data.items)) {
                    myskills = data.items;
                } else if (data?.tools && Array.isArray(data.tools)) {
                    myskills = data.tools;
                } else if (data?.data && Array.isArray(data.data)) {
                    myskills = data.data;
                }

                this._allSkills = myskills;

                const withConnection = myskills.filter(s => hasConnection(s));
                const standard = myskills.filter(s => !hasConnection(s));

                const categories: SkillCategoryItem[] = [];

                if (withConnection.length > 0) {
                    categories.push(new SkillCategoryItem(
                        `Tools with Connections (${withConnection.length})`,
                        'Tools that require an API key or OAuth connection',
                        'connected',
                        vscode.TreeItemCollapsibleState.Expanded
                    ));
                }

                categories.push(new SkillCategoryItem(
                    `Standard Tools (${standard.length})`,
                    'Tools without external connections',
                    'standard',
                    standard.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
                ));

                return categories;

            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to fetch tools: ${error.message}`);
                return [];
            }
        }

        // Category children
        if (element instanceof SkillCategoryItem) {
            const withConnection = this._allSkills.filter(s => hasConnection(s));
            const standard = this._allSkills.filter(s => !hasConnection(s));
            const skills = element.type === 'connected' ? withConnection : standard;

            if (skills.length === 0) {
                return [new SkillItem('No tools in this category', '', '', null, vscode.TreeItemCollapsibleState.None)];
            }

            return skills.map((skill: any) => {
                const securityInfo = getSecurityInfo(skill);
                return new SkillItem(
                    skill.display_name || skill.name || skill.id || 'Unnamed Tool',
                    skill.description || 'No description',
                    skill.id || '',
                    securityInfo,
                    vscode.TreeItemCollapsibleState.None
                );
            });
        }

        return [];
    }
}

/** Returns true if a tool has a connection/security binding */
function hasConnection(skill: any): boolean {
    const security = skill?.binding?.openapi?.security;
    const connectionId = skill?.binding?.openapi?.connection_id;
    return (Array.isArray(security) && security.length > 0) || !!connectionId;
}

/** Extracts security info from a tool binding */
function getSecurityInfo(skill: any): SecurityInfo | null {
    const openapi = skill?.binding?.openapi;
    if (!openapi) return null;

    const security = openapi.security;
    const connectionId = openapi.connection_id;

    if (!security || security.length === 0) return null;

    const sec = security[0];
    return {
        type: sec.type || 'unknown',
        in: sec.in || null,
        name: sec.name || null,
        connectionId: connectionId || null
    };
}

interface SecurityInfo {
    type: string;
    in: string | null;
    name: string | null;
    connectionId: string | null;
}

export class SkillCategoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly type: 'connected' | 'standard',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = tooltip;
        this.contextValue = 'skillCategory';
        this.iconPath = new vscode.ThemeIcon(type === 'connected' ? 'key' : 'extensions');
    }
}

export class SkillItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private descriptionText: string,
        public readonly skillId: string,
        public readonly securityInfo: SecurityInfo | null,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = buildTooltip(label, descriptionText, securityInfo);
        this.description = descriptionText;

        if (skillId && securityInfo) {
            // Tool with a connection requirement
            this.contextValue = 'skillWithConnection';
            this.iconPath = new vscode.ThemeIcon('key');
        } else if (skillId) {
            this.contextValue = 'skill';
            this.iconPath = new vscode.ThemeIcon('symbol-function');
        } else {
            this.contextValue = 'info';
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

function buildTooltip(name: string, desc: string, sec: SecurityInfo | null): string {
    let tip = `${name}\n${desc}`;
    if (sec) {
        tip += `\n\n🔑 Connection Required`;
        tip += `\n  Auth Type: ${sec.type}`;
        if (sec.in) tip += `\n  Location: ${sec.in}`;
        if (sec.name) tip += `\n  Parameter: ${sec.name}`;
        if (sec.connectionId) tip += `\n  Connection ID: ${sec.connectionId}`;
        else tip += `\n  Connection ID: (not yet set — configure in WxO UI)`;
    }
    return tip;
}
