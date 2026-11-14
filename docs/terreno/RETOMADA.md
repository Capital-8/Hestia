# Retomada no computador local

Estado em 2026-11-13. Leia também `docs/terreno/ESTADO.md` (tabela das fichas) e `docs/terreno/PLANO.md` (a lei: Parte A, manual do fiscal em B, fichas em D, emendas E1 e E2 no fim).

## Onde está o trabalho
- Branch única de trabalho no GitHub: `claude/happy-einstein-sgyixh`. **Nada de pull request**; o dono não pediu.
- **Mescladas e verificadas:** M1 (modelo, `SCHEMA_VERSION` 26), M2 (contrato do kernel, `versao` 19, ids 160 a 199), P1 (motor do lote), R1 (triangulação com `spade`, consultas 160 e 163), R2 (consultas 161, 162, 164, 165, 168).
- **R2 mesclada** (curvas de nível, planta, corte, quantidades, avisos). O patch parcial foi removido.
- **Próxima: R3** (regiões, superfície proposta, corte e aterro), depois E1, V1, V2, V3, I1, T1, T2, U1, T3, U2, P2 a P4, P5 (condicional), G1, X1, Q1; fase 7 opcional. Ordem completa em B.4 do plano.

## Decisão do dono que continua aberta
**Sinal do norte verdadeiro** (ESTADO, "Pendências"). O plano diz direção = azimute − norte; o texto de `Localizacao.norteVerdadeiro` sugere azimute + norte. Resolver antes da ficha P3 (sinal em `rumosParaPoligono` e `poligonoParaRumos`, `packages/engine/src/loteRumos.ts`, e no teste `rumos_com_norte_verdadeiro`).

## Preparar a máquina
```bash
git clone https://github.com/engdennylsonsantos-cloud/hestia.git
cd hestia
git checkout claude/happy-einstein-sgyixh
npm ci
rustup toolchain install 1.97.1 --profile minimal --target wasm32-unknown-unknown --component clippy
```
O `rust-toolchain.toml` já fixa 1.97.1; o componente `clippy` não vem junto e precisa ser instalado, senão `cargo clippy` falha.

Linha de base (2026-11-13): typecheck ✔, lint ✔ (8 avisos antigos), `test:rapido` 980 arquivos / 11441 testes, `cargo test -p geom-wasm` 510, **clippy já falha na base com 39 avisos** (portão: total não sobe de 39 e arquivo novo da frente não tem nenhum; emenda E1), `test:wasm` 55 arquivos / 1339. Em Windows o contrato de lixo pede `CARGO_TARGET_DIR` fora do repositório (ex.: `E:\hestia-target-terreno`).

## Como continuar com um assistente
Abra o Claude Code na pasta, na branch acima, e diga: "leia `docs/terreno/RETOMADA.md`, `ESTADO.md` e `PLANO.md` e continue de onde parou". O plano é o manual do fiscal: uma ficha por vez, conferir sozinho com os comandos de B.3, mesclar e enviar.

## Lições desta execução
- Rode **uma suíte por vez**: duas rodadas de vitest em paralelo já causaram uma falha espúria.
- Limite de uso do agente interrompe fichas grandes: peça `wip:` a cada marco e, na retomada, confira `git status` do worktree antes de refazer.
- Worktrees ficam em `/home/user/hestia-wt/<ficha>` e **não** vão para o GitHub; só a branch de trabalho vai.
