import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportFixture = JSON.parse(await readFile(resolve(root, 'tests/fixtures/ui-cdp-report.json'), 'utf8'));

async function loadModules() {
  try { return { server: await import('../dist/src/server/index.js'), history: await import('../dist/src/reports/history.js') }; }
  catch (error) { return { unavailable: error instanceof Error ? error.message : String(error) }; }
}

async function cdpEndpoint() {
  const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
  try {
    const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(800) });
    const pages = await response.json();
    const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
    return page ? { endpoint, socket: page.webSocketDebuggerUrl } : undefined;
  } catch { return undefined; }
}

function cdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result || {});
  };
  const ready = new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('CDP WebSocket indisponível')); });
  async function command(method, params = {}) {
    await ready;
    const id = ++nextId;
    return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  }
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result.result?.value;
  }
  return { command, evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Condição não alcançada: ${expression}`);
}

async function viewportChecks(cdp, width, height) {
  await cdp.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const states = [];
  for (const hash of ['', '#analises', '#relatorios']) {
    await cdp.evaluate(`window.location.hash = ${JSON.stringify(hash)}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    states.push(await cdp.evaluate(`({hash: location.hash, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, visible: [...document.querySelectorAll('.view')].filter((item) => !item.hidden).map((item) => item.id)})`));
  }
  return states.map((state) => ({ ...state, viewport: `${width}x${height}`, overflow: state.scrollWidth > state.clientWidth + 1 }));
}

