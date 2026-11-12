# Retomada no computador local

Este arquivo diz onde o trabalho das "vistas de planta como entidade" está e como continuar fora da nuvem.
Atualize a seção "Onde estamos" a cada etapa integrada.

## Branches no GitHub
| Branch | O que é |
|---|---|
| `vistas/base` | Tronco do trabalho. Só recebe etapa revisada e com a verificação verde. É daqui que se continua. |
| `vistas/f2a-1` | Etapa 2a-1 (migração 23 → 24). Já integrada em `vistas/base`; pode ser apagado. |
| `vistas/f2a-2` | Etapa 2a-2 (vista ativa nas ferramentas). Já integrada em `vistas/base`; pode ser apagado. |
| `vistas/f2b` | Fase 2b (identificação única por viewId). Já integrada em `vistas/base`; pode ser apagado. |
| `vistas/f3-h`, `vistas/f3-i`, `vistas/f3-j` | Fase 3, raias H, I e J. Já integradas em `vistas/base` (locais; não enviadas); podem ser apagadas. |
| `vistas/plano-mestre` | Só o plano original. Pode ser apagado. |

`main` não foi tocado. Nenhum pull request foi aberto.

## Onde estamos
- **Fase 0 — concluída e integrada.** Ouro (`npm run test:vistas-ouro`), API `planView.ts`, decisão 0055.
- **Fase 1 — concluída e integrada.** Raias A, B, C, D, E, G. Verificação sobre `vistas/base`: tipos e lint sem
  erro, 884 arquivos / 9.729 testes, ouro idêntico.
- **Fase 2a-1 — concluída, revisada (ponto de controle 1) e integrada.** Esquema 24, `Project.planViews`,
  migração 23 → 24 (`packages/model/src/migrateVistas.ts`), fachadas invertidas. Verificação sobre `vistas/base`:
  tipos e lint sem erro, 886 arquivos / 9.753 testes, ouro 8 de 8. Auditoria do ouro contra o tronco anterior
  (`VISTAS_OURO_BASE=44c31a62 npm run test:vistas-ouro -- --auditar`): só D1, D2 e D3; NÃO PREVISTA = 0.
- **Fase 2a-2 — concluída, revisada e integrada.** A vista ativa chega às ferramentas e ao editor
  (`ToolEnv.viewId`, `apps/web/src/editor/vistaDoComando.ts`; exclusão, mover, copiar e etiquetas na vista ativa).
  Verificação: tipos e lint sem erro, 889 arquivos / 9.783 testes, ouro 8 de 8 sem regravar, diff de `crates` e
  `packages/geom` vazio. Revisão por um segundo Sonnet: aprovada com ressalvas (pendência 4 abaixo). O commit
  `8c31afc8` ficou com a mensagem "wip" mas está revisado.
- **Fase 2b — concluída, revisada e integrada.** Identificação única da vista por `viewId`: `OpenView`, estado da
  interface e sessão (`planViewId`; sessão antiga ainda abre), `SheetViewSource` e `ViewHiddenTarget` (`{kind:'plan',
  viewId}`, formas antigas aceitas na entrada e normalizadas, inclusive em `migrateProject`), `PlanInput` do render
  por `viewId` (`plan/planInput.ts`; forma antiga ainda aceita). Esquema continua 24, sem mudança de migração.
  Verificação: tipos e lint sem erro, 891 arquivos / 9.807 testes, ouro 8 de 8 sem regravar, diff de `crates`,
  `packages/geom` e `tests/vistas-ouro` vazio. Revisão por um segundo Sonnet: aprovada com ressalvas, os dois
  defeitos reais corrigidos (cobertura não é fonte de prancha por comando; `perimeterMode` usa `camposDeNivel`).
  Detalhes que ficam para a Fase 3: formas antigas `@deprecated` em `ViewHiddenTarget`/`SheetViewSource`/`PlanInput`
  e alias `planViewOf`/`PlanView` em `packages/render/src/index.ts` só existem porque o adaptador e os construtores
  do ouro (`tests/vistas-ouro`) ainda usam a forma antiga; `hiddenInView` (controller) segue lendo a vista de piso;
  `visibilityKeyOf` ainda usa chaves por nível; `UiState` guarda `planKind` como cache junto de `planViewId`;
  `sessaoValida` não checa se `planViewId` existe; faltam testes de prancha com viewport órfã e de v23 com prancha.
