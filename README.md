# Execução local

Aplicação local para analisar exclusivamente a URL informada pelo usuário. O servidor captura o DOM renderizado com Chrome DevTools Protocol e aplica regras próprias baseadas na WCAG 2.2. Não utiliza axe-core, Lighthouse, Playwright ou Puppeteer e não rastreia outras páginas do domínio.

## Instalação e execução

Requer Node.js 22 ou posterior e Microsoft Edge ou Chrome instalado.

```bash
npm install
npm test
npm run dev
```

`npm run dev` compila o TypeScript e inicia a aplicação em `http://127.0.0.1:8787`. Se não houver um navegador conectado a CDP na porta 9222, o servidor tenta iniciar Edge/Chrome em modo headless. É possível indicar o executável com `CHROME_PATH`.

## Uso e dados

Informe uma URL HTTP(S) na página inicial. O analisador examina somente essa URL. Capturas que falham ficam separadas dos relatórios válidos e não recebem resultados WCAG atribuídos à página.

O histórico persistente fica em `data/audit-history.json`, fora do controle de versão. A interface consulta `GET /api/history`; o servidor oferece `GET /health` para verificação local. Os relatórios podem ser exportados pela tela Relatórios.
Se o arquivo de histórico estiver corrompido ou em formato incompatível, o servidor inicia com aviso e preserva uma cópia `.invalid-<id>.json` antes de gravar novos dados.

## Assets e auditoria

A logo original é disponibilizada em `/logo.png`. Ícones SVG oficiais do Regen Icons são armazenados localmente em `src/ui/icons/`, acompanhados da licença MIT. As auditorias WCAG são implementadas no motor TypeScript próprio.

A classificação de finalidade de imagem é contextual e conservadora. A ferramenta sinaliza revisão humana quando o código coletado não permite determinar a finalidade visual.

## Limitações e validações manuais

A execução CDP automatizada verifica rotas, filtros, modal, exportação e ausência de transbordamento em viewports de 320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1366×768 e 1920×1080. Também aplica simulações automatizadas de escala e espaçamento de texto.

Ainda precisam de verificação manual com leitores de tela reais, navegadores/dispositivos móveis, zoom nativo do navegador, modo de alto contraste e avaliação humana de alternativas textuais e conformidade visual completa. A ferramenta não declara conformidade total WCAG.
