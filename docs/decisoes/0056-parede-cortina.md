# Decisão 0056 — Parede cortina (família de parede com grade, montantes e painéis; portas e janelas na célula; contrato com o kernel Rust)

Data: 2026-11-10. Estado: **fase 0 implementada** (tipos, migração 24 → 25, `wallThicknessOf`, camada-sombra, comandos de montante e painel, validação de tipo e testes em `packages/model`). Grade, geometria, Rust e UI ficam para as fases 1 a 7. Decisões do dono registradas em §14.
Numeração: o maior número visto no repositório é 0055 (`feat/guarda-corpo`); 0056 estava livre na hora da escrita. Há números duplicados históricos (0046, 0047, 0049); se 0056 colidir na hora de mesclar, renumere.

Marcações de confiança usadas abaixo: **[R4/R5]** = confirmado nas pesquisas internas `docs/aberturas/pesquisa-f0/R4-revit.md` e `R5-archicad.md`, que citam páginas oficiais da Autodesk e da Graphisoft; **[PROVÁVEL]** = a mesma pesquisa marca como fonte técnica ou fórum; **[A CONFIRMAR]** = conhecimento geral dos dois programas, sem página aberta nesta rodada (esta fase 0 não fez busca nova na web). Valores numéricos de norma e de mercado marcados [A CONFIRMAR] entram nos padrões como editáveis e aparecem como "(a conferir)" onde houver mensagem.

---

## 1. Decisões do dono (de partida, não reabrir)

1. **A parede cortina é uma `Wall` comum**, não um elemento novo. `WallType` ganha `family?: 'basic' | 'curtain'` (ausente = `'basic'`) e `curtain?: CurtainSpec`. Usa a **mesma ferramenta `wall`** (núcleo `desenhoPolilinha`), o **mesmo `TypeSelector`/cabeçalho de tipo** e o **`WallTypeDialog` com uma aba "Cortina"**. Os testes de contrato (`contratoFerramentas`, `contratoPaineisFamilia`, `contratoModificacao`) continuam passando **sem `kind` novo**. Uma função única `wallThicknessOf(type)` dá a espessura; na cortina é a **profundidade do sistema**.
2. **Grade U/V** com quatro modos: `fixedNumber`, `fixedDistance` (justificação início/centro/fim, com a sobra minúscula fundida abaixo de um limiar), `maxDistance` e `manual`. A grade tem **ângulo** (só 0 até a fase 7) e **deslocamento** (`offset`). **O tipo manda e a instância sobrescreve.** Montantes têm interior, borda início/fim e canto; perfis `rect`/`round`/`L`/`trapezoid`/`corner`; `joinPriority` `vertical`|`horizontal` (um contínuo, o outro quebrado). Painéis de tipo: `glass`/`solid`/`empty`.
3. **Instância:** `addedLines`, `removedSegments`, `lineOverrides` (`locked`/`pos`/`mullionType`), `cells` (sobrescrita de painel) e `host` (cortina embutida). **A chave de célula é o índice MAIS a posição normalizada** (`s/L`, `z/H`), com remapeamento por vizinhança; a sobrescrita órfã é descartada com aviso de projeto.
4. **Portas e janelas** (definir completamente agora, implementar na fase 5): painel nativo cuja sobrescrita de célula é `{kind:'opening', openingTypeId, flipHand, flipFacing}`, reaproveitando o `OpeningType` e a composição de esquadrias. Ferramenta "Porta na cortina" com o mesmo cabeçalho e seletor das esquadrias, em planta, 3D e elevação. Modos "Ajustar grade à porta" e "Preencher célula". Automatismos de soleira, fusão de células e aviso de folha mínima. Saídas completas (§7).
5. **Rust:** a cortina nasce no Rust, como o guarda-corpo. **Em cada fase, na mesma fase:** (a) contrato (seção nova no esquema, versão incrementada, tipos TS); (b) referência TS em pasta própria, só quando barata, usada só para paridade; (c) implementação Rust com testes; (d) teste de paridade que fecha a fase; (e) integração no 3D, na planta e na UI. Sem kernel ligado, mostra só o eixo e um aviso.
6. **Junções v1:** com parede comum, encosto reto no montante de borda; entre cortinas, montante de canto. A junção por camadas não se aplica. Registrar a relação com o item C16 da paridade.
7. **Desempenho:** montantes e painéis-caixa instanciados; cache por assinatura; a chave do nível usa hash, nunca o JSON da grade; o vidro transparente vai num grupo separado; meta de 20 pavimentos × 60 células.
8. **Cortina embutida em parede comum** (fase 5): recorte automático do hospedeiro; hospedeiro apagado promove a cortina a independente e avisa; colisão com abertura gera aviso ou bloqueio; `splitWall` divide ou rejeita.
9. **Fases:** 0 ADR, migração e `WallType.family`; 1 MVP reto; 2 edição e seleção de subelemento com Tab; 3 montantes e junções; 4 arco e cadeia de segmentos; 5 portas e embutida; 6 elevação/corte, IFC, DXF R2000 e importação IFC; 7 ângulo, empena, vidro com transmissão e teste de desempenho. Cada fase com critérios de aceite e lista de testes; Sonnet para o complexo, Haiku para o mecânico (§10).

---

## 2. Pesquisa

### 2.1 Revit (Autodesk)

[R4/R5] Mullion (montante) como tipo: propriedades **Profile** (família de perfil carregada), **Position** (Normal to Face / Parallel to Ground), **Corner Mullion**, **Thickness**, **Material** e larguras dos lados 1 e 2 (com perfil custom, espessura e larguras são calculadas). Instância: **Angle** (−90 a 90, gira em torno da grade), **Offset** (a partir do centro do perfil; no montante de canto, relativo aos painéis); `Angle` e `Profile` indisponíveis em montante de canto; `Angle` não habilitado em parede circular ([R4 §2](../aberturas/pesquisa-f0/R4-revit.md)). O perfil do montante é um laço fechado único, com origem na interseção dos planos centrais, que fixa a linha de localização; os tipos de canto (L, V, quádruplo) referenciam o perfil [PROVÁVEL].

[R4/R5] **Porta em parede cortina:** só famílias de porta "de parede cortina" substituem um painel; o fluxo é desafixar o painel (*unpin*), trocar pelo seletor de tipo e **apagar o montante sob a porta**. O próprio ofício do montante é o de batente: o fórum recomenda a porta sem batente ("frameless"), porque os montantes são o batente. Relatos de marca duplicada na tabela (versões antigas) [PROVÁVEL]. Alternativa: painel de cortina com família de porta compartilhada aninhada, para a porta ser etiquetável [PROVÁVEL].

[A CONFIRMAR] (conhecimento geral, sem página aberta): o tipo de parede cortina tem **Grade Vertical e Grade Horizontal**, cada uma com *Layout* (`None`, `Fixed Distance`, `Fixed Number`, `Maximum Spacing`, `Minimum Spacing`), espaçamento e **Adjust for Mullion Size**; **Interior Type**, **Border 1 Type** e **Border 2 Type** de montantes verticais e horizontais; **Join Condition** (grade vertical contínua, grade horizontal contínua, borda e grade vertical contínuas, borda e grade horizontal contínuas); **Automatically Embed** (embute a cortina na parede que ela atravessa e recorta o hospedeiro); na instância, **Angle**, **Offset** e **Justification** (*Beginning, Center, End*) da grade; editar a grade na vista (*Add/Remove Segment*, travar linha, mover linha). Painéis de cortina são *Empty*, *Glazed*, *Solid* ou famílias de painel. Estes nomes servem de ponto de partida e **não** são copiados: cada comportamento acima é redefinido nesta decisão com as regras do Hestia.

### 2.2 ArchiCAD (Graphisoft)

[R4/R5] A parede cortina é **um elemento só**, com **Frames** (classes *Boundary*, *Mullion*, *Transom*), **Panels**, **Accessories** e **Junctions**. O frame **fica preso à linha de grade** (não ao painel); só se apaga um frame se os painéis vizinhos são coplanares; prioridade de corte *Boundary* 15 > *Mullion* 10 > *Transom* 5. Painéis só se conectam em frames; sem frame, os painéis fundem-se numa superfície contínua. Frames: *Invisible, Generic (retangular), Butt-Glazed, Modular* (peça de biblioteca). Painéis de classe *Main* e *Distinct*, cada um com tipo, superfície e largura próprios ([R5 §1.B](../aberturas/pesquisa-f0/R5-archicad.md)).

[R4/R5] **Porta/janela em painel:** objeto GDL inserido num painel retangular; o fluxo manual é remover o frame entre dois painéis, mesclar, escolher o *Door Type* em *Member Type*; parâmetro *Top Direction* em passos de 90°; o painel não usa marcador de porta/janela (só rótulo de painel). Entre a porta e a bandeira há o *transom* do CW e o batente do objeto: **possível batente duplicado** [R5 §1.B, dedução marcada PROVÁVEL].

[A CONFIRMAR] A distribuição das divisões do ArchiCAD (por número, por distância fixa) e os "padrões de painel" repetidos nas células; a edição de segmentos de grade na vista esquemática.

### 2.3 O que a pesquisa deixa em aberto e como esta decisão trata

| Ponto | Situação | Tratamento |
|---|---|---|
| Nomes exatos de *Join Condition* do Revit | [A CONFIRMAR] | O Hestia usa `joinPriority` de dois valores (§5.4), mais simples e suficiente para a v1 |
| Quem é o batente da porta na cortina | Revit: o montante; ArchiCAD: o objeto (duplicação possível) | **O montante é o batente** nos lados em que existe; o batente próprio da esquadria só aparece onde não há montante (§7.6) |
| Perfil como biblioteca (Revit) × paramétrico (ArchiCAD) | Os dois existem | Perfil **paramétrico por forma** (`rect`, `round`, `L`, `trapezoid`, `corner`), tipos nomeados no projeto; sem biblioteca externa na v1 |
| Linhas de grade em ângulo e vidro com transmissão | Existem nos dois | Fase 7 |

---

## 3. Como o código está hoje (leitura)

- **Tipo e instância de parede** (`packages/model/src/types.ts`): `WallType` = `layers`, `wrapInserts`, `wrapEnds`, `strips`, `cost`, `thermalU`, `acousticRw`, `fireRating`, `manufacturer`. `Wall` = `typeId`, `levelId`, `a`, `b`, `baseOffset`, `topLevelId`, `height`, `topOffset`, anexações de base e topo, `locationLine`, `flipped`, `noJoin*`, `join*`, `sag` (arco por flecha), `topProfile`, `mark`, `order`. Não existe nenhum conceito de família de parede.
- **Espessura:** `totalThickness(t)` (soma das camadas) em `packages/model/src/wallType.ts`, chamada em ~18 pontos fora de testes (`engine/frame.ts`, `faces.ts`, `kernelA1.ts` (coluna `espessura` da seção `paredes`), `schedule.ts`, `model/dimensionRefs.ts`...). `coreSpan`/`layerSpans` leem `layers` direto.
- **Consumidores de parede:** 31 arquivos fora de testes usam `wallsOnLevel`. Todos tratam uma parede como pilha de camadas com junção por camada; **nenhum** sabe que existe parede sem camadas. É o maior risco desta decisão (§12).
- **Esquema do projeto:** `SCHEMA_VERSION = 24` nesta base (guarda-corpo, migração 23 → 24 em `migrate.ts`, estilo "sem migração de dados, só avança a versão" já usado em 22 → 23). **A branch `origin/feat/familias-interface` já declara `SCHEMA_VERSION = 25`**: quem mesclar depois renumera (§12, risco 8).
- **Kernel Rust:** `crates/geom-wasm/schema/cena-v11.json`, `versao: 13`, `abi: 2`. Seções em uso: **1 a 25** (paredes, tipos, camadas, faixas, aberturas, pisos, lajes, forros) e **60 a 81** (guarda-corpo); consultas **1 a 16** e **60 a 65**. Nenhuma branch remota usa ids fora dessas faixas (conferido em 2026-11-10 contra as 108 branches remotas). A seção 7 `tipos_abertura` e a 8 `aberturas` já existem e serão **reaproveitadas** pela célula de porta (§7.6).
- **Esquadrias:** `OpeningType` (`openingTypes.ts`: `kind` porta/janela, `width`, `height`, `sill`, `leaves`, `plan`, `composition?`, `nominalRef`, `threshold`, ferragens) e `OpeningComposition` (`openingComposition.ts`: árvore de células com perfis paramétricos e presets editáveis). `Opening` (instância) tem `hostId`, `offset`, `flipHand`, `flipFacing`, `sillOverride`, `heightOverride`, `mark`. As peças 3D saem de `render/src/model3d/openingParts.ts` (`pecasDoModelo`) a partir do tipo e do modelo da esquadria; o recorte da parede por abertura é do kernel (seção 8, consulta 6).
- **Cache 3D:** `render/src/model3d/chaveNivel3d.ts` (`chavesDeNivel`, `assinaturasDoProjeto`, `hashTexto`) — chave de conteúdo por nível, já com hash.
- **Paridade:** `docs/paridade/paredes.md`, item **C16** `[-]` "Junção com pilar, viga e cortina de vidro: depende desses elementos, que têm checklists próprios". Esta decisão é o checklist da cortina; a relação está em §6.7.
- **Contratos permanentes** (`docs/contratos/familias-e-ferramentas.md`): regra 1 (ferramenta linear usa `desenhoPolilinha`), regra 2 (painel de família usa `TypeSelector` com Editar), regra 3 (todo `kind` entra nas ferramentas de modificação pelo mecanismo genérico). Como a cortina **não é `kind` novo**, a regra 3 vale automaticamente; o ponto delicado é o conteúdo da instância sob transformações (§4.9).
- **Precedente:** o guarda-corpo (decisão 0055) é o molde de **contrato TS ↔ Rust por fase**, de **seção/consulta reservada por faixa**, de **elemento que só guarda dados** (a geometria deriva a cada resolução) e de **"kernel desligado: só o eixo e um aviso"**.