- **Fase 3, raias H, I e J — concluídas, revisadas e integradas** (merges `0d895c3f` e `bdd75c26`). Verificação no
  tronco: tipos e lint sem erro, 905 arquivos / 9.936 testes, ouro 8 de 8, diff de `crates` e `packages/geom` vazio.
  - **H** (`packages/model/src/planViewVisibility.ts`): `visibleInView` é a decisão única de visibilidade (etapas 1,
    2, 3, 5, 6 do 4.5, mais revelar/isolar) em desenho, seleção, captura, DXF e prancha. Ouro regravado em 2026-11-12,
    só 5 arquivos `*.selecao.txt` (05-ocultos e 06-faixa-e-graficos), auditados id a id (regra 1: item não visível
    deixa de ser selecionável). A prancha agora honra ocultos permanentes (commit `6de3cb50`).
  - **I**: etapa 7 (cota e etiqueta somem com o elemento oculto; cota nova só referencia o visível; cota angular e
    cota de linha de detalhe funcionam em cobertura e planta de área). O ouro atual não exercita a etapa 7: ela só
    é coberta pelos testes novos. O DXF não honra `hidden.elements`/categorias (decisão: fica fora da Fase 3).
  - **J**: planta de área aceita todas as ferramentas (`PLAN_VIEW_KINDS.area.tools = all`), exclusão de modelo na
    área, aviso de criação em categoria oculta por vista ("Mostrar categoria nesta vista" e "Desfazer").
- **Raia K, parte 1 — concluída, revisada e integrada** (merge `32680eda`). Removidos em `apps/web`, `packages/tools`
  e `planViewKinds.ts`: `AREA_PLAN_TOOLS`, `areaPlanToolAllowed`, `AREA_VIEW_TOOLS`, `areaPlanIdNow`, `UiState.planKind`
  (o tipo vem do projeto via `tipoDeVistaDeFundo(p, ui)` em `editor/vistaAtiva.ts`), `selectLevel(id, kind, areaPlanId)`;
  destino único das anotações por `viewId`. Verificação no tronco: tipos e lint sem erro, 905 arquivos / 9.935 testes,
  ouro 8 de 8. Sobrou de propósito (parte 2): `ToolEnv.areaPlanId` `@deprecated`, `CamposDaVista.planKind/areaPlanId`
  e fallback de `viewIdOfEnv`, porque `tests/vistas-ouro/adaptador.ts` os usa; formato antigo da sessão (`sessao.ts`).
  Comportamento: planta de área órfã passa a valer piso no estado.
- **Raia E (etiquetas do nível na planta de área) — concluída, revisada e integrada** (merge `9eae68bb`). A migração
  23 → 24 copia as `ElementTag` do nível para as áreas de conjunto próprio com `showAnnotations` ligado (id
  `<id>__<idDaVista>`); desenho, DXF e seleção da área leem só a vista. Efeitos aceitos pelo usuário: o DXF das áreas
  de conjunto próprio passa a incluir a etiqueta copiada (igual à tela); a lista de desenho da área herdada deixa de
  ter a etiqueta e o traço de chamada desenhados em duplicata; etiqueta nova no piso não aparece sozinha nas áreas.
  Ouro regravado em 2026-11-12 só em `03` (lista) e `04` (2 DXF + 1 seleção), diff bruto conferido. Verificação no
  tronco: tipos sem erro, 909 arquivos / 9.958 testes, ouro 8 de 8. Limite conhecido: arquivo salvo como v24 por um
  build anterior à E não ganha as cópias (o 24 não foi publicado; `main` está em 23).
- **Raia K parte 2 — implementada em `vistas/f3-k2` (no GitHub), AINDA NÃO REVISTA NEM INTEGRADA** (2026-11-12).
  Commits `6ba0e13b`, `708db828`, `3da21ad4` e mais um (remoção de `viewRangeOf`/`viewHiddenOf`). Saíram
  `planOwnsAnnotations`, `viewOwnAnnotationsOf`, formas antigas de `ViewHiddenTarget`/`SheetViewSource`/`PlanInput`,
  `ToolEnv.areaPlanId`, alias do render e `planKind` da sessão (leitura da sessão antiga isolada em
  `apps/web/src/editor/migrateSessao.ts`). Adaptador do ouro por `viewId`; ouro 8 de 8 SEM regravar. Tipos sem erro.
  Suíte completa: 3 rodadas com falhas diferentes por timeout sob carga (4 arquivos, 31 testes, passam isolados);
  nenhuma rodada completa verde ainda. Busca 8.2: restam só módulos e testes de migração (`migrateVistas`,
  `migrateSessao`, `roofHidden` ali). `planViewOf` é a consulta legítima do model.
