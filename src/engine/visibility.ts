import type { RenderedElement } from '../shared/contracts.js';
import { normalized } from './evidence.js';

const excludedTags = new Set(['title', 'head', 'script', 'style', 'template', 'noscript']);

export function isRendered(element: RenderedElement, elements: RenderedElement[] = []): boolean {
  if (excludedTags.has(element.tagName.toLowerCase())) return false;
  const style = element.computedStyle;
  if (normalized(style.display).toLowerCase() === 'none') return false;
  if (['hidden', 'collapse'].includes(normalized(style.visibility).toLowerCase())) return false;
  if (Number.parseFloat(normalized(style.opacity)) === 0) return false;
  return !element.parentIds.some((parentId) => {
    const parent = elements.find((candidate) => candidate.id === parentId);
    return parent ? !isRendered(parent, elements) : false;
  });
}
