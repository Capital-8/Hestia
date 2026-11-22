# Decisão 0060 — Plantas por disciplina (várias plantas de piso por nível, uma por disciplina)

Data: 2026-11-20. Estado: **decidida; execução não iniciada** (fichas na §12). Frente `disc`, worktree `~/hestia-wt/disc`.
Fontes: `docs/disciplinas/01-mapa-level-graphics.md` (92 pontos que leem ou gravam `Level.graphics`), `02-mapa-nivel-ativo.md` (estado de UI e consumidores), `03-mapa-contratos-de-teste.md` (rede de testes). Linhas citadas conferidas no código do worktree.
Precedentes: `AreaPlan` (planta de área, `packages/model/src/areaPlan.ts`) e `SectionView.annotations` (corte). Esta decisão reaproveita o molde deles em vez de inventar outro.
Numeração: 0058 e 0059 já existem (terreno); esta usa 0060. Elementos MEP **não** fazem parte desta decisão (outro ADR, §10).

## 0. Problema e objetivo

Hoje há **uma** planta de piso por nível. Os gráficos dela (escala, detalhe, estilo, substituições por categoria, estrutura parcial, linhas finas) moram em `Level.graphics` (`types.ts:223`), a ocultação em `Level.hidden` (`types.ts:225`) e as anotações em `Level.dimensions/texts/...`. Quase tudo que desenha, captura, seleciona, cota, exporta ou põe em prancha chega a esses campos pelo `levelId`.

Queremos, como no Revit, **várias plantas por nível, uma por disciplina** (Arquitetura, Estrutura, Hidrossanitário, Elétrico, HVAC), cada uma com seus gráficos, sua ocultação, suas anotações e sua mistura de disciplinas (a estrutura em meio-tom na planta hidráulica, por exemplo). Restrições duras, nesta ordem:

1. Arquivo antigo abre e **desenha igual**; nada é reescrito de forma destrutiva.
2. Estilos visuais, cotas, criação de elementos, snaps, seleção e pranchas existentes **não mudam de comportamento**.
3. Depois virão os elementos MEP; o modelo de plantas tem de recebê-los sem refazer nada.

## 1. Modelo

### 1.1 `PlanView` e a planta padrão

Nova coleção opcional `Project.planViews?: PlanView[]` (ausente = nenhuma planta adicional). Tipo, em `packages/model/src/planView.ts` (módulo novo, no molde de `areaPlan.ts`):

```ts
type Discipline = 'arquitetura' | 'estrutura' | 'hidrossanitario' | 'eletrico' | 'hvac';
type Tone = 'hidden' | 'halftone' | 'normal';

interface PlanView {
  id: Id;                     // id novo (newId), único no projeto como os demais
  levelId: Id;                // nível dono (a planta é de piso: perfil de piso, mesma altura de corte)
  discipline: Discipline;
  name: string;
  graphics?: ViewGraphics;    // mesmo tipo de Level.graphics; ausente = padrão, como no nível
  hidden?: ViewHidden;        // Hide in View desta planta
  tones?: Partial<Record<Discipline, Tone>>;   // desvios do predefinido da disciplina
  annotations?: PlanViewAnnotations;           // sempre da planta (ver §5)
}
```

**Decisão: a planta "Arquitetura" de cada nível é a planta padrão e continua lendo `Level.graphics` e `Level.hidden`; `planViews` guarda só as plantas ADICIONAIS.** Justificativa:

- **Zero migração destrutiva.** Todo o código e todo arquivo existente já tratam `Level.graphics` como "a planta". Mover isso para `planViews` obrigaria reescrever 48 pontos de leitura e 15 de gravação (mapa 01) no mesmo passo e criaria um arquivo que o programa antigo lê sem gráficos nenhuns.
- **Arquivo novo sem plantas adicionais é idêntico ao antigo** (a menos do número de esquema, §8). Quem nunca usa disciplina nunca vê o recurso.
- **Menor superfície de erro.** A planta padrão passa a ser *definida* como "a planta cujos dados estão no nível"; não há duas fontes de verdade nem sincronização entre elas.
- O molde já existe: `AreaPlan` também é uma lista de vistas adicionais do mesmo nível, ao lado do dado do nível.

A planta padrão **não é "Arquitetura" por acaso**: é a disciplina cujo predefinido reproduz exatamente o que a planta de hoje mostra (§4.2). Plantas adicionais podem ser de qualquer disciplina, **inclusive várias da mesma** (ex.: "Estrutura — fôrmas" e "Estrutura — armação", ou uma segunda "Arquitetura — layout"). A disciplina é uma propriedade da planta, não uma chave única.

Planta de cobertura continua como hoje (uma por nível, `Level.roofHidden`) e planta de área continua como `AreaPlan`. Planta de disciplina é sempre de **piso**: mesmo perfil (`FLOOR_PLAN_PROFILE`), terreno, lote, ambientes, telhados acima e pavimento de referência que a planta de piso padrão. Por isso ela **não** é um novo `PlanKind` (§3.1).

### 1.2 Disciplina: tipo fechado e derivação

`Discipline` é uma união fechada (lista em código, `DISCIPLINES`), não texto livre: cada valor tem predefinido, rótulo traduzido nos sete idiomas e tabela de derivação, e uma lista aberta quebraria os três.

**A disciplina de um elemento é derivada, nunca gravada nele.** Derivação em `packages/model/src/discipline.ts`:

```ts
const DISCIPLINE_OF_KIND: Record<Element['kind'], Discipline | 'geral'> = { ... }  // exaustivo: tsc acusa kind novo
export function disciplineOfElement(e: Element): Discipline | 'geral'
```

- `arquitetura`: wall, door, window, floor, ceiling, roof, stair, ramp, railing, mass, room, furniture, component.
- `estrutura`: column, beam, footing, slab.
- `geral` (não depende de disciplina, nunca é meio-tom nem oculto por disciplina; só as regras de categoria e Hide in View valem): terrain, terrainRegion, lot, cad, generic, anotações.
- `hidrossanitario`, `eletrico`, `hvac`: vazios hoje; os kinds MEP entram na tabela no ADR de MEP e o `Record<Element['kind'], ...>` obriga a classificá-los.

**Desvio consciente do pedido "derivar por categoria":** a derivação é por **kind do elemento**, não por `GraphicsCategory`. A categoria gráfica é lossy para isto: `categoriaDoElemento` (hoje em `viewVisibility.ts`) manda `column` para `wall` e `beam`/`footing`/`slab` para `slab`, e arquivos antigos têm substituições gravadas nessas categorias (um "ocultar wall" hoje esconde pilares). **Não criamos `GraphicsCategory` de estrutura** agora: isso mudaria o que arquivo antigo mostra. As categorias de MEP (`pipe`, `duct`, `cableTray`, `equipment`...) nascem no ADR de MEP junto com os kinds. Disciplina e categoria são eixos ortogonais, como no Revit (disciplina da vista x estilo de objeto).

