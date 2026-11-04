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

## Atualização de 2026-11-04 (modelos baratos do opencode, o orquestrador fiscaliza)
Regras e calibração: `PLANO-EXECUCAO-MODELOS.md` e `CALIBRACAO.md`. Lançador: `rodar-fila.sh <base> <N> "<ficha>|<modelo>" ...` (até N em paralelo; o modelo vai em `MODELO`). Revisão cega: fichas `T-*` (um modelo escreve testes só da especificação; o portão roda contra o código de outro).

**Integrado hoje (tudo verde: suíte combinada 669 arquivos / 7216 testes antes dos esqueletos de aninhado):** conjuntos e filas no modelo (F1) e na interface (CONJ-ui: agrupar, desagrupar, selecionar, mover e colar conjunto; botões "Criar grupo"/"Desagrupar" na aba contextual); funções de encaixe (parede, vizinho, colisão, fila) com testes cegos; composição do arrasto (F3-core); arrasto do móvel NO 3D com encaixe na parede e nos vizinhos (verificado no navegador: `wt/qa/arrasto3d.mjs`, `encaixe3d.mjs`; Alt só vale se segurado durante o arrasto); menu de contexto do componente (girar, espelhar, duplicar, tipo, agrupar); paleta "Biblioteca" com arrastar e soltar na planta e no 3D (`wt/qa/soltar.mjs`); orçamento do projeto; usinagens no 3D do editor; conectores e escolhas nas 28 famílias, painel Encaixe no editor e escolhas no painel de Propriedades; montagem de fila no motor (`montarFila`, cego 23 verdes).

**Integrado depois (noite de 2026-11-04):** montagem de fila pela interface (diálogo "Montar fila": parede selecionada, módulos, preencher o vão; botão também na aba contextual da seleção); módulo aninhado criável, editável e excluível no editor (ANIN-modelo e ANIN-ui) e conector novo com etiqueta válida; dobradiças por altura da porta em toda a biblioteca (o A80 passou de 8 para 4, regra de marcenaria); lateral compartilhada descontada na lista e no orçamento do projeto (`economia`); arrasto na PLANTA com o mesmo encaixe do 3D e uma só lógica de movimento rígido (`posarGrupoRigido`); correções de interface (z-index dos diálogos acima da alça do painel; selo "novo" removido). Verificado no navegador real: `wt/qa/{arrasto3d,encaixe3d,soltar,conjuntos,aninhado-fila,planta-encaixe}.mjs`.

Nenhuma ficha em andamento neste fechamento (worktrees `wt/fam-*` antigos podem ser apagados com `git worktree remove`).
Aviso de ambiente: executores novos às vezes sobem sem `node_modules` no worktree (a `npm ci` do `run-ficha.sh` falha em silêncio quando muitos sobem juntos): os "verdes" que eles relatam não valem; o portão do orquestrador vale. Solução rápida: junção `cmd /c mklink /J <worktree>
ode_modules <principal>
ode_modules` ou rodar o portão depois de mesclar na principal.

**Pendente (próximas ondas):** alças de largura/altura/profundidade e cotas editáveis no 3D; escolha de opção clicando no móvel no 3D; planos de referência na vista 3D; 3D que abre afastado; DXF direto; instanciar malhas iguais; Rust só depois da fatia C do kernel. Nada enviado por push.
