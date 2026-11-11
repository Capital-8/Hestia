# Retomada no computador local

Este arquivo diz onde o trabalho das "vistas de planta como entidade" está e como continuar fora da nuvem.
Atualize a seção "Onde estamos" a cada etapa integrada.

## Branches no GitHub
| Branch | O que é |
|---|---|
| `vistas/base` | Tronco do trabalho. Só recebe etapa revisada e com a verificação verde. É daqui que se continua. |
| `vistas/f2a-1` | Etapa 2a-1 (migração 23 → 24). Já integrada em `vistas/base`; pode ser apagado. |
| `vistas/f2a-2` | Etapa 2a-2 (vista ativa nas ferramentas). Já integrada em `vistas/base`; pode ser apagado. |
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
- **Fase 2b, Fase 3 e fechamento — não iniciadas.**

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
5. **Fase 2b + Fase 3** (seção 7 do plano e `INSUMOS-FASE-3.md`): forma única de identificar a vista
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
