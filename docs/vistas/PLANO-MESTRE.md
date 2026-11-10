# Plano-mestre: vistas de planta como entidade

Este documento é a instrução completa para executar a unificação das plantas (piso, cobertura, área) numa única
entidade de vista, alinhada ao Revit. Quem executa é uma sessão coordenadora em Sonnet, que dispara subagentes Sonnet
(trabalho com decisão) e Haiku (troca mecânica). Leia o documento inteiro antes de qualquer ação.

Situação de partida: `main` em `78afa83` (release 0.2.4), `SCHEMA_VERSION = 23`.

---

## 1. Objetivo e resultado esperado

Hoje a planta de piso **é** o nível, a planta de cobertura é uma variante pendurada no nível e a planta de área é uma
entidade separada tratada por exceção. No fim deste plano:

1. Existe uma entidade `PlanView`. Um nível pode ter várias vistas. Piso, cobertura e área são tipos (`kind`) dela.
2. Tudo que é da vista mora na vista: intervalo de vista, gráficos, ocultos e anotações.
3. Toda decisão "este item aparece nesta vista?" passa por **uma** função, usada por desenho, seleção, captura, DXF e
   prancha.
4. Toda decisão "esta ferramenta pode ser usada nesta vista?" passa por **uma** tabela por tipo de vista.
5. Não sobra nenhum `planKind === 'area'` espalhado, nem `AREA_PLAN_TOOLS`, nem `roofHidden`.
6. O desenho, o DXF e as pranchas dos projetos existentes saem **idênticos** aos de antes, salvo as mudanças de
   comportamento listadas na seção 7 (Fase 3).

## 2. Fatos verificados no código (não redescubra)

- `packages/model/src/types.ts`, `interface Level`: guarda `viewRange`, `graphics`, `hidden`, `roofHidden`,
  `dimensions`, `texts`, `detailLines`, `detailRegions`, `tags` e `roomSeparators`.
- `packages/model/src/areaPlan.ts`, `interface AreaPlan`: `id`, `name`, `levelId`, `schemeId`, `scale`, `graphics`
  (`AreaPlanGraphics`), `tags` (`RoomTag[]`), `legend`, `table`, `annotations?`, `hidden?`. Mora em
  `Project.areaPlans`.
- **Herança de anotações:** `AreaPlan.annotations === undefined` significa "mostra as anotações do nível"
  (`planOwnsAnnotations`). Definido, mesmo vazio, é conjunto próprio.
- `packages/model/src/annotations.ts` já tem `AnnotationScope` com três implementações (`levelScope`, `planScope`,
  `sectionScope`) e os comandos de anotação recebem `levelId` + `planId?` + `sectionId?`. É o ponto de partida da
  generalização.
- `packages/model/src/viewProfile.ts`: `ResolvedProfile` e `ProfileBase = 'floor' | 'area'`. É a fonte do perfil para
  render, seleção, DXF e painel.
- A vista é identificada de três formas diferentes:
  - `ViewHiddenTarget` (`types.ts`): `{plan, levelId}`, `{roof, levelId}`, `{area, planId}`, `{section, viewId}`, `{3d}`.
  - `SheetViewSource` (`sheet.ts`): `{plan, levelId}`, `{areaPlan, planId}`, `{areaTable}`, `{section}`, `{3d}`.
    Não existe fonte de planta de cobertura em prancha.
  - `OpenView` (`apps/web/src/editor/openViews.ts`): `{kind:'plan', levelId, planKind?, areaPlanId?}`.
- Estado da interface (`apps/web/src/editor/state.ts`): a vista ativa são campos soltos `view`, `levelId`, `planKind`,
  `areaPlanId`, `sectionId`, `sheetId`.
- Ferramentas na planta de área: `AREA_PLAN_TOOLS` em `apps/web/src/editor/controller.ts:65`, consultada em
  `controller.ts:535` e `apps/web/src/ui/ribbon/parts.tsx:53`.
- Cotas e etiquetas referenciam o elemento pelo id (`Dimension.refs`, `ElementTag.hostId`), não pelo nível. Trocar o
  dono da anotação não quebra o vínculo.
- O kernel Rust (`crates/`) não tem nenhum parâmetro de vista. Deve continuar assim.
- Distribuição do que precisa mudar (arquivos de produção): `apps/web/src/editor` 27, `apps/web/src/ui` 24,
  `packages/render` 20, `packages/model` 19, `packages/tools` 14, mais `packages/io` (`dxfNotes.ts`,
  `dxfSectionNotes.ts`) e `packages/engine` (`viewWarnings.ts`, `areaPlan.ts`, `assinaturasNivel.ts`). Testes: 43.
- Lint: `max-lines` 420 por arquivo (sem brancos e comentários; testes isentos). Arquivo no limite: extraia para
  arquivo novo em vez de acrescentar.

## 3. Regras invioláveis

