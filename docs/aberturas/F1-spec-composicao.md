# F1 · Especificação: composição de portas e janelas (células + perfis)

Data: 2026-10-28. Base: pesquisa [R1..R5](pesquisa-f0/), [E](E-spec-modelo-unico.md), [E3](E3-spec-correcoes-v3.md), HANDOFF de 2026-10-27 (removido; ver histórico do git) §1. Contrato de tipos: `packages/model/src/openingComposition.ts` (ainda fora de `index.ts`). Esta spec não implementa nada. Onde o código real divergiu do brief, vale o código (ver §10, Riscos).

## 1 · Objetivo e casos de uso

A esquadria passa a ser uma **composição**: um conjunto (o vão) dividido em **células** (folha, vidro fixo, painel cego, veneziana), cercadas e separadas por **membros de um quadro** (batente, montantes, travessas, soleira) que usam **perfis paramétricos**. Cobre: porta com bandeira superior e/ou laterais, porta com painel fixo, janela combinada, janelas empilhadas, e abre caminho para bay/bow/canto. Os 106 tipos atuais viram composições de uma célula, sem mudar as peças geradas.

Valores usados nos exemplos (perfil "Madeira batente 5×9" para o batente e "Madeira divisor 5×9" para divisores, ambos sem rebaixo de vidro): `J = 0,05` (largura visível), `D = 0,09`, `OVERLAP = 0,015`, `GAP = 0,004`, alizar 0,07 × 0,015, recuo 0. Coordenadas locais `t` (largura, 0 no centro do vão) e `z` (0 no piso/soleira do vão). Folha efetiva = luz + 2·(0,015 − 0,004) = luz + 0,022 (regra atual do motor).

**Ex. 1 · Porta 90, sem bandeira.** `nominalRef 'leaf'`: folha 0,90 × 2,10, vão = 0,98 × 2,15 (folga NBR 0,08/0,05). Luz `t ∈ [−0,44; 0,44]`, `z ∈ [0; 2,10]`. Célula única (folha). Membros: ombreira esquerda `t [−0,49; −0,44]`, direita `[0,44; 0,49]`, ambas `z [0; 2,10]`; travessa superior `t [−0,49; 0,49]`, `z [2,10; 2,15]`. Folha: `t ±0,451`, `z [0,007; 2,111]`. Alizar (por face): anel interno = luz, externo `t ±0,51`, topo `z 2,17`: lateral esquerda `t [−0,51; −0,44]`, direita `[0,44; 0,51]` (`z [0; 2,10]`), cabeceira `t ±0,51`, `z [2,10; 2,17]`; 3 lados, sem inferior.

**Ex. 2 · Porta 90 + bandeira superior 40.** Camadas de baixo para cima: folha (luz 2,10) · travessa 0,05 · vidro fixo (luz 0,40). Vão = 0,98 × (2,10 + 0,05 + 0,40 + 0,05) = **0,98 × 2,60**; luz total `z [0; 2,55]`. Membros: ombreiras `z [0; 2,55]`; travessa interna `t [−0,44; 0,44]`, `z [2,10; 2,15]`; travessa superior `z [2,55; 2,60]`, `t ±0,49`. Células: folha luz `[−0,44; 0,44] × [0; 2,10]` (folha como no Ex. 1); vidro `[−0,44; 0,44] × [2,15; 2,55]`. Alizar: anel interno = luz `[−0,44; 0,44] × [0; 2,55]`, externo `t ±0,51`, topo `z 2,62`: laterais `z [0; 2,55]`, cabeceira `z [2,55; 2,62]`. Nenhum alizar na travessa interna.

