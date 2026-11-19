# Resumo para quem vai mesclar o branch `claude/lucid-bell-hwk4ln`

Data: 2026-11-19. Não há PR aberto. O branch já contém a mescla de `origin/main` (doc 35). [V] = verificado; [I] = inferência.

## O que o branch entrega
Vãos de contorno livre (arco pleno, abatido, ogival, círculo, empena, trapézio, ferradura, polígono) em portas e janelas, furando a parede por booleana 3D em Rust (`manifold-rust`) e acompanhados pelas peças da esquadria, planta, corte, elevação, DXF, IFC, quantitativo, quadro e interface. Vão retangular e tipos sem forma geram os mesmos números de antes [V: testes de identidade]. Estado por frente em `PLANO-ESTADO.md`; limites em `FALTA-PARA-PONTA-A-PONTA.md`.

## Verificação feita
- `npm run test:rapido` (sem property e perf) e `npm run test:wasm` na árvore mesclada; resultados no fim desta página.
- `tsc` (com `NODE_OPTIONS=--max-old-space-size=8192`), `eslint` nos arquivos alterados, `check-boundaries`, `check-parity`, `check-props-density`, `check-units`, `wasm:check`.
- Rust: `cargo test --lib furo_contorno` (89 testes) e testes wasm de furo com o `.wasm` real.
- Navegador (Chromium, Playwright) no app construído como artifact: furo da parede, estilos de folha, controles do diálogo (doc 38).
- Não rodados: `test:wasm:pesado`, `test:perf`, `test:rust-processo`, testes visuais (`test:visual`), goldens; IFC em visualizador.

## Decisões minhas que precisam de confirmação do dono
1. Teto do `.wasm` em 5 MB (`scripts/verificar-wasm.mjs`); o furo soma cerca de 1,1 MB.
2. Avisos de norma ligados ao painel do projeto (`avisosCalculo.ts`): porta de 70 cm avisa vão livre < 0,80 m. Para desligar: tirar `...openingNormProjectIssues(p)`.
3. Catálogo passou de 154 para 162 tipos (8 com forma, dimensões ilustrativas); contagens de teste ajustadas (`openingCatalogo`, `catalogoAberturas`, `openingParts`, `ifcExport`).
4. Área de face da parede com vão de contorno: o retorno deixou de entrar na face (volume igual).
5. Retorno só para vão com forma; verga/soleira no retorno retangular NÃO foi dada.
6. Folha de correr recortada na posição fechada; limite de 4096 pontos por vão; veneziana de porta com aletas 12 mm além das faces.
7. Import IFC: perfil que é polígono simples vira `polygon` sem aviso; semicírculo exato vira `round` sem aviso (um teste existente foi trocado).

## Pontos de atenção na mescla
- `packages/geom/assets/geom_wasm.*` são artefatos gerados: se a `main` mudar o Rust, regenerar com `npm run build:wasm` em vez de resolver à mão.
- `crates/geom-wasm/target` não deve ir para o repositório (o teste `contratoLixo` reclama).
- Nova dependência herdada da `main`: `openskp` (em `packages/io`).
- Documentos de estudo em `docs/estudo-esquadrias/` (00 a 38) podem ser movidos ou resumidos conforme a convenção do repositório.