1. **Vista nunca entra no kernel.** Nada de `crates/`, nada na cena enviada ao kernel, nada em `packages/geom`.
   `git diff --stat <base> -- crates packages/geom` tem de ficar vazio em todas as fases.
2. **`SCHEMA_VERSION` e `migrate.ts` só mudam na Fase 2**, por um único agente.
3. **Cada agente só toca nos arquivos da sua raia.** Precisou de algo fora? Para e devolve ao coordenador.
4. **Ninguém declara sucesso sem colar a saída** de verificação de tipos, lint, testes e comparação de ouro.
5. **Não se "atualiza" o ouro para fazer passar.** Diferença de ouro fora da lista da Fase 3 é defeito.
6. **Sem pull request e sem merge em `main`.** Só branches `vistas/*`.
7. **Haiku não decide.** Se o arquivo exigir escolha que o exemplo de antes/depois não cobre, o Haiku devolve o
   arquivo e ele vai para Sonnet.
8. Não apague nem enfraqueça teste existente para passar. Teste que testava a gambiarra removida é reescrito para a
   regra nova, e isso é dito no relatório.

## 4. Contrato

### 4.1 Entidade

Arquivo novo `packages/model/src/planView.ts`:

```ts
export type PlanViewKind = 'floor' | 'roof' | 'area' | 'ceiling';

export interface PlanAnnotations {
  dimensions: Dimension[];
  texts: TextNote[];
  detailLines: DetailLine[];
  detailRegions: DetailRegion[];
  tags: ElementTag[];
}

export interface PlanView {
  id: Id;
  name: string;
  levelId: Id;
  kind: PlanViewKind;
  /** Sempre presente. Cotas relativas à elevação do nível. */
  viewRange: ViewRange;
  /** Ausente = padrão do tipo de vista. */
  graphics?: ViewGraphics;
  hidden?: ViewHidden;
  /** Sempre próprias. Não existe herança de anotações entre vistas. */
  annotations: PlanAnnotations;
  /** Só quando kind === 'area': o que hoje é específico de AreaPlan. */
  area?: {
    schemeId?: Id;
    scale: number;
    graphics: AreaPlanGraphics;
    tags: RoomTag[];
    legend?: AreaLegend;
    table?: AreaTable;
  };
}
// Project.planViews: PlanView[]
```

Decisões fechadas:

- `'ceiling'` entra no tipo agora, mas só ganha comportamento na Fase 4. `'structural'` **não** entra: não há pilar
  nem viga no modelo.
- `AreaPlanGraphics` **não** é fundido em `ViewGraphics` neste plano. Fica sob `area`. Fundir é trabalho posterior.
- `Level` fica só com `id`, `name`, `elevation` e `roomSeparators` (linha de separação é modelo: muda a área do
  ambiente em todas as vistas).
- Todo nível tem exatamente uma vista `floor` e uma `roof` "principais", criadas junto com o nível. Isso preserva o
  comportamento de hoje (toda planta de piso e de cobertura sempre existe). Remover um nível remove suas vistas e, em
  cascata, o que já é removido hoje (viewports de prancha, abas).
- Ids determinísticos na migração: piso `pv_<levelId>`, cobertura `pvr_<levelId>`, área **mantém o id do `AreaPlan`**.
  Vistas criadas depois usam `newId`.

### 4.2 API de acesso (única porta de leitura)

Em `packages/model/src/planView.ts`, exportada pelo `index.ts`:

```ts
planViewsOf(p): PlanView[]
planViewOf(p, viewId): PlanView | undefined
planViewsOfLevel(p, levelId, kind?): PlanView[]
mainPlanViewOf(p, levelId, kind: 'floor' | 'roof'): PlanView   // sempre existe para nível válido
viewRangeOf(p, viewId): ViewRange
viewGraphicsOf(p, viewId): ViewGraphics                        // já resolvido contra o padrão
viewHiddenOf(p, viewId): ViewHidden
viewAnnotationsOf(p, viewId): PlanAnnotations
viewProfileOf(p, viewId): ResolvedProfile
```

Regras:

- Fora de `packages/model/src/planView.ts`, `annotations.ts`, `migrate.ts` e dos comandos de vista, **ninguém** lê
  `level.viewRange`, `level.graphics`, `level.hidden`, `level.roofHidden`, `level.dimensions`, `level.texts`,
  `level.detailLines`, `level.detailRegions`, `level.tags`, nem `p.areaPlans`.
- Na Fase 1 os dados ainda estão no lugar antigo. `planViewsOf` devolve uma **projeção** montada a partir de `levels`
  e `areaPlans`. A projeção tem de ser estável por referência (memorizada por identidade do `Project`/`Level`/
  `AreaPlan` de origem, por exemplo com `WeakMap`), senão seletores da interface e caches de desenho refazem tudo a
  cada leitura.
- Na projeção da Fase 1, a vista de área **sem** anotações próprias devolve as anotações do nível (comportamento
  atual). A herança só deixa de existir na Fase 2, pela migração.

### 4.3 Escrita

