import type { AuditReport, PageTarget } from '../shared/contracts.js';

export interface AuditFailure { id: string; occurredAt: string; target?: PageTarget; message: string; details?: string; }
export interface AuditHistoryState { validReports: AuditReport[]; failedAudits: AuditFailure[]; }
export interface HistoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
class MemoryStorage implements HistoryStorage { private readonly values = new Map<string, string>(); getItem(key: string): string | null { return this.values.get(key) ?? null; } setItem(key: string, value: string): void { this.values.set(key, value); } }
function emptyState(): AuditHistoryState { return { validReports: [], failedAudits: [] }; }
function validReport(report: AuditReport): boolean { try { const target = new URL(report.target.url); const loaded = new URL(report.snapshot.url); return (target.protocol === 'http:' || target.protocol === 'https:') && (loaded.protocol === 'http:' || loaded.protocol === 'https:') && report.captureState !== 'blocked' && report.captureState !== 'authentication-required' && report.captureState !== 'network-error' && report.captureState !== 'timeout' && report.captureState !== 'content-unavailable' && report.results.every((result) => typeof result.ruleId === 'string' && typeof result.status === 'string'); } catch { return false; } }

export class AuditHistory {
  private state: AuditHistoryState; private readonly storage: HistoryStorage; private readonly key: string;
  constructor(storage: HistoryStorage = new MemoryStorage(), key = 'wcag-audit-history') { this.storage = storage; this.key = key; const saved = storage.getItem(key); try { const parsed = saved ? JSON.parse(saved) as AuditHistoryState : emptyState(); this.state = { validReports: Array.isArray(parsed.validReports) ? parsed.validReports : [], failedAudits: Array.isArray(parsed.failedAudits) ? parsed.failedAudits : [] }; } catch { this.state = emptyState(); } }
  recordValid(report: AuditReport): void { if (!validReport(report)) throw new Error('AuditReport inválido: somente auditorias com URL HTTP(S) e snapshot correspondente podem ser armazenadas.'); this.state.validReports = [report, ...this.state.validReports]; this.persist(); }
  recordFailure(failure: AuditFailure): void { if (!failure.message.trim()) throw new Error('Falha de auditoria deve possuir uma mensagem.'); this.state.failedAudits = [failure, ...this.state.failedAudits]; this.persist(); }
  listValid(): AuditReport[] { return this.state.validReports.map((report) => structuredClone(report)); }
  listFailures(): AuditFailure[] { return this.state.failedAudits.map((failure) => structuredClone(failure)); }
  snapshot(): AuditHistoryState { return { validReports: this.listValid(), failedAudits: this.listFailures() }; }
  clear(): void { this.state = emptyState(); this.persist(); }
  private persist(): void { this.storage.setItem(this.key, JSON.stringify(this.state)); }
}
