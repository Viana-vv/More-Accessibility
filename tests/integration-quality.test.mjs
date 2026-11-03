import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(await readFile(resolve(here, 'fixtures/quality-snapshot.json'), 'utf8'));

async function modules() {
  try {
    return {
      server: await import('../dist/src/server/index.js'),
      engine: await import('../dist/src/engine/index.js'),
      comparisons: await import('../dist/src/comparisons/index.js'),
      history: await import('../dist/src/reports/history.js'),
    };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : String(error) };
  }
}

test('integra servidor local, fixture real e motor sem inventar captura', async (context) => {
  const loaded = await modules();
  if (loaded.unavailable) return context.skip(`build/API indisponível: ${loaded.unavailable}`);
  const history = new loaded.history.AuditHistory(new loaded.history.MemoryStorage());
  const running = await loaded.server.startLocalServer({ fixture: snapshot, history });
  try {
    const response = await fetch(`${running.url}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/quality-page.html' }) });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.report.snapshot.captureState, 'captured');
    assert.equal(payload.report.target.url, 'https://example.com/quality-page.html');
    assert.equal(payload.report.snapshot.url, snapshot.url);
    assert.ok(Array.isArray(payload.report.results));
    assert.ok(payload.report.id);
    assert.ok(Array.isArray(payload.report.suggestions));
    const saved = await (await fetch(`${running.url}/api/history`)).json();
    assert.equal(saved.persistent, true);
    assert.equal(saved.validReports[0].id, payload.report.id);
  } finally { await running.close(); }
});

test('captura bloqueada aparece no histórico de falhas, sem ser relatório válido', async (context) => {
  const loaded = await modules();
  if (loaded.unavailable) return context.skip(`build/API indisponível: ${loaded.unavailable}`);
  const history = new loaded.history.AuditHistory(new loaded.history.MemoryStorage());
  const running = await loaded.server.startLocalServer({ history, fixture: { ...snapshot, captureState: 'blocked', captureMessage: 'Acesso negado.' } });
  try {
    const response = await fetch(`${running.url}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/blocked' }) });
    const payload = await response.json();
    const saved = await (await fetch(`${running.url}/api/history`)).json();
    assert.equal(payload.report, undefined);
    assert.equal(saved.validReports.length, 0);
    assert.equal(saved.failedAudits.length, 1);
    assert.equal(saved.failedAudits[0].status, 'blocked');
  } finally { await running.close(); }
});

test('não fabrica relatório quando a captura falha', async (context) => {
  const loaded = await modules();
  if (loaded.unavailable) return context.skip(`build/API indisponível: ${loaded.unavailable}`);
  const running = await loaded.server.startLocalServer({ fixture: () => { throw new Error('captura bloqueada pela fixture'); } });
  try {
    const response = await fetch(`${running.url}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/' }) });
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.report, undefined);
    assert.match(payload.error, /captura bloqueada/);
  } finally { await running.close(); }
});

test('relatório e sugestões são serializáveis para exportação local', async (context) => {
  const loaded = await modules();
  if (loaded.unavailable) return context.skip(`build/API indisponível: ${loaded.unavailable}`);
  const report = { target: { url: snapshot.url }, snapshot, results: [], generatedAt: snapshot.capturedAt, captureState: 'captured' };
  const suggestions = loaded.comparisons.generateCorrectionSuggestions(report);
  const roundTrip = JSON.parse(JSON.stringify({ report, suggestions }));
  assert.equal(roundTrip.report.captureState, 'captured');
  assert.ok(Array.isArray(roundTrip.suggestions));
});
