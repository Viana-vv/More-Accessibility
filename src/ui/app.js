(() => {
  const links = [...document.querySelectorAll('[data-view]')];
  const views = [...document.querySelectorAll('.view')];
  const form = document.querySelector('#scan-form');
  const status = document.querySelector('#form-status');
  const resultUrl = document.querySelector('#result-url');
  function showView(name) {
    const target = links.find((link) => link.dataset.view === name) ?? links[0];
    const viewId = target?.getAttribute('href')?.slice(1);
    links.forEach((link) => { const active = link === target; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    views.forEach((view) => { view.hidden = view.id !== viewId; });
  }
  function route() { const hash = window.location.hash.slice(1); showView(hash === 'analises' ? 'analyses' : hash === 'relatorios' ? 'reports' : 'home'); }
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
      if (resultUrl) resultUrl.textContent = payload.report?.target?.url ?? url;
      status.textContent = 'Análise concluída. Revise as evidências antes de corrigir.';
      window.location.hash = 'analises';
      document.querySelector('#analysis-empty')?.setAttribute('hidden', '');
      document.querySelector('#analysis-results')?.removeAttribute('hidden');
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Falha na análise.'; }
  });
  route();
})();
