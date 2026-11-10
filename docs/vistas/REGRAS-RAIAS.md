# Regras comuns a toda raia (leia antes de editar)

Você trabalha no repositório Hestia (monorepo TypeScript, npm workspaces), num git worktree e branch próprios.

## Preparação (obrigatória, nesta ordem)
1. `git checkout -B <seu-branch>` e `git reset --hard vistas/base` (o worktree pode ter nascido de um commit antigo).
2. `npm ci` na raiz do worktree. Não use symlink para o `node_modules` de outra pasta.
3. Leia `docs/vistas/PLANO-MESTRE.md` seções 2, 3, 4 e 10 (o adendo 10 prevalece sobre o resto).

## Regras
- Toque **somente** nos arquivos do seu escopo. Precisa de mudança fora dele? Pare e relate; não edite.
- Proibido: `crates/`, `packages/geom`, `SCHEMA_VERSION`, `migrate.ts` e `types.ts` (salvo se a sua instrução disser
  o contrário), `tests/vistas-ouro/ouro/**`, `tests/vistas-ouro/projetos/**`, criar pull request, fazer push, mexer em
  outros branches.
- **Não regrave o ouro.** Se `npm run test:vistas-ouro` falhar, o defeito é do seu código (salvo diferença
  explicitamente prevista na sua instrução).
- Siga o estilo do arquivo vizinho (nomes e comentários em português onde o arquivo já usa). Limite de 420 linhas
  por arquivo que não seja teste: se estourar, extraia para arquivo novo dentro do seu escopo.
- Escreva teste (vitest) para toda regra nova. Não apague nem enfraqueça teste para passar; teste que precisa mudar
  porque a montagem do estado mudou é ajustado e citado no relatório.
- Commits pequenos, mensagem em português (`refactor(vistas): ...`, `feat(vistas): ...`).

## Verificação antes de entregar (cole o resumo de cada um)
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:rapido` (cerca de 6 minutos; partida: 879 arquivos, 9661 testes passando)
4. `npm run test:vistas-ouro` (8 testes)
5. `git diff --stat vistas/base -- crates packages/geom` (tem de sair vazio)

## Relatório final (nesta ordem, factual e curto)
1. Branch, hash do último commit e arquivos alterados.
2. Saída resumida dos cinco comandos.
3. Decisões que tomou e por quê.
4. O que **não** fez ou devolveu (arquivo e motivo).
5. Dúvidas.
Não declare sucesso com qualquer comando falhando.

## Regra especial da Fase 1: assinaturas congeladas
Na Fase 1 seis raias trabalham em pastas diferentes ao mesmo tempo. Para o merge não quebrar:
- **Não mude a assinatura de nada que é usado por outra pasta/pacote** (funções exportadas, tipos de props,
  campos de contexto de ferramenta, forma do estado da interface, forma de comando existente). Pode **acrescentar**
  parâmetro ou campo opcional e função nova.
- O trabalho é trocar, dentro da sua pasta, **de onde se lê**: em vez de `level.viewRange`, `level.graphics`,
  `level.hidden`, `level.roofHidden`, `level.dimensions`, `level.texts`, `level.detailLines`, `level.detailRegions`,
  `level.tags`, `p.areaPlans`/`areaPlanOf`/`planAnnotationsOf`, use a API de `@hestia/model`:
  `planViewsOf`, `planViewOf`, `planViewsOfLevel`, `mainPlanViewOf`, `planViewRangeOf`, `viewGraphicsOf`,
  `planViewHiddenOf`, `viewAnnotationsOf` (o que a vista desenha), `viewOwnAnnotationsOf` (o que a vista possui:
  seleção/edição), `viewProfileOf`, `toolAllowedInView`, `floorViewId(levelId)`, `roofViewId(levelId)`,
  `planViewRef`, `planViewRefOf`.
- Onde você recebe `levelId` + tipo de planta (+ `areaPlanId`), converta **uma vez, na entrada**, para `viewId`
  (`floorViewId`, `roofViewId`, ou o próprio id da planta de área) e use `viewId` dali para dentro.
- Cuidado com nomes iguais em pacotes diferentes: `planViewOf` e `PlanView` também existem em
  `packages/render/src/plan/view.ts`, e `viewAnnotationsOf` em `packages/tools/src/annotationPick.ts`. Importe os
  do modelo com apelido (`import { planViewOf as vistaDoModelo } ...`) quando houver colisão.
- O comportamento não muda em nada: o ouro tem de sair idêntico.
