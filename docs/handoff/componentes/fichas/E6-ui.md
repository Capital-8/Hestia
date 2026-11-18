# Ficha E6-ui — Lista de peças completa no editor (lista, resumo, custo, plano de corte, etiquetas, CSV e DXF)

Base: branch `feat/familias-interface` (E1 a E6 integradas; o motor das saídas está pronto).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O diálogo "Lista de peças" do editor (`apps/web/src/ui/familia/FamiliaLista.tsx`) é uma versão provisória. Reescreva-o usando as funções prontas:
- `@hestia/engine`: `listaDePecas`, `resumirLista`, `custoEstimado`, `listaPecasCsv`, `etiquetaDaLinha`, `planoDeCorte`, `pecasParaCorte`, `gerarCavilhas`, `aplicarFuracao`, `resolverFamilia` (já exposto pelo store como `useResolucao()`: `pecas`, `ferragens`, `erros`, `env`);
- `@hestia/io`: `dxfDasPecas`;
- `@hestia/model`: `Catalogo`, `chapaPorId`, `areaUtilDaChapa`.
O store (`familiaStore.ts`) já tem `catalogo` (Catalogo da sessão) e `cavilhas` (booleano). Leia antes: `FamiliaLista.tsx`, `FamiliaJanela.tsx` (`Janela`), `familiaStore.ts`, `FamiliaTipos.tsx` (para o estilo das tabelas e abas), `familia.css` e as especificações em comentário de `listaPecas.ts`, `planoCorte.ts` e `dxfPecas.ts`.

## Faça
1. Reescreva `FamiliaLista.tsx` como diálogo largo com 4 abas (botões de aba, `role="tablist"`): **Lista**, **Plano de corte**, **Custo**, **Etiquetas**. No cabeçalho da janela: nome do tipo e `L × A × P` do `env` (mm). Uma barra de opções comum às abas: caixa "Cavilhas automáticas" (liga `cavilhas` do store) e botões "Copiar CSV", "Baixar CSV", "Baixar DXF". Peças efetivas = `cavilhas ? aplicarFuracao(pecas, gerarCavilhas(pecas)) : pecas`.
2. **Lista**: tabela de `listaDePecas(efetivas)` com colunas Qtd, Peça (`nomes` num `title`), Papel, Chapa/Material, Comprimento, Largura, Espessura, Veio (símbolos: ↔ comprimento, ↕ largura, ◌ livre, vazio), Fita C1, C2, L1, L2 (✔ com o id da fita no `title`, vazio sem), Furos, Rasgos, Recortes, Área. Abaixo: resumo de `resumirLista` (peças, área total, área por chapa/espessura, metros de fita por tipo, usinagens) e uma segunda tabela de ferragens (`resolucao.ferragens`: nome, código, quantidade).
3. **Plano de corte**: select da chapa (as chapas do catálogo cujo id aparece em `linha.chapa` das linhas; peças sem chapa não entram e uma nota diz quantas ficaram de fora); campo "Serra (mm)" (padrão 3); refilo, tamanho e veio vêm da chapa do catálogo (`chapaPorId`). Calcule `planoDeCorte(pecasParaCorte(linhasDaChapa), { largura, altura, refilo, veio, kerf })` e desenhe CADA chapa cortada em SVG proporcional (retângulo da chapa, área útil tracejada, uma caixa por peça com o nome curto e a medida; peças giradas com uma marca ↻), com o aproveitamento (%) e o nº de chapas no topo e a lista das que não couberam. Ao passar o mouse numa peça, `title` com nome e medidas.
4. **Custo**: campos "Perda de chapa (%)" (15) e "Perda de fita (%)" (10); mostre `custoEstimado(resumo, catalogo, resolucao.ferragens, { perdaChapa, perdaFita })` em uma tabela (chapas, fitas, ferragens, total), com valores em reais com 2 casas e vírgula decimal.
5. **Etiquetas**: grade de cartões, um por linha da lista, com as 3 linhas de `etiquetaDaLinha` (repetidos `quantidade` vezes não: um cartão por linha, com a quantidade no canto).
6. **CSV e DXF**: "Copiar CSV" usa `navigator.clipboard.writeText(listaPecasCsv(linhas))` com tratamento de falha (mensagem "Não foi possível copiar" na própria barra); "Baixar CSV" e "Baixar DXF" criam um `Blob`, um link temporário e `click()` (nome `<id da família>-<tipo>.csv` e `.dxf`); o DXF vem de `dxfDasPecas(efetivas)`.
7. Lógica pura em `familiaLista.ts` (NOVO) com testes em `familiaLista.test.ts` (NOVO): `pecasEfetivas`, `linhasDaChapa(linhas, chapaId)`, `chapasPresentes(linhas, catalogo)`, `geometriaDaChapa(plano, chapa)` (retângulos prontos para o SVG, em mm, sem JSX), `nomeDoArquivo(familiaId, tipoId, ext)` (só `[a-z0-9_-]`). Teste cada um com números exatos.
8. Medidas e valores formatados precisam de `// units-ok: <motivo>` na linha ou na anterior (portão `node scripts/check-units.mjs`). Estilos em NOVO `familiaLista.css`. Nenhum arquivo passa de 420 linhas (divida em `FamiliaListaTabela.tsx`, `FamiliaListaCorte.tsx`, `FamiliaListaCusto.tsx`, `FamiliaListaEtiquetas.tsx`…).

## Arquivos permitidos
`apps/web/src/ui/familia/FamiliaLista.tsx` e novos `apps/web/src/ui/familia/FamiliaLista*.tsx`, `familiaLista*.ts`, `familiaLista*.test.ts`, `familiaLista*.css`.

## Proibido
Os demais arquivos de `apps/web/src/ui/familia/` (outras fichas trabalham neles: `FamiliaCatalogo.tsx`, `FamiliaUsinagens.tsx`, `FamiliaFabricacao.tsx`, `FamiliaOpcoes.tsx`, `FamiliaNovo.tsx`, `FamiliaArquivo.tsx`, `familiaStore.ts`), `packages/**`, `crates/**`, `docs/**`.

## Aceite (o orquestrador roda)
`tsc`, `eslint --max-warnings 0` nos arquivos, `npx vitest run apps/web/src/ui/familia`, `node scripts/check-units.mjs`, `check-boundaries`; depois o orquestrador abre o editor, o diálogo Lista de peças, e confere as 4 abas com o armário A80 (11 peças, 8 linhas, plano com 1 chapa), liga as cavilhas (a contagem de furos sobe), copia o CSV e baixa o DXF.

## Critério de parada
Se faltar algo nas funções de `@hestia/engine` ou `@hestia/io`, PARE e relate qual; não altere `packages/`.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
