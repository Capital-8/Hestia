# Decisão 0053 — Fatia E (picking, telhado, quantitativos, validações e exportações): plano e fronteira

Data: 2026-11-03. Plano gerado por leitura do código (agente DeepSeek) e a ser revisado pelo orquestrador antes de executar; segue o molde da 0047/0050. As contagens de linhas e as estimativas de Rust vêm do agente (razão 1,48 da A1+A2); a razão medida na fatia A inteira foi ~2,6 e na B1 ~1,8, então tomar a faixa alta como mais realista. Método e tolerâncias: 0048, 0049.

Fatia E (BVH de picking, esqueleto do telhado, quantitativos, validações, exportações) — plano no molde da 0047. Leitura apenas; nada foi alterado.

## 1 — Fecho de dependências (TS em `packages/*/src`, sem testes)
- **E1 BVH de picking — 1.300 linhas**: `triBvh` 310 · `pick3d` 316 · `selecaoPorCaixa3d` 289 · `indiceDeElementos3d` 111 · `caixas3d` 176 · `caixasDoNivel3d` 98. (`pickIdBuffer3d` 464 fica no JS: leitura GPU/WebGL, não é BVH.)
- **E2 Esqueleto do telhado — 2.152**: `skeleton` 71 · `skeletonCore` 116 · `skeletonEvents` 75 · `skeletonFaces` 107 · `skeletonRun` 201 · `skeletonSetup` 156 · `skeletonContinuity` 73 · `roofSkeleton` 152 · `roofShapes` 94 · `roofGeom` 147 · `roofEnvelope` 100 · `roofExtrusion` 231 · `roofMansard` 49 · `roofJoin` 113 · `roofArcs` 52 · `roofLines` 75 · `roofs` 157 · `roofWall` 183.
- **E3 Quantitativos — 1.420**: `quantities` 97 · `floorQuantities` 134 · `slabQuantities` 138 · `ceilingQuantities` 82 · `roofQuantities` 211 · `stairQuantities` 135 · `rampQuantities` 91 · `genericQuantities` 95 · `junctionNet` 437.
- **E4 Validações — 3.191**: `validate` 319 · `validateFloors` 114 · `validateJoins` 254 · `validateRamps` 29 · `validateRoofs` 176 · `validateRooms` 44 · `validateSlabs` 195 · `validateStairs` 35 · `validateRoofMansard` 74 · `wallOverlap` 72 · `projectIssues` 216 · `outlineIssues` 65 · `openingChecks` 115 · `stairChecks` 271 · `stairIssues` 392 · `rampIssues` 172 · `roofEaveIssues` 165 · `roofSurfaceIssues` 33 · `roofWallIssues` 53 · `wallFloorIssues` 52 · `ceilingIssues` 63 · `viewWarnings` 59 · `viewClass` 223 (compartilhado com D).
- **E5 Exportações e tabelas — 5.940**: `schedule` 157 · `floorSchedule` 152 · `slabSchedule` 128 · `roofSchedule` 173 · `ceilingSchedule` 124 · `openingSchedule` 356 · `roomSchedule` 163 · `stairSchedule` 133 · `rampSchedule` 130 · `scheduleCsv` 11 · `csv` 14 · `dxf` 520 · `dxfDoc` 516 · `dxfGeneric` 40 · `dxfCheck` 177 · `dxfSection` 184 · `dxfNotes` 155 · `dxfSectionMarks` 37 · `dxfSectionNotes` 65 · `ifcCtx` 59 · `ifcElements` 355 · `ifcExport` 500 · `ifcExterior` 81 · `ifcGeneric` 108 · `ifcGrids` 104 · `ifcGuid` 30 · `ifcHestia` 217 · `ifcProperties` 36 · `ifcQuantities` 169 · `ifcSolids` 218 · `ifcSpaces` 129 · `ifcStep` 89 · `ifcStyles` 92 · `ifcTypes` 140 · `pdf/helvetica` 64 · `pdf/pdfWriter` 58 · `pdf/sheetsPdf` 69 · `pdf/types` 55 · `zip` 132.
- **Total do fecho: 14.003 linhas de TS.** Fora: importadores (`dxfImport` 620, `io/src/ifcImport/*`) e a escrita GPU.