A função `categoriaDoElemento` (duplicada hoje na web) **sobe para o modelo** (`categoryOfElement`) junto com `disciplineOfElement`, para haver uma tabela só.

## 2. Resolução única

Ponto único de leitura, em `packages/model/src/graphics.ts` (e `planView.ts`):

```ts
planOf(p, levelId, planId?): ResolvedPlan        // { levelId, planId?, discipline, name, isDefault, graphics, hidden, tones }
planGraphicsOf(p, levelId, planId?): ViewGraphics   // padrões aplicados (mergeOverrides) sobre o registro certo
planHiddenOf(p, levelId, planId?): ViewHidden
planTonesOf(p, levelId, planId?): Record<Discipline, Tone>   // predefinido da disciplina + desvios
```

Regras do resolvedor:

- `planId` ausente = planta padrão do nível (lê `Level.graphics`, `Level.hidden`). `planId` presente e existente **no mesmo nível** = a `PlanView`. `planId` desconhecido ou de outro nível **cai na planta padrão** (nunca lança), no mesmo espírito de `levelGraphicsOf` com nível inexistente; a validação (§8) sinaliza o id pendente.
- `levelGraphicsOf(p, levelId)` **vira wrapper transitório**: `planGraphicsOf(p, levelId)`. Os 48 chamadores migram por etapa (2.3) e o wrapper some quando o último sair; um teste de guarda de texto fixa a lista de arquivos que ainda podem citar `.graphics` de nível (§9).
- Gravação: `setPlanGraphics`, `resetPlanGraphics` e `setViewHidden` ganham `planId` opcional. Sem `planId` = nível, **exatamente os comandos de hoje** (os tipos `setLevelGraphics` e `resetLevelGraphics` continuam existindo e válidos: contrato de histórico e de colaboração, `commands.ts:257-258`, `:803-807`). `ViewHiddenTarget` ganha `{ kind: 'planView'; planId }` e `viewHiddenOf`/`permanentHiddenOf` o tratam.

**Contrato das ferramentas, snaps e cotas: `(levelId, filtros, estilo)`.** Elas continuam recebendo `levelId`; o que muda é só o que vem por trás dos filtros e do estilo:

- **levelId**: onde o elemento mora e onde a geometria é buscada (`pick.ts`, `infer.ts`, `apoioDeSnap.ts` não mudam: o elemento pertence ao nível, não à planta).
- **filtros**: `hiddenInView()` (já existe) e `halftoneInView()` (novo, §4), ambos calculados para a planta ativa.
- **estilo**: `planGraphicsOf`, via `planStyleOf(p, levelId, zoom, scale, planId?)`.
- **anotações**: `planId` opcional pelo caminho que já existe (`viewPlanId(env)`, §5).

Quem mais muda de assinatura (todos com `planId?` como último parâmetro, ausente = comportamento de hoje): `planStyleOf` (`render/plan/style.ts:82`), `planViewOf` (`render/plan/view.ts:173`; **a chave do cache passa a incluir `planId`**, risco alto do mapa 01), `projetoDoPainel` (`paneStyle.ts:50`; a cópia do projeto troca `levels[].graphics` **ou** `planViews[].graphics`, conforme a planta), `withSheetScale` (`render/sheet/viewports.ts:16-26`, mesma regra), `viewScale` (`controller.ts:316-327`), `thinLinesOn`/`editThinLines` (`graphicsActions.ts`), `dxfGeometryOf`/`planDxf` (`dxfExport.ts`).

## 3. Estado de UI

### 3.1 A vista ativa carrega `planViewId`, não um novo `PlanKind`

Espelhando `areaPlanId`: `UiState` ganha `planViewId: Id | null` (default `null` = planta padrão); `OpenView` plan ganha `planViewId?: Id`; `ActiveViewFields`, `PaneViewFields`, `ViewKeyFields`, `AbaDaSessao` e os painéis persistidos (`layoutTree.ts:301-304`) ganham o mesmo campo opcional.

**`PlanKind` fica `'floor' | 'roof' | 'area'`.** Planta de disciplina é `planKind: 'floor'` com `planViewId` definido. Alternativa descartada: `PlanKind = 'discipline'`. Motivo: toda verificação `planKind === 'floor'` do código (destaque no navegador, `if (!areaPlan)` em `build.ts:370-390`, telhados acima em `build.ts:302`) trata "floor" como "perfil de piso"; um kind novo seria tratado como não-piso **sem erro de compilação**, e a planta de disciplina perderia terreno, ambientes e telhados em silêncio. Com `floor + planViewId` os pontos que só precisam de "é piso" continuam certos sem tocar neles, e só os que precisam da planta consultam `planViewId`.

Invariantes (normalizados num ponto, `normalizaPlanViewId`): `planViewId` só vale com `planKind === 'floor'`; planta inexistente ou de outro nível vira `null`; trocar de nível sem trocar a planta zera `planViewId` (a planta pertence a um nível).

`selectLevel(id, kind, areaPlanId, planViewId)` (`controller.ts:1300`) ganha o 4º parâmetro; `viewTabActions.navega`/`activateView` o repassam. Ao trocar de **nível** pelo seletor de nível, a disciplina é mantida: abre a primeira planta daquele nível com a mesma disciplina da atual, se existir; senão a padrão. Ir por uma planta explícita (navegador, aba, prancha) nunca reaplica essa regra.

### 3.2 Uma chave de vista só (as quatro duplicadas viram uma)

Hoje há quatro formatos, recalculados em lugares diferentes: `viewKey` (`openViews.ts:45`), `viewKeyOf` (`viewKey.ts:13`, câmera 2D; usa `levelId` cru para o piso e `sec:`), `visibilityKeyOf` (`viewVisibility.ts:19`) e `activeDxfTargetKey` (`dxfExportDialogModel.ts:68`). Sem trabalho, duas plantas do mesmo nível colidem em `plan:<levelId>` (câmera, visibilidade temporária).

**Decisão:** novo módulo `apps/web/src/editor/viewIdentity.ts`, com **uma** função de chave canônica sobre os campos de vista (aceita `OpenView`, `ActiveViewFields`, `PaneViewFields`):

```
plan:<levelId>      planta de piso padrão
pv:<planViewId>     planta de disciplina
roof:<levelId>      cobertura
area:<areaPlanId>   planta de área
section:<viewId>    corte/elevação
sheet:<sheetId>     prancha
3d                  3D
face:<elementId>:<face>:<layer>
```

