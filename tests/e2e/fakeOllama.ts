/**
 * A stand-in for Ollama on 127.0.0.1, speaking its API and streaming format.
 * Like the real thing, it can refuse browser-extension origins until told to
 * allow them.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeOllama {
  url: string;
  /** Answer requests from browser extensions (as OLLAMA_ORIGINS would allow). */
  allowExtensions: boolean;
  /** What /api/chat replies with, given the request body. */
  respond: (body: { messages: { role: string; content: string }[]; format?: unknown; model: string }) => string;
  requests: { path: string; origin?: string; body: Record<string, unknown> }[];
  close(): Promise<void>;
}

function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

export async function startFakeOllama(): Promise<FakeOllama> {
  const fake: FakeOllama = {
    url: '',
    allowExtensions: true,
    respond: () => 'OK',
    requests: [],
    close: async () => undefined,
  };
  const server: Server = createServer(async (req, res) => {
    const data = await body(req);
    const origin = req.headers.origin;
    fake.requests.push({ path: req.url ?? '', origin, body: data });
    if (origin && /^(chrome|moz)-extension:/.test(origin) && !fake.allowExtensions) {
      // Like Ollama's CORS check: only requests that carry an origin can be refused.
      res.writeHead(403).end();
      return;
    }
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2:3b' }] }));
      return;
    }
    if (req.url === '/api/show') {
      const known = ['qwen2.5:7b', 'llama3.2:3b'].includes(String(data.model));
      res.writeHead(known ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(known ? { details: { family: 'qwen2' } } : { error: `model '${String(data.model)}' not found` }));
      return;
    }
    if (req.url === '/api/chat') {
      const reply = fake.respond(data as never);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (let i = 0; i < reply.length; i += 60) {
        res.write(`${JSON.stringify({ model: data.model, message: { role: 'assistant', content: reply.slice(i, i + 60) }, done: false })}\n`);
        await new Promise((r) => setTimeout(r, 5));
      }
      res.end(`${JSON.stringify({ model: data.model, message: { role: 'assistant', content: '' }, done: true })}\n`);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return fake;
}
