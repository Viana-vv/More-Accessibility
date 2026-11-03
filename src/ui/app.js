import { CATEGORIES, categoryFor, filterResults, summarizeCategories } from './filter-model.js';

(() => {
  const links = [...document.querySelectorAll('[data-view]')];
  const views = [...document.querySelectorAll('.view')];
  const form = document.querySelector('#scan-form');
  const status = document.querySelector('#form-status');
  const resultUrl = document.querySelector('#result-url');
  const resultStatus = document.querySelector('#result-status');
  const captureContext = document.querySelector('#capture-context');
  const captureAlert = document.querySelector('#capture-alert');
  const ruleResults = document.querySelector('#rule-results');
  const imageResults = document.querySelector('#image-results');
  const categoryList = document.querySelector('#category-list');
  const modal = document.querySelector('#detail-modal');
  const modalContent = document.querySelector('#modal-content');
  const modalTitle = document.querySelector('#modal-title');
  const modalPanel = document.querySelector('.modal-panel');
  let currentResults = [];
  let activeStatus = 'all';
  let activeCategory = 'all';
  let lastFocusedElement;
  let lastReport;
  let currentSuggestions = [];

  const captureLabels = {
    captured: 'Captura concluída',
    'authentication-required': 'Autenticação necessária',
    blocked: 'Captura bloqueada',
    'network-error': 'Erro de rede',
    timeout: 'Tempo esgotado',
    'content-unavailable': 'Conteúdo indisponível',
  };
  const statusLabels = { pass: 'Aprovado', violation: 'Violação', review: 'Revisão necessária', 'not-applicable': 'Não aplicável' };
  const purposeLabels = { decorative: 'Decorativa', 'informative-or-functional': 'Informativa ou funcional', indeterminate: 'Indeterminada' };

  const escape = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const text = (value, fallback = 'Não informado') => value === undefined || value === null || value === '' ? fallback : String(value);
  const make = (tag, className, content = '') => { const element = document.createElement(tag); if (className) element.className = className; if (content) element.textContent = content; return element; };

  function showView(name) {
    const target = links.find((link) => link.dataset.view === name) ?? links[0];
    const viewId = target?.getAttribute('href')?.slice(1);
    links.forEach((link) => { const active = link === target; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    views.forEach((view) => { view.hidden = view.id !== viewId; });
  }

  function route() { const hash = window.location.hash.slice(1); showView(hash === 'analises' ? 'analyses' : hash === 'relatorios' ? 'reports' : 'home'); if (hash === 'relatorios') renderHistory(); if (hash === 'analises' && !lastReport) { const saved = historyState().validReports?.[0]; if (saved) { lastReport = saved; document.querySelector('#analysis-empty')?.setAttribute('hidden', ''); document.querySelector('#analysis-results')?.removeAttribute('hidden'); renderReport(saved); } } }

  function historyState() { try { return JSON.parse(localStorage.getItem('wcag-audit-history') || '{"validReports":[],"failedAudits":[]}'); } catch { return { validReports: [], failedAudits: [] }; } }
  function saveHistory(state) { localStorage.setItem('wcag-audit-history', JSON.stringify(state)); }
  function download(name, content, type) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  function renderHistory() {
    const section = document.querySelector('#relatorios'); if (!section) return;
    let list = section.querySelector('#history-list'); if (!list) { list = make('div', 'history-list'); list.id = 'history-list'; section.append(list); }
    let actions = section.querySelector('#history-actions'); if (!actions) { actions = make('div', 'report-actions'); actions.id = 'history-actions'; const json = make('button', 'secondary-button', 'Exportar histórico JSON'); json.type = 'button'; json.addEventListener('click', () => download('historico-wcag.json', JSON.stringify(historyState(), null, 2), 'application/json')); const html = make('button', 'secondary-button', 'Exportar histórico HTML'); html.type = 'button'; html.addEventListener('click', () => { const state = historyState(); const content = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Histórico de análises</title><main><h1>Histórico de análises</h1>${[...(state.validReports || []).map((item) => `<article><h2>${escape(item.target.url)}</h2><p>${escape(item.generatedAt)}</p></article>`), ...(state.failedAudits || []).map((item) => `<article><h2>Falha</h2><p>${escape(item.message)}</p></article>`)].join('')}</main></html>`; download('historico-wcag.html', content, 'text/html'); }); actions.append(json, html); section.insertBefore(actions, list); }
    const state = historyState(); list.replaceChildren(); const reports = state.validReports || []; const failures = state.failedAudits || [];
    if (!reports.length && !failures.length) { list.append(make('p', 'empty-result', 'Nenhum relatório ou falha registrada.')); return; }
    reports.forEach((report) => { const item = make('article', 'result-card'); item.append(make('div', '', `${report.target.url} — ${report.generatedAt}`)); const button = make('button', 'secondary-button', 'Abrir análise'); button.type = 'button'; button.addEventListener('click', () => { renderReport(report); window.location.hash = 'analises'; document.querySelector('#analysis-empty')?.setAttribute('hidden', ''); document.querySelector('#analysis-results')?.removeAttribute('hidden'); }); item.append(button); list.append(item); });
    failures.forEach((failure) => { const item = make('article', 'result-card'); item.append(make('div', '', `Falha — ${failure.target?.url || 'URL não informada'} — ${failure.message}`)); list.append(item); });
  }

  function filteredResults() { return filterResults(currentResults, { status: activeStatus, category: activeCategory }); }
  function drawCategories() {
    const counts = summarizeCategories(currentResults);
    const icons = { [CATEGORIES.contrast]: 'Aa', [CATEGORIES.images]: '▧', [CATEGORIES.controls]: '◉', [CATEGORIES.links]: '↗', [CATEGORIES.forms]: '▤', [CATEGORIES.structure]: '≡', [CATEGORIES.other]: '•' };
    categoryList.replaceChildren(...Object.entries(counts).map(([name, count]) => { const button = make('button', 'category-button'); button.type = 'button'; button.dataset.category = name; button.setAttribute('aria-pressed', String(activeCategory === name)); button.append(make('span', 'category-icon', icons[name] || '•'), make('span', 'category-label', name), make('span', 'category-count', String(count.total))); button.addEventListener('click', () => { activeCategory = activeCategory === name ? 'all' : name; drawCategories(); drawResults(); }); return button; }));
  }
  function drawResults() { const results = filteredResults(); document.querySelector('#criteria-count').textContent = `${results.length} ocorrência(s)`; ruleResults.replaceChildren(...(results.length ? results.map((item) => renderOccurrence(item, false)) : [make('p', 'empty-result', 'Nenhum problema corresponde ao filtro selecionado.')])); }

  function openModal(item, opener) { lastFocusedElement = opener || document.activeElement; modalTitle.textContent = `${text(item.criterion)} · ${text(item.ruleId)}`; const details = renderOccurrence(item, false); details.open = true; modalContent.replaceChildren(details.querySelector('.criterion-body').cloneNode(true)); modal.hidden = false; modalPanel.focus(); }
  function closeModal() { modal.hidden = true; modalContent.replaceChildren(); lastFocusedElement?.focus(); }

  function codeBlock(label, value, language = 'html') {
    const wrapper = make('div', 'code-block');
    const header = make('div', 'code-header');
    header.append(make('span', 'code-label', label));
    if (value) {
      const button = make('button', 'copy-button', 'Copiar');
      button.type = 'button';
      button.dataset.copy = value;
      button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(value); button.textContent = 'Copiado'; setTimeout(() => { button.textContent = 'Copiar'; }, 1400); }
        catch { button.textContent = 'Cópia indisponível'; }
      });
      header.append(button);
    }
    wrapper.append(header);
    const pre = make('pre');
    pre.className = `language-${language}`;
    pre.textContent = value || 'Nenhum trecho fornecido pelo relatório.';
    wrapper.append(pre);
    return wrapper;
  }

  function field(label, value, className = '') {
    const wrapper = make('div', `detail-field ${className}`.trim());
    wrapper.append(make('dt', '', label), make('dd', '', text(value)));
    return wrapper;
  }

  function renderOccurrence(item, captureBlocked) {
    const template = document.querySelector('#rule-template');
    const details = template.content.firstElementChild.cloneNode(true);
    const summary = details.querySelector('summary');
    const title = details.querySelector('.criterion-title');
    const badge = details.querySelector('.criterion-status');
    title.textContent = `${text(item.criterion)} · ${text(item.ruleId)}`;
    badge.textContent = captureBlocked ? 'Sem resultado' : statusLabels[item.status] || text(item.status);
    badge.classList.add(captureBlocked ? 'status-neutral' : `status-${item.status || 'review'}`);
    summary.addEventListener('click', (event) => { event.preventDefault(); openModal(item, summary); });
    const body = details.querySelector('.criterion-body');
    const suggestion = currentSuggestions.find((entry) => entry.ruleId === item.ruleId);
    const heading = make('p', 'occurrence-description', captureBlocked ? 'A captura não permitiu aplicar este critério.' : text(item.description));
    body.append(heading);
    const grid = make('dl', 'detail-grid');
    grid.append(field('ID da ocorrência', item.occurrenceId || item.ruleId), field('Nível', item.level), field('Elemento / seletor', item.selector), field('Impacto', item.impact), field('Resultado', captureBlocked ? 'Não avaliado' : statusLabels[item.status]));
    body.append(grid);
    if (!captureBlocked) {
      const evidence = make('div', 'evidence-block');
      evidence.append(make('h3', '', 'Evidência'));
      const list = make('ul', 'evidence-list');
      (item.evidence || []).forEach((entry) => { const li = make('li'); li.textContent = `${text(entry.kind)}: ${text(entry.value)}${entry.source ? ` (${entry.source})` : ''}`; list.append(li); });
      if (!list.childElementCount) list.append(make('li', '', 'Nenhuma evidência fornecida.'));
      evidence.append(list);
      body.append(evidence);
      if (item.html) body.append(codeBlock('HTML original', item.html));
      const comparison = make('div', 'comparison-card');
      comparison.append(make('h3', '', 'Comparação antes / depois'));
      const columns = make('div', 'comparison-grid');
      columns.append(codeBlock('Antes', item.html || '', 'html'));
      const correctedCode = item.correctedHtml || suggestion?.html || suggestion?.css;
      if (correctedCode) columns.append(codeBlock('Depois', correctedCode, suggestion?.css && !suggestion?.html ? 'css' : 'html'));
      else columns.append(make('p', 'technical-guidance', item.remediation || 'Correção automática não disponível para esta ocorrência.'));
      comparison.append(columns);
      if (item.correctedHtml || suggestion?.html || suggestion?.css || item.remediation || item.expectedResult) {
        comparison.append(field('Correção sugerida', suggestion?.rationale || item.remediation), field('Resultado esperado', suggestion?.expectedResult || item.expectedResult));
        body.append(comparison);
      }
    }
    return details;
  }

  function renderImage(item) {
    const card = make('article', 'image-card');
    if (item.source) { const image = document.createElement('img'); image.src = item.source; image.alt = `Miniatura da imagem ${text(item.elementId)}`; image.loading = 'lazy'; card.append(image); }
    const content = make('div', 'image-card-content');
    const heading = make('div', 'image-heading'); heading.append(make('h3', '', text(item.elementId))); heading.append(make('span', `purpose-chip purpose-${item.purpose || 'indeterminate'}`, purposeLabels[item.purpose] || 'Indeterminada')); content.append(heading);
    const grid = make('dl', 'detail-grid'); grid.append(field('Origem', item.source), field('Revisão humana', item.humanReviewRequired ? 'Necessária' : 'Não indicada'), field('Critérios', (item.relatedCriteria || []).join(', '))); content.append(grid);
    const evidence = make('p', 'image-evidence', `Evidências: ${(item.evidence || []).map((entry) => `${text(entry.kind)} — ${text(entry.value)}`).join('; ') || 'Nenhuma fornecida.'}`); content.append(evidence);
    if (item.html) content.append(codeBlock('HTML original', item.html));
    if (item.suggestedFix) content.append(codeBlock('Sugestão de correção', item.suggestedFix));
    if (item.issues?.length) { const list = make('ul', 'issue-list'); item.issues.forEach((issue) => list.append(make('li', '', issue))); content.append(list); }
    card.append(content); return card;
  }

  function renderReport(report, suggestions = []) {
    const snapshot = report?.snapshot || {};
    const captureState = report?.captureState || snapshot.captureState || 'captured';
    const captureBlocked = captureState !== 'captured';
    const results = captureBlocked ? [] : (report?.results || []);
    lastReport = report;
    currentSuggestions = suggestions.length ? suggestions : (report.suggestions || report._suggestions || []);
    currentResults = results.filter((item) => item.status === 'violation' || item.status === 'review');
    activeStatus = 'all';
    activeCategory = 'all';
    const images = captureBlocked ? [] : (snapshot.images || []);
    const counts = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
    resultUrl.textContent = text(report?.target?.url);
    resultStatus.textContent = captureLabels[captureState] || 'Estado da captura';
    resultStatus.className = `status-chip ${captureBlocked ? 'status-warning' : 'status-pass'}`;
    captureContext.textContent = captureBlocked ? 'Nenhum resultado WCAG foi atribuído.' : `Documento capturado: “${text(snapshot.title, 'Título não informado')}”.`;
    captureAlert.hidden = !captureBlocked;
    captureAlert.textContent = captureBlocked ? `${captureLabels[captureState] || 'Captura não concluída'}: ${text(report?.captureMessage || snapshot.captureMessage, 'Não foi possível obter o conteúdo analisável.')} Nenhum resultado WCAG foi atribuído.` : '';
    document.querySelector('#audit-summary').textContent = captureBlocked ? 'Auditoria não executada porque a captura não foi concluída.' : `${counts.violation || 0} violação(ões), ${counts.review || 0} revisão(ões), ${counts.pass || 0} aprovação(ões) e ${counts['not-applicable'] || 0} não aplicável(is).`;
    document.querySelector('#image-summary').textContent = captureBlocked ? 'As imagens não foram analisadas.' : `${images.length} imagem(ns) encontrada(s); ${images.filter((item) => item.humanReviewRequired).length} exige(m) revisão humana.`;
    document.querySelector('#criteria-count').textContent = `${results.length} ocorrência(s)`;
    document.querySelector('#images-count').textContent = `${images.length} imagem(ns)`;
    drawCategories();
    drawResults();
    imageResults.replaceChildren(...(images.length ? images.map(renderImage) : [make('p', 'empty-result', captureBlocked ? 'Sem imagens: a captura não foi concluída.' : 'Nenhuma imagem foi encontrada.') ]));
  }

  window.addEventListener('hashchange', route);
  document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => { activeStatus = button.dataset.filter || 'all'; document.querySelectorAll('.filter-button').forEach((item) => { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); drawResults(); }));
  document.querySelector('#modal-close')?.addEventListener('click', closeModal);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal && !modal.hidden) { closeModal(); return; } if (event.key === 'Tab' && modal && !modal.hidden) { const focusable = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]; if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = String(new FormData(form).get('url') ?? '').trim();
    if (!url) return;
    status.textContent = 'Analisando a URL informada…';
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível analisar a URL.');
      const report = payload.report || { target: { url }, snapshot: payload.snapshot, results: [], generatedAt: new Date().toISOString(), captureState: payload.snapshot?.captureState || 'content-unavailable', captureMessage: payload.snapshot?.captureMessage };
      renderReport(report, payload.suggestions || []); report._suggestions = payload.suggestions || []; const state = historyState(); if (report.captureState === 'captured') state.validReports = [report, ...(state.validReports || [])]; else state.failedAudits = [{ id: crypto.randomUUID(), occurredAt: new Date().toISOString(), target: { url }, message: report.captureMessage || 'A captura não foi concluída.' }, ...(state.failedAudits || [])]; saveHistory(state); status.textContent = 'Análise concluída. Os resultados estão disponíveis na aba Análises.'; window.location.hash = 'analises'; document.querySelector('#analysis-empty')?.setAttribute('hidden', ''); document.querySelector('#analysis-results')?.removeAttribute('hidden');
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Falha na análise.'; }
  });
  route();
})();
