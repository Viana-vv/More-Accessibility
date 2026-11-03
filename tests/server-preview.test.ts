import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../src/server/index.js';

function response(status: number, contentType: string, bytes = Buffer.from([1, 2, 3]), location?: string): Response {
  const headers = new Headers({ 'content-type': contentType, 'content-length': String(bytes.length) });
  if (location) headers.set('location', location);
  return { status, ok: status >= 200 && status < 300, headers, body: (async function* () { yield bytes; })() } as unknown as Response;
}

test('preview externo só entrega bytes declarados como imagem', async () => {
  const originalFetch = globalThis.fetch;
  const running = await startLocalServer({ port: 0 });
  globalThis.fetch = async (input, init) => String(input).startsWith(running.url) ? originalFetch(input, init) : response(200, 'image/png');
  try {
    const result = await fetch(`${running.url}/api/preview?url=${encodeURIComponent('https://8.8.8.8/image.png')}`);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3]);
  } finally { await running.close(); globalThis.fetch = originalFetch; }
});

test('preview não executa nem entrega HTML externo', async () => {
  const originalFetch = globalThis.fetch;
  const running = await startLocalServer({ port: 0 });
  globalThis.fetch = async (input, init) => String(input).startsWith(running.url) ? originalFetch(input, init) : response(200, 'text/html', Buffer.from('<script>alert(1)</script>'));
  try {
    const result = await fetch(`${running.url}/api/preview?url=${encodeURIComponent('https://8.8.8.8/page')}`);
    assert.equal(result.status, 415);
    assert.match(await result.text(), /somente conteúdo de imagem/i);
  } finally { await running.close(); globalThis.fetch = originalFetch; }
});

test('preview valida redirecionamento antes de buscar destino privado', async () => {
  const originalFetch = globalThis.fetch;
  const running = await startLocalServer({ port: 0 });
  globalThis.fetch = async (input, init) => String(input).startsWith(running.url) ? originalFetch(input, init) : response(302, 'text/plain', Buffer.alloc(0), 'http://127.0.0.1/admin');
  try {
    const result = await fetch(`${running.url}/api/preview?url=${encodeURIComponent('https://8.8.8.8/redirect')}`);
    assert.equal(result.status, 400);
  } finally { await running.close(); globalThis.fetch = originalFetch; }
});

