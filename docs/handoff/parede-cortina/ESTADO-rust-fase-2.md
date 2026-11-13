# Parede cortina, fase 2, lado Rust e adaptador TS: estado

Branch `feat/parede-cortina-f2-rust`. Contrato `versao` 15, seções 106 a 109 (linhas extras, segmentos removidos, linhas sobrescritas, células sobrescritas), avisos 7 a 10.

## Onde está

- Rust: `crates/geom-wasm/src/cortina_remap.rs` (remapeamento: linhas, células, segmentos, regiões retangulares), `cortina_pecas.rs` (resolução: painel por região, segmentos inativos, avisos de órfã e de remoção recusada), `cortina_grade.rs` (flags de linha e de célula), `secoes_cortina.rs` (decodificação e validação das seções 106 a 109).
- Contrato: `schema/cena-v11.json`, `esquema.rs`, `packages/geom/src/kernel/v2/esquema.gerado.ts`.
- Paridade: `tests/fixtures/cortina_paridade_f2.json` (85 casos gerados pelo Rust) e `tests/cortina_paridade.rs`. Conferência com a referência TS: `HESTIA_CASOS2_REF=<casos2.json> cargo test -p geom-wasm --test cortina_paridade confere_f2` (grava as divergências em `target/divergencias_f2.txt`).
- TS: `packages/engine/src/kernelCortina.ts` (envia as sobrescritas às seções 106 a 109), `kernelCortinaTabelas.ts`, `tests/kernel-cortina.wasm.test.ts` (três testes da fase 2 no wasm real).

## Regras fixadas aqui (além do ADR)

- Remoção de segmento de borda (índice 0 ou n) vale: tira só o montante, não funde.
- Segmento inativo (sem montante) = removido ou interno a uma região fundida.
- Aparo e margem do painel só onde o segmento encostado tem montante ativo. Sem remoção, igual à fase 1.
- Linha gerada sobrescrita para fora do vão some (órfã).
- Passo 4 de §4.4: adota a célula vizinha só se o ponto está a até uma célula dela.
- Painel de região: o da célula de menor (j, i) que tenha sobrescrita.

## Divergências com a referência TS (`casos2.json`: 40 casos, 12 divergentes, 28 iguais campo a campo)

1. Códigos de aviso: a referência usa 6 (órfã de célula), 7 (órfã de linha), 8 (órfã de segmento), 9 (região não retangular). O 6 já é `arco-nao-suportado` na fase 1. O Rust usa 7, 8, 9 e 10. A referência precisa mudar, ou o contrato precisa decidir.
2. Órfã de linha: a referência põe `i` = eixo (0 U, 1 V); o Rust põe `i` = índice da linha (ou id da extra).
3. Linha extra ou gerada que sai do vão: a referência também emite `posicao-fora` (código 4); o Rust só emite a órfã.
4. Flag bit 1 (célula com sobrescrita adotada) numa região de duas células: a referência não marca a célula canônica; o Rust marca. Regra a confirmar.

As divergências da referência são só de avisos e de flags. Grade, peças, painéis e quantitativos batem nos 40 casos, exceto a flag do item 4.

## Ligação modelo → adaptador (feita)

- `packages/engine/src/cortinaSobrescritas.ts` traduz `addedLines`, `removedSegments`, `lineOverrides` e `cells` (só painel) para `sobrescritas` de cada cortina. `cortinaProjeto.ts` usa a tradução, inclui na entrada os montantes e painéis que ela referencia e entra na assinatura da cortina (e, por ela, na do nível).
- `comprimentoGravado` é o comprimento atual do eixo: o modelo não guarda o da gravação, mas já reescreve `pos` a cada mudança de L ou H.
- Avisos 7 a 10 em `cortinaIssues.ts` (pt e en): `cortina-override-orfao` (7, 8 e 9) e `cortina-celula-nao-retangular` (10).
- Desvios: linha EXTRA com `mullionTypeId: null` herda o montante do eixo (o contrato não tem "sem montante" para extra); sobrescrita de célula com abertura (fase 5) não entra; montante ou painel inexistente no projeto: a linha herda o montante, a célula sai.
- Testes: `cortinaSobrescritas.test.ts` (tradução, assinatura, avisos) e `tests/kernel-cortina-sobrescritas.wasm.test.ts` (uma linha extra, um segmento removido e um painel sólido: 26 montantes, 8 vidros, 1 sólido; vidro bruto 15,528933 m², sólido 1,375101 m²).

## Pendências

- Remap de sobrescrita por posição em mudança de topologia cobre o caso testado; o estresse com grades aleatórias não foi feito.
- "Sem montante" para linha extra: precisa de um modo na seção 106 (emenda ao contrato).
