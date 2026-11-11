# Parede cortina, fase 1, lado Rust: estado (2026-11-11)

Branch `feat/parede-cortina-rust`. Contrato `versao` 14, seções 100 a 105, consultas 100, 101, 102, 104 e 105 (a 103 e o corte ficam para a fase 6).

## Onde está

- Rust (`crates/geom-wasm/src`): `secoes_cortina.rs` (decodificação), `cortina_tipos.rs` (constantes), `cortina_grade.rs` (linhas, fusão da sobra, eixo efetivo, consulta 100),
  `cortina_pecas.rs` (resolução única: montantes, painéis, avisos; `tabela_pecas` para a paridade), `cortina_malha.rs` (101), `cortina_planta.rs` (102),
  `cortina_quant.rs` (104), `cortina_avisos.rs` (105).
- Contrato: `schema/cena-v11.json` (fonte), `esquema.rs`, `packages/geom/src/kernel/v2/esquema.gerado.ts` (gerado por `node scripts/gerar-esquema-kernel.mjs`).
- Paridade: `crates/geom-wasm/tests/fixtures/cortina_paridade.json` (250 casos, formato `CortinaEntrada`/`SaidaConsulta` da referência TS). Regravar com
  `HESTIA_GERAR_FIXTURES=1 cargo test -p geom-wasm --test cortina_paridade`. Conferir a referência com
  `HESTIA_CASOS_REF=<cortinaRef/casos.json> cargo test -p geom-wasm --test cortina_paridade confere`.
- TS: `packages/engine/src/kernelCortina*.ts` (adaptador, não ligado ao render) e `tests/kernel-cortina.wasm.test.ts` (wasm real + fixture).

## Decisões fixadas (dono e referência)

Sobra fundida (0,05) e célula mínima (0,15) configuráveis (`resto_minimo` por eixo, `celula_minima` por tipo). Fusão de células só retangular (fase 2).
Montante de borda EMBUTIDO em [0, L] x [0, H]. Manual aceita fora de ordem e duplicada, ordena e solda, e NUNCA funde a sobra. `round` usa profundidade = largura.
Cortina fora da seção 1 de paredes.

## O que falta (outras frentes)

Integração no 3D, planta, UI e `kernelA1.ts` (exclusão da cortina da seção 1); fases 2 em diante.
