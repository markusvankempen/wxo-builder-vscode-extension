/**
 * WxO Builder - API Client (BETA)
 * Core HTTP client for Watson Orchestrate API authentication and requests.
 *
 * @author Markus van Kempen (markus.van.kempen@gmail.com)
 * @date 17-Feb-2026
 * @license Apache-2.0
 */

import * as vscode from 'vscode';
import fetch from 'node-fetch';

export interface AppConfig {
    apiKey: string;
    instanceUrl: string;
    iamTokenUrl: string;
}

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

function getConfig(): AppConfig {
    const config = vscode.workspace.getConfiguration('wxo-builder');
    return {
        apiKey: config.get<string>('apiKey') || process.env.WO_API_KEY || '',
        instanceUrl: config.get<string>('instanceUrl') || process.env.WO_INSTANCE_URL || '',
        iamTokenUrl: 'https://iam.cloud.ibm.com/identity/token'
    };
}

/**
 * Obtain an IAM bearer token for Watson Orchestrate API calls.
 * Uses API key from settings; caches token until near expiry.
 * @throws Error if API key is not configured or IAM request fails
 */
export async function getIamToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // @ts-ignore
    if (cachedToken && tokenExpiry > now + 60) {
        return cachedToken;
    }

    const config = getConfig();
    if (!config.apiKey) {
        throw new Error('Watson Orchestrate API Key not configured. Please check your settings.');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
    params.append('apikey', config.apiKey);
    // @ts-ignore
    const response = await fetch(config.iamTokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: params
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`IAM Token Request Failed: ${response.status} ${text}`);
    }

    const data = await response.json() as any;
    cachedToken = data.access_token;
    tokenExpiry = now + data.expires_in;

    return cachedToken!;
}

/**
 * Make an authenticated HTTP request to the Watson Orchestrate API.
 * Prepends instance URL to relative paths and adds Bearer token.
 * @param endpoint - API path (e.g. /v1/orchestrate/tools) or full URL
 * @param options - fetch options (method, body, headers)
 */
export async function woFetch(endpoint: string, options: any = {}): Promise<any> {
    const token = await getIamToken();
    const config = getConfig();

    let url = endpoint;
    if (!endpoint.startsWith('http')) {
        const baseUrl = config.instanceUrl.endsWith('/') ? config.instanceUrl.slice(0, -1) : config.instanceUrl;
        const apiPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        url = `${baseUrl}${apiPath}`;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
    };
    // @ts-ignore
    return fetch(url, {
        ...options,
        headers
    });
}