---

## 4. Modelo de dados (TS exato)

Arquivos novos em `packages/model/src/`: `wallCurtainTypes.ts` (só tipos e constantes, no molde de `guardaCorpoTypes.ts`), `wallCurtain.ts` (padrões dos montantes e painéis, leitores com padrão, camada-sombra, `curtainTypeIssue`, `curtainWallIssues`) e `curtainCommands.ts` (comandos de tipo: montante e painel na fase 0; grade e instância a partir da fase 1). `wallThicknessOf` e `isCurtainType` ficam em `wallType.ts`, junto de `totalThickness`, para que a regra de guarda da fase 0 (um único ponto que soma camadas de tipo) seja verificável (§4.10). Metros e radianos em todo o modelo. Nomes de tipo em inglês, como `WallType`, `OpeningType` e o prompt do dono; textos de tela em PT, no dicionário de i18n.

### 4.1 O tipo de parede

```ts
export type WallFamily = 'basic' | 'curtain';

export interface WallType {
  // ... campos atuais, sem mudança ...
  /** Família do tipo. Ausente = 'basic' (todos os arquivos antigos). Não muda depois que o tipo é criado (§4.8). */
  family?: WallFamily;
  /** Obrigatório quando family === 'curtain'; ignorado nas demais. */
  curtain?: CurtainSpec;
}

/** Fonte ÚNICA da espessura de uma parede (em `wallType.ts`). Cortina: profundidade do sistema. Básica: soma das camadas. */
export function wallThicknessOf(t: WallType): number;
export const isCurtainType = (t: WallType | undefined): t is WallType & { family: 'curtain'; curtain: CurtainSpec } =>
  t?.family === 'curtain' && t.curtain !== undefined;
```

Regras:
- **`layers` da cortina é uma "camada-sombra"**: um único elemento `{ function: 'structure', materialId: <material do montante interior>, thickness: curtain.depth, wraps: false }`, mantido pelo comando `upsertWallType`. Código ainda não migrado para `wallThicknessOf` lê espessura correta por acaso e `coreSpan` não quebra. A sombra **não é fonte de verdade**; um teste-guarda (§10, fase 0) impede ler `layers` de tipo `curtain` fora da lista de exceções.
- `wallThicknessOf` substitui `totalThickness` **nas chamadas que recebem um `WallType`** (pisos, lajes e forros seguem com `totalThickness`). A lista dos ~18 pontos vem de `grep` e fica no handoff da fase 0.
- `strips`, `wrapInserts`, `wrapEnds` não se aplicam à cortina (validação avisa se preenchidos; a aba "Cortina" esconde as abas "Camadas", "Faixas" e "Retornos"). `cost`, `thermalU`, `acousticRw`, `fireRating`, `manufacturer` **continuam valendo** (custo por m² de fachada, U do sistema).
- Instância: `Wall.curtain?: CurtainInstance` (§4.3). Campos de `Wall` que valem: `a`, `b`, `sag` (fase 4), `baseOffset`, `topLevelId`, `height`, `topOffset`, anexações de base e topo, `locationLine`, `flipped`, `mark`, `order`. Campos **ignorados** na cortina: `noJoinStart/End` e `joinStart/End` só ligam/desligam o encosto da fase 3 (a junção por camadas não existe); `topProfile` fica ignorado com aviso até a fase 7.

### 4.2 `CurtainSpec`: grade, montantes, painéis

```ts
// ───────────── Grade ─────────────

export type GridLayoutMode = 'fixedNumber' | 'fixedDistance' | 'maxDistance' | 'manual';
export type GridJustify = 'start' | 'center' | 'end';
export type GridAnchor = 'start' | 'end';

/** Um eixo da grade. U corre ao longo do eixo da parede (comprimento L); V é vertical (altura H). */
export interface GridAxisSpec {
  mode: GridLayoutMode;
  /** fixedNumber: número de CÉLULAS (≥ 1) ao longo do eixo. */
  count?: number;
  /** fixedDistance: lado da célula cheia. maxDistance: lado máximo. (m, > 0) */
  distance?: number;
  /** fixedDistance: onde fica a sobra. Ausente = 'start' (células cheias a partir do início/base, sobra no fim/topo). */
  justify?: GridJustify;
  /** manual: posições das linhas internas, em metros a partir da âncora, estritamente crescentes. */
  positions?: number[];
  /** manual: de que ponta se medem as posições. Ausente = 'start'. */
  anchor?: GridAnchor;
  /** Deslocamento da grade inteira (m, positivo = em direção ao fim/topo). Linhas que saem do vão somem. Ausente = 0. */
  offset?: number;
  /** Ângulo das linhas deste eixo em relação à sua direção normal (rad). SÓ 0 até a fase 7; a validação recusa outro valor. */
  angle?: number;
}

// ───────────── Montantes ─────────────

export type MullionShape = 'rect' | 'round' | 'L' | 'trapezoid' | 'corner';

/** Seção do montante. Origem = interseção da linha de grade com o plano central do sistema; X ao longo da face, Y para fora. */
export interface MullionProfile {
  shape: MullionShape;
  /** Largura vista na face (m). round: diâmetro. */
  width: number;
  /** Profundidade na espessura do sistema (m). round: igual a `width`. Limitada à profundidade do sistema (aviso). */
  depth: number;
  /** L: espessura das abas (m). corner: espessura da chapa. */
  thickness?: number;
  /** trapezoid: largura da face interna (m); a externa é `width`. */
  widthBack?: number;
}

export type MullionPosition = 'normalToFace' | 'parallelToGround'; // Revit: Position. `parallelToGround` só tem efeito com grade em ângulo (fase 7).

export interface MullionType {
  id: Id;
  name: string;
  code?: string;
  profile: MullionProfile;
  materialId: Id;
  /** Deslocamento do perfil na profundidade, em relação ao plano central (m; positivo para fora). Ausente = 0. */
  offset?: number;
  position?: MullionPosition;
  /** Custo por metro linear (informativo). */
  cost?: number;
}

/** Papéis em que um tipo de montante entra. `null` = sem montante nesse papel (vidro colado / borda livre). */
export interface CurtainMullions {
  interiorVertical: Id | null;
  interiorHorizontal: Id | null;
  /** Bordas verticais: início e fim do eixo. */
  borderStart: Id | null;
  borderEnd: Id | null;
  /** Bordas horizontais: base e topo. */
  borderBottom: Id | null;
  borderTop: Id | null;
  /** Montante de canto entre duas cortinas em ângulo (fase 3). null = usa `borderStart/End`. */
  corner: Id | null;
  /** Quem corre contínuo na interseção. O outro é quebrado (aparado na face do contínuo). */
  joinPriority: 'vertical' | 'horizontal';
}

// ───────────── Painéis ─────────────

export type CurtainPanelKind = 'glass' | 'solid' | 'empty';

export interface CurtainPanelType {
  id: Id;
  name: string;
  code?: string;
  kind: CurtainPanelKind;
  /** Espessura do painel (m). `empty`: ignorada. */
  thickness: number;
  /** Deslocamento na profundidade (m; positivo para fora). Ausente = 0 (centrado). */
  offset?: number;
  /** Quanto o painel entra no montante, para a área bruta do vidro (m). Ausente = 0,012 (`GLASS_REBATE_DEFAULTS.depth`). */
  bite?: number;
  materialId: Id;
  /** `glass`: tipo de vidro (reusa o das esquadrias). */
  glassKind?: OpeningGlassKind;
  uValue?: number;
  fireRating?: string;
  cost?: number;   // R$ por m²
}

// ───────────── Sistema ─────────────

export interface CurtainSpec {
  /** Profundidade do sistema (m): é a espessura da parede (`wallThicknessOf`). > 0. */
  depth: number;
  u: GridAxisSpec;
  v: GridAxisSpec;
  mullions: CurtainMullions;
  /** Painel de toda célula sem sobrescrita. */
  defaultPanelTypeId: Id;
  /**
   * Limiar da sobra (m), do sistema inteiro (decisão do dono, §14.1): sobra de ponta menor que isto é fundida à célula
   * vizinha em vez de virar célula. Ausente = `CURTAIN_MIN_REMAINDER` (0,05). Configurável no tipo.
   */
  minRemainder?: number;
  /** Célula com lado livre menor que isto gera aviso `cortina-celula-pequena` (m). Ausente = `CURTAIN_MIN_CELL` (0,15). Configurável no tipo. */
  minCell?: number;
  /** Fase 4: lado do painel plano acima do qual o arco é refinado (m de corda). Ausente = deixa a grade mandar. */
  facetMaxChord?: number;
}

/** Valores padrão dos limiares (decisão do dono, §14.1): aceitos como ponto de partida e editáveis em `CurtainSpec`. */
export const CURTAIN_MIN_REMAINDER = 0.05;
export const CURTAIN_MIN_CELL = 0.15;
```

### 4.3 Instância: `CurtainInstance`

```ts
/** Linha de grade. Gerada (pelo índice na grade resolvida) ou extra (por id). */
export type LineRef =
  | { added: Id }
  | { axis: 'u' | 'v'; index: number; pos: number; n: number };   // index: 1..n-1; pos = posição/L (ou /H); n = nº de células do eixo na gravação

/** Segmento de uma linha, entre duas linhas que a cruzam (as bordas contam). */
export interface SegmentRef {
  line: LineRef;
  /** Índice do segmento ao longo da linha (0 = primeiro) e total na gravação. */
  k: number;
  nk: number;
  /** Posição normalizada do meio do segmento ao longo da linha (0..1). */
  mid: number;
}

/** Chave de célula: ÍNDICE mais POSIÇÃO NORMALIZADA (decisão do dono, item 3). */
export interface CellKey {
  i: number;     // coluna (U), 0 = a primeira a partir do início
  j: number;     // fileira (V), 0 = a de baixo
  s: number;     // s/L do centro da célula na gravação (0..1)
  z: number;     // z/H do centro da célula na gravação (0..1)
  nu: number;    // nº de colunas na gravação
  nv: number;    // nº de fileiras na gravação
}

export interface AddedGridLine {
  id: Id;
  axis: 'u' | 'v';
  /** Posição (m) a partir do início/base. */
  pos: number;
  /** `locked`: mantém a posição absoluta ao mudar L ou H. Senão acompanha a fração `pos/L` gravada. */
  locked?: boolean;
  /** Montante deste tipo em vez do interior do sistema. */
  mullionTypeId?: Id;
  /** Linha criada por "Ajustar grade à porta" (§7.4): segue a célula-porta. */
  boundTo?: CellKey;
}

export interface LineOverride {
  line: LineRef;
  locked?: boolean;
  /** Nova posição (m). Só em linha gerada. */
  pos?: number;
  mullionTypeId?: Id | null;   // null = esta linha sem montante
}

// ───────────── Sobrescrita de célula ─────────────

export interface PanelCellOverride {
  kind: 'panel';
  panelTypeId: Id;
}

/** Porta ou janela na célula (decisão do dono, item 4). Definida agora, implementada na fase 5. */
export interface OpeningCellOverride {
  kind: 'opening';
  openingTypeId: Id;
  /** Mesma semântica de `Opening`: inverte a dobradiça e o sentido de abertura. */
  flipHand: boolean;
  flipFacing: boolean;
  /** 'cell' (padrão) = a esquadria assume o tamanho livre da célula; 'grid' = a grade foi ajustada ao tamanho nominal. */
  fit?: 'cell' | 'grid';
  /** Alinhamento da porta na célula original quando fit = 'grid'. */
  align?: 'center' | 'start' | 'end';
  /** Ids das `AddedGridLine` criadas para esta esquadria (a remoção da esquadria remove as linhas que sobraram sem uso). */
  linkedLines?: Id[];
  /** Altura de peitoril por instância (janela). Ausente = a base da célula. */
  sillOverride?: number | null;
  mark: string;
}

export type CellOverride = PanelCellOverride | OpeningCellOverride;

export interface CellOverrideEntry {
  key: CellKey;
  override: CellOverride;
}

// ───────────── Hospedagem (fase 5) ─────────────

export interface CurtainHost {
  /** Parede comum que recebe a cortina. Se for apagada, a cortina é promovida a independente (§8.3). */
  wallId: Id;
  /** Centro do vão ao longo do hospedeiro, a partir de `a` (m). */
  offset: number;
  width: number;
  /** Base do vão sobre a base do hospedeiro (m) e altura do vão (m). */
  sill: number;
  height: number;
}

export interface CurtainInstance {
  /** Sobrescreve o eixo U e/ou V do tipo, campo a campo (campo ausente herda do tipo). */
  grid?: { u?: Partial<GridAxisSpec>; v?: Partial<GridAxisSpec> };
  defaultPanelTypeId?: Id;
  addedLines?: AddedGridLine[];
  removedSegments?: SegmentRef[];
  lineOverrides?: LineOverride[];
  cells?: CellOverrideEntry[];
  host?: CurtainHost;
}
```

Regras:
- `CurtainInstance` **não guarda geometria**: só intenções. A grade, as células, os montantes e os painéis são resolvidos a cada mudança (no Rust).
- A grade efetiva de um eixo = `{ ...tipo.u, ...instancia.grid?.u }` (campo a campo), depois `addedLines`, `lineOverrides` e `removedSegments`.
- `host` em cortina embutida: `a`, `b`, `baseOffset`, `height` da `Wall` são **espelho** derivado de `host` e do hospedeiro, regravados por comando (`syncHostedCurtain`); a validação acusa divergência maior que 1e-6 (§8).
- Limites: `addedLines` ≤ 128, `removedSegments` ≤ 1024, `lineOverrides` ≤ 256, `cells` ≤ 1024, `positions` manuais ≤ 128, células por cortina ≤ 4096 (64 × 64), linhas por eixo ≤ 128. Acima disso o Rust devolve `LIMITE` e o app avisa.

