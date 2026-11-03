import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, relativeLuminance, auditSnapshot, collectImageAnalyses } from '../dist/src/engine/index.js';

const element = (id, tagName, options = {}) => ({ id, tagName, html: options.html ?? `<${tagName}>${options.textContent ?? ''}</${tagName}>`, textContent: options.textContent ?? '', attributes: options.attributes ?? {}, computedStyle: options.computedStyle ?? {}, parentIds: options.parentIds ?? [], ...(options.accessibleName === undefined ? {} : { accessibleName: options.accessibleName }), ...(options.rect === undefined ? {} : { rect: options.rect }) });
const snapshot = (elements) => ({ url: 'https://example.test/', title: 'Teste', elements, images: [], capturedAt: new Date().toISOString() });

test('calcula luminância e contraste WCAG', () => {
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
  assert.ok(Math.abs(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.01);
});

test('ocorrências possuem identificador estável, localização e dados de remediação', () => {
  const input = element('field-1', 'input', { attributes: { id: 'email', type: 'email' }, html: '<input id="email" type="email">' });
  const first = auditSnapshot(snapshot([input])).results.find((item) => item.ruleId === 'wcag-3.3.2-labels');
  const second = auditSnapshot(snapshot([input])).results.find((item) => item.ruleId === 'wcag-3.3.2-labels');
  assert.equal(first?.occurrenceId, second?.occurrenceId);
  assert.deepEqual(first?.categoryKey, { criterion: '3.3.2', rule: 'wcag-3.3.2-labels', elementId: 'field-1', kind: 'labels' });
  assert.equal(first?.selector, 'input#email');
  assert.equal(first?.html, input.html);
  assert.equal(first?.impact, 'serious');
  assert.match(first?.remediation ?? '', /label/i);
  assert.match(first?.expectedResult ?? '', /rótulo/i);
});

test('não avalia WCAG quando a captura é inválida', () => {
  const report = auditSnapshot({ ...snapshot([element('button-1', 'button')]), captureState: 'timeout', captureMessage: 'Tempo excedido' });
  assert.equal(report.captureState, 'timeout');
  assert.equal(report.captureMessage, 'Tempo excedido');
  assert.deepEqual(report.results, []);
});

test('analisa SVG, role=img e imagens CSS sem duplicar ocorrências do mesmo candidato', () => {
  const images = collectImageAnalyses([
    element('svg-1', 'svg', { attributes: { role: 'img' } }),
    element('role-img', 'div', { attributes: { role: 'img', 'aria-label': 'Logotipo' } }),
    element('css-image', 'div', { computedStyle: { backgroundImage: 'url(/hero.png)' } }),
  ]);
  assert.deepEqual(images.map((image) => image.elementId), ['svg-1', 'role-img', 'css-image']);
  assert.equal(images[1].purpose, 'indeterminate');
  assert.equal(images[2].humanReviewRequired, true);
});

test('classifica imagem decorativa como sugestão contextual, sem afirmar além da evidência', () => {
  const images = collectImageAnalyses([element('img-1', 'img', { attributes: { src: '/shape.svg', alt: '' } })]);
  assert.equal(images[0].purpose, 'decorative');
  assert.equal(images[0].humanReviewRequired, false);
  assert.match(images[0].evidence.map((item) => item.kind).join(','), /alt-attribute/);
});

test('marca imagem sem contexto como indeterminada e exige revisão humana', () => {
  const images = collectImageAnalyses([element('img-1', 'img', { attributes: { src: '/photo.jpg' } })]);
  assert.equal(images[0].purpose, 'indeterminate');
  assert.equal(images[0].humanReviewRequired, true);
});

test('mantém as quatro finalidades de imagem distintas e não valida a qualidade do alt automaticamente', () => {
  const images = collectImageAnalyses([
    element('decorative', 'img', { attributes: { alt: '' } }),
    element('informative', 'img', { attributes: { alt: 'Descrição fornecida' } }),
    element('functional', 'img', { attributes: { alt: '' }, parentIds: ['button'] }),
    element('button', 'button', { accessibleName: 'Abrir menu' }),
    element('unknown', 'img'),
  ]);
  assert.deepEqual(images.map((image) => image.purpose), ['decorative', 'informative', 'functional', 'indeterminate']);
  assert.equal(images[1].humanReviewRequired, true);
});

test('não exige alt redundante para ícone de botão nomeado', () => {
  const button = element('button-1', 'button', { accessibleName: 'Pesquisar' });
  const image = element('img-1', 'img', { attributes: { src: '/search.svg', alt: '' }, parentIds: ['button-1'] });
  const images = collectImageAnalyses([button, image]);
  assert.equal(images[0].purpose, 'functional');
  assert.equal(images[0].humanReviewRequired, false);
});

test('auditoria reporta controle sem nome, link vazio e heading vazio', () => {
  const report = auditSnapshot(snapshot([
    element('button-1', 'button'),
    element('link-1', 'a', { attributes: { href: '/x' } }),
    element('heading-1', 'h2'),
  ]));
  const violations = report.results.filter((item) => item.status === 'violation');
  assert.deepEqual(violations.map((item) => item.ruleId).sort(), ['wcag-1.3.1-headings', 'wcag-2.4.4-links', 'wcag-4.1.2-control-name', 'wcag-4.1.2-control-name']);
});

test('contraste insuficiente é violação e contraste não observável não é inventado', () => {
  const bad = element('text-1', 'p', { textContent: 'Texto', computedStyle: { color: '#777777', backgroundColor: '#ffffff', fontSize: '16px' } });
  const unknown = element('text-2', 'p', { textContent: 'Texto' });
  const report = auditSnapshot(snapshot([bad, unknown]));
  assert.equal(report.results.find((item) => item.ruleId === 'wcag-1.4.3-contrast' && item.evidence.some((e) => e.source === 'element:text-1'))?.status, 'violation');
  assert.equal(report.results.filter((item) => item.ruleId === 'wcag-1.4.3-contrast').length, 2);
  assert.equal(report.results.find((item) => item.evidence.some((e) => e.source === 'element:text-2'))?.status, 'review');
});

test('ignora title e elementos ocultos ao procurar conteúdo renderizado', () => {
  const report = auditSnapshot(snapshot([
    element('title-1', 'title', { textContent: 'Falso título' }),
    element('hidden-1', 'p', { textContent: 'Oculto', computedStyle: { display: 'none', color: '#777777', backgroundColor: '#fff' } }),
    element('visible-1', 'p', { textContent: 'Visível', computedStyle: { color: '#777777', backgroundColor: '#fff' } }),
  ]));
  assert.equal(report.results.some((item) => item.html?.includes('Falso título')), false);
  assert.equal(report.results.some((item) => item.html?.includes('Oculto')), false);
  assert.equal(report.results.some((item) => item.html?.includes('Visível')), true);
});

test('resolve fundo transparente pelo ancestral opaco e revisa composição incerta', () => {
  const report = auditSnapshot(snapshot([
    element('panel', 'div', { computedStyle: { backgroundColor: '#ffffff' } }),
    element('child', 'p', { textContent: 'Texto', parentIds: ['panel'], computedStyle: { color: '#777777', backgroundColor: 'transparent' } }),
    element('composed', 'p', { textContent: 'Composição', computedStyle: { color: '#000000', backgroundColor: 'rgba(255, 255, 255, 0.5)' } }),
  ]));
  assert.equal(report.results.find((item) => item.evidence.some((e) => e.source === 'element:child'))?.status, 'violation');
  assert.equal(report.results.find((item) => item.evidence.some((e) => e.source === 'element:composed'))?.status, 'review');
});
