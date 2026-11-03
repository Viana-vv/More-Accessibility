# More-Accessibility
## Analisador local de acessibilidade

Aplicação local para analisar somente a URL informada, coletando o DOM renderizado por Chrome DevTools Protocol e executando regras próprias baseadas na WCAG 2.2. O projeto não usa axe-core, Lighthouse, Playwright ou Puppeteer e não rastreia outras páginas do domínio.

### Instalação

```bash
npm install
```

### Verificação

```bash
npm test
npm run build
```

### Execução

É necessário ter um Chrome/Chromium com uma porta de depuração CDP disponível para análises reais. Depois do build:

```bash
npm run dev
```

O endpoint `POST /api/analyze` recebe `{ "url": "https://exemplo.com" }`. A resposta contém o snapshot renderizado e o relatório WCAG. `GET /health` verifica o servidor.

### Interface

A referência visual e a logo fornecidas estão na raiz do repositório. A interface em `src/ui` mantém o tema escuro, navegação por teclado, foco visível e estados explícitos para resultados reais, revisão humana e ausência de análises.

### Limitações conhecidas

- A captura depende de um Chrome/Chromium local com CDP.
- Classificação de imagens é contextual e conservadora; não substitui revisão humana.
- Relatórios persistentes e reconhecimento visual local ainda são extensões futuras.
