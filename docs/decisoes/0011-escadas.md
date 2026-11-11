# Decisão 0011 · Escadas

Fontes: `docs/escadas/` (relatório externo em fonte primária: Revit 2026, ArchiCAD 29, NBR 9050:2020, NBR 9077, IT 11, IFC 4.3).
Decidido pelo dono do projeto em 2026-10-21: (1) A5 dos telhados reclassificado como fora de escopo da v1; (2) furo na laje
automático; (3) guarda-corpo fica para a etapa própria; (4) perfil de norma abaixo; (5) escada de vários andares e IFC depois.

## 1 · Decisões

| # | Decisão | Motivo |
|---|---|---|
| 1 | **O croqui é a representação única do lance.** Um lance é: limite esquerdo, limite direito, linhas de espelho e linha de caminhada (opcional). Os geradores (reto, L, U, leque) só produzem esse croqui; o modo croqui o deixa livre (retas e arcos) | Mesmo comportamento do Revit (Create Sketch) com um só motor de geometria; croqui livre desde o primeiro dia |
| 2 | Patamar é croqui também: contorno fechado de retas e arcos, plano, na cota do último espelho do lance anterior. Liga-se ao lance só por ordem (a sequência de componentes), sem vínculo paramétrico | Revit: `CreateSketchedLanding` exige laço fechado; "sem relação automática" (B7) |
| 3 | Sequência de componentes: a escada guarda `components` em ordem (lance, patamar, lance...). A cota de um patamar é a base + (nº de espelhos dos lances anteriores) × altura do espelho | Sem cota explícita no patamar; nada a dessincronizar |
| 4 | Altura do espelho real h = H ÷ N, com H = cota do topo − cota da base e N = nº de linhas de espelho DISTINTAS de todos os lances. Uma linha de emenda entre dois lances consecutivos sem patamar (mesmas pontas, nas duas ordens, tolerância 1 mm) conta uma vez e pertence ao lance anterior (`sharesRiser`, em `stairs.ts`). O nº desejado é `ceil(H / espelhoMáximo)` (hipótese do relatório A5: confirmar no experimento E1 do Revit). Erro `stair-riser-too-high` quando h > espelho máximo do tipo; aviso `stair-risers-count` quando N ≠ nº desejado (`stairIssues.ts`) | Revit B4/A5 |
| 5 | Espelhos que ultrapassam um limite são APARADOS ao limite; erro quando toca/ao longo do limite, cruza outro espelho, cruza o limite mais de uma vez ou tem as duas pontas no mesmo limite em escada com dois limites (mensagens no §3) | Revit B6/B14 |
| 6 | Convenção de degraus: N espelhos dão N−1 degraus dentro do lance. O espelho k (1..N) vai da cota base+(k−1)h até base+kh; o degrau k (entre os espelhos k e k+1) tem o topo em base+kh; o último espelho encosta no piso superior (ou no patamar). Opções "começa com espelho"/"termina com espelho" ficam fixas em ligado na v1. Numeração na planta: contínua pela cota (§7) | Revit B4 (pisos = espelhos − 1) |
| 7 | Cota de base = elevação do nível da escada + `baseOffset`; cota do topo = elevação do nível de topo + `topOffset`. O nível de topo padrão é o nível imediatamente acima (`levelAbove`); sem nível acima, vale `height` (padrão = pé-direito de parede padrão). Topo até 1 mm acima da base ou abaixo dela: erro `stair-top-not-above` (regra do modelo, `validateStairs.ts`); a escada não gera degraus, espelhos nem furo (§3) | Revit: Base/Top Level + Offsets |
| 8 | Tipo da escada (`StairType`): espelho máx. 0,18 m, piso mín. 0,28 m, largura mín. do lance 0,80 m, estilo do lance (`monolithic` ou `assembled`), profundidade estrutural (monolítico, padrão 0,20 m; perpendicular à rampa, decisão 0012), face inferior `undersideStyle` lisa (`smooth`, padrão) ou escalonada (`stepped`), só monolítico, espessura do piso (assembled, 0,03 m) e do espelho (assembled, 0,02 m), nariz (0,015 m, só 3D/quantitativo), espessura do patamar (0,15 m), pé-direito livre mínimo (2,10 m), material. Sem apoios laterais nem central na v1 | Revit A10–A13 simplificado; apoios (stringer/carriage) ficam para depois (fora de escopo v1) |
| 9 | Regras do tipo (espelho máx., piso mín.) valem só para o lance CALCULADO (gerador); no croqui livre elas não bloqueiam, mas a altura real do espelho continua limitada pelo máximo do tipo | Revit A10 + B4 |
| 10 | Perfil de norma (avisos, nunca bloqueio): espelho 0,16–0,18 m, piso 0,28–0,32 m, 2e+p entre 0,63 e 0,64 m (interseção NBR 9050 × NBR 9077), degraus iguais (piso entre espelhos consecutivos de um lance reto que varia mais de 5 mm é aviso `stair-uneven`; leque não avisa), patamar a cada 3,20 m de desnível e comprimento ≥ 1,20 m, largura ≥ largura mínima do tipo, folga de cabeça ≥ pé-direito livre do tipo (2,10 m), degraus do leque com piso ≥ 0,28 m a 0,55 m da borda interna (**pendente**: não implementado). Valores em `DEFAULT_STAIR_NORMS` (`stairNorms.ts`), constante do engine passada a `stairNormIssues`; **não são editáveis no projeto** (`Project.settings` não tem campos de norma: pendente) | Divergências normativas: não bloquear |
| 11 | Furo na laje e no piso do nível de topo é DERIVADO (não guardado) e é POR ELEMENTO: cada laje ou piso do nível de topo recebe a união das projeções dos degraus (e patamares) cuja folga até a face inferior DAQUELE elemento é ≤ `folgaMínima` (a escada ainda não passou pela laje com folga de cabeça); regra completa no §6. Recalcula sozinho ao mover a escada. O modo de abertura por escada é o item 15 (substitui o "Abrir laje" booleano) | Dono: furo automático. Fora de paridade (Revit e ArchiCAD pedem Shaft/Solid Element Operations) |
| 12 | Guarda-corpo/corrimão: fora desta etapa (etapa própria "guarda-corpo") | Dono |
| 13 | Escada de vários andares, IFC e apoios (stringer/carriage): fora desta etapa | Dono |
| 14 | A conversão de lance gerado em croqui é livre (o gerador só preenche o croqui); o lance guarda `generatedBy` para saber a origem, sem vínculo paramétrico depois da edição manual. Diferença consciente em relação ao Revit (conversão irreversível) | Menos atrito; sem regra paramétrica a manter |
| 15 | Abertura da laje por escada (§6): modo **pé-direito livre** (padrão; folga `openingHeadroom`, ou o mínimo do tipo), **contorno completo** (projeção inteira, degraus e patamares) ou **sem abertura**; folga lateral `openingMargin` (0,05 m) e furo retangular `openingRect` (envolvente de menor área). Tudo derivado. Substitui o booleano `openSlab` (migração 13 → 14: ligado = pé-direito livre, desligado = sem abertura) | Dono: abertura configurável por escada, com o furo sempre derivado |

