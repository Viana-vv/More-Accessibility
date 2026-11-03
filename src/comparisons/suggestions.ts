import type { AccessibilityEvidence, AuditReport, CorrectionSuggestion, ImageAnalysis, RuleResult } from '../shared/contracts.js';
import { contrastRatio, parseColor, suggestContrastColors } from './colors.js';

export interface ContrastComparison { before: number; after: number; minimum: number; }
export interface ComparisonSuggestion extends CorrectionSuggestion { expectedResult: string; contrast?: ContrastComparison; }

function evidenceText(evidence: AccessibilityEvidence[]): string { return evidence.map((item) => `${item.kind} ${item.value} ${item.source ?? ''}`).join(' '); }
function firstEvidence(result: RuleResult, kinds: string[]): string | undefined { return result.evidence.find((item) => kinds.includes(item.kind))?.value; }
function colorPair(result: RuleResult): [string, string] | undefined {
  const colors = evidenceText(result.evidence).match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
  if (colors.length < 2 || !parseColor(colors[0]!) || !parseColor(colors[1]!)) return undefined;
  return [colors[0]!, colors[1]!];
}
function baseSuggestion(result: RuleResult): ComparisonSuggestion {
  const suggestion: ComparisonSuggestion = { ruleId: result.ruleId, title: `Revisar ${result.criterion}`, rationale: result.remediation ?? `${result.description} Confirme a correção com as evidências coletadas.`, humanReviewRequired: result.status === 'review', expectedResult: result.status === 'review' ? 'A situação deve ser confirmada por revisão humana.' : 'O critério deve deixar de apresentar violação confirmada.' };
  const before = firstEvidence(result, ['element-html', 'html', 'before', 'computed-style', 'contrast-ratio']);
  if (before !== undefined) suggestion.before = before;
  return suggestion;
}
function codeEvidence(result: RuleResult, kinds: string[]): string | undefined { const value = firstEvidence(result, kinds); return value?.includes('<') ? value : undefined; }

function contrastSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const pair = colorPair(result);
  if (!pair) return { ...base, title: 'Ajustar contraste com as cores reais observadas', rationale: `${base.rationale} As evidências não contêm as duas cores computadas, portanto nenhuma cor foi inventada.`, expectedResult: 'A proporção deve atingir pelo menos 4,5:1 para texto normal ou o mínimo aplicável ao tamanho do texto.', humanReviewRequired: true };
  const target = result.criterion.includes('1.4.6') ? 7 : 4.5;
  const current = contrastRatio(pair[0], pair[1]);
  const proposed = suggestContrastColors(pair[0], pair[1], target);
  if (current === undefined || proposed === undefined) return { ...base, title: 'Ajustar contraste com as cores observadas', expectedResult: `A proporção deve atingir pelo menos ${target}:1.`, humanReviewRequired: true };
  return { ...base, title: `Ajustar contraste para ${target}:1`, rationale: `A proporção observada foi ${current.toFixed(2)}:1. A sugestão altera somente ${proposed.changed === 'foreground' ? 'a cor do texto' : 'a cor de fundo'} e preserva a outra cor quando possível.`, css: `color: ${proposed.foreground};\nbackground-color: ${proposed.background};`, after: `${proposed.foreground} sobre ${proposed.background}`, expectedResult: `A proporção esperada é ${proposed.ratio.toFixed(2)}:1, atendendo ao mínimo de ${target}:1.`, contrast: { before: current, after: proposed.ratio, minimum: target }, humanReviewRequired: false };
}
function controlSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const html = codeEvidence(result, ['corrected-html', 'suggested-html']);
  const original = codeEvidence(result, ['element-html', 'html']);
  const suggestion: ComparisonSuggestion = { ...base, title: 'Fornecer um nome acessível ao controle', rationale: `${base.rationale} O nome deve vir do texto real, de aria-label ou de aria-labelledby observado no contexto; nenhum rótulo foi inventado.`, expectedResult: 'O botão ou link deve expor um nome acessível que comunique sua finalidade.' };
  if (original !== undefined) suggestion.before = original;
  if (html !== undefined) { suggestion.html = html; suggestion.after = html; }
  return suggestion;
}
function formSuggestion(result: RuleResult, base: ComparisonSuggestion): ComparisonSuggestion {
  const html = codeEvidence(result, ['corrected-html', 'suggested-html']);
  const original = codeEvidence(result, ['element-html', 'html']);
  const suggestion: ComparisonSuggestion = { ...base, title: 'Associar o campo ao seu rótulo', rationale: `${base.rationale} Use o id real do campo e o texto real do rótulo coletado. Como esses valores não estão presentes no contrato, nenhum label foi fabricado.`, expectedResult: 'Cada campo deve ter um rótulo ou instrução perceptível e programaticamente associado.' };
  if (original !== undefined) suggestion.before = original;
  if (html !== undefined) { suggestion.html = html; suggestion.after = html; }
  return suggestion;
}
function imageSuggestion(image: ImageAnalysis): ComparisonSuggestion {
  const suggestion: ComparisonSuggestion = { ruleId: image.relatedCriteria[0] ?? '1.1.1', title: 'Revisar finalidade e alternativa da imagem', rationale: image.evidence.map((item) => `${item.kind}: ${item.value}`).join('; ') || 'Nenhuma evidência textual foi coletada.', before: image.html, humanReviewRequired: true, expectedResult: 'A alternativa deve representar a finalidade real da imagem, ou a imagem deve ser marcada como decorativa somente quando isso for confirmado.' };
  if (image.purpose === 'decorative') {
    const html = image.html.replace(/\s+alt\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' alt=""');
    suggestion.title = 'Marcar a imagem como decorativa após confirmação'; suggestion.rationale = `O motor sugeriu decoração. Isso não prova a finalidade: ${suggestion.rationale}`; suggestion.html = html; suggestion.after = html; suggestion.expectedResult = 'A imagem decorativa deve ter alt="" e não transmitir informação necessária.';
  } else if (image.purpose === 'informative-or-functional') {
    suggestion.title = 'Validar alternativa ou nome acessível da imagem'; suggestion.rationale = `A imagem foi classificada como informativa ou funcional. Não será inventado texto alternativo. ${image.issues.join(' ')}`.trim();
    if (image.suggestedFix?.includes('<')) { suggestion.html = image.suggestedFix; suggestion.after = image.suggestedFix; }
    suggestion.expectedResult = 'A imagem deve ter alternativa textual adequada ou o controle ancestral deve ter nome acessível sem redundância.';
  } else { suggestion.title = 'Confirmar a finalidade da imagem'; suggestion.rationale = `A finalidade é indeterminada. Evidências: ${suggestion.rationale}`; }
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
