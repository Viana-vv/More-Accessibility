import type {
  AccessibilityEvidence,
  ImageAnalysis,
  RenderedElement,
  RenderedPageSnapshot,
  RuleResult,
} from '../shared/contracts.js';

export interface RuleContext {
  snapshot: RenderedPageSnapshot;
  elements: RenderedElement[];
  images: ImageAnalysis[];
}

export interface WcagRule {
  id: string;
  criterion: string;
  description: string;
  level: 'A' | 'AA' | 'AAA';
  evaluate(context: RuleContext): RuleResult[];
}

export interface ImageCandidate {
  element: RenderedElement;
  source: string;
  isCssBackground: boolean;
  ancestorElements: RenderedElement[];
  nearbyText: string;
}

export interface ImageClassification {
  purpose: 'decorative' | 'informative-or-functional' | 'indeterminate';
  evidence: AccessibilityEvidence[];
  issues: string[];
  humanReviewRequired: boolean;
  suggestedFix?: string;
}
