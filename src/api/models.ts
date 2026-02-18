/**
 * WxO Builder - Models API
 * List LLM models available for agents (GET /v1/models/list).
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 18-Feb-2026
 * @license Apache-2.0
 */
import { woFetch } from './client';

const PREFERRED_DEFAULT_MODEL_ID = 'groq/openai/gpt-oss-120b';

export interface ModelResource {
    id: string;
    label?: string;
    lifecycle?: Array<{ id: string; start_date?: string | null }>;
    type?: string;
    tags?: string[];
}

/**
 * List models available for agents (GET /v1/models/list).
 * Returns array of { id, label, lifecycle, type, tags }.
 */
export async function listModels(): Promise<ModelResource[]> {
    const response = await woFetch('/v1/models/list', { method: 'GET' });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list models: ${response.status} ${text}`);
    }
    const data = await response.json().catch(() => ({}));
    const list = data.resources ?? data.data ?? (Array.isArray(data) ? data : []);
    return Array.isArray(list) ? list : [];
}

/**
 * Default model ID for new agents and the test agent.
 * Prefers groq/openai/gpt-oss-120b if available from the API, else first model, else fallback.
 */
export async function getDefaultModelId(): Promise<string> {
    try {
        const models = await listModels();
        if (!models.length) return PREFERRED_DEFAULT_MODEL_ID;
        const preferred = models.find((m: ModelResource) => m.id === PREFERRED_DEFAULT_MODEL_ID);
        if (preferred) return PREFERRED_DEFAULT_MODEL_ID;
        return models[0]?.id ?? PREFERRED_DEFAULT_MODEL_ID;
    } catch {
        return PREFERRED_DEFAULT_MODEL_ID;
    }
}