(O formato é o de `viewKey` de hoje mais `pv:`.) `viewKey`, `viewKeyOf`, `visibilityKeyOf` e a chave do DXF passam a ser **um** helper chamado pelos quatro; `visibilityKeyOf` devolve `null` para `sheet`/`face` como hoje. A chave da câmera passa de `<levelId>` e `sec:` para a canônica: a câmera vive só em memória (`Map` do controlador, sem `localStorage`), portanto não há migração; `viewKey.test.ts`, que fixa o formato antigo, é reescrito para o canônico. O mesmo módulo expõe `planRefOf(fields)` → `{ levelId, planId? } | null`, que é o que `planOf`, `planStyleOf`, `ToolEnv` e as anotações recebem; ninguém mais monta isso à mão.

### 3.3 Sessão e painéis

`AbaDaSessao` (`sessao.ts:19-37`) e os painéis (`layoutTree.ts:301-304`) gravam `planViewId` só quando definido; sessão antiga, sem o campo, abre a planta padrão. Na carga, id que não existe mais no projeto vira `null` (a aba abre a planta padrão do nível, sem erro). `panes.ts:47-49` (`followLevel`) acompanha só o nível: o painel que segue o nível ativo mostra a planta padrão e **não** herda `planViewId`. `load()` (`controller.ts:1347`) zera `planViewId`.

`ToolEnv` ganha `planViewId?(): Id | null` e `halftoneInView?(): ReadonlySet<Id>`; `viewPlanId(env)` (`base.ts:169`) passa a devolver `env.planViewId?.() ?? env.areaPlanId?.() ?? undefined`, e os usos diretos de `env.areaPlanId?.()` em `selectTool.ts:141-142` e `:190-191` passam por `viewPlanId`.

## 4. Visibilidade por disciplina

### 4.1 Três tons e regra única

Cada planta tem, por disciplina, um **tom**: `hidden` (oculto), `halftone` (meio-tom) ou `normal`. O tom da disciplina do elemento (`disciplineOfElement`) é combinado com o resto da visibilidade nesta ordem, **numa função só** (`visibilityOf`, `viewVisibility.ts:166`, que passa a devolver também `halftone: ReadonlySet<Id>`):

1. Oculto por Hide in View, por categoria (substituição `visible:false` do gráfico da planta), por temporário (Hide/Isolate) ou por **tom `hidden` da disciplina** → **oculto**.
2. Senão, tom `halftone` da disciplina → **meio-tom**.
3. Senão, normal. Elementos `geral` e anotações **nunca** recebem tom de disciplina.

**Regra de interação (decisão única, vale para todas as ferramentas):**

| Estado | Desenha | Captura (snap) | Seleciona (clique) | Seleciona (caixa) | Referência de cota |
|---|---|---|---|---|---|
| normal | sim | sim | sim | sim | sim |
| meio-tom | sim, atenuado | **sim** | **não** | **não** | sim (é só referência) |
| oculto | não | **não** | **não** | **não** | não |

Justificativa do meio-tom: ele existe para **coordenar** (alinhar o furo hidráulico à viga, cotar o eixo do pilar a partir da planta hidráulica); logo tem de dar snap e ser referência de cota, senão a coordenação seria visual e imprecisa. E **não** é selecionável porque a planta de uma disciplina não é o lugar de editar outra: seleção por clique ou por caixa pegando parede em meio-tom na planta de estrutura levaria a mover ou apagar, sem perceber, o que é de outra disciplina. Selecionar o elemento continua possível pelo 3D, pela árvore do navegador e pela planta da disciplina dele (a seleção não depende da planta ativa; só o clique 2D depende). Oculto segue exatamente a regra atual do código ("oculto não é selecionável nem dá snap", `viewVisibility.ts`, `selectHidden.test.ts`): o que muda é que passa a incluir o tom `hidden` da disciplina.

**Aplicada num ponto só:** `packages/tools/src/visibilidade.ts` (novo), com `podeCapturar(env, id)` e `podeSelecionar(env, id)`. `ToolBase.ctx` (`base.ts:107-111`, que hoje transforma `hiddenInView` em `isVisible`), `pick.ts`, `selectTool.ts` (clique e caixa) e as ferramentas que fazem hit-test próprio chamam só essas duas. Um teste de guarda de texto proíbe `hiddenInView?.()` fora desse módulo e de `base.ts`, e o teste comportamental da matriz (§9) é a prova real. A captura de **parede e abertura** hoje usa `isVisible` só em paredes (`infer.ts:322`); a etapa 3.2 estende a regra a todos os kinds que a captura indexa (lacuna 3 do mapa 03).

### 4.2 Predefinidos por disciplina

Tabela em código (`DISCIPLINE_TONE_PRESETS`); o dono pode desviar por planta (`PlanView.tones`), e o desvio vale sobre o predefinido (não substitui a tabela inteira).

| Planta de | arquitetura | estrutura | hidrossanitário | elétrico | HVAC |
|---|---|---|---|---|---|
| **Arquitetura** (inclui a padrão) | normal | normal | meio-tom | meio-tom | meio-tom |
| **Estrutura** | meio-tom | normal | oculto | oculto | oculto |
| **Hidrossanitário** | meio-tom | meio-tom | normal | oculto | oculto |
| **Elétrico** | meio-tom | meio-tom | oculto | normal | oculto |
| **HVAC** | meio-tom | meio-tom | oculto | oculto | normal |

A coluna "estrutura" na linha Arquitetura é **normal** de propósito: é o que a planta de hoje faz (pilar, viga, sapata e laje aparecem normais). Trocar isso seria mudança visual em arquivo antigo, proibida. As colunas de MEP na linha Arquitetura não têm efeito visível hoje (não há elemento MEP) e ficam em meio-tom por serem o mais útil quando existirem. **A planta padrão não grava tons** (`Level` não ganha campo): ela usa o predefinido de Arquitetura, o que reproduz o desenho atual. Um tom de planta padrão por nível fica fora (os desvios de tom existem só em `PlanView`).

### 4.3 Meio-tom no desenho

O render recebe `halftone` por `PlanInput` (`render/plan/build.ts:55`) e atenua os elementos dele: peso de projeção mínimo, cor misturada ao cinza da planta e sem hachura de corte (a regra exata sai da etapa 3.2, no mesmo código que desenha o fantasma de ocultos, `planOverlay.ts:413`). Ordem de desenho: meio-tom por baixo, normal por cima.

## 5. Anotações por planta (cotas, textos, etiquetas) e o gap de Mover/Copiar/Colar

