# Decisão 0052 — Fatia D (planta e computeSection): plano e fronteira

Data: 2026-11-03. Plano gerado por leitura do código (agente DeepSeek) e a ser revisado pelo orquestrador antes de executar; segue o molde da 0047/0050. As contagens de linhas e as estimativas de Rust vêm do agente (razão 1,48 da A1+A2); a razão medida na fatia A inteira foi ~2,6 e na B1 ~1,8, então tomar a faixa alta como mais realista. Método e tolerâncias: 0048, 0049.

**Fatia D — geometria da planta e `computeSection`** (leitura; nenhum arquivo alterado)

**1) Fecho de dependências (TS, `wc -l`, sem testes)**
- Corte (`packages/engine/src`): `section.ts` 437 · `sectionGeom` 85 · `sectionCut` 56 · `sectionOcclusion` 102 · `sectionParts` 38 · `sectionMembrane` 47 · `sectionCeilings` 67 · `sectionRoofs` 121 · `sectionStairs` 192 · `sectionRamps` 90 · `sectionSnapRings` 40 · `sectionIncremental` 68 = **1.343**.
- Apoio de planta (`packages/engine/src`): `junctionLevel` 303 · `junctionPlanar` 139 · `layerOutline` 142 · `outlineBound` 38 · `bandFuse` 69 · `profile` 168 · `planWallCuts` 15 · `openingPlan` 238 · `openingPlanNew` 398 = **1.510**.
- Geometria da planta (`packages/render/src/plan`): `build` 575 (≈350 são geometria; o resto é anotação/estilo) · `surfaces` 50 · `floors` 200 · `slabs` 113 · `ceilings` 64 · `roofs` 443 · `stairs` 430 · `ramps` 135 · `rooms` 101 · `view` 277 · `planContext` 167 · `resolucao` 52 · `symbols` 71 · `hatch` 128 · `espessura` 30 = **2.836**.
- **Total: 5.689 linhas** (≈5,4 mil efetivamente de geometria). Não contam pisos/lajes/telhados/escadas/rampas resolvidos (B/E), nem `viewClass`/`partialStructure`, que proponho ficarem no JS.

**2) Fronteira com as fatias vizinhas**
- **Lê de A:** `ResolvedLevel` (quadros, junções, grupos, itens, faixas, `cut`/`fragment`, regiões e silhueta). Reaproveita as consultas `resolver_nivel`/`cluster_resolvido`; não recalcula junção nem pintor.
- **Lê de B:** pisos, lajes, forros e `junctionLevel` (partes por camada), além de cortadores. O JS continua entregando pisos/lajes/forros já resolvidos e `wallZRange`/perfis, como em A3a/A3d.
- **Lê de E:** telhados resolvidos/pegadas e escadas/rampas resolvidas. Enquanto E não migra, o JS envia essas formas prontas (e não o esqueleto do telhado).
- **JS continua entregando:** projeto/modelo, materiais e cores, textos, temas, estilos, anotações, cotas, etiquetas, grids, seleção/hover, zoom, overlays e todo o React/three.js.
- **Proposta de encurtamento:** o JS continua calculando a classificação da vista (`cut`/`projection-above`/`projection-below`/`beyond`/`hidden`) e `outlineWalls` e as envia como argumentos, como a A2/A3 já faz com `outlineWalls`/`planOpenings`.
- **Rust propõe:** `secao_nivel(linha, depth, nivel_num, opções)` → cortes por material, silhueta, `beyond`, vãos, membranas e `snapRings`; `planta_nivel(nivel_num, corte_z, opções)` → silhuetas/regiões por material, contornos de parede, formas de piso/laje/forro/telhado/escada/rampa e símbolos de abertura em coordenadas de mundo. Cor, texto, hachura e pesos de traço ficam no JS.