## 2 · Modelo de dados (packages/model)

```ts
/** Reta (sag = 0) ou arco por flecha, mesma convenção das paredes (arcFromSagitta). */
export interface StairCurve { a: Vec2; b: Vec2; sag: number }

export interface StairRun {
  id: Id; kind: 'run';
  boundaryLeft: StairCurve[];   // cadeia contínua, esquerda no sentido de subida
  boundaryRight: StairCurve[];  // cadeia contínua, direita
  risers: StairCurve[];         // linhas de espelho; a ordem no vetor NÃO importa (ordenadas pela caminhada ou pela direção)
  path: StairCurve[];           // caminhada opcional (cadeia), do primeiro ao último espelho; vazia = automática
  generatedBy?: 'straight' | 'lshape' | 'ushape' | 'winder';
}
export interface StairLanding { id: Id; kind: 'landing'; boundary: StairCurve[] /* laço fechado */ }

export interface Stair {
  id: Id; kind: 'stair'; levelId: Id; typeId: Id;
  topLevelId: Id | null; baseOffset: number; topOffset: number; height: number;
  components: Array<StairRun | StairLanding>;
  openingMode: 'headroom' | 'full' | 'none';  // abertura da laje (padrão 'headroom'; decisão 15)
  openingHeadroom: number | null;             // pé-direito livre do furo; null = minHeadroom do tipo
  openingMargin: number;                      // folga lateral em volta do furo (padrão 0,05 m)
  openingRect: boolean;                       // furo = retângulo envolvente de menor área (padrão false)
  mark: string; comments: string; order: number;
}
export interface StairType { id: Id; name: string; maxRiser: number; minTread: number; minRunWidth: number;
  runStyle: 'monolithic' | 'assembled'; undersideStyle: 'smooth' | 'stepped' /* decisão 0012 */; structuralDepth: number; treadThickness: number; riserThickness: number;
  nosing: number; landingThickness: number; minHeadroom: number; materialId: Id; /* + campos de catálogo como os outros tipos */ }
```
`DEFAULT_STAIR_TYPES` (Escada monolítica concreto; Escada de piso e espelho); `makeStair`; comandos `addStair`, `updateStair`
(via `updateElements`), `upsertStairType`, `deleteStairType` (bloqueado se em uso), `setLevel...` como os demais; migração
`SCHEMA_VERSION` 11 → 12 (projetos sem escadas ganham `stairTypes` padrão); `levelAbove(project, levelId)` em `queries.ts`. Cadeia até a versão atual (15):
12 → 13 (`undersideStyle: 'smooth'`, decisão 0012), 13 → 14 (abertura da laje, §6), 14 → 15 (intervalo de vista, decisão 0013).

