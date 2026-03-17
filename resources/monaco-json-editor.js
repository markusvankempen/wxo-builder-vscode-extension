/**
 * Monaco-based JSON editor for webview panels.
 * Provides syntax highlighting, formatting, and validation.
 */
(function() {
'use strict';

let _monacoEditor = null;
let _jsonEditorValue = '';
let _containerId = null;
let _monacoLoading = false;
let _monacoReady = false;

function getJsonEditorValue() {
    if (_monacoEditor) {
        return _monacoEditor.getValue();
    }
    return _jsonEditorValue;
}

function setJsonEditorValue(val) {
    _jsonEditorValue = String(val || '');
    if (_monacoEditor) {
        _monacoEditor.setValue(_jsonEditorValue);
    }
}

function formatJsonEditor() {
    if (!_monacoEditor) return;
    try {
        const model = _monacoEditor.getModel();
        if (model) {
            const fullRange = model.getFullModelRange();
            const text = model.getValue();
            const parsed = JSON.parse(text);
            const formatted = JSON.stringify(parsed, null, 2);
            _monacoEditor.executeEdits('format', [{ range: fullRange, text: formatted }]);
        }
    } catch (e) {
        if (typeof window !== 'undefined' && window.alert) {
            window.alert('Invalid JSON: ' + (e.message || e));
        }
    }
}

function initJsonEditor(containerId, initialValue) {
    _containerId = containerId;
    _jsonEditorValue = String(initialValue || '');
    if (_monacoEditor) {
        _monacoEditor.setValue(_jsonEditorValue);
        _monacoEditor.layout();
        return;
    }
    if (_monacoLoading) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    _monacoLoading = true;

    const loaderUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js';
    const script = document.createElement('script');
    script.src = loaderUrl;
    script.onload = function() {
        const monacoLoader = window.require;
        if (!monacoLoader) { _monacoLoading = false; return; }
        monacoLoader.config({
            paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' },
            'vs/nls': { availableLanguages: {} }
        });
        monacoLoader(['vs/editor/editor.main'], function() {
            try {
                var isDark = false;
                try {
                    var style = getComputedStyle(document.documentElement);
                    var bg = style.getPropertyValue('--vscode-editor-background') || style.getPropertyValue('--vscode-editorWidget-background') || '';
                    if (bg) {
                        var m = bg.trim().match(/^#([0-9a-fA-F]{6})$/);
                        if (m) isDark = parseInt(m[1], 16) < 0x808080;
                        else if (bg.indexOf('rgb') === 0) {
                            var parts = bg.match(/\d+/g);
                            if (parts && parts.length >= 3) {
                                var luminance = (parseInt(parts[0]) * 299 + parseInt(parts[1]) * 587 + parseInt(parts[2]) * 114) / 1000;
                                isDark = luminance < 128;
                            }
                        }
                    }
                    if (!isDark) isDark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
                } catch (_) {}
                _monacoEditor = monaco.editor.create(container, {
                    value: _jsonEditorValue,
                    language: 'json',
                    theme: isDark ? 'vs-dark' : 'vs',
                    automaticLayout: true,
                    formatOnPaste: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "var(--vscode-editor-font-family), 'Menlo', 'Monaco', 'Consolas', monospace",
                    tabSize: 2,
                    insertSpaces: true,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 8, bottom: 8 }
                });
                _monacoReady = true;
                _monacoLoading = false;
            } catch (e) {
                console.error('[Monaco JSON Editor] Init failed:', e);
                _monacoLoading = false;
            }
        });
    };
    script.onerror = function() { _monacoLoading = false; };
    document.head.appendChild(script);
}

window.getJsonEditorValue = getJsonEditorValue;
window.setJsonEditorValue = setJsonEditorValue;
window.formatJsonEditor = formatJsonEditor;
window.initJsonEditor = initJsonEditor;

})();