**Planta de disciplina é sempre dona das suas anotações**, como corte e ao contrário do `annotations === undefined` ("herda do nível") da planta de área: cota de arquitetura não pode vazar para a planta de estrutura e vice-versa, e nenhuma herança implícita é necessária. `PlanView.annotations` usa o tipo de `AreaPlanAnnotations` (`areaPlan.ts:7-17`; ganha o alias `PlanViewAnnotations`), **ausente = vazio** (não "herda"). Isso elimina a inconsistência do mapa 02 §3.3 (`viewAnnotationsOf` lê vazio, `annotationsOfActiveView` cai no nível) para a planta nova: as duas passam a ler a mesma coisa. A criação pode, opcionalmente, **copiar** as anotações do nível (`annotationsFromLevel`, `areaPlanActions.ts:33-55`, ids novos) quando o usuário pedir "duplicar com anotações"; o padrão é planta vazia.

Roteamento: `AnnotationView.planId` (`annotations.ts:6-16`) já existe; `viewPlan` (`annotations.ts:160-165`) e `planScope` (`:143`) passam a resolver o id em `areaPlans` **ou** `planViews` (ids são únicos no projeto), validando `plan.levelId === levelId`. `controller.ts:307-309` (`areaPlanIdNow`) e `exec1` (`:354-366`) injetam o `planId` da planta de disciplina da mesma forma que injetam o da planta de área (rede de segurança do roteamento), e `PLAN_ANNOTATION_TYPES` (`:90-101`) não muda. Planta padrão **não passa `planId`** e cai no `levelScope`: comportamento idêntico ao de hoje.

**O gap de Mover/Copiar/Colar sem `planId`** (mapa 02, surpresa 2): `transformTools.ts:41` (`hasSelection`) e `:277` chamam `annotationIdsIn(p, levelId, sel)` e `annotationMoveCommands(p, levelId, sel, d, copy)` (`annotations.ts:391`, `:421`), que só leem `levelDimensions/levelTexts`. Anotação de planta de área (e de disciplina) fica **fora** do conjunto movível. Isso já é um bug latente para plantas de área; com disciplinas passaria a atingir toda cota feita fora da planta padrão. **Decisão:** as duas funções ganham `planId?` (usando `annotationIdsInView`, `annotations.ts:400`, que já o recebe, e o mesmo roteamento do `AnnotationView`), `transformTools` passa `viewPlanId(env)`, e colar (`controller.ts:1067`, `:1091-1093`, `:1130-1136`) respeita o escopo da planta ativa, com a regra: colar numa planta de **outro** `planId`/`levelId` cria cópias nessa planta (ids novos) e nunca duplica na de origem. O comportamento atual é primeiro **caracterizado** por teste (fase 1) e a correção entra na 2.3 com o teste invertido, para o bug de planta de área também ficar fechado. Cópia de nível (`pasteLevels`/`colarNiveis`) copia também as plantas adicionais do nível, com ids novos e anotações copiadas.

Separadores de ambiente (`Level.roomSeparators`) e posição do rótulo de ambiente (`setRoomLabel`) **continuam do nível** (são dado do modelo, não da planta), como já é com as plantas de área.

## 6. Pranchas

`SheetViewSource` `{ kind: 'plan'; levelId }` (`sheet.ts:58`) ganha `planId?: Id`. **Ausente = planta padrão do nível**, igual a hoje: prancha antiga abre idêntica, sem migração. Presente e válido = planta de disciplina; presente e inválido cai na padrão (e a validação aponta). Consequências:

- `render/sheet/build.ts:12-20` e `planPartsOf(p, levelId, vp)` (`viewports.ts:35`) repassam `planId` a `planOf`/`planStyleOf`/`planViewOf`; a chave do cache de partes (`partsCache.ts:40`) inclui `planId`.
- `withSheetScale` grava a escala da prancha em `levels[].graphics` **ou** `planViews[].graphics` da cópia do projeto (nunca no projeto real).
- Inserir vista na prancha lista as plantas de disciplina de cada nível (`sheetInsertSources.ts:31`, `sheetInsert.ts:181`, `useSheetPrefetch.ts:15`); `pranchaDaPlantaAtual` (`sheetActions.ts:346-351`) usa a planta ativa. Chaves de marcação continuam `plan:`/`pv:` da chave canônica.
- Remover uma `PlanView` descarta viewports órfãos pelo mesmo caminho de `removeAreaPlan` (`dropOrphanViewports`), tudo no mesmo passo de desfazer.

## 7. DXF

Alvos do lote ganham `pv:<planViewId>` (`dxfBatch.ts:30-33`, `dxfBatch.types.ts:15-18`, `dxfBatchRenderers.ts:11-13`); `planDxf(p, levelId, planId?)` (`dxfExport.ts:256`) usa os gráficos, a ocultação e os tons da planta; `dxfGeometryOf` (`:138-141`) passa `planId` a `planViewOf`/`planGraphicsOf`. Camadas DXF por disciplina (prefixo por disciplina) ficam para depois; nesta decisão as camadas são as de hoje, e elementos em meio-tom exportam na mesma camada com a mesma cor (o tom é visual de tela/prancha, não de CAD). `activeDxfTargetKey` usa a chave canônica (§3.2). Hoje o lote não lista cobertura (`dxfBatch.ts:30-33`); isso não muda aqui.

## 8. Persistência

### 8.1 Esquema 30 → 31

`SCHEMA_VERSION` sobe de 30 para **31** (`types.ts:47`), com `migrations[30] = (raw) => ({ ...raw })` em `migrate.ts` (identidade): **a migração só adiciona o que falta, e nada falta**, porque `planViews` é opcional e ausente significa "nenhuma planta adicional". O bump existe por segurança de arquivo, como nas versões 29 e 30 (terreno, móveis): **um programa antigo que abrisse um arquivo com `planViews` ignoraria a coleção e, ao salvar, a apagaria em silêncio** (e uma prancha com `planId` mostraria a planta errada). Com o bump, ele recusa o arquivo com a mensagem de versão, que é o comportamento certo. Custo aceito: arquivo salvo pela versão nova não abre em programa antigo mesmo sem plantas adicionais. (Se a 0.2.7 ou outra frente já tiver tomado o 31 na hora de integrar, esta passa ao próximo número livre; só o número muda.)

`esquema30.test.ts` (que hoje recusa o arquivo 31) é atualizado para 31/32; entra `esquema31.test.ts` (§9). Fecha-se também a lacuna do mapa 03 §5: um fixture real por versão relevante.

### 8.2 Validação (`validate.ts`)

