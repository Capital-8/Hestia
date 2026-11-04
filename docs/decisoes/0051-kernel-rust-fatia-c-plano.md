# Decisão 0051 — Fatia C (malha 3D): plano e fronteira

Data: 2026-11-03. Plano gerado por leitura do código (agente DeepSeek) e a ser revisado pelo orquestrador antes de executar; segue o molde da 0047/0050. As contagens de linhas e as estimativas de Rust vêm do agente (razão 1,48 da A1+A2); a razão medida na fatia A inteira foi ~2,6 e na B1 ~1,8, então tomar a faixa alta como mais realista. Método e tolerâncias: 0048, 0049.

**Fatia C — malha 3D (triangulação, extrusão com vãos, arestas; atualização só do elemento alterado)**

**1. Fecho de dependências (TS a portar)**
`solids` 529 · `layerTopology` 146 · `caixas3d` 176 · `arestasDaUniao3d` 127 · `silhuetaCaixas3d` 219 · `paredesInstanciadas3d` 101 ·
`aberturas3d` 219 · `openingParts` 154 · `geometriaPeca3d` 117 · `eaveSolids` 320 · `stairSolids` 339 · `rampSolids` 37 ·
`genericSolids` 64 · `roofEmendas3d` 27 · `lotesMalha3d` 101 · `cacheMalhas3d` 151 · `chaveNivel3d` 69 ·
`geom/triangulate` 20 · `polygon` 155 · `vec` 50 · `arc` 136 · `line` 40 = **3.297 linhas (~3,3 mil)**.
Não contados: `boolean.ts` 291 (união/diferença/`closeGaps` já existem em `ops.rs`), `openingModel*` (~2,7 mil; o modelo da esquadria continua no JS) e
`scene3d.ts`/`faixas3d.ts`/`lotesMalha3d` na parte de three.js, GPU, materiais e culling, que não migram.

**2. Fronteira com as fatias vizinhas**
Lê de A: `ResolvedLevel.walls`, quadros/junções, faixas pós-junção (`wallLayerBandsAfterJunction`), vãos (`aberturas_geom`) e `paredes_z`.
Lê de B: pisos, forros, lajes, telhados, `layerPartsOf(junção)`, corpos de escada/rampa e chegadas; não depende de E.
O JS continua entregando: seções tipadas já resolvidas (`paredes`, `camadas`, `faixas`, `aberturas`, `pisos`, `lajes`, `telhados`, `escadas`, `rampas`), peças da esquadria já modeladas,
ids/categorias de material, `view3d` (visibilidade, arestas, sombras) e `wallZRange`/perfis.
Proposta de interface: consultas `malha_nivel(nivel_num, opcoes)` e `malha_elementos(nivel_num, ...ids)`, devolvendo por material/categoria os arrays `posicoes/normais/indices`,
faixas de elemento, `caixas` (16 `f32` + id), `arestas` (pares) e `hash_malha` por elemento. O JS mantém three.js, instancing, materiais, sombras e picking/BVH (E), e troca só o que mudou.

**3. Sub-etapas**
**B1 — Núcleo de triangulação e extrusão.** `solids`, `layerTopology`, `geom/triangulate`, `polygon`, `vec`, `arc`, `line`.
Saída comparável: por camada/polígono, vértices/normais/índices quantizados, área, volume, contagem de triângulos e T-junctions.
Risco: escolha de diagonais do earcut, orientação dos anéis, solda de 1,5 mm, corte de slivers e normais de faces inclinadas.
**B2 — Paredes, caixas e arestas.** `paredesInstanciadas3d`, `caixas3d`, `arestasDaUniao3d`, `silhuetaCaixas3d` e `extrudeLayer`.
Saída comparável: matrizes de caixa por camada/parede, sólidos restantes, pares de arestas e `arestasPorParede`.
Risco: rejeição de camada por sobreposição (`1e-6`), limite `MAX_CAIXAS=24`, desduplicação de arestas e equivalência com `EdgesGeometry` (28°).
**B3 — Esquadrias e peças.** `aberturas3d`, `openingParts`, `geometriaPeca3d`, `lotesMalha3d`.
Saída comparável: caixas, prismas de perfil (batente em L), arestas de alizar, pivôs/dobradiça e `loteDeGeometria` por vão.
Risco: `THREE.Shape`/`ExtrudeGeometry` (perfil L), ordem dos vértices, `computeVertexNormals`, ângulo aberto e transformações do vão.
**B4 — Demais sólidos.** `buildFloorSolids`, `buildCeilingSolids`, `buildSlabSolids`, `buildRoofSolids`, `eaveSolids`, `stairSolids`, `rampSolids`, `genericSolids`, `roofEmendas3d`.
Saída comparável: lotes por elemento/material, área e volume por camada, planos inclinados, beirais, degraus e emendas de água.
Risco: `layerPartsOf`, caimentos (`slabRiseAt`/`planeZ`), recorte de beiral por meia-reta, união de corpos de escada e arestas de telhado.
**B5 — Cache e atualização incremental.** `cacheMalhas3d`, `chaveNivel3d` e o despacho de `atualizarAberturas` (a parte de three fica no JS).
Saída comparável: `hash_malha`/chave por elemento e por nível, troca apenas dos elementos alterados, contagem de triângulos/bytes e ausência de malha velha.
Risco: a chave precisa cobrir vizinhos por cota, telhados anexados e ocultos/revelados; prova de independência de piso/laje; estado do cache após remoção.

**4. Estimativa de linhas de Rust**
Razão observada na A: 3,4/2,3 ≈ **1,48**. Aplicada a 3,3 mil linhas de TS: **~4,9 mil linhas**. Faixa proposta: **4,5–5,5 mil**, acrescentando o porte/substituição do earcut,
a validação de entrada, a codificação tipada e os testes. Sem as booleanas (já em `ops.rs`), o núcleo geométrico deve ficar perto de 4,3–4,8 mil.

**5. Riscos e pontos delicados**
Floats: quantizar antes de virar `f32`; reproduzir `Math.hypot`, `Math.round` e `libm` (como na A1); nunca comparar texto de vértices.
Ordem: união/diferença, ordem dos anéis, ordem dos lotes e faixas de elemento precisam ser determinísticas; `i_overlay` x Clipper diverge como na 0048/0049.
Triangulação: o earcut do TS e o port podem escolher diagonais diferentes; comparar área/volume/topologia, não a lista de triângulos.
Manhas do TS: `weldBands` (1,5 mm), T-junctions com orçamento, slivers, `MAX_CAIXAS`, rejeição de caixas por folga, `EdgesGeometry` e `ExtrudeGeometry` são casos a reproduzir primeiro e corrigir depois, separados.
Incremental: o Rust é cache; toda malha deve poder ser refeita da cena. Chave/visibilidade erradas deixam elemento velho na tela, então B5 exige teste de edição de parede, abertura, piso/laje e telhado.
Segurança: nenhuma entrada do usuário pode gerar `panic`; NaN, polígono degenerado e overflow de índice viram `ENTRADA`/`LIMITE`.
