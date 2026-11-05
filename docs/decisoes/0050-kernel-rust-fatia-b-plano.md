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
Segue como pendência separada de correção no TS. **Revisto na B2 (ver abaixo): a divergência era o offset do `i_overlay`, não defeito do TS; com o porte do `ClipperOffset` o Rust reproduz até os pedaços soltos e a exceção deixou de existir.**

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

## B2 entregue (contornos de camada e término com paredes), 2026-11-03

Consulta `pisos_lajes_com_paredes(nivel_num, tol_juncao)` e esquema **v9** (`cena-v9.json`, renomeado de `cena-v8.json`; leitores, teste de contrato, `esquema.gerado.ts`, o falso e os
testes de versão atualizados). `pisos_lajes_nivel` (B1) segue igual (compatível: a camada que consulta paredes continua saindo com `precisa_paredes` = 1). O Rust só liga por flag e o padrão continua
TypeScript; o `.wasm` commitado NÃO foi refeito.

**Esquema v9.** Seção nova `niveis` (id 19: `id_num`, `nivel_num`, `cota`, para a adjacência de níveis das lajes; `adjacentLevelIds` ordena por cota de forma estável, empate pela ordem de `nivel_num`) e a
consulta 11. Saída igual à da B1 sem a coluna `precisa_paredes` (7 valores por camada). Não há seção de "aberturas que chegam ao piso" nem de "parâmetros de término": o término por camada já está em
`camadas_piso`/`camadas_laje` (B1) e as portas vêm de `aberturas` e `tipos_abertura` (A3a), lidas por dentro. As paredes do nível vêm de `resolver_nivel` (A3d) sobre as seções da fatia A, **montadas pelo JS com
`flatAttach` = true** (a cota de `paredes_z` do término por camada, como `wallsOfLevel`). `tol_juncao` é a de `resolveLevel`.

**Decisões.**
1. *Paredes por dentro, só quando preciso.* `b2::Carregador` resolve cada nível uma vez por consulta (quadros, itens, camadas com `raw`/núcleo/prioridade, portas via `aberturas_do_nivel`) e `Escopo` só o aciona na
   primeira camada que consulta paredes (como o `wallsNow` do TS). Piso lê o próprio nível; laje, o próprio, o de baixo e o de cima. Os índices de `blockedLayerIndexes` são os da lista de camadas RESOLVIDAS da parede,
   não o `layerIndex` (manha do TS reproduzida).
2. *`terminoBlock.ts` portado inteiro:* zona bloqueada por regra (`face`, `nucleo`, `ate`: faixa contígua do menor ao maior índice), `wallTouchesZone` (faixa NOMINAL da parede, ± `Z_TOL` = 1 mm), portas que chegam ao piso
   (soleira da base da parede + peitoril até o topo da camada + `Z_TOL`; retângulo largura x (espessura + 5 mm por face)), `regionMinusWalls` e `regionPlusWalls`, filtro por caixas (fronteira inclusiva). Booleanas a 1 nm
   (`ESCALA_FINA`), como o corte dos furos da B1; zonas guardadas por regra dentro da parede (não dependem da cota).
3. *Achado 1 (corrigido): `{cm}` e o offset.* O estresse com paredes diagonais e curvas dá circuitos com cantos agudos. Com o offset do `i_overlay` (miter até 60°), o `{cm}` positivo de 2 cm num canto de 49° dava
   **3,3e-4 m²** de diferença (semente 12), e `{cm}` negativo dava 1,7e-6 a 3,7e-6 m² com fatias de meio micrômetro. Causa verificada: (a) canto mais agudo que 60°: o Clipper faz o canto quadrado
   (`DoSquare`), o `i_overlay` outra forma; (b) o adaptador de ponto flutuante do `i_overlay` centra a grade na caixa dos pontos e, com caixa de extensão ímpar, devolve coordenadas em meio micrômetro (o Clipper usa a grade
   absoluta de 1 µm). Isto NÃO é arredondamento no sentido da 0049 (a diferença não encolhe com escala fina), então não se aplicou a 0049: portou-se o `ClipperOffset(2, ...)` (`ops::offset_clipper`: `AddPath`, `FixOrientations`,
   `OffsetPoint`/`DoMiter`/`DoSquare`, `Clipper.Round`, união pelo enrolamento positivo direto sobre inteiros do `Overlay`, sem o adaptador). Só o `{cm}` o usa; o `ops::offset` (miter do `i_overlay`, usado pelo fechamento de
   frestas da A3c) ficou como está. **A exceção nomeada da B1 (furo manual que passa do circuito com `{cm}`, atribuída a defeito do TS) era esta mesma diferença: com o porte, as 2 camadas divergentes passam a 0 e o teste da B1
   agora exige zero divergência.** Os números da B1 não mudaram (4.619 de 4.619 estritos, simétrica máx. 3,07e-7, K 0,031).