`planViewProblems`: id único e disjunto de `areaPlans`; `levelId` existe; `discipline` ∈ `DISCIPLINES`; `graphics` passa em `graphicsIssues` (mesma checagem de `graphicsProblems`, `validate.ts:239-247`); `hidden` passa em `viewHiddenIssues`; `tones` só com disciplinas e tons válidos; anotações com os mesmos problemas das de planta de área; `Sheet` com `planId` inexistente ou de outro nível é aviso (a leitura cai na padrão). Remover um nível remove as `planViews` dele e os viewports órfãos (mesmo tratamento de `areaPlans`).

### 8.3 Colaboração (`collabHistory.ts`)

`'planViews'` entra em `COLLECTION_KEYS` (`collabHistory.ts:49`, junto de `levels`, `areaPlans`...). Sem isso, uma coleção nova **perde edição concorrente em silêncio** (risco alto do mapa 01). Os comandos novos (`addPlanView`, `updatePlanView`, `removePlanView`, `setPlanGraphics`, `resetPlanGraphics`) entram no contrato `commands.ts`, em `historyRotulos.ts` e no teste de colaboração que lista os tipos.

### 8.4 IFC

`ifcHestia.ts:163` exporta `LevelsJSON` com `JSON.stringify(p.levels)` (leva `Level.graphics` junto, então a planta padrão já viaja). Acrescenta-se uma propriedade própria **`PlanViewsJSON`** (lista de `PlanView`) no mesmo conjunto de propriedades Hestia; `ifcImport/hestia.ts:158,170-171,212` lê `PlanViewsJSON` quando existe e a ignora quando não existe (IFC antigo, ou de outro programa, importa as plantas padrão e nada mais). Não se tenta mapear disciplina para entidades IFC nesta decisão (não há equivalente padrão de "planta de disciplina").

## 9. Estratégia de teste (correção de premissa e rede de segurança)

**Premissa corrigida (mapa 03):** os contratos existentes de `packages/tools/src` (`contratoSnaps`, `contratoFerramentas`, `contratoModificacao`, `contratoCidadaniaBim`) são **guardas de texto**: leem o código-fonte e checam símbolos; **não executam** ferramenta nenhuma. O único contrato que executa comportamento é `contratoEscadaRampaCota.test.ts`, e só em `lv_0`. `testEnv.ts` fixa `levelId: () => 'lv_0'`, não conhece `hiddenInView`, `underlayLevelId`, `section`. Logo **eles não acusam regressão de snap, cota, criação ou seleção** quando o que muda é a planta. A rede de segurança exige testes **comportamentais novos**; os de texto continuam valendo só como trava de "kind sem classificação".

### 9.1 Ferramentas de teste (fase 1, antes de qualquer mudança)

- `makeEnv({ store?, levelId?, hiddenIds?, halftoneIds?, planViewId?, areaPlanId?, underlayLevelId?, section? })` em `testEnv.ts`, com **padrões idênticos aos de hoje** (os ~286 testes atuais não mudam). `levelId` é o que mais falta; `hiddenIds` alimenta `hiddenInView`; `halftoneIds` alimenta `halftoneInView`.
- `comNiveis(n, geometria)`: projeto com N níveis (`makeLevel`, `level.ts:13`) repetindo a mesma geometria; devolve `{ store, levelIds }`.
- `cenario(nome, gesto)`: um gesto de teste (snap em ponto, cota entre duas paredes, criar parede/pilar/escada, clicar, caixa, mover, copiar, colar) que devolve um **resultado normalizado** (ver oráculo).
- Matriz com `describe.each` (já usado em `cotaPosicaoFinal.test.ts`).

### 9.2 Oráculo de equivalência

Os elementos pertencem ao **nível**, não à planta; por isso um mesmo gesto roda em plantas diferentes **sobre os mesmos ids**, sem mapeamento. O oráculo compara resultados normalizados:

- **snap**: `{ tipo, ponto (toBeCloseTo), idDoElemento, chave }` do melhor candidato e a lista ordenada dos candidatos dentro do raio;
- **cota**: valor, `refs`, `planId` gravado e a coleção em que caiu (nível ou planta);
- **criação**: geometria dos elementos criados (kinds, pontos, alturas) e `levelId`;
- **seleção**: conjunto de ids por clique e por caixa, e as alças devolvidas;
- **mover/copiar/colar**: comandos gerados (tipo, ids, deslocamento) e a coleção de destino das anotações;
- **desenho**: hash do `PlanGeometry` (`planViewOf`) e das ops do `buildPlan`;
- **prancha**: partes de `planPartsOf`.

Três oráculos, todos executados:

1. **Invariância da planta padrão (golden).** Na fase 1, **antes** de mudar código, gravam-se os resultados atuais da planta padrão como valores fixos no teste (caracterização). Depois de cada etapa, a planta padrão tem de bater o golden. Prova "não quebrou o que existe".
2. **Equivalência padrão x disciplina neutra.** O mesmo cenário na planta padrão e numa `PlanView` de disciplina `arquitetura`, **mesmos gráficos, mesma ocultação, tons todos `normal`**, produz resultados iguais, exceto o dono das anotações (que deve ser a própria planta). Prova que `planId` não vaza para o que é de nível.
3. **Divergência esperada por disciplina.** Planta de estrutura com arquitetura em `halftone`: parede captura, **não** seleciona (clique e caixa), é referência de cota; com `hidden`: não captura, não seleciona, não é referência. Pilar normal: tudo. Isolamento de anotação: cota feita na planta A não aparece na planta B nem na padrão, e vice-versa (lacuna 4 do mapa 03). Mover/Copiar/Colar de cota em planta de disciplina e de área movem, copiam e colam **na planta**, nunca no nível (lacuna 2).

Mais: migração (arquivo 30 sem e com tudo, ida e volta serializar → abrir → serializar idêntico; arquivo 32 recusado); guarda de texto de completude (lista fechada dos arquivos que ainda leem `Level.graphics`/`Level.hidden` direto; nenhum `hiddenInView?.()` fora de `visibilidade.ts`/`base.ts`; nenhuma chave `plan:${` montada à mão fora de `viewIdentity.ts`); `planViewOf` com cache: duas plantas do mesmo nível não compartilham geometria; sessão antiga abre; IFC sem `PlanViewsJSON` importa.

### 9.3 Portões

Cada etapa só fecha com: a suíte do pacote tocado verde **em lotes** (a máquina tem 7,7 GB; comandos pesados só por `~/hestia-tools/pesado.sh`, no máximo dois executores), `tsc` do pacote, e os três oráculos da etapa. A suíte completa roda na CI. Etapa que muda o desenho exige comparação do hash de `PlanGeometry` da planta padrão antes e depois (golden da fase 1).

## 10. Plano de etapas e o que fica fora

