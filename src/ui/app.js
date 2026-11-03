(() => {
  const links = [...document.querySelectorAll('[data-view]')];
  const views = [...document.querySelectorAll('.view')];
  const form = document.querySelector('#scan-form');
  const status = document.querySelector('#form-status');
  const resultUrl = document.querySelector('#result-url');
  const resultStatus = document.querySelector('#result-status');
  const captureContext = document.querySelector('#capture-context');
  const ruleResults = document.querySelector('#rule-results');
  const imageResults = document.querySelector('#image-results');

  function showView(name) {
    const target = links.find((link) => link.dataset.view === name) ?? links[0];
    const viewId = target?.getAttribute('href')?.slice(1);
    links.forEach((link) => { const active = link === target; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    views.forEach((view) => { view.hidden = view.id !== viewId; });
  }

  function route() { const hash = window.location.hash.slice(1); showView(hash === 'analises' ? 'analyses' : hash === 'relatorios' ? 'reports' : 'home'); }
  function text(value, fallback = 'Não informado') { return value || fallback; }
  function statusLabel(value) { return ({ pass: 'Aprovado', violation: 'Violação', review: 'Revisão necessária', 'not-applicable': 'Não aplicável' })[value] || value; }

  function renderReport(report) {
    const results = report?.results ?? [];
    const images = report?.snapshot?.images ?? [];
    const counts = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
    resultUrl.textContent = text(report?.target?.url);
    const title = report?.snapshot?.title || 'Título não informado';
    const accessDenied = /access denied|acesso negado|forbidden|não autorizado/i.test(title);
    resultStatus.textContent = accessDenied ? 'Revisão necessária' : 'Análise concluída';
    if (captureContext) captureContext.textContent = accessDenied ? `Captura recebida: “${title}”. O conteúdo original não foi disponibilizado.` : `Documento capturado: “${title}”.`;
    document.querySelector('#audit-summary').textContent = `${counts.violation || 0} violação(ões), ${counts.review || 0} revisão(ões), ${counts.pass || 0} aprovação(ões) e ${counts['not-applicable'] || 0} não aplicável(is).`;
    document.querySelector('#image-summary').textContent = accessDenied ? 'A página original não foi entregue; não é possível concluir a análise de imagens.' : `${images.length} imagem(ns) encontrada(s); ${images.filter(item => item.humanReviewRequired).length} exige(m) revisão humana.`;
    ruleResults.replaceChildren(...(results.length ? results.map((item) => { const row = document.createElement('p'); row.textContent = `${item.criterion} — ${item.description}: ${statusLabel(item.status)}.`; return row; }) : [document.createTextNode('Nenhuma regra foi aplicada ao snapshot.') ]));
    imageResults.replaceChildren(...(images.length ? images.map((item) => { const row = document.createElement('p'); row.textContent = `${item.elementId} — ${item.purpose === 'decorative' ? 'Decorativa' : item.purpose === 'informative-or-functional' ? 'Informativa ou funcional' : 'Indeterminada'}${item.humanReviewRequired ? ' — revisão humana necessária' : ''}.`; return row; }) : [document.createTextNode('Nenhuma imagem foi encontrada.') ]));
  }

  window.addEventListener('hashchange', route);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = String(new FormData(form).get('url') ?? '').trim();
    if (!url) return;
    status.textContent = 'Analisando a URL informada…';
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível analisar a URL.');
      renderReport(payload.report);
      status.textContent = 'Análise concluída. Os resultados reais estão disponíveis na aba Análises.';
      window.location.hash = 'analises';
      document.querySelector('#analysis-empty')?.setAttribute('hidden', '');
      document.querySelector('#analysis-results')?.removeAttribute('hidden');
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Falha na análise.'; }
  });
  route();
})();
