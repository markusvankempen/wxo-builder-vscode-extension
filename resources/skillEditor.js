(function() {
'use strict';
const vscode = acquireVsCodeApi();
const dataEl = document.getElementById('skill-initial-data');
const mode = (dataEl && dataEl.dataset.mode) || 'edit';
const debug = (msg, data) => { try { console.log('[WxO Editor Webview]', msg, data !== undefined ? data : ''); } catch(_) {} };

debug('Script starting, mode:', mode);
let initialData;
try {
    debug('dataEl:', !!dataEl, 'dataset.json length:', dataEl && dataEl.dataset && dataEl.dataset.json ? dataEl.dataset.json.length : 0);
    if (!dataEl || !dataEl.dataset || !dataEl.dataset.json) throw new Error('skill-initial-data element or data-json missing');
    initialData = JSON.parse(atob(dataEl.dataset.json));
    debug('initialData parsed, keys:', initialData ? Object.keys(initialData).slice(0, 10) : []);
} catch(e) {
    console.error('[WxO Editor Webview] Failed to parse initial data:', e);
    vscode.postMessage({ command: 'error', message: 'Failed to load data: ' + e.message });
}
let lastTestResult = null;
let lastTestRequest = null; // { method, requestUrl, params, authHeaders } for Copy as cURL
let originalOasJson = null; // Snapshot for Diff view (set once at init)

let connectionsList = [];
try {
    if (dataEl && dataEl.dataset.connections) {
        connectionsList = JSON.parse(atob(dataEl.dataset.connections)) || [];
    }
} catch(_) {}

// Attach tab click handlers immediately (avoid reliance on inline onclick / global openTab)
(function attachTabHandlers() {
    function openTab(tabName) {
        debug('openTab:', tabName);
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
        var tabEl = document.getElementById(tabName);
        if (tabEl) tabEl.classList.add('active');
        document.querySelectorAll('.tab').forEach(function(tab) { if (tab.getAttribute('data-tab') === tabName) tab.classList.add('active'); });
        if (tabName === 'json') {
            try {
                var jsonVal = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
                if (typeof initJsonEditor === 'function') initJsonEditor('json-editor-container', jsonVal);
                var currentJson = JSON.parse(jsonVal);
                if (mode === 'create') {
                    if (!currentJson.info) currentJson.info = {};
                    currentJson.info.title = document.getElementById('name').value;
                    currentJson.info.description = document.getElementById('description').value;
                    var verEl = document.getElementById('version');
                    if (verEl) currentJson.info.version = verEl.value;
                    var skillNameEl = document.getElementById('skill-name');
                    var skillIdEl = document.getElementById('skill-id');
                    if (skillNameEl && skillNameEl.value) currentJson.info['x-ibm-skill-name'] = skillNameEl.value;
                    if (skillIdEl && skillIdEl.value) currentJson.info['x-ibm-skill-id'] = skillIdEl.value;
                    var connSel = document.getElementById('connection-id');
                    var connId = connSel ? connSel.value : '';
                    currentJson['x-ibm-connection-id'] = connId || undefined;
                    if (connId && Array.isArray(connectionsList) && connectionsList.length > 0) {
                        var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
                        if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
                            var paramName = (document.getElementById('api-key-param-name') && document.getElementById('api-key-param-name').value || 'apiKey').trim() || 'apiKey';
                            currentJson['x-ibm-security'] = conn.security.map(function(s) {
                                if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                                return s;
                            });
                        }
                    }
                } else {
                    currentJson.name = document.getElementById('name').value;
                    currentJson.display_name = document.getElementById('name').value;
                    currentJson.description = document.getElementById('description').value;
                    var connSel = document.getElementById('connection-id');
                    var apiKeyParamEl = document.getElementById('api-key-param-name');
                    if (connSel || apiKeyParamEl) {
                        if (!currentJson.binding) currentJson.binding = {};
                        if (!currentJson.binding.openapi) currentJson.binding.openapi = {};
                        var paramName = (apiKeyParamEl && apiKeyParamEl.value || 'apiKey').trim() || 'apiKey';
                        if (connSel) {
                            var connId = connSel.value || null;
                            currentJson.binding.openapi.connection_id = connId;
                            if (connId && Array.isArray(connectionsList) && connectionsList.length > 0) {
                                var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
                                if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
                                    currentJson.binding.openapi.security = conn.security.map(function(s) {
                                        if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                                        return s;
                                    });
                                }
                            }
                        } else if (apiKeyParamEl && Array.isArray(currentJson.binding.openapi.security)) {
                            currentJson.binding.openapi.security = currentJson.binding.openapi.security.map(function(s) {
                                if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                                return s;
                            });
                        }
                    }
                }
                currentJson.permission = document.getElementById('permission').value;
                currentJson.restrictions = document.getElementById('restrictions').value;
                var tagsVal = document.getElementById('tags').value;
                currentJson.tags = tagsVal ? tagsVal.split(',').map(function(t){ return t.trim(); }) : null;
                var serverInputs = document.querySelectorAll('.server-url');
                serverInputs.forEach(function(inp) {
                    var idx = parseInt(inp.dataset.idx);
                    if (currentJson.servers && currentJson.servers[idx]) {
                        if (typeof currentJson.servers[idx] === 'string') currentJson.servers[idx] = inp.value;
                        else currentJson.servers[idx].url = inp.value;
                    }
                });
                applyParamEditsToJson(currentJson);
                var updated = JSON.stringify(currentJson, null, 2);
                if (typeof setJsonEditorValue === 'function') setJsonEditorValue(updated); else { var je = document.getElementById('json-editor'); if (je) je.value = updated; }
            } catch(e) {}
        } else if (tabName === 'form') {
            try { syncForm(JSON.parse(typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value) || '{}')); } catch(e) {}
        } else if (tabName === 'test') {
            try { detectLocalEndpoints(JSON.parse(typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value) || '{}')); } catch(e) {}
            var gb = document.getElementById('generate-btn');
            if (gb && (document.getElementById('local-url') && document.getElementById('local-url').value || '').trim()) gb.disabled = false;
        }
    }
    window.openTab = openTab;
    document.querySelectorAll('.tab[data-tab]').forEach(function(t) {
        t.addEventListener('click', function() { openTab(t.getAttribute('data-tab')); });
    });
})();

// Python copy: if we have _pythonCopy, switch to Python tab and prefill
if (initialData && initialData._pythonCopy) {
    debug('Python copy mode - switching to Python and prefilling');
    if (typeof switchToolType === 'function') switchToolType('python');
    else {
        var openapiArea = document.getElementById('openapi-create-area');
        var pythonArea = document.getElementById('python-create-area');
        var saveBtn = document.getElementById('save-btn');
        var tabs = document.querySelectorAll('.tool-type-tabs .tab');
        if (tabs) tabs.forEach(function(t){ t.classList.toggle('active', t && t.dataset.toolType === 'python'); });
        if (openapiArea) openapiArea.style.display = 'none';
        if (pythonArea) pythonArea.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'none';
    }
    var set = function(id, val) { var el = document.getElementById(id); if (el && val != null) el.value = String(val); };
    set('python-tool-name', initialData.name || '');
    set('python-display-name', initialData.display_name || '');
    set('python-description', initialData.description || '');
    set('python-function', initialData.binding && initialData.binding.python && initialData.binding.python.function || '');
    set('python-filename', initialData.pythonFileName || 'tool.py');
    set('python-code', initialData.pythonCode || '');
    set('python-requirements', initialData.requirements || '');
    var inputSchemaEl = document.getElementById('python-input-schema');
    var outputSchemaEl = document.getElementById('python-output-schema');
    var outputTypeSel = document.getElementById('python-output-type');
    if (inputSchemaEl && initialData.input_schema) inputSchemaEl.value = JSON.stringify(initialData.input_schema, null, 2);
    if (outputSchemaEl && initialData.output_schema) outputSchemaEl.value = JSON.stringify(initialData.output_schema, null, 2);
    if (initialData.input_schema && typeof populatePythonParamsTable === 'function') populatePythonParamsTable(initialData.input_schema);
    if (initialData.output_schema && outputTypeSel) {
        var os = initialData.output_schema;
        if (os.type === 'string' && os.format === 'binary') outputTypeSel.value = 'string-binary';
        else if (os.type === 'string') outputTypeSel.value = 'string';
        else outputTypeSel.value = 'object';
    }
    if (typeof initEventListeners === 'function') initEventListeners();
}