4. *Achado 2 (corrigido): `regionPlusWalls` e furo manual.* O `ref` do `passa` vinculado traz furos manuais; o `union` do TS (`polygon-clipping`) trata o polígono como externo MENOS furos, e a parte de um furo que passa do
   anel externo (um entalhe do circuito) não conta. Sob NonZero ela contava como região (enrolamento -1) e a pegada da parede não a cobria: **6,6e-4 m²** a menos no Rust (semente 18, piso 13, camada `passa`). `regionPlusWalls`
   passa a tratar o `ref` como o `regionMinusWalls` já fazia (`como_o_polygon_clipping`); teste de unidade que falha sem a correção.

**Cobertura (estresse, sementes 1 a 12, `paredesB2`: cada pavimento com 32 paredes da grade, portas em ~45% das paredes de 4 m com soleira de 0, 2, 8 e 15 cm, 3 paralelas coladas a 10–40 cm, 2 diagonais, 1 curva; 3 pavimentos com
paredes e um sem; `kernel-b2.wasm.test.ts`).** 48 comparações (por pavimento), **336 pisos e 336 lajes** (145 lajes inclinadas), **1.865 camadas** (455 membranas, 798 com término explícito; por término: auto 858, face 327,
cm 209, passa 198, nucleo 142, ate 131), 68 elementos com `problem`, **2.537 polígonos**. **454 camadas dependem de paredes** (as que a B1 marcava com `precisa_paredes`), das quais **301 mudaram de fato com as paredes** (189 de
lajes); 536 portas no projeto (a referência conta 172 em 4 sementes: 117 com soleira até 2 cm, 55 acima). Todas comparadas por igualdade, sem contenção. Também: níveis adjacentes (sementes 22 a 24, 3 pavimentos: lajes do
pavimento do meio mudam sem a seção `niveis`, pisos não), sintéticos de 10 e 20 pavimentos (tipos padrão e tipos com face, núcleo, até, passa e `{cm}`: 20 e 40 camadas por término, 20 e 40 mudam com as paredes), a fixture
`casa-2-quartos` (piso e laje vinculados por ambiente e perímetro; 5 portas), rampa e escada (6 casos, sem paredes no nível), propriedades (a camada `face`/`nucleo` não invade a zona das paredes que a tocam, `nucleo`/`passa`
ficam dentro do contorno do elemento, `passa` igual ao polígono do elemento), upsert/remoção (remover as paredes do nível e a seção `niveis`, e devolvê-las), entradas inválidas (tolerância negativa, NaN, fracionário, seção
`niveis` inválida, `paredes_z` ausente), sem vazamento de memória. Cada teste wasm individual fica abaixo de 5,2 s.

**Medições.** Sem a 0049: **2.537 de 2.537 polígonos iguais à referência pela regra geral (1e-6 m²)**, 2.471 deles vértice a vértice (1 µm) depois da canonicalização; maior diferença simétrica **9,67e-7 m²**
(semente 1, pavimento sem paredes), maior razão `max(área, simétrica) / (perímetro x 1e-6)` (K) = **0,0349**; desvio máximo de campos escalares **0**. A 0049 não foi aplicada. Rust: `cargo test` 145 passam.

**Margem estreita e casos fora das sementes 1 a 12 (para decisão do dono).** Uma varredura maior (sementes 13 a 40, mesma configuração, mesma regra de 1e-6) NÃO fecha em zero: cerca de 1 em 6 sementes tem polígonos
grandes (20 a 120 m²) com diferença simétrica de **1,0e-6 a 1,4e-6 m²** (K de 0,016 a 0,048; área igual a 1e-7 ou menos: fatias de décimos de micrômetro ao longo de arestas longas; sementes 19, 25, 28, 31, 32) e
**três casos de topologia** (Rust 3 peças tocando em ponto onde o TS tem 1, ou 5 x 6, em fitas finas entre zonas de paredes diagonais; sementes 31 e 35 no estresse padrão, semente 21 na configuração de 3 pavimentos
com laje). Os primeiros são do tipo da 0049 (menos de 1 µm por vértice, topologia igual), mas a regra geral reprova por margem de 0,4e-6; a 0049 NÃO foi aplicada nem pedida aqui, e a topologia não é coberta por ela (condição 2).
Os testes de estresse usam as sementes 1 a 12 (como a B1) e o de níveis adjacentes as sementes 22 a 24 (a 21 fica de fora pelo caso de topologia): isso é escolha de amostra, registrada aqui, não folga de tolerância.
Decisões pendentes: aplicar a 0049 (K medido 0,048, com folga de 1,5x = 0,072) à classe de diferença simétrica de décimos de micrômetro; e olhar o caso de topologia por pescoço de largura nanométrica.

### B2: 0049 aplicada (decisão do dono, 2026-11-03)

A varredura aberta acima foi decidida sob a 0049, sem exceção implícita. Os testes do B2 passam `k0049` ao comparador (`compararB1`): limite `1e-5 + K x perímetro x 1e-6` (regra 3), guarda grosseira de 1e-2 m² (regra 4),
topologia só nos componentes acima do fiapo de 1e-4 m² (regra 2, componentes das duas formas canonicalizadas; sem par acima do fiapo só passa pela verificação de equivalência, como no A3d: interseção com a forma do outro lado
dentro do limite). Campos escalares (cotas, prioridade, inclinação) seguem a 1e-6, sem a 0049.

