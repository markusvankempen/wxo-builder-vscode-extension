/**
 * WxO Builder - Skills/Tools API (BETA)
 * API client for Watson Orchestrate tool CRUD, invocation, and deployment.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import { woFetch } from './client';
import archiver from 'archiver';

/** Convert WxO skill format to OAS for use as Create New Tool content (copy flow). */
export function skillToOas(skill: any): any {
    const b = skill?.binding?.openapi;
    const method = (b?.http_method || 'GET').toLowerCase();
    const path = b?.http_path || '/';
    const servers = (b?.servers || []).map((s: any) => typeof s === 'string' ? s : s?.url).filter(Boolean);
    const security = b?.security;
    const connectionId = b?.connection_id;
    const inputSchema = skill?.input_schema;
    const outputSchema = skill?.output_schema;

    const params: any[] = [];
    if (inputSchema?.properties) {
        for (const [key, prop] of Object.entries(inputSchema.properties as Record<string, any>)) {
            const name = prop.aliasName ?? key;
            params.push({
                name,
                in: prop.in || 'query',
                required: (inputSchema.required || []).includes(key),
                description: prop.description || '',
                schema: {
                    type: prop.type || 'string',
                    title: prop.title,
                    default: prop.default,
                    ...(prop.enum ? { enum: prop.enum } : {})
                }
            });
        }
    }

    const title = (skill?.display_name || skill?.name || 'Tool') + ' (Copy)';
    const baseId = (skill?.name || 'tool').replace(/[^a-zA-Z0-9_-]/g, '-');
    const skillId = `${baseId}-copy-v1`;

    const oas: any = {
        openapi: '3.0.1',
        info: {
            title,
            version: skill?.info?.version || '1.0.0',
            description: skill?.description || '',
            'x-ibm-skill-name': title,
            'x-ibm-skill-id': skillId
        },
        servers: servers.length ? servers.map((u: string) => ({ url: u })) : [{ url: 'https://httpbin.org' }],
        paths: {
            [path]: {
                [method]: {
                    operationId: skill?.name || 'operation',
                    summary: skill?.display_name || skill?.name || 'Operation',
                    parameters: params,
                    responses: {
                        '200': {
                            description: 'Success',
                            content: {
                                'application/json': {
                                    schema: outputSchema || { type: 'object' }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    if (security?.length) oas['x-ibm-security'] = security;
    if (connectionId) oas['x-ibm-connection-id'] = connectionId;
    return oas;
}

export async function listSkills(limit: number = 20, offset: number = 0): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/tools?limit=${limit}&offset=${offset}`, {
        method: 'GET'
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list tools: ${response.status} ${response.statusText} - ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function getSkill(skillId: string): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/tools/${skillId}`, { method: 'GET' });
    if (!response.ok) {
        throw new Error(`Failed to get skill: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function deleteSkill(skillId: string): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/tools/${skillId}`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error(`Failed to delete skill: ${response.status} ${response.statusText}`);
    }
    return { success: true };
}

/**
 * Update a tool. Per WxO Patch A Tool API, only these fields are editable:
 * - name, display_name, description, permission, restrictions, tags
 * NOT editable after creation: binding (openapi), input_schema, output_schema, connection_id
 */
export async function updateSkill(skillId: string, skillJson: any): Promise<any> {
    // Only send modifiable fields to avoid errors from read-only/internal fields
    const updatePayload: any = {};
    if (skillJson.name) {
        // API requires: only letters, digits, underscores; cannot start with digit
        updatePayload.name = skillJson.name
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .replace(/^[^a-zA-Z_]+/, '');
    }
    if (skillJson.display_name) updatePayload.display_name = skillJson.display_name;
    if (skillJson.description) updatePayload.description = skillJson.description;

    // Use user-defined permission or default to read_write
    updatePayload.permission = skillJson.permission || 'read_write';

    if (skillJson.restrictions) updatePayload.restrictions = skillJson.restrictions;
    if (skillJson.tags) updatePayload.tags = skillJson.tags;

    console.log('Updating tool:', skillId, 'with payload:', JSON.stringify(updatePayload));

    // Watson Orchestrate Tools API uses PUT for updates (PATCH returns 403)
    let response = await woFetch(`/v1/orchestrate/tools/${skillId}`, {
        method: 'PUT',
        body: JSON.stringify(updatePayload)
    });

    // If PUT fails with 405, try PATCH as fallback
    if (response.status === 405) {
        console.log('PUT returned 405, trying PATCH...');
        response = await woFetch(`/v1/orchestrate/tools/${skillId}`, {
            method: 'PATCH',
            body: JSON.stringify(updatePayload)
        });
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to update skill: ${response.status} ${text}`);
    }

    // Handle 204 No Content or empty body
    if (response.status === 204) {
        return { success: true };
    }

    const text = await response.text();
    if (!text) {
        return { success: true };
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        return { success: true, message: 'Updated successfully (non-JSON response)' };
    }
}

/**
 * @deprecated POST /v1/orchestrate/tools/{id}/run returns 404. Use invokeToolRemote instead.
 * See: Remote Tool Invocation doc — WxO requires agentic runs via POST /v1/orchestrate/runs.
 */
export async function invokeTool(toolId: string, parameters: any): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/tools/${toolId}/run`, {
        method: 'POST',
        body: JSON.stringify({ parameters })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to invoke tool: ${response.status} ${text}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** Format assistant content array (text, tool_use, tool_result) into a readable reasoning trace. */
export function formatAssistantContent(content: any[], options?: { includeToolResult?: boolean }): string {
    if (!Array.isArray(content) || content.length === 0) return '';
    const includeResult = options?.includeToolResult ?? false;
    const lines: string[] = [];
    for (const c of content) {
        const t = c.type ?? c.response_type;
        if (t === 'text') {
            const txt = c.text?.value ?? (typeof c.text === 'string' ? c.text : c.text) ?? c.value;
            if (txt) lines.push(String(txt).trim());
        } else if (t === 'tool_use') {
            const name = c.name || c.tool_name || 'tool';
            const input = c.input ?? c.arguments ?? {};
            const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
            lines.push(`\n🔧 Tool: ${name}`);
            lines.push(`Input: ${inputStr}`);
        } else if (t === 'tool_result') {
            if (includeResult) {
                const out = c.content ?? c.output ?? c.result ?? c;
                const outStr = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
                lines.push(`\n📋 Result:\n${outStr}`);
            } else {
                lines.push('\n📋 Tool returned result (see below)');
            }
        }
    }
    return lines.join('\n').trim();
}

/**
 * Invoke a tool remotely via the Watson Orchestrate Agentic Runs API.
 * This is the only supported path — direct /tools/{id}/run returns 404.
 * Credentials are injected by WxO from the tool's connection_id.
 *
 * Important: The default Orchestrate Assistant may not have your tool in its
 * toolkit — it may hallucinate a response instead of actually executing.
 * Pass agentId for an agent that has this tool attached (create one in WxO UI).
 *
 * @param agentId Optional. Agent ID that has this tool in its toolkit. Set
 *        wxo-builder.agentId in settings for automatic use.
 * @see Remote Tool Invocation doc: POST /v1/orchestrate/runs, poll threads/{id}/messages
 */
export async function invokeToolRemote(toolId: string, parameters: Record<string, any> = {}, agentId?: string): Promise<{ data: any; threadId: string; reasoning?: string }> {
    const directive = Object.keys(parameters).length > 0
        ? `Execute the tool with these parameters. Return the raw result data.\n\nParameters: ${JSON.stringify(parameters)}`
        : 'Execute the tool with default parameters. Return the raw result data.';

    const payload: Record<string, any> = {
        tool_id: toolId,
        parameters,
        message: { role: 'user', content: directive }
    };
    if (agentId) payload.agent_id = agentId;

    const runRes = await woFetch('/v1/orchestrate/runs', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!runRes.ok) {
        const errText = await runRes.text();
        throw new Error(`Run failed (${runRes.status}): ${errText}`);
    }

    const runData = (await runRes.json()) as { thread_id?: string };
    const threadId = runData.thread_id;
    if (!threadId) {
        throw new Error('No thread_id returned from run. Response: ' + JSON.stringify(runData));
    }

    const maxAttempts = 12;
    let messages: any[] = [];

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const msgRes = await woFetch(`/v1/orchestrate/threads/${threadId}/messages`);
        if (msgRes.ok) {
            const msgData = (await msgRes.json()) as any;
            messages = Array.isArray(msgData) ? msgData : (msgData.messages || msgData.data || []);
            const assistantMsg = messages.find((m: any) => m.role === 'assistant');
            if (assistantMsg) break;
        }
    }

    const assistantMsg = messages.find((m: any) => m.role === 'assistant') || messages[0];
    let responseData: any = null;
    let reasoning: string | undefined;

    if (assistantMsg && assistantMsg.content) {
        const content = assistantMsg.content;
        if (Array.isArray(content)) {
            const toolResult = content.find((c: any) => c.type === 'tool_result');
            const textBlock = content.find((c: any) => c.type === 'text');
            const toolUse = content.find((c: any) => c.type === 'tool_use');
            if (toolResult != null) {
                responseData = toolResult.content ?? toolResult.output ?? toolResult.result ?? toolResult;
            } else if (textBlock && textBlock.text != null) {
                responseData = typeof textBlock.text === 'string' ? textBlock.text : (textBlock.text?.value ?? JSON.stringify(textBlock.text));
            } else if (toolUse) {
                responseData = toolUse.content ?? toolUse;
            } else {
                responseData = content;
            }
            reasoning = formatAssistantContent(content, { includeToolResult: false });
        } else {
            responseData = content;
        }
    }

    if (responseData == null) {
        responseData = messages.length > 0 ? messages : { thread_id: threadId, info: 'No tool output in messages.' };
    }

    return { data: responseData, threadId, reasoning };
}

export async function deploySkill(toolSpec: any, openApiSpec: any): Promise<any> {
    // Build a complete tool definition matching the working deploy-skill-api.ts pattern
    const enrichedSpec = buildToolSpec(toolSpec, openApiSpec);

    console.log('Creating tool with enriched spec:', JSON.stringify(enrichedSpec, null, 2));

    const createRes = await woFetch('/v1/orchestrate/tools', {
        method: 'POST',
        body: JSON.stringify(enrichedSpec)
    });

    if (!createRes.ok) {
        const text = await createRes.text();
        console.error('Create tool failed:', createRes.status, text);
        throw new Error(`Failed to create tool: ${createRes.status} ${text}`);
    }

    const text = await createRes.text();
    let toolData: any;
    try {
        toolData = JSON.parse(text);
    } catch {
        throw new Error(`Failed to parse tool response: ${text}`);
    }
    const toolId = toolData.id;

    // Step 2: Upload OpenAPI artifact ZIP (optional enhancement)
    try {
        const zipBuffer = await createOpenApiZip(openApiSpec);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const filename = `${toolId}.zip`;

        const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`;
        const tail = `\r\n--${boundary}--\r\n`;

        const body = Buffer.concat([
            Buffer.from(head),
            zipBuffer,
            Buffer.from(tail)
        ]);

        const uploadRes = await woFetch(`/v1/orchestrate/tools/${toolId}/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: body
        });

        if (!uploadRes.ok) {
            console.warn('Artifact upload failed (tool still created):', uploadRes.status);
        }
    } catch (uploadErr: any) {
        console.warn('Artifact upload error (tool still created):', uploadErr.message);
    }

    return { success: true, toolId };
}

/** Derive WxO binding security from OpenAPI spec (x-ibm-security, components.securitySchemes, or security). */
function deriveBindingSecurity(openApiSpec: any, op: any): any[] {
    const explicit = openApiSpec['x-ibm-security'] ?? openApiSpec.binding?.openapi?.security;
    if (Array.isArray(explicit) && explicit.length > 0) return explicit;
    const schemes = openApiSpec.components?.securitySchemes ?? {};
    const secRefs = op?.security ?? openApiSpec.security ?? [];
    if (!Array.isArray(secRefs) || secRefs.length === 0) return [];
    const flat: any[] = [];
    for (const ref of secRefs) {
        if (typeof ref !== 'object' || !ref) continue;
        const name = Object.keys(ref)[0];
        const scheme = schemes[name];
        if (scheme?.type === 'apiKey') {
            flat.push({
                type: 'apiKey',
                in: scheme.in || 'query',
                name: scheme.name || 'apiKey'
            });
        } else if (scheme?.type === 'http' || scheme?.scheme === 'bearer') {
            flat.push({
                type: 'http',
                scheme: scheme.scheme || 'bearer',
                name: scheme.name || 'Authorization'
            });
        }
    }
    return flat;
}

function buildToolSpec(toolSpec: any, openApiSpec: any): any {
    const spec: any = {
        name: toolSpec.name,
        display_name: openApiSpec.info?.['x-ibm-skill-name'] || openApiSpec.info?.title || toolSpec.name,
        description: toolSpec.description,
        permission: toolSpec.permission || 'read_write',
        restrictions: toolSpec.restrictions || undefined,
        tags: toolSpec.tags || undefined
    };

    // Extract the first operation from the OpenAPI spec
    if (openApiSpec.paths) {
        const pathKeys = Object.keys(openApiSpec.paths);
        if (pathKeys.length > 0) {
            const pathKey = pathKeys[0];
            const pathObj = openApiSpec.paths[pathKey];
            const methods = ['get', 'post', 'put', 'patch', 'delete'];

            for (const method of methods) {
                if (!pathObj[method]) continue;
                const op = pathObj[method];

                // Build binding
                const servers = (openApiSpec.servers || []).map((s: any) =>
                    typeof s === 'string' ? s : s.url
                );

                const connectionId = openApiSpec['x-ibm-connection-id'] ?? openApiSpec.binding?.openapi?.connection_id ?? null;
                const security = deriveBindingSecurity(openApiSpec, op);
                spec.binding = {
                    openapi: {
                        http_method: method.toUpperCase(),
                        http_path: pathKey,
                        security: security,
                        servers: servers,
                        connection_id: connectionId || null
                    }
                };

                // Build input_schema from parameters. Each property MUST have "in" (query/path/etc)
                // for tools like news_search - WxO maps these to HTTP params correctly.
                const properties: any = {};
                const required: string[] = [];
                const usedKeys = new Set<string>();

                if (op.parameters && op.parameters.length > 0) {
                    op.parameters.forEach((p: any) => {
                        const paramIn = p.in || 'query';
                        const paramName = p.name;
                        let propKey = paramName;
                        if (usedKeys.has(propKey)) {
                            propKey = `${paramIn}_${paramName}`;
                        }
                        usedKeys.add(propKey);
                        const propSchema: any = {
                            type: p.schema?.type || 'string',
                            title: p.schema?.title ?? paramName,
                            description: p.description || p.schema?.description || '',
                            in: paramIn
                        };
                        if (p.schema?.default !== undefined && p.schema?.default !== null) {
                            propSchema.default = p.schema.default;
                        }
                        if (propKey !== paramName) {
                            propSchema.aliasName = paramName;
                        }
                        properties[propKey] = propSchema;
                        if (p.required) {
                            required.push(propKey);
                        }
                    });
                }

                spec.input_schema = {
                    type: 'object',
                    properties,
                    required: required.length > 0 ? required : undefined
                };

                // Build output_schema from responses
                if (op.responses?.['200']?.content?.['application/json']?.schema) {
                    const responseSchema = op.responses['200'].content['application/json'].schema;
                    spec.output_schema = {
                        ...responseSchema,
                        description: responseSchema.description || op.responses['200'].description || 'Success'
                    };
                }

                break; // Only first operation
            }
        }
    }

    return spec;
}

function createOpenApiZip(openApiSpec: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];
        archive.on('data', (chunk: Buffer) => chunks.push(chunk));
        archive.on('error', (err: any) => reject(err));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.append(JSON.stringify(openApiSpec, null, 2), { name: 'skill_v2.json' });
        archive.append('2.0.0\n', { name: 'bundle-format' });
        archive.finalize();
    });
}

