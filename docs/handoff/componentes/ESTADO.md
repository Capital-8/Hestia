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
