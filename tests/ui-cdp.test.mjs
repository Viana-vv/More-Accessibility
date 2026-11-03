import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportFixture = JSON.parse(await readFile(resolve(root, 'tests/fixtures/ui-cdp-report.json'), 'utf8'));

async function loadModules() {
  try { return { server: await import('../dist/src/server/index.js') }; }
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
  const running = await loaded.server.startLocalServer({ staticRoot, logoPath: logo, fixture: reportFixture });
  const cdp = cdpClient(browser.socket);
  try {
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Browser.grantPermissions', { origin: running.url, permissions: ['clipboardReadWrite'] }).catch(() => undefined);
    await cdp.command('Page.navigate', { url: `${running.url}/#inicio` });
    await waitFor(cdp.evaluate, `document.readyState === 'complete'`);

    const viewportStates = [];
    for (const viewport of [[320, 800], [375, 812], [768, 900], [1024, 768], [1440, 900], [1920, 1080]]) viewportStates.push(...await viewportChecks(cdp, ...viewport));

    await cdp.evaluate(`document.querySelector('#target-url').value = 'https://example.com/fixture'; document.querySelector('#scan-form').requestSubmit()`);
    await waitFor(cdp.evaluate, `!document.querySelector('#analysis-results').hidden`);
    assert.equal(await cdp.evaluate(`document.querySelector('#image-results img')?.src.startsWith('data:image/svg+xml')`), true, 'resolver de imagem não preservou a origem');
    assert.equal(await cdp.evaluate(`document.querySelector('#result-status').textContent.includes('Captura')`), true);

    const filters = await cdp.evaluate(`(() => { const button = document.querySelector('[data-filter="violation"]'); button.click(); return {pressed: button.getAttribute('aria-pressed'), count: document.querySelectorAll('#rule-results .criterion-item').length}; })()`);
    assert.equal(filters.pressed, 'true');
    assert.ok(filters.count >= 1, 'filtro de violações não exibiu resultado');

    await cdp.evaluate(`document.querySelector('#rule-results summary')?.click()`);
    assert.equal(await cdp.evaluate(`!document.querySelector('#detail-modal').hidden && document.activeElement.matches('.modal-panel')`), true);
    await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await cdp.evaluate(`document.querySelector('#detail-modal').hidden`), true, 'Escape não fechou o modal');

    await cdp.evaluate(`document.querySelector('#rule-results summary')?.click()`);
    const copy = await cdp.evaluate(`(() => { const button = document.querySelector('.copy-button'); if (!button) return {available:false}; button.click(); return {available:true}; })()`);
    assert.equal(copy.available, true, 'controle de cópia não foi renderizado');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(await cdp.evaluate(`document.querySelector('.copy-button').textContent`), /Copiado|indisponível/);

    await cdp.evaluate(`window.__downloaded = []; const old = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ window.__downloaded.push(this.download); }; window.location.hash = '#relatorios'`);
    await waitFor(cdp.evaluate, `document.querySelector('#history-list article') !== null`);
    assert.equal(await cdp.evaluate(`document.querySelectorAll('#history-actions button').length`), 2);
    await cdp.evaluate(`document.querySelector('#history-actions button').click()`);
    assert.ok((await cdp.evaluate(`window.__downloaded`)).includes('historico-wcag.json'));

    const asset = await fetch(`${running.url}/logo.png`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') || '', /image\/png/);
    const pageA11y = await cdp.evaluate(`({title: document.title, logoAlt: document.querySelector('.brand img')?.alt, focus: getComputedStyle(document.querySelector('.nav-link')).color})`);
    assert.match(pageA11y.title, /acessibilidade/i);
    assert.ok(pageA11y.logoAlt);
    assert.ok(pageA11y.focus);
    assert.deepEqual(viewportStates.filter((state) => state.overflow).map((state) => `${state.viewport} ${state.hash}: ${state.scrollWidth} > ${state.clientWidth}`), [], 'overflow horizontal detectado');
    assert.equal(viewportStates.filter((state) => state.visible.length !== 1).length, 0, 'alguma rota deixou múltiplas views visíveis');
  } finally {
    cdp.close();
    await running.close();
  }
});