## 2 — Fronteira com as fatias vizinhas
- **Lê de A**: `ResolvedLevel` (quadros, camadas, faixas, aberturas, membranas, perfis, regiões/silhueta). **De B**: pisos, lajes e forros resolvidos, cortadores e junção entre pavimentos. **De C**: buffers de posição/índice triangulados e sólidos. **De D**: geometria de planta/corte e `computeSection` para DXF/IFC. Do modelo: `Project`, ids, tipos, materiais e unidades.
- **Regra**: E consome o já resolvido por A/B/C/D; não re-resolve paredes, pisos ou malhas. `sheet/vista3d.ts` (oclusão por BVH) consome a consulta de raio e fica na exportação de pranchas.
- **JS continua entregando**: three.js (cena, câmera, `Ray`), leitura GPU de ids, buffers no espaço local; `Project` como fonte da verdade; comandos/UI/React; mensagens e i18n, formatação de números, escrita STEP/DXF/PDF/CSV e download/ZIP. O Rust devolve código + ids + números.
- **Interface proposta**: consultas por fatia (`bvh_construir`, `bvh_raio`, `bvh_caixa`, `esqueleto_telhado`, `quantitativos_nivel`, `validar_projeto`, `tabela_*`, `exportar_ifc_geometria`) e seções novas (`malhas`, `telhados`, `telhado_arestas`, `cortadores`, `genericos`, `objetos_exportacao`). Saídas em arrays tipados, ordem determinística. `cena-vN.json` sobe a cada sub-etapa (v8→v12), renomeando como na A.

## 3 — Sub-etapas propostas (molde A1–A4)
- **E1 — BVH de picking.** Módulos: `triBvh`, `pick3d`, `caixas3d`, `caixasDoNivel3d`, `selecaoPorCaixa3d`, `indiceDeElementos3d`. Comparável: `order`/`bounds`/`left`/`right`/`first`/`count`, stats, hit (face, distância, ponto) e ids da caixa. Risco: médio (empates de mediana/eixo, ordem da pilha, eps do Möller–Trumbore, `side`, Float32 do three.js).
- **E2 — Esqueleto do telhado.** Módulos: `skeleton*`, `roofSkeleton`, `roofShapes`, `roofGeom`, `roofEnvelope`, `roofExtrusion`, `roofMansard`, `roofJoin`, `roofArcs`, `roofLines`, `roofs`, `roofWall`. Comparável: faces (anel/aresta/polígono/z), arcos, degraus, planos e falhas, a 1 µm. Risco: alto (ordem de varredura dos eventos, tolerâncias 1e-12..1e-7, colinearidade, fallback da envoltória, furos desligados).
- **E3 — Quantitativos.** Módulos: `quantities`, `*Quantities`, `junctionNet`. Comparável: área/volume por camada e material, contagens e totais a 1e-6 m²/m³, ordem por id. Risco: alto (ordem de soma, integral por triângulos, prioridade/junção, membrana, perfis inclinados).
- **E4 — Validações.** Módulos: `validate*`, `projectIssues`, `*Issues`, `openingChecks`, `viewWarnings`, `viewClass`. Comparável: conjunto (código, severidade, ids) idêntico e ordem determinística; só o texto fica no JS. Risco: alto (EPS de 1 mm e 1°, dedup, memos, ordem de varredura).
- **E5 — Exportações e tabelas.** Módulos: `schedule*`/`csv`, `dxf*`, `ifc*`, `pdf/*`, `zip`. Comparável: linhas de tabela, entidades DXF, entidades/GUIDs/quantidades IFC e bytes de PDF/ZIP. Risco: alto (formatação numérica, GUID determinístico, contadores STEP, ordem de escrita, CRLF, timestamp). Sugiro E5a tabelas/CSV, E5b DXF, E5c IFC, E5d PDF/ZIP.

## 4 — Estimativa de Rust
- Razão da A: 3.400/2.300 ≈ 1,48. Aplicada ao fecho: 14.003 × 1,48 ≈ **20,7 mil linhas**; faixa **19–24 mil** (1,36–1,71).
- Se a E5 só portar geometria/medição e deixar STEP/DXF/PDF/CSV no JS (≈5,9 mil TS de serialização), o núcleo cai para ≈8,1 mil TS e a faixa realista fica **11–14 mil Rust**. Recomendo essa leitura; a primeira é o teto.

## 5 — Riscos e pontos delicados
- **Floats**: f64 no wasm; replicar `hipot`, `arredonda_js` e `libm` (já na A1); quantitativos usam `hypot`, `atan` e `cos`; telhado usa `hypot`/`atan`. Não reordenar somas.
- **Ordem**: BVH preserva empates de mediana/eixo; o esqueleto escolhe o primeiro evento com `t < melhor - 1e-12` na ordem de varredura; saídas por id crescente/ordem do esquema.
- **Manhas do TS**: `-0` vs `+0`, `Number.isFinite`, ids duplicados, `Object.values` (ordem de inserção), mensagens de falha (viram códigos + pontos), `HOLES_IN_SKELETON=false`, pesos uniformes da mansarda.
- **Picking**: geometria three.js é Float32; converter para f64 muda `t`/ponto; comparar a 1 µm ou manter Float32 na fronteira. `pickIdBuffer3d` (GPU/MRT) não migra.
- **Exportação/validação**: determinismo (timestamp fixo, GUID, iteração de mapas), `num`/`ifcGuid`, escape STEP, unidades e fim de linha. Comparar conjuntos e números, não texto; mensagem e formatação continuam no JS.
