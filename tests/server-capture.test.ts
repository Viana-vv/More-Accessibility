import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureRenderedPage, classifyDocument, failureSnapshot } from '../src/server/cdp.js';

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/capture-page.html');

test('fixture local cobre os elementos que a captura deve coletar', async () => {
  const html = await readFile(fixturePath, 'utf8');
  assert.match(html, /<img/);
  assert.match(html, /<svg role="img"/);
  assert.match(html, /background-image/);
  assert.match(html, /<iframe/);
  assert.match(html, /<label/);
});

test('classifica documento original como autenticação necessária quando recebe 401', () => {
  const result = classifyDocument(401, false, 'https://example.test/login', { title: 'Login' });
  assert.equal(result?.captureState, 'authentication-required');
  assert.match(result?.captureMessage ?? '', /documento original/);
  assert.match(result?.captureMessage ?? '', /autenticação/);
});

test('diferencia Access Denied bloqueado de documento original capturado', () => {
  const denied = classifyDocument(403, true, 'https://example.test/', { title: 'Access Denied' });
  assert.equal(denied?.captureState, 'blocked');
  assert.match(denied?.captureMessage ?? '', /Access Denied/);
  assert.equal(classifyDocument(undefined, false, 'https://example.test/'), undefined);
});

test('classifica respostas 404 sem gerar dados de auditoria', () => {
  const result = classifyDocument(404, false, 'https://example.test/missing');
  assert.equal(result?.captureState, 'content-unavailable');
  assert.deepEqual(result?.elements, []);
  assert.deepEqual(result?.images, []);
});

test('failureSnapshot preserva estado e contexto parcial sem relatório WCAG', () => {
  const result = failureSnapshot('https://example.test/', 'timeout', 'Timeout de captura', { title: 'Documento parcial' });
  assert.equal(result.captureState, 'timeout');
  assert.equal(result.title, 'Documento parcial');
  assert.equal(result.elements.length, 0);
});

test('captura simulada preserva a URL e classifica falha de rede', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('falha simulada no endpoint CDP'); };
  try {
    await assert.rejects(
      () => captureRenderedPage('https://8.8.8.8/', { chromeEndpoint: 'http://127.0.0.1:9222', timeoutMs: 100 }),
      (error: unknown) => error instanceof Error && (error as { state?: string }).state === 'network-error' && (error as { snapshot?: { url?: string } }).snapshot?.url === 'https://8.8.8.8/',
    );
  } finally { globalThis.fetch = originalFetch; }
});
