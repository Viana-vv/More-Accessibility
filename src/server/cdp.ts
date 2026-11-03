import { setTimeout as delay } from 'node:timers/promises';
import type { CaptureState, RenderedPageSnapshot } from '../shared/contracts.js';
import { validateExternalUrl, UrlPolicyError } from './url-policy.js';

type CdpMessage = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
type EventHandler = (params: Record<string, unknown>) => void | Promise<void>;

export class CaptureError extends Error {
  constructor(readonly state: Exclude<CaptureState, 'captured'>, message: string, readonly snapshot?: RenderedPageSnapshot) { super(message); this.name = 'CaptureError'; }
}

class CdpClient {
  private socket: WebSocket | undefined;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private handlers = new Map<string, Set<EventHandler>>();

  async connect(endpoint: string, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(endpoint); this.socket = socket;
      const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => { socket.close(); fail(new CaptureError('timeout', 'Timeout ao conectar ao Chrome DevTools Protocol.')); }, timeoutMs);
      socket.onopen = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
      socket.onerror = () => fail(new CaptureError('network-error', 'Não foi possível conectar ao Chrome DevTools Protocol.'));
      socket.onmessage = event => this.receive(String(event.data));
      socket.onclose = () => { for (const item of this.pending.values()) item.reject(new Error('Sessão CDP encerrada.')); this.pending.clear(); if (!settled) fail(new CaptureError('network-error', 'Sessão CDP encerrada antes da conexão.')); };
    });
  }

  on(method: string, handler: EventHandler): void {
    const handlers = this.handlers.get(method) ?? new Set<EventHandler>(); handlers.add(handler); this.handlers.set(method, handlers);
  }

  async command(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new CaptureError('network-error', 'Sessão CDP não conectada.');
    const id = ++this.nextId;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new CaptureError('timeout', `Timeout no comando CDP ${method}.`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket?.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error instanceof Error ? error : new Error('Falha ao enviar comando CDP.')); }
    });
  }

  close(): void { this.socket?.close(); this.socket = undefined; }

  private receive(raw: string): void {
    let message: CdpMessage; try { message = JSON.parse(raw) as CdpMessage; } catch { return; }
    if (message.id !== undefined) {
      const item = this.pending.get(message.id); if (!item) return; clearTimeout(item.timer); this.pending.delete(message.id);
      if (message.error) item.reject(new Error(`Comando CDP recusado: ${message.error.message}`)); else item.resolve(message.result ?? {}); return;
    }
    if (message.method && message.params) for (const handler of this.handlers.get(message.method) ?? []) void Promise.resolve(handler(message.params)).catch(() => undefined);
  }
}

