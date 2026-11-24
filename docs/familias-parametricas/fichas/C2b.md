# Ficha C2b — Ligações no editor: montar o painel e os marcadores 3D

Modelo: **Haiku 5.5** · Onda 6 · Depende de: C2, B7 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§3). Vale o CONTRATO se algo aqui divergir.

## Contexto
A C2 entregou as operações (`edicaoLigacoes.ts`), o mapa `corDoDominio` (render), os textos (`familiasLigacao.ts`) e o painel (`FamiliaLigacoesPainel.tsx`, `FamiliaLigacoesForm.tsx`), mas parou porque faltava mexer em arquivos fora da lista. Esta ficha autoriza esses arquivos.

## Faça
1. Monte a seção "Ligações" no navegador/propriedades (em `FamiliaPaineis.tsx`, no mesmo estilo da seção de corpos) com os componentes já criados.
2. Exporte `corDoDominio`/`corCssDoDominio` em `packages/render/src/familia/index.ts` e use a cor como amostra no formulário.
3. Marcadores 3D: crie `packages/render/src/familia/visualizadorLigacoes.ts` (classe `LigacoesNaCena`, no modelo de `visualizadorCorpos.ts`: um disco na seção e uma seta na direção, na cor do domínio; selecionável/realçada quando a ligação está selecionada) e ligue-a em `visualizador.ts` (método `definirLigacoes`, MUDANÇA MÍNIMA: o arquivo já passa de 420 linhas; coloque toda a lógica no arquivo novo) e em `Familia3D.tsx` (prop opcional `ligacoes`, preenchida em `FamilyEditor.tsx` com `res.ligacoes ?? []`).
4. Teste de ida e volta: família com `ligacoes` salva em arquivo (`salvarArquivo`/`lerArquivo`) e reaberta sai idêntica. Roteiro Playwright `tests/e2e/familias-ligacoes.mjs` (criar ligação pelo painel e ver a seta no 3D; Chromium em /opt/pw-browsers/chromium; vite na 5199; encerre o seu vite). Textos novos só no shard `familiasLigacao.ts` (sete línguas).


## Aceitação
Ligação criada pelo painel aparece como seta colorida no 3D e sobrevive a salvar/abrir; roteiro verde.

## Arquivos permitidos
- `apps/web/src/ui/familia/FamiliaPaineis.tsx`
- `apps/web/src/ui/familia/FamiliaLigacoesPainel.tsx`
- `apps/web/src/ui/familia/FamiliaLigacoesForm.tsx`
- `apps/web/src/ui/familia/Familia3D.tsx`
- `apps/web/src/ui/familia/FamilyEditor.tsx`
- `packages/render/src/familia/index.ts`
- `packages/render/src/familia/visualizador.ts`
- `packages/render/src/familia/visualizadorLigacoes.ts (NOVO)`
- `packages/render/src/familia/visualizadorLigacoes.test.ts (NOVO)`
- `apps/web/src/editor/i18n/areas/familiasLigacao.ts`
- `packages/model/src/familia/arquivoLigacoes.test.ts (NOVO)`
- `tests/e2e/familias-ligacoes.mjs (NOVO)`

## Proibido
Tudo fora da lista; `crates/**`; testes existentes (só acrescentar); `docs/**`. Não chame ferramentas fora da ficha (nada de criar sessões, listar ou agendar tarefas, interromper sessões).

## Parada
Contrato contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