if (!initialData) { debug('Skipping init - no initialData'); } else try {
    if (initialData._pythonCopy) { debug('Skipping OAS init - Python copy mode'); }
    else {
    debug('Populating form...');
    var jsonStr = JSON.stringify(initialData, null, 2);
    if (typeof setJsonEditorValue === 'function') setJsonEditorValue(jsonStr); else { var el = document.getElementById('json-editor'); if (el) el.value = jsonStr; }
    originalOasJson = jsonStr;
    debug('populateConnectionDropdown');
    populateConnectionDropdown(connectionsList);
    var connSel = document.getElementById('connection-id');
    if (connSel) connSel.addEventListener('change', function() {
        var apiKeyParamEl = document.getElementById('api-key-param-name');
        if (!apiKeyParamEl) return;
        var connId = this.value;
        if (!connId || !Array.isArray(connectionsList) || connectionsList.length === 0) return;
        var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
        if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
            var apiKeySec = conn.security.find(function(s) { return s && s.type === 'apiKey'; });
            if (apiKeySec && apiKeySec.name) apiKeyParamEl.value = apiKeySec.name;
        }
    });
    var autoCreateCb = document.getElementById('auto-create-connection-cb');
    var autoCreateArea = document.getElementById('auto-create-url-area');
    var autoConnectionUrlEl = document.getElementById('auto-connection-url');
    if (autoCreateCb && autoCreateArea) {
        autoCreateCb.addEventListener('change', function() {
            autoCreateArea.style.display = this.checked ? 'block' : 'none';
            if (!this.checked && autoConnectionUrlEl) autoConnectionUrlEl.value = '';
        });
    }
    if (autoConnectionUrlEl) {
        autoConnectionUrlEl.addEventListener('input', function() {
            var u = (this.value || '').trim();
            var det = document.getElementById('auto-create-detected');
            var apiKeyParamEl = document.getElementById('api-key-param-name');
            if (!det) return;
            if (!u) { det.textContent = ''; return; }
            try {
                var parsed = new URL(u);
                var base = parsed.origin;
                var path = parsed.pathname || '/';
                var params = {};
                parsed.searchParams.forEach(function(v, k) { params[k] = v; });
                var apiKeyNames = ['key', 'apiKey', 'api_key', 'apikey', 'token', 'auth'];
                var found = null;
                for (var i = 0; i < apiKeyNames.length; i++) {
                    if (params[apiKeyNames[i]]) { found = apiKeyNames[i]; break; }
                }
                if (!found && Object.keys(params).length > 0) {
                    var first = Object.keys(params)[0];
                    if (params[first].length >= 8 && /^[a-zA-Z0-9_-]+$/.test(params[first])) found = first;
                }
                if (found && apiKeyParamEl) {
                    apiKeyParamEl.value = found;
                }
                det.textContent = found ? 'Detected: base=' + base + ', path=' + path + ', api key param=' + found : 'No API key param found. Common: key, apiKey, api_key';
                var jsonVal = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
                if (jsonVal) {
                    try {
                        var oas = JSON.parse(jsonVal);
                        if (!oas) oas = {};
                        if (!oas.servers || oas.servers.length === 0) {
                            oas.servers = [{ url: base }];
                        } else if (oas.servers[0]) {
                            oas.servers[0] = typeof oas.servers[0] === 'string' ? base : Object.assign({}, oas.servers[0], { url: base });
                        }
                        var pathKeys = oas.paths ? Object.keys(oas.paths) : [];
                        if (pathKeys.length === 0 && path) {
                            var opParams = [];
                            for (var pk in params) {
                                opParams.push({ name: pk, in: 'query', required: false, schema: { type: 'string' }, description: pk === found ? 'API key (from connection)' : '' });
                            }
                            if (opParams.length === 0) opParams.push({ name: found || 'apiKey', in: 'query', required: false, schema: { type: 'string' } });
                            oas.paths = {};
                            oas.paths[path] = {
                                get: {
                                    operationId: 'fetch',
                                    summary: oas.info && oas.info.title ? oas.info.title : 'Fetch',
                                    parameters: opParams,
                                    responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } } }
                                }
                            };
                        }
                        var hostPart = parsed.hostname.replace(/^api\./, '');
                        if (!oas.info) oas.info = {};
                        if (!oas.info.title) oas.info.title = hostPart.split('.')[0] || 'API';
                        var formatted = JSON.stringify(oas, null, 2);
                        if (typeof setJsonEditorValue === 'function') setJsonEditorValue(formatted); else { var jEl = document.getElementById('json-editor'); if (jEl) jEl.value = formatted; }
                        syncForm(oas);
                    } catch (je) {}
                }
            } catch (e) {
                det.textContent = 'Invalid URL';
            }
        });
    }
    debug('syncForm');
    syncForm(initialData);
    // Populate Python edit textareas from data-initial (base64)
    var pyCodeEl = document.getElementById('python-edit-code');
    var pyReqEl = document.getElementById('python-edit-requirements');
    if (pyCodeEl && pyCodeEl.dataset.initial) { try { pyCodeEl.value = atob(pyCodeEl.dataset.initial); } catch(e) {} }
    if (pyReqEl && pyReqEl.dataset.initial) { try { pyReqEl.value = atob(pyReqEl.dataset.initial); } catch(e) {} }
    // Populate Python edit params and output schema
    if (mode === 'edit' && initialData && (initialData.binding && initialData.binding.python)) {
        var editInputEl = document.getElementById('python-edit-input-schema');
        var editOutputEl = document.getElementById('python-edit-output-schema');
        var editOutputTypeSel = document.getElementById('python-edit-output-type');
        if (initialData.input_schema && editInputEl) editInputEl.value = JSON.stringify(initialData.input_schema, null, 2);
        if (initialData.input_schema && typeof populatePythonParamsTableEdit === 'function') populatePythonParamsTableEdit(initialData.input_schema);
        if (initialData.output_schema && editOutputEl) editOutputEl.value = JSON.stringify(initialData.output_schema, null, 2);
        if (initialData.output_schema && editOutputTypeSel) {
            var os = initialData.output_schema;
            if (os.type === 'string' && os.format === 'binary') editOutputTypeSel.value = 'string-binary';
            else if (os.type === 'string') editOutputTypeSel.value = 'string';
            else editOutputTypeSel.value = 'object';
        }
    }
    debug('detectLocalEndpoints');
    detectLocalEndpoints(initialData);
    debug('populateTestInfo');
    populateTestInfo(initialData);
    debug('initEventListeners');
    initEventListeners();
    debug('Initialization complete');
    }
} catch(e) { 
    console.error('[WxO Editor Webview] Init Error:', e, e.stack);
    vscode.postMessage({ command: 'error', message: 'Initialization Error: ' + e.message });
}

function populateTestInfo(data) {
    const infoDiv = document.getElementById('test-tool-info');
    if (!infoDiv) return;
    let html = '';
    let toolDesc = '';
    let params = [];
    let securityInfo = null;
    if (data.info) {
        toolDesc = data.info.description || '';
        if (data.paths) {
            Object.keys(data.paths).forEach(pathKey => {
                const pathObj = data.paths[pathKey];
                ['get','post','put','patch','delete'].forEach(method => {
                    if (!pathObj[method]) return;
                    const op = pathObj[method];
                    if (!toolDesc && op.description) toolDesc = op.description;
                    if (op.parameters) op.parameters.forEach(p => {
                        params.push({ name: p.name, type: (p.schema && p.schema.type) || 'string', required: p.required || false, description: p.description || '' });
                    });
                });
            });
        }
    } else if (data.binding && data.binding.openapi) {
        toolDesc = data.description || '';
        if (data.input_schema && data.input_schema.properties) {
            Object.keys(data.input_schema.properties).forEach(key => {
                const p = data.input_schema.properties[key];
                params.push({ name: p.aliasName || key, type: p.type || 'string', required: (data.input_schema.required || []).includes(key), description: p.description || '' });
            });
        }
        const sec = data.binding.openapi.security;
        if (Array.isArray(sec) && sec.length > 0) {
            securityInfo = sec[0];
            securityInfo.connectionId = data.binding.openapi.connection_id || null;
        }
    }
    if (toolDesc) html += '<div style="margin-bottom:4px;">' + (toolDesc.length > 120 ? toolDesc.substring(0, 120) + '…' : toolDesc) + '</div>';
    if (params.length > 0) {
        html += '<div style="font-size:0.85em;">Params: ';
        html += params.slice(0, 6).map(p => '<code>' + p.name + '</code>' + (p.required ? '*' : '')).join(', ');
        if (params.length > 6) html += ' …';
        html += '</div>';
    }
    if (!html) html = '<span style="opacity:0.6;">No params info</span>';
    infoDiv.innerHTML = html;
    populateAuthHelper(securityInfo, data);
}

function populateAuthHelper(secInfo, data) {
    var helperDiv = document.getElementById('auth-helper');
    var infoDiv2 = document.getElementById('auth-helper-info');
    var fieldsDiv = document.getElementById('auth-fields');
    if (!helperDiv || !infoDiv2 || !fieldsDiv) return;
    if (!secInfo) { helperDiv.style.display = 'none'; return; }
    helperDiv.style.display = 'block';
    var authType = secInfo.type || 'apiKey';
    var paramIn = secInfo.in || 'header';
    var paramName = secInfo.name || 'Authorization';
    var connId = secInfo.connectionId;
    var infoHtml = '';
    var fieldsHtml = '';
    var eyeBtn = '<button class="secondary" onclick="toggleAuthVisibility(0)" style="padding:4px 8px; font-size:0.8em;">👁</button>';
    if (authType === 'apiKey' || authType === 'api_key') {
        infoHtml = 'API Key: <code>' + paramName + '</code> in ' + paramIn + (connId ? ' · Conn: ' + connId : '') + '.';
        fieldsHtml = '<div style="display:flex; gap:8px; align-items:center;"><label style="flex:0 0 auto; margin:0; font-weight:normal;">' + paramName + ':</label><input type="password" id="auth-value-0" placeholder="API key" style="flex:1;">' + eyeBtn + '</div>';
    } else if (authType === 'http' || authType === 'bearer') {
        infoHtml = 'Bearer token' + (connId ? ' · Conn: ' + connId : '') + '.';
        fieldsHtml = '<div style="display:flex; gap:8px; align-items:center;"><label style="flex:0 0 auto; margin:0; font-weight:normal;">Token:</label><input type="password" id="auth-value-0" placeholder="Token" style="flex:1;">' + eyeBtn + '</div>';
    } else if (authType === 'oauth2' || authType === 'oauth') {
        infoHtml = 'OAuth 2.0' + (connId ? ' · Conn: ' + connId : '') + '.';
        fieldsHtml = '<div style="display:flex; gap:8px; align-items:center;"><label style="flex:0 0 auto; margin:0; font-weight:normal;">Token:</label><input type="password" id="auth-value-0" placeholder="Access token" style="flex:1;">' + eyeBtn + '</div>';
    } else {
        infoHtml = authType + (connId ? ' · Conn: ' + connId : '') + '.';
        fieldsHtml = '<div style="display:flex; gap:8px; align-items:center;"><label style="flex:0 0 auto; margin:0; font-weight:normal;">' + paramName + ':</label><input type="password" id="auth-value-0" placeholder="Credential" style="flex:1;">' + eyeBtn + '</div>';
    }
    helperDiv.dataset.authType = authType;
    helperDiv.dataset.paramIn = paramIn;
    helperDiv.dataset.paramName = paramName;
    infoDiv2.innerHTML = infoHtml;
    fieldsDiv.innerHTML = fieldsHtml;
}

