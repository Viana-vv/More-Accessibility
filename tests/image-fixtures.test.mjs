import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const html = await readFile(resolve(root, 'images-cases.html'), 'utf8');
const cases = JSON.parse(await readFile(resolve(root, 'images-cases.json'), 'utf8'));

test('fixture contém os dez casos obrigatórios de imagens', () => {
  assert.equal(cases.length, 10);
  for (const item of cases) assert.match(html, new RegExp(`(?:id=|id=")${item.id}`));
});

test('casos de controles preservam a evidência de nome acessível', () => {
  assert.match(html, /button id="control-05" aria-label="Pesquisar"/);
  assert.match(html, /button id="control-06"><img/);
  assert.match(html, /a id="control-07" href="\/inicio"><img[^>]+alt="Página inicial"/);
});

test('CSS image cases are explicit and not auto-classified as decorative', () => {
  assert.match(html, /id="image-08" class="decorative-bg" aria-hidden="true"/);
  assert.match(html, /id="image-09" class="informative-bg"/);
  assert.equal(cases.find((item) => item.id === 'image-09').humanReviewRequired, true);
});

test('fixture não transforma atributos em conclusões infalíveis', () => {
  assert.equal(cases.find((item) => item.id === 'image-02').humanReviewRequired, true);
  assert.equal(cases.find((item) => item.id === 'image-04').humanReviewRequired, true);
});
