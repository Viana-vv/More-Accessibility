import type { AuditReport, RenderedPageSnapshot } from '../shared/contracts.js';
import { collectImageAnalyses } from './images.js';
import { rules } from './rules.js';
import type { RuleContext, WcagRule } from './types.js';

export { contrastRatio, parseColor, relativeLuminance } from './color.js';
export { classifyImage, collectImageAnalyses } from './images.js';
export { rules } from './rules.js';
export type { ImageCandidate, ImageClassification, RuleContext, WcagRule } from './types.js';

export function auditSnapshot(snapshot: RenderedPageSnapshot, selectedRules: WcagRule[] = rules): AuditReport {
  const captureState = snapshot.captureState ?? 'captured';
  const images = snapshot.elements.length ? collectImageAnalyses(snapshot.elements) : snapshot.images;
  const context: RuleContext = { snapshot: { ...snapshot, images }, elements: snapshot.elements, images };
  const results = captureState === 'captured' ? selectedRules.flatMap((rule) => rule.evaluate(context)) : [];
  return { target: { url: snapshot.url }, snapshot: context.snapshot, results, generatedAt: new Date().toISOString(), captureState, ...(snapshot.captureMessage === undefined ? {} : { captureMessage: snapshot.captureMessage }) };
}