## 3 · Validação do croqui e da escada — códigos e mensagens (pt-BR)

Origem no código: croqui em `stairSketchGeom.ts` e `stairSketchValidate.ts`; tipo e norma em `stairIssues.ts` e `stairChecks.ts`;
topo em `validateStairs.ts` (modelo).

| Código | Mensagem | Origem (Revit) |
|---|---|---|
| `stair-boundaries-touch` | "Os limites esquerdo e direito do lance não podem se tocar." | B14 |
| `stair-boundary-gap` | "Cada limite deve ser uma cadeia contínua de retas e arcos." | B14 |
| `stair-riser-on-boundary` | "Parte do espelho está sobre o limite: não é permitido." | "Part of the riser lies on the boundary…" |
| `stair-riser-crossing` | "Espelhos que se cruzam não são permitidos." | "Crossing risers…" |
| `stair-riser-boundary-multi` | "O espelho cruza o mesmo limite mais de uma vez." | "Riser intersects with boundary more than once." |
| `stair-riser-not-spanning` | "Cada espelho deve ligar o limite esquerdo ao direito." | B14 |
| `stair-riser-same-location` | "Dois espelhos ocupam a mesma posição." | "…same location along the boundary line." |
| `stair-path-ends` | "A caminhada deve ir do primeiro ao último espelho." | B14 |
| `stair-path-misses-riser` | "A caminhada não cruza todos os espelhos." | "The stairs path doesn't intersect with riser lines." |
| `stair-risers-count` | "O nº de espelhos (N) difere do nº desejado (D): adicione/remova espelhos ou ajuste a altura." | "Actual Number of Risers is different…" |
| `stair-riser-too-high` | "A altura real do espelho (X m) excede a máxima do tipo (Y m)." | "Computed actual riser height…" |
| `stair-width-min` | "A largura do lance (X m) é menor que a mínima do tipo (Y m)." | "Actual run width is less than minimum…" |
| `stair-tread-min` | "O piso (X m) é menor que o mínimo do tipo (Y m)." (só lance gerado) | A22 (regra: atual ≥ mínimo). **Não implementado**: nenhum código emite este aviso; o gerador já usa o piso mínimo (`treadFor`), então o caso não surge no lance gerado |
| `stair-landing-open` | "O contorno do patamar deve ser um laço fechado." | B7 |
| `stair-top-not-above` | "O nível de topo deve estar acima do nível da escada." | Decisão 7 (regra do modelo, `validateStairs.ts`, não do croqui): cota do topo ≤ cota da base + 1 mm. Erro: o motor não gera degraus, espelhos nem furo (`resolveStairs` com altura 0; testes em `stairTopAbove.test.ts`) |

Severidade: erros de croqui (acima) deixam sem degraus só o lance afetado. `stair-riser-too-high` e `stair-top-not-above` são erros da
escada: na malha 3D e no corpo monolítico (`stairBody`, `buildStairSolids`) qualquer erro da escada zera o corpo, e o volume da
monolítica sai zero. Os de norma, `stair-width-min` e `stair-headroom` são `warning`.

## 4 · Algoritmo do degrau (engine: `stairSketch.ts`, função pura)

