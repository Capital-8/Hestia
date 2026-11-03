# Decisão 0050 — Fatia B (pisos, lajes, contornos, cortadores e junção entre pavimentos): plano e fronteira

Data: 2026-11-03. Plano gerado por leitura do código (agente DeepSeek) e revisado pelo orquestrador; segue o molde da 0047.
A fatia A foi validada visualmente pelo dono em 2026-11-03 ("parece estar ok"); o padrão continua TypeScript (ligar por padrão é decisão
separada). Método: testes do passo em cada sub-etapa; mutação, suíte completa e binário commitado no fim da fatia; tolerâncias pelas
decisões 0048 e 0049.


**1. Fecho de dependências (TS a portar, `packages/engine/src`)**

| módulo | linhas | papel na fatia |
|---|---:|---|
| `junctionNet.ts` | 437 | cortadores por camada, `levelCutterSet`, peças externas (entre pavimentos), volumes |
| `junctionLevel.ts` | 303 | `junctionLevel`/`JunctionLevel`, partes por camada, faixas de parede |
| `wallAttach.ts` | 205 | `attachSpans`, `facesAt`, `axisTrechos`, cobertura por piso/laje |
| `terminoBlock.ts` | 148 | zonas bloqueadas por parede, `regionMinusWalls`/`regionPlusWalls`, adjacência |
| `layerOutline.ts` | 142 | `layerOutlines` (contorno por camada) e `memoCut` |
| `junctionPlanar.ts` | 139 | `winsOver`, `resolveJunction`, `zOverlaps` (o `layerCoreFlags` já é `marcas_de_nucleo` em Rust) |
| `slabs.ts` | 126 | `resolveSlabs`, camadas/cotas/membrana, laje inclinada |
| `floors.ts` | 120 | `resolveFloors`, camadas/cotas/membrana, furo de escada |
| `wallZ.ts` | 88 | `wallZRange` e `stepProfile` (parte de pisos/lajes; telhado fica em E) |
| `profile.ts` | 8 | só `bandTopAt` (o resto já é A3d) |

Total portado: **1.716 linhas de TS ≈ 1,7 mil**. Acoplamentos que **não** entram no porte: `enclosed.ts` 188 + `outlineBound.ts` 38 (contorno vinculado, é da fatia D); `stairOpenings.ts` 135 + `levelOpenings.ts` 21 (furos de escada/rampa); `junctionIndex.ts` 81 + `cutterCache.ts` 123 + `attachTargets.ts` 23 (índices/caches, substituídos pelo estado/cache do kernel). Com eles o total seria ≈2,1 mil.

**2. Fronteira com as fatias vizinhas**
- **De A:** `ResolvedWall`/`ResolvedLevel` (a/b/u/n/length, `baseZ`/`height`, `nominalZ0/Z1`, camadas e faixas, `core`/`priority`), `levelFrames`/`frameOfWall`, `openingGeometry`/`openingType` (porta que chega ao piso na zona de término), `layerCoreFlags`; booleanas de `ops.rs`.
- **De D:** `enclosedRooms`/`outerPerimeter`/`roomAt` para piso/laje vinculados. Proposta: o JS envia, por elemento vinculado, os circuitos `finish` e `core` já fechados (e `problem`) em `contornos_vinculados`/`pisos_contorno`/`lajes_contorno`; Rust não porta `enclosed.ts`. Alternativa: portar `enclosed.ts` junto (acopla B a D).
- **De E:** `resolveAllRoofs`/`roofWallProfile`. Proposta: o JS envia o perfil de topo do telhado por parede (`paredes_telhado`) e o Rust porta só `attachSpans`/`stepProfile`; o branch de telhado de `wallZRange` fica no JS.
- **De escadas/rampas:** furos já calculados, por nível e cota de face inferior (`furos_nivel`); escadas não migram nesta fase.
- **Para C/D/E:** consultas `pisos_do_nivel`, `lajes_do_nivel`, `juncao_nivel`, `anexos_do_nivel` (e `wallZRange`), para planta, corte, 3D e quantitativos consumirem a mesma fonte. Em B5 o Rust passa a preencher `paredes_z`/`perfis_z` que hoje o JS envia para A; até lá a interface de A não muda.
- **Esquema:** sobe a versão; seções `pisos`, `lajes`, `tipos_piso`/`tipos_laje`, `camadas_piso`/`camadas_laje`, `paredes_anexo` (`attach_base`/`attach_topo`/`nivel_topo`), `furos_nivel`, `paredes_telhado` e `contornos_vinculados`; saídas em arrays tipados (ids, índices, anéis).