- Comandos de anotação passam a receber `viewId` (planta) ou `sectionId` (corte). Na Fase 1 o comando traduz `viewId`
  para o armazenamento antigo; na Fase 2 a tradução some.
- Comando novo `updatePlanView { viewId, patch }` substitui os comandos que hoje alteram `viewRange`, `graphics` e
  ocultos do nível, e `updateAreaPlan` no que for comum. `addPlanView` e `removePlanView` substituem
  `addAreaPlan`/`removeAreaPlan`.
- Antes de renomear ou remover qualquer comando, a raia A audita `packages/plugin-api`: comando exposto a plugin
  mantém o nome antigo como apelido que traduz para o novo. Não se quebra plugin.
- Desfazer/refazer tem de continuar funcionando para todos os comandos tocados (há testes; mantenha-os verdes).

### 4.4 Identificação da vista

Depois da Fase 2 há uma forma só:

| Lugar | Antes | Depois |
|---|---|---|
| `ViewHiddenTarget` | `{plan, levelId}` / `{roof, levelId}` / `{area, planId}` | `{kind:'plan', viewId}` |
| `SheetViewSource` | `{plan, levelId}` / `{areaPlan, planId}` | `{kind:'plan', viewId}` (`areaTable` continua) |
| `OpenView` | `{plan, levelId, planKind?, areaPlanId?}` | `{kind:'plan', viewId}` |
| Estado da interface | `levelId` + `planKind` + `areaPlanId` | `planViewId`; nível e tipo são derivados |

A sessão salva no navegador (`apps/web/src/editor/sessao.ts`) precisa ler o formato antigo e converter, sem erro e
sem perder abas.

### 4.5 Visibilidade: a regra única (ordem do Revit)

Função única em `packages/model` (nome sugerido `visibleInView`), consumida por desenho, seleção, captura (snap),
DXF e prancha. Um item aparece se passar por **todas** as etapas, nesta ordem:

1. **Pertence ao alcance da vista:** nível e intervalo de vista (e recorte, quando existir na Fase 4).
2. **Tipo de vista:** a categoria existe naquele tipo (tabela 4.6).
3. **Categoria:** não está em `hidden.categories` e a camada do perfil está ligada.
4. **Filtros** (Fase 4): o primeiro filtro que casa e desliga a visibilidade oculta o item.
5. **Elemento:** não está em `hidden.elements`.
6. **Temporário:** ocultar/isolar temporário da sessão. Não é salvo e **não** vale para prancha, PDF nem DXF.
7. **Anotação presa a elemento:** cota some se **qualquer** elemento referenciado em `refs` não está visível na
   vista; etiqueta some se o `hostId` não está visível. (Entra na Fase 3.)

Regras complementares do Revit:

- Modo "revelar ocultos" mostra tudo que as etapas 3 e 5 escondem, com destaque, e permite reexibir.
- Não se captura nem se seleciona o que não está visível. Cota nova só referencia elemento visível.
- A prancha mostra a vista exatamente como ela é. Não existe ocultação por viewport.
- Elemento de modelo criado numa vista onde a categoria está oculta **é criado** e a interface avisa (Fase 3).
- Anotação pertence a uma vista só e nunca aparece em outra.

### 4.6 Tabela por tipo de vista

Arquivo novo `packages/model/src/planViewKinds.ts`. É a única fonte para padrão de intervalo, camadas e ferramentas.

| Tipo | Direção | Intervalo padrão | Camadas padrão | Ferramentas |
|---|---|---|---|---|
| `floor` | para baixo | o padrão atual de `viewRange.ts` | `FLOOR_PROFILE_LAYERS` atual | todas |
| `roof` | para baixo | o que a planta de cobertura usa hoje | o que ela mostra hoje | as que ela aceita hoje |
| `area` | para baixo | o do nível hoje | `areaLayersOf(DEFAULT_AREA_GRAPHICS)` atual | Fases 1–2: `AREA_PLAN_TOOLS` atual. Fase 3: todas |
| `ceiling` | para cima | corte 2,30 m (Fase 4) | forros, paredes cortadas, janelas cortadas; sem portas, pisos e mobiliário (Fase 4) | todas, menos ambiente e separação |

"O que usa hoje" não é para inventar: a raia que montar a tabela **lê o comportamento atual no código** e o
transcreve, com teste que prova a igualdade. Ferramenta de ambiente, separação de ambiente e etiqueta de ambiente não
valem em `roof` nem `ceiling`.

Função: `toolAllowedInView(kind, toolId): boolean`. Depois da Fase 3 é a única consulta de permissão de ferramenta.

## 5. Rede de segurança: o ouro

Antes de mudar qualquer código, a Fase 0 grava o "ouro": a saída atual do programa, para comparar depois de cada
fase.

**Projetos de teste** (em `tests/vistas-ouro/projetos/`, JSON do projeto). No mínimo:

