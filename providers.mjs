/**
 * The company gateway route and its model catalog.
 *
 * This module is the single source of truth. `cordis.patch.yml` is GENERATED
 * from it by `build-patch.mjs` — never edit that file by hand.
 *
 * ONE provider, not five. The gateway speaks one protocol at one URL with one
 * credential, so the five families are model GROUPS inside a single route.
 * Declaring them as separate providers only multiplied the rows in Settings →
 * Models; grouping them here keeps the picker to one entry and moves the
 * per-model choices into this plugin's own settings section.
 */

export const BASE_URL = 'https://plat.topdon.com/topdon-plat/topdon-ai/anthropic'

/** Route key. Everything (credentials, pool, model list) hangs off this one id. */
export const PROVIDER_ID = 'topdon'

/** Model families, in the order the settings card lists them. */
export const FAMILIES = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'claude', label: 'Claude' },
  { id: 'gpt', label: 'GPT' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'gemini', label: 'Gemini' },
]

/**
 * Every model the gateway offers. `family` is this plugin's own grouping (the
 * host neither knows nor needs it) and drives the settings card's sections.
 */
export const MODELS = [
  // --- DeepSeek -----------------------------------------------------------
  {
    family: 'deepseek',
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'deepseek',
    id: 'deepseek-chat_thinking',
    name: 'DeepSeek Chat (Thinking)',
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    family: 'deepseek',
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 32768,
  },

  // --- Claude -------------------------------------------------------------
  {
    family: 'claude',
    id: 'claude-sonnet-4.6_image_thinking',
    name: 'Claude Sonnet 4.6 (Vision + Thinking)',
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32768,
    reasoningEfforts: { off: null, high: 'high', max: 'max' },
  },
  {
    family: 'claude',
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    input: ['text'],
    contextWindow: 200000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'claude',
    id: 'claude-opus-4-8_image_thinking',
    name: 'Claude Opus 4.8 (Vision + Thinking)',
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32768,
    reasoningEfforts: { off: null, high: 'high', max: 'max' },
  },
  {
    family: 'claude',
    id: 'claude-haiku-4.5_image_thinking',
    name: 'Claude Haiku 4.5 (Vision + Thinking)',
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32768,
    reasoningEfforts: { off: null, high: 'high', max: 'max' },
  },

  // --- GPT ----------------------------------------------------------------
  {
    family: 'gpt',
    id: 'gpt-6.1-sol',
    name: 'GPT 6.1 Sol',
    input: ['text'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-5.6-sol',
    name: 'GPT 5.6 Sol',
    input: ['text'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-5.6-luna',
    name: 'GPT 5.6 Luna',
    input: ['text'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-5.4_image',
    name: 'GPT 5.4 (Vision)',
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-5.6_image',
    name: 'GPT 5.6 (Vision)',
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-5.2-codex',
    name: 'GPT 5.2 Codex',
    input: ['text'],
    contextWindow: 1000000,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
  {
    family: 'gpt',
    id: 'gpt-3.5-turbo',
    name: 'GPT 3.5 Turbo',
    input: ['text'],
    contextWindow: 16384,
    maxTokens: 4096,
    reasoningEfforts: false,
  },

  // --- Qwen ---------------------------------------------------------------
  {
    family: 'qwen',
    id: 'qwen-plus_thinking',
    name: 'Qwen Plus (Thinking)',
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 32768,
  },
  {
    family: 'qwen',
    id: 'qwen-flash_thinking',
    name: 'Qwen Flash (Thinking)',
    input: ['text'],
    contextWindow: 131072,
    maxTokens: 32768,
  },

  // --- Gemini -------------------------------------------------------------
  {
    family: 'gemini',
    id: 'gemini-3.1_image_thinking',
    name: 'Gemini 3.1 Flash (Vision + Thinking)',
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 32768,
  },
  {
    family: 'gemini',
    id: 'gemini-nanobanana-3_image',
    name: 'Gemini Nano 3 (Vision)',
    input: ['text', 'image'],
    contextWindow: 131072,
    maxTokens: 32768,
    reasoningEfforts: false,
  },
]

/** Ids of every model the gateway offers, in catalog order. */
export const MODEL_IDS = MODELS.map((model) => model.id)

/** Strip this plugin's own `family` tag; the host rejects unknown fields. */
function hostModel(model) {
  const { family: _family, ...rest } = model
  return rest
}

/**
 * The one `llm-pi-ai` provider this plugin declares.
 *
 * `cacheRetention` is deliberately absent: it is a per-request option on the
 * route, not a per-model one, so declaring `none` for three families and
 * nothing for the other two is not expressible on a merged route. Absent means
 * the library's own default, which is what the Claude family already used.
 */
export function buildProvider(modelIds = MODEL_IDS) {
  const wanted = new Set(modelIds)
  const models = MODELS.filter((model) => wanted.has(model.id)).map(hostModel)
  return {
    [PROVIDER_ID]: {
      displayName: 'Topdon AI',
      api: 'anthropic-messages',
      baseURL: BASE_URL,
      apiKeyEnv: 'TOPDON_AI_API_KEY',
      defaultContextWindow: 1000000,
      defaultMaxTokens: 32768,
      models,
    },
  }
}

/** Provider keys owned by this plugin (there is exactly one). */
export const OWNED = [PROVIDER_ID]

/** Key-order-insensitive JSON, so a YAML round-trip is not seen as a change. */
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}
