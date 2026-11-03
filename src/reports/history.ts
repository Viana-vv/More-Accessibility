import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AuditReport, CaptureState, PageTarget } from '../shared/contracts.js';

export interface AuditFailure {
  id: string;
  occurredAt: string;
  target?: PageTarget;
  url?: string;
  status?: CaptureState | 'unknown';
  message: string;
  details?: string;
}

export interface AuditHistoryState { validReports: AuditReport[]; failedAudits: AuditFailure[]; }
export interface HistoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }

export class HistoryStorageError extends Error { constructor(message: string, options?: { cause?: unknown }) { super(message, options); this.name = 'HistoryStorageError'; } }

export class MemoryStorage implements HistoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

export class FileHistoryStorage implements HistoryStorage {
  constructor(readonly filePath = path.join(process.cwd(), 'data', 'audit-history.json')) {}
  getItem(_key: string): string | null {
    try { return existsSync(this.filePath) ? readFileSync(this.filePath, 'utf8') : null; }
    catch (error) { throw new HistoryStorageError(`Não foi possível ler o histórico local: ${this.filePath}`, { cause: error }); }
  }
  setItem(_key: string, value: string): void {
    const directory = path.dirname(this.filePath); const temporary = `${this.filePath}.${process.pid}.tmp`;
    try { mkdirSync(directory, { recursive: true }); writeFileSync(temporary, value, 'utf8'); renameSync(temporary, this.filePath); }
    catch (error) { throw new HistoryStorageError(`Não foi possível gravar o histórico local: ${this.filePath}`, { cause: error }); }
  }
}

function emptyState(): AuditHistoryState { return { validReports: [], failedAudits: [] }; }
function validHttpUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
function validDate(value: string): boolean { return Boolean(value) && Number.isFinite(Date.parse(value)); }
function invalidCaptureState(state: CaptureState | undefined): boolean { return state !== undefined && state !== 'captured'; }
function validReport(report: AuditReport): boolean {
  return Boolean(report && validHttpUrl(report.target.url) && validHttpUrl(report.snapshot.url) && validDate(report.generatedAt) && validDate(report.snapshot.capturedAt) && Array.isArray(report.results) && !invalidCaptureState(report.captureState) && report.results.every(result => typeof result.ruleId === 'string' && typeof result.status === 'string'));
}
function normalizeFailure(failure: AuditFailure): AuditFailure {
  const url = failure.url ?? failure.target?.url;
  if (url !== undefined && !validHttpUrl(url)) throw new Error('Falha de auditoria possui URL inválida.');
  return { ...failure, ...(url ? { url } : {}), status: failure.status ?? 'unknown' };
}

export class AuditHistory {
  private state: AuditHistoryState;
  private readonly storage: HistoryStorage;
  private readonly key: string;

  constructor(storage: HistoryStorage = new FileHistoryStorage(), key = 'wcag-audit-history') {
    this.storage = storage; this.key = key;
    const saved = storage.getItem(key);
    if (!saved) { this.state = emptyState(); return; }
    try {
      const parsed = JSON.parse(saved) as Partial<AuditHistoryState>;
      if (!Array.isArray(parsed.validReports) || !Array.isArray(parsed.failedAudits)) throw new Error('Formato inválido.');
      this.state = { validReports: parsed.validReports, failedAudits: parsed.failedAudits };
    } catch (error) { throw new HistoryStorageError('Histórico local corrompido ou em formato inválido.', { cause: error }); }
  }

  recordValid(report: AuditReport): void {
    if (!validReport(report)) throw new Error('AuditReport inválido: somente capturas válidas com URL HTTP(S) podem ser armazenadas.');
    const next = { ...this.state, validReports: [structuredClone(report), ...this.state.validReports] };
    this.persist(next); this.state = next;
  }

  recordFailure(failure: AuditFailure): void {
    if (!failure.id.trim() || !validDate(failure.occurredAt) || !failure.message.trim()) throw new Error('Falha de auditoria deve possuir ID, data e mensagem válidos.');
    const normalized = normalizeFailure(failure);
    const next = { ...this.state, failedAudits: [structuredClone(normalized), ...this.state.failedAudits] };
    this.persist(next); this.state = next;
  }

  listValid(): AuditReport[] { return this.state.validReports.map(report => structuredClone(report)); }
  listFailures(): AuditFailure[] { return this.state.failedAudits.map(failure => structuredClone(failure)); }
  snapshot(): AuditHistoryState { return { validReports: this.listValid(), failedAudits: this.listFailures() }; }
  clear(): void { const next = emptyState(); this.persist(next); this.state = next; }
  private persist(next: AuditHistoryState): void {
    try { this.storage.setItem(this.key, JSON.stringify(next)); }
    catch (error) { if (error instanceof HistoryStorageError) throw error; throw new HistoryStorageError('Não foi possível persistir o histórico local.', { cause: error }); }
  }
}

export function createFileAuditHistory(filePath = path.join(process.cwd(), 'data', 'audit-history.json')): AuditHistory { return new AuditHistory(new FileHistoryStorage(filePath)); }
