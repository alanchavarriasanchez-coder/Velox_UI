import { ModelOption } from '../config';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatAttachment {
  name: string;
  mime_type: string;
  data_base64: string;
}

export interface SendChatCompletionParams {
  messages: ChatMessage[];
  modelOption: ModelOption;
  apiKeys: Record<string, string>;
  backendUrl: string;
  onChunk: (text: string) => void;
  // Emite cada payload SSE ya deserializado. Permite al consumidor reaccionar a
  // metadatos específicos del backend (notas de cola, usage, fuentes web) sin
  // acoplar el servicio a un proveedor concreto.
  onEvent?: (event: Record<string, unknown>) => void;
  // Opciones exclusivas del backend local (OpenVINO). Se ignoran en cloud.
  systemPrompt?: string;
  webSearch?: boolean;
  searchEngineUrl?: string;
  attachments?: ChatAttachment[];
  signal?: AbortSignal;
  maxTokens?: number;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

const LOCAL_ENDPOINT = '/v1/chat/completions';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

// Recupera la API Key del proveedor y falla con un mensaje accionable para la
// UI si no está configurada.
function requireApiKey(apiKeys: Record<string, string>, provider: string): string {
  const key = (apiKeys[provider] ?? '').trim();
  if (!key) {
    throw new Error(
      `Falta la API Key de "${provider}". Añádela en Configuración > Proveedores Cloud.`
    );
  }
  return key;
}

interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// Anthropic no acepta el rol "system" dentro de messages: se extrae al campo
// de nivel superior `system`.
function splitSystemPrompt(messages: ChatMessage[]): {
  system?: string;
  conversation: ChatMessage[];
} {
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter((content) => content.trim().length > 0);
  const conversation = messages.filter((m) => m.role !== 'system');
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    conversation,
  };
}

function buildProviderRequest(params: SendChatCompletionParams): ProviderRequest {
  const {
    messages,
    modelOption,
    apiKeys,
    backendUrl,
    maxTokens,
    systemPrompt,
    webSearch,
    searchEngineUrl,
    attachments,
  } = params;
  const { provider, id } = modelOption;

  switch (provider) {
    case 'local':
      // El backend local conserva sus campos nativos (system_prompt, web_search,
      // search_engine_url y attachments) para no romper su contrato actual.
      return {
        url: joinUrl(backendUrl, LOCAL_ENDPOINT),
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Name': 'VeloxUI',
        },
        body: {
          model: id,
          messages,
          stream: true,
          web_search: webSearch ?? false,
          ...(webSearch && searchEngineUrl ? { search_engine_url: searchEngineUrl } : {}),
          ...(systemPrompt && systemPrompt.trim() ? { system_prompt: systemPrompt.trim() } : {}),
          attachments: (attachments ?? []).map((a) => ({
            name: a.name,
            mime_type: a.mime_type,
            data: a.data_base64,
          })),
        },
      };

    case 'deepseek':
      return {
        url: DEEPSEEK_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${requireApiKey(apiKeys, 'deepseek')}`,
        },
        body: { model: id, messages, stream: true },
      };

    case 'openai':
      return {
        url: OPENAI_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${requireApiKey(apiKeys, 'openai')}`,
        },
        body: { model: id, messages, stream: true },
      };

    case 'anthropic': {
      const { system, conversation } = splitSystemPrompt(messages);
      return {
        url: ANTHROPIC_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': requireApiKey(apiKeys, 'anthropic'),
          'anthropic-version': ANTHROPIC_VERSION,
          // Necesario para llamadas directas desde el webview del cliente.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: {
          model: id,
          max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: conversation,
          stream: true,
          ...(system ? { system } : {}),
        },
      };
    }

    default:
      throw new Error(`El proveedor "${provider}" no está soportado por llmService.`);
  }
}

interface StreamChunkPayload {
  choices?: Array<{ delta?: { content?: string | null } }>;
  type?: string;
  delta?: { text?: string | null };
}

// Normaliza el delta de cada proveedor a texto plano.
function extractText(payload: StreamChunkPayload, provider: ModelOption['provider']): string | null {
  if (provider === 'anthropic') {
    if (payload.type === 'content_block_delta') {
      return payload.delta?.text ?? null;
    }
    return null;
  }
  return payload.choices?.[0]?.delta?.content ?? null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 300);
  } catch {
    return '';
  }
}

export async function sendChatCompletion(params: SendChatCompletionParams): Promise<void> {
  const { modelOption, onChunk, onEvent, signal } = params;
  const request = buildProviderRequest(params);

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new Error(
      `Error ${response.status} (${response.statusText || 'sin detalle'}) al contactar "${
        modelOption.provider
      }"${detail ? `: ${detail}` : ''}`
    );
  }

  if (!response.body) {
    throw new Error('La respuesta del proveedor no incluye un stream legible.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // Ignora líneas vacías, comentarios/heartbeats (":") y el campo
      // "event:" que Anthropic envía junto al "data:".
      if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;

      const data = line.slice('data:'.length).trim();
      if (!data || data === '[DONE]') continue;

      let payload: StreamChunkPayload;
      try {
        payload = JSON.parse(data) as StreamChunkPayload;
      } catch {
        continue;
      }

      onEvent?.(payload as Record<string, unknown>);

      const text = extractText(payload, modelOption.provider);
      if (text) onChunk(text);
    }
  }
}
