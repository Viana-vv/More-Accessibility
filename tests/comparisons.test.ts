import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, parseStructuredContrastEvidence, suggestContrastColors } from '../src/comparisons/colors.js';
import { generateCorrectionSuggestions } from '../src/comparisons/suggestions.js';
import type { AuditReport } from '../src/shared/contracts.js';

test('calcula contraste WCAG e sugere cor que atinge AA', () => {
  assert.equal(contrastRatio('#777777', '#ffffff')?.toFixed(2), '4.48');
  const suggestion = suggestContrastColors('#777777', '#ffffff', 4.5);
  assert.ok(suggestion);
  assert.ok(suggestion.ratio >= 4.5);
});

test('aceita somente evidência estruturada de contraste', () => {
  const structured = parseStructuredContrastEvidence([{ kind: 'contrast', value: JSON.stringify({ foreground: '#777', background: '#fff', fontSizePx: 16, fontWeight: 400 }) }]);
  assert.equal(structured?.fontSizePx, 16);
  assert.equal(parseStructuredContrastEvidence([{ kind: 'computed-style', value: 'color: #777; background: #fff' }]), undefined);
});

test('não inventa alt para imagem informativa ou finalidade indeterminada', () => {
  const report = { target: { url: 'https://example.test' }, snapshot: { url: 'https://example.test', title: '', elements: [], capturedAt: '', images: [{ elementId: 'img-1', source: 'image.svg', html: '<img src="image.svg">', purpose: 'informative', attributes: {}, evidence: [], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: false }, { elementId: 'img-2', source: 'unknown.svg', html: '<img src="unknown.svg">', purpose: 'indeterminate', attributes: {}, evidence: [], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: true }] }, results: [], generatedAt: '' } satisfies AuditReport;
  const suggestions = generateCorrectionSuggestions(report);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.every((item) => item.humanReviewRequired));
  assert.ok(suggestions.every((item) => item.html === undefined));
});

test('retorna CSS calculado, contraste before/after e tokens de preview', () => {
  const report = { target: { url: 'https://example.test' }, snapshot: { url: 'https://example.test', title: '', elements: [], capturedAt: '', images: [] }, results: [{ ruleId: 'contrast', criterion: '1.4.3', description: 'Contraste insuficiente', level: 'AA', status: 'violation', evidence: [{ kind: 'contrast', value: JSON.stringify({ foreground: '#777', background: '#fff', fontSizePx: 16, fontWeight: 400 }) }] }], generatedAt: '' } satisfies AuditReport;
  const [suggestion] = generateCorrectionSuggestions(report);
  assert.equal(suggestion?.contrast?.before.toFixed(2), '4.48');
  assert.ok((suggestion?.contrast?.after ?? 0) >= 4.5);
  assert.match(suggestion?.css ?? '', /color:/);
  assert.equal(suggestion?.after, suggestion?.css);
  assert.equal(suggestion?.previewTokens?.before.foreground, '#777');
});