`stairRunSteps(run, { baseZ, riserHeight })` →
1. Amostrar arcos em polilinhas (flecha máx. 0,3 mm). Ordenar os espelhos: pela caminhada explícita (posição da interseção ao longo
   dela) se existir; senão pelo comprimento ao longo da linha média dos limites (`midlinePoly`, em `stairSketchGeom.ts`: pontos
   médios de L(f) e R(f), com f a fração de comprimento de cada limite, orientada para a subida). Por isso vale acima de 180°: a corda
   de um arco inverte de lado, a linha média não. Aparar cada espelho ao interior dos limites.
2. Degrau k (k = 1..N−1) = polígono limitado pelo espelho k, o trecho do limite direito entre os pontos de k e k+1, o espelho k+1
   (invertido) e o trecho do limite esquerdo; topo em `baseZ + k·h`. Espelho k = segmento aparado com base em `baseZ + (k−1)h` e topo
   em `baseZ + k·h`.
3. Saída: `{ treads: Array<{ polygon: Ring; z: number }>; risers: Array<{ a: Vec2; b: Vec2; z0: number; z1: number }>; footprint: MultiPolygon }`.
Invariantes (testes de propriedade): degraus disjuntos; união dos degraus = região entre o 1º e o último espelho dentro dos limites;
áreas > 0; cotas estritamente crescentes com passo `h`; N espelhos → N−1 degraus; subida total = N·h.

## 5 · Geradores
`straight(start, dir, width, risers, tread)`; `lshape`, `ushape` (patamar automático = largura do lance); `winder` (espelhos radiais). Todos
devolvem `StairRun[]`/`StairLanding[]`. Regra do piso calculado: p = clamp(0,63 − 2h; pisoMín; 0,32); comprimento do lance = (N−1)·p. O leque (`generateFanRun`) recusa
varredura ≥ 360° (`RangeError`) e divide arcos acima de 90° em trechos.

## 6 · Abertura da laje (decisão 15; engine: `stairOpenings.ts`)

Por escada, `openingMode` escolhe a região que cada laje e cada piso do nível de topo perde. O furo é **por elemento**: cada laje
usa a própria cota da face inferior, e a região é recortada só na área dela. Tudo é derivado a cada resolução; nada é gravado no
elemento. (Antes, uma única cota e uma única espessura, a maior das lajes que cobrem a escada, valiam para todas: duas lajes com
offsets diferentes recebiam o mesmo furo, na mesma posição. Corrigido: `resolveSlabs`/`resolveFloors` → `stairHolesFor(openings,
faceInferiorDoElemento)` → `cutStairOpenings`.)

**Cota da face inferior de cada elemento.**
- Piso e laje plana: `bottomZ` = cota do nível de topo + `heightOffset` − espessura total do tipo (a mesma de `resolveFloors`/`resolveSlabs`).
- Laje inclinada: a **menor** cota da face inferior no contorno (`coverUnderside`: a face inferior sobe com a face superior, `slabRiseAt`,
  e o mínimo de uma função linear sobre o polígono é atingido num vértice). O furo fica conservador: aceita cortar um pouco mais de
  degrau, mas a folga de cabeça fica garantida em qualquer ponto da laje.

**Regra por modo.**
1. **`headroom` (pé-direito livre, padrão).** Usa `H = openingHeadroom ?? type.minHeadroom`. Um degrau (ou patamar) de cota de topo `z`
   sai daquele elemento quando `faceInferiorDoElemento − z ≤ H`. A cota de referência é a do topo do degrau: o piso é plano, então o
   nariz e o resto do degrau estão na mesma cota. Consequências: laje mais alta (face inferior mais alta) tira menos degraus, e o furo
   começa mais à frente na escada; laje mais baixa (offset negativo) tira mais degraus; se a face superior do elemento ficar abaixo do
   topo de algum degrau, os degraus que passam por ele também saem (furo coerente, sem exceção); com a face inferior abaixo de todos
   os degraus, a escada inteira sai.
2. **`full` (contorno completo).** A região é a pegada inteira da escada, sem olhar a cota: igual para todos os elementos que a
   cobrem, cada um recortado na sua área.
3. **`none`.** Sem furo.
4. **Folga lateral.** Com `openingMargin > 0`, a região cresce por offset positivo (`offsetMulti`, cantos em esquadria). Para uma
   região retangular de L × W, a área cresce `2(L + W)·m + 4m²`.