**Ex. 3 · Porta 90 + 2 laterais de 40.** Colunas: vidro (luz 0,40) · montante 0,05 · folha (luz 0,88) · montante 0,05 · vidro (0,40). Vão = **1,88 × 2,15** (`hw = 0,94`). Membros: ombreiras `t [−0,94; −0,89]` e `[0,89; 0,94]`; montantes `[−0,49; −0,44]` e `[0,44; 0,49]`, todos `z [0; 2,10]`; travessa superior `t ±0,94`, `z [2,10; 2,15]`. Células: laterais `[−0,89; −0,49]` e `[0,49; 0,89]`; folha `[−0,44; 0,44]`. Alizar: interno `[−0,89; 0,89] × [0; 2,10]`, externo `t ±0,96`, topo `2,17`; laterais `t [0,89; 0,96]` (e espelho), cabeceira `t ±0,96`, `z [2,10; 2,17]`. Nada nos montantes.

**Ex. 4 · Porta 90 + laterais + superior.** Raiz em linhas: [colunas do Ex. 3] · travessa 0,05 · vidro superior (luz 0,40, largura total). Vão = **1,88 × 2,60**. Membros: ombreiras `z [0; 2,55]`; travessa interna **contínua** `t [−0,89; 0,89]`, `z [2,10; 2,15]`; montantes `z [0; 2,10]` (terminam na travessa); travessa superior `t ±0,94`, `z [2,55; 2,60]`. Alizar: interno `[−0,89; 0,89] × [0; 2,55]`, externo `t ±0,96`, topo `2,62`; laterais `z [0; 2,55]`, cabeceira `z [2,55; 2,62]`.

**Ex. 5 · Janela combinada, 2 células.** Vão 1,60 × 1,20, peitoril 1,00, `nominalRef 'opening'`. Colunas: vidro fixo (luz 0,60) · montante 0,05 · janela de abrir 1 folha (`fill` = 1,50 − 0,60 − 0,05 = 0,85). Luz `t ±0,75`, `z [0,05; 1,15]`. Membros: ombreiras `t [−0,80; −0,75]` e `[0,75; 0,80]` (`z [0,05; 1,15]`); peitoril do caixilho `t ±0,80`, `z [0; 0,05]`; travessa superior `t ±0,80`, `z [1,15; 1,20]`; montante `t [−0,15; −0,10]`, `z [0,05; 1,15]`. Células: fixa `[−0,75; −0,15]`; abrir `[−0,10; 0,75]`, folha `t [−0,096; 0,746]` (janela: dentro da luz, folga de 4 mm por lado). Alizar (4 lados): interno = luz, externo `t ±0,82`; laterais `z [0,05; 1,15]`, cabeceira `z [1,15; 1,22]`, soleira do alizar `z [−0,02; 0,05]`.

## 2 · Modelo de dados

### 2.1 Layout: árvore de divisões

Escolha: **árvore binária-ou-n-ária de divisões `cols`/`rows`** (`SplitNode`), folhas = `CellNode`. Justificativa: (a) cobre todos os casos do item 1 e stacked/combinada com aninhamento (Ex. 4 = `rows[cols[vidro, folha, vidro], vidro]`); (b) cada membro nasce de uma divisão e sua extensão é a área da própria divisão, então **membros nunca se sobrepõem** por construção; (c) tamanhos `fixed`/`fill` dão cotas derivadas sem solver; (d) é a estrutura dos fabricantes (módulos) e do ArchiCAD/Revit (R4, R5: um quadro, divisões internas). Alternativas rejeitadas: grade fixa linhas × colunas (não faz Ex. 4 sem células mescladas) e lista livre de retângulos (permite sobreposição e lacunas). Bay/bow/canto no futuro: um contêiner acima da raiz com várias faces planas, cada uma com sua árvore; o contrato não impede.

`cols`: filhos em `t` crescente; `rows`: em `z` crescente. Entre filhos vizinhos há um divisor. Cada filho tem `size`: `fixed` = **luz** do módulo (entre faces de membros) ou `fill` (peso; no máximo um `fill` por divisão). Soma: `Σ luz + Σ larguras dos divisores = luz do pai`.

### 2.2 Conteúdo de célula