1. Casa de vários níveis com paredes, portas, pisos, lajes, escada e telhado.
2. Projeto com cotas, textos, linhas e regiões de detalhe e etiquetas em mais de um nível.
3. Planta de área **sem** anotações próprias (herda do nível) e com cores e etiquetas de ambiente.
4. Planta de área **com** anotações próprias, incluindo conjunto próprio vazio.
5. Nível com `hidden` (categoria e elemento) e com `roofHidden`.
6. Nível com `viewRange` e `graphics` fora do padrão (escala, detalhe, substituição por categoria).
7. Pranchas com viewport de planta de piso, de planta de área, de tabela de áreas, de corte e 3D.
8. Um arquivo salvo em versão antiga do esquema (o mais antigo que os testes de migração já usam), para exercitar a
   cadeia inteira.

Use os projetos de exemplo e os de teste que já existem no repositório sempre que servirem; crie só o que faltar.

**O que é gravado, por projeto e por vista** (piso e cobertura de cada nível, cada planta de área, cada prancha):

- a lista de desenho da planta, na forma serializável mais estável que o render já expõe (veja
  `packages/render/src/plan/__snapshots__/caracterizacao.test.ts.snap` e o teste correspondente);
- o texto do DXF da vista;
- a saída vetorial de cada prancha;
- a lista de ids que a seleção enxerga na vista (teste de acerto em grade de pontos);
- o resultado de `viewWarnings` e os quantitativos do projeto.

**Comando:** `npm run test:vistas-ouro` compara com o gravado e falha com diferença legível.
`npm run test:vistas-ouro -- --gravar` regrava; só pode ser usado na Fase 0 e, na Fase 3, para as diferenças
previstas.

Depois da Fase 2 a chave da vista muda de "nível + tipo" para id da vista. O script converte a chave antiga pelos ids
determinísticos da seção 4.1; o conteúdo comparado é o mesmo.

## 6. Como o coordenador trabalha

### 6.1 Preparação

```bash
git fetch origin main
```

```bash
git checkout -B vistas/base origin/main
```

```bash
npm ci
```

Traga este documento para `vistas/base` (está no branch `vistas/plano-mestre`). Rode a verificação da seção 6.3
antes de tudo e anote os números de partida (quantos arquivos e testes passam). Se já falhar em `main`, registre o
que falha: isso não é culpa das raias.

### 6.2 Disparo das raias

- Um subagente por raia, com `isolation: "worktree"`, branch `vistas/f<fase>-<raia>` saindo de `vistas/base`.
- `model: "sonnet"` ou `model: "haiku"` conforme a tabela da fase.
- Raias da mesma fase vão **no mesmo turno**, em paralelo. Fases diferentes nunca se sobrepõem.
- A instrução de cada subagente é: a seção 6.4 inteira, mais as seções 2, 3 e 4 deste documento, mais o bloco da raia.
  Subagente não tem o contexto do coordenador: a instrução tem de bastar sozinha.