test('UI real via CDP cobre rotas, viewports, filtros, modal, cópia, storage, imagem e assets', async (context) => {
  const loaded = await loadModules();
  if (loaded.unavailable) return context.skip(`build/API indisponível: ${loaded.unavailable}`);
  const browser = await cdpEndpoint();
  if (!browser) return context.skip('Chromium/CDP não disponível; nenhum resultado de viewport foi simulado.');
  const staticRoot = resolve(root, 'src/ui');
  if (!existsSync(join(staticRoot, 'index.html'))) return context.skip('src/ui/index.html indisponível.');
  const logo = resolve(root, 'Logo de olho estilizado em janela roxa.png');
  const history = new loaded.history.AuditHistory(new loaded.history.MemoryStorage());
  const running = await loaded.server.startLocalServer({ staticRoot, logoPath: logo, fixture: reportFixture, history });
  const cdp = cdpClient(browser.socket);
  try {
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Browser.grantPermissions', { origin: running.url, permissions: ['clipboardReadWrite'] }).catch(() => undefined);
    await cdp.command('Page.navigate', { url: `${running.url}/#inicio` });
    await waitFor(cdp.evaluate, `document.readyState === 'complete'`);

    const viewportStates = [];
    for (const viewport of [[320, 568], [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]]) viewportStates.push(...await viewportChecks(cdp, ...viewport));
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 640, height: 1136, deviceScaleFactor: 1, mobile: false });
    const zoomOverflow = await cdp.evaluate(`(() => { document.documentElement.style.zoom = '200%'; const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; document.documentElement.style.zoom = ''; return overflow; })()`);
    assert.equal(zoomOverflow, false, 'zoom de 200% causou transbordamento horizontal');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
    const spacingOverflow = await cdp.evaluate(`(() => { const style = document.createElement('style'); style.textContent = '* { letter-spacing: .12em !important; word-spacing: .16em !important; line-height: 1.5 !important; } p { margin-bottom: 2em !important; }'; document.head.append(style); const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; style.remove(); return overflow; })()`);
    assert.equal(spacingOverflow, false, 'espaçamento de texto causou transbordamento horizontal');

    const longUrl = `https://example.com/${'path-segment-'.repeat(25)}`;
    await cdp.evaluate(`document.querySelector('#target-url').value = ${JSON.stringify(longUrl)}; document.querySelector('#scan-form').requestSubmit()`);
    await waitFor(cdp.evaluate, `!document.querySelector('#analysis-results').hidden`);
    assert.equal(await cdp.evaluate(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`), true, 'URL longa transbordou na tela de resultados a 320 CSS px');
    const imagePreview = await cdp.evaluate(`({cards: document.querySelectorAll('#image-results .image-card').length, images: document.querySelectorAll('#image-results img').length, source: document.querySelector('#image-results img')?.getAttribute('src'), text: document.querySelector('#image-results')?.textContent})`);
    assert.equal(imagePreview.images > 0 && imagePreview.source?.startsWith('data:image/gif;base64,'), true, `miniatura de fixture não carregada: ${JSON.stringify(imagePreview)}`);
    assert.equal(await cdp.evaluate(`document.querySelector('#result-status').textContent.includes('Captura')`), true);

    const filters = await cdp.evaluate(`(() => { const button = document.querySelector('[data-filter="violation"]'); button.click(); return {pressed: button.getAttribute('aria-pressed'), count: document.querySelectorAll('#rule-results .criterion-item').length}; })()`);
    assert.equal(filters.pressed, 'true');
    assert.ok(filters.count >= 1, 'filtro de violações não exibiu resultado');

    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
    await cdp.evaluate(`document.querySelector('#rule-results .criterion-item summary')?.click(); document.querySelector('#rule-results .occurrence-button')?.click()`);
    assert.equal(await cdp.evaluate(`!document.querySelector('#detail-modal').hidden && document.activeElement.matches('.modal-panel')`), true);
    assert.equal(await cdp.evaluate(`(() => { const r = document.querySelector('.modal-panel').getBoundingClientRect(); return r.width <= innerWidth && r.left >= 0 && r.right <= innerWidth; })()`), true, 'modal saiu da viewport móvel');
    assert.equal(await cdp.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', bubbles:true, cancelable:true})); return document.activeElement.id; })()`), 'modal-close', 'Tab não iniciou a navegação dentro do modal');
    assert.equal(await cdp.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab', shiftKey:true, bubbles:true, cancelable:true})); return document.activeElement.className; })()`), 'copy-button', 'Shift+Tab não permaneceu dentro do modal');
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await cdp.evaluate(`document.querySelector('#detail-modal').hidden`), true, 'Escape não fechou o modal');
    assert.equal(await cdp.evaluate(`document.activeElement.classList.contains('occurrence-button')`), true, 'foco não retornou à ocorrência');

    await cdp.evaluate(`document.querySelector('#rule-results .occurrence-button')?.click()`);
    const copy = await cdp.evaluate(`(() => { const button = document.querySelector('.copy-button'); if (!button) return {available:false}; button.click(); return {available:true}; })()`);
    assert.equal(copy.available, true, 'controle de cópia não foi renderizado');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(await cdp.evaluate(`document.querySelector('.copy-button').textContent`), /Copiado|indisponível/);

    await cdp.evaluate(`window.__downloaded = []; const old = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ window.__downloaded.push(this.download); }; window.location.hash = '#relatorios'`);
    await waitFor(cdp.evaluate, `document.querySelector('#history-list article') !== null`);
    assert.equal(await cdp.evaluate(`document.querySelectorAll('#history-actions button').length`), 2);
    await cdp.evaluate(`document.querySelector('#history-actions button').click()`);
    assert.ok((await cdp.evaluate(`window.__downloaded`)).includes('historico-wcag.json'));

    await cdp.evaluate(`localStorage.removeItem('wcag-audit-history'); window.location.hash = '#analises'; window.location.reload()`);
    await waitFor(cdp.evaluate, `!document.querySelector('#analysis-results').hidden && document.querySelector('#result-url').textContent.length > 0`);

    const asset = await fetch(`${running.url}/logo.png`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') || '', /image\/png/);
    const regenIcon = await fetch(`${running.url}/icons/contrast.svg`);
    assert.equal(regenIcon.status, 200);
    assert.match(regenIcon.headers.get('content-type') || '', /image\/svg\+xml/);
    const pageA11y = await cdp.evaluate(`({title: document.title, logoAlt: document.querySelector('.brand img')?.alt, focus: getComputedStyle(document.querySelector('.nav-link')).color})`);
    assert.match(pageA11y.title, /acessibilidade/i);
    assert.ok(pageA11y.logoAlt);
    assert.ok(pageA11y.focus);
    assert.equal(await cdp.evaluate(`document.querySelector('.brand img')?.naturalWidth > 0`), true, 'logo não carregou na interface');
    assert.equal(await cdp.evaluate(`document.querySelectorAll('.category-icon').length > 0`), true, 'nenhum ícone de categoria foi renderizado');
    assert.ok(await cdp.evaluate(`![...document.querySelectorAll('.category-icon')].some(icon => !icon.complete || icon.naturalWidth === 0)`), 'ícone Regen falhou ao carregar');
    assert.deepEqual(viewportStates.filter((state) => state.overflow).map((state) => `${state.viewport} ${state.hash}: ${state.scrollWidth} > ${state.clientWidth}`), [], 'overflow horizontal detectado');
    assert.equal(viewportStates.filter((state) => state.visible.length !== 1).length, 0, 'alguma rota deixou múltiplas views visíveis');
  } finally {
    cdp.close();
    await running.close();
  }
});
