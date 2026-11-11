/**
 * Clients for local AI servers: Ollama, and anything that speaks the
 * OpenAI chat API (LM Studio, llama.cpp, Jan, vLLM).
 *
 * They run in extension pages and the background script, never in web pages:
 * those have the host permission to reach the server, and the server sees a
 * browser-extension origin, which Ollama must be told to allow.
 */
import type { Settings } from '../types';
import type { Prompt } from './prompts';

export type AiErrorKind = 'origin' | 'unreachable' | 'model' | 'server' | 'cancelled' | 'empty';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ChatOptions {
  prompt: Prompt;
  /** JSON Schema the reply must follow (for JSON replies). */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Called as the reply arrives, with its length so far. */
  onProgress?: (chars: number) => void;
}

export interface AiClient {
  readonly label: string;
  readonly model: string;
  listModels(signal?: AbortSignal): Promise<string[]>;
  chat(options: ChatOptions): Promise<string>;
}

export const OLLAMA_ORIGINS_HELP =
  'Ollama only answers browser extensions you allow. Set OLLAMA_ORIGINS to chrome-extension://*,moz-extension://* and restart Ollama.';

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function request(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new AiError('cancelled', 'Stopped.');
    throw new AiError('unreachable', `Couldn’t reach ${label} at ${new URL(url).origin}. Check that it is running and the address is right.`);
  }
}

