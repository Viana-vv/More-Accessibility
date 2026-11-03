import { setTimeout as delay } from 'node:timers/promises';
import type { RenderedPageSnapshot } from '../shared/contracts.js';
import { validateExternalUrl, UrlPolicyError } from './url-policy.js';

type CdpMessage = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
type EventHandler = (params: Record<string, unknown>) => void | Promise<void>;

class CdpClient {
  private socket: WebSocket | undefined;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private handlers = new Map<string, Set<EventHandler>>();

  async connect(endpoint: string, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      const timer = setTimeout(() => { socket.close(); reject(new Error('Timeout ao conectar ao Chrome.')); }, timeoutMs);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Não foi possível conectar ao Chrome DevTools Protocol.')); };
      socket.onmessage = event => this.receive(String(event.data));
      socket.onclose = () => { for (const item of this.pending.values()) item.reject(new Error('Sessão CDP encerrada.')); this.pending.clear(); };
    });
  }

  on(method: string, handler: EventHandler): void {
    const handlers = this.handlers.get(method) ?? new Set<EventHandler>(); handlers.add(handler); this.handlers.set(method, handlers);
  }

  async command(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Sessão CDP não conectada.');
    const id = ++this.nextId;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout no comando CDP ${method}.`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer }); this.socket?.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void { this.socket?.close(); this.socket = undefined; }

  private receive(raw: string): void {
    let message: CdpMessage; try { message = JSON.parse(raw) as CdpMessage; } catch { return; }
    if (message.id !== undefined) {
      const item = this.pending.get(message.id); if (!item) return; clearTimeout(item.timer); this.pending.delete(message.id);
      if (message.error) item.reject(new Error(`Comando CDP recusado: ${message.error.message}`)); else item.resolve(message.result ?? {}); return;
    }
    if (message.method && message.params) for (const handler of this.handlers.get(message.method) ?? []) void handler(message.params);
  }
}

const SNAPSHOT_SCRIPT = `(() => {
  const nodes = [...document.querySelectorAll('*')]; const ids = new Map();
  nodes.forEach((node, index) => ids.set(node, 'el-' + (index + 1)));
  const attrs = node => Object.fromEntries([...node.attributes].map(a => [a.name, a.value]));
  const styles = node => { const s = getComputedStyle(node); const keys = ['display','visibility','color','backgroundColor','backgroundImage','fontSize','fontWeight','lineHeight','outlineStyle','outlineWidth','position','width','height']; return Object.fromEntries(keys.map(k => [k, s[k]])); };
  const text = node => (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000);
  const elements = nodes.map(node => { const attributes = attrs(node); const labelText = node.labels ? [...node.labels].map(label => text(label)).join(' ') : ''; if (labelText) attributes['label-text'] = labelText; const labelledBy = node.getAttribute('aria-labelledby'); const labelledText = labelledBy ? labelledBy.split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() : ''; return { id: ids.get(node), tagName: node.tagName.toLowerCase(), html: node.outerHTML.slice(0, 10000), textContent: text(node), attributes, computedStyle: styles(node), parentIds: [...node.parentElement ? [node.parentElement] : []].map(parent => ids.get(parent)).filter(Boolean), accessibleName: node.getAttribute('aria-label') || labelledText || labelText || node.getAttribute('title') || (node.tagName === 'IMG' ? node.getAttribute('alt') || undefined : /^(BUTTON|A)$/.test(node.tagName) ? text(node).slice(0, 200) : undefined), rect: (() => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; })() }; });
  const images = [];
  for (const node of nodes) { const isImg = node.tagName === 'IMG'; const bg = getComputedStyle(node).backgroundImage; if (!isImg && (!bg || bg === 'none')) continue; const source = isImg ? node.currentSrc || node.getAttribute('src') || '' : bg; images.push({ elementId: ids.get(node), source, html: node.outerHTML.slice(0,10000), purpose: 'indeterminate', attributes: attrs(node), evidence: [{kind:'context', value: isImg ? 'Elemento img' : 'Imagem aplicada por CSS'}], relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: true, suggestedFix: undefined }); }
  return { url: location.href, title: document.title, elements, images, capturedAt: new Date().toISOString() };
})()`;

export interface CdpSnapshotOptions { chromeEndpoint?: string; timeoutMs?: number; }

async function chromeWebSocketUrl(endpoint: string, timeoutMs: number): Promise<string> {
  const response = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`O navegador respondeu ${response.status} ao consultar as abas CDP.`);
  const pages = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
  const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('O navegador não informou uma aba disponível para análise.');
  return page.webSocketDebuggerUrl;
}

export async function captureRenderedPage(inputUrl: string, options: CdpSnapshotOptions = {}): Promise<RenderedPageSnapshot> {
  const timeoutMs = options.timeoutMs ?? 30000;
  await validateExternalUrl(inputUrl);
  const endpoint = options.chromeEndpoint ?? 'http://127.0.0.1:9222';
  const socketUrl = await chromeWebSocketUrl(endpoint, Math.min(timeoutMs, 5000));
  const cdp = new CdpClient();
  const blocked = { value: '' };
  try {
    await cdp.connect(socketUrl, 5000);
    await cdp.command('Page.enable'); await cdp.command('Runtime.enable'); await cdp.command('Fetch.enable', { patterns: [{ requestStage: 'Request' }] });
    cdp.on('Fetch.requestPaused', async params => {
      const requestId = String(params.requestId); const request = params.request as { url?: string } | undefined;
      try { await validateExternalUrl(request?.url ?? ''); await cdp.command('Fetch.continueRequest', { requestId }); }
      catch (error) { blocked.value = error instanceof Error ? error.message : 'Requisição bloqueada.'; await cdp.command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => undefined); }
    });
    await cdp.command('Page.navigate', { url: inputUrl });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) { if (blocked.value) throw new UrlPolicyError(blocked.value); try { const state = await cdp.command('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }); if (state.result && (state.result as { value?: string }).value === 'complete') break; } catch { /* navigation still starting */ } await delay(100); }
    const result = await cdp.command('Runtime.evaluate', { expression: SNAPSHOT_SCRIPT, returnByValue: true });
    const value = (result.result as { value?: RenderedPageSnapshot } | undefined)?.value;
    if (!value) throw new Error('Chrome não retornou um snapshot válido.');
    await cdp.command('Fetch.disable').catch(() => undefined);
    return value;
  } finally { cdp.close(); }
}