5. **Furo retangular.** Com `openingRect`, a região (já com a folga) vira o retângulo de menor área que a envolve (fecho convexo e um
   lado alinhado a cada aresta, `minAreaRect`, `@hestia/geom`). Com a região retangular, coincide com ela; com L, fica entre a região e a caixa dos eixos.
   Feito por elemento, então cada laje tem o seu retângulo.

Exemplo (escada reta de 16 espelhos, h = 0,175 m, topo em 2,80 m, pé-direito livre 2,10 m, laje de 0,15 m):
- face inferior 3,25 m (offset +0,60 m): saem os degraus 7 a 15 (topo ≥ 1,15 m);
- face inferior 2,65 m (offset 0): saem os degraus 4 a 15 (topo ≥ 0,55 m);
- face inferior 2,35 m (offset −0,30 m): saem os degraus 2 a 15 (topo ≥ 0,25 m).
Cada conjunto vale só dentro da sua laje ou piso. Testes: `stairOpenings.test.ts` (reprodução com duas lajes e com laje + piso,
modos `full`/`none`, inclinação, face inferior abaixo do topo dos degraus, união monótona).

Efeitos colaterais:
- O aviso `stair-headroom` (`stairChecks.ts`) não muda: usa a cota real de cada elemento, no ponto de menor folga. Com o furo por
  elemento, o que sobra sob cada elemento tem folga maior que H, então não avisa (salvo H abaixo do mínimo do tipo).
- A **chegada monolítica** usa a mesma face inferior do furo: `stairArrivalTopZ` (`stairArrival.ts`) devolve a menor face inferior das
  lajes e pisos do nível de topo que cobrem a faixa à frente do último espelho, e o 3D (`scene3d.ts`), o corte (`sectionStairs.ts`) e
  `stairBody` (opção `arrivalTopZ`) recebem esse valor. Sem cobertura, vale `topZ − 0,15 m`. A antiga espessura global
  (`stairSlabThickness`, `STAIR_OPENING_DEFAULT_THICKNESS`) foi removida. Detalhes na decisão 0012 §2 e §5.
- A barra de opções da ferramenta não expõe a abertura: a escada criada recebe o padrão e o ajuste é feito em Propriedades.

## 7 · Numeração na planta e Pegar linhas (estado atual)

**Numeração dos degraus** (`treadNumber` em `packages/render/src/plan/stairs.ts`). O rótulo do degrau é `k = round((zTopo − baseZ) ÷ h)`,
ou seja, o espelho que ele alcança. A numeração é contínua na escada e não reinicia em cada lance. O patamar não tem rótulo e ocupa o
número do último espelho do lance anterior, então o primeiro degrau depois dele segue esse número. Exemplo (`stairsBuild.test.ts`): L com
8 + 8 espelhos, lance 1 = 1 a 7, patamar sem rótulo, lance 2 = 9 a 15. Um lance com erro de croqui não altera a numeração dos seguintes,
porque a referência é a cota. Sem altura real do espelho, vale o índice do degrau no lance.

**Pegar linhas** (A8, `docs/paridade/escadas.md`). Método de desenho na barra da ferramenta Escada (`StairOptionsBar.tsx`), ao lado de
Linha e Arco, sobre os sub-modos Limites, Espelhos e Caminhada; no Patamar não vale (`setPick` recusa). O clique pega a linha sob o
cursor: parede (eixo, faces ou núcleo, conforme a captura), linha de outra escada (a que está em edição fica de fora) ou aresta de laje
ou de piso. Com "Deslocamento (m)", a linha é afastada para o lado do cursor. "Corrente" pega a cadeia conectada de uma vez, até as
pontas ou até fechar o laço; só entram curvas do mesmo grupo (cada limite, a caminhada, cada espelho isolado, cada anel de laje ou
piso). Tab alterna linha e arco e sai de "Pegar linhas", como qualquer escolha de primitiva. Delete e Ctrl+Z desfazem a última pegada
(`undoPick`); Ctrl+Y refaz (`redoPick`). Pegar não valida: o erro de croqui é o de `analyzeDraft`, como no desenho. Código:
`packages/tools/src/stairPickLines.ts` (`pickLinesOf`, `chainAt`, `offsetChain`), `stairTool.ts` e `stairDraw.ts`.

