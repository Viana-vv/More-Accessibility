import type { AccessibilityEvidence, AuditReport, ImageAnalysis, RuleResult, CorrectionSuggestion } from '../shared/contracts.js';
import { contrastRatio, parseColor, suggestContrastColors } from './colors.js';

function evidenceText(evidence: AccessibilityEvidence[]): string {
  return evidence.map((item) => `${item.kind} ${item.value} ${item.source ?? ''}`).join(' ');
}

function evidenceColorPair(result: RuleResult): [string, string] | undefined {
  const text = evidenceText(result.evidence);
  const colors = text.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
  if (colors.length < 2 || !parseColor(colors[0]!) || !parseColor(colors[1]!)) return undefined;
  return [colors[0]!, colors[1]!];
}

function baseRuleSuggestion(result: RuleResult): CorrectionSuggestion {
  const suggestion: CorrectionSuggestion = {
    ruleId: result.ruleId,
    title: `Revisar ${result.criterion}`,
    rationale: result.remediation ?? `${result.description} Exiba as evidências coletadas e confirme a correção no contexto da página.`,
    humanReviewRequired: result.status === 'review',
  };
  const firstEvidence = result.evidence[0]?.value;
  if (firstEvidence !== undefined) suggestion.before = firstEvidence;
  return suggestion;
}

export function suggestionsForRule(result: RuleResult): CorrectionSuggestion[] {
  if (result.status !== 'violation' && result.status !== 'review') return [];
  const suggestion = baseRuleSuggestion(result);
  const criterion = result.criterion.toLowerCase();

  if (criterion.includes('1.4.3') || criterion.includes('1.4.6') || criterion.includes('contraste')) {
    const pair = evidenceColorPair(result);
    if (pair) {
      const target = criterion.includes('1.4.6') ? 7 : 4.5;
      const proposed = suggestContrastColors(pair[0], pair[1], target);
      const current = contrastRatio(pair[0], pair[1]);
      if (proposed && current !== undefined) {
        return [{ ...suggestion, title: `Ajustar contraste para ${target}:1`, rationale: `A proporção observada foi ${current.toFixed(2)}:1. A alternativa altera apenas ${proposed.changed === 'foreground' ? 'a cor do texto' : 'a cor de fundo'} e mantém a outra cor, preservando a aparência quando possível.`, css: `color: ${proposed.foreground};\nbackground-color: ${proposed.background};`, after: `${proposed.foreground} sobre ${proposed.background} — ${proposed.ratio.toFixed(2)}:1`, humanReviewRequired: false }];
      }
    }
  }

  if (criterion.includes('nome') || criterion.includes('4.1.2') || criterion.includes('2.4.4')) {
    return [{ ...suggestion, title: 'Fornecer um nome acessível baseado no contexto real', rationale: `${suggestion.rationale} Não foi gerado um texto para o nome porque o contrato não fornece um rótulo confiável para inventar. Use o texto visível existente ou o propósito confirmado pelo autor.`, humanReviewRequired: true }];
  }

  if (criterion.includes('form') || criterion.includes('3.3.2') || criterion.includes('1.3.1')) {
    return [{ ...suggestion, title: 'Associar o campo ao seu rótulo', rationale: `${suggestion.rationale} A correção deve usar o identificador real do campo e o texto real do rótulo coletado; nenhum desses valores é inventado por este módulo.`, humanReviewRequired: result.status === 'review' }];
  }

  if (criterion.includes('foco') || criterion.includes('2.4.7') || criterion.includes('2.4.11')) {
    return [{ ...suggestion, title: 'Tornar o foco visível sem removê-lo', css: ':focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }', rationale: `${suggestion.rationale} Ajuste a cor do indicador ao fundo real e valide o foco em todos os estados interativos.`, humanReviewRequired: result.status === 'review' }];
  }
  return [suggestion];
}

function imageSuggestion(image: ImageAnalysis): CorrectionSuggestion | undefined {
  const review = image.humanReviewRequired || image.purpose === 'indeterminate';
  const base = { ruleId: image.relatedCriteria[0] ?? '1.1.1', before: image.html, humanReviewRequired: review };
  if (image.purpose === 'decorative') {
    const html = image.suggestedFix ?? (image.html ? image.html.replace(/\s+alt\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' alt=""') : undefined);
    const suggestion: CorrectionSuggestion = { ...base, title: 'Marcar a imagem como decorativa após confirmação', rationale: `A classificação do motor é decorativa com base nestas evidências: ${image.evidence.map((item) => item.value).join('; ') || 'nenhuma evidência textual disponível'}. A classificação é uma sugestão e deve ser confirmada.`, humanReviewRequired: true };
    if (html !== undefined) {
      suggestion.html = html;
      suggestion.after = html;
    }
    return suggestion;
  }
  if (image.purpose === 'informative-or-functional') {
    const suggestion: CorrectionSuggestion = { ...base, title: 'Validar a alternativa ou o nome acessível da imagem', rationale: `A imagem foi classificada como informativa ou funcional. Não será inventado texto alternativo; valide a descrição ou o nome acessível usando a finalidade real. ${image.issues.join(' ')}`.trim(), humanReviewRequired: true };
    if (image.suggestedFix !== undefined) suggestion.html = image.suggestedFix;
    return suggestion;
  }
  return { ...base, title: 'Confirmar a finalidade da imagem', rationale: `A finalidade não pôde ser determinada com segurança. Evidências: ${image.evidence.map((item) => item.value).join('; ') || 'nenhuma'}. Revise o contexto antes de escolher alt, nome acessível ou remoção da informação.`, humanReviewRequired: true };
}

export function suggestionsForImages(images: ImageAnalysis[]): CorrectionSuggestion[] {
  return images.flatMap((image) => { const suggestion = imageSuggestion(image); return suggestion ? [suggestion] : []; });
}

export function generateCorrectionSuggestions(report: AuditReport): CorrectionSuggestion[] {
  return [...report.results.flatMap(suggestionsForRule), ...suggestionsForImages(report.snapshot.images)];
}