### 4.4 Chave de célula e remapeamento por vizinhança

A cada resolução, o Rust confronta cada `CellOverrideEntry` (e cada `SegmentRef`/`LineRef`) com a grade nova. Algoritmo (determinístico, igual na referência TS):

1. **Mesma topologia** (`nu` e `nv` iguais aos da grade nova): vale o **índice**. A célula `(i, j)` recebe a sobrescrita, **mesmo que as dimensões tenham mudado** (a parede cresceu; as células esticaram). A posição só serve de conferência: se o centro novo `(s', z')` ficou a mais de 0,5 da posição gravada em qualquer eixo (a grade foi reordenada), cai no passo 2.
2. **Topologia diferente** (a grade ganhou ou perdeu linhas): vale a **posição**. O ponto `(s·L', z·H')` é localizado na grade nova; a célula que o contém recebe a sobrescrita. Ponto exatamente sobre uma linha: a célula de menor índice.
3. **Fusão:** duas sobrescritas caem na mesma célula: vence a de menor distância entre o ponto gravado e o centro da célula; a outra é órfã.
4. **Vizinhança:** ponto fora de todas as células (a parede encurtou): procura a célula vizinha mais próxima a até **uma célula** de distância; se achar e a célula não estiver ocupada, adota. Senão, órfã.
5. **Órfã:** não se aplica na geometria e sai no aviso de projeto `cortina-override-orfao` (com "Ir para" na parede e a posição aproximada). **Descarte:** a próxima edição da cortina (qualquer comando que a altere) remove as órfãs no mesmo passo de desfazer (`normalizarSobrescritas`); a resolução em si **nunca grava no modelo**.
6. **Reescrita da chave:** a mesma edição regrava as chaves adotadas (índice e posição novos), para que a sobrescrita acompanhe a célula dali em diante.

A grade manual e as linhas extras **não** têm remapeamento próprio: `positions` manuais são metros a partir da âncora; `AddedGridLine.pos` é metros, e só acompanha a fração `pos/L` quando `locked` é falso (o padrão), o que reproduz o "esticar com a parede". As bordas de segmento e de linha seguem a mesma lógica do passo 1 a 5 (índice e posição normalizada).

### 4.5 Onde ficam os tipos novos no `Project`

```ts
export interface Project {
  // ... campos atuais ...
  /** Tipos de montante da parede cortina (§4.2). Ausente = os padrão por leitura; a primeira escrita grava o conjunto completo. */
  mullionTypes?: Record<Id, MullionType>;
  /** Tipos de painel da parede cortina. Mesmo regime. */
  curtainPanelTypes?: Record<Id, CurtainPanelType>;
}
```

- **Mapas opcionais, com padrões na leitura** (mesmo regime de `perfisNorma` e `openingProfiles` do guarda-corpo, escolha 1 do ADR 0055 §14): `mullionTypesOf(p)` e `curtainPanelTypesOf(p)` devolvem `{ ...PADRAO, ...p.mullionTypes }` quando o mapa não foi gravado, e o conjunto gravado quando foi. A primeira escrita (`upsertMullionType`, `deleteMullionType`, `upsertCurtainPanelType`, `deleteCurtainPanelType`) grava o conjunto completo, senão apagar um padrão faria ele voltar. A migração **não grava** esses mapas.
- Tipos padrão (ids estáveis; materiais de `defaults.ts`, `mat_aluminio`, `mat_vidro`): montantes `mul_ret_50x100` (retangular 50 × 100 mm), `mul_ret_50x150`, `mul_ret_60x120`, `mul_red_50` (redondo Ø 50 mm), `mul_junta_12` (junta de vidro colado, 12 × 20 mm); painéis `pnl_vidro_10` (vidro 10 mm), `pnl_vidro_duplo_24` (vidro duplo 24 mm, `uValue` informativo), `pnl_solido_alu_4` (chapa de alumínio 4 mm), `pnl_vazio`. Os de canto, trapézio e L entram com a fase 3 (`mul_canto_50`, `mul_trap_50`, `mul_L_40`).
- Tipos de parede de fábrica (`family: 'curtain'`, ids `wt_cortina_*`): **`wt_cortina_vitrine`** (storefront: profundidade 0,10; U `maxDistance` 1,20 m; V `manual` `[2,10]`; montantes `mul_ret_50x100` em todos os papéis; `joinPriority: 'vertical'`; painel `pnl_vidro_10`); **`wt_cortina_fachada`** (módulos: U `fixedDistance` 1,50 `start`; V `fixedDistance` 3,60 `start`; painel `pnl_vidro_duplo_24`; fileira inferior sólida por sobrescrita é o exemplo da fase 2); **`wt_cortina_vidro_colado`** (juntas `mul_junta_12` em todos os papéis, U `fixedDistance` 1,20 `center`, V `fixedDistance` 2,40 `start`, `joinPriority: 'horizontal'`). Entram em `defaultProject()`/gabaritos **só com a fase 1**; a fase 0 não semeia nada.

### 4.6 Validação do modelo (`curtainTypeIssue`, `curtainWallIssues`)

Ao salvar tipo (fase 0 em diante, TS puro): `depth > 0`; `family === 'curtain'` exige `curtain`; `count ≥ 1` em `fixedNumber`; `distance > 0` em `fixedDistance` e `maxDistance`; `positions` crescentes e dentro de `(0, ∞)`; `angle === 0` (até a fase 7); `defaultPanelTypeId` e todos os ids de montante existem (ou são `null`); `profile.width > 0`, `depth ≤ curtain.depth` (aviso); `trapezoid` exige `widthBack > 0`; `L` exige `thickness`; limites do §4.3. Ao validar o projeto: parede cortina com `Opening` hospedada (`opening-host-curtain`, erro); `host.wallId` inexistente (`curtain-host-missing`, erro, §8.3); espelho de `host` divergente (`curtain-host-mirror`, aviso).

### 4.7 Comandos e a mudança de família de uma parede

Em `curtainCommands.ts`, chamado por `applyCommand` (como `applyGuardaCorpoCommand`): `upsertMullionType`, `deleteMullionType` (não apaga em uso nem o último), `upsertCurtainPanelType`, `deleteCurtainPanelType` (**fase 0**: os quatro entram com os mapas do `Project`; `deleteCurtainPanelType` segue a mesma regra de uso e de último, que o ADR só nomeava para montante); fase 1: `setCurtainGrid` (sobrescrita de eixo da instância), `setCurtainDefaultPanel`; fase 2 em diante: `addGridLine`, `moveGridLine`, `lockGridLine`, `removeGridLine`, `removeSegment`, `restoreSegment`, `setLineMullion`, `setCellPanel`, `clearCellOverride`, `normalizarSobrescritas`; fase 5: `placeOpeningInCell`, `removeOpeningFromCell`, `fitGridToOpening`, `placeEmbeddedCurtain`, `syncHostedCurtain`, `promoteCurtain`. Todos com um passo de desfazer. `upsertWallType` mantém a camada-sombra (§4.1).

**Família não muda em tipo existente** (`family` é fixada na criação; "Novo tipo de cortina" e "Duplicar como cortina" criam outro tipo). **Trocar o tipo de uma parede entre famílias** pelo `TypeSelector` é permitido, com duas travas: (a) parede com `Opening` hospedada não vira cortina sem confirmação (a confirmação apaga ou pede a troca das esquadrias; as portas na cortina nascem da célula, §7); (b) ao voltar para `basic`, `Wall.curtain` fica **dormente** (guardado, ignorado), e uma parede básica com `curtain` dormente não gera aviso.

### 4.8 Migração `SCHEMA_VERSION` 24 → 25

```ts
// v24 → v25: parede cortina (decisão 0056). Arquivo antigo não tem `family`, `curtain`, `mullionTypes` nem
// `curtainPanelTypes`: ausente = 'basic' e padrões por leitura. Nada a converter; a migração só avança a versão
// (e assim um programa antigo recusa um arquivo com cortina: "versão mais nova que este programa").
24: (raw) => ({ ...raw }),
```

- **Por que subir a versão mesmo sem converter dados:** é a única proteção de um programa antigo contra um arquivo com cortina (que ele leria como parede de uma camada-sombra). O custo é igual ao da migração 22 → 23.
- **Colisão:** `feat/familias-interface` também declara 25. **Decisão do dono (2026-11-10): quem mesclar por último renumera.** Pela ordem atual, é provavelmente a cortina, que vira 26 (ou o próximo livre na hora da mescla). Quem renumera também atualiza os testes que fixam a versão (`SCHEMA_VERSION` nos testes de `packages/model`). O **teste de migração** (`wallCurtainMigracao.test.ts`) cobre "arquivo 24 abre; arquivo 25 desta decisão abre; arquivo de versão maior recusa".
- A versão do **contrato do kernel** sobe por fase (§6.1), independente do `SCHEMA_VERSION`.

### 4.9 Regra 3 (modificação) aplicada ao conteúdo da instância

A cortina é `Wall`: mover, copiar, girar, matriz, deslocar, aparar/estender, colar entre pavimentos, desfazer e alças funcionam pelo caminho genérico de parede. O que muda é **o que acontece com a instância**:

| Operação | Efeito em `Wall.curtain` |
|---|---|
| Mover, girar, copiar, colar entre níveis | Instância idêntica (coordenadas relativas ao eixo) |
| Espelhar | `s` vira `1 − s` e `i` vira `nu − 1 − i` em chaves de célula, linha e segmento; posições manuais com `anchor` trocam a âncora; `justify` troca `start` ↔ `end` na grade efetiva do eixo U |
| Aparar/estender, esticar por alça, cota temporária | `L` muda; a grade é recalculada; as chaves seguem o remapeamento (§4.4) |
| `splitWall` | As duas partes herdam o tipo; linhas, segmentos e células são repartidos pela posição `s` do corte (linha exatamente no corte some; o restante é remapeado e as chaves regravadas); cortina embutida: §8.4 |
| Alterar a altura (`height`, nível de topo) | `H` muda, grade V recalculada, remapeamento idem |
| Apagar | Apaga a instância; abertura-célula (fase 5) some junto |

Testes-guarda: `contratoModificacao.test.ts` continua passando sem linha nova (não há `kind`); a fase 2 acrescenta um teste de paridade de operações (`cortinaModificacao.test.ts`) que roda cada linha da tabela acima.

### 4.10 Pontos de integração (lista da fase 0 e da fase 1)

`types.ts` (`WallType`, `Wall`, `Project`, `SCHEMA_VERSION`), `wallType.ts` (`wallThicknessOf`), os ~18 pontos de `totalThickness` com `WallType`, `migrate.ts`, `defaults.ts` (fase 1, tipos de fábrica), `commands.ts` (despacho), `validate.ts`, `index.ts`, `i18n.ts` (`md_ct_*`), `WallTypeDialog.tsx` (aba), `WallProperties` (grade da instância), `TypeSelector` (agrupa "Parede básica" e "Parede cortina"), `engine/src/kernelA1.ts` (**exclui a cortina da seção 1**), `engine/src/kernelCortina.ts` (novo adaptador), `render/src/model3d/cortina3d.ts`, `render/src/plan/` (camada da cortina), `chaveNivel3d.ts` (hash, §9), `graphics.ts` (a categoria gráfica continua `wall`; sub-estilos de montante e vidro entram na fase 6, ponto em aberto 6).

---

## 5. Regras de geometria

Convenções: coordenadas locais do sistema `(s, z)` no plano da cortina, `s` ao longo do eixo de `a` para `b` (comprimento `L`, na fase 4 o comprimento de arco), `z` de baixo para cima a partir da base (altura `H`, que vem de `wallZRange` e das anexações; a cortina não calcula a própria altura). A profundidade `d` é medida perpendicular ao plano. A posição do plano no mundo vem do `frame.ts` existente com `locationLine` e `flipped` (a espessura é `wallThicknessOf`). **Plano central** = a meia profundidade. Tolerância de soldagem `1e-6 m`; saída em grade de 1 µm (mesma regra das quantidades). Esquerdo/direito não são usados; `início` e `fim` valem para `a` e `b`.

### 5.1 Linhas da grade num eixo

Dado o comprimento `A` do eixo (`L` em U, `H` em V), o tipo e a sobrescrita da instância fundidos (§4.3) e `r` o limiar `CurtainSpec.minRemainder` (padrão 0,05 m):

- **`fixedNumber` (n):** n células iguais; linhas internas em `A·k/n`, `k = 1 … n−1`.
- **`maxDistance` (d):** `n = ceil(A / d)` células iguais (nenhuma passa de `d`); linhas em `A·k/n`. (É o *Maximum Spacing* do Revit [A CONFIRMAR].)
- **`fixedDistance` (d, `justify`):** `m = floor(A / d)` células cheias de lado `d`, sobra `R = A − m·d`.
  - `start`: linhas em `k·d` (`k = 1 … m`); a sobra fica no fim. `end`: espelho (a sobra no início). `center`: sobra repartida `R/2` nas duas pontas, linhas em `R/2 + k·d` (`k = 0 … m`).
  - **Fusão da sobra minúscula:** cada sobra de ponta `< r` é absorvida: a linha que a separaria some e a célula de ponta passa a medir `d + R` (ou `d + R/2` no centro). Sobra `≥ r` vira célula própria. Se `R` fica muito pequena para a fusão e `m = 0` (a parede é menor que `d`), há uma célula só.
  - Se a sobra for fundida e a célula resultante passar de `1,5·d`, aviso informativo `cortina-sobra-fundida`.