**Medição (sementes 1 a 60, 240 comparações, 13.204 polígonos, 1.680 pisos e 1.680 lajes, 9.844 camadas).** Maior diferença simétrica **1,40e-6 m²** (semente 32); maior K medido **0,0481** (semente 32), fora de exceções (não há
exceção nomeada no B2). **K adotado = 0,08** (1,5 x 0,0481 = 0,0722, arredondado para cima). 12.914 polígonos estritos; **21 passam só pela 0049** (limite por perímetro). **Componentes sem par: 485, o maior com 2,85e-7 m²; nenhum acima
de 1e-4 m² (nem de 1e-3 m²)**, portanto nenhum precisou da verificação de equivalência; 751 fiapos. Os 3 casos de topologia apontados antes (sementes 31 e 35, e a 21 com laje) desaparecem sob a regra 2: a diferença de contagem era de
peças que se tocam em ponto, e a canonicalização as funde. Desvio de campos escalares: 0. A semente 21 voltou ao teste de níveis adjacentes (sementes 21 a 23).

**Testes.** Estresse nas sementes 1 a 60 (uma por teste, cerca de 2 s cada), incluindo as problemáticas 19, 21, 25, 28, 31, 32 e 35; os demais testes do B2 inalterados. Para medir de novo: `B2_K=1000000 B2_MEDIR=1` (com K enorme o limite
não reprova e o K sai no resumo `[B2 medido]`).

**Mutações de B2: pendentes para o fim da B.** Suíte wasm completa e `.wasm` commitado também.

## B3 entregue (cortadores e junção entre pavimentos), 2026-11-03 — PARCIAL: decisão do dono pendente nas faixas de parede da junção

Consulta `junction_nivel(nivel_num, tol_juncao)` e esquema **v10** (`cena-v10.json`, renomeado de `cena-v9.json`; leitores, teste de contrato, `esquema.gerado.ts`, o falso e os testes de versão atualizados).
O Rust só liga por flag e o padrão continua TypeScript; o `.wasm` commitado NÃO foi refeito. Caches do TS (`WeakMap`, LRU, assinatura `r6`) não migram.

**Esquema v10.** Seções novas 20 `paredes_z_juncao` (`id_num`, `z0`, `altura`) e 21 `perfis_z_juncao` (as colunas de `perfis_z`) e a consulta 12 (14 saídas: cortadores, peças, peças_num, elementos, camadas,
camadas_indice, paredes, faixas, faixas_camada, partes, partes_z e os níveis de índice de polígonos). **Por que seções novas:** as faixas de parede da junção vêm de `resolveLevel(p, nivel)` padrão (SEM `flatAttach`: a
cota e o perfil das paredes anexadas a pisos e lajes pelas camadas resolvidas), enquanto o término por camada de piso e laje (B2) exige `flatAttach`. As duas variantes convivem na mesma cena: a parede que tem linha em
`paredes_z_juncao` usa a cota dela e os perfis de `perfis_z_juncao` (todas as listas) SÓ na consulta nova; as demais consultas ignoram as seções. O JS só manda a variante das paredes em que ela difere
(`montarCenaB3`; `todas` manda todas e o resultado é idêntico, testado). O Rust liga a variante com um `Cell` na cena (`Cena::parede_z`, `perfis_por_parede`), desligado ao sair, também em erro.

**Decisões.**
1. *Cortadores (`levelCutterSet`).* Pisos e lajes do nível e dos outros níveis (seção `niveis`, todos, não só os adjacentes: o TS olha todos e filtra por `reaches`, cota comum > 1e-6) vêm de `b1::calcular` com paredes (B2);
   as faixas de parede, de `resolver_nivel` (A3d) com os perfis (`aplicar_perfis`, extraída de `resolver_nivel_completo` sem mudar o resultado). Peças de outro nível saem `external`. O cortador de parede do próprio nível é um só
   (mesmo vazio); os de outros níveis só existem com peças. A junção do TS não usa `adjacentLevelIds`; quem usa é o `terminoBlock` (B2).
2. *Junção.* `winsOver`, `zOverlaps`, `pairCuts` e `resolveJunction` portados (booleanas a 1 nm), `planarOf` (membrana e laje inclinada ficam fora; laje com caimento só plana), `lostVolume` a 1e-9, região por união. Só parede x piso/laje entre níveis.
3. *`adjacentLevelIds`:* as duas implementações (`junctionNet.ts` e `terminoBlock.ts`) dão o mesmo conjunto de vizinhos com cotas distintas e níveis fora de ordem (300 projetos de níveis aleatórios, teste); **com dois níveis na mesma cota diferem**
   (achado; a B2 do Rust segue a do `terminoBlock`, ordenação estável por cota).
4. *Achado na A3c (corrigido):* a fusão de faixas verticais contíguas (`sigOf`) comparava a ordem dos vértices; o `i_overlay` roda o início do anel conforme o conjunto de entrada, e o TS (saída canônica do `polygon-clipping`) não. A assinatura agora é
   canônica (anel a partir do menor ponto, polígonos ordenados). Reduziu as divergências de faixa de parede a quase nada, mas ver o ponto abaixo.
