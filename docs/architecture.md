# Arquitetura inicial

## Escopo

Aplicação local para analisar somente a URL fornecida pelo usuário, coletando dados do DOM renderizado via Chrome DevTools Protocol e avaliando regras próprias baseadas na WCAG 2.2. Não há rastreamento automático de outras páginas.

## Módulos

- `src/shared`: contratos agnósticos de transporte entre servidor, motor, interface e comparações.
- `src/server`: HTTP local, validação anti-SSRF e sessão CDP sem Playwright/Puppeteer.
- `src/engine`: regras WCAG e classificação contextual de imagens.
- `src/ui`: interface escura, acessível e responsiva baseada nos PNGs fornecidos.
- `src/comparisons`: sugestões fundamentadas em evidências reais do motor.
- `tests`: testes unitários, integração e páginas-problema.

## Dependências e ordem

`server -> engine -> ui -> comparisons -> reports`. O contrato compartilhado é a fronteira; módulos podem usar fixtures enquanto a dependência ainda não está integrada.

## Isolamento

Cada frente deve trabalhar em branch/worktree próprio e alterar apenas seu escopo. Alterações em `src/shared/contracts.ts` exigem revisão do coordenador.
