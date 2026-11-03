# Ficha E8-io — componentes no DXF da planta e no IFC

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O móvel colocado (`Component`) precisa sair nas exportações do projeto. Os objetos importados (`Generic`) já saem: DXF por `packages/io/src/dxfGeneric.ts` (`dxfGenericEntities`, chamado em `apps/web/src/editor/dxfExport.ts` por volta da linha 409) e IFC por `packages/io/src/ifc/ifcGeneric.ts` (`addGenerics`, chamado em `ifc/ifcExport.ts` linha ~484). Faça o MESMO para componentes. O motor entrega `resolverComponente`, `malhaDoComponente`, `pegadaDoComponente` e `caixaDoComponente` (`@hestia/engine`, `packages/engine/src/componentes/instancia.ts`); `packages/io` já importa `@hestia/engine` (veja `dxfPecas.ts`). O prefixo de GlobalId `component` já está reservado em `ifc/ifcHestia.ts`.

## Faça
1. **DXF da planta** (arquivo novo `packages/io/src/dxfComponentes.ts`): `dxfComponentEntities(p, levelId, layer = DXF_LAYER_COMPONENTE)` com `DXF_LAYER_COMPONENTE = 'COMPONENTES'` (cor ACI 3, verde): uma polilinha fechada por anel da pegada (`pegadaDoComponente`) de cada componente do nível, em ordem determinística de `id` (mesmo formato de retorno de `dxfGenericEntities`, `DxfPolylineEntity[]`; furos também saem como polilinha fechada). Componente sem pegada não gera nada. Exporte em `packages/io/src/index.ts`. Teste `dxfComponentes.test.ts` (novo, no estilo de `dxfGeneric.test.ts`): um componente gera ao menos 1 polilinha fechada na camada; nível diferente não gera; espelhado/girado muda os pontos; ordem por id.
2. **IFC** (arquivo novo `packages/io/src/ifc/ifcComponentes.ts`, `addComponents(c: IfcCtx)` chamada em `ifcExport.ts` logo após `addGenerics(c)`, uma linha + import): cada componente vira `IFCFURNITURE` (IFC4) contido no pavimento do nível (`storeyOf`), com `GlobalId` `gid('component:' + id)`, `Name` = nome da família + marca (`mark`, se houver), `ObjectType` = id da família, `PredefinedType` omitido (`OMIT`) e corpo `IFCTRIANGULATEDFACESET` com a malha de `malhaDoComponente(c.p, comp)` (sólidas; o mundo em metros, cota local do nível: copie o mecanismo de `faceSetOf` de `ifcGeneric.ts`; se precisar, EXPORTE as funções auxiliares de `ifcGeneric.ts` em vez de duplicar). Property set `Pset_Hestia_Componente` com `Familia` (id), `Tipo` (typeId ou 'padrao'), `Marca`, `Largura`/`Altura`/`Profundidade` (mm, da `caixaDoComponente`) e `Pecas` (quantidade de peças não vazias). Componente sem malha: produto sem forma. Teste `ifcComponentes.test.ts` (novo, estilo de `ifcGeneric.test.ts`): o texto IFC contém `IFCFURNITURE`, o conjunto de propriedades e um `IFCTRIANGULATEDFACESET`; o export segue válido (sem componente a saída é IDÊNTICA à de antes: teste de igualdade com projeto sem componentes).
3. **Ligação do DXF** em `apps/web/src/editor/dxfExport.ts`: junto de `dxfGenericEntities`, acrescente as entidades de componentes (respeitando a mesma visibilidade `generic`) e registre a camada `COMPONENTES` como o código faz para `IMPORTADO` (olhe as linhas ~405-415 e ~439). Teste existente/novo mínimo que prove a camada no arquivo.
4. `npx vitest run packages/io apps/web/src/editor` verde SEM regressão (não atualize snapshots); `tsc`; `eslint --max-warnings 0` nos arquivos tocados; `check-boundaries`; `check-units`. Nada acima de 420 linhas; textos em português.

## Arquivos permitidos
`packages/io/src/{dxfComponentes.ts,dxfComponentes.test.ts,index.ts}`, `packages/io/src/ifc/{ifcComponentes.ts,ifcComponentes.test.ts,ifcGeneric.ts (só exportar auxiliares),ifcExport.ts (import + uma chamada)}`, `apps/web/src/editor/dxfExport.ts` e um teste novo ao lado dele.

## Proibido
`packages/engine/**`, `packages/model/**`, `packages/render/**`, `packages/tools/**`, `crates/**`, `docs/**`, qualquer snapshot, testes existentes.

## Aceite (o orquestrador roda)
Testes novos verdes, `npx vitest run packages/io` sem regressão, tsc, eslint, boundaries, units. Depois valido o IFC/DXF gerados de um projeto com um armário.

## Critério de parada
Se a exportação sem componentes mudar um byte, PARE. Teste contraditório: PARE.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
