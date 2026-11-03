import type { AccessibilityEvidence, ImageAnalysis, RenderedElement } from '../shared/contracts.js';
import type { ImageCandidate, ImageClassification } from './types.js';
import { elementEvidence, normalized } from './evidence.js';

function attr(element: RenderedElement, name: string): string { return normalized(element.attributes[name]); }

export function classifyImage(candidate: ImageCandidate): ImageClassification {
  const { element } = candidate;
  const role = attr(element, 'role');
  const alt = element.attributes.alt;
  const accessibleName = normalized(element.accessibleName) || attr(element, 'aria-label');
  const evidence: AccessibilityEvidence[] = [elementEvidence(element, 'element', element.tagName.toLowerCase())];
  const issues: string[] = [];
  if (candidate.isCssBackground) evidence.push(elementEvidence(element, 'css-background', candidate.source));
  if (alt !== undefined) evidence.push(elementEvidence(element, 'alt-attribute', alt));
  if (role) evidence.push(elementEvidence(element, 'role', role));
  if (accessibleName) evidence.push(elementEvidence(element, 'accessible-name', accessibleName));
  if (candidate.nearbyText) evidence.push(elementEvidence(element, 'nearby-text', candidate.nearbyText));
  const ancestorControl = candidate.ancestorElements.find((ancestor) => /^(a|button)$/.test(ancestor.tagName.toLowerCase()));
  if (ancestorControl) {
    evidence.push(elementEvidence(ancestorControl, 'ancestor-control', ancestorControl.tagName.toLowerCase()));
    if (normalized(ancestorControl.accessibleName) || attr(ancestorControl, 'aria-label') || hasVisibleText(ancestorControl)) {
      return { purpose: 'informative-or-functional', evidence, issues, humanReviewRequired: false };
    }
    issues.push('Controle ancestral não possui nome acessível observável.');
    return { purpose: 'informative-or-functional', evidence, issues, humanReviewRequired: false, suggestedFix: 'Forneça um nome acessível ao link ou botão.' };
  }
  if (alt === '') {
    if (candidate.nearbyText || candidate.isCssBackground) {
      issues.push('A marcação sugere decoração, mas o contexto pode conter informação.');
      return { purpose: 'decorative', evidence, issues, humanReviewRequired: true };
    }
    return { purpose: 'decorative', evidence, issues, humanReviewRequired: false, suggestedFix: 'Mantenha alt="" somente se a finalidade for realmente decorativa.' };
  }
  if (alt !== undefined && normalized(alt)) {
    evidence.push(elementEvidence(element, 'text-alternative-present', 'alt não vazio'));
    return { purpose: 'informative-or-functional', evidence, issues, humanReviewRequired: true, suggestedFix: 'Confirme manualmente se o texto alternativo representa a finalidade da imagem.' };
  }
  if (candidate.isCssBackground && !candidate.nearbyText) {
    return { purpose: 'indeterminate', evidence, issues: ['Imagem CSS sem contexto textual suficiente.'], humanReviewRequired: true };
  }
  return { purpose: 'indeterminate', evidence, issues: ['A finalidade da imagem não pode ser determinada apenas pelos dados coletados.'], humanReviewRequired: true };
}

function hasVisibleText(element: RenderedElement): boolean { return normalized(element.textContent).length > 0; }

export function collectImageAnalyses(elements: RenderedElement[]): ImageAnalysis[] {
  return elements.flatMap((element) => {
    const tag = element.tagName.toLowerCase();
    const background = element.computedStyle.backgroundImage;
    const candidates: ImageCandidate[] = [];
    if (tag === 'img' || tag === 'area') candidates.push({ element, source: attr(element, 'src') || attr(element, 'srcset'), isCssBackground: false, ancestorElements: ancestors(element, elements), nearbyText: nearbyText(element, elements) });
    if (background && background !== 'none' && background.includes('url(')) candidates.push({ element, source: background, isCssBackground: true, ancestorElements: ancestors(element, elements), nearbyText: nearbyText(element, elements) });
    return candidates.map((candidate) => {
      const classification = classifyImage(candidate);
      return { elementId: element.id, source: candidate.source, html: element.html, purpose: classification.purpose, attributes: element.attributes, evidence: classification.evidence, relatedCriteria: ['1.1.1'], issues: classification.issues, humanReviewRequired: classification.humanReviewRequired, ...(classification.suggestedFix === undefined ? {} : { suggestedFix: classification.suggestedFix }) };
    });
  });
}

function ancestors(element: RenderedElement, elements: RenderedElement[]): RenderedElement[] {
  return element.parentIds.map((id) => elements.find((candidate) => candidate.id === id)).filter((candidate): candidate is RenderedElement => candidate !== undefined);
}
function nearbyText(element: RenderedElement, elements: RenderedElement[]): string {
  return ancestors(element, elements).map((parent) => normalized(parent.textContent)).find(Boolean) ?? '';
}