const SNAPSHOT_SCRIPT = `(() => {
  const documents = [];
  const visit = (doc) => { if (!doc || documents.includes(doc)) return; documents.push(doc); for (const frame of doc.querySelectorAll('iframe,frame')) { try { visit(frame.contentDocument); } catch {} } };
  visit(document);
  const nodes = documents.flatMap(doc => [...doc.querySelectorAll('*')]); const ids = new Map();
  nodes.forEach((node, index) => ids.set(node, 'el-' + (index + 1)));
  const attrs = node => Object.fromEntries([...node.attributes].map(a => [a.name, a.value]));
  const styles = node => { const s = node.ownerDocument.defaultView.getComputedStyle(node); const keys = ['display','visibility','color','backgroundColor','backgroundImage','fontSize','fontWeight','lineHeight','outlineStyle','outlineWidth','position','width','height']; return Object.fromEntries(keys.map(k => [k, s[k]])); };
  const text = node => (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 2000);
  const labelledText = node => { const value = node.getAttribute('aria-labelledby'); return value ? value.split(/\\s+/).map(id => node.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim() : ''; };
  const elements = nodes.map(node => { const attributes = attrs(node); const labelText = node.labels ? [...node.labels].map(label => text(label)).join(' ') : ''; if (labelText) attributes['label-text'] = labelText; const frame = /^(IFRAME|FRAME)$/.test(node.tagName); if (frame) { try { attributes['frame-url'] = node.contentWindow.location.href; } catch { attributes['frame-url'] = node.getAttribute('src') || ''; } } const name = node.getAttribute('aria-label') || labelledText(node) || labelText || node.getAttribute('title') || (node.tagName === 'IMG' ? node.getAttribute('alt') || undefined : /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName) ? text(node).slice(0, 200) : undefined); return { id: ids.get(node), tagName: node.tagName.toLowerCase(), html: node.outerHTML.slice(0, 10000), textContent: text(node), attributes, computedStyle: styles(node), parentIds: [...node.parentElement ? [node.parentElement] : []].map(parent => ids.get(parent)).filter(Boolean), accessibleName: name, rect: (() => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; })() }; });
  const images = [];
  for (const node of nodes) { const isImg = node.tagName === 'IMG'; const isSvg = node.tagName === 'SVG'; const roleImg = node.getAttribute('role') === 'img'; const bg = node.ownerDocument.defaultView.getComputedStyle(node).backgroundImage; if (!isImg && !isSvg && !roleImg && (!bg || bg === 'none')) continue; const source = isImg ? node.currentSrc || node.getAttribute('src') || '' : isSvg || roleImg ? node.getAttribute('src') || node.outerHTML.slice(0,10000) : bg; const evidence = [{kind:'context', value: isImg ? 'Elemento img' : isSvg ? 'Elemento svg' : roleImg ? 'Elemento com role=img' : 'Imagem aplicada por CSS'}]; if (node.getAttribute('alt') !== null) evidence.push({kind:'alt-attribute', value: node.getAttribute('alt') || ''}); if (node.getAttribute('aria-label')) evidence.push({kind:'aria-label', value: node.getAttribute('aria-label')}); images.push({ elementId: ids.get(node), source, html: node.outerHTML.slice(0,10000), purpose: 'indeterminate', attributes: attrs(node), evidence, relatedCriteria: ['1.1.1'], issues: [], humanReviewRequired: true }); }
  const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 12000);
  const title = document.title || ''; const accessDenied = /access denied|access forbidden|forbidden|unauthori[sz]ed|request blocked|authentication required|sign in to continue|enable javascript and cookies/i.test(title + ' ' + bodyText);
  return { url: location.href, title, elements, images, capturedAt: new Date().toISOString(), accessDenied };
})()`;

export interface CdpSnapshotOptions { chromeEndpoint?: string; timeoutMs?: number; }

export function failureSnapshot(url: string, state: Exclude<CaptureState, 'captured'>, message: string, partial: Partial<RenderedPageSnapshot> = {}): RenderedPageSnapshot {
  return { url: partial.url ?? url, title: partial.title ?? '', elements: partial.elements ?? [], images: partial.images ?? [], capturedAt: partial.capturedAt ?? new Date().toISOString(), captureState: state, captureMessage: message };
}

export function classifyDocument(status: number | undefined, accessDenied: boolean, url: string, partial: Partial<RenderedPageSnapshot> = {}): RenderedPageSnapshot | undefined {
  if (status === undefined && !accessDenied) return undefined;
  let state: Exclude<CaptureState, 'captured'> | undefined;
  let message = '';
  if (status === 401 || status === 407 || (status !== undefined && status < 400 && accessDenied)) { state = 'authentication-required'; message = `O documento original exigiu autenticação (HTTP ${status ?? 'desconhecido'}).`; }
  else if (status === 403 || accessDenied) { state = 'blocked'; message = `O documento original foi bloqueado e retornou uma página Access Denied (HTTP ${status ?? 'desconhecido'}).`; }
  else if (status !== undefined && status >= 400 && status < 500) { state = 'content-unavailable'; message = `O documento original não está disponível (HTTP ${status}).`; }
  if (!state) return undefined;
  return failureSnapshot(url, state, message, partial);
}

