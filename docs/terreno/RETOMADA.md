# Retomada no computador local

Estado em 2026-11-13. Leia também `docs/terreno/ESTADO.md` (tabela das fichas) e `docs/terreno/PLANO.md` (a lei: Parte A, manual do fiscal em B, fichas em D, emendas E1 e E2 no fim).

## Onde está o trabalho
- Branch única de trabalho no GitHub: `claude/happy-einstein-sgyixh`. **Nada de pull request**; o dono não pediu.
- **Mescladas e verificadas:** M1 (modelo, `SCHEMA_VERSION` 26), M2 (contrato do kernel, `versao` 19, ids 160 a 199), P1 (motor do lote), R1 (triangulação com `spade`, consultas 160 e 163).
- **Em curso: R2** (curvas de nível, planta, corte, quantidades, avisos). Um agente escreveu 1138 linhas de Rust que **compilam, mas não passaram em nenhum portão** e não foram revisadas. Estão em `docs/terreno/handoff/R2-parcial.patch`, não na branch. Para continuar a partir delas, ver "Retomar a R2".
- **Próximas:** R3, depois E1, V1, V2, V3, I1, T1, T2, U1, T3, U2, P2 a P4, P5 (condicional), G1, X1, Q1; fase 7 opcional. Ordem completa em B.4 do plano.

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

## Retomar a R2 (duas opções)
1. **Continuar do patch** (mais rápido):
   ```bash
   git worktree add ../hestia-wt/R2 -b terreno/R2 claude/happy-einstein-sgyixh
   cd ../hestia-wt/R2 && npm ci
   git apply ../../hestia/docs/terreno/handoff/R2-parcial.patch   # ajuste o caminho do patch
   ```
   Depois confira com `cargo test`, complete o Aceite da ficha R2 (Parte D do plano) e rode o portão.
2. **Refazer a ficha** a partir de D, ignorando o patch.
Ao mesclar a R2, apague `docs/terreno/handoff/R2-parcial.patch`.

## Como continuar com um assistente
Abra o Claude Code na pasta, na branch acima, e diga: "leia `docs/terreno/RETOMADA.md`, `ESTADO.md` e `PLANO.md` e continue de onde parou". O plano é o manual do fiscal: uma ficha por vez, conferir sozinho com os comandos de B.3, mesclar e enviar.

## Lições desta execução
- Rode **uma suíte por vez**: duas rodadas de vitest em paralelo já causaram uma falha espúria.
- Limite de uso do agente interrompe fichas grandes: peça `wip:` a cada marco e, na retomada, confira `git status` do worktree antes de refazer.
- Worktrees ficam em `/home/user/hestia-wt/<ficha>` e **não** vão para o GitHub; só a branch de trabalho vai.
