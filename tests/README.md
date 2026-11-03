# Testes do Agente 5

As fixtures em `fixtures/` são páginas locais, sem chamadas de rede e sem axe-core/Lighthouse.

`images-cases.html` cobre os dez cenários obrigatórios de imagens. `images-cases.json` é o oráculo de integração: ele registra a classificação esperada pelo contrato e quando a revisão humana é obrigatória, sem afirmar que `alt` sozinho prova a finalidade.

`ssrf-targets.json` registra entradas que o servidor deve rejeitar antes de resolver/navegar, incluindo loopback, IPv6 local, metadata de nuvem, `file:` e esquemas não suportados. Quando o servidor existir, deve ser conectado a esse vetor sem seguir redirecionamentos para destinos proibidos.

`platform-shell.html` é um baseline mínimo para a acessibilidade da própria plataforma: idioma, skip link, landmarks, título, rótulo de campo e foco visível.

Os testes atuais são testes de contrato/fixture. Como os módulos de servidor e motor ainda não estão presentes nesta branch, não há adaptador executável para chamar a auditoria real; essa lacuna está registrada em `docs/quality-review.md`.
