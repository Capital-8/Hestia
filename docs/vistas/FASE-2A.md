# Fase 2a — Troca do armazenamento e migração 23 → 24

Leia antes: `docs/vistas/REGRAS-RAIAS.md` (preparação, regras, verificação, relatório — a "regra especial da Fase 1"
NÃO vale aqui) e `docs/vistas/PLANO-MESTRE.md` seções 2, 3, 4, 7 (Fase 2) e 10 inteira. Este arquivo prevalece
onde houver diferença.

## Ideia
A Fase 1 fez todo o código LER as vistas por uma API (`packages/model/src/planView.ts`), que hoje é uma projeção
sobre `Level` + `Project.areaPlans`. Agora o armazenamento vira `Project.planViews: PlanView[]` e a projeção vira
leitura direta. Para o resto do repositório continuar compilando com o mínimo de mudança, as **fachadas se
invertem**: os nomes antigos continuam existindo, mas passam a ler e escrever em `planViews`.

Esta fase é feita em **duas etapas por agentes diferentes, em sequência**. Você faz só a etapa que a sua instrução
indicar.

## Etapa 2a-1 — modelo, migração e fachadas (o esquema muda; o programa continua igual)

Escopo: `packages/model/src/**` inteiro (inclusive `types.ts`, `migrate.ts`, `planView.ts`), mais os pontos FORA
do modelo marcados com o comentário `// armazenamento (Fase 2)` e os que o compilador apontar como quebrados pela
mudança de tipo — nesses, faça a correção MÍNIMA para compilar e manter o comportamento, e liste cada um no
relatório. `tests/vistas-ouro/adaptador.ts` pode ser ajustado só se uma assinatura que ele usa mudar.

### Ordem obrigatória: testes da migração primeiro (falhando), código depois.

### O que muda
1. `types.ts`: `Level` fica com `id`, `name`, `elevation`, `roomSeparators`. `Project.planViews: PlanView[]`
   entra; `Project.areaPlans` sai. `SCHEMA_VERSION = 24`.
   (Antes: `git fetch origin main`; se `main` já tiver `SCHEMA_VERSION` maior que 23, PARE e relate.)
2. `planView.ts`: `planViewsOf(p)` devolve `p.planViews` (ordenação estável e índices memorizados por identidade
   do array podem ficar). `viewOwnAnnotationsOf` passa a ser igual a `viewAnnotationsOf` (mantenha o nome exportado,
   marcado `@deprecated`). A assinatura das funções aceita `Pick<Project, 'planViews'>` (mantenha compatível com os
   chamadores: se eles passam `Pick<Project,'levels'|'areaPlans'>`, ajuste o tipo do parâmetro para algo que os
   dois lados satisfaçam ou corrija os chamadores).
3. **Migração 23 → 24** em `migrate.ts` (extraia para arquivo próprio, ex. `migrateVistas.ts`, pelo limite de
   linhas):
   - Cada nível gera `pv_<levelId>` (`kind: 'floor'`, `name` = nome do nível) com `viewRange`, `graphics`,
     `hidden` e as cinco listas de anotação do nível.
   - Cada nível gera `pvr_<levelId>` (`kind: 'roof'`, `name` = nome do nível) com `viewRange =
     DEFAULT_VIEW_RANGE`, `graphics` = cópia dos do nível, `hidden = roofHidden`. Anotações: se o nível tem pelo
     menos um elemento de telhado (descubra no código como um telhado pertence a um nível), **cópia** das anotações
     do nível com id `<idOriginal>__pvr_<levelId>`; senão, vazias. Ids de anotação em `roofHidden.elements` são
     trocados pelo id da cópia (ou removidos se não há cópia).
   - Cada `AreaPlan` vira vista `kind: 'area'` com o **mesmo id**; `scale`, `graphics`, `tags`, `legend`, `table`,
     `schemeId` vão para `area`; `hidden` continua; `viewRange` e `graphics` são cópias dos do nível.
     - Com `annotations` definido: são as próprias (normalizadas).
     - Com `annotations === undefined` (herança): **cópia** das anotações do nível com id
       `<idOriginal>__<idDaVista>`, mas só das famílias que a planta desenha — leia a condição exata em
       `packages/render/src/plan/notes.ts` (`drawnAnnotations`) e no perfil (`areaLayersOf`): cotas por
       `showDimensions`; textos, detalhes e etiquetas por `showAnnotations`. Ids de anotação herdada presentes em
       `hidden.elements` da planta são trocados pelo id da cópia.
     - Etiquetas de elemento do nível (`ElementTag`): a planta de área hoje as desenha **além** das próprias
       (seção 10.4.1 do plano; `packages/render/src/plan/build.ts`, chamada de `elementTagOps`). Leia a condição
       exata e copie as etiquetas do nível para a vista de área (id `<idOriginal>__<idDaVista>`) exatamente nos
       casos em que hoje são desenhadas.
     - Planta de área cujo nível não existe: descartada (registre no relatório; a validação já a apontava).
   - Cópia de cota mantém `refs` (apontam para elementos, não para o nível); cópia de etiqueta mantém `hostId`.
   - `Level` perde os campos de vista. A ordem de `planViews`: por nível (na ordem de `levels`) piso e cobertura,
     depois as plantas de área na ordem original — igual à projeção atual.
   - Migrar é idempotente por construção (só roda de 23 para 24) e determinístico (sem `newId`).