### 6.3 Verificação (igual para todos)

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test:rapido
```

```bash
npm run test:vistas-ouro
```

```bash
git diff --stat vistas/base -- crates packages/geom
```

O último tem de sair vazio. Ao fim de cada fase, o coordenador roda também `npm run test` completo e
`npm run test:visual`.

### 6.4 Regras comuns a todo subagente (copiar na instrução)

> Você trabalha no repositório Hestia (monorepo TypeScript, npm workspaces), num git worktree e branch próprios.
> - Leia `docs/vistas/PLANO-MESTRE.md` seções 2, 3 e 4 antes de editar.
> - Toque **somente** nos arquivos do seu escopo. Se precisar de mudança fora dele, pare e relate; não edite.
> - Proibido: `crates/`, `packages/geom`, `SCHEMA_VERSION`, `migrate.ts` (salvo se for a sua raia), criar pull
>   request, fazer push, mexer em outros branches.
> - Siga o estilo do arquivo vizinho (nomes e comentários em português onde o arquivo já usa). Limite de 420 linhas
>   por arquivo: se estourar, extraia para arquivo novo.
> - Escreva teste (vitest) para toda regra nova. Não apague teste para passar.
> - Commits pequenos, mensagem em português (`refactor(vistas): ...`, `feat(vistas): ...`).
> - Antes de entregar, rode os cinco comandos de verificação e cole o resumo de cada um.
> - Relatório final, nesta ordem: (1) arquivos alterados; (2) saída dos cinco comandos; (3) decisões que tomou e por
>   quê; (4) o que **não** fez ou não conseguiu; (5) dúvidas. Não declare sucesso com qualquer comando falhando.

### 6.5 Revisão e integração

1. Para cada raia Sonnet, um **segundo** subagente Sonnet revisa o diff contra as seções 3 e 4 e contra o escopo da
   raia. Ele procura: leitura direta dos campos proibidos (4.2), arquivo fora do escopo, teste enfraquecido,
   decisão de visibilidade fora da função única, projeção sem estabilidade de referência.
2. Raia Haiku: o coordenador confere por amostragem (um em cada cinco arquivos) e pela busca da seção 8.
3. Problema encontrado volta para **o mesmo** subagente (via `SendMessage`), com o trecho e a regra violada.
4. Raia aprovada entra em `vistas/base` por merge. Conflito de merge é resolvido por um subagente Sonnet, nunca à
   mão sem rodar a verificação depois.
5. Depois de cada merge: os cinco comandos. Vermelho = reverte o merge e devolve a raia.
6. Push de `vistas/base` ao fim de cada fase (`git push -u origin vistas/base`), para o trabalho não se perder com o
   container.

### 6.6 Quando parar e chamar o Opus

Pare, faça push do que há e avise o usuário para trocar o modelo quando:

- chegar a um dos dois pontos de controle (fim da Fase 2 e fim da Fase 3);
- o ouro divergir e duas tentativas de correção não resolverem;
- alguma raia concluir que precisa tocar em `crates/` ou na cena do kernel;
- `main` tiver subido o esquema para 24 por outra frente (veja Fase 2);
- o contrato da seção 4 se mostrar ambíguo ou contraditório com o código.

Não improvise nesses casos.

## 7. Fases

### Fase 0 — Ouro e API (dois subagentes em sequência, depois um)

| Raia | Modelo | Escopo | Entrega |
|---|---|---|---|
| 0A | Sonnet | `tests/vistas-ouro/**`, `scripts/`, `package.json` (só o script) | Projetos de teste, gerador, comparador, ouro gravado |
| 0B | Sonnet | `packages/model/src/planView.ts`, `planViewKinds.ts`, `index.ts`, testes; `apps/web/src/editor/vistaAtiva.ts` | API da 4.2 como projeção, tabela 4.6, seletores da vista ativa |
| 0C | Sonnet | `docs/decisoes/` | Decisão escrita (próximo número livre), resumindo a seção 4 |

- 0A roda primeiro e sozinha: o ouro tem de ser gravado com o código **intocado**.
- 0B e 0C rodam em paralelo depois.
- `vistaAtiva.ts` expõe seletores (`planViewIdAtivo`, `nivelAtivo`, `tipoDeVistaAtivo`) derivados dos campos soltos
  atuais. Serve para as raias D e E trabalharem em paralelo na Fase 1.
- Teste obrigatório de 0B: para cada projeto do ouro, a projeção devolve os mesmos intervalo, gráficos, ocultos e
  anotações que o código antigo lê; e duas leituras seguidas do mesmo projeto devolvem **a mesma referência**.

Saída da fase: verificação verde, ouro idêntico (nada mudou de comportamento).

### Fase 1 — Todo o código passa pela API (seis raias em paralelo)

Não muda o arquivo salvo nem o comportamento. Só troca **de onde** o código lê e escreve.

| Raia | Modelo | Escopo (só arquivos de produção e seus testes) |
|---|---|---|
| A | Sonnet | `packages/model/src/**` exceto `planView.ts`, `planViewKinds.ts`, `migrate.ts`, `types.ts`; mais `packages/plugin-api/**` |
| B | Sonnet | `packages/render/src/**` |
| C | Haiku | `packages/tools/src/**` |
| D | Sonnet | `apps/web/src/editor/**` |
| E | Haiku | `apps/web/src/ui/**` |
| G | Sonnet | `packages/io/src/**`, `packages/engine/src/**` |

O que cada uma faz:

- **A:** comandos de anotação aceitam `viewId` (4.3) mantendo a forma antiga funcionando; `updatePlanView`,
  `addPlanView`, `removePlanView` como fachada sobre o armazenamento atual; `viewHiddenCommands.ts`,
  `sheetCommands.ts`, `queries.ts`, `validate.ts`, `history.ts`, `roomCommands.ts`, `transformPlanar.ts`,
  `dimensionSettings.ts` leem pela API. Auditoria de `plugin-api` (4.3).
- **B:** desenho de planta, corte e prancha recebem a vista (ou o id dela) e leem pela API. **Separar os caches:**
  o que depende só da geometria fica por nível; o que depende de intervalo, gráficos, ocultos ou anotações passa a
  ser por id de vista. Teste obrigatório: duas vistas do mesmo nível com ocultos diferentes, desenhadas alternadas,
  não contaminam uma à outra.
- **C:** troca mecânica. Exemplo que vai na instrução:
  - antes: `p.levels.find((l) => l.id === levelId)?.dimensions ?? []`
  - depois: `viewAnnotationsOf(p, viewId).dimensions`
  O contexto da ferramenta passa a carregar `viewId`. Arquivo que decide por `planKind` ou que monta comando com
  `planId` **não** é mecânico: devolver.
- **D:** `controller.ts`, `openViews.ts`, `viewTabActions.ts`, `viewVisibility.ts`, `sessao.ts`,
  `dxfExportDialogModel.ts`, `pastePreview.ts`, `deleteIds.ts` e vizinhos passam a usar os seletores de
  `vistaAtiva.ts`. O estado ainda guarda os campos soltos; só a leitura é centralizada. A consulta de ferramenta em
  `controller.ts:535` passa a chamar `toolAllowedInView`.
- **E:** troca mecânica dos componentes para os seletores de `vistaAtiva.ts` e para a API. `ribbon/parts.tsx:53`
  passa a chamar `toolAllowedInView`. Componente com regra própria por tipo de planta: devolver.
- **G:** DXF, avisos de vista e assinaturas de nível leem pela API.

Testes dos 43 arquivos afetados: cada raia ajusta os da sua pasta.

Saída da fase: verificação verde, ouro idêntico, e a busca 8.1 sem resultado fora dos arquivos permitidos.

### Fase 2 — Esquema 23 → 24 (um subagente Sonnet, sozinho)

Antes de começar:

```bash
git fetch origin main
```

Se `main` já tiver `SCHEMA_VERSION` maior que 23, **pare** (6.6). Senão, faça rebase de `vistas/base` sobre `main` e
rode a verificação.

Escopo: `packages/model/src/types.ts`, `migrate.ts`, `planView.ts`, `annotations.ts`, `areaPlan.ts`,
`areaPlanCommands.ts`, `sheet.ts`, `defaults.ts`, `validate.ts`, `level.ts`; `apps/web/src/editor/state.ts`,
`openViews.ts`, `sessao.ts`; e os testes.

**Ordem obrigatória: testes primeiro, código depois.**

Testes da migração (escritos e falhando antes de implementar):

1. Cada projeto do ouro migrado dá ouro idêntico.
2. Contagem: a soma de cotas, textos, linhas, regiões e etiquetas antes é igual à soma depois, mais as cópias
   criadas pela regra 3 abaixo, e esse número é conferido separadamente.
3. Nenhum id de anotação duplicado dentro do projeto.
4. Todo `refs`/`hostId` de anotação migrada aponta para elemento que existe.
5. Toda vista aponta para nível que existe; todo nível tem exatamente uma `floor` e uma `roof` principais.
6. Toda prancha e todo `hidden` apontam para vista que existe.
7. Migrar duas vezes dá o mesmo resultado; migrar, salvar, abrir e salvar dá bytes iguais.
8. Arquivo de versão antiga percorre a cadeia inteira até 24.
9. Sessão do navegador no formato antigo abre as mesmas abas.

Regras da migração:

1. Cada nível gera `pv_<levelId>` (`floor`) com `viewRange`, `graphics`, `hidden` e as cinco listas de anotação do
   nível; e `pvr_<levelId>` (`roof`) com `hidden = roofHidden`, o intervalo que a cobertura usa hoje e anotações
   vazias.
2. Cada `AreaPlan` vira vista `area` com o **mesmo id**; `scale`, `graphics`, `tags`, `legend`, `table`, `schemeId`
   vão para `area`; `hidden` continua; `viewRange` é o do nível.
3. **Herança:** `AreaPlan` com `annotations === undefined` recebe **cópia** das anotações do nível, com id novo
   determinístico (`<idOriginal>__<idDaVista>`), mas **só** das famílias que a planta mostra (`showDimensions` para
   cotas; `showAnnotations` para textos, detalhes e etiquetas). Famílias que ela não mostra ficam vazias. Ids de
   anotação herdada presentes no `hidden.elements` da planta são trocados pelo id da cópia.
4. `Level` perde os campos de vista. `Project.areaPlans` some; `Project.planViews` entra.
5. `ViewHiddenTarget`, `SheetViewSource` e `OpenView` passam à forma única (4.4). O estado da interface passa a
   guardar `planViewId`.
6. A projeção de `planView.ts` vira leitura direta, e a tradução dos comandos (4.3) é removida.

Saída da fase: verificação verde, os nove testes verdes, ouro idêntico.

**PONTO DE CONTROLE 1.** Push de `vistas/base`. Pare e avise o usuário: o Opus lê o diff de `migrate.ts`, `types.ts`
e dos testes de migração antes de seguir.

### Fase 3 — Remover as gambiarras e alinhar ao Revit (quatro raias em paralelo)

| Raia | Modelo | O que faz |
|---|---|---|
| H | Sonnet | `visibleInView` (4.5) vira a única decisão de visibilidade em desenho, seleção, captura, DXF e prancha |
| I | Sonnet | Etapa 7 da 4.5: cota e etiqueta somem com o elemento oculto; cota nova só referencia o que está visível |
| J | Sonnet | Planta de área aceita todas as ferramentas; criar elemento em categoria oculta avisa, com "Mostrar categoria nesta vista" e "Desfazer" |
| K | Haiku | Apagar `AREA_PLAN_TOOLS`, `areaPlanToolAllowed`, cada `planKind === 'area'` restante e os dois caminhos de anotação, um arquivo por vez |

- H roda primeiro e sozinha se as outras dependerem da função; I, J e K vêm em paralelo depois.
- Escopos por pasta: H em `packages/model` (função) e nos pontos de consulta de `packages/render`,
  `packages/tools/src/annotationPick.ts`, captura e `packages/io`; I em `packages/tools/src/dims/**`,
  `dimensionTool.ts`, `angularDimensionTool.ts` e no desenho de cotas e etiquetas; J em `apps/web/src/editor` e
  `apps/web/src/ui`; K no que sobrar, **depois** de J entregar.
- Textos novos de interface passam pelo i18n existente (`npm run test:i18n`).

**Diferenças de ouro previstas nesta fase (e só estas):**

1. Lista de seleção: item não visível deixa de ser selecionável.
2. Desenho, DXF e prancha: cota ou etiqueta cujo elemento está oculto na vista deixa de aparecer.

Cada diferença é listada no relatório com projeto, vista e item, e conferida uma a uma contra essas duas regras antes
de regravar o ouro. Qualquer outra diferença é defeito.

Saída da fase: verificação verde, a busca 8.2 sem resultado.

**PONTO DE CONTROLE 2.** Push. Pare e avise o usuário. O plano termina aqui até novo aceite.

### Fase 4 — Funções novas (só com aceite do usuário; raias independentes)

| Raia | Modelo | Função |
|---|---|---|
| L | Haiku | Duplicar vista, com e sem detalhamento (copia a configuração; "com detalhamento" copia as anotações com ids novos) |
| M | Haiku | Intervalo de vista editável por vista, no painel |
| N | Sonnet | Modelos de vista: configuração nomeada; a vista referencia; o que o modelo controla fica somente leitura na vista |
| O | Sonnet | Filtros: regra (categoria + parâmetro) → visibilidade e substituição gráfica; entra na etapa 4 da 4.5 |
| P | Sonnet | Chamada: vista filha com recorte e escala própria; recorte entra na etapa 1 da 4.5 |
| Q | Sonnet | Planta de forro: tipo `ceiling` da tabela 4.6 |

Campos novos (`templateId`, `crop`, `parentId`, filtros) exigem nova versão de esquema: uma raia só sobe a versão e
as outras dependem dela. Detalhar esta fase quando ela for aceita.

## 8. Buscas de conferência

### 8.1 Fim da Fase 1 — leitura direta proibida

```bash
grep -rnE "\.(viewRange|roofHidden|detailLines|detailRegions)\b|level\.(graphics|hidden|dimensions|texts|tags)\b|\.areaPlans\b" --include=*.ts --include=*.tsx packages apps | grep -v "\.test\."
```

Só podem aparecer `packages/model/src/planView.ts`, `annotations.ts`, `areaPlan.ts`, `areaPlanCommands.ts`,
`migrate.ts`, `types.ts`, `validate.ts`, `defaults.ts` e `level.ts`. Cada outro resultado é conferido: ou é outro
objeto que por acaso tem campo de mesmo nome (corte, por exemplo), ou é falha da raia.

### 8.2 Fim da Fase 3 — gambiarra restante

```bash
grep -rnE "planKind|areaPlanId|AREA_PLAN_TOOLS|areaPlanToolAllowed|roofHidden|planOwnsAnnotations" --include=*.ts --include=*.tsx packages apps
```

Só pode sobrar em `migrate.ts` e nos testes de migração.

## 9. Definição de pronto (fim da Fase 3)

- [ ] Verificação da 6.3 verde, mais `npm run test` completo e `npm run test:visual`.
- [ ] Ouro idêntico, exceto as duas diferenças previstas, cada uma listada e conferida.
- [ ] Buscas 8.1 e 8.2 limpas.
- [ ] `git diff --stat origin/main -- crates packages/geom` vazio.
- [ ] Projeto salvo na versão 23 abre, mostra tudo igual e salva na 24.
- [ ] Duas vistas do mesmo nível com ocultos diferentes não interferem uma na outra.
- [ ] Decisão escrita em `docs/decisoes/` e `docs/07-STATUS-V1.md` atualizado.
- [ ] Relatório final em `docs/vistas/RELATORIO.md`: o que foi feito, o que ficou de fora, diferenças de ouro
      aceitas, dúvidas em aberto.

## 10. Adendo do coordenador (decisões tomadas durante a execução; prevalecem sobre o texto acima)

### 10.1 Depois da Fase 0

1. **Planta de cobertura mostra hoje as anotações do nível** (`packages/render/src/plan/build.ts`, `noteOps` sem
   `areaPlan`). Por isso a projeção da Fase 1 devolve, para `roof`, as mesmas anotações do piso. Na migração da
   Fase 2 a regra 1 da seção 7 passa a ser:
   - nível **com** pelo menos um elemento de telhado: `pvr_<levelId>` recebe **cópia** das anotações do nível, com
     id determinístico `<idOriginal>__pvr_<levelId>`; ids de anotação presentes em `roofHidden.elements` são
     trocados pelo id da cópia;
   - nível **sem** telhado: `pvr_<levelId>` nasce com anotações vazias. Essa é uma **diferença de ouro prevista da
     Fase 2** (a planta de cobertura de um nível sem telhado deixa de repetir as anotações do piso) e só ela.
2. **Intervalo de vista da cobertura:** `DEFAULT_VIEW_RANGE` (o desenho da cobertura não usa intervalo).
3. **Nomes exportados pelo `@hestia/model`:** `planViewRangeOf` e `planViewHiddenOf` (os nomes `viewRangeOf` e
   `viewHiddenOf` já existiam com outra assinatura em `queries.ts` e `viewHiddenCommands.ts`). Os antigos
   deixam de ser usados fora de `packages/model` na Fase 1 e são removidos na Fase 2.
4. **Perfil da cobertura:** não há `ProfileLayers` próprio; o render decide por `roofPlanMode`. `viewProfileOf`
   devolve o perfil de piso para `roof`. As raias passam `kind === 'roof'` onde hoje passam `roofPlanMode`.
5. **Ferramentas na cobertura:** hoje não há restrição; a tabela mantém "todas" até a Fase 3, quando ambiente e
   separação de ambiente passam a ser bloqueados em `roof` (diferença de comportamento prevista da Fase 3).
6. A decisão 0055 está aceita pelo dono do projeto (execução autorizada sem novos aceites).

### 10.2 Depois da raia 0A (ouro)

1. **Desenho × seleção na planta de área sem anotações próprias:** hoje o desenho e o DXF herdam as anotações do
   nível, mas a seleção e a edição não as enxergam. Para a Fase 1 não mudar comportamento há duas leituras:
   `viewAnnotationsOf` (o que a vista **desenha**) e `viewOwnAnnotationsOf` (o que a vista **possui**: seleção,
   edição, exclusão, ids ocultáveis). Use a segunda onde o código antigo usava `planAnnotationsOf`/`planAnnotationIds`
   e a primeira onde usava a herança (`drawnAnnotations`). Na Fase 2 as duas ficam iguais e `viewOwnAnnotationsOf`
   é removida.
2. **Segunda diferença de ouro prevista da Fase 2:** as anotações copiadas para a planta de área (antes herdadas)
   passam a ser selecionáveis nela, e seus ids mudam para `<idOriginal>__<idDaVista>` nas saídas `lista`, `dxf`,
   `selecao` e `ocultos`. O mesmo vale para as cópias da cobertura (10.1.1).
3. **O ouro:** `npm run test:vistas-ouro` (config própria; `--gravar` regrava). Todo o conhecimento da forma do
   projeto está em `tests/vistas-ouro/adaptador.ts`: é o único arquivo do ouro que as raias podem alterar, e só
   para acompanhar mudança de assinatura, nunca para mudar o que é comparado.
4. O ouro não cobre: DXF de cobertura (não existe), cortes fora de prancha, e variações de subpavimento.

### 10.3 Insumo da raia G para a Fase 2 (assinaturas de cache)

`assinaturasDoProjeto(...).global` (`packages/engine/src/assinaturasNivel.ts`) faz hash do projeto inteiro menos
alguns campos, e **inclui `levels` com todos os dados de vista**. Consumidores: `render/src/model3d/chaveNivel3d.ts`
(malha 3D), `engine/src/sectionIncremental.ts` (corte) e a lista duplicada em `apps/web/src/ui/edicaoDeEsquadrias.ts`.
Na Fase 2, `Project.planViews` **tem de ficar fora** da assinatura global de geometria (use
`assinaturaGeometriaGlobal` de `assinaturasVista.ts`); o que depende da vista usa `assinaturaDeVista(p, viewId)`.
Sem isso, cada cota editada refaria a malha 3D e os cortes. O corte e o 3D que dependem de ocultos/gráficos próprios
continuam com as suas chaves atuais.

### 10.4 Insumos da raia B para a Fase 2 (desenho)

1. **Etiquetas de elemento na planta de área:** hoje a planta de área desenha as etiquetas (`ElementTag`) **do
   nível** além das próprias, mesmo quando tem conjunto próprio (`packages/render/src/plan/build.ts`, chamada de
   `elementTagOps` com `floorViewId`). Na migração, para o ouro sair idêntico, a vista de área recebe cópia das
   etiquetas do nível (id `<idOriginal>__<idDaVista>`) nas mesmas condições em que o código atual as desenha — o
   agente da Fase 2 lê a condição exata no código e a transcreve. Depois disso o desenho lê só a vista.
2. Pontos que ainda escrevem no nível de um projeto derivado e precisam passar a escrever na vista:
   `plan/planContext.ts` (`semAnotacoesOcultas`) e `sheet/viewports.ts` (`withSheetScale`, grava a escala em
   `level.graphics`).
3. Parâmetros opcionais `viewId` acrescentados na Fase 1 (`planViewOf` do render, `planStyleOf`, `drawnAnnotations`,
   `noteOps`, `planGeometrySelection`, `elementTagOps`) viram obrigatórios na Fase 2, e `PlanInput` passa a carregar
   `viewId` no lugar de `levelId` + `areaPlan` + `roofPlanMode`.
