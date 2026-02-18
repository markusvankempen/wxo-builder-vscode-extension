/**
 * WxO Builder - Flows API (BETA)
 * API client for Watson Orchestrate flow operations.
 *
 * NOTE: "Flows" in this context refers to Agentic Workflows, which are stored as Tools with type="flow" or "workflow".
 * The '/v1/orchestrate/flows' endpoint returns execution instances (runs), not definitions.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import { woFetch } from './client';

export async function listFlows(limit: number = 20, offset: number = 0): Promise<any[]> {
    // We list TOOLS and filter for flows/workflows
    const response = await woFetch(`/v1/orchestrate/tools?limit=100`, {
        method: 'GET'
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list flows (tools): ${response.status} ${text}`);
    }

    const text = await response.text();
    let items: any[] = [];
    try {
        const data = JSON.parse(text);
        items = data.items || data.data || (Array.isArray(data) ? data : []);
    } catch {
        return [];
    }

    // Filter for flow-like tools
    return items.filter((t: any) =>
        t.type === 'flow' ||
        t.type === 'workflow' ||
        (t.name && t.name.toLowerCase().includes('workflow'))
    );
}

export async function getFlow(flowId: string): Promise<any> {
    // Fetch the tool definition
    const response = await woFetch(`/v1/orchestrate/tools/${flowId}`, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Failed to get flow (tool): ${response.status}`);
    }
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function deleteFlow(flowId: string): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/tools/${flowId}`, { method: 'DELETE' });
    if (!response.ok) {
        // Fallback: Try DELETE /flows/ (if it was a run/flow ID)
        const flowRes = await woFetch(`/v1/orchestrate/flows/${flowId}`, { method: 'DELETE' });
        if (flowRes.ok) return { success: true };

        throw new Error(`Failed to delete flow: ${response.status}`);
    }
    return { success: true };
}

export async function createFlow(flowJson: any): Promise<any> {
    // Ensure creates a Tool
    const response = await woFetch('/v1/orchestrate/tools', {
        method: 'POST',
        body: JSON.stringify(flowJson)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create flow: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
