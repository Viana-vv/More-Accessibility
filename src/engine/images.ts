import type { AccessibilityEvidence, ImageAnalysis, RenderedElement } from '../shared/contracts.js';
import type { EngineImageAnalysis, ImageCandidate, ImageClassification } from './types.js';
import { elementEvidence, normalized } from './evidence.js';
import { isRendered } from './visibility.js';

const attr = (element: RenderedElement, name: string) => normalized(element.attributes[name]);
const control = (element: RenderedElement) => /^(a|button)$/.test(element.tagName.toLowerCase()) || ['button', 'link'].includes(attr(element, 'role'));

export function classifyImage(candidate: ImageCandidate): ImageClassification {
  const { element } = candidate;
  const alt = element.attributes.alt;
  const evidence: AccessibilityEvidence[] = [elementEvidence(element, 'element', element.tagName.toLowerCase())];
  const issues: string[] = [];
  if (candidate.isCssBackground) evidence.push(elementEvidence(element, 'css-background', candidate.source));
  if (alt !== undefined) evidence.push(elementEvidence(element, 'alt-attribute', alt));
  if (attr(element, 'role')) evidence.push(elementEvidence(element, 'role', attr(element, 'role')));
  const accessibleName = normalized(element.accessibleName) || attr(element, 'aria-label');
  if (accessibleName) evidence.push(elementEvidence(element, 'accessible-name', accessibleName));
  if (candidate.nearbyText) evidence.push(elementEvidence(element, 'nearby-text', candidate.nearbyText));
  const ancestorControl = candidate.ancestorElements.find(control);
  if (ancestorControl) {
    evidence.push(elementEvidence(ancestorControl, 'ancestor-control', ancestorControl.tagName.toLowerCase()));
    const name = normalized(ancestorControl.accessibleName) || attr(ancestorControl, 'aria-label') || normalized(ancestorControl.textContent);
    if (name) return { purpose: 'functional', evidence, issues, humanReviewRequired: false };
    issues.push('Controle ancestral sem nome acessível observável.');
    return { purpose: 'functional', evidence, issues, humanReviewRequired: false, suggestedFix: 'Forneça um nome acessível ao link ou botão.' };
  }
  if (alt === '') {
    if (candidate.nearbyText || candidate.isCssBackground) return { purpose: 'decorative', evidence, issues: ['A marcação sugere decoração, mas o contexto pode conter informação.'], humanReviewRequired: true };
    return { purpose: 'decorative', evidence, issues, humanReviewRequired: false, suggestedFix: 'Mantenha alt="" somente se a finalidade for realmente decorativa.' };
  }
  if (alt !== undefined && normalized(alt)) return { purpose: 'informative', evidence: [...evidence, elementEvidence(element, 'text-alternative-present', 'alt não vazio')], issues, humanReviewRequired: true, suggestedFix: 'Confirme manualmente se o texto alternativo representa a finalidade da imagem.' };
  return { purpose: 'indeterminate', evidence, issues: [candidate.isCssBackground ? 'Imagem CSS sem contexto textual suficiente.' : 'A finalidade não pode ser determinada apenas pelos dados coletados.'], humanReviewRequired: true };
}

export function collectImageAnalyses(elements: RenderedElement[]): ImageAnalysis[] {
  const analyses = elements.flatMap((element) => {
    if (!isRendered(element, elements)) return [];
    const tag = element.tagName.toLowerCase();
    const candidates: ImageCandidate[] = [];
    if (tag === 'img' || tag === 'svg' || attr(element, 'role') === 'img') candidates.push({ element, source: attr(element, 'src') || attr(element, 'data') || 'inline', isCssBackground: false, ancestorElements: ancestors(element, elements), nearbyText: nearbyText(element, elements) });
    const background = element.computedStyle.backgroundImage;
    if (background && background !== 'none' && background.includes('url(')) candidates.push({ element, source: background, isCssBackground: true, ancestorElements: ancestors(element, elements), nearbyText: nearbyText(element, elements) });
    return candidates.map((candidate) => {
      const classification = classifyImage(candidate);
      return { elementId: element.id, source: candidate.source, html: element.html, purpose: classification.purpose, attributes: element.attributes, evidence: classification.evidence, relatedCriteria: ['1.1.1'], issues: classification.issues, humanReviewRequired: classification.humanReviewRequired, ...(classification.suggestedFix === undefined ? {} : { suggestedFix: classification.suggestedFix }) } as unknown as EngineImageAnalysis;
    });
  });
  return analyses as unknown as ImageAnalysis[];
}

function ancestors(element: RenderedElement, elements: RenderedElement[]): RenderedElement[] {
  const found: RenderedElement[] = [];
  let current = element;
  const seen = new Set<string>();
  while (current.parentIds.length) {
    const parentId = current.parentIds[0];
    if (!parentId) break;
    const parent = elements.find((candidate) => candidate.id === parentId);
    if (!parent || seen.has(parent.id)) break;
    found.push(parent); seen.add(parent.id); current = parent;
  }
  return found;
}
function nearbyText(element: RenderedElement, elements: RenderedElement[]): string { return ancestors(element, elements).map((parent) => normalized(parent.textContent)).find(Boolean) ?? ''; }