5. *Não portado:* `cutVolume`, `coveredFaceArea`, `slabCoversFloor` e `overlapVolume` (quantitativos; a laje inclinada integra com `earcut`). A consulta devolve as partes de onde o volume sai; fica para decisão (fatia C/quantitativos).

**Comparação.** Identidade, ordem, ids, marcas e escalares a 1e-6 (desvio máximo medido 1,6e-8); a função de cota das peças (`span`) avaliada nos vértices; polígonos por canonicalização e diferença simétrica a 1e-6 m² e, quando é arredondamento, a 0049.
Cortadores de piso e laje e elementos da junção: peça a peça, na ordem. **Faixas de parede (cortadores):** comparadas por camada de cada parede (identidade e ordem exatas) pela região em alturas elementares, como a A3d compara faixas com perfil, porque a partição em faixas não é canônica.
Peças externas de parede só entram nas alturas dentro do nível. Itens-fiapo (área abaixo de 1e-4, aresta de vão a menos de 1 µm de um degrau de perfil que o JS mandou: o Clipper do TS arredonda a 1 µm, o Rust deixa a 1 nm) são pareados à parte e contados.

**PENDENTE DE DECISÃO DO DONO (faixas de parede da junção).** A junção só guarda as faixas PLANAS de cada parede. A partição em faixas verticais depende da fusão do TS (`sigOf` sobre vértices idênticos da saída do `polygon-clipping`) e o Rust não reproduz a mesma
partição em todos os casos (nenhuma das duas assinaturas, por ordem ou canônica, acerta todos): quando o TS tem uma faixa inclinada e o Rust a parte em uma plana e outra inclinada (ou o contrário), a lista de faixas planas guardadas na junção muda, e a
comparação faixa a faixa fica sem sentido mesmo com a geometria igual por altura. Nas sementes 1 a 4 sobraram 72 divergências, todas deste tipo (71 de região por altura nas partes e 1 de `corte` de parede); todo o resto bateu. Por isso o teste usa
`faixasDeParede: false` (as divergências vão para `pendentes` e o total é impresso, sem reprovar). Opções: (a) reproduzir a partição do TS no Rust (portar o `polygon-clipping`, fora do plano); (b) comparar por altura também a junção e aceitar que as faixas planas
guardadas variam; (c) a junção do Rust guardar partes por altura em vez de por faixa. Isto é mudança de contrato além da 0049, então NÃO foi aplicado em silêncio.

**Cobertura (estresse, sementes 1 a 5, 20 comparações por pavimento, projeto com `anexos`: alturas até 5,8 m, `baseOffset`, nível de topo, anexos de base e topo, perfil do modelo).** 675 cortadores (parede/piso/laje 60/308/307), **25.917 peças** (externas 15.565: parede 14.638,
piso 469, laje 458; **2.321 de nível NÃO adjacente**; 2.728 inclinadas; 188 membranas), 208 elementos na junção (131 pisos, 77 lajes, 167 cortados), 502 camadas, 570 paredes (441 cortadas; 480 com variante da junção), 2.718 faixas, 39.341 partes,
**60.027 polígonos** (58.843 estritos; **609 só pela 0049**). Também: variante em todas as paredes igual à só nas que diferem, sintéticos de 10 e 20 pavimentos, fixture `casa-2-quartos`, níveis não adjacentes, propriedades (partes sem sobreposição de cota,
dentro da camada original e volume conservado, recalculado com `winsOver` e `intersection` do motor), upsert e remoção (variante, paredes, `niveis`), entradas inválidas, vazamento de memória.

**Medições (sementes 1 a 5).** Maior diferença simétrica **1,08e-6 m²**; **K máximo medido 0,0880**; **K adotado = 0,14** (1,5 x 0,088 = 0,132, arredondado para cima). Componentes sem par: 573, o maior com 3,46 m² e **4 acima de 1e-4 m²**, todos resolvidos pela
verificação de equivalência (a forma do outro lado os contém, dentro do limite); 2.742 fiapos; itens-fiapo contados à parte. Varredura ampla (sementes 1 a 60) NÃO feita nesta entrega: com a máquina carregada cada semente leva cerca de 60 s; fica para depois da decisão acima. `cargo test`: 154 passam.

**Mutações de B3: pendentes para o fim da B.** Suíte wasm completa e `.wasm` commitado também.
### B2: limiares das mutações sobreviventes (#2, #3 e #10), 2026-11-03

Casos mínimos em `tests/kernel-b2-limiares.wasm.test.ts`, sempre contra a extração do TS (`referenciaB2` x `pisos_lajes_com_paredes`), sem tocar em Rust nem em tolerância:

