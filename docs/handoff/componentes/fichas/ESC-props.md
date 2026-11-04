# Ficha ESC-props — escolhas internas do módulo no painel de Propriedades

Base: `feat/familias-interface` (com ESC-modelo, PAINEL-encaixe e CONJ-ui integrados).   Nível 2

## Contexto
Uma família pode declarar `escolhas` (`Escolha`: `id`, `nome`, `parametro`, `zona`; veja `packages/model/src/familia/tipos.ts`): o usuário escolhe, por exemplo, porta lisa, vidro ou nicho. Cada escolha aponta para um parâmetro `enum`, `booleano` ou `inteiro` da família, e as opções vêm do próprio parâmetro (`opcoes` no enum; `min`/`max`/`passo` no inteiro; verdadeiro/falso no booleano). Falta oferecer essas escolhas no painel do móvel colocado. Leia: `apps/web/src/ui/ComponentProperties.tsx` (e `componentProp*` e `ComponentProperties*.ts` vizinhos: como os parâmetros de instância são editados e gravados em `values` via `updateComponent`), `packages/model/src/familia/tipos.ts`, `packages/engine/src/componentes/instancia.ts` (`resolverComponente`), e `ui/familia/familiaEncaixe.ts` (funções auxiliares já existentes, p. ex. `opcoesDeParametro`; reaproveite).

## Faça
1. Seção "Escolhas" em `ComponentProperties.tsx` (a lógica em arquivo novo `componentPropEscolhas.ts`, o componente visual em `ComponentPropEscolhas.tsx`): para UM componente selecionado cuja família tem `escolhas`, uma linha por escolha com o `nome` e um controle: `select` com as opções do enum (rótulo da opção), caixa de seleção para booleano, `select` numérico de `min` a `max` (passo) para inteiro. O valor mostrado é o EFETIVO (da resolução: `resolverComponente(p, c).env[parametro]`, em mm/unidade do parâmetro). Escolher grava `values[parametro]` via `updateComponent` (um passo de desfazer); o botão "↺" remove o valor da instância (volta ao tipo). Com vários componentes selecionados, só aparece a seção quando TODOS são da mesma família; valores diferentes mostram "Vários" e escolher aplica a todos numa transação. A zona aparece como dica (`title`).
2. Escolha cujo parâmetro não existe na família (dados inconsistentes) é omitida sem lançar erro.
3. Testes puros (`componentPropEscolhas.test.ts`): extraia para `componentPropEscolhas.ts` funções `escolhasDoComponente(familia)`, `opcoesDaEscolha(familia, escolha)`, `valorEfetivo(...)`, `patchDaEscolha(...)`: casos para enum, booleano, inteiro, parâmetro inexistente, vários componentes (iguais e diferentes), família sem `escolhas`; e um teste que aplica o `patch` por `updateComponent` e confere o valor no projeto e o desfazer.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/ComponentProperties.tsx` (mudança mínima para montar a seção), `apps/web/src/ui/componentPropEscolhas.ts`, `apps/web/src/ui/ComponentPropEscolhas.tsx`, `apps/web/src/ui/componentPropEscolhas.test.ts` (NOVOS), CSS novo se precisar.

## Proibido
`packages/**`, `crates/**`, `docs/**`, `ui/familia/**` (só leitura), testes existentes, snapshots.

## Critério de parada
Se `ComponentProperties.tsx` mudou de estrutura de um jeito que impeça a inclusão mínima: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
