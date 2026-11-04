# Ficha PAINEL-encaixe — diálogo de Conectores e Escolhas no editor de famílias

Base: `feat/familias-interface` (com ESC-modelo integrado).   Nível 2

## Contexto
O modelo já tem `Familia.conectores` e `Familia.escolhas`, a validação (`validarEncaixe.ts`) e as operações de edição puras (`edicaoEncaixe.ts`: `adicionarConector`, `editarConector`, `excluirConector`, `adicionarEscolha`, `editarEscolha`, `excluirEscolha`; retornam `null` em sucesso ou o motivo da recusa). Falta a interface para o autor da família editar isso. Siga o padrão dos diálogos vizinhos: leia `ui/familia/FamiliaDialogos.tsx` (roteador), `FamiliaTipos.tsx` e `FamiliaParametros.tsx` (diálogos editáveis), `FamiliaJanela.tsx` (janela), `familiaStore.ts` (campo `dialogo`), `FamiliaFaixa.tsx` (botões da faixa), `familiaPecaAviso.ts` (`executarPeca`, aviso), `acoes.ts`, e o tipo `Conector`/`Escolha` em `packages/model/src/familia/tipos.ts`.

## Faça
1. Novo diálogo `DialogoEncaixe` (arquivo `FamiliaEncaixe.tsx`, mais `FamiliaEncaixeConectores.tsx` e `FamiliaEncaixeEscolhas.tsx` se passar de 300 linhas) com duas abas:
   - **Conectores**: tabela com id, nome, lado (select: esquerda, direita, frente, fundo, base, topo), etiqueta (texto), aceita (texto separado por vírgula), folga (fórmula em mm); adicionar, editar na célula (confirma com Enter ou ao sair), excluir; erros da operação aparecem junto à linha com o motivo devolvido (a edição recusada não altera nada).
   - **Escolhas**: tabela com id, nome, parâmetro (select só com os parâmetros `enum`, `booleano` e `inteiro` da família), zona (select com os `grupo` das peças existentes, sem repetição); adicionar, editar, excluir; as opções da escolha são só leitura (vêm do parâmetro; mostre a lista de opções do parâmetro ao lado).
   Tudo pelas operações de `edicaoEncaixe.ts` via `executarPeca`/histórico (um passo de desfazer por edição). Textos em português.
2. Ligar: `dialogo` ganha o valor `'encaixe'` no `familiaStore.ts`; o roteador `FamiliaDialogos.tsx` o monta; a faixa ganha o botão "Encaixe" (conectores e escolhas) perto de "Tipos"/"Parâmetros".
3. Testes de lógica (puros, em `familiaEncaixe.test.ts` NOVO): funções auxiliares que você extrair para `familiaEncaixe.ts` (ex.: `opcoesDeParametro`, `zonasDaFamilia`, `converterAceita` texto↔lista, `parametrosParaEscolha`): cada uma com casos normais e de borda; e um teste que aplica as operações pelo `HistoricoFamilia` e confere desfazer/refazer.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web/src/ui/familia` sem regressão. Nada acima de 420 linhas; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/familia/{FamiliaEncaixe*.tsx, familiaEncaixe*.ts, FamiliaDialogos.tsx, FamiliaFaixa.tsx, familiaStore.ts, familiaDialogos.css}`, CSS novo `familiaEncaixe.css`, testes novos ao lado.

## Proibido
`packages/**`, `crates/**`, `docs/**`, qualquer outro arquivo de `ui/familia`, testes existentes, snapshots.

## Critério de parada
Operação de `edicaoEncaixe.ts` ausente ou com assinatura diferente: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
