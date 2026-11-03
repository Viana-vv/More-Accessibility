import type { AccessibilityEvidence, RenderedElement, RuleResult } from '../shared/contracts.js';
import type { StructuredCategoryKey } from './types.js';

export function evidence(kind: string, value: string, source?: string): AccessibilityEvidence {
  return source === undefined ? { kind, value } : { kind, value, source };
}
export function elementEvidence(element: RenderedElement, kind: string, value: string): AccessibilityEvidence { return evidence(kind, value, `element:${element.id}`); }
export function htmlSnippet(element: RenderedElement): string { return element.html.length > 500 ? `${element.html.slice(0, 497)}...` : element.html; }
export function normalized(value: string | undefined): string { return value?.replace(/\s+/g, ' ').trim() ?? ''; }
export function hasText(value: string | undefined): boolean { return normalized(value).length > 0; }

export function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `occ-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function selectorFor(element: RenderedElement): string {
  const tag = element.tagName.toLowerCase();
  const id = normalized(element.attributes.id);
  if (id) return `${tag}#${escapeSelector(id)}`;
  const testId = normalized(element.attributes['data-testid']);
  if (testId) return `${tag}[data-testid="${escapeSelector(testId)}"]`;
  const name = normalized(element.attributes.name);
  if (name) return `${tag}[name="${escapeSelector(name)}"]`;
  return `${tag}[data-element-id="${escapeSelector(element.id)}"]`;
}
function escapeSelector(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }

export interface ResultMetadata { occurrenceKey: string; impact: string; remediation: string; expectedResult: string; correctedHtml?: string; }
export function makeResult(ruleId: string, criterion: string, description: string, level: RuleResult['level'], status: RuleResult['status'], target: RenderedElement, evidenceList: AccessibilityEvidence[], metadata: ResultMetadata): RuleResult & { categoryKey: StructuredCategoryKey } {
  return {
    categoryKey: { criterion, rule: ruleId, elementId: target.id, kind: ruleId.split('-').at(-1) ?? 'element' },
    occurrenceId: stableId(`${ruleId}|${metadata.occurrenceKey}`), ruleId, criterion, description, level, status, evidence: evidenceList,
    selector: selectorFor(target), impact: metadata.impact, html: target.html, remediation: metadata.remediation, expectedResult: metadata.expectedResult,
    ...(metadata.correctedHtml === undefined ? {} : { correctedHtml: metadata.correctedHtml }),
  };
}