- **ESTADO EM 2026-11-12 (fim do dia, limite de uso de 5 h atingido às ~12h45; reseta às 13h):**
  FASE 3 VALIDADA PELO USUÁRIO. `vistas/f3-k2` (K2 + gráficos/faixa por vista + correções da revisão + cobertura
  desabilitada + e2e limpos) foi integrada em `vistas/base` (merge `3278d6f3`, no GitHub). Verificação da K2: tipos ok,
  ouro 8 de 8, 21 testes v23 → v24 ok; suíte completa NÃO fecha limpa por timeout de 5 s (30 e depois 10 falhas, sem
  asserção; os mesmos arquivos passam com `--maxWorkers=4`); `test:visual` não rodou (ambiente Windows: wasm por
  `file://` e tela inicial "Projetos" que o helper `tests/e2e/helpers.mjs` não atravessa); busca 8.1 é falso positivo em
  massa (regex larga). DECISÕES ACEITAS pelo usuário (executar no fechamento): (a) `testTimeout` 15–20 s e `maxWorkers`
  ~8 em `vitest.config.ts`; (b) ajustar o helper do `test:visual` para Windows se for pouco trabalho, senão registrar
  como pendente; (c) refinar a 8.1 para `level\.(…)` e `\.areaPlans\b` e registrar no relatório. Fechamento ainda por
  fazer: aplicar (a)–(c), suíte completa sozinha, `test:visual`, `docs/vistas/RELATORIO.md`, decisão em
  `docs/decisoes/`, `docs/07-STATUS-V1.md`. Pendências para o relatório: DXF não honra ocultos; snap de linha de detalhe;
  aviso de criação oculta não cobre "etiquetar todos"/ambiente/escada/rampa; avisos da faixa por nível; Fase 4 (abaixo).
- **FASE 4, raia 0 "Cobertura como planta comum" — EM ANDAMENTO** (plano em PLANO-MESTRE, bloco "Detalhamento da Fase 4").
  Decisões do usuário: opção A (faixa editável mas ignorada pelo desenho enquanto `showRoofOnTop` ligado; render não
  muda); todas as ferramentas na cobertura; nome migrado "Cobertura: <nível>" só se idêntico ao do nível; manter todas as
  coberturas na migração; esquema v25 (migração 24 → 25). Branches (todos no GitHub, cada um em worktree em
  `.claude/worktrees/<nome>`; os worktrees só existem nesta máquina, em outra basta `git switch`):
  - `vistas/f4-0a` (de `vistas/base`): modelo + migração v25, 3 commits, `67c08ff7`. Revisada: migração sem achado
    grave; DOIS DEFEITOS MÉDIOS AINDA SEM CORREÇÃO (o agente caiu no limite): `applyLevelViewRange`
    (`packages/model/src/planViewCommands.ts` ~64-79) propaga a faixa à cobertura migrada: (1) `{direction:'up'}` grava
    'up' na `pvr_` com a flag e invalida o projeto; (2) `DEFAULT_VIEW_RANGE` da `pvr_` (topo 2,30) diverge do piso e
    faz `setLevelViewRange {cut:2.6}` lançar. Correção: a propagação do comando legado pula vistas com `showRoofOnTop`;
    testes (a) up não altera a pvr_, (b) piso top 3.0 + cut 2.6 funciona, (c) `updatePlanView` edita a faixa da
    cobertura. Efeito aceito: ordem das abas das `pvr_` vai para depois dos pisos após `upsertLevel`.
  - `vistas/f4-0b` (de f4-0a): render. COMMIT WIP `fdf6649e`, NÃO REVISADO, sem typecheck/testes: `roofPlanMode` vem de
    `showRoofOnTop === true && kind === 'floor'` (`planInput.ts`), `viewId.ts`, e `sheetCommands.ts` (fonte de prancha:
    manter a regra "cobertura não é fonte de prancha por comando" recusando vista com `showRoofOnTop`). O agente avisou
    que um `sed` estragou um arquivo e o reescreveu: REVISAR o diff inteiro. Os dois `.snap` de render apareciam
    modificados (só fim de linha, sem conteúdo): foram revertidos; se algum snapshot divergir de verdade, NÃO regravar
    sem auditoria.
  - `vistas/f4-0e` (de f4-0a): ouro/adaptador, commit `8da774b4` (adaptador, auditoria D3 e casos pela forma nova com
    `legacyRoofViewId`/`showRoofOnTop`). Faltou a prova: aplicar TEMPORARIAMENTE a troca do render e rodar
    `npm run test:vistas-ouro` (esperado 8 de 8 sem regravar); sem a troca, divergem só os 21 `roof_*.lista.txt`.
  - Ordem: corrigir 0a → integrar 0a, 0b, 0e juntas e rodar o ouro (deve voltar a 8 de 8 SEM regravar) → raia 0c
    (editor: `vistaAtiva`, `viewVisibility`, `deleteIds`, `controller`, `viewTabActions`, `viewRangeActions`,
    `migrateSessao`, `openViews`, nova `roofPlanActions.ts`; chaves `roof:<nível>` viram por vista; `sessaoValida` passa a
    checar se `planViewId` existe) → raia 0d (UI: `Properties.tsx` com a caixa "Mostrar telhado por cima", faixa
    editável com aviso, `TitleBar`, árvore `Views.tsx` com "Nova planta de cobertura…" e convite "Nenhuma. Criar…",
    i18n em 7 idiomas) → suíte completa sozinha. Typecheck só fecha depois de 0b–0d (42 erros esperados de
    `roofViewId`/`'roof'` removidos). Vistas novas usam `userViewId()` (prefixo `pvc_`).
