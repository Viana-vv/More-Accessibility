import type { AccessibilityEvidence, AuditReport, CorrectionSuggestion, ImageAnalysis, RuleResult } from '../shared/contracts.js';
import { contrastRatio, contrastThreshold, parseStructuredContrastEvidence, suggestContrastColors, type StructuredContrastEvidence } from './colors.js';

export interface ContrastComparison { before: number; after: number; minimum: number; foreground: string; background: string; suggestedForeground?: string; suggestedBackground?: string; fontSizePx?: number; fontWeight?: number | string; }
export interface ContrastPreviewTokens { before: { foreground: string; background: string }; after: { foreground: string; background: string }; }
export interface ComparisonSuggestion extends CorrectionSuggestion { expectedResult: string; contrast?: ContrastComparison; previewTokens?: ContrastPreviewTokens; }

function evidence(result: RuleResult, kinds: string[]): string | undefined { return result.evidence.find((item) => kinds.includes(item.kind))?.value; }
function baseSuggestion(result: RuleResult): ComparisonSuggestion {
  const suggestion: ComparisonSuggestion = { ruleId: result.ruleId, title: `Revisar ${result.criterion}`, rationale: result.remediation ?? `${result.description} Confirme a correção com as evidências coletadas.`, humanReviewRequired: result.status === 'review', expectedResult: result.status === 'review' ? 'A situação deve ser confirmada por revisão humana.' : 'O critério deve deixar de apresentar violação confirmada.' };
  const before = evidence(result, ['element-html', 'html']); if (before !== undefined) suggestion.before = before;
  return suggestion;
}
function explicitHtml(result: RuleResult, kind: string): string | undefined { const item = result.evidence.find((candidate) => candidate.kind === kind); return item?.value.includes('<') ? item.value : undefined; }

function contrastSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const structured = parseStructuredContrastEvidence(result.evidence);
  if (!structured) return { ...base, title: 'Ajustar contraste com evidência estruturada', rationale: `${base.rationale} Não foi possível calcular uma sugestão porque não há evidência estruturada com foreground, background e dados tipográficos válidos.`, expectedResult: 'A proporção deve atingir o limiar calculado para o tamanho e peso do texto.', humanReviewRequired: true };
  return contrastSuggestionFromEvidence(result, base, structured);
}

export function contrastSuggestionFromEvidence(result: RuleResult, base: ComparisonSuggestion, structured: StructuredContrastEvidence): ComparisonSuggestion {
  const minimum = contrastThreshold(structured);
  const before = contrastRatio(structured.foreground, structured.background);
  if (before === undefined) return { ...base, title: 'Ajustar contraste com as cores observadas', expectedResult: `A proporção deve atingir pelo menos ${minimum}:1.`, humanReviewRequired: true };
  const proposed = suggestContrastColors(structured.foreground, structured.background, minimum);
  if (!proposed) return { ...base, title: 'Ajustar contraste com as cores observadas', expectedResult: `A proporção deve atingir pelo menos ${minimum}:1.`, humanReviewRequired: true };
  const css = `color: ${proposed.foreground};\nbackground-color: ${proposed.background};`;
  const contrast: ContrastComparison = { before, after: proposed.ratio, minimum, foreground: structured.foreground, background: structured.background, suggestedForeground: proposed.foreground, suggestedBackground: proposed.background };
  if (structured.fontSizePx !== undefined) contrast.fontSizePx = structured.fontSizePx;
  if (structured.fontWeight !== undefined) contrast.fontWeight = structured.fontWeight;
  return { ...base, title: `Ajustar contraste para ${minimum}:1`, rationale: `A proporção calculada foi ${before.toFixed(2)}:1. A CSS sugerida altera ${proposed.changed === 'foreground' ? 'foreground' : 'background'} e preserva a outra cor.`, css, after: css, expectedResult: `A proporção esperada é ${proposed.ratio.toFixed(2)}:1, atendendo ao mínimo de ${minimum}:1.`, contrast, previewTokens: { before: { foreground: structured.foreground, background: structured.background }, after: { foreground: proposed.foreground, background: proposed.background } }, humanReviewRequired: false };
}

function controlSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const corrected = explicitHtml(result, 'corrected-html');
  const suggestion: ComparisonSuggestion = { ...base, title: 'Fornecer um nome acessível ao controle', rationale: `${base.rationale} O nome deve usar texto real, aria-label ou aria-labelledby observado; nenhum rótulo foi inventado.`, expectedResult: 'O botão ou link deve expor um nome acessível que comunique sua finalidade.' };
  if (corrected !== undefined) { suggestion.html = corrected; suggestion.after = corrected; }
  return suggestion;
}
function formSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const corrected = explicitHtml(result, 'corrected-html');
  const suggestion: ComparisonSuggestion = { ...base, title: 'Associar o campo ao seu rótulo', rationale: `${base.rationale} Use o id e o texto real coletados. Nenhum label foi fabricado por este módulo.`, expectedResult: 'Cada campo deve ter um rótulo ou instrução perceptível e programaticamente associado.' };
  if (corrected !== undefined) { suggestion.html = corrected; suggestion.after = corrected; }
  return suggestion;
}
function imageSuggestion(image: ImageAnalysis): ComparisonSuggestion {
  const suggestion: ComparisonSuggestion = { ruleId: image.relatedCriteria[0] ?? '1.1.1', title: 'Revisar finalidade e alternativa da imagem', rationale: image.evidence.map((item) => `${item.kind}: ${item.value}`).join('; ') || 'Nenhuma evidência textual foi coletada.', before: image.html, humanReviewRequired: true, expectedResult: 'A alternativa deve representar a finalidade real, ou a imagem deve ser decorativa somente quando isso for confirmado.' };
  if (image.purpose === 'decorative') { const html = image.html.replace(/\s+alt\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' alt=""'); suggestion.title = 'Marcar a imagem como decorativa após confirmação'; suggestion.rationale = `O motor sugeriu decoração; isso não prova a finalidade. Evidências: ${suggestion.rationale}`; suggestion.html = html; suggestion.after = html; suggestion.expectedResult = 'A imagem decorativa deve ter alt="" e não transmitir informação necessária.'; }
  else if (image.purpose === 'informative-or-functional') { suggestion.title = 'Validar alternativa ou nome acessível da imagem'; suggestion.rationale = `A imagem foi classificada como informativa ou funcional. Não será inventado texto alternativo. ${image.issues.join(' ')}`.trim(); suggestion.expectedResult = 'A imagem deve ter alternativa textual adequada ou o controle ancestral deve ter nome acessível sem redundância.'; }
  else { suggestion.title = 'Confirmar a finalidade da imagem'; suggestion.rationale = `A finalidade é indeterminada. Evidências: ${suggestion.rationale}`; }
  return suggestion;
}

export function suggestionsForRule(result: RuleResult): ComparisonSuggestion[] {
  if (result.status !== 'violation' && result.status !== 'review') return [];
  const base = baseSuggestion(result); const criterion = result.criterion.toLowerCase();
  if (criterion.includes('1.4.3') || criterion.includes('1.4.6') || criterion.includes('contraste')) return [contrastSuggestion(result, base)];
  if (criterion.includes('4.1.2') || criterion.includes('2.4.4') || criterion.includes('nome') || criterion.includes('botão') || criterion.includes('link')) return [controlSuggestion(result, base)];
  if (criterion.includes('3.3.2') || criterion.includes('form') || criterion.includes('campo')) return [formSuggestion(result, base)];
  if (criterion.includes('2.4.7') || criterion.includes('2.4.11') || criterion.includes('foco')) return [{ ...base, title: 'Tornar o foco visível', css: ':focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }', rationale: `${base.rationale} Valide o contraste do indicador no fundo real.`, expectedResult: 'O foco deve permanecer visível em todos os estados de teclado.', humanReviewRequired: true }];
  return [base];
}
export function suggestionsForImages(images: ImageAnalysis[]): ComparisonSuggestion[] { return images.map(imageSuggestion); }
export function generateCorrectionSuggestions(report: AuditReport): ComparisonSuggestion[] { return [...report.results.flatMap(suggestionsForRule), ...suggestionsForImages(report.snapshot.images)]; }
