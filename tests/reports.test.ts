import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditReport } from '../src/shared/contracts.js';
import { generateCorrectionSuggestions } from '../src/comparisons/suggestions.js';
import { AuditHistory } from '../src/reports/history.js';
import { exportAuditHtml, exportAuditJson, exportHistoryHtml, exportHistoryJson } from '../src/reports/export.js';

const report: AuditReport = {
  target: { url: 'https://example.test/page' },
  snapshot: { url: 'https://example.test/page', title: 'Página real', elements: [], images: [{ elementId: 'image-1', source: 'photo.jpg', html: '<img src="photo.jpg" alt="" />', purpose: 'decorative', attributes: { alt: '' }, evidence: [{ kind: 'alt-attribute', value: '' }], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: false }], capturedAt: '2026-11-03T00:00:00.000Z' },
  results: [
    { ruleId: 'wcag-1.4.3-contrast', criterion: '1.4.3', description: 'Contraste mínimo', level: 'AA', status: 'violation', evidence: [{ kind: 'contrast', value: JSON.stringify({ foreground: '#777', background: '#fff', fontSizePx: 16, fontWeight: 400 }) }] },
    { ruleId: 'wcag-4.1.2-control-name', criterion: '4.1.2', description: 'Nome do controle', level: 'A', status: 'violation', evidence: [{ kind: 'element-html', value: '<button id="save"></button>' }, { kind: 'corrected-html', value: '<button id="save" aria-label="Salvar"></button>' }] },
    { ruleId: 'wcag-3.3.2-labels', criterion: '3.3.2', description: 'Rótulo do campo', level: 'A', status: 'violation', evidence: [{ kind: 'element-html', value: '<input id="email" type="email">' }, { kind: 'corrected-html', value: '<label for="email">E-mail</label><input id="email" type="email">' }] },
  ],
  generatedAt: '2026-11-03T00:00:00.000Z',
};

test('sugestões incluem contraste, CSS calculado, HTML copiável e resultado esperado', () => {
  const suggestions = generateCorrectionSuggestions(report);
  const contrast = suggestions.find((item) => item.ruleId === 'wcag-1.4.3-contrast');
  const control = suggestions.find((item) => item.ruleId === 'wcag-4.1.2-control-name');
  const form = suggestions.find((item) => item.ruleId === 'wcag-3.3.2-labels');
  assert.equal(contrast?.contrast?.before.toFixed(2), '4.48');
  assert.match(contrast?.css ?? '', /color:/);
  assert.match(contrast?.expectedResult ?? '', /proporção/);
  assert.equal(contrast?.after, contrast?.css);
  assert.equal(control?.html, '<button id="save" aria-label="Salvar"></button>');
  assert.equal(form?.html, '<label for="email">E-mail</label><input id="email" type="email">');
  assert.match(suggestions.find((item) => item.ruleId === '1.1.1')?.after ?? '', /alt=""/);
});

test('histórico separa relatórios válidos de falhas e persiste no storage', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  const history = new AuditHistory(storage);
  history.recordValid(report);
  history.recordFailure({ id: 'timeout-1', occurredAt: '2026-11-03T00:01:00.000Z', target: report.target, message: 'Tempo limite excedido' });
  const restored = new AuditHistory(storage);
  assert.equal(restored.listValid().length, 1);
  assert.equal(restored.listFailures().length, 1);
  assert.match(exportHistoryJson(restored), /timeout-1/);
  assert.match(exportHistoryHtml(restored), /Auditorias válidas/);
});

test('exportações usam dados reais, são responsivas e escapam HTML', () => {
  const html = exportAuditHtml(report);
  const json = exportAuditJson(report);
  assert.match(html, /Página real/);
  assert.match(html, /&lt;button/);
  assert.match(html, /viewport/);
  assert.match(html, /@media/);
  assert.match(json, /wcag-1\.4\.3-contrast/);
  assert.match(json, /aria-label/);
});
