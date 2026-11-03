import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AuditReport } from '../src/shared/contracts.js';
import { AuditHistory, FileHistoryStorage, HistoryStorageError, MemoryStorage } from '../src/reports/history.js';

const report: AuditReport = {
  target: { url: 'https://example.test/page' },
  snapshot: { url: 'https://example.test/page', title: 'Página', elements: [], images: [], capturedAt: '2026-11-03T00:00:00.000Z', captureState: 'captured' },
  results: [], generatedAt: '2026-11-03T00:00:01.000Z', captureState: 'captured',
};

test('histórico em arquivo sobrevive a uma nova instância', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'accessibility-history-'));
  const file = path.join(directory, 'history.json');
  try {
    new AuditHistory(new FileHistoryStorage(file)).recordValid(report);
    new AuditHistory(new FileHistoryStorage(file)).recordFailure({ id: 'capture-1', occurredAt: '2026-11-03T00:01:00.000Z', url: report.target.url, status: 'unknown', message: 'Falha sem classificação.' });
    const restored = new AuditHistory(new FileHistoryStorage(file));
    assert.equal(restored.listValid()[0]?.target.url, report.target.url);
    assert.equal(restored.listFailures()[0]?.status, 'unknown');
    assert.match(await readFile(file, 'utf8'), /capture-1/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('falha de armazenamento é propagada e não transforma auditoria em sucesso', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('disco indisponível'); } };
  const history = new AuditHistory(storage);
  assert.throws(() => history.recordValid(report), HistoryStorageError);
  assert.equal(history.listValid().length, 0);
});

test('falhas exigem identificador, data e mensagem, mas status unknown é válido', () => {
  const history = new AuditHistory(new MemoryStorage());
  history.recordFailure({ id: 'unknown-1', occurredAt: '2026-11-03T00:00:00.000Z', message: 'Erro antes da classificação.' });
  assert.equal(history.listFailures()[0]?.status, 'unknown');
  assert.throws(() => history.recordFailure({ id: '', occurredAt: 'invalid', message: '' }));
});

test('relatório com captura inválida não entra no histórico válido', () => {
  const history = new AuditHistory(new MemoryStorage());
  assert.throws(() => history.recordValid({ ...report, captureState: 'blocked' }));
  assert.equal(history.listValid().length, 0);
});