/** Read a streamed body line by line. */
async function* lines(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new AiError('cancelled', 'Stopped.');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield line;
        newline = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new AiError('cancelled', 'Stopped.');
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** A context window big enough for the prompt and the reply: Ollama's default is too small for a resume and a posting. */
export function contextSize(prompt: Prompt): number {
  const inputTokens = (prompt.system.length + prompt.user.length) / 3.2;
  const outputTokens = prompt.reply === 'json' ? 3500 : 700;
  const needed = Math.ceil((inputTokens + outputTokens) / 2048) * 2048;
  return Math.min(Math.max(needed, 4096), 32768);
}

// ───────────────────────────── Ollama ─────────────────────────────

export function ollamaClient(baseUrl: string, model: string): AiClient {
  const base = trimSlash(baseUrl) || 'http://localhost:11434';
  const label = 'Ollama';

  const check = async (response: Response): Promise<void> => {
    if (response.ok) return;
    if (response.status === 403) throw new AiError('origin', OLLAMA_ORIGINS_HELP);
    const body = await response.text().catch(() => '');
    const message = (() => {
      try {
        return (JSON.parse(body) as { error?: string }).error ?? body;
      } catch {
        return body;
      }
    })();
    if (response.status === 404 && /model/i.test(message)) {
      throw new AiError('model', `The model “${model}” isn’t installed in Ollama. Install it with: ollama pull ${model}`);
    }
    throw new AiError('server', `Ollama replied with an error (${response.status}): ${message.slice(0, 200)}`);
  };

  return {
    label,
    model,
    async listModels(signal) {
      const response = await request(`${base}/api/tags`, { signal }, label);
      await check(response);
      const data = (await response.json()) as { models?: { name?: string }[] };
      const models = (data.models ?? []).map((m) => m.name ?? '').filter(Boolean).sort();
      // Browsers only send the extension's origin on requests like the ones
      // that generate text, so the model list can load while generating would
      // be refused. A cheap request of that kind finds out now.
      const probe = await request(
        `${base}/api/show`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || models[0] || 'smartsubmit-check' }), signal },
        label,
      );
      if (probe.status === 403) throw new AiError('origin', OLLAMA_ORIGINS_HELP);
      return models;
    },
    async chat({ prompt, schema, signal, onProgress }) {
      if (!model) throw new AiError('model', 'Choose an Ollama model in SmartSubmit’s AI settings first.');
      const response = await request(
        `${base}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            stream: true,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            ...(schema ? { format: schema } : {}),
            options: { temperature: prompt.reply === 'json' ? 0.2 : 0.6, num_ctx: contextSize(prompt) },
          }),
        },
        label,
      );
      await check(response);
      let text = '';
      for await (const line of lines(response, signal)) {
        let chunk: { message?: { content?: string }; error?: string; done?: boolean };
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }
        if (chunk.error) throw new AiError('server', `Ollama stopped with an error: ${chunk.error}`);
        if (chunk.message?.content) {
          text += chunk.message.content;
          onProgress?.(text.length);
        }
      }
      if (!text.trim()) throw new AiError('empty', 'The model returned an empty reply. Try again, or try a larger model.');
      return text;
    },
  };
}

// ───────────────────────────── OpenAI-compatible ─────────────────────────────

/** "http://localhost:1234" → "http://localhost:1234/v1"; an explicit path is kept. */
export function compatBase(url: string): string {
  const trimmed = trimSlash(url);
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname === '/' || parsed.pathname === '' ? `${trimmed}/v1` : trimmed;
  } catch {
    return trimmed;
  }
}

export function compatClient(baseUrl: string, apiKey: string, model: string): AiClient {
  const base = compatBase(baseUrl);
  const label = 'the AI server';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

  const fail = async (response: Response): Promise<never> => {
    const body = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) throw new AiError('server', 'The AI server rejected the API key.');
    if (response.status === 404 && /model/i.test(body)) throw new AiError('model', `The model “${model}” isn’t available on the server.`);
    throw new AiError('server', `The AI server replied with an error (${response.status}): ${body.slice(0, 200)}`);
  };

  const send = (body: Record<string, unknown>, signal?: AbortSignal) =>
    request(`${base}/chat/completions`, { method: 'POST', headers, signal, body: JSON.stringify(body) }, label);

  return {
    label,
    model,
    async listModels(signal) {
      const response = await request(`${base}/models`, { headers, signal }, label);
      if (!response.ok) await fail(response);
      const data = (await response.json()) as { data?: { id?: string }[] };
      return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean).sort();
    },
    async chat({ prompt, schema, signal, onProgress }) {
      if (!model) throw new AiError('model', 'Choose a model in SmartSubmit’s AI settings first.');
      const body: Record<string, unknown> = {
        model,
        stream: true,
        temperature: prompt.reply === 'json' ? 0.2 : 0.6,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      };
      // Servers ask for constrained JSON in different ways: OpenAI's style (LM
      // Studio, vLLM, llama.cpp), then llama.cpp's own, then not at all; the
      // prompt asks for JSON either way.
      const formats = schema
        ? [{ type: 'json_schema', json_schema: { name: 'reply', schema } }, { type: 'json_object', schema }, null]
        : [null];
      let response: Response | null = null;
      for (const [i, format] of formats.entries()) {
        response = await send(format ? { ...body, response_format: format } : body, signal);
        if (response.ok || i === formats.length - 1) break;
        // A server that doesn't know this format says so with a 400 or 422,
        // or, like llama-cpp-python, a 500 naming response_format.
        const refused =
          response.status === 400 ||
          response.status === 422 ||
          (response.status === 500 && /response_format/i.test(await response.clone().text().catch(() => '')));
        if (!refused) break;
        await response.body?.cancel().catch(() => undefined);
      }
      if (!response!.ok) await fail(response!);

      let text = '';
      for await (const line of lines(response!, signal)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') break;
        try {
          const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
          if (chunk.error) throw new AiError('server', chunk.error.message ?? 'The AI server stopped with an error.');
          const piece = chunk.choices?.[0]?.delta?.content;
          if (piece) {
            text += piece;
            onProgress?.(text.length);
          }
        } catch (error) {
          if (error instanceof AiError) throw error;
        }
      }
      if (!text.trim()) throw new AiError('empty', 'The model returned an empty reply. Try again, or try a larger model.');
      return text;
    },
  };
}

/** The client for the user's AI settings, or null when none is set up. */
export function clientFor(ai: Settings['ai']): AiClient | null {
  if (ai.provider === 'ollama') return ollamaClient(ai.ollamaUrl, ai.ollamaModel);
  if (ai.provider === 'openai-compat') return compatClient(ai.compatUrl, ai.compatKey, ai.compatModel);
  return null;
}

/** Whether a URL points at this computer, which needs no extra permission. */
export function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}
