import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFor, filterResults, summarizeCategories, CATEGORIES } from '../src/ui/filter-model.js';

const results = [
  { occurrenceId: 'link-1', criterion: '2.4.4', status: 'violation' },
  { occurrenceId: 'link-2', criterion: '2.4.4', status: 'review' },
  { occurrenceId: 'image-1', criterion: '1.1.1', status: 'review' },
  { occurrenceId: 'button-1', criterion: '4.1.2', status: 'violation' },
  { occurrenceId: 'pass-1', criterion: '2.4.4', status: 'pass' },
];

test('filtro combinado retorna somente violações de links', () => {
  assert.deepEqual(filterResults(results, { status: 'violation', category: CATEGORIES.links }).map((item) => item.occurrenceId), ['link-1']);
});

test('filtro combinado retorna somente revisões de imagens', () => {
  assert.deepEqual(filterResults(results, { status: 'review', category: CATEGORIES.images }).map((item) => item.occurrenceId), ['image-1']);
});

test('categorias são estruturadas por critério e contagens reais', () => {
  const summary = summarizeCategories(results);
  assert.equal(categoryFor(results[0]), CATEGORIES.links);
  assert.deepEqual(summary[CATEGORIES.links], { violations: 1, reviews: 1, total: 2 });
  assert.equal(filterResults(results).some((item) => item.status === 'pass'), false);
});