- **`manual`:** as `positions` (metros a partir da âncora `anchor`) viram linhas; posição fora de `(0, A)` é ignorada (informativo `cortina-posicao-fora`), duas posições a menos de `1e-6` viram uma.
- **`offset` (o):** depois de gerar, todas as linhas se deslocam `o` (em `fixedNumber` e `maxDistance` o padrão de células iguais também se desloca; as linhas que saem de `(0, A)` somem; a célula de ponta que sobrar menor que `r` é fundida como acima).
- **Linhas extras e sobrescritas:** `addedLines` entram; `lineOverrides` de linhas geradas mudam `pos` ou `locked`; dentro de `1e-6` duas linhas viram uma (vale a extra); linhas a menos de `largura de montante` uma da outra geram `cortina-montante-sobreposto`.
- **Ordem do resultado:** linhas crescentes por `pos`; índice das geradas `1 … n−1`; `0` e `n` são as bordas (que não são linhas, são **bordas**).

### 5.2 Células, segmentos e fusão

- **Célula** `(i, j)`: retângulo `[s_i, s_{i+1}] × [z_j, z_{j+1}]` entre linhas consecutivas e bordas. **Segmento** de uma linha: o trecho entre duas linhas que a cruzam (ou uma borda). Cada segmento tem um montante, salvo se estiver em `removedSegments` ou se o tipo do papel for `null`.
- **Remover um segmento funde as duas células vizinhas num painel só** (uma "região"). A região precisa ser um **retângulo**: o comando `removeSegment` **recusa** remover um segmento cujo resultado não seja retangular (mensagem `ct_msg_regiao_nao_retangular`); se um arquivo trouxer remoção que dê região não retangular, o Rust ignora a remoção e emite `cortina-celula-nao-retangular`.
- Fusão por porta maior que a célula usa o mesmo mecanismo (§7.5).
- Região: um painel, um `CellKey` canônico (a célula de menor `(j, i)` da região); sobrescrita numa célula da região vale para toda a região.

### 5.3 Montantes e prioridade de junção

- Cada segmento vira um **prisma** do perfil do tipo (papel: interior vertical/horizontal, borda início/fim/base/topo, ou `LineOverride.mullionTypeId`). O perfil é centrado na linha, deslocado de `MullionType.offset` na profundidade; no sentido da face a largura se reparte em metades.
- **`joinPriority: 'vertical'`:** os montantes verticais (interiores e as bordas início/fim) correm **contínuos** de `z = 0` a `z = H`; os horizontais (interiores, base e topo) são **aparados** nas faces dos verticais, de forma que a largura livre é `cell − meia largura de cada vertical`. **`'horizontal'`:** o inverso. Onde só há um dos dois, ele corre inteiro. Nunca há dois sólidos sobrepostos no plano `(s, z)`; a sobreposição em profundidade (perfis de profundidades diferentes) é natural e não gera geometria extra.
- **Quebra nos extremos:** o montante aparado termina na face do contínuo com corte reto (a fase 3 acrescenta esquadria para `L`, `trapezoid` e `corner`).
- **Segmento removido** não tem montante; o vizinho contínuo, se for o caso, continua passando pela região fundida.

### 5.4 Painéis

- Painel da célula (ou região): retângulo **livre** = a região menos a meia largura dos montantes que a margeiam (`0` onde não há montante). Glass e solid: caixa de `thickness`, centrada no plano central, deslocada `offset`. `empty`: nada (vão aberto, só os montantes).
- **Área visível** = retângulo livre. **Área bruta do vidro** = retângulo livre + `bite` em cada lado com montante (o painel entra no montante). A malha 3D usa a área visível mais o `bite`; os montantes sólidos escondem a diferença.
- Painel solid com **camadas** (isolamento, chapas) **não** entra na v1: um material só, com `thermalU` informativo. Camadas ficam para quando houver `ComponentFamily` (§13).
- **Fase 4 (arco):** a grade divide o **comprimento de arco**; cada célula vira um **painel plano facetado** (corda entre as duas linhas); os montantes ficam sobre os pontos do arco, orientados pela bissetriz das duas cordas. `facetMaxChord` refina a grade se a corda passar do limite; o desvio de seta entre corda e arco em cada faceta é devolvido nos avisos (`cortina-faceta-grande` acima de 3 cm [A CONFIRMAR]).

### 5.5 Instanciação e peças

- Os **montantes** e os **painéis** são caixas ou extrusões de seção fixa e comprimento variável. O Rust devolve **protótipos** (uma geometria por tipo de montante ou de painel, de comprimento unitário) e **instâncias** (matriz 3 × 4 que escala o comprimento e a largura/altura do painel e posiciona). Para uma cortina de 60 células a conta é: ~4 protótipos (2 montantes, 2 painéis) e ~250 instâncias (§9).
- Peças que **não** instanciam (têm aparo oblíquo ou faceta): montantes `L`/`trapezoid`/`corner` com esquadria (fase 3) e painéis facetados em arco (fase 4) saem como **malha avulsa** (`grupos`), com um grupo por tipo de montante ou de painel.
- **Grupo transparente:** todo painel `glass` sai com `transparente = 1` e é desenhado depois dos opacos (§9). A consulta devolve a ordem de profundidade que o 3D usa para ordenar painéis transparentes por distância da câmera, mas a ordenação é feita no render.

### 5.6 Planta: três níveis de detalhe

A consulta `cortina_planta(nivel, corte_z, detalhe)` devolve polilinhas com estilo `0 cortado`, `1 projetado`, `2 oculto` (convenção do guarda-corpo e das esquadrias):
- **Grosso:** o contorno do sistema (duas faces e as pontas) e uma linha no eixo do vidro. Nenhum montante.
- **Médio:** o contorno, a linha de vidro com a espessura do painel e **os montantes verticais** (interiores e de borda) como retângulos cheios do perfil na profundidade, cortados no `corte_z`; vãos de painel `empty` sem linha de vidro.
- **Fino:** perfis exatos (retângulo, círculo, L, trapézio) de todos os montantes **cortados pelo plano** `corte_z` (o horizontal cujo `z` inclui o plano aparece como retângulo ao longo da célula) e os painéis como retângulos com contorno, os horizontais abaixo/acima do corte em estilo projetado ou oculto conforme a faixa de vista. O painel `solid` mostra a hachura do material.
- Em arco (fase 4), as linhas seguem as facetas.

### 5.7 Quantitativos

`quant_cortina(nivel)` devolve por cortina (e por papel): **área bruta** (`L × H`), **área de vidro** visível e bruta (por tipo de painel), **área sólida**, **área vazia**, **comprimento de montante** por tipo e por papel, **contagens** (montantes, painéis), **volume** dos montantes, **massa** (volume × densidade do material, quando houver). A célula-porta (fase 5) **sai da área de painel** e vai para o quantitativo de esquadrias (§7.8): o vidro da porta não conta como vidro de fachada; o montante da soleira removido não conta. O TS só agrega (`curtainQuantities.ts`), no molde de `guardaCorpoQuantities.ts`. O custo informativo é `custo do tipo da parede × área bruta` mais o custo por metro e por m² dos tipos de montante e de painel.

### 5.8 Avisos

Os avisos da cortina são **medidas** que o Rust devolve (`cortina_avisos`: medido, limite, posição, índices de célula); o TS decide texto, severidade e "Ir para" com i18n `md_ct_*`. Códigos (valores numéricos fixados em `esquema.rs`, constantes `AVISO_CORTINA_*`, na fase em que nascem):

| Código | Fase | Regra |
|---|---|---|
| `cortina-celula-pequena` | 1 | Lado da célula livre menor que `minCell` (0,15 m) |
| `cortina-montante-sobreposto` | 1 | Dois montantes a menos de uma largura de perfil |
| `cortina-sobra-fundida`, `cortina-posicao-fora` | 1 | Informativos (§5.1) |
| `cortina-angulo-nao-suportado` | 1 | `angle ≠ 0` antes da fase 7 |
| `cortina-profundidade-menor-que-perfil` | 1 | `profile.depth > curtain.depth` |
| `cortina-sem-kernel` | 1 | TS: o kernel está desligado, só o eixo aparece |
| `cortina-override-orfao` | 2 | §4.4 |
| `cortina-celula-nao-retangular` | 2 | §5.2 |
| `cortina-juncao-sem-vizinha` | 3 | Extremidade marcada com encosto sem parede no nó |
| `cortina-faceta-grande` | 4 | §5.4 |
| `cortina-porta-folha-minima`, `cortina-porta-funde-celulas`, `cortina-porta-fora-do-piso` | 5 | §7.5 |
| `cortina-hospedeiro-ausente`, `cortina-colide-abertura`, `cortina-recorte-fora-do-hospedeiro` | 5 | §8 |
| `cortina-vidro-grande` | 7 | Painel de vidro com área maior que o limite configurável do tipo (a conferir) |

As regras de configuração do tipo (`curtainTypeIssue`) e do projeto são avaliadas só no TS e não esperam o Rust. Avisos **nunca bloqueiam**, exceto os dois bloqueios nomeados: região não retangular na edição (§5.2) e, na fase 5, colisão da cortina embutida com uma abertura (§8.2).

---

## 6. Contrato TS ↔ Rust

Novas seções e consultas em `crates/geom-wasm/schema/cena-v11.json`. **Faixa reservada para a cortina: seções 100 a 139 e consultas 100 a 119.** Não colide com 1 a 25 e 60 a 81 (seções) nem 1 a 16 e 60 a 65 (consultas), nem com os ids de nenhuma branch remota (conferido, §3). As faixas 26 a 59 e 82 a 99 continuam livres para outros recursos. Mesmo esquema: coluna `id_num` (`u32`) como chave de upsert, `definir_secao` na carga e `upsert`/`remover` nas edições (ABI v2). `versao` sobe **uma unidade por fase que mexe no contrato** (§6.1); `abi` continua 2. O adaptador novo é `packages/engine/src/kernelCortina.ts`; o JSON é regenerado em `packages/geom/src/kernel/v2/esquema.gerado.ts`, com o teste `contrato_confere_com_json` e o equivalente TS cobrindo as seções e consultas novas.

### 6.1 Seções e consultas por fase

| Fase | `versao` | Seções criadas | Consultas criadas |
|---|---|---|---|
| 0 | 13 (sem mudança) | nenhuma (só o modelo TS e o `SCHEMA_VERSION`) | nenhuma |
| 1 | 14 | 100 `cortinas`, 101 `tipos_cortina`, 102 `grades_cortina`, 103 `grade_posicoes_cortina`, 104 `tipos_montante_cortina`, 105 `tipos_painel_cortina` | 100 `cortina_grade`, 101 `cortina_malha`, 102 `cortina_planta`, 104 `quant_cortina`, 105 `cortina_avisos` |
| 2 | 15 | 106 `cortina_linhas_extras`, 107 `cortina_segmentos_removidos`, 108 `cortina_linhas_sobrescritas`, 109 `cortina_celulas_sobrescritas` (painel) | nenhuma (as saídas de `cortina_grade` e `cortina_avisos` ganham colunas de estado de remapeamento) |
| 3 | 16 | 110 `cortina_extremidades` (vizinhança de cada ponta) | nenhuma (`cortina_malha` e `cortina_planta` ganham aparo e canto) |
| 4 | 17 | 111 `cortina_cadeias` | nenhuma (`cortina_grade`, `cortina_malha`, `cortina_planta` passam a ler `sag`) |
| 5 | 18 | 112 `cortina_celulas_abertura`, 113 `cortina_hospedes` | 106 `cortina_recorte_hospedeiro`, 107 `cortina_celula_porta` |
| 6 | 19 | nenhuma (o IFC, o DXF e a importação ficam no TS) | 103 `cortina_corte` (corte e elevação) |
| 7 | 20 | 114 `cortina_perfil_topo`; colunas novas em 105 (transmissão) | nenhuma |

Livres dentro da faixa: seções 115 a 139, consultas 108 a 119 (reservadas à cortina; usar uma exige emenda nesta decisão). Seção **7** `tipos_abertura` (existente) é lida pela célula de porta; se faltar coluna (`largura_batente`, `soleira`), a fase 5 acrescenta em seção **114+** de extensão, não altera a 7.

**Renumeração de versão:** se outra branch (famílias, 0051 a 0053) já tiver usado `versao` 14 ou mais na hora de mesclar, a fase renumera. O que é estável para sempre são os **ids de seção e de consulta**.

### 6.2 Seções de entrada (fase 1)

Hospedagem de dados: o adaptador monta as seções a partir do `Project`; o Rust não conhece o `Project`. A cortina **sai da seção 1** `paredes` (o adaptador `kernelA1.ts` a exclui) e entra na 100; assim o resolvedor de junções por camadas nunca a vê, e as paredes comuns cujo fim cai numa cortina aparecem no Rust com ponta livre até a fase 3.

| id | `nome` | colunas principais |
|---|---|---|
| 100 | `cortinas` | `id_num u32, nivel_num u32, tipo_num u32, ax f64, ay f64, bx f64, by f64, z_base f64, altura f64, sag f64, flipped u8, loc u8 (linha de localização), flags u8 (bit0 há sobrescrita de grade, bit1 hospedada, bit2 junção início desligada, bit3 junção fim desligada), painel_padrao_num u32 (ID_AUSENTE = o do tipo), hosp_num u32 (ID_AUSENTE)` |
| 101 | `tipos_cortina` | `id_num u32, profundidade f64, painel_padrao_num u32, mont_int_v u32, mont_int_h u32, mont_borda_ini u32, mont_borda_fim u32, mont_borda_base u32, mont_borda_topo u32, mont_canto u32 (ID_AUSENTE = sem montante nesse papel), prioridade u8 (0 vertical, 1 horizontal), celula_minima f64, faceta_max f64, cadeia_grade u8` |
| 102 | `grades_cortina` | `id_num u32, dono u8 (0 tipo, 1 instância), dono_num u32, eixo u8 (0 U, 1 V), modo u8 (0 número, 1 distância fixa, 2 distância máxima, 3 manual), numero u32, distancia f64, justificacao u8, ancora u8, deslocamento f64, angulo f64, resto_minimo f64` (NaN = herda; uma linha por dono e eixo; a instância só traz os campos que sobrescreve) |
| 103 | `grade_posicoes_cortina` | `id_num u32, grade_num u32, ordem u32, pos f64` |
| 104 | `tipos_montante_cortina` | `id_num u32, forma u8 (0 rect, 1 round, 2 L, 3 trapezoid, 4 corner), largura f64, profundidade f64, espessura f64, largura2 f64, deslocamento f64, posicao u8, material_num u32` (formas 2 a 4 devolvem `ENTRADA` até a fase 3) |
| 105 | `tipos_painel_cortina` | `id_num u32, tipo u8 (0 vidro, 1 sólido, 2 vazio), espessura f64, deslocamento f64, encaixe f64, material_num u32, vidro_tipo u8` |