- **#2 `MARGEM_DA_PORTA` (b2.rs:31, 0,005 -> 0).** Parede perpendicular entra no vão de uma porta e termina a 4 mm e a 20 mm além da face da parede anfitriã, com piso de camadas `face`, `nucleo` e `ate`; o retângulo do vão (espessura + 5 mm por face) decide se o fim da parede é recortado. Sem a margem, o Rust recorta **6,3e-3 m² a mais** (camada 0) e o teste reprova; com ela, Rust = TS nos dois casos.
- **#3 `wallTouchesZone` (b2.rs:85, `<=` -> `<`).** Parede com `nominal_z0` EXATAMENTE `z1 + 1e-3` (o `z1` do TS é conferido no próprio teste), e 1 ulp acima e abaixo. No exato o TS toca e recorta; o mutante não toca: **0,968 m²** de diferença (erro grosseiro da 0049). Acima, nenhum dos dois recorta; abaixo, os dois recortam.
- **#10 orientação do `offset_clipper` (ops.rs:381, `anti_horario == (i == 0)` -> `!=`). EQUIVALENTE.** Normalizar cada anel para externo anti-horário/furo horário (`==`) ou para o inverso (`!=`) inverte a orientação de TODOS os caminhos. O `FixOrientations` (ops.rs:422) escolhe o caminho do vértice mais baixo (maior Y, empate por menor X) e, se a área dele é negativa, inverte todos. O vértice mais baixo é sempre de um contorno externo: o furo é interior ao seu externo e não alcança o Y máximo global (premissa: furos estritamente interiores, como os que o motor envia). No alvo normal esse caminho é anti-horário (área > 0: não inverte); no mutante ele fica horário (área < 0: inverte todos), devolvendo exatamente a orientação normal antes do `DoOffset`. Verificação: teste unitário temporário em `ops.rs` (não commitado) com dois polígonos, furos e anéis nas duas orientações de entrada, deltas +0,02, -0,02, -0,3 e +0,1 — geometria final igual (diferença < 1e-12 m² por lado) com e sem a mutação; e o wasm mutante passa os limiares e as sementes 19, 25, 31, 32 e 35 do estresse com os mesmos números do binário sem mutação (maior simétrica 1,40e-6 m², K 0,0481).
## B5 entregue (integração da fatia B, modo sombra e validação) — 2026-11-03

A fatia B liga por flag (`?kernelFatias=A,B`, `?kernel=rust` ou `hestia:kernel:fatias`), como a A. O padrão continua TypeScript e nada liga sem
flag. Nesta entrega, **pisos e lajes são despachados para o Rust; a junção (B3) NÃO é despachada**: o `junction_nivel` do Rust ainda diverge da
referência TypeScript fora da 0049 nos projetos com paredes anexadas (número abaixo). A junção segue no TypeScript em produção e é comparada só
no modo sombra, que devolve sempre o TS. Nenhum cálculo novo no Rust; crates, esquema e `.wasm` versionado não mudaram; `VERSAO_MOTOR_GEOMETRIA`
NÃO sobe (o resultado do TS é o mesmo).

**O que foi integrado e onde.**
- Flag e UI: `apps/web/src/editor/preferenciasKernel.ts` (`FATIAS_HABILITADAS = ['A','B']`, `configDoDespacho` devolve `{ fatiaA, fatiaB, sombra }`,
  com a sombra valendo por fatia ligada), `apps/web/src/main.tsx` (ativa o despacho com A ou B), `ExperimentosDialog.tsx` (textos pt/en, B
  habilitada, interruptor travado quando a URL força, "Requer recarregar", diagnóstico da B) e testes vizinhos.
- Despacho de pisos e lajes: `floors.ts` e `slabs.ts` dividiram `resolveFloors`/`resolveSlabs` em `resolveFloorsTs`/`resolveSlabsTs` (o mesmo
  motor de antes, agora também a referência do Rust) e um despachante fino que só age na chamada padrão (sem opções). `resolveDespacho.ts` ganhou
  os ganchos da B; `kernelDespacho.ts` delega a uma classe `DespachoB` (`kernelDespachoB.ts`), que monta a cena (`sincronizarB`), consulta
  `pisos_lajes_com_paredes` e converte a saída para os MESMOS tipos do TS (`converterPisosELajes`). O memo é por projeto e nível (o `Project` é
  imutável: uma edição invalida tudo). Chamadas com `layers: false` (a cena de paredes) e `levelCutterSet` seguem no TS.
- Falhas: leve (ENTRADA, NAO_IMPLEMENTADO, LIMITE, projeto que a cena não cobre, falha de conversão) volta só aquela chamada ao TS, sem recriar;
  grave (VERSAO, HANDLE, INTERNO, trap) é recriada e repetida pela `CenaV2`, com o limite já existente de 3 recriações em 5 min no gerenciador.
- Modo sombra da B (`hestia:kernel:sombra=true`, por fatia ligada): roda TS e Rust, compara pisos e lajes com `compararB1` e a junção com
  `compararB3` (0049, `K = 0,08`, o adotado na B2/B3), registra no mesmo buffer circular de 20 do diálogo (nível, elemento ou parede, campo,
  mensagem) e devolve SEMPRE o resultado do TS. Uma comparação por (projeto, nível, tipo).
- Worker: `PedidoResolucao.kernelV2` leva `fatiaA`/`fatiaB`/`sombra` (`protocolo.ts`, `cliente.ts`) e o worker instala o despacho se qualquer
  fatia estiver ligada (`servidor.ts`); o diagnóstico (`entreguesB` incluso) volta em `RespostaResolucao.kernelDiag` e a thread principal soma.