function populateConnectionDropdown(connections) {
    const sel = document.getElementById('connection-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">— None —</option>';
    (connections || []).forEach(function(c) {
        const opt = document.createElement('option');
        opt.value = c.connection_id || c.app_id || '';
        var env = c.environment || 'draft';
        var status = c.credentials_entered ? '\u2713' : '\u2717';
        opt.textContent = (c.app_id || c.connection_id || 'Unknown') + ' [' + env + '] ' + status;
        sel.appendChild(opt);
    });
}

function toggleAuthVisibility(idx) {
    var inp = document.getElementById('auth-value-' + idx);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

function getAuthHeaders() {
    var helperDiv = document.getElementById('auth-helper');
    if (!helperDiv || helperDiv.style.display === 'none') return { headers: {}, queryParams: {} };
    var authType = helperDiv.dataset.authType || '';
    var paramIn = helperDiv.dataset.paramIn || 'header';
    var paramName = helperDiv.dataset.paramName || 'Authorization';
    var inp = document.getElementById('auth-value-0');
    var value = inp ? inp.value : '';
    if (!value) return { headers: {}, queryParams: {} };
    if (paramIn === 'header') {
        var headerVal = (authType === 'http' || authType === 'bearer' || authType === 'oauth2') ? 'Bearer ' + value : value;
        var h = {}; h[paramName] = headerVal;
        return { headers: h, queryParams: {} };
    } else if (paramIn === 'query') {
        var q = {}; q[paramName] = value;
        return { headers: {}, queryParams: q };
    }
    return { headers: {}, queryParams: {} };
}

function syncForm(data) {
    if (mode === 'create') {
        document.getElementById('name').value = (data && data.info && data.info.title) || '';
        document.getElementById('description').value = (data && data.info && data.info.description) || '';
        document.getElementById('version').value = (data && data.info && data.info.version) || '';
        document.getElementById('skill-name').value = (data && data.info && data.info['x-ibm-skill-name']) || '';
        document.getElementById('skill-id').value = (data && data.info && data.info['x-ibm-skill-id']) || '';
    } else {
        document.getElementById('name').value = (data && data.display_name) || (data && data.name) || (data && data.info && data.info.title) || '';
        document.getElementById('description').value = (data && data.description) || (data && data.info && data.info.description) || '';
        var vEl = document.getElementById('version');
        if (vEl) vEl.value = (data && data.version) || (data && data.info && data.info.version) || '1.0.0';
        var snEl = document.getElementById('skill-name');
        if (snEl) snEl.value = (data && data.info && data.info['x-ibm-skill-name']) || (data && data['x-ibm-skill-name']) || (data && data.name) || '';
        var siEl = document.getElementById('skill-id');
        if (siEl) siEl.value = (data && data.info && data.info['x-ibm-skill-id']) || (data && data['x-ibm-skill-id']) || (data && data.id) || '';
    }
    document.getElementById('permission').value = (data && data.permission) || 'read_write';
    document.getElementById('restrictions').value = (data && data.restrictions && String(data.restrictions).trim()) ? String(data.restrictions).trim() : 'editable';
    document.getElementById('tags').value = Array.isArray(data && data.tags) ? data.tags.join(', ') : (data && data.tags) || '';
    var connSel = document.getElementById('connection-id');
    if (connSel) {
        var connId = (data && data['x-ibm-connection-id']) || (data && data.binding && data.binding.openapi && data.binding.openapi.connection_id) || '';
        connSel.value = connId;
        if (connId && !Array.from(connSel.options).some(function(o) { return o.value === connId; })) {
            var opt = document.createElement('option');
            opt.value = connId;
            opt.textContent = connId.substring(0, 8) + '… (saved)';
            opt.selected = true;
            connSel.appendChild(opt);
        }
    }
    var apiKeyParamEl = document.getElementById('api-key-param-name');
    if (apiKeyParamEl) {
        var sec = (data && data['x-ibm-security']) || (data && data.binding && data.binding.openapi && data.binding.openapi.security);
        var apiKeyName = '';
        if (Array.isArray(sec) && sec.length > 0) {
            var apiKeySec = sec.find(function(s) { return (s && s.type === 'apiKey'); });
            if (apiKeySec && apiKeySec.name) apiKeyName = apiKeySec.name;
        }
        if (!apiKeyName && data && data.components && data.components.securitySchemes) {
            var schemes = data.components.securitySchemes;
            for (var k in schemes) { if (schemes[k] && schemes[k].type === 'apiKey' && schemes[k].name) { apiKeyName = schemes[k].name; break; } }
        }
        if (!apiKeyName && data && data.paths) {
            var apiKeyParams = ['key', 'apiKey', 'api_key', 'apikey'];
            var paths = data.paths;
            outer: for (var pk in paths) {
                var opObj = paths[pk];
                for (var m in opObj) {
                    if (m === 'get' || m === 'post' || m === 'put' || m === 'patch') {
                        var params = opObj[m].parameters || [];
                        for (var i = 0; i < params.length; i++) {
                            var pn = params[i].name;
                            if (pn && apiKeyParams.indexOf(pn) >= 0) { apiKeyName = pn; break outer; }
                        }
                    }
                }
            }
        }
        if (apiKeyName) apiKeyParamEl.value = apiKeyName;
        else if (!apiKeyParamEl.value) apiKeyParamEl.value = 'apiKey';
    }
    var serversContainer = document.getElementById('servers-container');
    if (serversContainer) {
        serversContainer.innerHTML = '';
        if (mode === 'create') {
            var servers = (data && data.servers) || (data && data.binding && data.binding.openapi && data.binding.openapi.servers ? (Array.isArray(data.binding.openapi.servers) ? data.binding.openapi.servers.map(function(s) { return typeof s === 'string' ? { url: s } : s; }) : []) : []);
            if (!Array.isArray(servers) || servers.length === 0) {
                serversContainer.innerHTML = '<span style="opacity:0.6;">No servers defined.</span>';
            } else {
                servers.forEach((srv, i) => {
                    var url = typeof srv === 'string' ? srv : (srv.url || '');
                    var desc = srv.description || '';
                    serversContainer.innerHTML += '<div style="margin-bottom:6px;"><label>Server ' + (i + 1) + ' URL</label><input type="text" class="server-url" data-idx="' + i + '" value="' + url + '">' + (desc ? '<span style="font-size:0.85em; opacity:0.6;">' + desc + '</span>' : '') + '</div>';
                });
            }
        }
    }
    var pathsContainer = document.getElementById('paths-container');
    if (!pathsContainer) return;
    pathsContainer.innerHTML = '';
    var paths = data.paths || {};
    var isEditReadOnly = (mode === 'edit');
    if (Object.keys(paths).length === 0 && data.binding && data.binding.openapi) {
        var b = data.binding.openapi;
        var methodBadge = '<span style="background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); padding:2px 8px; border-radius:3px; font-size:0.8em; font-weight:bold; margin-right:6px;">' + (b.http_method || 'GET').toUpperCase() + '</span>';
        var paramsHtml = isEditReadOnly ? renderParamsFromSchemaReadOnly(data.input_schema) : renderParamsFromSchema(data.input_schema);
        pathsContainer.innerHTML = '<div style="border:1px solid var(--vscode-widget-border); padding:10px; margin-bottom:8px; border-radius:4px;"><div style="margin-bottom:6px;">' + methodBadge + '<code>' + (b.http_path || '/') + '</code></div><div style="opacity:0.9; font-size:0.9em;"><strong>' + (data.name || '') + '</strong> – ' + (data.display_name || data.name || '') + '</div>' + paramsHtml + (isEditReadOnly ? '' : renderResponseFromSchema(data.output_schema)) + '</div>';
        return;
    }
    if (!paths || typeof paths !== 'object') {
        pathsContainer.innerHTML = '<span style="opacity:0.6;">No paths defined.</span>';
        return;
    }
    Object.keys(paths).forEach(function(pathKey) {
        var pathObj = paths[pathKey];
        ['get','post','put','patch','delete','options','head'].forEach(function(method) {
            if (!pathObj[method]) return;
            var op = pathObj[method];
            var methodColor = method === 'get' ? '#61affe' : method === 'post' ? '#49cc90' : method === 'put' ? '#fca130' : method === 'delete' ? '#f93e3e' : '#9012fe';
            var methodBadge = '<span style="background:' + methodColor + '; color:white; padding:2px 8px; border-radius:3px; font-size:0.8em; font-weight:bold; margin-right:6px; text-transform:uppercase;">' + method + '</span>';
            var opHtml = '<div style="border:1px solid var(--vscode-widget-border); padding:10px; margin-bottom:8px; border-radius:4px;">';
            opHtml += '<div style="margin-bottom:8px;">' + methodBadge + '<code style="font-size:0.95em;">' + pathKey + '</code></div>';
            if (op.operationId) opHtml += '<label>Operation ID</label><input type="text" value="' + (op.operationId || '').replace(/"/g, '&quot;') + '" readonly style="opacity:0.8;">';
            if (op.summary) opHtml += '<label>Summary</label><input type="text" value="' + (op.summary || '').replace(/"/g, '&quot;') + '" readonly style="opacity:0.8;">';
            if (op.description) opHtml += '<label>Description</label><textarea rows="2" readonly style="opacity:0.8;">' + (op.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>';
            if (isEditReadOnly) {
                opHtml += '<label>Parameters (read-only)</label><table style="width:100%; border-collapse:collapse; font-size:0.9em; margin-bottom:10px;"><tr style="border-bottom:1px solid var(--vscode-widget-border); opacity:0.8;"><th style="text-align:left; padding:4px;">Name</th><th style="text-align:left; padding:4px;">In</th><th style="text-align:left; padding:4px;">Type</th><th style="text-align:left; padding:4px;">Required</th></tr>';
                (op.parameters || []).forEach(function(p) {
                    opHtml += '<tr style="border-bottom:1px solid var(--vscode-widget-border);"><td style="padding:4px;"><code>' + escapeAttr(p.name || '') + '</code></td><td style="padding:4px;">' + escapeAttr(p.in || '') + '</td><td style="padding:4px;">' + escapeAttr((p.schema && p.schema.type) || '-') + '</td><td style="padding:4px;">' + (p.required ? 'Yes' : 'No') + '</td></tr>';
                });
                opHtml += '</table>';
            } else {
                opHtml += '<label>Parameters</label><table style="width:100%; border-collapse:collapse; font-size:0.9em; margin-bottom:10px;" data-params-format="paths" data-pathkey="' + escapeAttr(pathKey) + '" data-method="' + escapeAttr(method) + '"><tr style="border-bottom:1px solid var(--vscode-widget-border); opacity:0.8;"><th style="text-align:left; padding:4px;">Name</th><th style="text-align:left; padding:4px;">In</th><th style="text-align:left; padding:4px;">Type</th><th style="text-align:left; padding:4px; width:70px;">Required</th><th style="text-align:left; padding:4px;">Default</th><th style="text-align:left; padding:4px;">Description</th><th style="text-align:left; padding:4px; width:50px;"></th></tr>';
                (op.parameters || []).forEach(function(p, idx) {
                    var pType = (p.schema && p.schema.type) || 'string';
                    var defVal = (p.schema && (p.schema.default !== undefined && p.schema.default !== null)) ? String(p.schema.default) : '';
                    opHtml += '<tr class="param-row" style="border-bottom:1px solid var(--vscode-widget-border);">';
                    opHtml += '<td style="padding:4px;"><input type="text" class="param-name paths" value="' + escapeAttr(p.name || '') + '" placeholder="paramName" style="width:100%; padding:4px; font-size:0.9em;"></td>';
                    opHtml += '<td style="padding:4px;"><select class="param-in paths" style="width:100%; padding:4px;"><option value="query"' + ((p.in || 'query') === 'query' ? ' selected' : '') + '>query</option><option value="header"' + ((p.in || '') === 'header' ? ' selected' : '') + '>header</option><option value="path"' + ((p.in || '') === 'path' ? ' selected' : '') + '>path</option></select></td>';
                    opHtml += '<td style="padding:4px;"><select class="param-type paths" style="width:100%; padding:4px;"><option value="string"' + (pType === 'string' ? ' selected' : '') + '>string</option><option value="integer"' + (pType === 'integer' ? ' selected' : '') + '>integer</option><option value="number"' + (pType === 'number' ? ' selected' : '') + '>number</option><option value="boolean"' + (pType === 'boolean' ? ' selected' : '') + '>boolean</option></select></td>';
                    opHtml += '<td style="padding:4px;"><input type="checkbox" class="param-required paths"' + (p.required ? ' checked' : '') + ' title="Required"></td>';
                    opHtml += '<td style="padding:4px;"><input type="text" class="param-default paths" value="' + escapeAttr(defVal) + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>';
                    opHtml += '<td style="padding:4px;"><input type="text" class="param-desc paths" value="' + escapeAttr(p.description || '') + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>';
                    opHtml += '<td style="padding:4px;"><button type="button" class="param-delete secondary" style="padding:2px 8px; font-size:0.85em;" title="Delete">Delete</button></td></tr>';
                });
                opHtml += '</table><button type="button" class="param-add secondary" data-format="paths" data-pathkey="' + escapeAttr(pathKey) + '" data-method="' + escapeAttr(method) + '" style="margin-bottom:8px; padding:4px 12px; font-size:0.9em;">+ Add parameter</button>';
            }
            var resp200 = op.responses && op.responses['200'];
            if (resp200 && !isEditReadOnly) {
                var schema = resp200.content && resp200.content['application/json'] && resp200.content['application/json'].schema;
                if (schema) opHtml += renderSchemaSection('Response Schema (200)', schema);
            }
            opHtml += '</div>';
            pathsContainer.innerHTML += opHtml;
        });
    });
}

function escapeAttr(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseParamDefault(v, type) {
    v = (v || '').trim();
    if (v === '') return undefined;
    var num = parseFloat(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (!isNaN(num) && String(num) === v) return num;
    return v;
}

function applyParamEditsToJson(currentJson) {
    var tables = document.querySelectorAll('table[data-params-format]');
    tables.forEach(function(tbl) {
        var format = tbl.getAttribute('data-params-format');
        if (format === 'schema') {
            if (!currentJson.input_schema) currentJson.input_schema = { type: 'object', properties: {} };
            var props = {};
            var required = [];
            var rows = tbl.querySelectorAll('tr.param-row');
            rows.forEach(function(row) {
                if (row.getAttribute('data-deleted') === '1') return;
                var nameInp = row.querySelector('.param-name');
                var raw = nameInp ? (nameInp.value || '').trim() : '';
                var key = raw ? raw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '').replace(/_+$/, '') || null : null;
                if (!key) return;
                var inSel = row.querySelector('.param-in');
                var typeSel = row.querySelector('.param-type');
                var reqCb = row.querySelector('.param-required');
                var defInp = row.querySelector('.param-default');
                var descInp = row.querySelector('.param-desc');
                var prop = {
                    type: (typeSel && typeSel.value) || 'string',
                    description: (descInp && descInp.value) || '',
                    in: (inSel && inSel.value) || 'query'
                };
                var def = parseParamDefault(defInp ? defInp.value : '', prop.type);
                if (def !== undefined) prop.default = def;
                props[key] = prop;
                if (reqCb && reqCb.checked) required.push(key);
            });
            currentJson.input_schema.properties = props;
            currentJson.input_schema.required = required.length > 0 ? required : undefined;
        } else if (format === 'paths') {
            var pathKey = tbl.getAttribute('data-pathkey');
            var method = tbl.getAttribute('data-method');
            if (!pathKey || !method || !currentJson.paths || !currentJson.paths[pathKey] || !currentJson.paths[pathKey][method]) return;
            var params = [];
            var rows = tbl.querySelectorAll('tr.param-row');
            rows.forEach(function(row) {
                if (row.getAttribute('data-deleted') === '1') return;
                var nameInp = row.querySelector('.param-name.paths');
                var name = nameInp ? (nameInp.value || '').trim() : '';
                if (!name) return;
                var inSel = row.querySelector('.param-in.paths');
                var typeSel = row.querySelector('.param-type.paths');
                var reqCb = row.querySelector('.param-required.paths');
                var defInp = row.querySelector('.param-default.paths');
                var descInp = row.querySelector('.param-desc.paths');
                var p = {
                    name: name,
                    in: (inSel && inSel.value) || 'query',
                    required: !!(reqCb && reqCb.checked),
                    description: (descInp && descInp.value) || '',
                    schema: { type: (typeSel && typeSel.value) || 'string' }
                };
                var def = parseParamDefault(defInp ? defInp.value : '', p.schema.type);
                if (def !== undefined) p.schema.default = def;
                params.push(p);
            });
            currentJson.paths[pathKey][method].parameters = params;
        }
    });
}

function renderParamsFromSchemaReadOnly(inputSchema) {
    if (!inputSchema || !inputSchema.properties) return '<div style="opacity:0.7; font-size:0.9em; margin-top:8px;">No parameters.</div>';
    var required = inputSchema.required || [];
    var html = '<label style="margin-top:8px;">Parameters (read-only)</label><table style="width:100%; border-collapse:collapse; font-size:0.9em; margin-top:4px;"><tr style="border-bottom:1px solid var(--vscode-widget-border); opacity:0.8;"><th style="text-align:left; padding:4px;">Name</th><th style="text-align:left; padding:4px;">In</th><th style="text-align:left; padding:4px;">Type</th><th style="text-align:left; padding:4px;">Required</th></tr>';
    Object.keys(inputSchema.properties).forEach(function(key) {
        var p = inputSchema.properties[key];
        var isReq = required.indexOf(key) >= 0;
        html += '<tr style="border-bottom:1px solid var(--vscode-widget-border);"><td style="padding:4px;"><code>' + escapeAttr(p.aliasName || key) + '</code></td><td style="padding:4px;">' + escapeAttr(p.in || 'query') + '</td><td style="padding:4px;">' + escapeAttr(p.type || '-') + '</td><td style="padding:4px;">' + (isReq ? 'Yes' : 'No') + '</td></tr>';
    });
    html += '</table>';
    return html;
}

function renderParamsFromSchema(inputSchema) {
    if (!inputSchema) inputSchema = { type: 'object', properties: {} };
    if (!inputSchema.properties) inputSchema.properties = {};
    var required = inputSchema.required || [];
    var html = '<label>Parameters</label><table style="width:100%; border-collapse:collapse; font-size:0.9em; margin-bottom:10px;" data-params-format="schema">';
    html += '<tr style="border-bottom:1px solid var(--vscode-widget-border); opacity:0.8;"><th style="text-align:left; padding:4px;">Name</th><th style="text-align:left; padding:4px;">In</th><th style="text-align:left; padding:4px;">Type</th><th style="text-align:left; padding:4px; width:70px;">Required</th><th style="text-align:left; padding:4px;">Default</th><th style="text-align:left; padding:4px;">Description</th><th style="text-align:left; padding:4px; width:50px;"></th></tr>';
    Object.keys(inputSchema.properties).forEach(key => {
        var p = inputSchema.properties[key];
        var isReq = required.indexOf(key) >= 0;
        var defVal = p.default !== undefined && p.default !== null ? String(p.default) : '';
        html += '<tr class="param-row" style="border-bottom:1px solid var(--vscode-widget-border);">';
        html += '<td style="padding:4px;"><input type="text" class="param-name" value="' + escapeAttr(p.aliasName || key) + '" placeholder="paramName" style="width:100%; padding:4px; font-size:0.9em;"></td>';
        html += '<td style="padding:4px;"><select class="param-in" style="width:100%; padding:4px;"><option value="query"' + ((p.in || 'query') === 'query' ? ' selected' : '') + '>query</option><option value="header"' + ((p.in || '') === 'header' ? ' selected' : '') + '>header</option><option value="path"' + ((p.in || '') === 'path' ? ' selected' : '') + '>path</option></select></td>';
        html += '<td style="padding:4px;"><select class="param-type" style="width:100%; padding:4px;"><option value="string"' + ((p.type || 'string') === 'string' ? ' selected' : '') + '>string</option><option value="integer"' + ((p.type || '') === 'integer' ? ' selected' : '') + '>integer</option><option value="number"' + ((p.type || '') === 'number' ? ' selected' : '') + '>number</option><option value="boolean"' + ((p.type || '') === 'boolean' ? ' selected' : '') + '>boolean</option></select></td>';
        html += '<td style="padding:4px;"><input type="checkbox" class="param-required"' + (isReq ? ' checked' : '') + ' title="Required"></td>';
        html += '<td style="padding:4px;"><input type="text" class="param-default" value="' + escapeAttr(defVal) + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>';
        html += '<td style="padding:4px;"><input type="text" class="param-desc" value="' + escapeAttr(p.description || '') + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>';
        html += '<td style="padding:4px;"><button type="button" class="param-delete secondary" style="padding:2px 8px; font-size:0.85em;" title="Delete">Delete</button></td></tr>';
    });
    html += '</table><button type="button" class="param-add secondary" data-format="schema" style="margin-bottom:8px; padding:4px 12px; font-size:0.9em;">+ Add parameter</button>';
    return html;
}

function renderResponseFromSchema(outputSchema) {
    if (!outputSchema) return '';
    return renderSchemaSection('Response Schema', outputSchema);
}

function renderSchemaSection(title, schema) {
    let html = '<label>' + title + '</label><div style="background:var(--vscode-editor-inactiveSelectionBackground); padding:8px; border-radius:4px; font-size:0.9em; margin-bottom:8px;"><span style="opacity:0.7;">Type: </span><strong>' + (schema.type || 'object') + '</strong>';
    if (schema.properties) {
        html += '<table style="width:100%; border-collapse:collapse; margin-top:6px;"><tr style="border-bottom:1px solid var(--vscode-widget-border); opacity:0.8;"><th style="text-align:left; padding:3px;">Field</th><th style="text-align:left; padding:3px;">Type</th><th style="text-align:left; padding:3px;">Description</th></tr>';
        Object.keys(schema.properties).forEach(key => {
            const prop = schema.properties[key];
            let propType = prop.type || 'object';
            if (propType === 'array' && prop.items) propType = 'array[' + (prop.items.type || 'object') + ']';
            html += '<tr style="border-bottom:1px solid var(--vscode-widget-border);"><td style="padding:3px;"><code>' + key + '</code></td><td style="padding:3px;">' + propType + '</td><td style="padding:3px; opacity:0.8;">' + (prop.description || '') + '</td></tr>';
        });
        html += '</table>';
    }
    if (schema.items && schema.items.properties) {
        html += '<div style="margin-top:6px; padding-left:10px; border-left:2px solid var(--vscode-widget-border);">' + renderSchemaSection('Array Item Properties', schema.items) + '</div>';
    }
    html += '</div>';
    return html;
}

function detectLocalEndpoints(data) {
    try {
        if (!data) return;
        let newServerUrl = '', newMethod = '', newPath = '', newParams = {};
        if (data.binding && data.binding.openapi) {
            const openapi = data.binding.openapi;
            if (openapi.servers && Array.isArray(openapi.servers) && openapi.servers.length > 0) newServerUrl = openapi.servers[0];
            newMethod = openapi.http_method || 'GET';
            newPath = openapi.http_path || '';
            if (data.input_schema && data.input_schema.properties) {
                Object.keys(data.input_schema.properties).forEach(key => {
                    const prop = data.input_schema.properties[key];
                    let defaultVal = prop.default;
                    if (defaultVal === undefined) {
                        if (prop.type === 'string') defaultVal = 'value';
                        else if (prop.type === 'integer' || prop.type === 'number') defaultVal = 0;
                        else if (prop.type === 'boolean') defaultVal = false;
                    }
                    if (defaultVal !== undefined) newParams[prop.aliasName || key] = defaultVal;
                });
            }
        } else if (data.servers && Array.isArray(data.servers) && data.servers.length > 0 && data.paths) {
            newServerUrl = data.servers[0].url;
            const firstPathKey = Object.keys(data.paths)[0];
            if (firstPathKey) {
                const pathObj = data.paths[firstPathKey];
                const methodKey = Object.keys(pathObj)[0];
                if (methodKey) {
                    newMethod = methodKey;
                    newPath = firstPathKey;
                    const op = pathObj[methodKey];
                    if (op.parameters && op.parameters.length > 0) {
                        op.parameters.forEach(function(p) {
                            var defaultVal = (p.schema && p.schema.default);
                            if (defaultVal === undefined) {
                                if (p.schema && p.schema.type === 'string') defaultVal = 'value';
                                else if (p.schema && (p.schema.type === 'integer' || p.schema.type === 'number')) defaultVal = 0;
                                else if (p.schema && p.schema.type === 'boolean') defaultVal = false;
                                else defaultVal = 'value';
                            }
                            newParams[p.name] = defaultVal;
                        });
                    }
                }
            }
        }
        if (newServerUrl || newPath) {
            let fullUrl = newServerUrl;
            if (fullUrl && newPath) {
                if (!fullUrl.endsWith('/') && !newPath.startsWith('/')) fullUrl += '/';
                else if (fullUrl.endsWith('/') && newPath.startsWith('/')) fullUrl = fullUrl.slice(0, -1);
                fullUrl += newPath;
            } else if (!fullUrl) fullUrl = newPath;
            if (fullUrl) document.getElementById('local-url').value = fullUrl;
            if (newMethod) document.getElementById('local-method').value = newMethod.toUpperCase();
            const currentParamsElem = document.getElementById('test-params');
            if (Object.keys(newParams).length > 0 && (currentParamsElem.value === '{}' || !currentParamsElem.value)) {
                currentParamsElem.value = JSON.stringify(newParams, null, 2);
            }
        }
    } catch (e) { console.error('Error detecting endpoints:', e); }
}

function loadSelectedTemplate() {
    const select = document.getElementById('template-select');
    vscode.postMessage({ command: 'loadTemplate', templateId: select ? select.value : 'blank' });
}

function requestImport() {
    vscode.postMessage({ command: 'importFile' });
}

function openTab(tabName) {
    debug('openTab:', tabName);
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    const tabEl = document.getElementById(tabName);
    if (tabEl) tabEl.classList.add('active');
    document.querySelectorAll('.tab').forEach(tab => { if (tab.getAttribute('data-tab') === tabName) tab.classList.add('active'); });
    if (tabName === 'json') {
        try {
            var jsonVal = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
            if (typeof initJsonEditor === 'function') initJsonEditor('json-editor-container', jsonVal);
            const currentJson = JSON.parse(jsonVal);
            if (mode === 'create') {
                if (!currentJson.info) currentJson.info = {};
                currentJson.info.title = document.getElementById('name').value;
                currentJson.info.description = document.getElementById('description').value;
                var verEl = document.getElementById('version');
                if (verEl) currentJson.info.version = verEl.value;
                var skillNameEl = document.getElementById('skill-name');
                var skillIdEl = document.getElementById('skill-id');
                if (skillNameEl && skillNameEl.value) currentJson.info['x-ibm-skill-name'] = skillNameEl.value;
                if (skillIdEl && skillIdEl.value) currentJson.info['x-ibm-skill-id'] = skillIdEl.value;
                var connSel = document.getElementById('connection-id');
                var connId = connSel ? connSel.value : '';
                currentJson['x-ibm-connection-id'] = connId || undefined;
                if (connId && Array.isArray(connectionsList) && connectionsList.length > 0) {
                    var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
                    if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
                        var paramName = (document.getElementById('api-key-param-name') && document.getElementById('api-key-param-name').value) || 'apiKey';
                        paramName = (paramName || 'apiKey').trim() || 'apiKey';
                        currentJson['x-ibm-security'] = conn.security.map(function(s) {
                            if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                            return s;
                        });
                    }
                }
            } else {
                currentJson.name = document.getElementById('name').value;
                currentJson.display_name = document.getElementById('name').value;
                currentJson.description = document.getElementById('description').value;
            }
            currentJson.permission = document.getElementById('permission').value;
            currentJson.restrictions = document.getElementById('restrictions').value;
            const tagsVal = document.getElementById('tags').value;
            currentJson.tags = tagsVal ? tagsVal.split(',').map(t => t.trim()) : null;
            const serverInputs = document.querySelectorAll('.server-url');
            serverInputs.forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                if (currentJson.servers && currentJson.servers[idx]) {
                    if (typeof currentJson.servers[idx] === 'string') currentJson.servers[idx] = inp.value;
                    else currentJson.servers[idx].url = inp.value;
                }
            });
            applyParamEditsToJson(currentJson);
            var updated = JSON.stringify(currentJson, null, 2);
            if (typeof setJsonEditorValue === 'function') setJsonEditorValue(updated); else { var je = document.getElementById('json-editor'); if (je) je.value = updated; }
        } catch(e) {}
    } else if (tabName === 'form') {
        try { syncForm(JSON.parse(typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value) || '{}')); } catch(e) {}
    } else if (tabName === 'test') {
        try { detectLocalEndpoints(JSON.parse(typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value) || '{}')); } catch(e) {}
        var gb = document.getElementById('generate-btn');
        if (gb) { var lu = document.getElementById('local-url'); if (lu && (lu.value || '').trim()) gb.disabled = false; }
    }
}

function createParamRow(format, attrs) {
    attrs = attrs || {};
    var name = escapeAttr(attrs.name || '');
    var inVal = attrs.in || 'query';
    var typeVal = attrs.type || 'string';
    var required = attrs.required ? ' checked' : '';
    var defVal = escapeAttr(attrs.default !== undefined && attrs.default !== null ? String(attrs.default) : '');
    var desc = escapeAttr(attrs.description || '');
    var inOpts = '<option value="query"' + (inVal === 'query' ? ' selected' : '') + '>query</option><option value="header"' + (inVal === 'header' ? ' selected' : '') + '>header</option><option value="path"' + (inVal === 'path' ? ' selected' : '') + '>path</option>';
    var typeOpts = '<option value="string"' + (typeVal === 'string' ? ' selected' : '') + '>string</option><option value="integer"' + (typeVal === 'integer' ? ' selected' : '') + '>integer</option><option value="number"' + (typeVal === 'number' ? ' selected' : '') + '>number</option><option value="boolean"' + (typeVal === 'boolean' ? ' selected' : '') + '>boolean</option>';
    var pathsCls = format === 'paths' ? ' paths' : '';
    return '<tr class="param-row" style="border-bottom:1px solid var(--vscode-widget-border);">' +
        '<td style="padding:4px;"><input type="text" class="param-name' + pathsCls + '" value="' + name + '" placeholder="paramName" style="width:100%; padding:4px; font-size:0.9em;"></td>' +
        '<td style="padding:4px;"><select class="param-in' + pathsCls + '" style="width:100%; padding:4px;">' + inOpts + '</select></td>' +
        '<td style="padding:4px;"><select class="param-type' + pathsCls + '" style="width:100%; padding:4px;">' + typeOpts + '</select></td>' +
        '<td style="padding:4px;"><input type="checkbox" class="param-required' + pathsCls + '"' + required + ' title="Required"></td>' +
        '<td style="padding:4px;"><input type="text" class="param-default' + pathsCls + '" value="' + defVal + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>' +
        '<td style="padding:4px;"><input type="text" class="param-desc' + pathsCls + '" value="' + desc + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>' +
        '<td style="padding:4px;"><button type="button" class="param-delete secondary" style="padding:2px 8px; font-size:0.85em;" title="Delete">Delete</button></td></tr>';
}

function createPythonParamRow(attrs) {
    attrs = attrs || {};
    var name = escapeAttr(attrs.name || '');
    var typeVal = attrs.type || 'string';
    var required = attrs.required ? ' checked' : '';
    var desc = escapeAttr(attrs.description || '');
    var typeOpts = '<option value="string"' + (typeVal === 'string' ? ' selected' : '') + '>string</option><option value="integer"' + (typeVal === 'integer' ? ' selected' : '') + '>integer</option><option value="number"' + (typeVal === 'number' ? ' selected' : '') + '>number</option><option value="boolean"' + (typeVal === 'boolean' ? ' selected' : '') + '>boolean</option><option value="object"' + (typeVal === 'object' ? ' selected' : '') + '>object</option><option value="array"' + (typeVal === 'array' ? ' selected' : '') + '>array</option>';
    return '<tr class="param-row python-param-row" style="border-bottom:1px solid var(--vscode-widget-border);">' +
        '<td style="padding:4px;"><input type="text" class="python-param-name" value="' + name + '" placeholder="e.g. query" style="width:100%; padding:4px; font-size:0.9em;"></td>' +
        '<td style="padding:4px;"><select class="python-param-type" style="width:100%; padding:4px;">' + typeOpts + '</select></td>' +
        '<td style="padding:4px;"><input type="text" class="python-param-desc" value="' + desc + '" placeholder="optional" style="width:100%; padding:4px; font-size:0.9em;"></td>' +
        '<td style="padding:4px;"><input type="checkbox" class="python-param-required"' + required + ' title="Required"></td>' +
        '<td style="padding:4px;"><button type="button" class="param-delete secondary" style="padding:2px 8px; font-size:0.85em;" title="Delete">Delete</button></td></tr>';
}

function buildPythonInputSchemaFromTable() {
    var tbl = document.getElementById('python-params-table');
    if (!tbl) return { type: 'object', properties: {}, required: [] };
    var rows = tbl.querySelectorAll('tr.python-param-row');
    var properties = {};
    var required = [];
    rows.forEach(function(row) {
        var nameInp = row.querySelector('.python-param-name');
        var typeSel = row.querySelector('.python-param-type');
        var descInp = row.querySelector('.python-param-desc');
        var reqCb = row.querySelector('.python-param-required');
        var name = (nameInp && nameInp.value || '').trim();
        if (!name) return;
        properties[name] = {
            type: (typeSel && typeSel.value) || 'string',
            description: (descInp && descInp.value || '').trim() || undefined
        };
        if (reqCb && reqCb.checked) required.push(name);
    });
    return { type: 'object', properties: properties, required: required };
}

function populatePythonParamsTable(inputSchema) {
    var tbl = document.getElementById('python-params-table');
    if (!tbl) return;
    var rows = tbl.querySelectorAll('tr.python-param-row');
    rows.forEach(function(r) { r.remove(); });
    if (!inputSchema || !inputSchema.properties) return;
    var required = inputSchema.required || [];
    Object.keys(inputSchema.properties).forEach(function(key) {
        var p = inputSchema.properties[key];
        tbl.insertAdjacentHTML('beforeend', createPythonParamRow({
            name: key,
            type: p.type || 'string',
            description: p.description || '',
            required: required.indexOf(key) >= 0
        }));
    });
}

function populatePythonParamsTableEdit(inputSchema) {
    var tbl = document.getElementById('python-edit-params-table');
    if (!tbl) return;
    var rows = tbl.querySelectorAll('tr.python-param-row');
    rows.forEach(function(r) { r.remove(); });
    if (!inputSchema || !inputSchema.properties) return;
    var required = inputSchema.required || [];
    Object.keys(inputSchema.properties).forEach(function(key) {
        var p = inputSchema.properties[key];
        tbl.insertAdjacentHTML('beforeend', createPythonParamRow({
            name: key,
            type: p.type || 'string',
            description: p.description || '',
            required: required.indexOf(key) >= 0
        }));
    });
}

function buildPythonInputSchemaFromTableEdit() {
    var tbl = document.getElementById('python-edit-params-table');
    if (!tbl) return { type: 'object', properties: {}, required: [] };
    var rows = tbl.querySelectorAll('tr.python-param-row');
    var properties = {};
    var required = [];
    rows.forEach(function(row) {
        var nameInp = row.querySelector('.python-param-name');
        var typeSel = row.querySelector('.python-param-type');
        var descInp = row.querySelector('.python-param-desc');
        var reqCb = row.querySelector('.python-param-required');
        var name = (nameInp && nameInp.value || '').trim();
        if (!name) return;
        properties[name] = {
            type: (typeSel && typeSel.value) || 'string',
            description: (descInp && descInp.value || '').trim() || undefined
        };
        if (reqCb && reqCb.checked) required.push(name);
    });
    return { type: 'object', properties: properties, required: required };
}

function initEventListeners() {
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('param-delete')) {
            var row = e.target.closest('tr.param-row');
            if (row) row.remove();
        } else if (e.target.classList.contains('param-add')) {
            var btn = e.target;
            var tbl = btn.previousElementSibling;
            if (tbl && tbl.tagName === 'TABLE' && tbl.getAttribute('data-params-format')) {
                tbl.insertAdjacentHTML('beforeend', createParamRow(btn.dataset.format || 'schema', {}));
            }
        } else if (e.target.classList.contains('param-add-python')) {
            var btn = e.target;
            var tbl = document.getElementById('python-params-table');
            if (tbl) tbl.insertAdjacentHTML('beforeend', createPythonParamRow({}));
        } else if (e.target.classList.contains('param-add-python-edit')) {
            var tbl = document.getElementById('python-edit-params-table');
            if (tbl) tbl.insertAdjacentHTML('beforeend', createPythonParamRow({}));
        }
    });
    const genBtn = document.getElementById('generate-btn');
    if (genBtn) {
        genBtn.addEventListener('click', () => {
            var url = document.getElementById('local-url').value;
            var method = (document.getElementById('local-method').value || 'GET').trim().toUpperCase();
            var params = {};
            var pv = (document.getElementById('test-params').value || '').trim();
            if (pv) try { params = JSON.parse(pv); } catch (_) {}
            var apiKeyParamName = (document.getElementById('api-key-param-name') && document.getElementById('api-key-param-name').value || 'apiKey').trim() || 'apiKey';
            if (lastTestResult && lastTestResult.data != null) {
                vscode.postMessage({ command: 'generateOaS', url, method, params: lastTestResult.params || params, responseBody: lastTestResult.data, apiKeyParamName: apiKeyParamName });
            } else {
                vscode.postMessage({ command: 'fetchAndGenerate', url, method, params, apiKeyParamName: apiKeyParamName });
            }
        });
        var urlInput = document.getElementById('local-url');
        if (urlInput) {
            urlInput.addEventListener('input', function() { if (genBtn) genBtn.disabled = !(this.value || '').trim(); });
            if ((urlInput.value || '').trim()) genBtn.disabled = false;
        }
    }
    var saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        try {
            var jsonStr = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
            const currentJson = JSON.parse(jsonStr);
            if (mode === 'create') {
                if (!currentJson.info) currentJson.info = {};
                currentJson.info.title = document.getElementById('name').value;
                currentJson.info.description = document.getElementById('description').value;
                currentJson.info.version = document.getElementById('version').value;
                const skillName = document.getElementById('skill-name').value;
                const skillId = document.getElementById('skill-id').value;
                if (skillName) currentJson.info['x-ibm-skill-name'] = skillName;
                if (skillId) currentJson.info['x-ibm-skill-id'] = skillId;
            } else {
                currentJson.name = document.getElementById('name').value;
                currentJson.display_name = document.getElementById('name').value;
                currentJson.description = document.getElementById('description').value;
                var connSel = document.getElementById('connection-id');
                var apiKeyParamEl = document.getElementById('api-key-param-name');
                if (connSel || apiKeyParamEl) {
                    if (!currentJson.binding) currentJson.binding = {};
                    if (!currentJson.binding.openapi) currentJson.binding.openapi = {};
                    var paramName = (apiKeyParamEl && apiKeyParamEl.value || 'apiKey').trim() || 'apiKey';
                    if (connSel) {
                        var connId = connSel.value || null;
                        currentJson.binding.openapi.connection_id = connId;
                        if (connId && Array.isArray(connectionsList) && connectionsList.length > 0) {
                            var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
                            if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
                                currentJson.binding.openapi.security = conn.security.map(function(s) {
                                    if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                                    return s;
                                });
                            }
                        }
                    } else if (apiKeyParamEl && Array.isArray(currentJson.binding.openapi.security) && currentJson.binding.openapi.security.length > 0) {
                        currentJson.binding.openapi.security = currentJson.binding.openapi.security.map(function(s) {
                            if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                            return s;
                        });
                    }
                }
            }
            currentJson.permission = document.getElementById('permission').value;
            currentJson.restrictions = document.getElementById('restrictions').value;
            const tagsVal = document.getElementById('tags').value;
            currentJson.tags = tagsVal ? tagsVal.split(',').map(t => t.trim()) : null;
            const serverInputs = document.querySelectorAll('.server-url');
            serverInputs.forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                if (currentJson.servers && currentJson.servers[idx]) {
                    if (typeof currentJson.servers[idx] === 'string') currentJson.servers[idx] = inp.value;
                    else currentJson.servers[idx].url = inp.value;
                }
            });
            applyParamEditsToJson(currentJson);
            if (mode === 'create') {
                var autoCreateCb = document.getElementById('auto-create-connection-cb');
                var autoUrlEl = document.getElementById('auto-connection-url');
                var useAutoCreate = autoCreateCb && autoCreateCb.checked && autoUrlEl && (autoUrlEl.value || '').trim();
                if (useAutoCreate) {
                    vscode.postMessage({ command: 'createToolWithAutoConnection', content: currentJson, autoConnectionUrl: (autoUrlEl.value || '').trim() });
                    return;
                }
                var connSel = document.getElementById('connection-id');
                var connId = connSel ? connSel.value : '';
                currentJson['x-ibm-connection-id'] = connId ? connId : undefined;
                if (connId && Array.isArray(connectionsList) && connectionsList.length > 0) {
                    var conn = connectionsList.find(function(c) { return (c.connection_id || c.app_id) === connId; });
                    if (conn && Array.isArray(conn.security) && conn.security.length > 0) {
                        var paramName = (document.getElementById('api-key-param-name') && document.getElementById('api-key-param-name').value) || 'apiKey';
                        paramName = (paramName || 'apiKey').trim() || 'apiKey';
                        currentJson['x-ibm-security'] = conn.security.map(function(s) {
                            if (s && s.type === 'apiKey') return { type: 'apiKey', in: s.in || 'query', name: paramName };
                            return s;
                        });
                    }
                }
            }
            vscode.postMessage({ command: mode === 'create' ? 'createTool' : 'saveSkill', content: currentJson });
        } catch(e) { vscode.postMessage({ command: 'error', message: 'Invalid JSON content' }); }
    });
    const paramsFromUrlBtn = document.getElementById('params-from-url-btn');
    if (paramsFromUrlBtn) paramsFromUrlBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('local-url');
        const urlStr = (urlInput && urlInput.value || '').trim();
        if (!urlStr) { vscode.postMessage({ command: 'error', message: 'URL is empty. Enter a URL first.' }); return; }
        try {
            const u = new URL(urlStr);
            const params = {};
            u.searchParams.forEach((val, key) => { params[key] = val; });
            if (Object.keys(params).length === 0) { vscode.postMessage({ command: 'error', message: 'No query parameters in URL.' }); return; }
            document.getElementById('test-params').value = JSON.stringify(params, null, 2);
            urlInput.value = u.origin + u.pathname;
        } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid URL: ' + (e.message || e) }); }
    });
    const delBtn = document.getElementById('delete-btn');
    if (delBtn) delBtn.addEventListener('click', () => vscode.postMessage({ command: 'deleteSkill' }));
    var cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => vscode.postMessage({ command: 'close' }));
    document.getElementById('run-test-btn').addEventListener('click', () => {
        const paramsStr = (document.getElementById('test-params').value || '').trim();
        let params = {};
        if (paramsStr) {
            try { params = JSON.parse(paramsStr); } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid JSON in Parameters field' }); return; }
        }
        const url = document.getElementById('local-url').value.trim();
        const method = (document.getElementById('local-method').value || 'GET').trim().toUpperCase();
        if (!url) { vscode.postMessage({ command: 'error', message: 'URL is empty. Cannot run test.' }); return; }
        const auth = getAuthHeaders();
        lastTestRequest = { method, params, authHeaders: auth.headers, authQueryParams: auth.queryParams };
        document.getElementById('test-response').innerText = '⏳ Running...';
        vscode.postMessage({ command: 'testLocal', url, method, params, authHeaders: auth.headers, authQueryParams: auth.queryParams });
    });
    const copyCurlBtn = document.getElementById('copy-curl-btn');
    if (copyCurlBtn) copyCurlBtn.addEventListener('click', () => {
        if (!lastTestRequest || !lastTestRequest.requestUrl) {
            vscode.postMessage({ command: 'error', message: 'Run a local test first to copy as cURL.' });
            return;
        }
        const method = (lastTestRequest.method || 'GET').toUpperCase();
        let curl = "curl -X " + method + " '" + lastTestRequest.requestUrl.replace(/'/g, "'\\''") + "'";
        if (lastTestRequest.authHeaders && Object.keys(lastTestRequest.authHeaders).length > 0) {
            Object.keys(lastTestRequest.authHeaders).forEach(function(k) {
                curl += " -H '" + k + ": " + String(lastTestRequest.authHeaders[k]).replace(/'/g, "'\\''") + "'";
            });
        }
        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && lastTestRequest.params && Object.keys(lastTestRequest.params).length > 0) {
            curl += " -H 'Content-Type: application/json' -d '" + JSON.stringify(lastTestRequest.params).replace(/'/g, "'\\''") + "'";
        }
        vscode.postMessage({ command: 'copyToClipboard', text: curl });
    });
    const exportOpenapiBtn = document.getElementById('export-openapi-btn');
    if (exportOpenapiBtn) exportOpenapiBtn.addEventListener('click', () => {
        try {
            const jsonStr = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
            const content = JSON.parse(jsonStr);
            vscode.postMessage({ command: 'exportOpenAPI', content: content });
        } catch (e) {
            vscode.postMessage({ command: 'error', message: 'Invalid JSON. Fix errors before exporting.' });
        }
    });
    const viewDiffBtn = document.getElementById('view-diff-btn');
    if (viewDiffBtn) viewDiffBtn.addEventListener('click', () => {
        var getVal = typeof getJsonEditorValue === 'function' ? getJsonEditorValue : function() { var e = document.getElementById('json-editor'); return e ? e.value : '{}'; };
        var orig = originalOasJson || getVal();
        var curr = getVal();
        vscode.postMessage({ command: 'viewDiff', original: orig, current: curr });
    });
    const validateBtn = document.getElementById('validate-btn');
    if (validateBtn) validateBtn.addEventListener('click', () => {
        try {
            var jsonStr = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value)) || '{}';
            var content = JSON.parse(jsonStr);
            vscode.postMessage({ command: 'validateOpenAPI', content: content });
        } catch (e) {
            var errDiv = document.getElementById('validation-errors');
            if (errDiv) {
                errDiv.style.display = 'block';
                errDiv.style.background = 'var(--vscode-inputValidation-errorBackground)';
                errDiv.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
                errDiv.innerHTML = '<strong>Invalid JSON:</strong> ' + String(e.message || e).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        }
    });
    document.getElementById('run-remote-btn').addEventListener('click', () => {
        const paramsStr = (document.getElementById('test-params').value || '').trim();
        let params = {};
        if (paramsStr) {
            try { params = JSON.parse(paramsStr); } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid JSON in Parameters field' }); return; }
        }
        document.getElementById('test-response').innerText = '⏳ Running via Watson Orchestrate cloud...';
        vscode.postMessage({ command: 'testRemote', params });
    });
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'testResult':
                const res = message.result;
                if (lastTestRequest && res && res.requestUrl) {
                    lastTestRequest.requestUrl = res.requestUrl;
                }
                let display = '';
                if (res.error) display = '❌ Error: ' + res.error;
                else {
                    display = 'HTTP ' + res.status + ' ' + (res.statusText || '') + '\n';
                    if (res.requestUrl) display += '→ ' + res.requestUrl + '\n';
                    display += '\n' + (typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
                }
                document.getElementById('test-response').innerText = display;
                if (res && res.status === 200 && document.getElementById('generate-btn')) {
                    document.getElementById('generate-btn').disabled = false;
                    var pv = (document.getElementById('test-params').value || '').trim();
                    var runParams = {};
                    if (pv) try { runParams = JSON.parse(pv); } catch (_) {}
                    lastTestResult = { data: res.data, params: runParams };
                }
                break;
            case 'testRemoteResult':
                var rr = message.result;
                var rdisplay;
                if (rr.error) {
                    rdisplay = '❌ ' + rr.error;
                } else {
                    var parts = ['☁️ WxO Remote'];
                    if (rr.reasoning && rr.reasoning.trim()) {
                        parts.push('\n\n🧠 Reasoning / Response:\n' + rr.reasoning);
                    }
                    var dataStr = rr.data;
                    if (dataStr === undefined || dataStr === null) {
                        dataStr = '(No output)';
                    } else if (typeof dataStr !== 'string') {
                        dataStr = JSON.stringify(dataStr, null, 2);
                    }
                    parts.push('\n\n📋 Result:\n' + dataStr);
                    rdisplay = parts.join('');
                }
                document.getElementById('test-response').innerText = rdisplay;
                break;
            case 'updateJson':
                var upd = JSON.stringify(message.content, null, 2);
                if (typeof setJsonEditorValue === 'function') setJsonEditorValue(upd); else { var uj = document.getElementById('json-editor'); if (uj) uj.value = upd; }
                syncForm(message.content);
                openTab('form');
                break;
            case 'validationResult':
                var errDiv = document.getElementById('validation-errors');
                if (errDiv) {
                    if (message.errors && message.errors.length > 0) {
                        errDiv.style.display = 'block';
                        errDiv.style.background = 'var(--vscode-inputValidation-errorBackground)';
                        errDiv.style.borderColor = 'var(--vscode-inputValidation-errorBorder)';
                        errDiv.innerHTML = '<strong>Validation errors:</strong><ul style="margin:4px 0 0 16px;">' + message.errors.map(function(e) { return '<li>' + String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</li>'; }).join('') + '</ul>';
                    } else {
                        errDiv.style.display = 'block';
                        errDiv.style.background = 'var(--vscode-inputValidation-infoBackground, rgba(0,122,204,0.1))';
                        errDiv.style.borderColor = 'var(--vscode-inputValidation-infoBorder, #007acc)';
                        errDiv.innerHTML = '<strong>✓ Validation passed.</strong> OpenAPI structure is valid.';
                    }
                }
                break;
            case 'loadPythonFileResult':
                var codeEl = document.getElementById('python-code');
                var fnEl = document.getElementById('python-filename');
                if (message.content && codeEl) codeEl.value = message.content;
                if (message.filename && fnEl) fnEl.value = message.filename;
                break;
            case 'loadPythonSample':
                var cEl = document.getElementById('python-code');
                var fEl = document.getElementById('python-filename');
                var rEl = document.getElementById('python-requirements');
                var nEl = document.getElementById('python-tool-name');
                var dEl = document.getElementById('python-display-name');
                var descEl = document.getElementById('python-description');
                var funcEl = document.getElementById('python-function');
                if (message.content && cEl) cEl.value = message.content;
                if (message.filename && fEl) fEl.value = message.filename;
                if (message.requirements && rEl) rEl.value = message.requirements;
                if (message.name && nEl) nEl.value = message.name;
                if (message.displayName && dEl) dEl.value = message.displayName;
                if (message.description && descEl) descEl.value = message.description;
                if (message.function && funcEl) funcEl.value = message.function;
                break;
            case 'loadPythonSpecResult':
                var specC = document.getElementById('python-code');
                var specF = document.getElementById('python-filename');
                var specR = document.getElementById('python-requirements');
                var specN = document.getElementById('python-tool-name');
                var specD = document.getElementById('python-display-name');
                var specDesc = document.getElementById('python-description');
                var specFunc = document.getElementById('python-function');
                var specInput = document.getElementById('python-input-schema');
                var specOutput = document.getElementById('python-output-schema');
                var specOutputType = document.getElementById('python-output-type');
                if (message.content && specC) specC.value = message.content;
                if (message.filename && specF) specF.value = message.filename;
                if (message.requirements && specR) specR.value = message.requirements;
                if (message.name && specN) specN.value = message.name;
                if (message.displayName && specD) specD.value = message.displayName;
                if (message.description && specDesc) specDesc.value = message.description;
                if (message.function && specFunc) specFunc.value = message.function;
                var inputSchemaObj = message.input_schema;
                if (typeof inputSchemaObj === 'string') try { inputSchemaObj = JSON.parse(inputSchemaObj); } catch (_) { inputSchemaObj = null; }
                if (inputSchemaObj && specInput) specInput.value = JSON.stringify(inputSchemaObj, null, 2);
                if (inputSchemaObj && typeof populatePythonParamsTable === 'function') populatePythonParamsTable(inputSchemaObj);
                var outputSchemaObj = message.output_schema;
                if (typeof outputSchemaObj === 'string') try { outputSchemaObj = JSON.parse(outputSchemaObj); } catch (_) { outputSchemaObj = null; }
                if (outputSchemaObj && specOutput) specOutput.value = JSON.stringify(outputSchemaObj, null, 2);
                if (outputSchemaObj && specOutputType) {
                    if (outputSchemaObj.type === 'string' && outputSchemaObj.format === 'binary') specOutputType.value = 'string-binary';
                    else if (outputSchemaObj.type === 'string') specOutputType.value = 'string';
                    else specOutputType.value = 'object';
                }
                break;
            case 'setPythonCode':
                var codeE = document.getElementById('python-edit-code');
                var reqE = document.getElementById('python-edit-requirements');
                if (codeE && message.pythonCode !== undefined) codeE.value = message.pythonCode;
                if (reqE && message.requirements !== undefined) reqE.value = message.requirements;
                break;
            case 'setJsonEditorValue':
                if (message.value !== undefined && typeof setJsonEditorValue === 'function') setJsonEditorValue(message.value);
                break;
        }
    });
}