- `leaf`: folha(s) de uma família existente (`OpeningFamilyId`, `plan`, `leaves`) + `LeafOptions` (os mesmos campos atuais: `leafStyle`, `handle`, `glassRatio`, `hinges`, `tiltAxis`, `angle2d`...). `mirror` inverte a dobradiça da célula em relação à instância.
- `glass`: vidro fixo (`GlassSpec`: tipo, espessura, `mounting 'rebate' | 'frameless'`, `grid` decorativo).
- `panel`: painel cego (espessura, material). `louver`: veneziana.
- Qualquer família que hoje aceita `leaves` 2 ou 3 continua em UMA célula (correr de 3 folhas, porta dupla). Duas folhas em células vizinhas só quando há divisor real.

### 2.3 Perfil paramétrico

`ProfileSpec`: `material` (`wood | aluminum | pvc | glass`), `section` (`rect | rect_rebate | L | T | chambered | none`), `visibleWidth`, `depth`, `stopWidth` (batedor, padrão 0,015), `glassRebate {depth, clearance, bead}` e `chambers`. Um membro refere o perfil por `ProfileRef`: preset (com `override`) ou `inline` (usado na migração). O material de **desenho** continua sendo `frameMaterialId` do tipo; `ProfileMaterial` é semântico (orçamento, IFC, padrão de rebaixo). Aço mapeado como `aluminum` até a rodada de aço.

### 2.4 Presets iniciais (editáveis por projeto, `Project.openingProfiles`)

"Confirmado" = dimensão citada em R2. Todo rebaixo, folga, baguete e seção é **a validar** (R2: "NÃO CONFIRMADO").

| Preset | Largura visível / profundidade (m) | Fonte | Estado |
|---|---|---|---|
| Madeira batente 3×14 | 0,03 / 0,14 | R2 SINAPI 90801 | dimensões confirmadas |
| Madeira batente 5×9 (padrão Hestia) | 0,05 / 0,09 | defaults.ts | herdado; usado na migração |
| Madeira aduela 3 | 0,03 / 0,14 | E3 §2 | largura herdada; a validar |
| Madeira marco 3×7 | 0,03 / 0,07 | R2 SINAPI (7×3) | orientação a validar |
| Madeira caixilho 3,5×7 | 0,035 / 0,07 | R2 | confirmado |
| Madeira folha 3,5 | 0,07 / 0,035 | R2 (edital Joinville) | espessura confirmada |
| Madeira montante 4×9 | 0,04 / 0,09 | motor atual (0,04) | herdado |
| Madeira divisor 5×9 | 0,05 / 0,09 | derivado | a validar |
| Alumínio linha 25 | 0,03 / 0,06 | R2 (batente 60–70) | profundidade confirmada |
| Alumínio linha 25 moldura 11 | 0,03 / 0,11 | R2 (Bergamo 110) | profundidade confirmada |
| Alumínio linha 20 | 0,025 / 0,08 | R2 (Bergamo 80) | profundidade confirmada |
| Alumínio Suprema | 0,035 / 0,06 | R2 (contramarco 60) | a validar |
| Alumínio divisor 25 | 0,025 / 0,06 | derivado | a validar |
| PVC 60 (3 câmaras) | 0,06 / 0,06 | R2 (Euro-Design 60) | profundidade confirmada |
| PVC 70 (5 câmaras) | 0,07 / 0,07 | R2 (Aluplast 4000) | profundidade confirmada |
| PVC divisor 60 | 0,08 / 0,06 | derivado | a validar |
| Vidro temperado 8 mm sem perfil | 0 / 0,008 | R2 | espessura confirmada |
| Vidro temperado 10 mm sem perfil | 0 / 0,010 | catálogo atual | herdado |

Padrões a validar: rebaixo do vidro profundidade 0,012, folga 0,003, baguete 0,015; vidro sem perfil: folga 0,005. Larguras visíveis de alumínio e PVC são estimativas.

### 2.5 Referência nominal (`nominalRef` / `spanGap`)