- Testes: `packages/engine/src/kernelDespachoB.test.ts` (sem binário, falso do ABI v2: flag desligada, leve sem recriar, grave recriando,
  limite 3/5 min com relógio injetável, junção sempre no TS) e `tests/kernel-b5.wasm.test.ts` (binário real: fixture `casa-2-quartos`, sintéticos
  de 10 e 20 pavimentos, sementes 1 a 6 do estresse da B, memo, edição, sombra com divergência artificial, buffer circular e sombra desligada).
  `servidor.test.ts`/`cliente.test.ts` cobrem o pedido e o diagnóstico da B; `preferenciasFatias.test.ts`/`ExperimentosDialog.test.ts` cobrem a flag.

**Bloqueio da junção (B3): divergência fora da 0049.** Reproduzido no próprio teste da B3 (`tests/kernel-b3.wasm.test.ts`) com o wasm atual
(`scripts/build-wasm.mjs`, fontes no commit `50b59b40`): as sementes 1, 10, 11 e 12 falham. Semente 1, `lv_1`, parede 22, camada 2: partes com
diferença simétrica **0,35416666500000815 m²** (guarda 0,01; K medido 70519,9), sem relação com arredondamento; semente 12, `lv_0`, parede 22:
**0,31500000000001194 m²**; semente 11, `lv_1`, cortador 41: **0,10125007950240317 m²**; semente 10, `lv_0`, cortador 25: item sem par acima do
fiapo. Como o TypeScript é a referência e despachar essa saída mudaria o resultado em produção, a B3 não entra no despacho até ser corrigida; o
modo sombra da B já mostra os casos (nível, parede/elemento, campo). Para reexecutar:
`KERNEL_WASM_PATH=./tmp-b5/wasm/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/kernel-b3.wasm.test.ts -t "estresse, semente 1"`.

**Como validar na interface.** Compile o wasm (`node scripts/build-wasm.mjs`; o binário versionado fica velho até o fim da B e, com ele, o
despacho cai em "indisponível" e tudo segue no TS), abra o app com `?kernelFatias=A,B` (ou `?kernel=rust`, ou grave A e B no diálogo e recarregue).
Para comparar, `localStorage.setItem('hestia:kernel:sombra','true')` e recarregue: o app segue mostrando o TS e o diálogo Experimentais mostra
comparações, divergências (nível, elemento/parede, campo) e as consultas entregues da B. Sem sombra, planta, cortes, 3D e quantitativos usam os
pisos e as lajes do Rust; a junção continua no TS.
O que olhar: (1) com `?kernelFatias=A,B` sem sombra, pisos e lajes (camadas, membranas, furos de escada, vinculados, lajes inclinadas) iguais
aos do TS em projetos reais; (2) na sombra, a contagem de divergências de pisos e lajes deve ficar em 0 nos casos da B2; divergências de junção
são o bloqueio da B3 acima e trazem nível, parede/elemento e campo; (3) voltas graves ou recriações indicam defeito do binário, não do TS (o app
continua correto, mas avise); (4) tempo de edição: a cena é reenviada por inteiro a cada edição (sem upsert incremental).

**Resultados literais desta entrega.**
- `npx tsc -p tsconfig.json --noEmit`: sem saída (sucesso).
- `npx eslint` nos arquivos tocados e testes novos/vizinhos: sem saída (sucesso).
- Testes unitários (despacho A/B, worker, flag, diálogo): 6 arquivos, **67 testes passaram**.
- `KERNEL_WASM_PATH=./tmp-b5/wasm/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/kernel-b5.wasm.test.ts`:
  **17 testes passaram** em 73,96 s; o maior teste individual foi a semente 2 do estresse, **8,45 s** (abaixo de 30 s).
- Wasm temporário usado: `sha256 10a05de610baa6f9d779f0b4488980b4ee70388ed48c990ab7358a9635984a4e` (não commitado).
- Commit do código deste passo: `0b9b4e8c` (a documentação vem no commit seguinte).
- A fatia B entrega, por nível, **1 consulta** (`pisos_lajes_com_paredes`, que devolve pisos e lajes); a junção não é consultada em produção.

## B3 encerrada sem a junção despachada (2026-11-04)

Decisão do dono (2026-11-03, item 2 do plano com modelos baratos): se o conserto da junção falhasse duas vezes, a fatia B fecha sem ela. Falhou: três correções locais no Rust, feitas por um agente com a hipótese
confirmada, reprovaram outros casos de estresse (cada uma passou o caso mínimo e quebrou outros, de 0,019 a 0,594 m²), e o Rust foi revertido ao estado anterior sem commit.

**Estado entregue.** `junction_nivel` (B3) existe no Rust e no `.wasm`, bate com o TypeScript em cortadores, peças (inclusive de níveis não adjacentes), partes dos elementos, escalares e propriedades (volume conservado),
e bate nos 11 pavimentos do edifício real, inclusive no modo estrito. **Não é despachada**: em produção a junção continua sendo calculada pelo TypeScript; no modo sombra ela é comparada.