// Python tool handlers (create mode)
var loadPythonBtn = document.getElementById('python-load-file-btn');
var loadSampleBtn = document.getElementById('python-load-sample-btn');
var loadSpecBtn = document.getElementById('python-load-spec-btn');
var deployPythonBtn = document.getElementById('python-deploy-btn');
if (loadSpecBtn) {
    loadSpecBtn.addEventListener('click', function() {
        vscode.postMessage({ command: 'requestLoadPythonSpec' });
    });
}
if (loadPythonBtn) {
    loadPythonBtn.addEventListener('click', function() {
        vscode.postMessage({ command: 'requestLoadPythonFile' });
    });
}
if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', function() {
        vscode.postMessage({ command: 'requestLoadSamplePython' });
    });
}
if (deployPythonBtn) {
    deployPythonBtn.addEventListener('click', function() {
        var name = (document.getElementById('python-tool-name') && document.getElementById('python-tool-name').value || '').trim().replace(/[^a-zA-Z0-9_]/g, '_');
        var displayName = (document.getElementById('python-display-name') && document.getElementById('python-display-name').value || '').trim();
        var description = (document.getElementById('python-description') && document.getElementById('python-description').value || '').trim();
        var func = (document.getElementById('python-function') && document.getElementById('python-function').value || '').trim();
        var filename = (document.getElementById('python-filename') && document.getElementById('python-filename').value || 'tool.py').trim() || 'tool.py';
        var code = (document.getElementById('python-code') && document.getElementById('python-code').value || '').trim();
        var requirements = (document.getElementById('python-requirements') && document.getElementById('python-requirements').value || '').trim();
        var inputSchema = typeof buildPythonInputSchemaFromTable === 'function' ? buildPythonInputSchemaFromTable() : { type: 'object', properties: {}, required: [] };
        var tbl = document.getElementById('python-params-table');
        var hasTableRows = tbl && tbl.querySelectorAll('tr.python-param-row').length > 0;
        if (!hasTableRows) {
            var inputSchemaEl = document.getElementById('python-input-schema');
            var inputSchemaStr = (inputSchemaEl && inputSchemaEl.value || '').trim();
            if (inputSchemaStr) {
                try { inputSchema = JSON.parse(inputSchemaStr); } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid Input Schema JSON: ' + e.message }); return; }
            }
        }
        var outputTypeSel = document.getElementById('python-output-type');
        var outputType = (outputTypeSel && outputTypeSel.value) || 'object';
        var outputSchema = outputType === 'string-binary' ? { type: 'string', format: 'binary' } : outputType === 'string' ? { type: 'string' } : { type: 'object' };
        var outputSchemaEl = document.getElementById('python-output-schema');
        var outputSchemaStr = (outputSchemaEl && outputSchemaEl.value || '').trim();
        if (outputSchemaStr) {
            try { outputSchema = JSON.parse(outputSchemaStr); } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid Output Schema JSON: ' + e.message }); return; }
        }
        if (!name || !func || !code) {
            vscode.postMessage({ command: 'error', message: 'Tool Name, Function (module:function), and Python Code are required.' });
            return;
        }
        if (func.indexOf(':') === -1) {
            vscode.postMessage({ command: 'error', message: 'Function must use format module:function (e.g. tool:get_asia_time)' });
            return;
        }
        vscode.postMessage({ command: 'deployPythonTool', content: { name, display_name: displayName || name, description: description || 'Python tool', function: func, filename, pythonCode: code, requirements, input_schema: inputSchema, output_schema: outputSchema } });
    });
}
var pythonSyncFromJsonBtn = document.getElementById('python-sync-params-from-json');
if (pythonSyncFromJsonBtn) {
    pythonSyncFromJsonBtn.addEventListener('click', function() {
        var el = document.getElementById('python-input-schema');
        var str = (el && el.value || '').trim();
        if (!str) return;
        try {
            var schema = JSON.parse(str);
            if (typeof populatePythonParamsTable === 'function') populatePythonParamsTable(schema);
        } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid JSON: ' + e.message }); }
    });
}
var pythonOutputTypeSel = document.getElementById('python-output-type');
if (pythonOutputTypeSel) {
    pythonOutputTypeSel.addEventListener('change', function() {
        var el = document.getElementById('python-output-schema');
        if (!el) return;
        var v = this.value || 'object';
        var schema = v === 'string-binary' ? { type: 'string', format: 'binary' } : v === 'string' ? { type: 'string' } : { type: 'object' };
        el.value = JSON.stringify(schema, null, 2);
    });
}
var pythonEditSyncFromJsonBtn = document.getElementById('python-edit-sync-params-from-json');
if (pythonEditSyncFromJsonBtn) {
    pythonEditSyncFromJsonBtn.addEventListener('click', function() {
        var el = document.getElementById('python-edit-input-schema');
        var str = (el && el.value || '').trim();
        if (!str) return;
        try {
            var schema = JSON.parse(str);
            if (typeof populatePythonParamsTableEdit === 'function') populatePythonParamsTableEdit(schema);
        } catch (e) { vscode.postMessage({ command: 'error', message: 'Invalid JSON: ' + e.message }); }
    });
}
var pythonEditOutputTypeSel = document.getElementById('python-edit-output-type');
if (pythonEditOutputTypeSel) {
    pythonEditOutputTypeSel.addEventListener('change', function() {
        var el = document.getElementById('python-edit-output-schema');
        if (!el) return;
        var v = this.value || 'object';
        var schema = v === 'string-binary' ? { type: 'string', format: 'binary' } : v === 'string' ? { type: 'string' } : { type: 'object' };
        el.value = JSON.stringify(schema, null, 2);
    });
}