**Fase 1 — Rede de segurança (sem mudança de produto).** Ferramentas de teste (§9.1) e golden da planta padrão; caracterização de Mover/Copiar/Colar com `planId` de área; fixtures de arquivo por versão. *Portão:* testes novos verdes **sobre o código atual**, sem tocar produção.

**Fase 2 — Lista de plantas, sem mudança visível.** `PlanView`, resolvedor, esquema 31, comandos, validação, colaboração, chave de vista única, `planViewId` no estado, consumidores trocados por `planGraphicsOf`, anotações por planta com o gap de Mover/Copiar/Colar fechado, prancha, DXF e IFC. Só existe disciplina `arquitetura` com tons neutros (a tabela de disciplina e tons entra na fase 3); criação de planta só por comando/teste, **sem interface**. *Portão:* oráculos 1 e 2 verdes; arquivo antigo e novo sem plantas idênticos em desenho, DXF e prancha; nenhuma regressão da suíte.

**Fase 3 — Disciplinas.** `Discipline`, `disciplineOfElement`, tons e predefinidos, `visibilityOf` com `halftone`, regra única de snap/seleção, meio-tom no desenho, criação de planta por disciplina com predefinido. *Portão:* oráculo 3 verde; planta padrão ainda bate o golden (os tons de Arquitetura não mudam o desenho de hoje).

**Fase 4 — Interface.** Navegador de projeto e abas com a lista de plantas por nível, criar/duplicar/renomear/excluir, diálogo de visibilidade por disciplina, barra de vista, seletor na prancha, textos nos sete idiomas, conferência no navegador. *Portão:* fluxo completo validado no app real (criar planta de Estrutura, cotar, pôr em prancha, exportar DXF, salvar, reabrir).

**Fora desta decisão:**

- **Modelos de vista** (view templates, aplicar o mesmo conjunto de gráficos e tons a várias plantas): fase posterior; o `tones` + `graphics` por planta foram desenhados para virar o conteúdo de um modelo sem mudança de dado.
- **Elementos MEP** (kinds, categorias gráficas, sistemas, conexões): **outro ADR**. Esta decisão só garante que a tabela `Record<Element['kind'], ...>` e os predefinidos já têm as colunas.
- Intervalo de vista (`viewRange`) próprio por planta: a planta de disciplina usa o do nível (campo continua em `Level`).
- Tom por elemento e por categoria dentro da planta; camadas DXF por disciplina; planta de cobertura por disciplina; legendas de tons.

## 11. Riscos e alternativas descartadas

**Alternativas descartadas**

- **Planta nova como cópia de nível** (um nível "Térreo - Estrutura" com os mesmos elementos). Duplica elementos (editar uma parede exige editar duas), quebra elevação e relações de pavimento, polui lista de níveis, relatórios, cotas e prancha, e resolve o problema errado: a planta é uma **vista** do mesmo nível, não outro nível.
- **Disciplina como campo do elemento.** Obrigaria migrar elementos antigos (a decisão do dono "sem migração destrutiva" cai), permitiria estado incoerente (um `wall` hidráulico) e duplicaria o que o `kind` já diz. A derivação por `kind` é gratuita, exaustiva (o `tsc` acusa kind novo) e não toca no dado.
- **Mover Level.graphics/hidden para dentro de `planViews`** (padrão também vira `PlanView`). Mais "puro", mas reescreve 48 + 15 pontos de uma vez, exige migração de todo arquivo e deixa o arquivo ilegível ao programa antigo. A planta padrão como "dados no nível" custa um `if` no resolvedor e zero no arquivo.
- **`PlanKind = 'discipline'`** (§3.1): perda silenciosa de perfil de piso.
- **Meio-tom selecionável / meio-tom sem snap** (§4.1): o primeiro causa edição acidental entre disciplinas; o segundo tira o sentido de coordenar.
- **Criar `GraphicsCategory` de estrutura agora** (§1.2): muda o que arquivo antigo mostra.
- **Herança de anotações do nível** (como a planta de área): vazamento entre disciplinas e a inconsistência já vista entre `viewAnnotationsOf` e `annotationsOfActiveView`.

**Riscos**

| Risco | Mitigação |
|---|---|
| Cache de `planViewOf` por projeto sem `planId` devolveria a geometria de outra planta | `planId` na chave; teste com duas plantas no mesmo nível (§9.2) |
| `viewKey` duplicada em quatro lugares: uma esquecida colide chaves | helper único e guarda de texto proibindo `plan:${` fora de `viewIdentity.ts` |
| Pontos de leitura de `levelGraphicsOf` esquecidos (48 + 15) | wrapper transitório + guarda de texto com lista fechada; matriz executada |
| Regra de snap/seleção espalhada, tom ignorado por ferramenta de hit-test própria | `visibilidade.ts` como ponto único + guarda + matriz por ferramenta |
| `withSheetScale` e `projetoDoPainel` trocam gráficos em cópia do projeto | trocar o registro certo (nível **ou** planta) e testar a prancha com planta de disciplina |
| Coleção nova perdida em colaboração | `planViews` em `COLLECTION_KEYS` e teste de merge |
| Bump de esquema colide com outra frente | número é o único ponto de integração; migração é identidade |
| Desempenho: tons recalculados a cada quadro | cache por projeto + `planId` (precedente: `sitioPorProjeto`, `viewVisibility.ts`); medir em planta com milhares de elementos |
| Gap de Mover/Copiar/Colar com `planId` já existente para planta de área | caracterizado na fase 1 e fechado na 2.3 |
| Planta de disciplina aberta num programa antigo | bump de esquema: o programa antigo recusa em vez de perder dado |

## 12. Ficha de execução

Convenções: caminhos a partir da raiz do worktree. "Teste" = teste novo exigido além da suíte do pacote. Comandos pesados só por `~/hestia-tools/pesado.sh`, `--maxWorkers=2`. Não alterar os comandos existentes de histórico (`setLevelGraphics` etc.).

### Fase 1 (pré-requisito, sem produção)

- **Arquivos:** `packages/tools/src/testEnv.ts` (opções de `makeEnv`), novo `packages/tools/src/testMatriz.ts` (`comNiveis`, `cenario`, normalizador de resultado), novos `*.matriz.test.ts` em `packages/tools/src`, `packages/model/src/esquemaFixtures.test.ts`, `packages/render/src/plan/` (golden de `PlanGeometry`).
- **Pronto quando:** matriz (snap, cota, criação, seleção clique/caixa, mover, copiar, colar) roda na planta padrão e em planta de área com golden gravado do código atual; caracterização do gap de Mover/Copiar/Colar com `planId`; `makeEnv()` sem argumentos igual ao de hoje.
- **Testes:** todos acima; nenhum teste existente alterado.

### 2.1 Modelo, resolvedor, esquema, colaboração