Fase 2 (106 a 109): linhas `(cortina_num, …)` com `eixo`, `pos`, `travada`, `montante_num`, `ref_linha` (índice, posição normalizada, `n`, ou id da extra), `ref_segmento`, e a chave da célula (`i, j, s, z, nu, nv`) com `painel_num`. Fase 3 (110): `(cortina_num, fim u8, vizinha_num, vizinha_tipo u8 (0 comum, 1 cortina), angulo f64, face1_ax, face1_ay, face1_bx, face1_by, face2_ax, … , espessura_vizinha f64)`, com os dois segmentos de face da vizinha mais próximos do nó. Fase 4 (111): `(cadeia_num, ordem, cortina_num)`. Fase 5 (112, 113): `(cortina_num, chave da célula, tipo_abertura_num (da seção 7), flip_mao u8, flip_sentido u8, ajuste u8, alinhamento u8, soleira f64 (NaN = base da célula))` e `(cortina_num, hospedeiro_num, deslocamento f64, largura f64, peitoril f64, altura f64)`. As colunas exatas são fixadas **no primeiro commit de cada fase** e o JSON fica congelado a partir dali, como a fase 2 do guarda-corpo.

### 6.3 Consultas (fase 1)

Todas por nível (`nivel_num`, `NIVEL_TODOS` aceito), saídas em vetores planos como as consultas existentes:

| id | `nome` | args | saídas |
|---|---|---|---|
| 100 | `cortina_grade` | `nivel_num` | `linhas u32 [cortina_num, eixo, indice, origem (0 gerada, 1 extra, 2 manual), flags]` + `linhas_pos f64 [pos]`; `celulas u32 [cortina_num, i, j, regiao, painel_tipo_num, flags]` + `celulas_ret f64 [s0, s1, z0, z1]`; `segmentos u32 [cortina_num, linha, k, removido, montante_tipo_num]` + `segmentos_ext f64 [de, ate]` |
| 101 | `cortina_malha` | `nivel_num, lod (0 grosso, 1 médio, 2 fino)` | `prototipos u32 [proto, papel (0 montante, 1 painel vidro, 2 painel sólido), tipo_num, material_num, primeiro_vertice, n_vertices, primeiro_indice, n_indices]`, `vertices f64`, `indices u32`; `instancias u32 [cortina_num, proto, papel, ref_i, ref_j, transparente]` + `matrizes f64 [12 por instância]`; `grupos u32 [cortina_num, papel, material_num, primeiro_indice, n_indices, transparente]` + `vertices_av f64` + `indices_av u32` (peças avulsas, vazio na fase 1) |
| 102 | `cortina_planta` | `nivel_num, corte_z, detalhe (0 grosso, 1 médio, 2 fino)` | `linhas u32 [cortina_num, papel, estilo (0 cortado, 1 projetado, 2 oculto), n_pontos]`, `pontos f64 [x, y]` |
| 104 | `quant_cortina` | `nivel_num` | `linhas u32 [cortina_num, papel, tipo_num, material_num, n]` + `valores f64 [comprimento, area, area_liquida, volume]` |
| 105 | `cortina_avisos` | `nivel_num` | `avisos u32 [cortina_num, codigo, i, j]`, `valores f64 [medido, limite, x, y, z]` |

Consultas das fases 5 e 6: `cortina_recorte_hospedeiro(nivel_num)` devolve, por cortina embutida, o polígono (no referencial do hospedeiro, `t` ao longo de `a→b` e `z` acima da base) a subtrair da parede hospedeira e o diagnóstico (cobre o vão? colide com `Opening`?); `cortina_celula_porta(nivel_num)` devolve por célula com abertura o **vão virtual** em coordenadas da parede (`s0, s1, z0, z1`, profundidade, linhas a criar ou fundir pelo modo de ajuste, lados com montante para omitir batente, a altura de soleira); `cortina_corte(nivel_num, ox, oy, dx, dy, profundidade)` devolve linhas e polígonos cortados em `(s, z)` do plano de corte, como `guarda_corte`.

### 6.4 Regras do contrato

- **Determinismo:** mesmas seções, mesmos bytes. Ordem por `cortina_num`, `eixo`, `indice`, `papel`, `i`, `j`.
- **O Rust só lê as seções.** Não lê `Project`.
- **Erros:** `ENTRADA` para seção inconsistente (tipo de montante inexistente, forma ainda não suportada, `angulo ≠ 0` antes da fase 7); `LIMITE` para mais de 4096 células, 128 linhas por eixo ou 20 000 instâncias por chamada.
- **Referência TS por fase, só quando barata** (§10): pasta `packages/engine/src/cortinaRef/`, usada **só** em `*.paridade.test.ts`. Tolerância de paridade: posições e áreas 1e-6, contagens exatas. O app nunca chama a referência.
- **Kernel desligado:** a cortina vive só no Rust. Com o kernel desligado, o elemento fica no modelo e na lista; o 3D e a planta mostram **o eixo e as duas faces do sistema como linhas simples** e o aviso `cortina-sem-kernel` ("ligue o kernel Rust para ver a parede cortina completa"). A cortina **nunca é extrudida como parede de camadas** pelo caminho TS (§12, risco 1). A memória do projeto manda o kernel ser ligado por padrão ou ter controle visível; esse controle é o mesmo do guarda-corpo.
- **Paridade com o guarda-corpo:** a regra de `GuardaCorpo` — "geometria deriva do hospedeiro a cada resolução" — vale aqui: `CurtainInstance` só guarda intenções.

### 6.5 Junções v1 (decisão 6) e a relação com o C16

A cortina **não participa da junção por camadas** (as camadas de uma parede básica não existem na cortina; não há "núcleo" a juntar com núcleo). Regras da v1 (fase 3 as implementa; até lá a cortina é cortada reta no eixo e o aviso `cortina-juncao-sem-vizinha` não existe):
- **Cortina × parede comum, em L ou em T:** **encosto reto no montante de borda.** A parede comum termina com corte reto no seu eixo (ponta livre, sem camadas pareadas com a cortina); a cortina termina com corte **perpendicular ao seu eixo**, recuada até o **menor valor que elimina a sobreposição** entre a faixa do sistema e o contorno da parede comum (calculado com os dois segmentos de face da seção 110). O montante de borda `borderStart` ou `borderEnd` ocupa a ponta. Em T (a cortina chega ao meio de uma parede comum), o recuo é a meia espessura da parede comum projetada.
- **Cortina × cortina em ângulo:** **montante de canto** (`corner`, ou `borderStart/End` se `corner` for `null`); as duas cortinas terminam no plano do montante de canto, e a de menor profundidade fica por trás da de maior. Cortinas colineares seguidas: montante de borda duplo é evitado, usando um único interior (fase 4, cadeia).
- `noJoinStart`/`noJoinEnd` desligam o encosto na ponta (a cortina termina no eixo do nó).

**Como a fase 3 realizou isto (esquema v16, `cortina_juncao.rs`; emenda de 2026-11-12).** A seção 110 leva uma linha por ponta (`cortina_num`, `fim`, `vizinha_num`, `vizinha_tipo`, `lado`, `flags`, `angulo`, os dois segmentos de face e `espessura_vizinha`); `flags` bit 0 é o `noJoin` da ponta e bit 2 diz que a vizinha atravessa o nó (T). O TS (`cortinaExtremidades.ts`) acha a vizinha com a tolerância de junção do projeto e as mesmas ideias de `endPartners` e `findTee`; nó com três paredes em direções diferentes não é resolvido na v1 (a ponta fica livre). O Rust não conhece o `Project`. Regras:
- **Encosto reto** (parede comum em L ou T, cortina que atravessa o nó, ou cortina vizinha que desligou a junção ou não aponta de volta): recuo = o maior `τ` (ao longo do eixo da cortina) do fecho convexo dos dois segmentos de face da vizinha recortado pela faixa do sistema, nunca negativo. Em T dá a meia espessura projetada. A cortina passa a medir `L − recuos` a partir do ponto recuado: a grade, as sobrescritas e as peças usam essa cortina encurtada; se a soma dos recuos deixa menos de 1 mm, a junção é ignorada.
- **Montante de canto** (cortina × cortina que termina no nó e aponta de volta; ângulos entre 5° e 175° entre as paredes, o domínio testado é de 30° a 150°): as faixas das duas cortinas são partidas pelo esquadro (encontro das faces internas e das externas, que vale para profundidades e linhas de localização diferentes). As duas recuam até `max(encontros, meia largura do canto)` com corte perpendicular ao eixo, e o montante é o prisma de altura total sobre o polígono que sobra (até seis vértices): sem fresta e sem sobreposição por construção, e a cortina de menor profundidade não precisa "ficar por trás", porque o polígono segue as duas faces. O tipo do montante é o `corner` do tipo da cortina de MENOR id (ou o montante de borda dela naquela ponta; sem nenhum dos dois, não há junção). Ele substitui os montantes de borda daquela ponta nas duas cortinas, e só a de menor id o emite (malha em `grupos`, planta, quantidade no papel 6 `PAPEL_CANTO`).
- **Colineares** (menos de ~2°): o mesmo preenchimento, sem encontros e com degrau no plano do nó se as profundidades diferem; um único montante em vez de dois de borda.
- A parede comum que termina na cortina continua com ponta livre; o resolvedor de camadas não muda (a cortina já é excluída da seção 1). O aviso `cortina-juncao-sem-vizinha` não foi implementado.
- Convenção do L invertido (decisão do dono): a esquadria ESPELHA, a aba troca de lado junto com a alma (a invertida gira o perfil 180° no próprio eixo); testado em `l_invertido_espelha_a_aba_junto_com_a_alma`.

**C16 (`docs/paridade/paredes.md`)** hoje diz `[-]` "Junção com pilar, viga e cortina de vidro: depende desses elementos, que têm checklists próprios". Esta decisão é o checklist da cortina. Atualização prevista na fase 3: `[~] C16 Junção com pilar, viga e cortina de vidro: cortina feita (encosto reto no montante de borda com parede comum; montante de canto entre cortinas; decisão 0056); pilar e viga seguem pendentes`, e a linha `A1` da paridade de paredes ganha nota "inclui parede cortina como família". `[-] A6 Parede inclinada` **continua fora** (a cortina inclinada fica fora desta decisão, §13).

---

## 7. Portas e janelas na parede cortina (definição completa; implementação na fase 5)

### 7.1 Modelo

A esquadria numa célula **não é uma `Opening`**: não existe `Opening` com `hostId` de cortina (a validação `opening-host-curtain` acusa erro). É uma **sobrescrita de célula** `OpeningCellOverride` (§4.3) que referencia um `OpeningType` do projeto: **o mesmo catálogo de tipos de porta e janela das paredes comuns**, com `width`, `height`, `sill`, `leaves`, `plan`, `composition`, ferragens, `threshold`, `fireRating`, `uValue`. Nada é duplicado: um tipo de porta "P-01 80×210" serve a parede comum e a cortina. `mark` mora na sobrescrita (a `Opening` tem `mark`; a célula também precisa ser etiquetável).

### 7.2 Ferramenta "Porta na cortina" (e "Janela na cortina")

Uma classe, `packages/tools/src/curtainOpeningTool.ts`, dois `ToolId` (`curtainDoor`, `curtainWindow`; a convenção segue a das esquadrias de parede [A CONFIRMAR em `openingTool.ts` na fase 5]). **Mesmo cabeçalho e seletor das esquadrias** (o `TypeSelector` com "Editar tipo", regra 2 do contrato) e a `OptionsBar` com os dois modos (§7.4) e o botão de inversão. A ferramenta `Porta` comum, ao passar sobre uma cortina, **não posiciona**: mostra a dica `tl_hint_use_curtain_door` e muda para a ferramenta de cortina com o mesmo tipo, para evitar `Opening` em hospedeiro cortina.

Comportamento do cursor (a **célula** é o alvo, não o ponto):
- **Planta:** o cursor sobre a cortina destaca a **coluna** de células sob `s` e escolhe a **fileira de base** (`j = 0`), que é onde a porta fica; a janela escolhe a fileira cujo `z` o usuário indica por tecla (`PageUp`/`PageDown` trocam de fileira, destaque na planta com a altura em texto).
- **3D e elevação:** o raio escolhe a célula exata `(i, j)`. Passar o cursor **destaca a célula** (contorno) e mostra um fantasma do tipo escolhido com o tamanho resultante do modo ativo. O clique insere.
- Espaço **inverte**, como nas esquadrias: o ciclo de `flipHand` e `flipFacing` é o mesmo de `openingTool.ts` (mesma tecla, mesmo ciclo, mesma ordem) [A CONFIRMAR a convenção atual na fase 5].
- Um clique é **um passo de desfazer** (`placeOpeningInCell`), inclusive as linhas criadas, as fusões e a remoção de montante.

### 7.3 Dois modos na `OptionsBar`

