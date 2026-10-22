export const CATALOG_CHECKED_AT = '2026-10-21';

export const PROVIDERS = Object.freeze({
  deepseek: {name:'DeepSeek 官方',baseUrl:'https://api.deepseek.com',catalogPath:'/models',api:'chat',keyUrl:'https://platform.deepseek.com/api_keys'},
  apimart: { name: 'APImart', baseUrl: 'https://api.apimart.ai/v1', catalogPath: '/models?expand=category', keyUrl: 'https://apimart.ai/keys' },
  volcano: { name: '火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', catalogPath: null, keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey' },
});

const APIMART_SOURCE = 'https://docs.apimart.ai/en/api-reference/texts/models/list';
const VOLCANO_SOURCE = 'https://docs.volcengine.com/docs/ark/model-list?lang=zh';
const apimart = (id, name, family, vision = false, kind = 'chat') => ({ id, name, provider: 'apimart', family, kind, vision, source: APIMART_SOURCE });
const volcano = (id, name, family = 'doubao', vision = true, kind = 'chat') => ({ id, name, provider: 'volcano', family, kind, vision, source: VOLCANO_SOURCE });

// APImart IDs were checked against the authenticated catalog on CATALOG_CHECKED_AT.
// Its shared `created` timestamp is not a model release date.
export const DEFAULT_MODELS = [
  {id:'deepseek-flash',name:'DeepSeek Flash · 官方',provider:'deepseek',family:'deepseek',kind:'chat',vision:true,source:'https://api-docs.deepseek.com/api/list-models/'},
  {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro · 官方',provider:'deepseek',family:'deepseek',kind:'chat',source:'https://api-docs.deepseek.com/api/list-models/'},
  apimart('claude-opus-5-5', 'Claude Opus 5.5', 'claude', true),
  apimart('claude-sonnet-5-5', 'Claude Sonnet 5.5', 'claude', true),
  apimart('claude-haiku-5-5', 'Claude Haiku 5.5', 'claude', true),
  apimart('claude-opus-5', 'Claude Opus 5', 'claude', true),
  apimart('claude-sonnet-5', 'Claude Sonnet 5', 'claude', true),
  apimart('claude-fable-5.1', 'Claude Fable 5.1', 'claude', true),
  apimart('gpt-6.1-sol', 'GPT 6.1 Sol', 'gpt', true),
  apimart('gpt-6-astra', 'GPT 6 Astra', 'gpt', true),
  apimart('gpt-6-sol', 'GPT 6 Sol', 'gpt', true),
  apimart('gpt-6-luna', 'GPT 6 Luna', 'gpt', true),
  apimart('gpt-5.6-sol', 'GPT 5.6 Sol', 'gpt', true),
  apimart('gpt-5.6-terra', 'GPT 5.6 Terra', 'gpt', true),
  apimart('gpt-5.6-luna', 'GPT 5.6 Luna', 'gpt', true),
  apimart('gemini-4-argon', 'Gemini 4 Argon', 'gemini', true),
  apimart('gemini-3.8-flash', 'Gemini 3.8 Flash', 'gemini', true),
  apimart('gemini-3.7-flash', 'Gemini 3.7 Flash', 'gemini', true),
  apimart('gemini-3.6-flash', 'Gemini 3.6 Flash', 'gemini', true),
  apimart('gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini', true),
  apimart('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'gemini', true),
  apimart('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'deepseek'),
  apimart('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek'),
  apimart('deepseek-v4-flash', 'DeepSeek V4 Flash', 'deepseek'),
  apimart('kimi-k3', 'Kimi K3', 'kimi', true),
  apimart('kimi-k2.7-code', 'Kimi K2.7 Code', 'kimi'),
  apimart('kimi-k2.7-code-highspeed', 'Kimi K2.7 Code 高速', 'kimi'),
  apimart('kimi-k2.6', 'Kimi K2.6', 'kimi'),
  apimart('gpt-image-2.5-flare', 'GPT Image 2.5 Flare', 'image', true, 'image'),
  apimart('gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst', 'image', true, 'image'),
  apimart('gpt-image-2-official', 'GPT Image 2 Official', 'image', true, 'image'),
  apimart('gemini-nano-banana-2.1', 'Nano Banana 2.1', 'image', true, 'image'),
  apimart('gemini-3.1-flash-image-preview', 'Nano Banana 2', 'image', true, 'image'),
  apimart('seedream-5-0-pro', 'Seedream 5.0 Pro', 'image', true, 'image'),
  apimart('seedream-5-0-flash', 'Seedream 5.0 Flash', 'image', true, 'image'),
  apimart('seedream-5-0-lite', 'Seedream 5.0 Lite', 'image', true, 'image'),
  apimart('flux-3-image', 'FLUX 3 Image', 'image', true, 'image'),
  volcano('doubao-seed-evolving', '豆包 Seed Evolving'),
  volcano('doubao-seed-2-1-pro-260915', '豆包 Seed 2.1 Pro · 260915'),
  volcano('doubao-seed-2-1-lite-260915', '豆包 Seed 2.1 Lite · 260915'),
  volcano('doubao-seed-2-1-turbo-260628', '豆包 Seed 2.1 Turbo · 260628'),
  volcano('doubao-seed-2-1-pro-260628', '豆包 Seed 2.1 Pro · 260628'),
  volcano('doubao-seed-2-0-lite-260428', '豆包 Seed 2.0 Lite · 260428'),
  volcano('doubao-seed-2-0-mini-260428', '豆包 Seed 2.0 Mini · 260428'),
  volcano('doubao-seed-character-260628', '豆包角色 · 260628'),
  volcano('doubao-seed-character-251128', '豆包角色 · 251128', 'doubao', false),
  volcano('doubao-seed-translation-250915', '豆包翻译 · 250915', 'doubao', false),
  volcano('glm-5-3-flash-260828', 'GLM 5.3 Flash · 260828', 'glm', true),
  volcano('glm-5-2-260617', 'GLM 5.2 · 260617', 'glm', false),
  volcano('deepseek-v4-1-flash-260910', 'DeepSeek V4.1 Flash · 260910', 'deepseek', true),
  volcano('deepseek-v4-pro-ga-260813', 'DeepSeek V4 Pro · 260813', 'deepseek', false),
  volcano('deepseek-v4-flash-ga-260731', 'DeepSeek V4 Flash · 260731', 'deepseek', false),
  volcano('doubao-seed-2-0-pro-260215', '豆包 Seed 2.0 Pro · 260215 · 计划下线'),
  volcano('doubao-seed-2-0-lite-260215', '豆包 Seed 2.0 Lite · 260215 · 计划下线'),
  volcano('doubao-seed-2-0-mini-260215', '豆包 Seed 2.0 Mini · 260215 · 计划下线'),
  volcano('doubao-seed-2-0-code-preview-260215', '豆包 Seed 2.0 Code · 计划下线'),
  volcano('deepseek-v4-pro-260425', 'DeepSeek V4 Pro · 260425 · 计划下线', 'deepseek', false),
  volcano('doubao-seedream-5-0-pro-260628', '豆包 Seedream 5.0 Pro', 'image', true, 'image'),
  volcano('doubao-seedream-5-0-flash-260915', '豆包 Seedream 5.0 Flash', 'image', true, 'image'),
  volcano('doubao-seedream-5-0-lite-260128', '豆包 Seedream 5.0 Lite · 计划下线', 'image', true, 'image'),
  volcano('doubao-seedream-4-5-251128', '豆包 Seedream 4.5 · 计划下线', 'image', true, 'image'),
  volcano('doubao-seedream-4-0-250828', '豆包 Seedream 4.0 · 计划下线', 'image', true, 'image'),
];

export const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude', provider: 'apimart', model: 'claude-opus-5-5', color: '#d97757', system: '你是 Claude 助手。用清晰自然的中文交流，擅长写作、分析与代码解释。准确说明不确定性。' },
  { id: 'gpt', name: 'GPT', provider: 'apimart', model: 'gpt-6.1-sol', color: '#10a37f', system: '你是 GPT 助手。用清晰自然的中文交流，帮助用户拆解问题并给出可执行建议。' },
  { id: 'gemini', name: 'Gemini', provider: 'apimart', model: 'gemini-4-argon', color: '#4285f4', system: '你是 Gemini 助手。用清晰自然的中文交流，擅长综合信息与创意发散。' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'apimart', model: 'deepseek-v4.1-flash', color: '#5368f5', system: '你是 DeepSeek 助手。用清晰自然的中文交流，重视逻辑、计算与事实核对。' },
  { id: 'kimi', name: 'Kimi', provider: 'apimart', model: 'kimi-k3', color: '#353844', system: '你是 Kimi 助手。用清晰自然的中文交流，帮助用户理解文档、提炼观点与组织计划。' },
  { id: 'doubao', name: '豆包', provider: 'volcano', model: 'doubao-seed-2-1-pro-260915', color: '#fd8b53', system: '你是豆包助手。用清晰自然的中文交流，帮助用户处理日常问题、创作与分析。' },
];

const KNOWN = new Map(DEFAULT_MODELS.map(model => [`${model.provider}:${model.id}`, model]));
const UNSUPPORTED = /(?:embedding|rerank|moderation|whisper|tts|transcri|realtime|audio|video|seedance|seed3d|sora|veo|music|suno|speech|3d)/i;
function familyOf(id) {
  for (const family of ['claude', 'gpt', 'gemini', 'deepseek', 'kimi', 'doubao', 'glm', 'grok', 'qwen', 'minimax']) {
    if (id.toLowerCase().startsWith(family)) return family;
  }
  return 'other';
}

/** Normalize an account-scoped catalog. Unknown unclassified IDs stay out of menus;
 * users can add those explicitly with the intended capability. */
export function normalizeModels(raw, provider) {
  if (typeof provider!=='string'||! /^[a-z][a-z0-9_-]{0,63}$/.test(provider)) throw new Error('不支持的模型服务商');
  const items = Array.isArray(raw) ? raw : raw?.data ?? raw?.models ?? raw?.result?.data;
  if (!Array.isArray(items)) throw new Error('服务商没有返回有效的模型列表');
  const result = [], seen = new Set();
  for (const item of items) {
    const id = typeof item === 'string' ? item : item?.id ?? item?.ModelID;
    if (typeof id !== 'string' || !id.trim() || id.length > 200 || seen.has(id)) continue;
    const known = KNOWN.get(`${provider}:${id}`);
    const category = typeof item === 'object' ? item.category : undefined;
    const tags = Array.isArray(item?.capability_tags) ? item.capability_tags : [];
    let kind = category === 'chat' || category === 'image' ? category : known?.kind;
    if (category && !['chat', 'image', 'unknown'].includes(category)) continue;
    if (UNSUPPORTED.test(id)) continue;
    if (!kind && /(?:image|seedream|imagen|flux|dall-e|nano-banana)/i.test(id)) kind = 'image';
    if (!kind && familyOf(id) !== 'other' && !/ocr/i.test(id)) kind = 'chat';
    if (!kind && !['apimart','volcano'].includes(provider)) kind='chat';
    if (!kind) continue;
    seen.add(id);
    result.push({
      id, name: known?.name ?? id, provider, family: kind === 'image' ? 'image' : known?.family ?? familyOf(id), kind,
      vision: known?.vision ?? tags.some(tag => /vision|image to image/i.test(tag)),
      source: provider === 'apimart' ? APIMART_SOURCE : provider==='volcano'?VOLCANO_SOURCE:provider==='deepseek'?'https://api-docs.deepseek.com/api/list-models/':'account-catalog',
    });
  }
  return result;
}
