/* eslint-disable max-lines */
import type { DimensionElementRef, DimensionStyle } from './dimensionContract.ts';
import type { DimensionFamily } from './dimensionFamily.ts';
import type { Vec2 } from '@hestia/geom';
import type { Stair, StairType } from './stairTypes.ts';
import type { Ramp, RampType } from './rampTypes.ts';
import type { ViewRange } from './viewRange.ts';
import type { Sheet } from './sheet.ts';
import type { View3DPoint } from './view3dPoints.ts';
import type { RenderCamera } from './renderCameras.ts';
import type { Grid, GridType } from './grid.ts';
import type { ProjectGraphics, View3DSettings, ViewGraphics, ViewHidden } from './graphics.ts';
import type { SectionAnnotations } from './sectionAnnotations.ts';
import type { Opening, OpeningLineConvention, OpeningType } from './openingTypes.ts';
import type { ProfilePreset } from './openingComposition.ts';
import type { DimensionSettings } from './dimensionSettings.ts';
import type { UnitsSettings } from './units.ts';
import type { AreaPlan, ColorScheme, RoomCategory } from './areaPlan.ts';
import type { DxfLayerStyle } from './dxfLayerStyle.ts';
import type { CadDrawing } from './cad.ts';
import type { CopyLink } from './copyLink.ts';

export type Id = string;
export const SCHEMA_VERSION = 23;

export type { Stair, StairCurve, StairGenerator, StairLanding, StairRun, StairRunStyle, StairSpiralParams, StairType, StairUndersideStyle } from './stairTypes.ts';
export type { Ramp, RampInputMode, RampNormProfile, RampNormRow, RampShape, RampType } from './rampTypes.ts';
export type * from './openingTypes.ts';

/** Funções de camada, no modelo do Revit (docs/05 §1). */
export type LayerFunction = 'structure' | 'substrate' | 'thermal' | 'membrane' | 'finish1' | 'finish2';

/** Hachura de superfície. `gesso` é a do forro (tracejado leve), definida no tipo de forro (decisão 0021, D3). */
export type HatchKind = 'solid' | 'diagonal' | 'cross' | 'dots' | 'gesso' | 'none';

export interface Material {
  id: Id;
  name: string;
  /** Cor de aparência (3D e preenchimento de planta), #rrggbb. */
  color: string;
  /** Hachura de corte em planta. */
  hatch: HatchKind;
  /** Rugosidade/brilho simples para o 3D (0 fosco … 1 espelhado). */
  gloss: number;
  /** Opacidade 0..1 (vidro). */
  opacity: number;
  cost: number;
  /** Unidade do custo/quantitativo. */
  unit: 'm2' | 'm3' | 'm';
  /**
   * Propriedades físicas para o render PBR (todas opcionais: arquivo antigo não as tem). Os valores efetivos e os
   * padrões ficam em `materialPbr.ts` (`materialRoughness`, `materialMetallic`, …), nunca lidos direto do campo.
   */
  /** Rugosidade 0..1 (0 espelhado … 1 fosco). Ausente = 1 - gloss. */
  roughness?: number;
  /** Metalicidade 0..1. Ausente = 0. */
  metallic?: number;
  /** Transmissão 0..1 (vidro). Ausente = 1 - opacity quando opacity < 1, senão 0. */
  transmission?: number;
  /** Índice de refração, 1.0..3.0. Ausente = 1.5. */
  ior?: number;
  /** Emissão própria (luz). Ausente = sem emissão. */
  emissive?: MaterialEmissive;
  /** Textura, com caminhos relativos à biblioteca de texturas do projeto. Ausente = sem textura. */
  texture?: MaterialTexture;
  /** Escala e rotação da textura. Ausente = escala 1.0 m por repetição, sem rotação. */
  mapping?: MaterialMapping;
}

/** Emissão própria do material: cor `#rrggbb` e intensidade (>= 0). */
export interface MaterialEmissive {
  color: string;
  intensity: number;
}

export type MaterialTexturePreset = 'reboco' | 'tijolo' | 'madeira' | 'telha' | 'pedra' | 'metal' | 'concreto' | 'piso' | 'nenhum';

/** Mapas de textura do material. Cada campo é um caminho relativo à biblioteca de texturas do projeto. */
export interface MaterialTexture {
  preset?: MaterialTexturePreset;
  albedo?: string;
  normal?: string;
  roughness?: string;
  metallic?: string;
  ao?: string;
}

/** Mapeamento da textura: `scale` em metros por repetição (> 0); `rotationDeg` em graus. */
export interface MaterialMapping {
  scale: number;
  rotationDeg?: number;
}

export interface Layer {
  function: LayerFunction;
  materialId: Id;
  /** Espessura em metros. Membrana pode ter 0. */
  thickness: number;
  /** Retorno no vão e nas extremidades (docs/05 §2). */
  wraps: boolean;
  /** Substitui a prioridade padrão da função (avançado). */
  priority?: number;
  /** Término na junção (decisão 0023 §2, P8): até onde a camada vai sobre a parede. Ausente = `auto`. Só pisos e lajes. */
  termino?: LayerTermino;
  /**
   * Limite no perímetro externo (decisão 0027): até onde a camada vai na **borda da edificação**, independente do
   * `termino` (que governa as paredes internas). `parede` = até a face externa da parede, atravessando o acabamento
   * externo; `nucleo` = passa sob o acabamento externo e para na face externa do núcleo. Ausente = contorno do elemento,
   * como antes. Só pisos e lajes.
   */
  limiteExterno?: LayerLimiteExterno;
}