`NominalSpec {ref, width, height, gap, nominalCellId}`. `ref 'opening'`: `width/height` = vão total. `ref 'leaf'`: são a **folha nominal** da célula `nominalCellId` (padrão: a primeira célula `leaf`), que passa a ser `fill`; **vão = folha + `gap` (0,08 / 0,05) + soma dos demais módulos fixos e divisores** ao longo das duas direções. Ex. 3: 0,90 + 0,08 + 2·(0,40 + 0,05) = 1,88. A folha efetiva sai 0,902 (luz + 0,022), como hoje (ver §10, pergunta 3). `openingSpanOf`/`leafSizeOf` passam a delegar a `compositionSpan` quando há composição de mais de uma célula; com uma célula são idênticas ao que existe.

### 2.6 Alizar

`CasingSpec`: `faces` (`both` padrão, `swing`, `opposite`, `exterior`, `interior`, `none`), `width`, `thickness`, `setback` (≥ 0, padrão 0), com dimensões próprias por face (`exterior`, `interior`). Substitui `casing {width, thickness, sides}`.

## 3 · Regras de montagem do quadro

### 3.1 Membros

Perímetro: 2 ombreiras (`jamb`), travessa superior (`head`), inferior (`sill`, só janela, ou `threshold` da porta quando o tipo tem soleira). Internos: `mullion` (divisor de `cols`) e `transom` (divisor de `rows`). Todos usam o perfil do quadro, exceto divisores, que usam `SplitNode.divider` (padrão: largura 0,05, material do quadro).

### 3.2 Pertencimento (quadro de apoio por célula)

Há **um único quadro** por conjunto (R1, R4, R5: batente-contorno + membros internos; nunca batente duplicado entre módulos). O "quadro de apoio" de cada célula é derivado: as quatro bordas da célula, cada uma resolvida a um segmento de membro. O membro não é da parede nem de uma célula só: a **seção do membro é orientada para cada vizinho** (batedor, rebaixo de vidro ou nada).

### 3.3 Profundidade e posição

Todos os membros ocupam a mesma faixa `s` do batente do conjunto: `D` e centro `Cd` por `frameDepthMode` (padrão `core`, via `openingFrameDepth`). `profile.depth` só vale em modo `fixed`; em `core` e `wall` manda a parede. Sem retorno do acabamento quando há batente; o recorte do retorno usa a união dos contornos de todos os membros.

### 3.4 Extensão e juntas (sem sobreposição)

`head` e `sill` percorrem a largura externa total; as ombreiras vão só da luz entre eles (como o motor atual: ombreira `0..H−J`, travessa `−hw..hw`). Cada divisor interno percorre exatamente a **área da sua divisão**: um `transom` raiz atravessa a luz toda (Ex. 4) e os `mullion` abaixo dele terminam nele. Juntas de topo (sem esquadria a 45°). Consequência: a união dos membros e das luzes das células cobre 100% do vão (invariante de cobertura de E3 §8).

### 3.5 Tabela de decisão por borda de célula

| Conteúdo da célula | Vizinho na borda | Membro | Seção voltada à célula |
|---|---|---|---|
| folha | parede (esq., dir., topo) | ombreira/travessa externa | batedor na face OPOSTA à abertura; folha do lado `leafSide`, rebaixo `L + GAP` |
| folha | outra célula `leaf` | divisor | T com batedor para cada folha (mesma face se as aberturas coincidem, faces opostas se não) |
| folha | célula `glass`/`panel` | divisor | batedor do lado da folha; rebaixo de vidro do outro lado |
| folha | piso | nenhum (ou `threshold` do tipo) | folha com folga inferior `leafUndercut` |
| folha | piso, janela | peitoril do caixilho | rebaixo/batedor da folha |
| `glass`/`panel` | parede | membro externo | rebaixo de vidro; baguete na face INTERIOR (a validar) |
| `glass`/`panel` | outra célula | divisor | rebaixo para cada lado |
| `glass`/`panel` | piso (porta) | travessa-base (`sill`) do perfil divisor | rebaixo (ver §10, pergunta 2) |
| `glass` frameless | qualquer | nenhum perfil | folga `FRAMELESS_CLEARANCE_DEFAULT`, sem rebaixo |
| célula em `rows` | outra célula acima/abaixo | `transom` | conforme as linhas acima |

