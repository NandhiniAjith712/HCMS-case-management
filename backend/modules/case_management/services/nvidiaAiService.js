/**
 * NVIDIA NIM / OpenAI-compatible API client (Node port of nvidia_setup.py).
 * Uses the same env vars as the Python setup; keep keys only in config.env.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../config.env') });

const OpenAI = require('openai');

class NvidiaAIConfig {
  constructor() {
    this.apiKey = (process.env.NVIDIA_API_KEY || '').trim();
    this.model = (process.env.NVIDIA_MODEL || '').trim();
    this.baseUrl = (
      process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
    ).trim();
    this.timeout = parseInt(process.env.NVIDIA_TIMEOUT || '120', 10);
    this.maxRetries = parseInt(process.env.NVIDIA_MAX_RETRIES || '2', 10);
    this.temperature = parseFloat(process.env.NVIDIA_TEMPERATURE || '0.2');
    this.maxTokens = parseInt(process.env.NVIDIA_MAX_TOKENS || '2048', 10);
    this.topP = parseFloat(process.env.NVIDIA_TOP_P || '0.9');
    this.defaultSystemPrompt =
      process.env.NVIDIA_DEFAULT_SYSTEM_PROMPT || 'You are a helpful AI assistant.';
  }

  validate() {
    if (!this.apiKey) {
      throw new Error('Missing NVIDIA_API_KEY in environment.');
    }
    if (!this.model) {
      throw new Error('Missing NVIDIA_MODEL in environment.');
    }
  }
}

class NvidiaAIClient {
  constructor(config) {
    this.config = config || new NvidiaAIConfig();
    this.config.validate();

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout * 1000,
      maxRetries: this.config.maxRetries
    });
  }

  /**
   * Generate a text embedding vector.
   * Uses NVIDIA_EMBEDDING_MODEL when provided; otherwise attempts NVIDIA_MODEL.
   *
   * @param {string} input
   * @param {{ model?: string }} [opts]
   * @returns {Promise<number[]>}
   */
  async embedding(input, opts = {}) {
    const text = String(input || '').trim();
    if (!text) {
      throw new Error('Embedding input must be non-empty text.');
    }

    const model =
      (opts.model || '').trim() ||
      (process.env.NVIDIA_EMBEDDING_MODEL || '').trim() ||
      this.config.model;

    const response = await this.client.embeddings.create({
      model,
      input: text
    });

    const vec = response?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error('Embedding API returned no vector.');
    }
    return vec.map((v) => Number(v));
  }

  /**
   * Simple text generation (system + single user message).
   * @param {string} userPrompt
   * @param {string} [systemPrompt]
   * @param {number} [temperature]
   * @param {number} [maxTokens]
   * @param {number} [topP]
   * @param {Record<string, unknown>} [extraBody] merged into the request body (vendor extras)
   * @returns {Promise<string>}
   */
  async chat(
    userPrompt,
    systemPrompt,
    temperature,
    maxTokens,
    topP,
    extraBody = {}
  ) {
    const messages = [
      { role: 'system', content: systemPrompt || this.config.defaultSystemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: temperature != null ? temperature : this.config.temperature,
      max_tokens: maxTokens != null ? maxTokens : this.config.maxTokens,
      top_p: topP != null ? topP : this.config.topP,
      ...extraBody
    });

    const text = response.choices[0]?.message?.content;
    return (text || '').trim();
  }

  /**
   * Multi-turn chat.
   * @param {Array<{ role: string, content: string | unknown }>} messages
   * @param {number} [temperature]
   * @param {number} [maxTokens]
   * @param {number} [topP]
   * @param {Record<string, unknown>} [extraBody]
   * @returns {Promise<string>}
   */
  async chatMessages(messages, temperature, maxTokens, topP, extraBody = {}) {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: temperature != null ? temperature : this.config.temperature,
      max_tokens: maxTokens != null ? maxTokens : this.config.maxTokens,
      top_p: topP != null ? topP : this.config.topP,
      ...extraBody
    });

    const text = response.choices[0]?.message?.content;
    return (text || '').trim();
  }

  /**
   * Ask for JSON-only output; parses and returns object.
   * Strips optional ```json fences``` if the model adds them.
   */
  async jsonResponse(userPrompt, systemPrompt, temperature = 0, maxTokens, extraBody) {
    const strictSystem = `${systemPrompt || this.config.defaultSystemPrompt}
Return valid JSON only. No markdown. No explanation.`;

    const raw = await this.chat(
      userPrompt,
      strictSystem,
      temperature,
      maxTokens,
      undefined,
      extraBody || {}
    );

    const cleaned = stripJsonFences(raw);
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('Nvidia AI: model returned invalid JSON:', raw);
      throw new Error('Model did not return valid JSON.');
    }
  }

  /**
   * Connectivity test (calls the live API).
   * @returns {Promise<{ status: string, model: string, base_url: string, response?: string, error?: string }>}
   */
  async healthCheck() {
    try {
      const output = await this.chat(
        'Reply with only: NVIDIA connection successful',
        'You are a health-check assistant.',
        0,
        20,
        undefined,
        {}
      );
      return {
        status: 'success',
        model: this.config.model,
        base_url: this.config.baseUrl,
        response: output
      };
    } catch (exc) {
      return {
        status: 'failed',
        model: this.config.model,
        base_url: this.config.baseUrl,
        error: exc.message || String(exc)
      };
    }
  }
}

function stripJsonFences(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(trimmed);
  if (fence) return fence[1].trim();
  return trimmed;
}

let _cachedClient = null;

function getNvidiaClient() {
  if (!_cachedClient) {
    _cachedClient = new NvidiaAIClient();
  }
  return _cachedClient;
}

function resetNvidiaClientCache() {
  _cachedClient = null;
}

module.exports = {
  NvidiaAIConfig,
  NvidiaAIClient,
  getNvidiaClient,
  resetNvidiaClientCache
};