// Python edit mode: Update Python Tool button
var pythonUpdateBtn = document.getElementById('python-update-btn');
if (pythonUpdateBtn) {
    pythonUpdateBtn.addEventListener('click', function() {
        var codeEl = document.getElementById('python-edit-code');
        var reqEl = document.getElementById('python-edit-requirements');
        var pythonCode = codeEl ? codeEl.value : '';
        var requirements = reqEl ? reqEl.value : '';
        var jsonVal = (typeof getJsonEditorValue === 'function' ? getJsonEditorValue() : (document.getElementById('json-editor') && document.getElementById('json-editor').value) || '{}');
        var toolSpec;
        try { toolSpec = JSON.parse(jsonVal); } catch(e) {
            vscode.postMessage({ command: 'error', message: 'Invalid tool JSON.' });
            return;
        }
        if (!toolSpec.binding || !toolSpec.binding.python) {
            vscode.postMessage({ command: 'error', message: 'Tool must have binding.python.' });
            return;
        }
        var tbl = document.getElementById('python-edit-params-table');
        var hasEditRows = tbl && tbl.querySelectorAll('tr.python-param-row').length > 0;
        var inputSchema = typeof buildPythonInputSchemaFromTableEdit === 'function' ? buildPythonInputSchemaFromTableEdit() : { type: 'object', properties: {}, required: [] };
        if (!hasEditRows) {
            var editInputEl = document.getElementById('python-edit-input-schema');
            var editInputStr = (editInputEl && editInputEl.value || '').trim();
            if (editInputStr) {
                try { inputSchema = JSON.parse(editInputStr); } catch(e) { vscode.postMessage({ command: 'error', message: 'Invalid Input Schema JSON: ' + e.message }); return; }
            }
        }
        toolSpec.input_schema = inputSchema;
        var editOutputTypeSel = document.getElementById('python-edit-output-type');
        var editOutputEl = document.getElementById('python-edit-output-schema');
        var editOutputStr = (editOutputEl && editOutputEl.value || '').trim();
        var outputSchema = (editOutputTypeSel && editOutputTypeSel.value) === 'string-binary' ? { type: 'string', format: 'binary' } : (editOutputTypeSel && editOutputTypeSel.value) === 'string' ? { type: 'string' } : { type: 'object' };
        if (editOutputStr) { try { outputSchema = JSON.parse(editOutputStr); } catch(e) { vscode.postMessage({ command: 'error', message: 'Invalid Output Schema JSON: ' + e.message }); return; } }
        toolSpec.output_schema = outputSchema;
        var fn = toolSpec.binding.python.function || '';
        var pyFileName = 'tool.py';
        if (fn && fn.indexOf(':') >= 0) { pyFileName = fn.split(':')[0].trim() + '.py'; }
        vscode.postMessage({ command: 'updatePythonTool', content: { toolSpec, pythonCode, requirements, pythonFileName: pyFileName } });
    });
}