Estilo `block` (sem batente): nenhum membro; vale o comportamento atual de célula única e é inválido em composições de mais de uma célula (aviso).

### 3.6 Folha: face do batedor

A folha fica do lado de abertura (`leafSide 'swing'` padrão) e **encosta no batedor da face oposta**, como em E §3.1. Cada célula `leaf` usa o seu `side`/`hand` (instância, com `mirror` por célula). A dobradiça segue a regra de E3 §5, sem mudança.

## 4 · Alizar

Regra (decidida pelo dono): por face da parede, nas duas faces por padrão; largura e espessura próprias; exclusivo com o retorno do acabamento (com alizar `closure` efetivo = `none`); contorna o **conjunto**; sem alizar em divisores internos; porta 3 lados; janela 4 lados.

Geometria, para cada face habilitada:
1. `luz` = envoltória das luzes de todas as células (retângulo `[t0,t1] × [z0,z1]`).
2. Anel interno = `luz` expandida de `setback` (aresta interna alinhada à face interna do batente; o recuo mostra mais batente).
3. Anel externo = anel interno expandido de `width`.
4. Porta: três barras (esquerda e direita de `z0` à altura do anel interno, cabeceira de `t` externo a `t` externo, em `[z1_interno; z1_interno + width]`); com bandeira superior, `z1` da luz já é o topo dela, então o alizar sobe até lá. Janela: acrescenta a barra inferior em `[z0 − width; z0]`.
5. Sólido: `s` de `T/2` a `T/2 + thickness` (e espelho), sobre a face acabada; peças com `group 'casing-<face>'` (uma silhueta por face).
6. Face `exterior`/`interior` vem do `WallFrame`; `swing`/`opposite` são relativos à folha principal.

Casos: porta sem bandeira (Ex. 1), com bandeira (Ex. 2), com laterais (Ex. 3), tudo (Ex. 4), janela (Ex. 5); porta com 1 lateral só: 3 lados do conjunto assimétrico. Alizar exige que a luz esteja no perímetro do quadro; em vão sem batente (`block`) o anel parte da borda do vão.

## 5 · Vidro e rebaixo

Vidro não é perfil: tem tipo (`OpeningGlassKind`), espessura (`glassThickness`, padrão 0,012) e `mounting`. Com `rebate`, a placa entra no rebaixo do perfil vizinho: extensão da placa = luz + 2·`max(0, depth − clearance)` por borda (padrão 0,012 − 0,003 = 0,009). Sem `glassRebate` no perfil (perfis migrados), a placa = luz, como hoje. A espessura da placa fica centrada em `Cd` (ou no plano da folha, quando o vidro está numa folha). Baguete: peça `bead` de largura `glassRebate.bead` na face interior (a validar). Vidro temperado frameless: sem rebaixo, placa = luz − 2·folga, com folga editável.

## 6 · Integração com o que existe

- **`nominalRef`/`spanGap`:** §2.5; `openingSpanOf`/`leafSizeOf` mantêm a assinatura.
- **`leafPlan`:** continua por tipo (`open` padrão); aplica-se às células `leaf`; vidro, painel e bandeiras nunca têm folha em planta.
- **`frameDepthMode`:** vai para `frame.depthMode`.
- **Closure/retorno:** `wrap.ts` recorta pelo contorno de TODOS os membros; alizar força `none`.
- **Quadro de esquadrias:** uma linha por tipo com folha nominal, vão total e a lista de células (resumo "porta + 2 laterais + bandeira"); ferragens só das células `leaf`.
- **Planta/corte/elevação:** desenham as peças do motor; planta mostra só folhas abertas; corte e elevação ganham membros internos e vidro de bandeira; sem regra nova de desenho além do alizar unido por face.
- **3D:** nada de lógica nova; novas peças (`mullion`, `transom`, `bead`) no mapa de papéis/materiais.
- **IFC:** um `IfcDoor`/`IfcWindow` por conjunto, `IfcRelAggregates` com `IfcMember` por membro e `IfcPlate` por vidro (a decidir em F5c; o contrato não impõe).
- **DXF:** consome as peças do motor; layers novos para membros internos.

