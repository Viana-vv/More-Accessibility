import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, suggestContrastColors } from '../src/comparisons/colors.js';
import { generateCorrectionSuggestions } from '../src/comparisons/suggestions.js';
import type { AuditReport } from '../src/shared/contracts.js';

test('calcula contraste WCAG e sugere cor que atinge AA', () => {
  assert.equal(contrastRatio('#777777', '#ffffff')?.toFixed(2), '4.48');
  const suggestion = suggestContrastColors('#777777', '#ffffff', 4.5);
  assert.ok(suggestion);
  assert.ok(suggestion.ratio >= 4.5);
});

test('não inventa alt para imagem informativa ou finalidade indeterminada', () => {
  const report = { target: { url: 'https://example.test' }, snapshot: { url: 'https://example.test', title: '', elements: [], capturedAt: '', images: [{ elementId: 'img-1', source: 'image.svg', html: '<img src="image.svg">', purpose: 'informative-or-functional', attributes: {}, evidence: [], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: false }, { elementId: 'img-2', source: 'unknown.svg', html: '<img src="unknown.svg">', purpose: 'indeterminate', attributes: {}, evidence: [], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: true }] }, results: [], generatedAt: '' } satisfies AuditReport;
  const suggestions = generateCorrectionSuggestions(report);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.every((item) => item.humanReviewRequired));
  assert.ok(suggestions.every((item) => item.html === undefined));
});

test('gera correção de contraste apenas com cores presentes nas evidências', () => {
  const report = { target: { url: 'https://example.test' }, snapshot: { url: 'https://example.test', title: '', elements: [], images: [], capturedAt: '' }, results: [{ ruleId: 'contrast', criterion: '1.4.3', description: 'Contraste insuficiente', level: 'AA', status: 'violation', evidence: [{ kind: 'computed-style', value: 'color: #777; background-color: #fff' }] }] , generatedAt: '' } satisfies AuditReport;
  const [suggestion] = generateCorrectionSuggestions(report);
  assert.match(suggestion?.css ?? '', /color:/);
  assert.match(suggestion?.after ?? '', /:1/);
});