- **Próximos passos, em ordem:** (1) retomar/corrigir 0a e integrar 0a+0b+0e; (2) 0c e 0d; (3) fechamento da Fase 3
  (decisões aceitas acima); (4) usuário testa à mão a cobertura comum; (5) PR para `main` SÓ quando o usuário pedir; sem
  release até o usuário decidir. `autoCotas.ts` tem 3 `@deprecated` de cotas, fora do escopo de vistas.
  Regravar o ouro: regra local `Bash(npm run test:vistas-ouro -- --gravar)` em `.claude/settings.local.json` (só nesta
  máquina); só regrave após auditar o diff. O stash `antes-das-vistas` é só local; não apagar.
  Decisões do usuário: E = copiar as etiquetas na migração e o desenho ler só a vista; DXF honrar ocultos fica para
  depois da Fase 3; K pode editar o adaptador/construtores de `tests/vistas-ouro` desde que os arquivos gravados
  fiquem byte a byte iguais.

### Pendências abertas pela 2a-1 (resolver na Fase 2b/3)
1. **Etiquetas de elemento do nível na planta de área.** A migração NÃO copiou as `ElementTag` do nível para a
   vista de área (desvio do item 3 de `FASE-2A.md` e de 10.4.1 do plano). O desenho da área continua lendo as
   etiquetas da planta de piso (`packages/render/src/plan/build.ts`, `elementTagOps` com `floorViewId`), e o DXF da
   área as exclui (`elementTags: false`). Copiar sem mexer no desenho duplicaria o desenho e mudaria o DXF. Fica
   para a raia de desenho da Fase 2b/3: ou a migração 23 → 24 passa a copiar e o desenho lê só a vista, ou a
   leitura cruzada é assumida como regra. Enquanto isso, "anotação pertence a uma vista só" não vale para esse caso.
2. `apps/web/src/editor/areaPlanActions.ts` (`openAreaPlan`): o ramo que semeava anotações nunca executa mais;
   remover na Fase 3 (raia K).
3. `setLevelViewRange`/`setLevelGraphics` propagam para as vistas `roof` e `area` do nível (compatibilidade); a
   Fase 3 decide quando parar.
4. Ressalvas da revisão da 2a-2 (só leem o piso; resolver na Fase 2b/3): `packages/tools/src/alignFeatures.ts` e
   `anglePreview.ts` (linhas de detalhe da cobertura não servem de referência de snap);
   `packages/engine/src/angularDimension.ts:53` (cota angular com referência `:detalhe` da cobertura ou da área
   resolve nulo e não é calculada); `packages/tools/src/dims/providers/line.ts` (cota dinâmica de linha de detalhe
   em planta de área).

