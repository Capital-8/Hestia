# Retomada da frente parede-formas (gravado em 2026-11-15)

## Onde está tudo
- Clone ext4: `~/hestia-integ` (usado também por OUTRA sessão: não mexer; a branch dela é `frente/ifc-import-rapido`).
- Branch de trabalho: `frente/parede-formas`, no worktree isolado `~/hestia-wt/frente` (node_modules instalado). Worktrees dos executores: `~/hestia-wt/fj` (branch pf/fj) e `~/hestia-wt/ft` (pf/ft). Nada foi enviado ao GitHub (sem push, sem PR).
- Ambiente: `. ~/hestia-tools/env.sh` (node 26, cargo, git portátil). Máquina: 7,7 GB de RAM.
- Guarda de recursos (OBRIGATÓRIA): `~/hestia-tools/pesado.sh <cmd>` (fila, RAM livre ≥ 2,5 GB, aborta com código 99), `pvitest.sh` (vitest com 2 processos), `prapido.sh` (test:rapido), `medidor.sh` (estado), `limpar.sh` (previews esquecidos), `mesclar.sh <branch>` (mescla segura: só resolve ESTADO.md; para se houver conflito em código). Regras dos executores: `~/hestia-tools/REGRAS-EXECUTOR.md`. NUNCA `pkill -f`, NUNCA `npx vitest` direto, no máximo 2 executores em paralelo, modelos só haiku/sonnet (nunca Fable/Opus sem OK do dono).
- Memória do Claude: `~/.claude/projects/-run-media-dennylson-HD-1TB-Projetos-GitHub-Hestia/memory/`.

## Feito e mesclado em frente/parede-formas
Fase 1 (formas na Parede, galeria Desenhar compartilhada com o perímetro), Fase 2 (parede inclinada: F2.1 a F2.12, etapas A a W, R), junções exatas em arco (J1 a J5), nó de 3+ paredes (S5/N1), junção por par (D2), desempenho (D4: projeto principal 4,4 s → 1,5 s a frio), captura de FACE SUPERIOR (T-A a T-E: snap, Alinhar, escolher face e por perímetro), porta/janela inclinadas por padrão (P1).

## ATENÇÃO: lint com 1 erro (corrigir logo após mesclar D3/D1)
`packages/engine/src/wallTiltJoinLevel.ts`: `max-lines` 429 > 420 (acúmulo de N1 + D2 + D4). Solução: extrair funções puras (ex.: `alinhar`/`alinharNivel`/helpers do plano B) para um arquivo novo, SEM mudar comportamento; só depois da D3/D1 (que edita o mesmo arquivo). T-F já mesclada (7cac82da): vale só para PISO e LAJE (forro e telhado não têm `OutlineSource`).

## Em andamento quando o dono desligou (confira `git log` e `git status` nos dois worktrees)
- (T-F já concluída e mesclada.)
- **D3/D1** em `~/hestia-wt/fj` (pf/fj): 4 pares do fuzz com fresta e a camada de tinta de 2 mm (2 a 3 mm nas esquinas; já existia com tilt 0).
Se um agente caiu: o trabalho está em commits `wip` no worktree; retome com SendMessage ao agente (ids no transcript) ou abra um novo executor que leia o worktree e continue.

## Falta fazer (ordem)
1. Mesclar T-F e D3/D1 (`~/hestia-tools/mesclar.sh pf/ft`, depois `pf/fj`; resolver à mão qualquer conflito em código).
2. D1 de desempenho de TELA: medir no navegador o tempo de DESENHAR corte e elevação (cálculo já é rápido; desenho 130 a 650 ms; meta instantâneo), vale também para parede vertical.
3. Portão final: `~/hestia-tools/prapido.sh` (suíte completa), `npm run build`, teste de navegador `tests/e2e/parede-inclinada.mjs` (P1 a P7) e os 5 projetos de `~/Documents/Projetos` (teste `projetosDoDono.test.ts`), typecheck/lint/check:ribbon-i18n.
4. Subir o app: `cd ~/hestia-wt/frente && npm run build && npx vite preview --host 127.0.0.1 --port 4174 --outDir apps/web/dist --config apps/web/vite.config.ts` e passar o roteiro de teste ao dono.
5. Dívidas registradas: nó com ARCO inclinado (só retas); planta/corte/IFC com `nodes` da N1; transição por extremidade (ação C do degrau); padrão do plano da abertura no TIPO; z do topo no telhado; porte do tilt para o Rust (D2 antigo); filete de parede; cunha sobrepõe faixa fina na base.
6. Só depois: fases 4 (laje livre) e 5 (massa v2) da METODOLOGIA.md; o PR da integração massa+suplementos e desta frente para o `main` (decisão e confirmação do dono).

## Defeitos do dono já atendidos (para conferir ao testar)
Junção em toda a altura; inclinação visível sem criar vizinha; inclinada×vertical; porta/janela inclinadas; campo Inclinação ao criar a Parede; telhado/forro alinhados à face superior; junção de paredes curvas inclinadas (projeto "Projeto sem título": 13 paredes, 5 arcos).