**3. Sub-etapas**
- **B1 — Pisos e lajes.** Módulos: `floors.ts`, `slabs.ts`, parte de `layerOutline.ts` (contorno estático) e `outlineBound` via contorno enviado. Saída: id, tipo, nível, `topZ`/`bottomZ`, `slope`, `problem`, `polygon` e camadas (`z0`,`z1`,`material`,`priority`,`core`,`membrane`,`explicit`,`polygon`). Comparar com `resolveFloors`/`resolveSlabs` camada a camada. Risco: membrana (z0=z1), furo de escada pela face inferior, laje inclinada, vinculado adiado.
- **B2 — Contornos de camada e término.** Módulos: `layerOutline.ts`, `terminoBlock.ts`; circuitos `finish`/`core` vindos do JS. Saída: polígono por camada em `auto`/`face`/`nucleo`/`passa`/`{ate}`/`{cm}` e `limiteExterno`, com zonas por parede. Comparar contorno por camada. Risco: booleanas/offset a 1 µm, `Z_TOL` 1e-3, portas que chegam ao piso, regra `ate` e deslocamento `cm`.
- **B3 — Cortadores e junção entre pavimentos.** Módulos: `junctionNet.ts`, `junctionLevel.ts`, `junctionPlanar.ts`; caches fora. Saída: cortadores por nível (piso/laje/parede, camada, span, `meta`, `external`) e `JunctionLevel` (`cut`, partes por camada, `region`, faixas de parede), com peças externas só parede×piso/laje e só níveis adjacentes. Comparar a `levelCutterSet`/`junctionLevel` (área, volume, topologia). Risco: `winsOver` (núcleo→prioridade→`TYPE_RANK`), `explicit`, ordem, `slabCoversFloor`, `lostVolume`, assinatura `r6`.
- **B4 — Anexo de parede e `wallZRange`.** Módulos: `wallAttach.ts`, `wallZ.ts`, `bandTopAt`. Saída: `WallZ` (`z0`, `height`, `profile`, `bottomProfile`) e `AttachSpan` por trecho; substitui o cálculo JS de `paredes_z`/`perfis_z`. Comparar com `wallZRange` por parede. Risco: `axisTrechos` (interseções e vértices sobre o eixo), parede curva = um trecho, `MIN_HEIGHT` 0.01, fusão de degraus a 1e-9, cota de laje inclinada, ciclo A↔B.
- **B5 — Integração, modo sombra e validação.** Flag `B`/`kernelFatias`, despacho e diagnóstico, comparador estendido (pisos, lajes, junção, anexos). Sem cálculo novo. Projeto real `edificio-dwg_v2`, sintéticos de 10/20 pavimentos e propriedade; para para validação visual do dono. Risco: cena inteira por edição (sem upsert), recriação/limite 3/5 min, tolerâncias 0048/0049.

**4. Estimativa de linhas de Rust**
Razão observada em A1+A2: 3,4/2,3 ≈ **1,48×**. Sobre 1,7 mil linhas portadas → ≈**2,5 mil**; incluindo os acoplamentos (contornos vinculados e furos, se forem portados) 2,1 mil → ≈3,1 mil. Faixa proposta: **2,5–3,2 mil linhas**, provável ~2,8 mil; a junção é mais pesada em booleanas, o que empurra para o topo da faixa.

**5. Riscos e pontos delicados**
- **Floats:** reusar `hipot`/`arredonda_js` de `geo2d.rs`; `Math.round` e `Math.hypot` do V8; `slabRiseAt` linear; quantização a 1 µm em `ops.rs`. Se a junção divergir como na 0048, avaliar `ESCALA_FINA` (1 nm) para o recorte, sem afrouxar tolerância em silêncio.
- **Ordem e desempate:** `winsOver` (núcleo, prioridade, tipo, `explicit`), cotas de corte ordenadas e deduplicadas por `Set`, ordem de `Object.values`, ordenação estável, adjacência acima/abaixo.
- **Manhas do TS:** `Math.min(...[])` = `Infinity`, `covered` com ponto na borda ambíguo (tratado à parte), `stepProfile` funde degrau <1e-9, assinatura `r6` (1e-6), `lostVolume` 1e-9, `AREA_EPS` de `slabCoversFloor`, membrana com espessura zero.
- **Duas implementações de `adjacentLevelIds`** (`junctionNet.ts` e `terminoBlock.ts`): unificar ou garantir equivalência.
- **Laje com caimento fica fora da junção** (só plana); manter a exclusão. Caches (`WeakMap`, LRU) não migram: o estado do Rust é cache e a cena é reenviada inteira.

## Decisões de fronteira adotadas (recomendações do plano)
- O JS envia à B os circuitos fechados dos pisos/lajes vinculados (`contornos_vinculados`; `enclosed.ts` é da D) e o perfil de topo do
  telhado por parede (`paredes_telhado`; o esqueleto do telhado é da E) e os furos de escada/rampa (`furos_nivel`).
- Em B4 o Rust passa a calcular `paredes_z`/`perfis_z` que hoje o JS envia para a A; até lá a interface da A não muda.