| Modo | O que faz | Persistência |
|---|---|---|
| **Preencher célula** (padrão, como no Revit) | A esquadria assume o **tamanho livre da célula** (largura entre as faces dos montantes menos a folga de 4 mm de cada lado, altura da base até a face do montante de cima). O `width`/`height` do tipo é ignorado na geometria | `fit: 'cell'`, nenhuma linha criada |
| **Ajustar grade à porta** (o diferencial) | Cria **linhas presas** à largura e à altura nominais (`nominalRef` e `spanGap` de `openingNominal.ts`: a medida do vão derivada da folha), **centradas** na célula ou **alinhadas à borda** da célula (o usuário escolhe `align`). A célula original vira: [sobra esquerda] [porta] [sobra direita] e [bandeira] acima; cada sobra ganha o painel padrão. Sobra menor que `minRemainder` ou que `minCell` é **absorvida** (o alinhamento passa à borda) | `fit: 'grid'`, `align`, `linkedLines` com as `AddedGridLine` criadas (`boundTo` a célula). Trocar o tipo da porta por outro de largura diferente **reaplica** o ajuste: as linhas presas se movem; as sobras e a bandeira acompanham |

### 7.4 Ajuste da grade: detalhes

- A porta de largura nominal `W` e altura `H_n` na célula `[s0, s1] × [z0, z1]`: centralizada, as linhas verticais ficam em `(s0+s1)/2 ± W/2`; alinhada ao início, em `s0` (a linha existente) e `s0 + W`; ao fim, em `s1` e `s1 − W`. A linha horizontal fica em `z0 + sill + H_n` (o topo do vão). Em **porta** com `threshold`, o `z` do piso da porta é `z0` (a soleira da própria esquadria fica no vão; o montante horizontal da base é removido, §7.5).
- As linhas criadas **atravessam toda a altura (vertical) ou todo o comprimento (horizontal)** da cortina, como as linhas de grade comuns. O usuário que quiser uma vertical só na altura da porta remove segmentos (fase 2) ou usa a opção da `OptionsBar` "Linhas só na esquadria" (grava `removedSegments` para o resto), que fica **ponto em aberto 5** (§14) por ser um refinamento.
- `linkedLines` guarda os ids das linhas criadas pelo modo; apagar a esquadria apaga as linhas que **nenhuma outra célula ou segmento usa** e restaura a grade anterior no que for restaurável.

### 7.5 Automatismos

1. **Montante da soleira removido, derivado, nunca gravado.** Em célula com `kind: 'door'` e `sill = 0` o Rust **omite o segmento horizontal de base** sob a porta (a borda de baixo da célula, quando o piso é a base da cortina ou o segmento é de tipo `interiorHorizontal` ou `borderBottom`). Como é derivado, **volta sozinho** ao desfazer, ao trocar a porta por janela, ao mover ou ao apagar a esquadria. Porta com `sill > 0` não remove nada. Janela nunca remove.
2. **Porta maior que a célula:** quando o modo é "Preencher célula" e o usuário pede o tamanho **nominal** do tipo (ou o ajuste de grade está desligado) e o tipo é **maior que a célula livre** (largura ou altura), o comando propõe a **fusão com as vizinhas** (como no ArchiCAD, que mescla painéis [R4/R5]) numa **confirmação** ("A porta P-01 (0,90 × 2,10) não cabe na célula (0,80 × 2,10). Fundir com a célula da direita?"). Aceita, grava `removedSegments` dos segmentos entre as células fundidas (regra do retângulo, §5.2) e o aviso `cortina-porta-funde-celulas`. A confirmação é um só desfazer.
3. **Célula menor que a folha mínima:** se a largura livre da célula (já com as folgas) é menor que a **folha mínima** do tipo (porta de giro 0,60 m, correr 0,50 m, janela 0,30 m [A CONFIRMAR], valores de um `curtainOpeningMinimums` editável), aviso `cortina-porta-folha-minima`; o comando **não bloqueia**.
4. **Porta fora do piso:** porta em fileira com `z0` maior que a tolerância do piso e `sill = 0` gera `cortina-porta-fora-do-piso`; não bloqueia (balcão elevado, passarela).
5. **Conflito de células:** célula com `PanelCellOverride` e depois `OpeningCellOverride` **substitui** a anterior (um painel por célula). Sobrescrita de painel em célula-porta é **recusada** (a célula já é uma esquadria).

### 7.6 Geometria da esquadria na célula

- O Rust devolve o **vão virtual** (consulta 107): retângulo `s0..s1 × z0..z1` em coordenadas da parede, profundidade do sistema, lado de abertura. O TS monta as peças com o **mesmo código das esquadrias de parede** (`openingParts.ts`/`pecasDoModelo`), posicionado nesse vão virtual: folha, vidro, ferragens, giro, soleira e arco de planta saem **idênticos** aos de uma porta numa parede comum. Nenhum construtor de porta novo.
- **Um só batente.** Nos lados da célula onde **existe montante**, o batente próprio da esquadria é **omitido** (o montante é o batente, como no Revit [R4/R5]); a folha fecha contra a face do montante com a folga padrão de 4 mm (`LEAF_GAP_DEFAULT`). Onde **não há montante** (célula com borda de tipo `null`, ou segmento removido pela fusão), a esquadria mantém o batente. A omissão é lista de lados que o vão virtual traz; `pecasDoModelo` ganha o parâmetro `omitirLados`. **Opção de tipo (decisão do dono, §14.3):** `OpeningType.keepOpeningFrame?: boolean` (ausente = `false`, ou seja, omitir) mantém o batente próprio da esquadria também onde há montante; o campo entra em `openingTypes.ts` na fase 5, não na fase 0. Isso resolve o **batente duplicado** que a pesquisa do ArchiCAD aponta [R5].
- Janela que abre (`kind: 'window'`) segue o mesmo modelo: peitoril = base da célula (`sillOverride` por instância), altura = célula ou nominal conforme `fit`.

### 7.7 Seleção e edição do subelemento

A esquadria na célula é **subelemento** da cortina (fase 2 já tem a seleção por Tab: parede → segmento/linha → célula → esquadria). O painel de propriedades dela usa o **mesmo cabeçalho de tipo** das esquadrias (`TypeSelector`, tipo, marca, inversões, peitoril, "Editar tipo"). Mover a esquadria é arrastar com snap nas células; apagá-la restaura o painel padrão e a grade como a regra 5 do §7.4.

### 7.8 Saídas

| Saída | Como |
|---|---|
| **Giro e arco em planta** | O símbolo (`plan` do tipo, `showSwing`, `leafPlan`) desenhado no plano central do sistema, no vão virtual, com `flipHand`/`flipFacing`; a cortina em planta desenha o vão da esquadria em vez da linha de vidro |
| **Marca** | `OpeningCellOverride.mark`, etiquetável como a das `Opening`; numeração automática segue a série das esquadrias |
| **Tabela de esquadrias** | A linha da esquadria da célula entra em `openingSchedule` com `host` = "Parede cortina {marca da parede}", `local` = `{i, j}` e a medida real (`fit: 'cell'` usa a medida da célula, não a do tipo); mesma dedução de totais |
| **Quantitativo de esquadrias** | A célula-porta soma ao quantitativo de esquadrias (tipo, quantidade, área de vidro **da porta**); sai do quantitativo de painéis (§5.7). O vidro da porta **não** conta como vidro de fachada |
| **IFC** | Cada célula com esquadria vira `IFCDOOR` ou `IFCWINDOW` **agregado** à `IFCCURTAINWALL` por `IFCRELAGGREGATES` (§11, fase 6); as partes dela (batente, folha, vidro) seguem as da esquadria comum (`ifcElements.ts`) [A CONFIRMAR o agregado de porta em cortina nos visualizadores e no Revit] |
| **DXF** | Camada da esquadria (a mesma das esquadrias de parede) com o símbolo de planta; camada da cortina com os montantes |

### 7.9 Comparação com o Revit e o ArchiCAD, e por que esta proposta é melhor

| Tema | Revit | ArchiCAD | Hestia (esta decisão) |
|---|---|---|---|
| O que é a porta na cortina | Um **painel de cortina** de família específica ("porta de curtain wall") [R4/R5] | Um **objeto GDL** inserido no painel, com `Member Type = Door` [R4/R5] | Uma **sobrescrita de célula** que referencia o **mesmo `OpeningType`** das paredes comuns |
| Passos manuais | Desafixar o painel, trocar pelo seletor, **apagar o montante sob a porta** [R4/R5] | Remover o frame entre painéis, **mesclar**, escolher o tipo [R4/R5] | **Um clique.** Soleira, fusão e inversão são automáticos e reversíveis |
| Tamanho da porta | Pelo painel: a porta tem o tamanho da célula (se a família é paramétrica) | Pelo painel (dimensões do painel) | **Dois modos**: preencher a célula, ou **ajustar a grade ao tamanho nominal** (centrado ou alinhado) |
| Batente | O montante é o batente; "frameless" por convenção [PROVÁVEL] | Possível batente duplicado (transom do CW mais batente do objeto) [R5, dedução] | O batente próprio **só aparece onde não há montante** |
| Catálogo | Família separada só para cortina | Objeto separado para painel | **Um catálogo**: o tipo de porta da parede serve à cortina |
| Marca e tabela | Marcas duplicadas e auto-numeração problemática em versões antigas [PROVÁVEL] | O painel não usa marcador de porta/janela [R4/R5] | Marca própria da célula e **linha na tabela de esquadrias** |
| Vidro da fachada | A porta é painel: a contagem por área depende do autor da família | Depende do autor do objeto | O vidro da porta **não conta** como vidro de fachada; a tabela e o quantitativo separam por construção |
| Desfazer e troca | Manual | Manual | A soleira volta sozinha (derivada); a troca de tipo reaplica as linhas presas |
| Remapeamento | Perde o override ao mudar a grade [A CONFIRMAR] | Idem [A CONFIRMAR] | A sobrescrita segue a célula (índice mais posição, §4.4) |

**Por que é melhor:** (1) **catálogo único**, sem duplicar famílias; (2) **zero etapas manuais** (o fluxo do Revit e do ArchiCAD tem de 3 a 5 passos que o usuário erra); (3) o **modo de ajuste de grade** resolve o problema que os dois programas deixam ao usuário (a célula não bate com a porta); (4) **sem batente duplicado**; (5) **quantitativos e tabela corretos por construção**, com o vidro da porta separado; (6) **reversível e paramétrico** (a porta acompanha a grade; a grade acompanha a porta). **Custo honesto:** a esquadria da cortina é limitada ao que o `OpeningType` e a composição sabem desenhar; uma porta de família arbitrária (que o Revit aceita) exige o `ComponentFamily` futuro (§13).

---

## 8. Cortina embutida em parede comum (fase 5)

### 8.1 Modelo

Uma cortina embutida é uma `Wall` de família `curtain` com `Wall.curtain.host = { wallId, offset, width, sill, height }` (§4.3). A `Wall` espelha `a`, `b`, `baseOffset`, `height` a partir do `host` e do hospedeiro (`syncHostedCurtain`); a posição **manda** em `host`. A ferramenta "Cortina embutida" (cabeçalho e seletor das paredes, opção na `OptionsBar` com largura, altura e peitoril) funciona como a de esquadria: o cursor sobre uma parede comum mostra o vão, o clique insere.

### 8.2 Recorte automático e colisões

- A consulta `cortina_recorte_hospedeiro` devolve o retângulo `{t0, t1, z0, z1}` no referencial do hospedeiro. O recorte **vale em todas as camadas** (como uma abertura, item D1 da paridade), sem alterar `Wall` do hospedeiro: o recorte é derivado, nunca gravado.
- **Colisão com abertura:** uma `Opening` do mesmo hospedeiro cujo intervalo `[t, z]` intersecta o da cortina gera `cortina-colide-abertura`. **Aviso** quando a sobreposição é parcial; **bloqueio** (o comando recusa) quando a cortina cobriria uma abertura por inteiro, para não esconder uma esquadria.
- Cortina maior que o hospedeiro (passa das pontas ou do topo): aviso `cortina-recorte-fora-do-hospedeiro` e o recorte é limitado ao hospedeiro.
- Camadas do hospedeiro que "envolvem" nos vãos (`wrapInserts`) **não** voltam na cortina (a cortina é um sistema fechado): o retorno do acabamento aplica-se à borda do recorte como em um vão sem esquadria (`closure: 'inherit'`).

### 8.3 Hospedeiro apagado

Apagar a parede hospedeira **promove a cortina a independente**: o comando `promoteCurtain` remove `host`, mantém `a`, `b`, altura e posição como estavam e emite o aviso `cortina-hospedeiro-ausente` (informativo, com "Ir para"). Nada é apagado em cascata. Se o arquivo chega com `host.wallId` inexistente (importação, plugin), a validação trata como o mesmo caso: promove na abertura, com aviso, e uma única mensagem por arquivo.

### 8.4 Dividir e mover o hospedeiro

`splitWall` no hospedeiro: se o ponto de corte cai **fora** do intervalo da cortina, a cortina é reassociada à parte que a contém e o `offset` é recalculado; se cai **dentro**, o comando é **rejeitado** com a mensagem `tl_msg_split_curtain_inside` (como a divisão da parede que contém uma abertura no ponto de corte). Mover, girar, espelhar ou copiar o hospedeiro leva a cortina embutida junto (regra de elemento hospedado do contrato, regra 3, igual ao guarda-corpo); sozinha a cortina embutida **move-se ao longo do hospedeiro** (como uma esquadria): arrastar altera `host.offset`, e a ferramenta recusa movê-la para fora do hospedeiro.

---

## 9. Desempenho

