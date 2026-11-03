export const CATEGORIES = Object.freeze({
  contrast: 'Textos e contraste',
  images: 'Imagens',
  controls: 'Botões e controles',
  links: 'Links',
  forms: 'Formulários',
  structure: 'Estrutura e navegação',
  other: 'Outros problemas',
});

export function categoryFor(result) {
  const criterion = String(result?.criterion || '');
  if (criterion === '1.4.3' || criterion === '1.4.6') return CATEGORIES.contrast;
  if (criterion === '1.1.1') return CATEGORIES.images;
  if (criterion === '4.1.2' || criterion === '2.5.8') return CATEGORIES.controls;
  if (criterion === '2.4.4') return CATEGORIES.links;
  if (criterion === '3.3.2') return CATEGORIES.forms;
  if (criterion === '1.3.1' || criterion === '2.4.7' || criterion === '2.4.11') return CATEGORIES.structure;
  return CATEGORIES.other;
}

export function filterResults(results, { status = 'all', category = 'all' } = {}) {
  return results.filter((result) => (result.status === 'violation' || result.status === 'review') && (status === 'all' || result.status === status) && (category === 'all' || categoryFor(result) === category));
}

export function summarizeCategories(results) {
  return results.filter((result) => result.status === 'violation' || result.status === 'review').reduce((summary, result) => {
    const category = categoryFor(result);
    const current = summary[category] || { violations: 0, reviews: 0, total: 0 };
    current.total += 1;
    if (result.status === 'violation') current.violations += 1;
    if (result.status === 'review') current.reviews += 1;
    summary[category] = current;
    return summary;
  }, {});
}
