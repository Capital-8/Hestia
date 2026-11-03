# Ficha E3-ed2 — diálogos de Parâmetros e Tipos editáveis

Base: branch `feat/familias-interface` (editor já migrado para o contrato novo).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Hoje `FamiliaDialogos.tsx` mostra as tabelas de Parâmetros e Tipos só para leitura. Torne-as editáveis usando as operações puras de `@hestia/model` (`adicionarParametro`, `renomearParametro`, `excluirParametro`, `usosDoNome`, `adicionarTipo`, `duplicarTipo`, `excluirTipo`, `definirValorDeTipo`, tipos em `Parametro`) e o store (`useFamilia`: `executar(rotulo, receita)` devolve `null` ou o motivo de recusa; `agrupar`; `desfazer`). TODA alteração passa por `executar` (assim o desfazer funciona). Leia antes: todos os arquivos de `apps/web/src/ui/familia/`, `packages/model/src/familia/edicao.ts` (especificação de cada operação), `tipos.ts` e `acoes.ts` (`lerEntrada`, `rotuloDoValor`).

## Faça
1. **Tabela de Parâmetros editável** (diálogo `parametros`), uma linha por parâmetro, na ordem da família, agrupada visualmente por `grupo` (use `agruparParametros`). Colunas e comportamento:
   - Nome (texto), Id (texto; mudar chama `renomearParametro`; L, A e P ficam somente leitura), Tipo de dado (somente leitura nos existentes), Escopo (select tipo/instância; parâmetro com fórmula só 'tipo'), Padrão (controle conforme o tipo: número, select de opções, check, texto; use `lerEntrada`), Mín, Máx, Passo (números, só para comprimento/número/inteiro), Opções (para enum e chapa: botão "Opções…" abre uma lista editável de `valor`, `rótulo` e, em chapa, `esp` em mm, com adicionar e remover; não deixe remover a opção que é o padrão), Fórmula (campo mono com o texto, borda vermelha e mensagem quando não compila — use `compilar`; vazio remove a fórmula e volta o parâmetro a ser livre; com fórmula o campo Padrão fica somente leitura mostrando o valor resolvido de `resolucaoCorrente().env`).
   - "Usos": coluna com a contagem de `usosDoNome(familia, id)`; passar o mouse mostra os lugares em `title`.
   - Botões: "Novo parâmetro…" (pequeno formulário: id, nome, tipo, escopo; cria com `adicionarParametro` e `padrao` coerente: 0, '', false ou a primeira opção) e "Excluir" por linha (chama `excluirParametro`; a recusa por uso aparece como mensagem no próprio diálogo, em vermelho, sem sumir sozinha até a próxima ação).
   - Cada alteração é UM passo de desfazer, com rótulo ("Renomear parâmetro", "Editar parâmetro L", …).
2. **Tabela de Tipos editável** (diálogo `tipos`): linhas = tipos, colunas = parâmetros SEM fórmula. Cada célula edita `definirValorDeTipo` (célula mostra o valor do tipo ou, esmaecido, o padrão do parâmetro quando o tipo não define; botão "×" na célula remove a definição). Primeira coluna: nome do tipo editável (mexa em `tipo.nome` por `executar`), clique na linha torna o tipo corrente (`escolherTipo`; destaque da linha corrente) e botões "Novo tipo", "Duplicar", "Excluir" (com `adicionarTipo`, `duplicarTipo`, `excluirTipo`). Marque o `tipoPadrao` com uma estrela e permita trocá-lo (por `executar`).
3. Mensagens de recusa em uma faixa vermelha no topo do diálogo (`role="alert"`), limpa na próxima edição bem-sucedida.
4. Rolagem horizontal e vertical dentro do diálogo; cabeçalhos fixos; larguras mínimas razoáveis (Id 90 px, números 70 px).
5. Estilos em NOVO arquivo `familiaDialogos.css` importado pelos componentes novos. Divida em componentes novos (`FamiliaParametros.tsx`, `FamiliaTipos.tsx`, `FamiliaOpcoes.tsx`…); nenhum arquivo passa de 420 linhas. `FamiliaDialogos.tsx` só orquestra e continua com a Lista de peças e o "Novo" como estão.
6. Medidas formatadas precisam de `// units-ok: <motivo>` (portão `node scripts/check-units.mjs`).

## Arquivos permitidos
`apps/web/src/ui/familia/FamiliaDialogos.tsx` e novos `apps/web/src/ui/familia/FamiliaParametros*.tsx`, `FamiliaTipos*.tsx`, `FamiliaOpcoes*.tsx`, `familiaDialogos*.css` e `familiaDialogos*.ts` (e testes novos `familiaDialogos*.test.ts` se você extrair lógica pura).

## Proibido
Os demais arquivos de `apps/web/src/ui/familia/` (outra ficha trabalha neles em paralelo: `FamilyEditor.tsx`, `FamiliaPaineis.tsx`, `Familia3D.tsx`, `FamiliaFaixa.tsx`, `familia.css`), `packages/**`, `crates/**`, `docs/**`.

## Aceite (o orquestrador roda)
`tsc`, `eslint --max-warnings 0` nos arquivos, `npx vitest run apps/web`, `node scripts/check-units.mjs`, `check-boundaries`; depois o orquestrador abre o editor e confere: editar o padrão de L e ver as vistas mudarem; renomear `esp` e ver as fórmulas das peças reescritas; excluir parâmetro em uso é recusado com os lugares; criar parâmetro e tipo; Ctrl+Z desfaz cada passo.

## Critério de parada
Se uma operação de `@hestia/model` não bastar para o que a ficha pede, PARE e relate qual; não altere `packages/`.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