- **Instanciação:** montantes e painéis são **instâncias** de protótipos de comprimento unitário (§5.5); o 3D usa um `InstancedMesh` por (protótipo, material). 60 células resultam em 60 painéis e ~120 segmentos de montante, ~180 instâncias em ~4 protótipos.
- **Cache por assinatura:** `assinaturaDaCortina` = `hashTexto` do conjunto: campos da `Wall` que alteram a geometria (`a`, `b`, `sag`, `baseOffset`, `height`, anexações), `typeId` e a assinatura do `WallType`, as assinaturas dos tipos de montante e de painel referenciados, `CurtainInstance` e, da fase 3, a assinatura das paredes vizinhas das duas pontas. O Rust tem cache por `id_num` (upsert); o TS tem o cache de malha por `(cortina, assinatura)`.
- **A chave do nível usa hash, nunca o JSON da grade.** `chavesDeNivel` (`chaveNivel3d.ts`) inclui **só o hash agregado das assinaturas das cortinas do nível** (e dos vizinhos por cota, como já faz); nenhuma serialização da grade, dos montantes ou das sobrescritas entra na chave. Teste: editar uma linha de grade de uma cortina muda a chave só do nível dela; o tamanho da chave não cresce com o número de células.
- **Vidro transparente em grupo separado:** todo painel `glass` sai com `transparente = 1` e vai num **grupo de desenho posterior** aos opacos, com ordenação por distância no render e `depthWrite` desligado; montantes e painéis sólidos entram no grupo opaco. Na fase 7, o vidro com transmissão (`transmission`, absorção) usa o mesmo grupo.
- **Meta: 20 pavimentos × 60 células** (1 200 células, ~3 600 instâncias): `cortina_grade + cortina_malha` de todos os níveis **< 50 ms** a frio no Rust nativo e no WASM (meta a medir na fase 7; o WASM tem seu fator); edição de **uma** cortina (reconstrução incremental) **< 8 ms**; memória de malha **< 10 MB**; 3D com **< 20 desenhos** de cortina por quadro (uma por protótipo e material por nível, não por célula). Medido num projeto sintético e num dos projetos reais da suíte de desempenho; o orçamento entra no teste de desempenho da fase 7 e num teste de regressão menor na fase 1 (5 níveis × 60 células).

---

## 10. Fases de implementação (0 a 7)

**Regra de cada fase** (decisão 5): na mesma fase, **(a)** contrato (seção nova no esquema, `versao` incrementada, tipos TS), **(b)** referência TS em `packages/engine/src/cortinaRef/` **só quando barata** (e só usada em paridade), **(c)** implementação Rust com testes, **(d)** teste de paridade que **fecha a fase**, **(e)** integração no 3D, na planta e na UI. Cada fase termina com `npm test` nos pacotes tocados, `cargo test -p geom-wasm`, `cargo clippy`, commit em português e handoff curto em `docs/handoff/parede-cortina/ESTADO.md`. A regra dos arquivos compartilhados do guarda-corpo vale: o dono de cada arquivo compartilhado (`cena.rs`, `lib.rs`, `esquema.rs`, `cena-v11.json`, `index.ts`, `i18n.ts`) é a fase que o toca; as demais só leem.

**Divisão do trabalho:** **Sonnet** (médio) no complexo: algoritmo da grade e da sobra, remapeamento de chaves, junções e aparos, arco e facetas, recorte do hospedeiro, vão virtual da porta, mapeamento IFC, desempenho. **Haiku** no mecânico: tipos TS, migração, i18n nos sete idiomas, campos do diálogo, tabelas e CSV, camadas DXF, testes de contrato derivados, geração do JSON e do `esquema.gerado.ts`, atualização de documentos. O orquestrador **fiscaliza** cada entrega (diff e testes) e não escreve código de motor; motor delicado vai ao Sonnet, nunca ao Haiku.

### Fase 0 — ADR, migração e `WallType.family` (TS puro; bloqueante)
- Esta decisão; `wallCurtainTypes.ts` (tipos do §4); `wallThicknessOf` e a troca dos ~18 pontos de `totalThickness` que recebem `WallType`; `SCHEMA_VERSION` 25 e migração 24 → 25; `Project.mullionTypes?`/`curtainPanelTypes?` e leitores com padrão; os quatro comandos de montante e painel (§4.7); `curtainTypeIssue`; validação `opening-host-curtain`; testes-guarda (`contratoCortina.test.ts`): nenhum consumidor lê `layers` de tipo cortina fora da lista; nenhum `totalThickness(WallType)` fora de `wallType.ts`. O campo `keepOpeningFrame` (§7.6) **não** entra na fase 0.
- **Aceite:** projeto 24 abre e salva como 25; um `WallType` com `family: 'curtain'` e `curtain` válido grava e relê; `wallThicknessOf` devolve `depth`; os três testes de contrato passam **sem editar** a classificação; nenhuma saída muda para arquivo antigo.
- **Testes:** migração (24 → 25, 25 abre, maior recusa), serialização ida e volta, `curtainTypeIssue` (cada regra), `wallThicknessOf` (básica, cortina, sombra), camada-sombra mantida por `upsertWallType`, guarda dos call sites, `deleteMullionType` em uso recusado, leitor de padrão e primeira escrita grava o conjunto.
- **Quem:** Haiku (tipos, migração, testes); Sonnet revisa a troca dos call sites.
- **Depende de:** nada. **Bloqueia** todas.

### Fase 1 — MVP reto
- **Contrato:** `versao` 14; seções 100 a 105; consultas 100, 101, 102, 104, 105 (§6.1). Tipos TS espelhados.
- **Referência TS** (barata): `cortinaRef/grade.ts` (linhas, células, fusão da sobra, `fixedNumber`/`fixedDistance`/`maxDistance`/`manual`, `offset`), `cortinaRef/pecas.ts` (lista de instâncias: origem, comprimento, perfil), `cortinaRef/quant.ts`. Planta: sem referência (compara com casos dourados).
- **Rust:** `cortina_grade.rs`, `cortina_pecas.rs` (montantes retos `rect`/`round`; painéis `glass`/`solid`/`empty`; `joinPriority`; aparo reto), `cortina_planta.rs` (3 níveis de detalhe), `cortina_quant.rs`, `cortina_avisos.rs`; despacho em `cena.rs`/`lib.rs`.
- **Integração:** `kernelCortina.ts` (seções e upsert incremental), exclusão da cortina da seção 1 em `kernelA1.ts`, `render/model3d/cortina3d.ts` (instanciada, vidro em grupo separado), camada de planta, eixo e aviso sem kernel, aba **"Cortina"** no `WallTypeDialog` (Grade, Montantes, Painéis, Sistema; esconde Camadas, Faixas, Retornos), `WallProperties` com a grade da instância e `TypeSelector` agrupando as duas famílias, os três presets de fábrica, `curtainQuantities.ts` e a tabela de quantitativos da cortina, i18n `md_ct_*` em sete idiomas.
- **Aceite:** desenhar uma cortina pela ferramenta `wall` com um tipo `curtain`, ver o 3D (montantes e vidro) e a planta nos três níveis, trocar o modo de grade e ver atualizar sem recarregar; quantitativo de área bruta, vidro e comprimento de montante bate com a referência; com o kernel desligado aparece o eixo e o aviso; os três testes de contrato passam; **nenhum** teste de parede básica muda de saída.
- **Testes:** paridade grade (4 modos × justificações × `offset` × sobra fundida, 200 casos aleatórios com semente), paridade de peças e quantitativos, casos dourados de planta (grosso, médio, fino), cada código de aviso da fase, edição de tipo no diálogo (aba), troca de tipo no `TypeSelector`, desempenho leve (5 × 60), eixo sem kernel.
- **Quem:** Sonnet (grade, peças, planta, aparo, adaptador); Haiku (diálogo, i18n, presets, quantidades TS, tabela).
- **Depende de:** fase 0.

### Fase 2 — Edição e seleção de subelemento com Tab
- **Contrato:** `versao` 15; seções 106 a 109; sem consulta nova (colunas de remapeamento em 100 e 105).
- **Referência TS** (barata): `cortinaRef/remap.ts` (as regras 1 a 6 do §4.4), `cortinaRef/segmentos.ts` (remoção e região retangular).
- **Rust:** leitura das instâncias, remapeamento, regiões fundidas, montantes por linha, `locked`, `pos`; avisos `cortina-override-orfao`, `cortina-celula-nao-retangular`.
- **Integração:** comandos do §4.7 da fase 2; **seleção de subelemento com Tab** (parede → linha/segmento → célula; a esquadria da célula entra na fase 5): o `Tab` percorre, o destaque desenha o subelemento (planta, 3D e elevação); alças de linha (arrastar, travar com um ícone de cadeado); painel de propriedades do subelemento (tipo de montante da linha, tipo de painel da célula, "Voltar ao padrão"); `normalizarSobrescritas`; `splitWall`, espelhar e aparar/estender seguindo o §4.9; o aviso de projeto `cortina-override-orfao` na lista de Problemas.
- **Aceite:** adicionar, mover, travar e apagar uma linha, remover e restaurar um segmento, trocar o painel de uma célula (sólido numa fileira), esticar a parede e ver as sobrescritas acompanharem as células; espelhar, dividir e copiar a cortina mantém as sobrescritas nas células certas.
- **Testes:** paridade do remapeamento (grade ganha linha, perde linha, parede encurta, parede estica, espelha, divide, funde duas sobrescritas), regra da região retangular, `normalizarSobrescritas` (descarta órfãs, regrava chaves, um passo de desfazer), tabela do §4.9 (`cortinaModificacao.test.ts`), seleção por Tab (ciclo, planta/3D/elevação), alças.
- **Quem:** Sonnet (remap, segmentos, Rust); Haiku (propriedades, alças simples, i18n, testes de comando).
- **Depende de:** fase 1.

### Fase 3 — Montantes e junções
- **Contrato:** `versao` 16; seção 110; sem consulta nova.
- **Referência TS:** **sem** referência (aparo geométrico não é barato de espelhar); paridade é substituída por **testes de propriedade** (sem sobreposição de sólidos no plano `(s, z)`, malha fechada e orientada, simetria por espelho) mais casos dourados em planta.
- **Rust:** perfis `L`, `trapezoid`, `corner` (seção com `widthBack`, `thickness`), esquadria no aparo, `joinPriority` completo nas quatro interseções, junção v1 (§6.5): encosto reto no montante de borda com parede comum (L e T), montante de canto entre cortinas, `noJoin*`.
- **Integração:** `kernelCortina.ts` envia as extremidades (vizinha, ângulo, faces), o editor de tipo de montante (aba Montantes) com formas e prévia 2D, ajuste do `kernelA1.ts` para as paredes comuns que terminam na cortina, atualização do **C16** em `docs/paridade/paredes.md`.
- **Aceite:** uma cortina em L com outra, uma cortina em T com parede comum e um canto de 135° saem sem fresta nem sobreposição; trocar `joinPriority` troca qual montante corre; `noJoin` desliga o encosto.
- **Testes:** propriedade (cantos de 30° a 150°, espessuras diferentes), dourados de planta e 3D, `C16` na paridade, regressão visual de três cantos, perfis `L`/`trapezoid`/`corner` (volume e área do perfil conferidos pela fórmula), `joinPriority` nas quatro interseções.
- **Quem:** Sonnet (aparo, canto, encosto); Haiku (editor, i18n, paridade doc).
- **Depende de:** fase 2.

### Fase 4 — Arco e cadeia de segmentos
- **Contrato:** `versao` 17; seção 111; leitura de `sag` já existe em 100.
- **Referência TS** (barata): `cortinaRef/arco.ts` (comprimento de arco `R·θ`, divisão por arco, ponto e tangente de cada linha, facetas e desvio de seta).
- **Rust:** grade U por **comprimento de arco**, painéis **facetados**, montantes orientados pela bissetriz, planta em facetas, **cadeia só de segmentos**: cada cortina reparte o próprio comprimento e a junção entre duas cortinas em ângulo usa o montante de canto (decisão do dono, §14.2). A grade contínua pela cadeia (`chain`) está **fora de escopo**.
- **Integração:** arco na ferramenta `wall` (por três pontos e por centro/raio, já existentes) com tipo cortina; prévia do arco com as divisões; `facetMaxChord` no diálogo; aviso `cortina-faceta-grande`.
- **Aceite:** cortina em arco de raio 3 m a 50 m com a grade por comprimento de arco, painéis planos sem fresta visível, montantes radiais (a bissetriz), planta nas facetas; cadeia de três cortinas ligadas por montante de canto, cada uma com a sua grade.
- **Testes:** paridade (divisão por arco, posição e tangente das linhas, desvio de seta), casos dourados de raio, propriedade (a soma das cordas ≤ comprimento de arco; `sag = 0` reproduz o reto), cadeia de segmentos com canto, regressão visual.
- **Quem:** Sonnet (arco, facetas, cadeia); Haiku (diálogo, i18n, dourados).
- **Depende de:** fase 3.

### Fase 5 — Portas e janelas na célula e cortina embutida
- **Contrato:** `versao` 18; seções 112 e 113; consultas 106 e 107; reaproveita a seção 7 (`tipos_abertura`).
- **Referência TS** (barata): `cortinaRef/celulaPorta.ts` (preencher a célula, ajuste de grade, linhas presas, fusão), `cortinaRef/recorte.ts` (recorte retangular no referencial do hospedeiro e colisão).
- **Rust:** vão virtual da célula, lados com montante a omitir, soleira derivada (§7.5), fusão por porta maior, folha mínima, recorte do hospedeiro e colisões (§8.2).
- **Integração:** as ferramentas "Porta na cortina" e "Janela na cortina" (§7.2) e "Cortina embutida" (§8.1); `omitirLados` em `pecasDoModelo`; planta (giro e arco no vão virtual), tabela e quantitativo de esquadrias (§7.8), marca, comandos `placeOpeningInCell`, `fitGridToOpening`, `placeEmbeddedCurtain`, `syncHostedCurtain`, `promoteCurtain`, `splitWall` (§8.4); aviso `opening-host-curtain` para `Opening` em cortina; `Tab` percorre a esquadria da célula.
- **Aceite:** inserir uma porta numa célula em planta, em 3D e em elevação, com o destaque da célula ao passar o cursor; os dois modos; a soleira some e volta; a fusão pede confirmação; Espaço inverte; a tabela de esquadrias mostra a porta com a cortina como hospedeiro e o vidro da porta fora do vidro de fachada; embutir uma cortina numa parede recorta o hospedeiro em todas as camadas; apagar o hospedeiro promove e avisa; colisão com abertura avisa ou bloqueia; `splitWall` divide ou rejeita.
- **Testes:** paridade de célula, ajuste de grade, fusão e recorte; os dois modos com tipo menor, igual e maior que a célula; alinhamento (centro, início, fim); soleira derivada (desfazer e troca); folha mínima; porta fora do piso; janela; flips; tabela e quantitativo (vidro da porta separado); `Opening` hospedada em cortina é erro; `splitWall` dentro e fora do intervalo; promoção.
- **Quem:** Sonnet (vão virtual, fusão, recorte, `omitirLados`); Haiku (tabelas, i18n, comandos simples, testes de ferramenta).
- **Depende de:** fases 2 e 3.