/**
 * Limite da camada no perímetro externo (decisão 0027): `parede` (até a face externa da parede, incluindo o acabamento
 * externo) ou `nucleo` (até a face externa do núcleo, sob o acabamento externo). Ausente: o contorno do elemento manda.
 */
export type LayerLimiteExterno = 'parede' | 'nucleo';

/**
 * Término de uma camada de piso ou de laje nas paredes (decisão 0023 §2; regras por camada, decisão 0025): `auto`
 * (núcleo do piso até o núcleo da parede, o resto até a face de acabamento), `face` (até a face de acabamento da parede),
 * `nucleo` (até o núcleo da parede), `passa` (passa por baixo da parede, sem recorte), `{ ate: { prioridade } }` (até a
 * primeira camada da parede de prioridade efetiva ≤ N, 1 a 9) ou `{ cm }` (deslocamento a partir da face de acabamento,
 * positivo avança sobre a parede, negativo recua).
 */
export type LayerTermino = 'auto' | 'nucleo' | 'face' | 'passa' | { cm: number } | { ate: { prioridade: number } };

/** Em que lados os acabamentos "envolvem" (retornam) nos vãos e nas extremidades da parede. */
export type WrapMode = 'none' | 'interior' | 'exterior' | 'both';

/**
 * Faixa vertical aplicada sobre uma face da parede (Revit: sweeps/reveals): rodapé, barra de azulejo, friso.
 * Fica FORA da espessura da parede, entre as alturas z0 e z1 acima da base.
 */
export interface WallStrip {
  id: Id;
  name: string;
  side: 'exterior' | 'interior';
  materialId: Id;
  thickness: number;
  z0: number;
  z1: number;
}

export interface WallType {
  id: Id;
  name: string;
  description: string;
  code: string;
  /** Camadas da face EXTERNA para a INTERNA. */
  layers: Layer[];
  /** Retorno dos acabamentos nos vãos (docs/05 §2); a família da abertura pode substituir. */
  wrapInserts: WrapMode;
  /** Retorno dos acabamentos nas extremidades livres. */
  wrapEnds: WrapMode;
  strips: WallStrip[];
  /** Custo por metro quadrado de face de parede (em reais por metro quadrado). 0 quando não informado. */
  cost: number;
  /** Transmitância térmica U (W por metro quadrado kelvin). null quando não informada. */
  thermalU: number | null;
  /** Isolamento acústico aéreo Rw (dB). null quando não informado. */
  acousticRw: number | null;
  /** Resistência ao fogo (minutos). null quando não informada. */
  fireRating: number | null;
  /** Fabricante ou sistema construtivo de referência. Texto livre. */
  manufacturer: string;
}

export type LocationLine =
  | 'wallCenter'
  | 'coreCenter'
  | 'finishExterior'
  | 'finishInterior'
  | 'coreExterior'
  | 'coreInterior';

/** Tipos de junção no canto entre duas paredes (docs/05 §9): encosto (padrão) e esquadria. */
export type JoinKind = 'butt' | 'miter';

export interface JoinConfig {
  kind: JoinKind;
  /** Inverte qual parede domina (quem atravessa no encosto). Padrão: a mais antiga domina. */
  flip: boolean;
}

export interface Level {
  id: Id;
  name: string;
  elevation: number;
  /** Intervalo de vista da planta deste nível (decisão 0013). Cotas relativas à elevação. */
  viewRange: ViewRange;
  /** Gráficos da planta deste nível (decisão 0015); ausente = padrão. */
  graphics?: ViewGraphics;
  /** Elementos/categorias ocultos na planta de piso deste nível (Hide in View). */
  hidden?: ViewHidden;
  /** Elementos/categorias ocultos na planta de cobertura deste nível (vista separada da planta de piso). */
  roofHidden?: ViewHidden;
  /** Cotas permanentes da planta (decisão 0019); ausente = nenhuma. */
  dimensions?: Dimension[];
  /** Textos de anotação da planta (decisão 0019); ausente = nenhum. */
  texts?: TextNote[];
  /** Linhas de detalhe independentes do modelo, específicas desta vista. */
  detailLines?: DetailLine[];
  /** Regiões preenchidas/de máscara específicas desta vista. */
  detailRegions?: DetailRegion[];
  /** Etiquetas associativas de elementos nesta vista. */
  tags?: ElementTag[];
  /** Linhas de separação de ambiente (decisão 0031 §3; Revit: Room Separation Line); ausente = nenhuma. */
  roomSeparators?: RoomSeparator[];
}

/** Linha de separação de ambiente: divide a área livre entre paredes em dois ambientes (Revit: Room Separation Line). */
export interface RoomSeparator {
  id: Id;
  a: Vec2;
  b: Vec2;
}

/**
 * Referência de uma extremidade da cota a uma extremidade de parede: a cota acompanha a parede.
 * `axis` projeta a ponta no eixo da cota (cadeias de um lado da planta): a medida usa só a coordenada
 * ao longo do lado e a ponta continua associativa. Sem `axis`, vale o ponto exato da parede (cota alinhada).
 */