**3) Sub-etapas propostas**
- **B1 — Apoio 2D e corte de reta.** `sectionGeom` (`sectionFrame`, `lineIntervals`, `rect`, `slabQuad`, `prismProjection`), `planWallCuts` e primitivas de `geo2d` existentes. Saída comparável: eixo, intervalos `t`, retângulos e trapézios. Risco: baixo (funções puras); exige `hypot`/arredondamento do V8.
- **B2 — Corte por pavimento.** Ramo de `section.ts` para paredes, pisos, lajes e forros, mais aberturas e membranas (`sectionMembrane`). Saída comparável: `SectionLevelPart` por nível (polígonos de corte, `beyond`, caixas de vão, `zMin/zMax`). Risco: médio; ordem de profundidade e `layerPartsOf`.
- **B3 — Oclusão e montagem.** `sectionCut`, `sectionOcclusion`, `sectionParts`, `sectionCeilings`, `sectionRoofs`, `sectionStairs`, `sectionRamps` e `assembleSection`. Saída comparável: `SectionResult` completo (cut, silhouette, beyond, openings, membranes, snapRings). Risco: alto; booleanas quantizadas (0048/0049), `groupBeyond` e regra de cota.
- **B4 — Planta.** `build` (só o bloco de geometria), `surfaces`, `floors`, `slabs`, `ceilings`, `roofs`, `stairs`, `ramps`, `rooms`, `view`, `planContext`, `resolucao`, `symbols`, `layerOutline`, `openingPlan`. Saída comparável: polígonos e polilinhas em coordenadas de mundo, por elemento/material/estado de vista. Risco: alto; símbolos de esquadria, ordem de pintura e detalhe por zoom.
- **B5 — Integração e sombra.** Flag `D` em `kernelFatias`, modo sombra, harness por pavimento (fixtures reais, sintéticos de 10 e 20 pavimentos, propriedades) e validação visual única do dono. Risco: médio; cache e tempo de reenvio da cena.

**4) Estimativa de linhas de Rust**
- Razão observada na A: 2,3 mil TS → 3,4 mil Rust, **≈1,48×**.
- 5.689 × 1,48 ≈ **8,4 mil linhas de Rust**; faixa **7,5–9,5 mil** (B1–B4, sem B5).
- Se o desenho da planta (render) ficar no JS e só o corte migrar, o núcleo cai para ≈2,85 mil TS → **≈4,2 mil Rust** (faixa 3,8–4,8 mil). A diferença é exatamente a decisão de fronteira sobre `packages/render/src/plan`.

**5) Riscos e pontos delicados**
- **Floats:** reproduzir `Math.hypot`, `Math.round`, ordenação e desempates do V8; `sin`/`cos`/`atan2` via `libm` do wasm (desvio medido na A1 ~1,8e-15 m).
- **Booleanas:** `polygon-clipping`/Clipper-JS versus `i_overlay` já divergem a 1 µm e 1 nm (0048/0049); o corte tem de escolher escala por operação e comparar por região, não por anéis.
- **Ordem e oclusão:** `groupBeyond` usa chave `machineNumber(depth,6)`; `cutPieces` ordena por cota, `rank` e ordem de inserção; `beyond` desempata por `layerIndex` (telhado invertido). Qualquer troca muda o desenho.
- **Manhas do TS:** `lineIntervals` par-ímpar inclusivo, `EPS_T=1e-6`, linha de comprimento zero devolve vazio, `rect` com topo inclinado, `prismProjection` por triangulação + fecho convexo.
- **Planta:** classificação da vista, `wallZRange` com anexos e `partialStructure` precisam entrar prontos ou ser portados juntos; caso contrário a D depende de B/E e de `resolve.ts`.
- **Símbolos e texto:** arcos de porta, folhas, trilhos e linhas de janela são traços, não regiões; texto, hachura e pesos de papel devem continuar no JS para não inflar o ABI.
- **Cache/invalidação:** o resultado da planta depende de nível, `cutZ`, `outlineWalls`, `planOpenings`, `partialStructure` e categorias ocultas; a chave de memo do TS (`planViewOf`) e o `LevelResolveCache` precisam ser reproduzidos ou contornados.
- **Desempenho:** a seção é O(níveis × elementos) e a planta refaz toda a geometria por edição; o harness deve reportar tempos, mas a liberação continua por equivalência e validação visual, como na 0046.