**Comparador.** O comparador das faixas de parede (`kernelComparaB3.ts`) agora compara o RESULTADO FINAL da camada de parede por altura elementar e é sempre bloqueante (a opção `faixasDeParede` foi removida). Ele detecta o
defeito real e não acusa partições diferentes com a mesma geometria final (testes unitários dos dois casos em `tests/kernel-b3-referencia.test.ts`).

**Defeito conhecido (5 testes marcados `it.fails`).** Em parede com faixas inclinadas (topo anexado ou com perfil de topo) cruzada por piso ou laje, o Rust deixa de recortar faixas que o TypeScript recorta, de 0,04 a 0,65 m²
na camada de parede: semente 1 pavimento 2 (paredes 88 e 90), semente 2 pavimento 0 (parede 24), semente 5 pavimento 1 (parede 64, 0,395 m²) e, com níveis não adjacentes, semente 43 pavimentos 0 e 1 (paredes 26 e 64). Os 37 testes restantes do B3 passam.
`it.fails` exige que esses casos continuem reprovando; se um passar, o teste reprova e a lista `DEFEITO_CONHECIDO` deve ser atualizada. Nada foi afrouxado.

**Causa confirmada.** A partição vertical das faixas no TypeScript depende da ordem textual dos anéis que o `polygon-clipping` devolve (a fusão por `sigOf` compara texto); o `i_overlay` do Rust não reproduz essa ordem e
a forma canônica funde faixas que o TS mantém separadas (e, na parede 54, o inverso). A junção só guarda faixas planas, então o bloco plano que o TS recorta deixa de existir no Rust. Heurísticas locais corrigem um caso e
quebram outro. Não é arredondamento (0049) nem erro isolado do Rust: é um comportamento do TS que depende da biblioteca de recorte.

**Saídas (decisão de projeto, não feita; recomendação: a 3).**
1. Portar a ordem e a partição do `polygon-clipping` para o Rust: fiel ao TS, mas trabalho grande e carrega o comportamento dele.
2. Fazer a junção recortar também as faixas inclinadas por altura (muda o contrato): geometricamente mais limpo, mas passa a divergir do TS em outros casos (parede 54: o TS não recorta).
3. O JS passa ao Rust a partição vertical já resolvida pelo TS (como já faz com `wallZRange` e os perfis) e o Rust só executa os recortes. Mantém o TS como referência e é a mais curta.

**Mutações de B3:** não feitas nesta entrega, porque a junção não é despachada; entram quando ela for. A ferramenta `scripts/mutar-rust.mjs` (retomável, com restauração garantida) fica pronta para isso.

## B3 saída 3 aplicada (2026-11-04): contrato v11, faixas de parede do TypeScript

**Causa confirmada.** A partição vertical das faixas de parede sai de `resolveLevel` e dos perfis (`clipBandsToProfile`, depois `clipBandsToBottom`). No TypeScript, a fusão de faixas contíguas compara o texto da forma (`sigOf`), e a ordem dos anéis do `polygon-clipping` decide se duas faixas se fundem. O `i_overlay` do Rust não reproduz essa ordem: a faixa plana que o TS recorta no bloco de cota 2,36 a 2,48 m ficava dentro de uma faixa inclinada no Rust, e não era recortada. Por isso o caso mínimo (semente 2, nível 0, parede 24, camada 2) tinha 0,4125 m² de diferença. Três heurísticas locais no Rust tinham sido refutadas (ver a seção anterior); esta entrega não repete essa abordagem.

**Desenho (saída 3).** O JavaScript passa ao Rust a partição que o TypeScript já resolveu, por contrato, sem reimplementar nada: `montarFaixasB3` (`kernelB3.ts`) lê `resolveLevelTs` e envia, para cada nível e parede, as faixas de cada camada na ordem de `wallBandPieces`, depois dos perfis, com a cota da base e a região de cada faixa. O Rust, quando a seção `faixas_juncao` tem linhas, monta as peças de parede dessa seção e só executa os recortes de piso e laje (`juncao_do_nivel`, sem mudança). Sem linhas, vale o cálculo anterior (`resolver_nivel` sobre a variante da junção).

**Esquema v11** (`crates/geom-wasm/schema/cena-v11.json`, sobe de v10; seções aditivas, as demais não mudaram):
- `faixas_juncao` (id 22): uma linha por faixa: `id_num`, `nivel_num`, `parede_num`, `camada`, `banda`, `prioridade`, `nucleo`, `base_z`, `z0`, `z1` (relativos à base), `inclinada` e os oito campos do topo inclinado (`o_x`, `o_y`, `d_x`, `d_y`, `t0`, `t1`, `h0`, `h1`).
- `pontos_faixas_juncao` (id 23): a região de cada faixa, um vértice por linha (`faixa_num`, `poligono`, `anel`, `indice`, `x`, `y`).

**Regra de presença.** A seção manda quando tem linhas. Seção vazia ou removida devolve o cálculo anterior. (Uma versão anterior, com a carga marcando a cena mesmo vazia, foi corrigida: remover as linhas esvaziava a junção em vez de voltar ao caminho antigo.)

