# Revisão de qualidade

## Testes automatizados

- `npm test`: TypeScript compilado; 44 testes aprovados e 1 teste CDP ignorado quando não há endpoint configurado.
- `CDP_ENDPOINT=http://127.0.0.1:9223 node --test --test-reporter=spec tests/ui-cdp.test.mjs`: executado com Edge headless isolado; 1 teste aprovado, sem skips.
- O teste CDP validou as rotas, os nove viewports de 320×568 a 1920×1080, reflow sem rolagem horizontal, URL longa, simulação de escala de 200%, espaçamento de texto, filtros, agrupamento, modal em 320 px, foco de teclado, logo, ícones Regen, imagem e histórico após remoção de localStorage e recarga.
- Testes de servidor confirmaram IDs de relatórios, sugestões persistidas, API de histórico e separação entre capturas bloqueadas e auditorias válidas.
- Teste de recuperação confirmou cópia de preservação antes de substituir um histórico incompatível.
- `git diff --check`: sem erros de whitespace.

## Verificações manuais pendentes

Não foram feitos testes manuais com leitores de tela reais, zoom nativo do navegador, dispositivos físicos, modo de alto contraste ou avaliação humana das descrições das imagens. A simulação de escala e espaçamento não comprova os critérios WCAG correspondentes em todos os navegadores. A aplicação não deve ser descrita como totalmente conforme WCAG 2.2 AA até essas verificações serem concluídas.

## Ambiente de teste

O navegador de teste foi aberto com perfil temporário próprio e porta CDP 9223; nenhuma aba da sessão CDP externa foi usada na validação final. O teste automático padrão pode registrar um skip para CDP quando não há endpoint dedicado configurado.