async function chromeWebSocketUrl(endpoint: string, timeoutMs: number): Promise<string> {
  try {
    const response = await fetch(new URL('/json/list', endpoint), { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new CaptureError('network-error', `O navegador respondeu ${response.status} ao consultar as abas CDP.`);
    const pages = await response.json() as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
    const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) throw new CaptureError('content-unavailable', 'O navegador não informou uma aba disponível para análise.');
    return page.webSocketDebuggerUrl;
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new CaptureError('timeout', 'Timeout ao localizar uma aba CDP.');
    throw new CaptureError('network-error', error instanceof Error ? error.message : 'Falha ao localizar uma aba CDP.');
  }
}

export async function captureRenderedPage(inputUrl: string, options: CdpSnapshotOptions = {}): Promise<RenderedPageSnapshot> {
  const timeoutMs = options.timeoutMs ?? 30000;
  await validateExternalUrl(inputUrl);
  const endpoint = options.chromeEndpoint ?? 'http://127.0.0.1:9222';
  let socketUrl: string;
  try { socketUrl = await chromeWebSocketUrl(endpoint, Math.min(timeoutMs, 5000)); }
  catch (error) {
    if (error instanceof CaptureError) throw new CaptureError(error.state, error.message, error.snapshot ?? failureSnapshot(inputUrl, error.state, error.message));
    throw new CaptureError('network-error', error instanceof Error ? error.message : 'Falha ao localizar uma aba CDP.', failureSnapshot(inputUrl, 'network-error', error instanceof Error ? error.message : 'Falha ao localizar uma aba CDP.'));
  }
  const cdp = new CdpClient(); const blocked = { value: '' }; let documentStatus: number | undefined; let mainFrameId = ''; let loadingFailed = '';
  try {
    await cdp.connect(socketUrl, Math.min(timeoutMs, 5000));
    await cdp.command('Page.enable'); await cdp.command('Runtime.enable'); await cdp.command('Network.enable'); await cdp.command('Fetch.enable', { patterns: [{ requestStage: 'Request' }] });
    cdp.on('Page.frameNavigated', params => { const frame = params.frame as { id?: string; parentId?: string } | undefined; if (frame && !frame.parentId) mainFrameId = frame.id ?? ''; });
    cdp.on('Network.responseReceived', params => { const response = params.response as { status?: number } | undefined; if (params.type === 'Document' && (mainFrameId === '' || String(params.frameId ?? '') === mainFrameId)) { mainFrameId ||= String(params.frameId ?? ''); documentStatus = response?.status; } });
    cdp.on('Network.loadingFailed', params => { if (String(params.type) === 'Document') loadingFailed = String(params.errorText ?? 'Falha de rede.'); });
    cdp.on('Fetch.requestPaused', async params => {
      const requestId = String(params.requestId); const request = params.request as { url?: string } | undefined; const resourceType = String(params.resourceType ?? '');
      try { const target = request?.url ?? ''; const protocol = new URL(target).protocol; if (protocol === 'data:' || protocol === 'blob:' || protocol === 'about:') { await cdp.command('Fetch.continueRequest', { requestId }); return; } await validateExternalUrl(target); await cdp.command('Fetch.continueRequest', { requestId }); }
      catch (error) { if (resourceType === 'Document' || resourceType === 'MainFrame') blocked.value = error instanceof Error ? error.message : 'Requisição principal bloqueada.'; await cdp.command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => undefined); }
    });
    let loaded = false;
    cdp.on('Page.loadEventFired', () => { loaded = true; });
    const navigation = await cdp.command('Page.navigate', { url: inputUrl });
    if (navigation.errorText) throw new CaptureError('network-error', String(navigation.errorText));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !loaded) { if (blocked.value) throw new UrlPolicyError(blocked.value); if (loadingFailed) throw new CaptureError('network-error', loadingFailed); await delay(50); }
    if (!loaded) throw new CaptureError('timeout', 'Timeout aguardando o carregamento do documento.');
    const result = await cdp.command('Runtime.evaluate', { expression: SNAPSHOT_SCRIPT, returnByValue: true });
    const value = (result.result as { value?: RenderedPageSnapshot & { accessDenied?: boolean } } | undefined)?.value;
    if (!value) throw new CaptureError('content-unavailable', 'Chrome não retornou um snapshot válido.');
    const classified = classifyDocument(documentStatus, Boolean(value.accessDenied), value.url || inputUrl, value);
    if (classified) return classified;
    value.captureState = 'captured'; delete (value as { accessDenied?: boolean }).accessDenied;
    return value;
  } catch (error) {
    if (error instanceof UrlPolicyError) throw error;
    if (error instanceof CaptureError) throw new CaptureError(error.state, error.message, error.snapshot ?? failureSnapshot(inputUrl, error.state, error.message));
    const message = error instanceof Error ? error.message : 'Falha durante a captura.';
    throw new CaptureError('network-error', message, failureSnapshot(inputUrl, 'network-error', message));
  }
  finally { await cdp.command('Fetch.disable').catch(() => undefined); cdp.close(); }
}
