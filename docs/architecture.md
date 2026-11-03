# Arquitetura inicial

## Escopo

Aplicacao local para analisar somente a URL fornecida pelo usuario, coletando o DOM renderizado via Chrome DevTools Protocol e avaliando regras proprias baseadas na WCAG 2.2. Nao ha rastreamento automatico de outras paginas.

## Modulos

- `src/shared`: contratos de transporte entre servidor, motor, interface e comparacoes.
- `src/server`: HTTP local, validacao anti-SSRF e sessao CDP sem Playwright/Puppeteer.
- `src/engine`: regras WCAG e classificacao contextual de imagens.
- `src/ui`: interface escura, responsiva e acessivel baseada nos assets fornecidos.
- `src/comparisons`: sugestoes fundamentadas em evidencias reais do motor.
- `tests`: testes unitarios, integracao e paginas-problema.

## Dependencias e ordem

`server -> engine -> ui -> comparisons -> reports`. O contrato compartilhado e a fronteira; modulos podem usar fixtures enquanto a dependencia ainda nao esta integrada.

## Isolamento

Cada frente deve trabalhar em branch/worktree proprio e alterar apenas seu escopo. Alteracoes em `src/shared/contracts.ts` exigem revisao do coordenador.

## QA de interface e fixtures

Os testes de qualidade devem permanecer em `tests/` e nao podem corrigir os modulos de producao. `tests/ui-cdp.test.mjs` usa CDP nativo, sem Playwright/Puppeteer, para servir uma fixture de auditoria, abrir a UI real e medir `scrollWidth`/`clientWidth` nos viewports de 320 a 1920 px. O mesmo harness cobre rotas, modal, filtros, copia, historico local, exportacao e assets.

Quando Chromium/CDP nao estiver disponivel, o teste deve ser `skip` explicito; isso nao constitui aprovacao de responsividade. Resultados de overflow, zoom, espacamento e verificacoes manuais devem ser registrados em `docs/quality-review.md`, sem alegar validacoes nao executadas.
