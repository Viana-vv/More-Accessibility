import type { AccessibilityEvidence, ImageAnalysis, RenderedElement, RenderedPageSnapshot, RuleResult } from '../shared/contracts.js';

export interface RuleContext { snapshot: RenderedPageSnapshot; elements: RenderedElement[]; images: ImageAnalysis[]; }
export interface WcagRule { id: string; criterion: string; description: string; level: 'A' | 'AA' | 'AAA'; evaluate(context: RuleContext): RuleResult[]; }
export interface ImageCandidate { element: RenderedElement; source: string; isCssBackground: boolean; ancestorElements: RenderedElement[]; nearbyText: string; }
export type EngineImagePurpose = 'decorative' | 'informative' | 'functional' | 'indeterminate';
export interface EngineImageAnalysis extends Omit<ImageAnalysis, 'purpose'> { purpose: EngineImagePurpose; }
export interface ImageClassification { purpose: EngineImagePurpose; evidence: AccessibilityEvidence[]; issues: string[]; humanReviewRequired: boolean; suggestedFix?: string; }
export interface StructuredCategoryKey { criterion: string; rule: string; elementId: string; kind: string; }