**Validação.** Na carga, valores não finitos, `z0 >= z1`, colunas de tamanhos diferentes e topo com `nucleo`/`inclinada` fora de 0/1 viram `ENTRADA`. Na consulta, parede inexistente, vértice de faixa inexistente (órfão), lacuna ou repetição de polígono, anel ou índice viram `ENTRADA` (falha leve, sem panic).

**Adaptador e testes.** `kernelDespachoB.ts` e a harness mandam as duas seções junto com as da variante. `quadros.ts` lista as seções novas (sem isso elas não seriam enviadas). A harness de estresse (`kernel-b3.wasm.test.ts`) teve `DEFEITO_CONHECIDO` esvaziada. Dois testes da harness (upsert e remoção; entradas inválidas) passaram a rodar as asserções antigas numa cena sem `faixas_juncao`, onde o caminho antigo ainda vale, e acrescentaram as asserções equivalentes do mecanismo novo. Nenhuma asserção antiga foi removida ou afrouxada.

**Riscos.**
1. O caminho antigo (cena sem `faixas_juncao`) mantém o defeito. Em produção o adaptador sempre manda a seção (`sincronizarB`), então o defeito não é exercitado ali; ainda assim é um caminho com defeito conhecido, a remover quando o caminho antigo sair.
2. Payload maior: a carga manda a região de cada faixa de parede, antes calculada no Rust. Não medido.
3. As seções `paredes_z_juncao` e `perfis_z_juncao` passam a valer só no caminho antigo.
4. O binário versionado `packages/geom/assets/geom_wasm.wasm` continua v10 até ser regenerado; testes que carregam o binário padrão falham até lá.

**Resultados (2026-11-04, wasm de `tmp-s3/wasm2`, commit `ac09af62` e anteriores).**

Aceite, saída literal das linhas de resumo:
- (a) `kernel-b3.wasm.test.ts`, 5 sementes: `Tests  43 passed (43)`. `DEFEITO_CONHECIDO` vazia. Maior diferença simétrica 5,27e-6 m² (semente 43 nível 1), dentro da 0049 (K 0,062 medido, adotado 0,14).
- (a) com `B3_SEMENTES=8`: **reprovou**. `Tests  1 failed | 54 passed (55)`. Falha: semente 7, pavimento 3 (nível `lv_x3`), piso 23: corte `false` no Rust e `true` no TypeScript, e região de 0 polígonos no Rust contra 1 no TypeScript. Essa semente nunca tinha sido validada antes (só 1 a 5 e 41 a 43). Não sei se a divergência já existia antes desta entrega; não rodei o commit base para comparar. A causa não foi investigada. Não afrouxei nada.
- (b) `kernel-b3-referencia.test.ts`: `Tests  10 passed (10)`.
- (c) wasm de regressão (a3c, a3d, b1, b2, b5, b1-limiares, b2-limiares): `Test Files  7 passed (7)`, `Tests  161 passed (161)`.
- (c) `cargo test` em `crates/geom-wasm`: `test result: ok. 158 passed; 0 failed`.
- (d) `npx tsc -p tsconfig.json --noEmit`: exit 0, sem saída.
- (e) `npx eslint` nos arquivos tocados: exit 0, 0 erros; único aviso é de arquivo fora do lint (`scripts/gerar-esquema-kernel.mjs`).
- (f) `npx vitest run` (suíte rápida, sem wasm): `Test Files  855 passed (855)`, `Tests  9293 passed | 1 todo (9294)`.

Defeito corrigido nos casos que o motivaram: os cinco casos da antiga `DEFEITO_CONHECIDO` (semente 1 pavimento 2, semente 2 pavimento 0, semente 5 pavimento 1, níveis não adjacentes 43 pavimentos 0 e 1) passam com a lista vazia. O caso mínimo da semente 2 caiu de 0,4125 m² para 9,36e-7 m².

Ajuste de contrato (feito depois do primeiro aceite): a seção `faixas_juncao` passou a valer só quando tem linhas. Antes, uma carga vazia ou depois da remoção das linhas esvaziava a junção, em vez de devolver o cálculo anterior. Os dois testes da harness que falharam (upsert e remoção; entradas inválidas) rodam agora as asserções antigas numa cena sem a seção, onde o caminho anterior ainda vale, e acrescentam as equivalentes do mecanismo novo. Nenhuma asserção antiga foi removida nem afrouxada.

**Riscos.**
1. O caminho antigo (cena sem `faixas_juncao`) mantém o defeito. Em produção o adaptador sempre manda a seção (`sincronizarB`), então não é exercitado ali.
2. Payload maior: a carga manda a região de cada faixa de parede, antes calculada no Rust. Não medido.
3. As seções `paredes_z_juncao` e `perfis_z_juncao` passam a valer só no caminho antigo.
4. O binário versionado `packages/geom/assets/geom_wasm.wasm` continua v10 até ser regenerado; testes que carregam o binário padrão falham até lá.
5. Semente 7 (acima): reprovação aberta, a investigar antes de promover a saída 3.

