export type AuditStatus = 'pass' | 'violation' | 'review' | 'not-applicable';
export type ConformanceLevel = 'A' | 'AA' | 'AAA';
export type ImagePurpose = 'decorative' | 'informative-or-functional' | 'indeterminate';
export type CaptureState = 'captured' | 'authentication-required' | 'blocked' | 'network-error' | 'timeout' | 'content-unavailable';

export interface PageTarget {
  url: string;
}

export interface AccessibilityEvidence {
  kind: string;
  value: string;
  source?: string;
}

export interface ImageAnalysis {
  elementId: string;
  source: string;
  html: string;
  purpose: ImagePurpose;
  attributes: Record<string, string | undefined>;
  evidence: AccessibilityEvidence[];
  relatedCriteria: string[];
  issues: string[];
  humanReviewRequired: boolean;
  suggestedFix?: string;
}

export interface RuleResult {
  occurrenceId: string;
  ruleId: string;
  criterion: string;
  description: string;
  level: ConformanceLevel;
  status: AuditStatus;
  evidence: AccessibilityEvidence[];
  selector?: string;
  impact?: string;
  html?: string;
  remediation?: string;
  correctedHtml?: string;
  expectedResult?: string;
}

export interface RenderedElement {
  id: string;
  tagName: string;
  html: string;
  textContent: string;
  attributes: Record<string, string | undefined>;
  computedStyle: Record<string, string>;
  parentIds: string[];
  accessibleName?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface RenderedPageSnapshot {
  url: string;
  title: string;
  elements: RenderedElement[];
  images: ImageAnalysis[];
  capturedAt: string;
  captureState?: CaptureState;
  captureMessage?: string;
}

export interface AuditReport {
  target: PageTarget;
  snapshot: RenderedPageSnapshot;
  results: RuleResult[];
  generatedAt: string;
  captureState: CaptureState;
  captureMessage?: string;
}

export interface CorrectionSuggestion {
  ruleId: string;
  title: string;
  rationale: string;
  html?: string;
  css?: string;
  before?: string;
  after?: string;
  humanReviewRequired: boolean;
}
