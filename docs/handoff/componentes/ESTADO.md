# Estado — Componentes e editor de famílias (atualizado 2026-11-02)

Worktree: `wt/componentes-adr`, branch `feat/familias-interface`. NADA foi enviado por push.

## Pronto e integrado (tsc, units, boundaries verdes; testes de model e engine/componentes verdes)
- E1–E7: modelo de família, fórmulas, motor, biblioteca de 30 famílias, editor (UI), 3D, lista de peças/corte/custo/DXF,
  usinagens (E5-ui), catálogo (E6-ui), galeria Novo/abrir/salvar/Meus modelos (E7-ui).
- E8-render (3D e planta desenham componentes) e E8-tools (selecionar, mover, copiar/colar, ferramenta `component`, excluir): integrados em 2026-11-03.
- E8-motor: `engine/src/componentes/instancia.ts` (malha, pegada, caixa da instância).
- E8 modelo do projeto: elemento `component`, SCHEMA 24, comandos.

## Falta (ordem)
1. E8-web (botão Componente, propriedades, "Carregar no projeto"), E8-io (DXF planta, IFC IfcFurniture). Fichas ainda a escrever.
3. E9 Rust (depende da fatia C), verificação final (suíte completa, lint, build), conferência visual no navegador, relatório.

## Retomar
`cd wt/componentes-adr`; dev: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`.
Método: flash executa ficha, eu rodo `gate.mjs` e reviso o diff antes de `git merge`.
Avisos de eslint (OpeningFlipGrips, sectionEditTools) já existiam; não são desta feature.

## Atualização de 2026-11-03 (noite)
- E8 inteira integrada (render, tools, web-a, web-b, io). Servidor de teste: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`.
- QA com 4 testadores flash (app e motor): `docs/handoff/componentes/QA-2026-11-03.md`. Defeitos graves corrigidos por mim; pendências na ficha `fichas/CORR-1.md` (lançada no flash: `rodar-fichas.sh feat/familias-interface CORR-1`; se o executor travar, reler o worktree `wt/fam-CORR-1`, rodar `gate.mjs` e integrar).
- Testadores: `wt/qa/` (fora do repositório): `ajuda.mjs`, `REGRAS-QA.md`, `fichas/Q1..Q4`. Rodar com `opencode run ... --dir wt` (o opencode recusa ler fora do diretório de trabalho).
- Próximo passo grande: `PLANO-MODELAGEM-FLUIDA.md` (conectores, filas, encaixe, arrastar no 3D, escolhas internas). Começa na F1, depois de integrar a CORR-1.

## Fechamento de 2026-11-03 (estável para retomar amanhã)
Branch `feat/familias-interface` está estável: tsc, units e boundaries verdes; model + engine/componentes (1345) e apps/web (1780) verdes. Nada enviado por push.

**Integrado hoje:** E8 completa, QA (4 testadores), correções do QA, CORR-1 (avisos e validações na interface), contrato da modelagem fluida (esquema 25: `Familia.conectores/escolhas`, `Project.componentGroups`, `Component.groupId`; esqueletos do encaixe em `packages/engine/src/componentes/encaixe*.ts`, que ainda lançam "não implementado").

**Fichas lançadas no flash e NÃO integradas** (cada uma tem worktree `wt/fam-<id>`, branch `feat/fam-<id>`; se o computador foi desligado, o executor morreu e o trabalho parcial está no worktree sem commit):
`F1-modelo` (comandos de conjunto/fila), `F2-parede`, `F2-vizinho`, `F2-colisao`, `F2-fila` (funções de encaixe), `ESC-modelo` (validação e edição de conectores/escolhas), `ORC` (orçamento do projeto), `USIN3D` (usinagens no 3D), `CORR-2` (peça vazia, contorno, módulo aninhado, aviso do plano de corte).
Retomada de cada uma: `cd wt/componentes-adr; bash docs/handoff/componentes/run-ficha.sh <id> feat/familias-interface` (reusa o worktree e continua do que já está lá; rodar vários em paralelo com `nohup ... &`). Quando terminar: `node docs/handoff/componentes/gate.mjs --dir ../fam-<id> --base feat/familias-interface --allow "<arquivos da ficha>" --tests "<testes>"`, revisar o diff e `git merge --no-edit feat/fam-<id>`. Os worktrees dessas fichas partem de `f790be00`; falta neles o commit `a4da863f` (contrato de `posarArrastado`/`encaixeProjeto`), que o merge traz sem conflito.

**Ordem de integração sugerida:** F2-* (independentes), F1-modelo, ESC-modelo, ORC, USIN3D, CORR-2.

**Depois (ainda sem ficha):** F3-core (engine: `posarArrastado`, `facesDasParedes`, `corposDoNivel`, `caixaLocalDoComponente`; depende das F2 integradas), F3-arrasto3d (ganchos no `ViewportCanvas.tsx`: arrastar componente no 3D com encaixe, uma entrada de desfazer por gesto, Alt desliga o encaixe, Esc cancela), alças/cotas editáveis no 3D, biblioteca lateral arrastável, painéis de edição de conectores/escolhas no editor, escolha por clique no 3D (F4), cozinha em linha/canto em L (F5). Plano completo em `PLANO-MODELAGEM-FLUIDA.md`.

**Testadores (QA):** `wt/qa/` (fora do repositório): `ajuda.mjs`, `REGRAS-QA.md`, `fichas/Q1..Q4`; rodar com `opencode run ... --dir wt` (o opencode recusa ler fora do diretório de trabalho). Servidor: `cd apps/web && npx vite --port 5199 --host 127.0.0.1`.