4. **Criação e remoção de nível** (`level.ts`, comandos de nível em `commands.ts`): criar nível cria as duas
   vistas principais (`pv_`/`pvr_`); remover nível remove todas as vistas dele (e o que já era removido em cascata:
   viewports de prancha etc.). Duplicar/colar nível (`copyLinks`, "colar alinhado aos níveis") — verifique o que
   hoje copia de anotações/gráficos do nível e preserve.
5. **Fachadas invertidas** (para o resto do repositório não mudar agora):
   - `areaPlan.ts`: `areaPlansOf(p)`, `areaPlanOf(p, id)`, `areaPlansOfLevel` devolvem objetos `AreaPlan`
     **projetados** a partir das vistas `kind: 'area'` (estáveis por referência, memorizados pela `PlanView`).
     O `AreaPlan` projetado tem `annotations` sempre definido (não há mais herança). `planOwnsAnnotations` passa a
     ser sempre verdadeiro; mantenha exportado e `@deprecated`.
   - Comandos antigos continuam aceitos e passam a escrever em `planViews`: `addAreaPlan`, `updateAreaPlan`,
     `removeAreaPlan`, etiquetas de ambiente (`addRoomTag` etc.), `setLevelViewRange`, `setLevelGraphics`,
     `resetLevelGraphics`, `setViewHidden` com alvos `{plan, levelId}` / `{roof, levelId}` / `{area, planId}`, e
     os comandos de anotação na forma antiga (`levelId` sem `viewId` → vista de piso do nível; `levelId` +
     `planId` → vista de área) e na forma nova (`viewId`).
   - **Mudança de semântica inevitável e desejada:** `setLevelViewRange`/`setLevelGraphics` passam a alterar só a
     vista de **piso** do nível (antes o nível inteiro, o que afetava cobertura e área). Para o programa continuar
     se comportando igual nesta etapa, esses dois comandos antigos devem propagar a mesma alteração para as vistas
     `roof` e `area` do mesmo nível (é o que acontecia de fato). `updatePlanView { viewId, patch }` altera **só**
     a vista pedida. Documente isso no código; a Fase 3 decide quando parar de propagar.
   - `updatePlanView` em `roof` com `viewRange`: continua recusado nesta etapa.
   - `addPlanView`/`removePlanView`: passam a aceitar qualquer `kind` exceto remover a vista principal
     (`pv_`/`pvr_`) de um nível existente.
6. `commands.ts` (`splitWall`, `deleteElements` e qualquer outro que mexe em `level.tags`/cotas ao apagar ou
   dividir elemento): passa a percorrer as anotações de **todas** as vistas do nível (inclusive as cópias).
7. `validate.ts`: valida `planViews` (vista aponta para nível existente; todo nível tem exatamente uma `pv_` e
   uma `pvr_`; ids únicos; anotações com ids únicos no projeto; `area` presente se e só se `kind === 'area'`).
8. `packages/engine/src/assinaturasNivel.ts` (seção 10.3): `planViews` fica FORA do bloco `global`; confirme com
   teste que editar uma cota não muda `assinaturasDoProjeto(...).global` nem as chaves do 3D e do corte — e que o
   valor de `global` continua mudando com o que mudava geometria. Atualize a lista duplicada em
   `apps/web/src/ui/edicaoDeEsquadrias.ts`.
9. Pontos do render que escreviam no nível de um projeto derivado (seção 10.4.2): `plan/planContext.ts`
   (`semAnotacoesOcultas`) e `sheet/viewports.ts` (`withSheetScale`) passam a escrever na vista.
10. IFC e gravação de arquivo: `ifcHestia.ts`/`ifcImport/hestia.ts` gravam/leem também `planViews` (o IFC antigo
    sem `planViews` continua importando: passa pela mesma função de migração dos níveis antigos).
11. Onde alguém criava anotação herdada na abertura da planta de área (`apps/web/src/editor/areaPlanActions.ts`,
    `openAreaPlan` "semeia anotações se `annotations === undefined`"): com a migração isso deixa de ocorrer;
    mantenha a função sem efeito para esse caso e relate.

