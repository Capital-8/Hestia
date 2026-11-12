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
- **Raia E (etiquetas do nível na planta de área) — implementada e revisada (aprovada com ressalvas) em
  `vistas/f3-e`, NÃO integrada.** Aguarda duas coisas do usuário: aceitar a mudança do DXF das áreas de conjunto
  próprio (passam a incluir as etiquetas copiadas, +2 entidades) e regravar o ouro de `03-area-herda-anotacoes`
  (lista: some a etiqueta desenhada em duplicata) e `04-area-anotacoes-proprias` (2 DXF + 1 seleção). O auditor não
  cobre esse caso (só D1–D3): conferir o diff bruto, como feito na revisão.
- **Raia K parte 2 e fechamento — não iniciadas.** K2: `planOwnsAnnotations`, `viewOwnAnnotationsOf`, `roofHidden`,
  formas `@deprecated` de `ViewHiddenTarget`/`SheetViewSource`/`PlanInput`, alias `planViewOf`/`PlanView` do render, e
  migrar o adaptador/construtores de `tests/vistas-ouro` para `viewId` (autorizado, com os arquivos gravados byte a
  byte iguais), depois a busca 8.2.
  Decisões do usuário: E = copiar as etiquetas na migração e o desenho ler só a vista (muda o ouro da área, auditar
  antes de regravar); DXF honrar ocultos fica para depois da Fase 3; K pode editar o adaptador/construtores de
  `tests/vistas-ouro` desde que os arquivos gravados fiquem byte a byte iguais.

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
