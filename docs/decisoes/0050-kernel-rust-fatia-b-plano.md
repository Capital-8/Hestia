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

## B1 entregue (pisos e lajes), 2026-11-03

Consulta `pisos_lajes_nivel(nivel_num)` e esquema **v8** (`cena-v8.json`, renomeado de `cena-v7.json`; leitores, teste de contrato e `esquema.gerado.ts` atualizados).
O Rust só liga por flag e o padrão continua TypeScript; o `.wasm` commitado NÃO foi refeito (fica velho até o fim da fatia B).

**Esquema v8.** Seções novas (ids 10 a 18): `pisos`, `lajes` (inclinação em colunas), `tipos_piso`, `tipos_laje`, `camadas_piso`, `camadas_laje` (função, prioridade,
término, valor do término, limite externo, material interno), `contornos_estaticos` (um vértice por linha: `boundary` e furos manuais), `contornos_vinculados` (circuitos fechados
de acabamento e de núcleo e perímetro externo de acabamento e de núcleo, já calculados pelo JS) e `furos_nivel`. Só números e ids internados, sem texto. Consulta `pisos_lajes_nivel`:
elementos (tipo, id, problema, inclinação), camadas (índice, material, núcleo, membrana, explícita, `precisa_paredes`, polígono) e polígonos em arrays tipados.

**Decisões.**
1. *Fronteira.* `enclosed.ts` fica com a D: o JS envia os circuitos (`roomAt(enclosedRooms)` e `outerPerimeter`) e o `problem` de `resolveBoundary`; o Rust usa o circuito do modo do elemento
   (`resolveBoundary`) e os demais para `layerOutlines`. Os furos de escada e rampa vão **por elemento** (não por nível): `holesFor` depende da cota da face inferior do tipo do elemento e, na laje
   inclinada, de `coverUnderside` (e do contorno resolvido); por isso `furos_nivel` leva o multipolígono já calculado de cada elemento. Escadas, rampas e `stairOpenings` não migram.
2. *Contorno estático de `layerOutlines`.* Portados o `auto` pelo núcleo, `face`/`nucleo`/`passa`/`ate`/`{cm}` onde não leem paredes, o perímetro (acabamento e núcleo), o limite externo e o
   corte dos furos (`cutStairOpenings`, com o atalho de caixas). **A região menos (ou mais) as paredes é da B2**: nas camadas em que o TS consulta paredes (`face` e `nucleo` fora de vinculado,
   `passa` em vinculado, `ate`, e o `auto` de perímetro pelo núcleo fora do núcleo do elemento) o Rust devolve a região SEM paredes e marca `precisa_paredes` = 1. O teste compara essas camadas por
   contenção no projeto com paredes (o TS tira região, ou a soma, no caso do `passa` vinculado) e **por igualdade** no mesmo projeto sem paredes.
3. *Escala.* Corte dos furos e limite externo usam 1 nm (`ESCALA_FINA`, como o pintor da A2); `{cm}` usa o offset de 1 µm (o `offsetMulti` do TS também é em inteiros de 1 µm).
4. *Semântica do `polygon-clipping`.* O TS descarta a parte de um furo que passa do anel externo (polígono = externo menos furos); sob NonZero ela viraria região a mais. Antes de cortar ou
   intersectar, o Rust trata cada polígono com furos como `externo - furos` (`como_o_polygon_clipping`). Sem booleana (nenhum furo de escada na caixa) o polígono sai como entrou, como no TS.
   Caso real: furo manual de elemento vinculado que a sala deixou para fora do circuito (achado do estresse, ver abaixo).
5. Elementos com tipo ausente, contorno de menos de 3 pontos ou polígono todo furado não saem (como `resolveFloors` e `resolveSlabs`). Tipo com camadas que não batem com `n_camadas`, lista
   de vértices com índice repetido ou com lacuna, anéis com lacuna: `ENTRADA` (falha leve).

**Exceção nomeada (defeito do TS em entrada fora do contrato).** Furo manual de elemento vinculado que PASSA do circuito da sala, com camada `{cm}` diferente de zero: o `offsetMulti` do TS
(Clipper) deixa pedaços soltos em volta do furo (quadrados de 5 cm); o Rust devolve o deslocamento limpo do contorno. É a única divergência do estresse com furos livres (2 camadas em 8 sementes x 2 pavimentos,
o teste `furo manual que passa do circuito` exige que TODAS as divergências sejam desse tipo e que existam). No estresse padrão o furo manual dos vinculados cabe na sala e não há divergência.
Segue como pendência separada de correção no TS.

**Cobertura (estresse, sementes 1 a 12, cada uma com e sem paredes; `kernel-b1.wasm.test.ts`).** 96 comparações (por pavimento), **672 pisos e 672 lajes** (290 lajes inclinadas),
**3.730 camadas** (910 membranas, 1.596 com término explícito), 352 elementos com `problem` (aberto ou fora), 122 vinculados com circuito fechado, 247 elementos de perímetro, 672 com furo de escada ou rampa,
455 camadas que pedem paredes (comparadas por contenção; 522 iguais mesmo assim, contando as do projeto sem paredes), **4.619 polígonos**. Também: sintéticos de 10 e 20 pavimentos, a fixture
`casa-2-quartos` com um piso e uma laje vinculados a cada ambiente e os de perímetro, rampa e escada (modos `headroom`, `full`, `none`; laje reta e inclinada), propriedades (camadas empilhadas sem lacuna,
topo menos base igual à soma das espessuras, laje inclinada dentro das cotas, área do polígono igual à soma das partes), upsert e remoção, entradas inválidas (enum, não finito, chave reservada, papel,
lacuna de índice, `n_camadas`), sem vazamento de memória. Cada teste wasm individual fica abaixo de 2 s.

**Medições.** Sem a 0049: **4.619 de 4.619 polígonos iguais vértice a vértice (1 µm) depois da canonicalização**; maior diferença simétrica **3,07e-7 m²** (semente 9, pavimento 1), maior razão
`max(área, simétrica) / (perímetro x 1e-6)` (K) = **0,031**; desvio máximo de campos escalares (cotas, prioridade, inclinação) **0**. A 0049 não foi aplicada (nem a K nem a limiar de fiapo). Com 1 µm de escala o
recorte dos furos reprovaria (vértices fora da grade de 1 µm), por isso a escala de 1 nm.

**Mutações de B1: pendentes para o fim da B.** Suíte wasm completa e `.wasm` commitado também.