export interface DimensionRef {
  wallId: Id;
  end: 'a' | 'b';
  axis?: 'x' | 'y';
}

/** Lado da cota angular: menor (0..π), maior (suplementar, 0..π) ou a volta reflexa (π..2π). */
export type AngularDimensionSide = 'minor' | 'major' | 'reflex';

/**
 * Cota angular: duas referências (chaves do Alinhar) e a geometria já resolvida para o desenho.
 * O valor é em radianos; `from`/`to` são as direções (unitárias) das referências a partir de `center`.
 * `side` guarda se o usuário escolheu o ângulo menor, o maior ou a volta (arco reflexo > π).
 */
export interface AngularDimension {
  /** Chave da feição do Alinhar (ex.: `w1:face:hi`), para reencontrar a referência. */
  refA: string;
  refB: string;
  center: Vec2;
  from: Vec2;
  to: Vec2;
  radius: number;
  side: AngularDimensionSide;
  /**
   * Só na volta: qual lado ela complementa (`minor` ou `major`). Ausente = `minor`, o que mantém os arquivos
   * antigos e as cotas criadas antes do modo reflexo válidos.
   */
  base?: 'minor' | 'major';
  /** Ângulo em radianos; em `reflex`, fica em (π, 2π]. */
  value: number;
  /**
   * Linhas de chamada: quando a ponta do arco passa do trecho da referência, liga a extremidade do trecho à ponta
   * (como no Revit). O arco fica sobre as retas prolongadas; estas linhas mostram de onde ele vem.
   */
  links?: Array<[Vec2, Vec2]>;
  /** Texto fixo que substitui o valor medido. */
  text?: string;
  textHeight?: number;
  precision?: 0 | 1 | 2 | 3;
  tickStyle?: 'slash' | 'arrow' | 'dot';
}

/** Cota alinhada entre `a` e `b` (decisão 0019). O valor é a distância entre os pontos resolvidos. */
export interface Dimension {
  id: Id;
  a: Vec2;
  b: Vec2;
  offset: number;
  /** Pontas associativas: `DimensionRef` (parede+ponta) ou `DimensionElementRef` (elemento+feição, ver dimensionRefs.ts). */
  refs?: { a?: DimensionRef | DimensionElementRef; b?: DimensionRef | DimensionElementRef };
  /** Quando presente, a cota é angular e `a`/`b` guardam o centro e um ponto de apoio. */
  angular?: AngularDimension;
  /** Texto fixo que substitui o valor medido no desenho; vazio ou ausente mostra o valor medido. */
  text?: string;
  /** Direção de medida. Ausente mantém compatibilidade com cotas alinhadas antigas. */
  mode?: 'aligned' | 'horizontal' | 'vertical';
  /** Formatação opcional da leitura, em metros por padrão. */
  /** Unidade da cota: 'project' (ou ausente) segue as unidades do projeto; valores antigos m/cm/mm são mantidos. */
  unit?: 'm' | 'cm' | 'mm' | 'project';
  precision?: 0 | 1 | 2 | 3;
  prefix?: string;
  suffix?: string;
  /** Altura em mm de papel; ausente usa o padrão da categoria. */
  textHeight?: number;
  tickStyle?: 'slash' | 'arrow' | 'dot';
  /** Família de cotas (aparência nomeada); ausente usa o estilo global do projeto (`settings.dimensionStyle`). */
  familyId?: Id;
  /** Posição manual do texto em coordenadas do modelo. */
  textAt?: Vec2;
  /** Cota travada: editar o valor não move os elementos associados (a medida fica como está). Ausente = destravada. */
  locked?: boolean;
}