## 7 · Migração

**Versão:** `SCHEMA_VERSION` 19 → 20. O passo v19→v20 de `migrate.ts`: escreve `composition` em cada tipo, semeia `Project.openingProfiles` com os 18 presets e não toca em instâncias (`Opening`). Arquivos antigos abrem pela cadeia normal; arquivos v20 em programa v19 são recusados (`SchemaError`, comportamento atual). Ponte durante F3–F5: o comando que edita campos obsoletos de um tipo de uma célula regenera `composition = compositionOfType(tipo)`; o leitor `openingCompositionOf(t) = t.composition ?? compositionOfType(t)`.

**Mapeamento (tipo atual → composição de uma célula):**

| Campo atual | Destino |
|---|---|
| `width`, `height`, `nominalRef`, `spanGap` | `nominal` (`ref`, `width`, `height`, `gap`) |
| `plan`, `leaves` | `content.plan`, `content.leaves`; `family` por `openingFamilyOf` |
| `frameWidth`, `frameDepth` | `frame.profile = inline` (`visibleWidth`, `depth`; material pelo `frameMaterialId`) |
| `frameStyle`, `frameDepthMode` | `frame.style`, `frame.depthMode` |
| `grid` | `glass.grid` (janela fixa) ou `options.grid` |
| `leafStyle`, `handle`, `glassRatio`, `hinges`, `leafThickness`, `leafMaterialId`, `glassKind`, `glassThickness`, `tiltAxis`, `leafSide`, `leafUndercut`, `handleHeight`, `handleInset`, `angle2d`, `angle3d`, `showSwing`, `swingStyle`, `leafPlan` | `content.options` |
| `casing {width, thickness, sides}` | `casing {faces, width, thickness, setback 0}` |
| `transom {height, fixed}` | `rows`: [célula principal `fill`, divisor 0,04 (`LEGACY_TRANSOM_BAR`), `glass` fixa de `min(height, 0,4·H)`]; `fixed:false` → célula maxim-ar |
| `sidelights {left, right, width}` | `cols`: vidros de `min(width, W/2)` nas laterais ligadas, divisor 0,04 (`LEGACY_SIDELIGHT_MULLION`); a célula principal vira `fill` |
| `transom`/`sidelights` com `nominalRef 'leaf'` | `nominal.ref = 'opening'` com o vão atual (a folha encolhia; hoje o catálogo não usa) |

Permanecem no tipo: `id, kind, name, code, description, sill, frameMaterialId, glassMaterialId, closure, roughOversize, sillBoard, lintel, sillBeam, threshold, reveal, planDisplay, detail2d, detail3d`, dados BIM e `cost`. `width`/`height` continuam como resumo (= `nominal`).

**Obsoletos** (congelados em v20, lidos só por `compositionOfType`, removidos em F8): `frameWidth, frameDepth, frameDepthMode, frameStyle, grid, transom, sidelights, casing, nominalRef, spanGap` e os campos de folha acima.

**Teste de equivalência (exato).** Para cada tipo de `DEFAULT_OPENING_TYPES` + catálogos (106 tipos), em `flipHand × flipFacing` ∈ {0,1}², em parede de núcleo (`core`) e `frameDepthMode 'wall'`, com `casing` ligado e desligado: `A = buildOpeningModel(tipo antigo, builders antigos)` e `B = buildOpeningModel(tipo com composition)`. Ordenar por `id` e exigir: mesmo conjunto de ids; `role`, `material`, `group`, `leaf`, `dashed`, `motion` iguais; `box` e `profile.pts` iguais com tolerância `EQUIVALENCE_TOLERANCE`; `openings`, `void`, `width`, `height`, `core` iguais. Os builders antigos permanecem até F8 (depois, o teste compara com golden gravado). Tipos antigos com `transom`/`sidelights` NÃO entram na igualdade (os builders atuais têm o bug conhecido de E3 §7): para eles vale o teste de cobertura (§8, item 12).