## Como continuar no computador
```bash
git fetch origin
```
```bash
git checkout vistas/base
```
```bash
npm ci
```
Abra o Claude Code na pasta do repositório e peça:

> Leia `docs/vistas/RETOMADA.md`, `docs/vistas/PLANO-MESTRE.md` (inclusive a seção 10), `docs/vistas/FASE-2A.md`,
> `docs/vistas/REGRAS-RAIAS.md` e `docs/vistas/INSUMOS-FASE-3.md`. Continue como coordenador a partir de "Próximos
> passos" da retomada, usando subagentes Sonnet e Haiku.

## Próximos passos (em ordem)
1. **Terminar a 2a-1.** No branch `vistas/f2a-1`: conferir o que falta da "Etapa 2a-1" de `FASE-2A.md` contra os
   commits já feitos, concluir, e rodar a verificação:
   `npm run typecheck`, `npm run lint`, `npm run test:rapido`, `npm run test:vistas-ouro`,
   `git diff --stat vistas/base -- crates packages/geom` (vazio).
2. **Ponto de controle 1 (revisão forte, pelo modelo mais capaz).** Ler o diff de `packages/model/src/migrate*.ts`,
   `types.ts`, `planView.ts` e dos testes da migração. Conferir a tabela da auditoria do ouro
   (`tests/vistas-ouro/auditoria.ts`): só podem existir as diferenças D1, D2 e D3 de `FASE-2A.md`; "NÃO PREVISTA"
   tem de ser zero. Conferir que o ouro foi regravado **só** depois disso.
3. Integrar `vistas/f2a-1` em `vistas/base` (merge), rodar a verificação e enviar.
4. ~~Etapa 2a-2~~ (feita e integrada).
5. ~~Fase 2b~~ (feita e integrada). **Fase 3** (seção 7 do plano e `INSUMOS-FASE-3.md`): forma única de identificar a vista
   (`OpenView`, estado, `SheetViewSource`, `ViewHiddenTarget`, `PlanInput` do render por `viewId`), função única
   de visibilidade, cota e etiqueta somem com o elemento oculto, planta de área aceita todas as ferramentas com
   aviso de criação em categoria oculta, e remoção das gambiarras (`AREA_PLAN_TOOLS`, `planKind`, fachadas antigas).
   O esquema 24 ainda não foi publicado: a migração 23 → 24 pode ser estendida nessas fases em vez de criar a 25.
6. **Fechamento:** `npm run test` completo, `npm run test:visual`, buscas 8.1 e 8.2 do plano, relatório em
   `docs/vistas/RELATORIO.md`, atualizar `docs/07-STATUS-V1.md`. Só então abrir pull request para `main`.

## Avisos práticos
- Os subagentes trabalham em `git worktree`. Worktree dentro da pasta do repositório faz o `npm run lint` da raiz
  acusar erros falsos: remova os worktrees concluídos (`git worktree remove <pasta>`) antes de rodar o lint na raiz.
- Cada worktree precisa do seu próprio `npm ci` (não use symlink de `node_modules`).
- `npm run test:rapido` leva cerca de 6 minutos; um teste de desempenho (`sectionSnapIndex.test.ts`) pode falhar
  com a máquina carregada e passa isolado. No Windows, com a paralelização padrão, dois ou três arquivos estouram
  o limite de 5 s (mudam a cada rodada); use `npm run test:rapido -- --maxWorkers=4`.
- Os arquivos de `tests/vistas-ouro/ouro/` saem do git sem conversão de fim de linha (`.gitattributes`, `-text`):
  os de DXF são CRLF, os demais LF. Se o ouro falhar por linhas visualmente iguais num checkout antigo, apague a
  pasta `tests/vistas-ouro/ouro` e rode `git checkout -- tests/vistas-ouro/ouro`.
- Nunca regrave o ouro para "fazer passar". As únicas regravações previstas estão em `FASE-2A.md` e na Fase 3 do
  plano, sempre depois de auditoria.
- Fase 4 detalhada no `PLANO-MESTRE.md` (decisões de 2026-11-12); o grupo "Intervalo de vista" fica desabilitado na cobertura até a Fase 4.
