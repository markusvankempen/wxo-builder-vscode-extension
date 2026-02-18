/**
 * WxO Builder - Connections & Connectors API
 * API client for Watson Orchestrate connections and catalog applications.
 *
 * Endpoints discovered by inspecting the IBM Watson Orchestrate ADK Python source:
 *   /Users/markusvankempen/miniforge3/lib/python3.12/site-packages/
 *     ibm_watsonx_orchestrate/client/connections/connections_client.py
 *
 * Base path: {instanceUrl}/v1/orchestrate
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */
import { woFetch } from './client';

// ─── Connectors (Catalog) ─────────────────────────────────────────────────────

/**
 * List available application connectors from the catalog.
 * GET /v1/orchestrate/catalog/applications
 */
export async function listConnectors(limit: number = 50): Promise<any> {
    const response = await woFetch(`/v1/orchestrate/catalog/applications?limit=${limit}`, {
        method: 'GET'
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to list connectors: ${response.status} ${text}`);
    }

    return await response.json();
}

// ─── Connections (Active) ─────────────────────────────────────────────────────

/**
 * List all connections (configured + unconfigured) with details.
 * GET /v1/orchestrate/connections/applications?include_details=true
 *
 * Returns: { applications: [ { app_id, connection_id, security_scheme, auth_type,
 *                               environment, preference, credentials_entered } ] }
 */
export async function listConnections(): Promise<any> {
    const response = await woFetch(
        '/v1/orchestrate/connections/applications?include_details=true&scope=draft',
        { method: 'GET' }
    );

    if (!response.ok) {
        const text = await response.text();
        console.warn(`Connections API failed: ${response.status} - ${text}`);
        return { applications: [] };
    }

    return await response.json();
}

/**
 * Get a specific connection by app_id.
 * GET /v1/orchestrate/connections/applications?app_id={appId}
 */
export async function getConnection(appId: string): Promise<any> {
    const response = await woFetch(
        `/v1/orchestrate/connections/applications?app_id=${encodeURIComponent(appId)}`,
        { method: 'GET' }
    );

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to get connection: ${response.status} ${text}`);
    }

    return await response.json();
}

/**
 * Create a new connection entry.
 * POST /v1/orchestrate/connections/applications
 * Body: { app_id: string }
 */
export async function createConnection(appId: string): Promise<any> {
    const response = await woFetch('/v1/orchestrate/connections/applications', {
        method: 'POST',
        body: JSON.stringify({ app_id: appId })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create connection: ${response.status} ${text}`);
    }

    return await response.json();
}

/**
 * Delete a connection by app_id.
 * DELETE /v1/orchestrate/connections/applications/{appId}
 */
export async function deleteConnection(appId: string): Promise<any> {
    const response = await woFetch(
        `/v1/orchestrate/connections/applications/${encodeURIComponent(appId)}`,
        { method: 'DELETE' }
    );

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to delete connection: ${response.status} ${text}`);
    }

    return { success: true };
}

/**
 * Set API key credentials for a connection.
 * PATCH /v1/orchestrate/connections/applications/{appId}/configs/{env}/runtime_credentials
 * Body: { runtime_credentials: { api_key: string } }
 */
export async function setApiKeyCredentials(
    appId: string,
    apiKey: string,
    env: 'draft' | 'live' = 'draft'
): Promise<any> {
    const response = await woFetch(
        `/v1/orchestrate/connections/applications/${encodeURIComponent(appId)}/configs/${env}/runtime_credentials`,
        {
            method: 'PATCH',
            body: JSON.stringify({ runtime_credentials: { api_key: apiKey } })
        }
    );

    if (!response.ok) {
        // Try POST if PATCH fails (first-time creation)
        const postResponse = await woFetch(
            `/v1/orchestrate/connections/applications/${encodeURIComponent(appId)}/configs/${env}/runtime_credentials`,
            {
                method: 'POST',
                body: JSON.stringify({ runtime_credentials: { api_key: apiKey } })
            }
        );
        if (!postResponse.ok) {
            const text = await postResponse.text();
            throw new Error(`Failed to set API key credentials: ${postResponse.status} ${text}`);
        }
        return await postResponse.json().catch(() => ({ success: true }));
    }

    return await response.json().catch(() => ({ success: true }));
}
