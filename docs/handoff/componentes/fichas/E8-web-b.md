# Ficha E8-web-b — painel de Propriedades do componente (instância)

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O componente colocado no projeto (`Component`, `packages/model/src/types.ts`) já se seleciona e se move (E8-tools). Falta o painel de Propriedades editá-lo, como o Revit: tipo, parâmetros de INSTÂNCIA (largura, altura etc.), posição, rotação, espelhar e marca. Leia: `ui/Properties.tsx` (como cada tipo de elemento entra: `els.filter(isGeneric)`, `selectionLabel`, o corpo por tipo), `ui/GridProperties.tsx` e `ui/RampProperties.tsx` (painéis próprios, modelo), `packages/model/src/componentCommands.ts` (`updateComponent` com `patch`), `packages/model/src/familia/tipos.ts` (parâmetros: tipo/instância, unidade, padrão), `packages/engine/src/componentes/instancia.ts` (`resolverComponente`, `caixaDoComponente`), `ui/familia/FamiliaParametros*.tsx` (como o editor mostra e valida valores de parâmetros), `NumField` (campos numéricos com a unidade do projeto).

## Faça
1. Novo `ui/ComponentProperties.tsx` (+ CSS próprio se preciso): para UM ou VÁRIOS componentes selecionados mostra:
   - Família (nome, só leitura) e `select` Tipo (tipos da família + "Padrão da família" = `null`), via `updateComponent` `{ typeId }`.
   - Parâmetros de INSTÂNCIA da família (número em mm com `NumField`/unidade do projeto, texto, caixa de seleção para booleano). Mostra o valor efetivo (da resolução) e, ao editar, grava em `values` (mm) via `updateComponent`; botão "↺" por parâmetro remove o valor da instância (volta ao tipo). Valor recusado pela resolução (veja `erros` de `resolverComponente`) mostra aviso e NÃO grava.
   - Posição X, Y, elevação Z (m, campo de comprimento), Rotação (graus ↔ radianos), caixa "Espelhado" e Marca (texto).
   - Dimensões resultantes (caixa em mm, só leitura) e quantidade de peças.
   - Avisos de erros da resolução (`res.erros`), se houver.
   Várias seleções: campos com valores diferentes aparecem como "Vários"; editar aplica a todos em UMA transação.
2. Ligar em `Properties.tsx` com mudanças MÍNIMAS: `els.filter(isComponent)` entra na contagem (`count`/`kinds`), em `selectionLabel` ("Componente"/"Componentes") e renderiza `<ComponentProperties ids=… />` como os demais tipos. Se `Properties.tsx` estourar 420 linhas, mova o necessário para arquivo novo sem mudar comportamento.
3. Testes novos (`ComponentProperties.test.ts[x]`, no estilo de `StairProperties.test.ts`): troca de tipo grava `typeId`; editar parâmetro de instância grava `values` em mm; ↺ remove; valor recusado não grava; posição/rotação/espelho; seleção múltipla.
4. `npx vitest run apps/web` sem regressão; `tsc`; `eslint --max-warnings 0` nos arquivos tocados; `check-boundaries`; `check-units`. Nada acima de 420 linhas; textos em português.

## Arquivos permitidos
`apps/web/src/ui/ComponentProperties.tsx` (NOVO), `apps/web/src/ui/componentProp*.{ts,tsx,css}` (NOVOS), `apps/web/src/ui/ComponentProperties*.{ts,tsx,css}` (NOVOS) e `apps/web/src/ui/Properties.tsx` (mudanças mínimas).

## Proibido
`packages/**`, `crates/**`, `docs/**`, `OptionsBar.tsx`, `ribbon/**`, `ui/familia/**`, qualquer snapshot.

## Aceite (o orquestrador roda)
Testes novos verdes, `npx vitest run apps/web` sem regressão, tsc, eslint, boundaries, units; depois confiro no navegador editando um componente colocado.

## Critério de parada
Se precisar mudar `packages/**`, PARE e relate. Teste contraditório: PARE.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
