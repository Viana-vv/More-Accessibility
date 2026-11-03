import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AuditHistory, FileHistoryStorage, MemoryStorage } from '../dist/src/reports/history.js';

const report = {
  id: 'audit-1',
  target: { url: 'https://example.test/page' },
  snapshot: { url: 'https://example.test/page', title: 'Teste', elements: [], images: [], capturedAt: '2026-11-03T00:00:00.000Z', captureState: 'captured' },
  results: [], generatedAt: '2026-11-03T00:00:01.000Z', captureState: 'captured',
};

test('histórico em arquivo persiste auditorias e falhas entre instâncias', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wcag-history-'));
  const file = path.join(directory, 'history.json');
  try {
    const first = new AuditHistory(new FileHistoryStorage(file));
    first.recordValid(report);
    first.recordFailure({ id: 'failure-1', occurredAt: '2026-11-03T00:01:00.000Z', url: report.target.url, status: 'blocked', message: 'Acesso negado.' });
    const restored = new AuditHistory(new FileHistoryStorage(file));
    assert.equal(restored.listValid()[0].id, 'audit-1');
    assert.equal(restored.listFailures()[0].status, 'blocked');
    assert.match(await readFile(file, 'utf8'), /audit-1/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('histórico incompatível é avisado e o conteúdo original não é sobrescrito', () => {
  const storage = new MemoryStorage();
  const raw = '{"validReports":[{"legacy":true}],"failedAudits":[]}';
  storage.setItem('wcag-audit-history', raw);
  const history = new AuditHistory(storage);
  assert.equal(history.listValid().length, 0);
  assert.match(history.loadWarning || '', /incompatível/);
  assert.equal(storage.getItem('wcag-audit-history'), raw);
});

test('arquivo incompatível recebe cópia de preservação antes de aceitar novas análises', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wcag-history-invalid-'));
  const file = path.join(directory, 'history.json');
  try {
    await writeFile(file, '{"legacy":true}', 'utf8');
    const history = new AuditHistory(new FileHistoryStorage(file));
    assert.match(history.loadWarning || '', /incompatível/);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { legacy: true });
    assert.equal((await readdir(directory)).some((name) => name.startsWith('history.json.invalid-')), true);
    history.recordValid(report);
    assert.equal(new AuditHistory(new FileHistoryStorage(file)).listValid()[0].id, 'audit-1');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