/** Texto de anotação: `at` é o ponto de inserção (centro), `height` em mm de papel, `rotation` em graus. */
export interface TextNote {
  id: Id;
  at: Vec2;
  text: string;
  height: number;
  rotation: number;
  /** Largura da caixa em mm de papel; ausente mantém texto sem quebra. */
  width?: number;
  /** Desenha a caixa (moldura) em volta do texto; ausente = só texto. */
  frame?: boolean;
  /** Pontos de chamada em coordenadas de modelo, do elemento até a caixa. */
  leader?: Vec2[];
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** Linha gráfica de detalhamento, vista-específica. */
export interface DetailLine { id: Id; a: Vec2; b: Vec2; style?: 'solid' | 'dashed' | 'dotted'; }

/** Região 2D vista-específica; `mask` cobre a geometria atrás da região. */
export interface DetailRegion { id: Id; boundary: Vec2[]; color?: string; mask?: boolean; }

/** Etiqueta vinculada ao elemento: o valor é consultado no modelo e se atualiza junto com ele. */
export interface ElementTag { id: Id; hostId: Id; at: Vec2; property: 'type' | 'name' | 'mark' | 'level' | 'width' | 'height'; leader?: boolean; orientation?: 'horizontal' | 'vertical'; }

/** Ponto do perfil superior: `t` = distância ao longo de a→b; `h` = altura do topo acima da base da parede. */
export interface ProfilePoint {
  t: number;
  h: number;
}

export interface Wall {
  id: Id;
  kind: 'wall';
  typeId: Id;
  levelId: Id;
  a: Vec2;
  b: Vec2;
  baseOffset: number;
  /** Se definido, o topo é esse nível + topOffset; senão usa `height`. */
  topLevelId: Id | null;
  height: number;
  topOffset: number;
  /**
   * Base anexada ao piso do mesmo nível que cobre o ponto médio da parede: a base sobe até a face superior do piso.
   * Ausente = false (arquivos antigos). A cota é calculada no engine (wallZRange), não aqui.
   */
  attachBottomToFloor?: boolean;
  /** Topo anexado ao piso do nível `topLevelId` que cobre o ponto médio: o topo desce até a face inferior do piso. */
  attachTopToFloor?: boolean;
  /** Topo ajustado à face inferior do telhado que cobre a parede (empenas e frontões); cálculo no engine. */
  attachTopToRoof?: boolean;
  /**
   * Telhado escolhido para o topo anexado (comando Anexar topo). Ausente = qualquer telhado que cubra o eixo, como antes.
   * Se o telhado não existir mais, a parede fica na altura normal e o aviso C2 aparece.
   */
  attachTopRoofId?: Id;
  locationLine: LocationLine;
  /** Inverte qual lado é o externo (padrão: externo à esquerda de a→b). */
  flipped: boolean;
  noJoinStart: boolean;
  noJoinEnd: boolean;
  /** Configuração da junção na extremidade `a` / `b` (vale quando há outra parede no mesmo ponto). */
  joinStart: JoinConfig;
  joinEnd: JoinConfig;
  /**
   * Flecha do arco em metros: distância do meio do arco à corda, positiva à esquerda de a→b.
   * 0 = parede reta. Limitada a metade da corda (arco de até 180°).
   */
  sag: number;
  /**
   * Perfil superior editado (Revit: Editar perfil, só o contorno de cima): topo poligonal por altura em função de `t`
   * (empena, topo inclinado, degraus — dois pontos com o mesmo `t` fazem um degrau). Fora do intervalo dos pontos o
   * topo se mantém na altura do ponto mais próximo. `null` = topo reto por `height`/nível. Só em parede reta.
   */
  topProfile: ProfilePoint[] | null;
  mark: string;
  comments: string;
  /** Ordem de criação: desempata junções (docs/05 §1, ordem de junção). */
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}

/** Tipo de piso: camadas do topo para baixo (acabamento, contrapiso, estrutura). `wraps` não é usado. */
export interface FloorType {
  id: Id;
  name: string;
  code: string;
  description: string;
  layers: Layer[];
  /** Custo por metro quadrado (em reais), informativo. */
  cost: number;
}

/**
 * Origem de um contorno criado a partir das paredes (decisão 0023 §8.2). Quando `linked` é verdadeiro, o contorno é
 * DERIVADO no motor a cada mudança de parede e `boundary` guarda apenas o último contorno válido; quando falso (ou
 * ausente), o contorno é manual/estático e `boundary` é a fonte. O `seed` é o ponto interior em planta que localiza o
 * circuito (no perímetro externo, o ponto usado para achar a edificação). Ausente em piso/laje de arquivo antigo.
 */
export interface OutlineSource {
  mode: 'walls-finish' | 'walls-core' | 'perimeter';
  seed?: Vec2;
  linked: boolean;
  /**
   * Para onde vai o contorno quando `mode === 'perimeter'`: `'finish'` (padrão, ausente) na face externa de
   * acabamento da edificação; `'core'` na face externa do NÚCLEO das paredes (o Extend "into wall (to core)" do
   * Revit), deixando o acabamento externo fora do contorno. Ignorado nos modos `walls-finish`/`walls-core`, que já
   * dizem o lado. Decisão 0026 (T7).
   */
  extend?: 'finish' | 'core';
}

/**
 * Piso (Revit: Floor). Contorno fechado em planta (sentido qualquer) com furos. O topo do piso fica na cota do
 * nível mais `heightOffset`; as camadas descem a partir dele (a primeira camada é a de cima).
 */
export interface Floor {
  id: Id;
  kind: 'floor';
  typeId: Id;
  levelId: Id;
  boundary: Vec2[];
  holes: Vec2[][];
  /** Origem do contorno quando criado por paredes/perímetro; ausente = estático (arquivo antigo). */
  outlineSource?: OutlineSource;
  heightOffset: number;
  mark: string;
  comments: string;
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}

/** Tipo de laje: camadas do topo para baixo (regularização, estrutura). */
export interface SlabType {
  id: Id;
  name: string;
  code: string;
  description: string;
  layers: Layer[];
  cost: number;
}

/** Inclinação da face superior: cota = topZ + percent/100 × distância de `origin` ao longo de `dir` (unitário). */
export interface SlabSlope {
  origin: Vec2;
  dir: Vec2;
  percent: number;
}

/**
 * Laje (Revit: Floor estrutural / ArchiCAD: Slab). Mesma lógica do piso (contorno + furos, topo na cota do nível mais
 * `heightOffset`, camadas descendo), com inclinação opcional da face superior e tipos próprios.
 */
export interface Slab {
  id: Id;
  kind: 'slab';
  typeId: Id;
  levelId: Id;
  boundary: Vec2[];
  holes: Vec2[][];
  /** Origem do contorno quando criado por paredes/perímetro; ausente = estático (arquivo antigo). */
  outlineSource?: OutlineSource;
  heightOffset: number;
  slope: SlabSlope | null;
  mark: string;
  comments: string;
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}

/** Tipo de forro: camadas do topo para baixo (estrutura, placa, acabamento visível). Mesmo papel do tipo de piso. */
export interface CeilingType {
  id: Id;
  name: string;
  code: string;
  description: string;
  layers: Layer[];
  /** Custo por metro quadrado (em reais), informativo. */
  cost: number;
  /** Hachura do corte e da elevação (D3). Sem valor, usa a hachura do material da camada. */
  hatch?: HatchKind;
}

/**
 * Forro (Revit: Ceiling). Contorno fechado em planta com furos. O topo do forro fica na cota do nível mais
 * `heightOffset` (padrão 2,60 m, o pé-direito) e as camadas descem a partir dele: a face inferior, visível, fica na
 * cota `heightOffset` menos a espessura total. Forro criado de ambiente (`roomId`) acompanha o contorno do ambiente
 * enquanto `roomLinked` não é falso (decisão 0023 §13, P-5); editar o contorno à mão ou mover o forro solta o vínculo.
 */
export interface Ceiling {
  id: Id;
  kind: 'ceiling';
  typeId: Id;
  levelId: Id;
  boundary: Vec2[];
  holes: Vec2[][];
  /** Ambiente de origem ("Forro no ambiente"); ausente ou null quando o forro foi desenhado livremente. */
  roomId?: Id | null;
  /** Falso quando o forro foi solto do ambiente (desvinculado, editado à mão ou movido). Ausente = acompanha (forros antigos). */
  roomLinked?: boolean;
  heightOffset: number;
  mark: string;
  comments: string;
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}

/** Tipo de telhado: camadas do topo para baixo (telha, ripamento, estrutura), espessura medida na vertical. */
export interface RoofType {
  id: Id;
  name: string;
  code: string;
  description: string;
  layers: Layer[];
  cost: number;
}

export type RoofShape = 'shed' | 'gable' | 'hip' | 'free' | 'edges' | 'extrusion';

/** Corte das camadas no beiral (Revit: Rafter Cut): prumo (vertical) ou esquadro (perpendicular ao plano). */
export type RafterCut = 'plumb' | 'square';

/** Acabamentos do beiral: testeira (fascia), calha e forro de beiral. */
export interface RoofEave {
  fascia: boolean;
  /** Altura da testeira (m), medida na vertical a partir da face inferior do telhado no beiral. */
  fasciaHeight: number;
  gutter: boolean;
  soffit: boolean;
}

/** Perfil da extrusão (forma 'extrusion'): altura z da face superior em função de t, coordenada ao longo da transversal ao eixo. */
export interface RoofProfilePoint {
  t: number;
  z: number;
}

/**
 * Água de telhado definida pelo usuário (forma 'free'): polígono em planta e plano inclinado. A cota da face
 * superior em p é z0 + percent/100 × projeção de (p − origin) sobre `up` (direção de subida, unitária); z0 é relativa
 * à cota do beiral (nível + heightOffset do telhado).
 */
export interface RoofPlaneDef {
  polygon: Vec2[];
  origin: Vec2;
  up: Vec2;
  percent: number;
  z0: number;
}

/** Mansarda automática do telhado por contorno: duas faixas por água (ver `Roof.mansard`). */
export interface RoofMansard {
  /** Inclinação da faixa de baixo, junto ao beiral (% , em (0, 300]). */
  lowerPercent: number;
  /** Inclinação da faixa de cima (% , em (0, 300]). */
  upperPercent: number;
  /** Largura em planta da faixa de baixo (m), medida do beiral para dentro; > 0. */
  run: number;
}

/**
 * Telhado (Revit: Roof by footprint; ArchiCAD: Roof). `boundary` é o contorno do beiral em planta (já com o balanço);
 * a cota do beiral é o nível + `heightOffset`. As águas vêm da forma: 'shed' (uma água subindo na direção `dir`),
 * 'gable' (duas águas, cumeeira paralela a `dir` passando pelo meio do contorno), 'hip' (quatro águas ou mais:
 * a altura é `slopePercent` × distância à aresta mais próxima; contorno convexo) ou 'free' (águas em `planes`).
 */
export interface Roof {
  id: Id;
  kind: 'roof';
  typeId: Id;
  levelId: Id;
  boundary: Vec2[];
  holes: Vec2[][];
  heightOffset: number;
  shape: RoofShape;
  slopePercent: number;
  /** Direção unitária: subida da água ('shed') ou eixo da cumeeira ('gable'). Ignorada em 'hip' e 'free'. */
  dir: Vec2;
  planes: RoofPlaneDef[];
  /**
   * Forma 'edges' (Revit: telhado por contorno): uma entrada por aresta de `boundary` (aresta i vai de boundary[i] a
   * boundary[i+1]). Número = a aresta DEFINE inclinação (percentual, > 0: gera uma água); null = não define (empena
   * vertical). As águas e a cumeeira saem do esqueleto reto com pesos. Formas 'shed', 'gable' e 'hip' derivam deste
   * vetor; 'free' e 'extrusion' ignoram-no.
   */
  edgeSlopes: Array<number | null>;
  /** Balanço do beiral por aresta (m); mesmo comprimento de `boundary`. Com `footprint`, o beiral se refaz dele. */
  edgeOverhangs: number[];
  /**
   * Flecha do arco por aresta (m), como `Wall.sag`: distância do meio do arco à corda, positiva à esquerda de i → i+1.
   * Ausente ou 0 = aresta reta. O motor divide a aresta em trechos só por dentro, antes do esqueleto; o contorno gravado
   * em `boundary` continua sendo os vértices (cantos lógicos). Mesmo comprimento de `boundary` quando presente.
   */
  edgeSag?: number[];
  /**
   * Mansarda automática (só formas por contorno: 'edges', 'hip', 'gable', 'shed'): cada água se divide em duas faixas, a de
   * baixo, junto ao beiral, com `lowerPercent` até a distância `run` (m, em planta) do beiral, e a de cima com
   * `upperPercent`. Ausente = sem mansarda (sem migração). Com ela, as inclinações por aresta só dizem quais arestas têm
   * água (as sem inclinação continuam empenas); o percentual vem de `lowerPercent` e `upperPercent`.
   */
  mansard?: RoofMansard;
  /**
   * Pegada: contorno desenhado, sem balanço, de onde o beiral saiu (modos de contorno, retângulo e paredes). Com ela,
   * `boundary = eaveOutlinePerEdge(footprint, edgeOverhangs)`. Ausente em telhados antigos e depois de editar vértices
   * do beiral: então o `boundary` é o que vale.
   */
  footprint?: Vec2[];
  /** Forma 'extrusion': perfil (altura em função de t) extrudado ao longo de `dir` (t cresce na transversal à esquerda de dir). */
  profile: RoofProfilePoint[];
  /** Telhados do mesmo nível que se sobrepõem se unem: vale a maior cota (Revit: Join Roof). */
  joinOthers: boolean;
  rafterCut: RafterCut;
  eave: RoofEave;
  mark: string;
  comments: string;
  order: number;
}

/**
 * Ambiente (Revit: Room; ArchiCAD: Zone). Guardado por nível (como os pisos): `levelId` + um `point` interior em
 * planta. O contorno, a área e o volume são DERIVADOS pelo motor a partir do circuito de paredes que contém o ponto
 * (nunca gravados). Os acabamentos são textos livres por instância; `ceilingHeight` é o pé-direito (padrão de leitura:
 * `defaults.wallHeight`).
 */
export interface Room {
  id: Id;
  kind: 'room';
  levelId: Id;
  name: string;
  /** Número do ambiente (Revit: Number), como "101" ou "Sala 1"; texto livre. */
  number: string;
  /** Ponto interior em planta (m) usado para achar o circuito de paredes que define o ambiente. */
  point: Vec2;
  /**
   * Cruzamento das linhas de referência (Revit: Reference). Ausente = centroide do polígono resolvido.
   * Arrastar a referência NÃO muda `point` nem a área; só o desenho e a etiqueta.
   */
  referencePoint?: Vec2;
  /**
   * Posição do rótulo do ambiente, compartilhada por TODAS as vistas (planta de piso, planta de área, cortes).
   * Ausente = centro do ambiente. Arrastar o rótulo em qualquer vista grava aqui.
   */
  labelPosition?: Vec2;
  /** Rotação do rótulo em graus (sentido anti-horário). Ausente = 0. */
  labelRotation?: number;
  /** Chamada do rótulo: automática (liga ao sair do ambiente), nenhuma, reta, cotovelo ou cruzada. Ausente = automática. */
  labelLeader?: 'auto' | 'none' | 'straight' | 'kinked' | 'crossed';
  /** Categoria do ambiente (Sala, Banho, Circulação…). Ausente = sem categoria. */
  categoryId?: Id;
  /** Deslocamento da base em relação ao nível (m). Ausente = 0. */
  heightOffset?: number;
  /** Pé-direito (m). Ausente = `defaults.wallHeight` (leitura). */
  ceilingHeight?: number;
  floorFinish?: string;
  wallFinish?: string;
  ceilingFinish?: string;
  /** Cor do preenchimento na planta (#rrggbb). Ausente = padrão. */
  color?: string;
  /** Ordem de criação (desempate e ordenação nas tabelas). */
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}

/**
 * Propriedade importada de um arquivo IFC (pset ou quantitativo). `name` é o nome da propriedade no arquivo; `value` já
 * vem convertido para texto, número ou booleano. Sempre opcional no modelo (arquivos antigos não têm).
 */
export interface IfcProperty {
  name: string;
  value: string | number | boolean;
  /** Conjunto de origem no IFC (`Pset_WallCommon`, `Qto_BeamBaseQuantities`...); ausente = conjunto do importador. */
  pset?: string;
}

/**
 * Objeto importado de outro programa (IFC) sem equivalente nativo: viga, pilar, escada, mobiliário, MEP, curtain wall...
 * Guarda a classe de origem, a malha triangular em coordenadas de mundo (m), o contorno em planta e as propriedades do IFC.
 * Entra no 3D, no DXF e nos quantitativos (volume/área por triângulos) e volta no IFC como `IfcBuildingElementProxy`.
 */
export interface Generic {
  id: Id;
  kind: 'generic';
  levelId: Id;
  name: string;
  /** Classe IFC de origem (`IFCBEAM`, `IFCSTAIR`...). */
  sourceClass: string;
  predefinedType?: string;
  objectType?: string;
  /** Malha triangular em coordenadas de mundo: `positions` = x, y, z...; `indices` = triplas. */
  mesh: { positions: number[]; indices: number[] };
  /** Contorno em planta (hull da malha) para as vistas 2D; ausente = sem desenho em planta. */
  outline?: Vec2[];
  color?: string;
  /** Opacidade 0..1 vinda do `IfcSurfaceStyleRendering` (vidro); ausente = 1. */
  opacity?: number;
  order: number;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente quando o objeto não tem pset. */
  ifcProperties?: IfcProperty[];
}

export type Element = Wall | Opening | Floor | Slab | Ceiling | Roof | Stair | Ramp | Room | Generic | CadDrawing;

export interface ProjectDefaults {
  wallTypeId: Id;
  doorTypeId: Id;
  windowTypeId: Id;
  wallHeight: number;
}

/** Nível de detalhe da planta: grosseiro (um contorno por cluster), médio (atual) e fino (linhas e hachura sempre). */
export type DetailLevel = 'coarse' | 'medium' | 'fine';

export interface ProjectSettings {
  /** Distância (m) em que extremidades de paredes e pontos sobre outra parede contam como unidos. */
  joinTolerance: number;
  /** Mostra o código do tipo de cada parede na planta. */
  showTags: boolean;
  /** Sobreposição de depuração: tipo e ordem de cada junção na planta. */
  debugJoins: boolean;
  detail: DetailLevel;
  /** Tipos de abertura favoritos (ArchiCAD: Favorites), na ordem em que aparecem no seletor. Ausente = nenhum. */
  favoriteOpeningTypes?: Id[];
  /** Convenção da linha de abertura (ausente = vértice no lado do trinco, tracejada ao abrir para o observador). */
  openingLine?: OpeningLineConvention;
  /** Mostra o código do tipo de cada porta e janela na planta (Revit: Tag on Placement). Ausente = não mostra. */
  showOpeningTags?: boolean;
  /** Referências das cotas dinâmicas (ausente = padrões de `dimensionSettingsOf`). */
  dimensions?: DimensionSettings;
  /** Estilo GLOBAL das cotas (ausente = DEFAULT_DIMENSION_STYLE; campos ausentes caem no padrão). */
  dimensionStyle?: Partial<DimensionStyle>;
  /** Famílias de cotas nomeadas (ausente = só a família implícita `Padrão`, que é o estilo global). */
  dimensionFamilies?: DimensionFamily[];
  /** Família usada nas cotas novas (ausente = a primeira da lista, ou `Padrão`). */
  defaultDimensionFamilyId?: Id;
  /** Unidades do projeto (ausente = padrões de `defaultUnits()`). */
  units?: UnitsSettings;
  /**
   * Render físico dos materiais padrão já aplicado a este projeto (`migrateProject` preenche uma vez). Ausente = ainda
   * não aplicado: a próxima abertura preenche os materiais padrão que não têm campos PBR.
   */
  materialPbrPadrao?: boolean;
}

/** Direção de uma elevação gerada automaticamente. A identidade fica no papel, não no nome editável. */
export type SectionRole = 'north' | 'south' | 'east' | 'west';

/** Onde a marca de corte/elevação aparece ao longo da linha. */
export type SectionMarkPlacement = 'both' | 'start' | 'end' | 'middle';

/** Traço da linha de corte/elevação. Ausente = traço-ponto no corte e contínuo na elevação. */
export type SectionMarkLineStyle = 'dash-dot' | 'continuous' | 'dashed';

/**
 * Aparência da marca de corte/elevação em planta. Tudo opcional: sem o campo valem os padrões do Hestia, e
 * arquivos antigos continuam válidos sem migração. As medidas são em mm de papel.
 */
export interface SectionMarkStyle {
  visible?: boolean;
  placement?: SectionMarkPlacement;
  showArrow?: boolean;
  showLabel?: boolean;
  lineStyle?: SectionMarkLineStyle;
  /** Comprimento da seta, em mm de papel. */
  arrowMm?: number;
  /** Altura do rótulo, em mm de papel. */
  textMm?: number;
  /** Deslocamento do rótulo em relação à ponta: x ao longo da linha, y para o lado de visão. */
  labelOffsetMm?: Vec2;
}

/** Extremidade de corte/elevação presa à extremidade de uma parede (some a parede, vale o ponto guardado). */
export interface SectionRef {
  wallId: Id;
  end: 'a' | 'b';
}

/** Vista de corte ou elevação: linha em planta + profundidade visível; o observador olha para a esquerda de a→b. */
export interface SectionView {
  id: Id;
  name: string;
  kind: 'section' | 'elevation';
  a: Vec2;
  b: Vec2;
  depth: number;
  /** Identificação curta da marca (ex.: "A"). Ausente = usa `name`. */
  number?: string;
  /** Título completo para a prancha (ex.: "Corte AA — Escada"). Ausente = usa `name`. */
  title?: string;
  /** Texto da marca em planta. Ausente = usa `number` ou `name`. */
  label?: string;
  /** Aparência da marca; ausente = padrão. */
  mark?: SectionMarkStyle;
  /** Extremidades associadas a paredes; ausente = pontos livres. */
  refs?: { a?: SectionRef; b?: SectionRef };
  /** Papel de uma elevação gerada automaticamente; ausente em vistas antigas e em cortes. */
  role?: SectionRole;
  /** Elementos/categorias ocultos nesta vista de corte/elevação (Hide in View). */
  hidden?: ViewHidden;
  /** Cotas, textos e detalhes pertencentes só a esta vista de corte/elevação. */
  annotations?: SectionAnnotations;
  /**
   * Extensões 2D das linhas de nível nesta vista, em coordenadas `t` da linha do corte (0 = início a→b).
   * Ausente = a linha do nível atravessa a vista inteira, como antes.
   */
  levelExtents?: Record<Id, { a: number; b: number }>;
}

/** Vista alvo de uma ocultação permanente (Hide in View). */
export type ViewHiddenTarget =
  | { kind: 'plan'; levelId: Id }
  | { kind: 'roof'; levelId: Id }
  | { kind: 'area'; planId: Id }
  | { kind: 'section'; viewId: Id }
  | { kind: '3d' };

export interface Project {
  schemaVersion: number;
  name: string;
  levels: Level[];
  materials: Record<Id, Material>;
  wallTypes: Record<Id, WallType>;
  floorTypes: Record<Id, FloorType>;
  slabTypes: Record<Id, SlabType>;
  /** Tipos de forro (decisão 0021). Ausente em arquivo antigo: a migração 17 → 18 preenche os padrões. */
  ceilingTypes: Record<Id, CeilingType>;
  roofTypes: Record<Id, RoofType>;
  /** Tipos de escada (Revit: Stair Type). Mesmo papel dos demais mapas de tipos. */
  stairTypes: Record<Id, StairType>;
  /** Tipos de rampa (Revit: Ramp Type). Mesmo papel dos demais mapas de tipos. */
  rampTypes: Record<Id, RampType>;
  openingTypes: Record<Id, OpeningType>;
  /** Presets de perfil das esquadrias (editáveis); a migração 19 → 20 semeia os iniciais. Ausente = os iniciais por leitura. */
  openingProfiles?: Record<Id, ProfilePreset>;
  elements: Record<Id, Element>;
  /**
   * Vínculos de andar-tipo criados pelo "Colar alinhado aos níveis selecionados" com a opção
   * "Manter cópias vinculadas". Ausente = nenhum vínculo (arquivos anteriores à versão 23).
   */
  copyLinks?: CopyLink[];
  nextOrder: number;
  defaults: ProjectDefaults;
  settings: ProjectSettings;
  /** Cortes e elevações do projeto (aparecem na árvore de vistas). */
  views: SectionView[];
  /** Pesos de linha, estilo por categoria e detalhe por escala (decisão 0015); ausente = padrão. */
  graphics?: ProjectGraphics;
  /** Gráficos do modelo 3D (decisão 0015); ausente = padrão. */
  view3d?: View3DSettings;
  /**
   * Pontos de vista 3D salvos (decisão 0040): catálogo do projeto, referenciado pelas pranchas. Ausente = nenhum.
   * Ver `view3dPoints.ts`.
   */
  view3dPoints?: View3DPoint[];
  /** Câmeras de render do projeto, em planta por nível (Revit: Camera). Ausente = nenhuma. Ver `renderCameras.ts`. */
  renderCameras?: RenderCamera[];
  /** Gráficos do corte e da elevação (decisão 0015); ausente = padrão. */
  sectionGraphics?: ViewGraphics;
  /** Pranchas (decisão 0022); ausente = nenhuma. */
  sheets?: Sheet[];
  /** Grades de eixos (Revit: Grid); ausente = nenhuma. Ver `grid.ts`. */
  grids?: Grid[];
  /** Tipos de grade gravados; os padrão (`DEFAULT_GRID_TYPES`) valem sem estar aqui. */
  gridTypes?: Record<Id, GridType>;
  /** Plantas de área (uma por pavimento); ausente = nenhuma. */
  areaPlans?: AreaPlan[];
  /** Categorias de ambiente; ausente = as padrão (`DEFAULT_ROOM_CATEGORIES`). */
  roomCategories?: RoomCategory[];
  /** Esquemas de cores das plantas de área; ausente = nenhum. */
  colorSchemes?: ColorScheme[];
  /**
   * Estilo das camadas do DXF por nome de camada (cor ACI, espessura e tipo de linha), editado no diálogo de exportação.
   * Ausente = o padrão montado pelo escritor (categoria gráfica e escala). Ver `dxfLayerStyle.ts`.
   */
  dxfLayers?: Record<string, DxfLayerStyle>;
}

export const isRoof = (e: Element | undefined): e is Roof => e?.kind === 'roof';
export const isSlab = (e: Element | undefined): e is Slab => e?.kind === 'slab';
export const isCeiling = (e: Element | undefined): e is Ceiling => e?.kind === 'ceiling';
export const isFloor = (e: Element | undefined): e is Floor => e?.kind === 'floor';
export const isWall = (e: Element | undefined): e is Wall => e?.kind === 'wall';
export const isOpening = (e: Element | undefined): e is Opening => e?.kind === 'door' || e?.kind === 'window';
export const isStair = (e: Element | undefined): e is Stair => e?.kind === 'stair';
export const isRamp = (e: Element | undefined): e is Ramp => e?.kind === 'ramp';
export const isRoom = (e: Element | undefined): e is Room => e?.kind === 'room';
export const isGeneric = (e: Element | undefined): e is Generic => e?.kind === 'generic';