## 8 · Plano de testes de aceite (para F2)

Exemplos em `buildOpeningModel`, parede 0,20 com núcleo, perfis do §1, tolerância 1e-6:
1. Ex. 1: vão 0,98 × 2,15; ombreiras e travessa nas caixas do §1; folha `t ±0,451`, `z [0,007; 2,111]`; 3 peças de alizar por face (6 no total).
2. Ex. 2: vão 0,98 × 2,60; travessa interna `z [2,10; 2,15]`; vidro `z [2,15; 2,55]`; alizar topo 2,62, sem barra na travessa interna.
3. Ex. 3: vão 1,88 × 2,15; montantes `[−0,49; −0,44]`/`[0,44; 0,49]`; vidros de 0,40; alizar externo `t ±0,96`; nenhuma peça de alizar com `|t| < 0,89`.
4. Ex. 4: vão 1,88 × 2,60; travessa interna contínua `t ±0,89`; montantes até `z 2,10`; alizar topo 2,62, laterais `z [0; 2,55]`.
5. Ex. 5: vão 1,60 × 1,20; células 0,60 e 0,85; montante `[−0,15; −0,10]`; folha `t [−0,096; 0,746]` (janela: dentro da luz, folga de 4 mm por lado); alizar de 4 lados, soleira `z [−0,02; 0,05]`.
6. `resolveLayout`: soma das luzes + divisores = luz do pai; ids únicos; no máximo um `fill` por divisão (`compositionIssue`).
7. Cobertura: para os Ex. 1–5, flips e `leaves` variados, a união de membros + luzes das células cobre 100% do vão (folgas ≤ 0,01) e membros não se sobrepõem (área de interseção 0).
8. Sem sobreposição de volumes entre membros, folha, vidro e alizar, fechado e aberto (varredura de 5°, E3 §5).
9. Alizar: `closure` efetivo `none`; `setback 0,01` desloca a aresta interna 0,01; `faces 'exterior'` gera só uma face; janela tem 4 barras e porta 3, em todos os Ex.
10. Equivalência exata (§7) para os 106 tipos.
11. Migração: arquivo v19 com tipos e instâncias abre em v20; `composition` presente; idempotente; `nominalRef 'leaf'` conserva vão 0,98 × 2,15 e folha 0,902.
12. Tipos antigos com `transom` e `sidelights` migrados: cobertura total, sem peça fora do vão.
13. `nominalRef 'leaf'` em composição de várias células: vão = folha + gap + módulos (Ex. 3: 1,88).
14. Rebaixo: perfil "Madeira caixilho 3,5×7" com `glassRebate` padrão: placa = luz + 0,018; perfil sem rebaixo: placa = luz.
15. Planta com `leafPlan 'open'`: só folhas abertas; nenhum desenho de folha para vidro ou painel.
16. Quadro de esquadrias: Ex. 4 aparece em 1 linha com vão 1,88 × 2,60 e folha 0,90 × 2,10.

## 9 · Divisão do trabalho em arquivos

Regra: cada fase mexe em arquivos que as outras não tocam; o que é compartilhado fica só com o dono da fase indicada.