- **Arquivos:** `packages/model/src/types.ts` (`Project.planViews?`, `ViewHiddenTarget`, `SCHEMA_VERSION` 31), novo `packages/model/src/planView.ts`, `graphics.ts` (`planOf`, `planGraphicsOf`, `planHiddenOf`; `levelGraphicsOf` vira wrapper), `graphicsCommands.ts`, `commands.ts`, `viewHiddenCommands.ts`, `migrate.ts` (`30: identidade`), `validate.ts`, `collabHistory.ts`, `historyRotulos.ts`, `level removal`.
- **Pronto quando:** arquivo sem `planViews` idêntico ao antigo; resolvedor cai na padrão para id desconhecido; comandos criam, atualizam, removem e desfazem (viewports órfãos descartados); `planViews` em `COLLECTION_KEYS`; 30 abre como 31; 32 é recusado.
- **Testes:** `planView.test.ts` (resolvedor, fallback, invariância do nível), `esquema31.test.ts` (ida e volta idempotente, recusa, fixture 30), validação, collab (merge de coleção), comandos com desfazer.

### 2.2 Identidade única da vista e estado de UI

- **Arquivos:** novo `apps/web/src/editor/viewIdentity.ts`; `openViews.ts`, `viewKey.ts`, `viewVisibility.ts`, `dxfExportDialogModel.ts`, `state.ts` (`planViewId`, subscriber), `paneView.ts`, `paneStore.ts`, `paneViews.ts`, `panes.ts`, `layoutTree.ts`, `sessao.ts`, `controller.ts` (`selectLevel`, `load`, `viewKey`), `viewTabActions.ts`.
- **Pronto quando:** `viewKey`, `viewKeyOf`, `visibilityKeyOf` e a chave do DXF chamam um helper só; duas plantas do mesmo nível têm chaves, câmeras e visibilidade temporária distintas; sessão e painéis antigos abrem na planta padrão; id inexistente vira `null`.
- **Testes:** `viewIdentity.test.ts`; `viewKey.test.ts` reescrito; sessão e painéis antigos; guarda de texto contra `plan:${` fora do helper.

### 2.3 Consumidores por planta e anotações (inclui o gap)

- **Arquivos (mapa 01, classes B e C):** `render/plan/style.ts`, `view.ts`, `planContext.ts`, `guardaCorpoCamada.ts`, `massaCamada.ts`, `planOverlay.ts`, `build.ts`; `apps/web/src/editor/paneStyle.ts`, `graphicsActions.ts`, `aquecerPlanta.ts`, `controller.ts` (`viewScale`, `exec1`, `areaPlanIdNow`, colar), `viewVisibility.ts`, `viewAnnotations.ts`; `ui/ViewControlBar.tsx`, `GraphicsProps.tsx`, `ViewportCanvas.tsx`, `ribbon/actions.ts`, `dialogs/GraphicsVisibilityDialog.tsx`; `packages/tools/src/types.ts` (`ToolEnv.planViewId?`), `base.ts` (`viewPlanId`), `selectTool.ts`, `annotationPick.ts`, `annotationExtraTools.ts:216` (default de escala 50 divergente: trocar por helper, **decidir pelo padrão 100 do Hestia e registrar no teste**), `transformTools.ts:41,:277`; `packages/model/src/annotations.ts` (`viewPlan`, `planScope`, `annotationIdsIn`, `annotationMoveCommands`).
- **Pronto quando:** nenhum chamador de produção lê `Level.graphics` direto fora da lista fechada; Mover, Copiar e Colar movem/copiam/colam anotação na planta ativa (área e disciplina); planta padrão bate o golden.
- **Testes:** oráculos 1 e 2 da matriz inteira; isolamento de anotação entre plantas; o teste de gap da fase 1 invertido; cache de `planViewOf` com duas plantas.

### 2.4 Saídas: prancha, DXF, IFC

- **Arquivos:** `packages/model/src/sheet.ts:58`, `render/sheet/build.ts`, `viewports.ts`, `partsCache.ts`; `apps/web/src/editor/sheetInsertSources.ts`, `sheetInsert.ts`, `sheetActions.ts`, `ui/sheet/useSheetPrefetch.ts`; `dxfBatch.ts`, `dxfBatch.types.ts`, `dxfBatchRenderers.ts`, `dxfExport.ts`; `packages/io/src/ifc/ifcHestia.ts`, `ifcImport/hestia.ts`.
- **Pronto quando:** `SheetViewSource.plan.planId` opcional; prancha antiga idêntica; escala de prancha de planta de disciplina grava na cópia certa; lote DXF lista `pv:`; IFC exporta e importa `PlanViewsJSON` e importa IFC sem ele.
- **Testes:** prancha com planta padrão e de disciplina (partes e cache); DXF por planta; ida e volta IFC com `PlanViewsJSON`; `sheet.test.ts` com `planId` inexistente.

### 3.1 Disciplina e tons no modelo

- **Arquivos:** novo `packages/model/src/discipline.ts` (`Discipline`, `DISCIPLINES`, `DISCIPLINE_OF_KIND`, `disciplineOfElement`, `DISCIPLINE_TONE_PRESETS`, `planTonesOf`), `categoryOfElement` movido de `viewVisibility.ts`, rótulos i18n (sete idiomas), validação de `tones`.
- **Pronto quando:** `Record<Element['kind'], ...>` exaustivo; tabela de predefinidos igual à §4.2; planta padrão usa o predefinido de Arquitetura sem gravar nada.
- **Testes:** derivação por kind (todos), predefinidos, `planTonesOf` com desvios, `categoryOfElement` equivalente ao antigo (golden).

### 3.2 Visibilidade: regra única e meio-tom no desenho

- **Arquivos:** `apps/web/src/editor/viewVisibility.ts` (`visibilityOf` devolve `halftone`), `controller.ts` (`hiddenInView`, `halftoneInView`), novo `packages/tools/src/visibilidade.ts`, `base.ts:107-111`, `infer.ts:322`, `pick.ts`, `selectTool.ts` (clique e caixa), `render/plan/build.ts`, `planOverlay.ts` (atenuação).
- **Pronto quando:** tabela da §4.1 vale para **todas** as ferramentas e kinds capturados; `hiddenInView?.()` só em `visibilidade.ts` e `base.ts`; meio-tom desenha atenuado por baixo do normal; planta padrão ainda bate o golden.
- **Testes:** oráculo 3 (parede, pilar, escada, móvel, abertura em hidden/halftone/normal: snap, clique, caixa, referência de cota); guarda de texto de ponto único; render com e sem meio-tom.

### 3.3 Criação de planta por disciplina

