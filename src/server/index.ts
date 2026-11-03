import http from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import pathUtil from 'node:path';
import type { RenderedPageSnapshot } from '../shared/contracts.js';
import { auditSnapshot } from '../engine/index.js';
import { captureRenderedPage, CaptureError, type CdpSnapshotOptions } from './cdp.js';
import { UrlPolicyError, validateExternalUrl } from './url-policy.js';

export interface ServerOptions extends CdpSnapshotOptions { host?: string; port?: number; fixture?: RenderedPageSnapshot | (() => RenderedPageSnapshot | Promise<RenderedPageSnapshot>); maxBodyBytes?: number; staticRoot?: string; logoPath?: string; }
export interface RunningServer { server: Server; url: string; close: () => Promise<void>; }

function json(response: http.ServerResponse, status: number, body: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); }
async function body(request: http.IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const data = Buffer.from(chunk as Uint8Array); size += data.length; if (size > maxBytes) throw new Error('Corpo da requisição excede o limite.'); chunks.push(data); }
  return Buffer.concat(chunks).toString('utf8');
}

export function createLocalServer(options: ServerOptions = {}): Server {
  const maxBytes = options.maxBodyBytes ?? 16384;
  return http.createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && options.staticRoot && path !== '/health' && !path.startsWith('/api/')) {
        const requested = path === '/' ? 'index.html' : path === '/logo.png' && options.logoPath ? options.logoPath : path.slice(1);
        const filePath = pathUtil.resolve(pathUtil.isAbsolute(requested) ? requested : pathUtil.join(options.staticRoot, requested));
        const rootPath = pathUtil.resolve(options.staticRoot);
        if (path !== '/logo.png' && !filePath.startsWith(`${rootPath}${pathUtil.sep}`)) return json(response, 403, { error: 'Recurso bloqueado.' });
        try {
          const content = await readFile(filePath);
          const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
          response.writeHead(200, { 'content-type': types[pathUtil.extname(filePath)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
          response.end(content);
          return;
        } catch { return json(response, 404, { error: 'Recurso não encontrado.' }); }
      }
      if (request.method === 'GET' && path === '/health') return json(response, 200, { ok: true });
      if (request.method !== 'POST' || path !== '/api/analyze') return json(response, 404, { error: 'Rota não encontrada.' });
      const parsed = JSON.parse(await body(request, maxBytes)) as { url?: unknown };
      if (typeof parsed.url !== 'string') return json(response, 400, { error: 'O campo url é obrigatório.' });
      const safe = await validateExternalUrl(parsed.url);
      const snapshot = options.fixture ? typeof options.fixture === 'function' ? await options.fixture() : options.fixture : await captureRenderedPage(safe.url.href, options);
      if (snapshot.captureState !== 'captured' && snapshot.captureState !== undefined) return json(response, 200, { snapshot });
      const report = auditSnapshot(snapshot);
      report.target.url = safe.url.href;
      return json(response, 200, { snapshot, report });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: 'JSON inválido.' });
      if (error instanceof UrlPolicyError) return json(response, 400, { error: error.message, code: error.code });
      if (error instanceof CaptureError) return json(response, 200, { snapshot: error.snapshot ?? { url: '', title: '', elements: [], images: [], capturedAt: new Date().toISOString(), captureState: error.state, captureMessage: error.message } });
      return json(response, 502, { error: error instanceof Error ? error.message : 'Falha ao analisar a página.' });
    }
  });
}

export async function startLocalServer(options: ServerOptions = {}): Promise<RunningServer> {
  const server = createLocalServer(options); const host = options.host ?? '127.0.0.1'; const port = options.port ?? 0;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.');
  return { server, url: `http://${host}:${address.port}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export { captureRenderedPage } from './cdp.js';
export { validateExternalUrl, UrlPolicyError } from './url-policy.js';