## 8 · Acabamentos da escada: piso, espelho e bocel (engine: `stairFinish.ts`)

Campos opcionais do **tipo** de escada (`StairType`), todos em metros. Campo ausente = desligado, então os tipos e as escadas de projetos antigos não mudam e **não houve mudança na versão do esquema** (`stairFinishOf` aplica os padrões). Tipos novos nascem com os acabamentos desligados e o bocel ligado com 2 cm.

| Campo | Tipo | Padrão (tipo novo) |
|---|---|---|
| `treadFinishEnabled` | boolean | `false` |
| `treadFinishMaterialId` | id de material | `mat_ceramica` |
| `treadFinishThickness` | m | `0.015` |
| `riserFinishEnabled` | boolean | `false` |
| `riserFinishMaterialId` | id de material | `mat_ceramica` |
| `riserFinishThickness` | m | `0.01` |
| `bocelEnabled` | boolean | `true` |
| `bocelProjection` | m | `0.02` |

O bocel só tem efeito com o acabamento do piso ligado. Os acabamentos valem nos estilos **monolítico** e **poste** (o poste não tem espelho, então só piso). No estilo **montado** são ignorados: piso e espelho do próprio tipo já são o acabamento. Rampas não têm esse modelo e ficam fora desta frente.

**Medidas acabadas mandam.** A geometria resolvida (`steps`, `risers`, cotas `z = base + k·h`) já é a das faces acabadas: o espelho acabado é `h = H ÷ N`, igual em todos os degraus, a soma dos N espelhos é a altura entre os pisos acabados (os níveis do projeto) e o último piso acabado coincide com o nível de cima. A pisada é medida entre as faces acabadas dos espelhos e o bocel não muda a planta. Quem desconta as espessuras é a estrutura.

**Ordem de baixo para cima** (tp = espessura do piso, te = do espelho, b = bocel):
- piso acabado do degrau k: sólido único de `z_k − tp` a `z_k`, com a planta do degrau, mais a faixa de `b` à frente da face do espelho k, mais a faixa de `te` sob o espelho acabado de cima (piso + bocel num anel só). O piso corre do bocel até **encostar na estrutura** (face estrutural do espelho k+1), por baixo do espelho acabado de cima, como no assentamento de obra (granito, de baixo para cima). O bocel é medido a partir da face acabada do espelho;
- espelho acabado k: faixa de espessura `te` atrás da face (lado do degrau de cima), que **nasce em cima do piso acabado de baixo** (`z_(k−1)`, encostado na estrutura) e sobe até `z_k − tp` (fundo do piso acabado de cima, que passa por cima do topo do espelho e forma o bocel). Altura `h − tp`. O 1º espelho nasce no piso de baixo (`baseZ`, altura `h − tp`) e o último chega ao nível de cima (`topZ`, altura `h`). Piso e espelho acabados não se interpenetram nem invadem a estrutura;
- estrutura: cada degrau perde `tp` no topo (o fundo fica onde estava) e troca a faixa do espelho de trás pela da frente, onde o espelho acabado se apoia; a chegada começa depois da faixa do último espelho;
- lateral: as faixas saem da linha do espelho já aparada pelos limites do lance, então piso e espelho terminam alinhados à borda lateral.

**Avisos** (`stairIssues.ts`): espelho 16–18 cm, pisada 28–32 cm e relação 2e+p da regra do tipo já usam os valores acabados (a geometria resolvida é a acabada). Novos: `stair-bocel-projection` (bocel acima de `StairNorms.nosingProjectionMax`, padrão 1,5 cm; configurável, não trava) e `stair-finish-structure` (acabamento do piso não cabe na estrutura). A faixa 2e+p padrão do tipo continua 63–65 cm (NBR 9050); 63–64 cm é a predefinição NBR 9077.

**Quantidades** (`StairQuantities`): `treadFinishArea` (planta do piso acabado, com o bocel e o trecho sob o espelho de cima), `riserFinishArea` (comprimento × altura dos espelhos acabados, já com a altura `h − tp`), `bocelLength` e `volumeFinish`, somados em `volume` e em `volumeByMaterial`. 3D, planta e corte desenham os acabamentos com o material próprio. O motor das escadas é TypeScript (`packages/engine`), não o kernel Rust. Fora desta frente: IFC, DXF e colunas do quadro de escadas.