- **Arquivos:** `packages/model/src/planView.ts` (comandos `addPlanView` com predefinido e nome padrão, duplicar, renomear), `commands.ts`, ação em `apps/web/src/editor/planViewActions.ts` (novo), `annotationsFromLevel` reaproveitado.
- **Pronto quando:** criar planta de cada disciplina grava `discipline`, tons vazios (usa predefinido), anotações vazias; duplicar com e sem anotações; nome único por nível; tudo num passo de desfazer; arquivo salvo e reaberto idêntico.
- **Testes:** criar/duplicar/renomear/excluir por comando; ida e volta de arquivo; prancha que referencia a planta excluída perde o viewport.

### 4.1 Navegador de projeto e abas

- **Arquivos:** `apps/web/src/ui/browser/Views.tsx` (plantas de disciplina sob cada nível), `ui/ViewTabs.tsx`, `ui/PaneGrid.tsx`, `viewTabActions.ts` (`tabOf`, `navega`), `controller.ts` (`selectLevel` com manutenção de disciplina), menu de contexto (criar/duplicar/renomear/excluir).
- **Pronto quando:** cada nível lista a padrão e as adicionais; aba rotula com disciplina; trocar de nível mantém a disciplina quando existir planta dela; destaque correto.
- **Testes:** `Views` e abas com planta de disciplina; `selectLevel` mantendo disciplina; fechar aba libera o nível (`levelToRelease`).

### 4.2 Propriedades, visibilidade por disciplina e barra de vista

- **Arquivos:** `ui/GraphicsProps.tsx`, `ui/dialogs/GraphicsVisibilityDialog.tsx` (aba "Disciplinas": tom por disciplina, restaurar predefinido), `ui/ViewControlBar.tsx` (disciplina e tom), `ui/Properties.tsx`, `ribbon/actions.ts`, i18n.
- **Pronto quando:** editar escala, detalhe, estilo e tons grava na planta ativa (padrão = nível); "Restaurar padrão" por planta; textos nos sete idiomas.
- **Testes:** ações de gráficos por planta; diálogo grava `tones`; padrão continua gravando em `Level.graphics`.

### 4.3 Prancha, DXF e conferência no app

- **Arquivos:** `ui/sheet/*` (fonte "planta de disciplina" ao inserir vista), diálogo DXF (alvos `pv:`), `docs/disciplinas/ESTADO.md` (estado da frente).
- **Pronto quando:** inserir planta de Estrutura numa prancha, exportar PDF e DXF, salvar, reabrir e conferir no navegador (câmera, visibilidade temporária por planta, cotas isoladas).
- **Testes:** inserção na prancha; chaves de marcação `pv:`; roteiro manual registrado no estado da frente.

## Adendo 1 (2026-11-21): disciplina do componente vem da família; elementos de exemplo

**Decisão do dono:** o MEP completo (ADR 0061, `MepRun`, eletroduto) fica para depois; esta frente fecha só as disciplinas, "redondo e funcional". Para testar as plantas de Hidrossanitário, Elétrico e HVAC sem MEP, entram **famílias de exemplo** no sistema de componentes.

**Revisão da §1.2:** `component` deixa de ser sempre `arquitetura`. A disciplina de um componente vem de `Familia.disciplina?` (campo opcional); **sem o campo continua `arquitetura`**, então arquivo e família existentes não mudam. `furniture` (móvel antigo) segue `arquitetura`. Consequência: `disciplineOfElement` precisa do projeto (ou de um resolvedor de família) para consultar a família do componente: `disciplineOfElement(el, project)`; os chamadores (`visibilityOf` na 3.2b e os testes) passam o projeto. A tabela exaustiva por `kind` continua valendo para os demais.

**Famílias de exemplo (blocos paramétricos, formas simples; o editor de famílias só faz peças prismáticas):** hidrossanitário (vaso sanitário, lavatório, ralo), elétrico (tomada, interruptor, luminária de teto, quadro de distribuição), HVAC (difusor de teto, evaporadora split já existente `fam_ar_split` ganha `disciplina: 'hvac'`). Mais um **projeto de exemplo** (modelo de arquivo) com uma casa pequena que traz elementos de cada disciplina e uma planta de cada disciplina já criada.

**Item adiado:** derivar a disciplina de um `generic` importado pela classe IFC de origem (`IFCPIPE*`, `IFCCABLE*`, `IFCDUCT*`, `IFCBEAM`, `IFCCOLUMN`). Fica para depois das fases 3.4 e 4.

## Adendo 2 (2026-11-21): categorias gráficas por elemento (ocultar um não oculta o outro)

**Defeito (relato do dono, confirmado no código):** "Ocultar categoria" de um pilar ocultava as paredes juntas. Causa: `categoriaDoElemento` mapeava `column → wall`, `beam` e `footing → slab`, `ceiling → floor`, `ramp → stair`, e `component`/`furniture` não tinham categoria; o 3D tinha uma SEGUNDA cópia da regra fixada em `structuralSolids.ts` ("Pilares: categoria 'wall'"). Sem categorias próprias, nenhum isolamento por elemento ou por disciplina é possível.

**Decisão:**
1. Novas `GraphicsCategory`: `column` (pilar), `beam` (viga), `footing` (sapata), `ceiling` (forro), `ramp` (rampa) e, para componentes, uma categoria POR DISCIPLINA da família (consistente com a §1.2 e o Adendo 1): `component` (arquitetura: mobiliário e componentes), `plumbingFixture` (hidrossanitário), `electricalFixture` (elétrico), `mechanicalEquipment` (HVAC). `furniture` (móvel antigo) = `component`. `categoriaDoElemento(e, project?)` passa a receber o projeto (para achar a família), como `disciplineOfElement`.
2. **Uma regra só:** a planta, o 3D, o corte, a prancha e o DXF usam `categoriaDoElemento`; nenhum mapeamento por kind fora do modelo (guarda de texto).
3. **Sem mudança visual:** o estilo padrão de cada categoria nova copia o da categoria de onde saiu (pilar = parede 5/2, viga e sapata = laje 4/1, forro = piso 3/1, rampa = escada 4/2; componentes 2/1). Arquivos antigos sem as chaves novas em `overrides` abrem com os padrões (mescla com defaults). Camadas do DXF ficam como hoje (a categoria nova aponta para a camada antiga) para não mudar saída existente.
4. **Efeito conhecido em arquivo antigo:** quem tinha "Parede" oculta e via os pilares sumirem passa a ver os pilares (é a correção); idem viga/sapata com "Laje".
5. **Matriz de isolamento obrigatória** (teste): para cada kind de `Element` e para cada forma de ocultar (elemento, categoria, temporário, tom `hidden` de disciplina), na planta e no 3D, somem exatamente os elementos esperados e mais nenhum.
