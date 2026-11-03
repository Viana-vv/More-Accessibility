# Arquitetura e validação

- `src/shared`: contratos entre captura, motor, interface, comparações e relatórios.
- `src/server`: servidor HTTP local, defesa anti-SSRF, CDP sem Playwright/Puppeteer, prévias seguras e integração do histórico persistente.
- `src/engine`: regras WCAG próprias, evidências e classificação contextual de imagens.
- `src/ui`: aplicação responsiva, assets originais e SVGs oficiais do Regen Icons.
- `src/comparisons`: sugestões de correção baseadas nas evidências do motor.
- `src/reports`: histórico local em arquivo e exportação.
- `tests`: testes unitários, de integração, regressão e harness CDP nativo.

O histórico persistente é fornecido a `startLocalServer` pelo entrypoint `src/server/main.ts`; cada captura concluída recebe ID e é gravada em `data/audit-history.json`. Falhas de captura são registradas separadamente. A API `GET /api/history` alimenta a interface após navegação ou recarga.

## Qualidade e responsividade

`tests/ui-cdp.test.mjs` usa CDP nativo e uma instância isolada do Edge em porta dedicada para abrir a UI real, navegar pelas rotas, medir o documento e validar a interface nos viewports documentados em `README.md`. O teste não pode usar uma sessão CDP que contenha abas do usuário. Se não houver CDP configurado, ele é explicitamente ignorado e não conta como validação de responsividade.

A verificação de 200% e espaçamento de texto é automatizada por simulação CSS; ela não substitui o zoom nativo nem inspeção manual. `docs/quality-review.md` registra os testes executados e as verificações manuais ainda pendentes.
