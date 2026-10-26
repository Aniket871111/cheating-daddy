// renderer.js
const { ipcRenderer } = require('electron');

let mediaStream = null;
let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
let audioBuffer = [];
const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.1; // seconds
const BUFFER_SIZE = 4096; // Increased buffer size for smoother audio

let hiddenVideo = null;
let offscreenCanvas = null;
let offscreenContext = null;
let currentImageQuality = 'medium'; // Store current image quality for manual screenshots

const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';

const storage = {
    async getConfig() {
        const result = await ipcRenderer.invoke('storage:get-config');
        return result.success ? result.data : {};
    },
    async setConfig(config) {
        return ipcRenderer.invoke('storage:set-config', config);
    },
    async updateConfig(key, value) {
        return ipcRenderer.invoke('storage:update-config', key, value);
    },
    async getCredentials() {
        const result = await ipcRenderer.invoke('storage:get-credentials');
        return result.success ? result.data : {};
    },
    async setCredentials(credentials) {
        return ipcRenderer.invoke('storage:set-credentials', credentials);
    },
    async getApiKey() {
        const result = await ipcRenderer.invoke('storage:get-api-key');
        return result.success ? result.data : '';
    },
    async setApiKey(apiKey) {
        return ipcRenderer.invoke('storage:set-api-key', apiKey);
    },
    async getGroqApiKey() {
        const result = await ipcRenderer.invoke('storage:get-groq-api-key');
        return result.success ? result.data : '';
    },
    async setGroqApiKey(groqApiKey) {
        return ipcRenderer.invoke('storage:set-groq-api-key', groqApiKey);
    },
    async getPreferences() {
        const result = await ipcRenderer.invoke('storage:get-preferences');
        return result.success ? result.data : {};
    },
    async setPreferences(preferences) {
        return ipcRenderer.invoke('storage:set-preferences', preferences);
    },
    async updatePreference(key, value) {
        return ipcRenderer.invoke('storage:update-preference', key, value);
    },
    async getKeybinds() {
        const result = await ipcRenderer.invoke('storage:get-keybinds');
        return result.success ? result.data : null;
    },
    async setKeybinds(keybinds) {
        return ipcRenderer.invoke('storage:set-keybinds', keybinds);
    },
    async getAllSessions() {
        const result = await ipcRenderer.invoke('storage:get-all-sessions');
        return result.success ? result.data : [];
    },
    async getSession(sessionId) {
        const result = await ipcRenderer.invoke('storage:get-session', sessionId);
        return result.success ? result.data : null;
    },
    async saveSession(sessionId, data) {
        return ipcRenderer.invoke('storage:save-session', sessionId, data);
    },
    async deleteSession(sessionId) {
        return ipcRenderer.invoke('storage:delete-session', sessionId);
    },
    async deleteAllSessions() {
        return ipcRenderer.invoke('storage:delete-all-sessions');
    },
    async clearAll() {
        return ipcRenderer.invoke('storage:clear-all');
    },
    async getTodayLimits() {
        const result = await ipcRenderer.invoke('storage:get-today-limits');
        return result.success ? result.data : { flash: { count: 0 }, flashLite: { count: 0 } };
    },
};

async function initializeGemini(profile = 'interview', language = 'en-US') {
    const apiKey = await storage.getApiKey();
    if (apiKey) {
        const prefs = await storage.getPreferences();
        const success = await ipcRenderer.invoke('initialize-gemini', apiKey, prefs.customPrompt || '', profile, language);
        if (success) {
            cheatingDaddy.setStatus('Live');
        } else {
            cheatingDaddy.setStatus('error');
        }
    }
}

async function initializeLocal(profile = 'interview') {
    const prefs = await storage.getPreferences();
    const localLlmModel = prefs.localLlmModel || 'unsloth/Qwen3.5-4B-GGUF:Q4_K_M';
    const whisperModel = prefs.whisperModel || 'tiny.en';
    const customPrompt = prefs.customPrompt || '';

    const success = await ipcRenderer.invoke('initialize-local', localLlmModel, whisperModel, profile, customPrompt);
    if (success) {
        cheatingDaddy.setStatus('Local AI Live');
        return true;
    } else {
        cheatingDaddy.setStatus('error');
        return false;
    }
}

async function cancelLocalInitialization() {
    return ipcRenderer.invoke('cancel-local-initialization');
}

async function initializeCloud(profile = 'interview') {
    const creds = await storage.getCredentials();
    const token = creds.cloudToken;
    if (!token || !token.trim()) {
        cheatingDaddy.setStatus('error');
        return false;
    }

    const prefs = await storage.getPreferences();
    const success = await ipcRenderer.invoke('initialize-cloud', token, profile, prefs.customPrompt || '');
    if (success) {
        cheatingDaddy.setStatus('Live');
        return true;
    } else {
        cheatingDaddy.setStatus('error');
        return false;
    }
}

async function sendOpenAITextMessage(text, model = 'gpt-4o-mini') {
    if (!text || !text.trim()) {
        return { success: false, error: 'Empty message' };
    }
    try {
        const result = await window.secureOpenAI.chat({
            model,
            messages: [{ role: 'user', content: text.trim() }],
        });
        if (result.success && result.data?.text) {
            cheatingDaddy.addNewResponse(result.data.text);
        }
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
}

ipcRenderer.on('update-status', (event, status) => {
    console.log('Status update:', status);
    cheatingDaddy.setStatus(status);
});

async function sendTextMessage(text) {
    if (!text || text.trim().length === 0) {
        console.warn('Cannot send empty text message');
        return { success: false, error: 'Empty message' };
    }

    try {
        const result = await ipcRenderer.invoke('send-text-message', text);
        if (result.success) {
            console.log('Text message sent successfully');
        } else {
            console.error('Failed to send text message:', result.error);
        }
        return result;
    } catch (error) {
        console.error('Error sending text message:', error);
        return { success: false, error: error.message };
    }
}

const cheatingDaddy = {
    getVersion: async () => ipcRenderer.invoke('get-app-version'),
    element: () => document.querySelector('cheating-daddy-app'),
    e: () => document.querySelector('cheating-daddy-app'),
    getCurrentView: () => document.querySelector('cheating-daddy-app')?.currentView,
    getLayoutMode: () => document.querySelector('cheating-daddy-app')?.layoutMode,
    setStatus: text => document.querySelector('cheating-daddy-app')?.setStatus(text),
    addNewResponse: response => document.querySelector('cheating-daddy-app')?.addNewResponse(response),
    updateCurrentResponse: response => document.querySelector('cheating-daddy-app')?.updateCurrentResponse(response),
    initializeGemini,
    initializeCloud,
    initializeLocal,
    cancelLocalInitialization,
    sendTextMessage,
    sendOpenAITextMessage,
    handleShortcut: () => {},
    storage,
    theme: {
        load: async () => {},
        save: async () => {},
        apply: () => {},
    },
    refreshPreferencesCache: async () => {},
    isLinux,
    isMacOS,
};

window.cheatingDaddy = cheatingDaddy;
