const { ipcMain } = require('electron');

const ALLOWED_ROLES = ['system', 'user', 'assistant'];
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_MESSAGES = 50;
const MAX_CONTENT_CHARS = 100000;

let cachedClient = null;
let cachedKey = null;

// The API key is read from the environment in the main process only.
// It is never sent to the renderer.
function getClient() {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) return null;

    if (!cachedClient || cachedKey !== apiKey) {
        const OpenAI = require('openai');
        cachedClient = new OpenAI({ apiKey });
        cachedKey = apiKey;
    }
    return cachedClient;
}

function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return 'Invalid payload.';
    }

    const { messages, model } = payload;

    if (model !== undefined && (typeof model !== 'string' || model.trim() === '' || model.length > 100)) {
        return 'model must be a non-empty string.';
    }

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        return `messages must be an array with 1-${MAX_MESSAGES} items.`;
    }

    for (const msg of messages) {
        if (!msg || typeof msg !== 'object') return 'Invalid message object.';
        if (!ALLOWED_ROLES.includes(msg.role)) return `Invalid role: ${msg.role}`;
        if (typeof msg.content !== 'string' || msg.content.length > MAX_CONTENT_CHARS) {
            return 'Message content must be a string within the size limit.';
        }
    }

    return null;
}

function setupOpenAIIpcHandlers() {
    ipcMain.handle('openai:is-configured', async () => {
        return { success: true, data: !!(process.env.OPENAI_API_KEY || '').trim() };
    });

    ipcMain.handle('openai:chat', async (event, payload) => {
        try {
            const client = getClient();
            if (!client) {
                return { success: false, error: 'OPENAI_API_KEY is not set. Add it to your .env file and restart the app.' };
            }

            const validationError = validatePayload(payload);
            if (validationError) {
                return { success: false, error: validationError };
            }

            const model = payload.model || DEFAULT_MODEL;
            const completion = await client.chat.completions.create({
                model,
                messages: payload.messages,
                temperature: 0.7,
            });

            const text = completion.choices?.[0]?.message?.content ?? '';
            return { success: true, data: { text, model } };
        } catch (error) {
            console.error('OpenAI chat error:', error?.message || error);
            return { success: false, error: error?.message || 'OpenAI request failed.' };
        }
    });
}

module.exports = { setupOpenAIIpcHandlers };