- **F3 · modelo e migração** (`packages/model/src`). Novos: `openingCompositionLayout.ts` (`resolveLayout`, `compositionSpan`), `openingCompositionOf.ts` (`compositionOfType`, `openingCompositionOf`), `openingCompositionRules.ts` (`normalizeComposition`, `compositionIssue`, `casingRings`), `openingProfiles.ts` (presets, `resolveProfile`), testes `*.test.ts`. Mudam: `types.ts` (`SCHEMA_VERSION` 20, `OpeningType.composition?`, `Project.openingProfiles?`), `migrate.ts`, `index.ts` (exportar o contrato), `openingNominal.ts` (delegar), `commands.ts` (ponte do §7). **Único dono de `types.ts`, `migrate.ts` e `index.ts`.**
- **F4 · motor** (`packages/engine/src`). Novos: `openingModelComposition.ts` (orquestra), `openingModelMembers.ts` (membros com perfil), `openingModelCells.ts` (conteúdo das células), `openingModelCasing.ts` (alizar), testes. Mudam: `openingModel.ts` (despacho), `openingModelContext.ts` (`makeCtx` lê a composição), `wrap.ts` (retorno). `openingModelDetails.ts` e `Doors/Windows*` ficam congelados (builders antigos para o teste de equivalência).
- **F5a · planta/corte/elevação:** `packages/render/src/plan/build.ts`, `packages/engine/src/section.ts`, `packages/geom/src/openingSymbol.ts` (só se o símbolo precisar de células). **F5b · 3D:** `packages/render/src/model3d/aberturas3d.ts`, `openingParts.ts`. **F5c · quadro/IFC/DXF:** `packages/engine/src/openingSchedule.ts`, `packages/io/src/ifc/ifcElements.ts`, `ifcSolids.ts`, `apps/web/src/editor/dxfExport.ts`. Os três em paralelo, após F4.
- **F6 · UI** (`apps/web/src/ui/dialogs/openingType/`). Novos: `composition/LayoutTree.tsx`, `composition/CellEditor.tsx`, `composition/ProfileEditor.tsx`, `composition/CasingPanel.tsx`, `composition/compositionControls.ts`. Mudam: `components.ts`, `OpeningTypeSections.tsx`, `previewProject.ts`, `previewViews.ts`, `openingTypeFields.ts`. Em paralelo com F5.
- **F7 · catálogo** (`packages/model/src`). Novos: `catalogoComposicoes.ts`, `catalogoComposicoes.test.ts`. Mudam: `catalogoAberturasBase.ts` (helper de composição), `templateEsquadrias.ts`. Só depende de F3.

Ordem: F3 → (F4, F7) → (F5a, F5b, F5c, F6) → F8 (remover campos obsoletos e builders antigos).

## 10 · Perguntas em aberto e riscos

**Perguntas ao dono**
1. **Quem é o dono do batente?** O brief diz que o batente pertence à folha/módulo; a pesquisa (R1, R4, R5) indica UM quadro por conjunto com divisores internos. Este spec faz um quadro único, com a seção de cada membro orientada para a célula vizinha (§3.2). Recomendação: manter; confirma?
2. **Vidro lateral que chega ao piso:** precisa de travessa-base? Recomendação: sim, membro `sill` baixo (largura do divisor) sob células `glass`/`panel` no piso, nunca sob a folha.
3. **Folha efetiva 0,902 para nominal 0,90** (herdado do motor: luz + 0,022). Recomendação: manter para a equivalência e rever em F8.
4. **Largura e profundidade do divisor padrão:** 0,05 (igual ao batente) ou 0,04 (montante antigo)? Recomendação: 0,05 e profundidade igual ao batente.
5. **Baguete na face interior por padrão** (segurança) e vidro frameless com folga 0,005. Recomendação: sim, ambos editáveis.
6. **Mão da dobradiça por célula:** global na instância mais `mirror` por célula. Recomendação: sim.

**Riscos:** (a) presets de alumínio/PVC são estimativas; precisam de catálogos de fabricante (R2, lacunas 1–5); (b) o código real diverge do brief em dois pontos: a bandeira de janela existe em `buildWindowTransom` e o bug de E3 §7 já pode ter sido tratado (conferir antes da F4), e `nominalRef 'leaf'` já está implementado (E2a); (c) arquivos v20 não abrem em programa v19; (d) bay/bow/canto exigem faces com ângulo, fora do contrato; (e) o dono validará a regra do alizar no 3D (pode mudar `setback` e o tratamento de laterais assimétricas); (f) `packages/model/src/index.ts` e `types.ts` concentram conflitos: manter F3 como único dono.
