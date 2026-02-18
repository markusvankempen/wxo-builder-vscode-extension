/**
 * WxO Builder - Agents API (BETA)
 * API client for Watson Orchestrate agent CRUD operations and invocation.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import { woFetch } from './client';
import { getDefaultModelId } from './models';
import { formatAssistantContent } from './skills';

/** List agents from Watson Orchestrate. GET /v1/orchestrate/agents */
export async function listAgents(limit: number = 20, offset: number = 0): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/agents?limit=${limit}&offset=${offset}`, {
        method: 'GET'
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list agents: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** Get a single agent by ID. GET /v1/orchestrate/agents/{id} */
export async function getAgent(agentId: string): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/agents/${agentId}`, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Failed to get agent: ${response.status}`);
    }
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function updateAgent(agentId: string, payload: any): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update agent: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: true };
    }
}

const TEST_AGENT_NAME = 'WxoBuilderTestAgent';

/**
 * Ensure the WxoBuilderTestAgent exists and has ONLY the given tool assigned.
 * Creates the agent if missing, then updates it to have only this tool (removes any others).
 * Returns the agent ID for use in remote tool runs.
 */
export async function ensureTestAgentForTool(toolId: string): Promise<string> {
    let agents: any[] = [];
    const data = await listAgents(100, 0);
    if (Array.isArray(data)) {
        agents = data;
    } else if (data?.assistants && Array.isArray(data.assistants)) {
        agents = data.assistants;
    } else if (data?.data && Array.isArray(data.data)) {
        agents = data.data;
    }

    let agent = agents.find((a: any) => (a.name || a.display_name) === TEST_AGENT_NAME);

    if (!agent) {
        const defaultLlm = await getDefaultModelId();
        const created = await createAgent(
            TEST_AGENT_NAME,
            'WxO Builder internal agent for remote tool testing. Do not delete.',
            defaultLlm,
            'When the user asks you to execute a tool, execute it and return the raw result. Do not add commentary.'
        );
        const agentId = (created?.data?.id ?? created?.id ?? created) as string;
        await updateAgent(agentId, { tools: [toolId] });
        return agentId;
    }

    const agentId = agent.id || agent;
    const currentLlm = agent.llm || agent.model_id;
    // Fix invalid provider: "ibm" is not valid; must use "watsonx/ibm/..."
    const needsLlmFix = currentLlm && /^ibm\//.test(currentLlm);
    const updatePayload: any = { tools: [toolId] };
    if (needsLlmFix) updatePayload.llm = await getDefaultModelId();
    await updateAgent(agentId, updatePayload);
    return agentId;
}

export async function deleteAgent(agentId: string): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/agents/${agentId}`, { method: 'DELETE' });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to delete agent: ${response.status} ${text}`);
    }
    return { success: true };
}

export async function createAgent(name: string, description: string, modelId: string, instructions: string): Promise<any> {
    const payload = { name, description, agent_type: "watsonx", llm: modelId, instructions, style: "default", settings: {} };
    const response = await woFetch('/v1/orchestrate/agents', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create agent: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function invokeAgent(agentId: string, message: string): Promise<any> {
    const runPayload = { agent_id: agentId, message: { role: 'user', content: message } };
    const runRes = await woFetch('/v1/orchestrate/runs', {
        method: 'POST',
        body: JSON.stringify(runPayload)
    });

    if (!runRes.ok) {
        const text = await runRes.text();
        throw new Error(`Failed to start run: ${runRes.status} ${text}`);
    }

    const text = await runRes.text();
    let runData: any;
    try {
        runData = JSON.parse(text);
    } catch {
        throw new Error(`Failed to parse run response: ${text}`);
    }
    const threadId = runData.thread_id;

    // Poll for completion (simplified for this extension)
    let pollCount = 0;
    while (pollCount < 15) {
        pollCount++;
        await new Promise(r => setTimeout(r, 2000));
        const msgRes = await woFetch(`/v1/orchestrate/threads/${threadId}/messages`, { method: 'GET' });
        if (msgRes.ok) {
            const data = await msgRes.json();
            const messages = data.data || data;
            if (Array.isArray(messages)) {
                const assistantMsg = messages.filter((m: any) => m.role === 'assistant').pop();
                if (assistantMsg) {
                    let responseText = "Unknown format";
                    let reasoning: string | undefined;
                    if (typeof assistantMsg.content === 'string') {
                        responseText = assistantMsg.content;
                    } else if (Array.isArray(assistantMsg.content)) {
                        reasoning = formatAssistantContent(assistantMsg.content, { includeToolResult: true });
                        const textParts = assistantMsg.content
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text?.value ?? (typeof c.text === 'string' ? c.text : c.text))
                            .filter(Boolean);
                        responseText = textParts.join(' ').trim()
                            || assistantMsg.content.map((c: any) => c.text?.value || c.text || JSON.stringify(c)).join(' ')
                            || '(See reasoning for details)';
                    }
                    return { success: true, response: responseText, reasoning };
                }
            }
        }
    }
    throw new Error("Timed out waiting for assistant response.");
}