// Python edit: Open in Editor, Load from File, Download, Apply from Editor
var pythonOpenEditorBtn = document.getElementById('python-open-editor-btn');
var pythonLoadFileEditBtn = document.getElementById('python-load-file-btn-edit');
var pythonDownloadBtn = document.getElementById('python-download-btn');
var pythonApplyEditorBtn = document.getElementById('python-apply-editor-btn');
if (pythonOpenEditorBtn) {
    pythonOpenEditorBtn.addEventListener('click', function() {
        var codeEl = document.getElementById('python-edit-code');
        vscode.postMessage({ command: 'requestOpenPythonInEditor', pythonCode: codeEl ? codeEl.value : '' });
    });
}
if (pythonLoadFileEditBtn) {
    pythonLoadFileEditBtn.addEventListener('click', function() {
        vscode.postMessage({ command: 'requestLoadPythonFileEdit' });
    });
}
if (pythonDownloadBtn) {
    pythonDownloadBtn.addEventListener('click', function() {
        var codeEl = document.getElementById('python-edit-code');
        var reqEl = document.getElementById('python-edit-requirements');
        vscode.postMessage({ command: 'requestDownloadPython', pythonCode: codeEl ? codeEl.value : '', requirements: reqEl ? reqEl.value : '' });
    });
}
if (pythonApplyEditorBtn) {
    pythonApplyEditorBtn.addEventListener('click', function() {
        vscode.postMessage({ command: 'requestApplyFromEditor' });
    });
}

// Expose functions for inline onclick handlers (template button, import button, auth toggle)
window.loadSelectedTemplate = loadSelectedTemplate;
window.requestImport = requestImport;
window.toggleAuthVisibility = toggleAuthVisibility;
window.switchToolType = function(type) {
    var openapiArea = document.getElementById('openapi-create-area');
    var pythonArea = document.getElementById('python-create-area');
    var saveBtn = document.getElementById('save-btn');
    var tabs = document.querySelectorAll('.tool-type-tabs .tab');
    if (tabs) tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.toolType === type); });
    if (type === 'openapi') {
        if (openapiArea) openapiArea.style.display = 'flex';
        if (pythonArea) pythonArea.style.display = 'none';
        if (saveBtn) saveBtn.style.display = '';
    } else {
        if (openapiArea) openapiArea.style.display = 'none';
        if (pythonArea) pythonArea.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'none';
    }
};

})();