### Testes da migração (escreva primeiro)
1. Cada projeto de `tests/vistas-ouro/projetos/*.json` migra sem erro e passa em `validate`.
2. Contagem: para cada família, total antes = total nas vistas de piso; e o número de cópias (cobertura, área
   herdada, etiquetas do nível na área) confere com um cálculo independente feito no teste a partir do projeto v23.
3. Nenhum id de anotação duplicado no projeto.
4. Todo `refs`/`hostId` de anotação migrada aponta para elemento existente (quando apontava antes).
5. Toda vista aponta para nível existente; todo nível tem exatamente uma `pv_` e uma `pvr_`.
6. Todo `hidden.elements` de vista que referenciava anotação herdada referencia agora a cópia.
7. Migrar, serializar, reabrir e serializar de novo dá texto idêntico.
8. O arquivo de esquema antigo (projeto 08 do ouro) percorre a cadeia até 24.
9. Para cada projeto do ouro, as leituras da API (`planViewRangeOf`, `viewGraphicsOf`, `planViewHiddenOf`,
   `viewAnnotationsOf` a menos da troca de id das cópias, `viewProfileOf`) sobre o projeto migrado são iguais às
   que a projeção da Fase 1 dava sobre o projeto v23. (Para comparar, guarde no teste uma cópia congelada da
   projeção antiga como função auxiliar de teste, ou gere os valores esperados antes de trocar o código.)

### O ouro nesta etapa
`npm run test:vistas-ouro` vai divergir **apenas** assim (seção 10.2.2 e 10.1.1 do plano):
- (D1) ids de anotação copiada mudam para `<id>__<idDaVista>` nas vistas de área (herdadas e etiquetas do nível)
  e de cobertura;
- (D2) na vista de área, anotação antes herdada passa a aparecer na saída `selecao` (agora é selecionável);
- (D3) vista de cobertura de nível sem telhado deixa de ter as anotações do piso.
Você tem de **provar** isso: escreva `tests/vistas-ouro/auditoria.ts` (ou um modo do comparador) que normaliza D1
(remove o sufixo `__<idDaVista>` dos ids nas saídas novas) e lista, arquivo por arquivo, as diferenças restantes
classificadas em D2, D3 ou **NÃO PREVISTA**. Só regrave o ouro (`--gravar`) quando NÃO PREVISTA for zero. Entregue
a tabela da auditoria no relatório. Qualquer NÃO PREVISTA que você não consiga eliminar: pare e relate.

### Verificação
Os cinco comandos de `REGRAS-RAIAS.md` (o ouro, depois da auditoria e da regravação), mais
`npx vitest run packages/model packages/engine packages/render packages/io`.

## Etapa 2a-2 — a vista ativa chega às ferramentas e ao editor
(Só depois de 2a-1 integrada.)

Com a cobertura e a área tendo anotações próprias, quem cria, seleciona e edita anotação precisa saber a vista
exata.

Escopo: `packages/tools/src/**`, `apps/web/src/editor/**`, `apps/web/src/ui/**` e os testes; em `packages/model`
só correção de defeito encontrado.

1. `ToolEnv` (`packages/tools/src/types.ts`) ganha `viewId?: Id` (id da vista de planta ativa). `viewIdOfEnv`
   (`vistaDoAmbiente.ts`) usa `env.viewId` quando presente; senão o comportamento atual. O editor preenche
   `env.viewId` com `planViewIdAtivo` sempre que a vista ativa é planta.
2. A função local `viewAnnotationsOf(p, levelId, areaPlanId)` de `packages/tools/src/annotationPick.ts` e seus
   chamadores (`selectTool.ts`, `dimensionTool.ts`, `apps/web/src/editor/dimDoubleClick.ts`,
   `apps/web/src/ui/dims/dimEditModel.ts`) passam a resolver pela vista (`viewIdOfEnv(env)` ou `viewId` recebido).
   Renomeie a função local para `anotacoesSelecionaveis` (ou parecido) para acabar com a colisão de nome.
3. `controller.ts` `exec1`: injeta `viewId` no comando de anotação para **qualquer** vista de planta ativa (piso,
   cobertura, área), quando o comando não traz `viewId`/`planId`/`sectionId` e o `levelId` do comando é o nível da
   vista ativa. Assim anotação criada na cobertura fica na cobertura.
4. Exclusão, mover, copiar/colar de anotações (`deleteIds.ts`, `pastePreview.ts`, comandos de mover de
   `annotations.ts`) operam na vista ativa.
5. `tagActions.ts` e etiquetas automáticas: gravam e leem na vista ativa.
6. Testes: criar cota, texto, linha de detalhe e etiqueta na cobertura → ficam em `pvr_<nível>` e não aparecem
   no piso; selecionar e excluir na cobertura não afeta o piso; o mesmo para duas plantas de área do mesmo nível.
7. Ouro: nenhuma diferença esperada nesta etapa (os projetos do ouro não mudam). Se divergir, é defeito.
