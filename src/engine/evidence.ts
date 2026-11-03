import type { AccessibilityEvidence, RenderedElement } from '../shared/contracts.js';

export function evidence(kind: string, value: string, source?: string): AccessibilityEvidence {
  return source === undefined ? { kind, value } : { kind, value, source };
}

export function elementEvidence(element: RenderedElement, kind: string, value: string): AccessibilityEvidence {
  return evidence(kind, value, `element:${element.id}`);
}

export function htmlSnippet(element: RenderedElement): string {
  return element.html.length > 500 ? `${element.html.slice(0, 497)}...` : element.html;
}

export function normalized(value: string | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function hasText(value: string | undefined): boolean {
  return normalized(value).length > 0;
}
