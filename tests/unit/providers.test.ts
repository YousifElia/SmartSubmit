// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tailorPrompt } from '@/core/ai/prompts';
import { AiError, compatBase, compatClient, contextSize, isLocal, ollamaClient } from '@/core/ai/providers';
import { runDraft, runTailor } from '@/core/ai/run';
import { sampleResumeDoc } from '../fixtures/sampleResume';

/** A stand-in for Ollama and an OpenAI-compatible server, speaking their streaming formats. */
interface Seen {
  path: string;
  origin: string | undefined;
  body: Record<string, unknown>;
}
const seen: Seen[] = [];
let mode: 'ok' | 'forbidden' | 'missing-model' | 'no-schema' = 'ok';
let reply = '';

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  seen.push({ path: req.url ?? '', origin: req.headers.origin, body });
  if (mode === 'forbidden') return void res.writeHead(403).end();
  if (req.url === '/api/show') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return void res.end('{}');
  }
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:3b' }] }));
  }
  if (req.url === '/api/chat') {
    if (mode === 'missing-model') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ error: `model "${String(body.model)}" not found, try pulling it first` }));
    }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    // Stream the reply in a few pieces, as Ollama does.
    for (let i = 0; i < reply.length; i += 40) res.write(`${JSON.stringify({ message: { role: 'assistant', content: reply.slice(i, i + 40) }, done: false })}\n`);
    return void res.end(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`);
  }
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify({ data: [{ id: 'local-model' }] }));
  }
  if (req.url === '/v1/chat/completions') {
    if (mode === 'no-schema' && body.response_format) return void res.writeHead(400).end('response_format not supported');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (let i = 0; i < reply.length; i += 40) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply.slice(i, i + 40) } }] })}\n\n`);
    return void res.end('data: [DONE]\n\n');
  }
  res.writeHead(404).end();
}

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const resume = sampleResumeDoc();
const job = { title: 'Intern', company: 'Acme', location: 'Windsor, ON', description: 'We need Python.' };

describe('Ollama client', () => {
  it('lists installed models', async () => {
    mode = 'ok';
    expect(await ollamaClient(base, '').listModels()).toEqual(['llama3.2:3b', 'qwen2.5:7b']);
  });

  it('streams a tailoring reply constrained to the schema, with a large enough context', async () => {
    mode = 'ok';
    reply = JSON.stringify({ resume, changes: [{ section: 'Skills', before: '', after: 'Python first', reason: 'The job asks for Python' }], gaps: ['Kubernetes'] });
    const progress: number[] = [];
    const result = await runTailor(ollamaClient(base, 'qwen2.5:7b'), { resume, job, strength: 'balanced', keywords: { matched: ['Python'], missing: [] } }, { onProgress: (n) => progress.push(n) });
    expect(result.doc.basics.name).toBe('Avery Testerson');
    expect(result.gaps).toEqual(['Kubernetes']);
    expect(progress.length).toBeGreaterThan(5);
    expect(progress[progress.length - 1]).toBe(reply.length);

    const request = seen.filter((s) => s.path === '/api/chat').at(-1)!.body;
    expect(request.model).toBe('qwen2.5:7b');
    expect(request.stream).toBe(true);
    expect((request.format as { type: string }).type).toBe('object');
    expect((request.options as { num_ctx: number }).num_ctx).toBeGreaterThanOrEqual(6144);
    expect((request.messages as { role: string }[]).map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('explains how to allow extensions when Ollama refuses the origin', async () => {
    mode = 'forbidden';
    const error = await ollamaClient(base, 'x').listModels().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe('origin');
    expect((error as AiError).message).toContain('OLLAMA_ORIGINS');
  });

  it('says how to install a missing model', async () => {
    mode = 'missing-model';
    const error = await runDraft(ollamaClient(base, 'mistral'), { question: 'Why us?', resumeText: 'x', job: null, maxLength: null }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe('model');
    expect((error as AiError).message).toContain('ollama pull mistral');
  });

  it('reports a server that is not running', async () => {
    const error = await ollamaClient('http://127.0.0.1:1', 'x').listModels().catch((e: unknown) => e);
    expect((error as AiError).kind).toBe('unreachable');
  });

  it('can be stopped', async () => {
    mode = 'ok';
    reply = 'x'.repeat(5000);
    const controller = new AbortController();
    controller.abort();
    const error = await ollamaClient(base, 'm').chat({ prompt: { system: 's', user: 'u', reply: 'text' }, signal: controller.signal }).catch((e: unknown) => e);
    expect((error as AiError).kind).toBe('cancelled');
  });
});

describe('OpenAI-compatible client', () => {
  it('adds /v1 to a bare address and lists models', async () => {
    mode = 'ok';
    expect(compatBase(`${base}/`)).toBe(`${base}/v1`);
    expect(compatBase('http://localhost:1234/v1')).toBe('http://localhost:1234/v1');
    expect(await compatClient(base, '', '').listModels()).toEqual(['local-model']);
  });

  it('streams a drafted answer and trims it to the field limit', async () => {
    mode = 'ok';
    reply = 'Here is a draft:\n\nI build tools that people rely on, and Acme’s robots are a chance to do that at scale.';
    const text = await runDraft(compatClient(base, 'secret-key', 'local-model'), { question: 'Why Acme?', resumeText: 'x', job, maxLength: 40 });
    expect(text).toBe('I build tools that people rely on, and A');
  });

  it('falls back to a plain request when the server does not support constrained JSON', async () => {
    mode = 'no-schema';
    reply = JSON.stringify({ resume, changes: [], gaps: [] });
    const result = await runTailor(compatClient(base, '', 'local-model'), { resume, job, strength: 'light', keywords: { matched: [], missing: [] } });
    expect(result.doc.experience).toHaveLength(2);
    const attempts = seen.filter((s) => s.path === '/v1/chat/completions').slice(-2);
    expect(attempts[0]!.body.response_format).toBeDefined();
    expect(attempts[1]!.body.response_format).toBeUndefined();
  });
});

describe('helpers', () => {
  it('sizes the context window to the prompt', () => {
    const small = contextSize({ system: 'a', user: 'b', reply: 'text' });
    const large = contextSize(tailorPrompt({ resume, job: { ...job, description: 'x'.repeat(9000) }, strength: 'strong', keywords: { matched: [], missing: [] } }));
    expect(small).toBe(4096);
    expect(large).toBeGreaterThan(small);
    expect(large % 2048).toBe(0);
  });
  it('knows which addresses are on this computer', () => {
    expect(isLocal('http://localhost:11434')).toBe(true);
    expect(isLocal('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLocal('http://192.168.1.20:11434')).toBe(false);
  });
});