### Fase 6 — Elevação e corte, IFC, DXF R2000, importação IFC
- **Contrato:** `versao` 19; consulta 103; sem seção nova.
- **Referência TS:** **sem** (compara-se corte e elevação com planta e malha por consistência); IFC e DXF são TS.
- **Rust:** `cortina_corte` (perfis cortados e vidros em `(s, z)`, linhas projetadas de montantes e painéis na elevação, a esquadria da célula).
- **Integração:** vistas de **elevação e corte** (`render/src/section/`) com a cortina; **IFC** (`io/src/ifc/ifcCurtainWall.ts`): `IFCCURTAINWALL` por parede cortina, com `IFCRELAGGREGATES` para `IFCPLATE` (painéis; `CURTAIN_PANEL` no vidro, `SHEET` no sólido), `IFCMEMBER` (`MULLION`; `USERDEFINED` quando a forma for `corner`), `IFCDOOR`/`IFCWINDOW` por célula com esquadria, tipos por `IFCRELDEFINESBYTYPE` e **`IFCMAPPEDITEM`** (uma representação por protótipo de montante e de painel, instanciada nas matrizes); `Pset_CurtainWallCommon`, `Pset_MemberCommon`, `Pset_PlateCommon`; **DXF R2000** (camadas `CORTINA-MONTANTE`, `CORTINA-VIDRO`, `CORTINA-SOLIDO`, `CORTINA-ESQUADRIA`, espessura de linha por camada, na linha do trabalho `feat/dxf-r2000`); **importação IFC**: `IFCCURTAINWALL` com `IFCPLATE` e `IFCMEMBER` regulares vira `Wall` de tipo cortina com grade inferida das posições dos montantes (tolerância 5 mm); irregular continua como `Generic`.
- **Aceite:** corte e elevação mostram montantes e vidro (cortados e projetados) e a esquadria; o IFC abre em um visualizador sem erro de validação e mantém a hierarquia; o DXF abre no AutoCAD sem aviso (teste headless da referência do projeto); importar o IFC exportado da própria cortina reconstrói o tipo e a grade.
- **Testes:** corte e elevação por casos dourados, IFC (entidades, hierarquia, `IFCMAPPEDITEM` por protótipo, `PredefinedType`, quantidades), ida e volta IFC (exporta e importa), DXF por camada e validação headless, importação com grade regular e irregular.
- **Quem:** Sonnet (consulta 103, importação, hierarquia IFC); Haiku (camadas DXF, psets, i18n, testes de formato).
- **Depende de:** fases 1 a 5.

### Fase 7 — Ângulo da grade, empena, vidro com transmissão, desempenho
- **Contrato:** `versao` 20; seção 114 (`cortina_perfil_topo`); colunas de transmissão em 105.
- **Referência TS:** só para o recorte de célula por semiplano (linha inclinada, barata); empena por casos dourados.
- **Rust:** `angle ≠ 0` (linhas inclinadas, células paralelogramo, células de borda recortadas em triângulo ou trapézio), **empena** (perfil superior da cortina `topProfile`: o contorno superior poligonal, células de borda aparadas, painéis recortados), vidro com transmissão (material `transmission`, absorção e índice de refração para o render GPU, grupo transparente; ligação com o roteiro de ultrarrealismo e com a janela de materiais sem campos PBR).
- **Integração:** campo `angle` liberado no diálogo; `topProfile` liberado para a cortina; materiais de vidro com transmissão; **teste de desempenho** (meta do §9) e orçamento no CI.
- **Aceite:** grade a 45°, empena de duas águas e painel de vidro com transmissão renderizam sem artefato; 20 pavimentos × 60 células dentro da meta; o aviso `cortina-angulo-nao-suportado` some.
- **Testes:** dourados de células recortadas, propriedade (área das células = área da região), desempenho (§9), regressão visual de empena e de vidro.
- **Quem:** Sonnet (recorte, empena, desempenho); Haiku (diálogo, i18n, materiais).
- **Depende de:** fases 4 e 6.

### Mapa de paralelismo

```
F0 ── F1 ── F2 ── F3 ── F4 ──┐
                 └── F5 ──────┼── F6 ── F7
        (F5 depende de F2 e F3)
```

Dentro de uma fase, **Rust e TS** (UI, quantidades) rodam juntos depois que o JSON do contrato é congelado no primeiro commit da fase. Itens independentes rodam em **paralelo, sempre**, cada agente em seu worktree.

---

## 11. Quantidades, IFC e DXF (resumo; detalhes em §5.7, §7.8 e na fase 6)

- **Quantidades:** §5.7. Agregação em `engine/src/curtainQuantities.ts` (TS só soma o que `quant_cortina` devolve). Entra no quadro de elementos por tipo, no de materiais (por `materialId` de montantes e painéis) e no quantitativo de esquadrias (célula-porta).
- **IFC (esquema IFC4, `io/src/ifc/ifcCurtainWall.ts`):** `IFCCURTAINWALL` contido no pavimento; partes por `IFCRELAGGREGATES`: `IFCPLATE` (`CURTAIN_PANEL` vidro, `SHEET` sólido), `IFCMEMBER` (`MULLION`), `IFCDOOR`/`IFCWINDOW` das células; geometria por `IFCMAPPEDITEM` por protótipo; `Pset_CurtainWallCommon` e `Qto_CurtainWallBaseQuantities`; `IFCCURTAINWALLTYPE` por `WallType`. Escolhas de enumeração e a presença de porta agregada à cortina: [A CONFIRMAR] com BIMcollab, Solibri e Revit na fase 6.
- **DXF R2000:** planta em três níveis (reusa `cortina_planta`) com camadas separadas por papel; elevação e corte pela consulta 103.

---

## 12. Riscos

1. **Consumidores de parede que não sabem de cortina (maior risco).** 31 arquivos usam `wallsOnLevel` e todos assumem `layers` e junção por camada. Mitigação: a cortina **sai** do pipeline de camadas (kernel A1, junções, sólidos e planta de paredes) por uma checagem única `isCurtainWall`, o teste-guarda da fase 0 impede ler `layers` de tipo cortina fora da lista, e a camada-sombra (§4.1) garante espessura correta mesmo em código não migrado. A lista de consumidores a revisar sai de `grep` no início da fase 1 e fica no handoff.
2. **Camada-sombra.** Duplica a espessura. Se alguém a editar à mão, diverge. Mitigação: `upsertWallType` a regrava; `curtainTypeIssue` acusa divergência.
3. **Sobra minúscula e célula pequena.** O limiar de 0,05 m e o `minCell` de 0,15 m são escolhas minhas, não medidas de norma ou de catálogo [A CONFIRMAR com projetista de esquadrias]. Ficam editáveis (`minRemainder`, `minCell`).
4. **Remapeamento ambíguo.** Dois overrides que caem na mesma célula, ou grade que muda muito, perdem sobrescritas. É a decisão do dono (descarte com aviso); a mitigação é o aviso visível e o desfazer.
5. **Região fundida não retangular.** Exigir retângulo (§5.2) é restritivo (Revit e ArchiCAD aceitam formas livres [A CONFIRMAR]); evita painel de forma arbitrária na v1. Revisar com uso.
6. **Batente da porta na célula.** Omitir o batente onde há montante é uma escolha de projeto (§7.6) que desvia da prática do ArchiCAD e iguala a do Revit; em uso real, alguns fabricantes exigem batente próprio dentro do vão. Mitigação: a omissão é por lado e só onde há montante, e o `OpeningType` pode forçar "manter batente" pelo campo `keepOpeningFrame` (§14.3, decidido).
7. **Vidro transparente.** Ordenação de painéis transparentes por distância não resolve cruzamentos entre painéis grandes; a fase 7 testa transmissão e, se faltar, usa ordenação por pixel (OIT) já prevista no roteiro de ultrarrealismo.
8. **Colisão de versão.** `SCHEMA_VERSION` 25 coincide com `feat/familias-interface`; `versao` do kernel 14 em diante pode coincidir com as branches 0051 a 0053. Renumera quem mesclar depois.
9. **Kernel desligado.** A cortina só desenha o eixo e as faces; não pode ser extrudida como parede por nenhum caminho (teste da fase 1).
10. **IFC.** Enumerações de `IFCMEMBER`, `IFCPLATE` e agregação de portas à cortina variam entre visualizadores [A CONFIRMAR]; a fase 6 valida em três.
11. **Licença.** Só conceito e método do Revit e do ArchiCAD; nenhuma geometria, família ou texto de manual copiado.

---

## 13. O que não entra nesta decisão

Cortina **inclinada** e superfícies livres ou massas conceituais ("curtain system" sobre massa); grade contínua pela cadeia de cortinas (`chain`, decisão do dono, §14.2); fusão de células não retangular antes da fase 7 (§14.4); painéis de **família autoral** (`ComponentFamily` da decisão 0049, ainda fora da main) e **painel sólido com camadas**; padrões repetidos de painel (painéis paramétricos, brises); vidro estrutural com fixação pontual (*spider*); **cálculo** estrutural, térmico ou de vento (só dados declarados: U, fogo); **Adjust for Mullion Size** (grade medida pela face do montante); porta de família arbitrária; seleção de subelemento por filtro de categoria no menu de seleção; cortina em **parede curva por B-spline** (só arco, fase 4); conversão automática de parede básica em cortina com perda de camadas.

---

## 14. Pontos em aberto para o dono

Decisões do dono registradas em 2026-11-10 (itens 1 a 4 e 7). Os itens 5, 6 e 8 seguem em aberto.

1. **Limiares: decidido.** `minRemainder` 0,05 m e `minCell` 0,15 m ficam **aceitos** como padrão e **configuráveis no `CurtainSpec`** (campos `minRemainder?` e `minCell?` do §4.2; o `minRemainder` saiu de `GridAxisSpec` e passou ao sistema inteiro). Valores de fabricante, se houver, substituem no tipo; a marcação [A CONFIRMAR] continua valendo para a norma.
2. **Cadeia de cortinas (fase 4): decidido.** Vale **`segment`**: cada cortina reparte o próprio comprimento e a cadeia só carrega o **montante de canto** na junção. A grade contínua pela cadeia (`chain`) **fica fora de escopo**; o campo `chainGrid` sai do esquema.
3. **Batente da porta na célula (§7.6): decidido.** Omitir o batente onde há montante é o padrão. A opção de tipo `OpeningType.keepOpeningFrame?: boolean` (ausente = `false`) mantém o batente próprio mesmo onde há montante. Campo implementado na fase 5.
4. **Região fundida (§5.2): decidido.** Até a fase 7, a fusão de células é **só retangular**. A fusão de forma livre não entra antes disso.
5. **"Linhas só na esquadria" (§7.4):** entra na fase 5 ou fica depois?
6. **Sub-estilos gráficos:** montante e vidro como subcategorias de `wall` para pesos de linha e cores (fase 6), ou categorias próprias `mullion`/`curtain-panel`?
7. **`SCHEMA_VERSION` 25 e `versao` do kernel 14: decidido.** Colidem com `feat/familias-interface`. **Quem mesclar por último renumera**, e a expectativa é que seja a cortina (ver §4.8).
8. **Altura máxima da cortina e painel de vidro máximo:** `cortina-vidro-grande` precisa de limite por tipo de vidro (fornecedor, norma NBR 7199 [A CONFIRMAR]); quer um perfil de norma como o do guarda-corpo?

## 15. Divergências Revit × ArchiCAD que exigiram escolha

| Tema | Revit | ArchiCAD | Escolha no Hestia |
|---|---|---|---|
| Elemento | `Wall` de família "Curtain Wall" [A CONFIRMAR] | Elemento Curtain Wall próprio [R4/R5] | `Wall` com `family: 'curtain'` (decisão do dono) |
| Montante | Tipo com perfil carregado, posição e deslocamento [R4/R5] | Frame preso à linha de grade, classes Boundary/Mullion/Transom, prioridades 15/10/5 [R4/R5] | Tipo paramétrico por forma, papéis (interior, borda, canto), **`joinPriority`** de dois valores |
| Distribuição da grade | Layout e justificação por eixo [A CONFIRMAR] | Divisões por número ou distância [A CONFIRMAR] | Quatro modos, justificação, `offset` e `angle`, mais fusão da sobra |
| Edição de linhas e segmentos | Adicionar linha, remover segmento, travar [A CONFIRMAR] | Editar na vista esquemática, frame preso à gridline [R4/R5] | `addedLines`, `removedSegments`, `lineOverrides`, **chave de célula índice mais posição** |
| Porta na cortina | Painel de família específica, desafixar, apagar montante [R4/R5] | Objeto no painel, remover frame, mesclar [R4/R5] | Sobrescrita de célula com o `OpeningType` comum, dois modos de ajuste, soleira derivada (§7) |
| Batente | O montante [R4/R5] | Duplicável [R5] | O montante onde há montante |
| Embutida | *Automatically Embed* [A CONFIRMAR] | Embutir CW em parede (recorte) [A CONFIRMAR] | `host` na instância, recorte derivado, promoção ao apagar o hospedeiro |
