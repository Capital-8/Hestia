import type { DimRef, TempDim } from './dims/types.ts';
import type { HostedLoss } from './hostedLoss.ts';
import type { Vec2 } from '@hestia/geom';
import type { ParedeSubelementos, SectionResult } from '@hestia/engine';
import type { Command, Id, LocationLine, Project, SectionAnnotations, SubelementoCortina } from '@hestia/model';
import type { InferContext } from './infer.ts';
import type { StairToolOptions, StairTone } from './stairSketchState.ts';
import type { StairRunToolOptions } from './stairRunPlan.ts';
import type { RampToolOptions } from './rampOptions.ts';
import type { Lang } from './i18n.ts';

export type SnapKind = 'endpoint' | 'face' | 'core' | 'midpoint' | 'intersection' | 'perpendicular' | 'nearest' | 'alignment' | 'ortho' | 'polar' | 'grid' | 'center' | 'tangent' | 'none';

export interface Guide {
  from: Vec2;
  to: Vec2;
  kind: 'alignment' | 'ortho' | 'polar' | 'perpendicular';
}

export interface Inference {
  point: Vec2;
  kind: SnapKind;
  guides: Guide[];
  /** Parede sobre a qual o cursor está (para portas e janelas). */
  hostId?: Id;
}

/** Tom da prévia: os da escada e o de erro (abertura sem espaço, em vermelho). */
export type PreviewTone = StairTone | 'invalid';

/** O que a ferramenta mostra antes do clique (docs/03 §5: pré-visualização sempre). */
export type PreviewItem =
  /** `halo`: linha de cota do Medir, mais grossa e com contorno claro por baixo (legível sobre hachura de parede). */
  | { kind: 'line'; a: Vec2; b: Vec2; dashed?: boolean; tone?: PreviewTone; halo?: boolean }
  | { kind: 'polygon'; ring: Vec2[]; dashed?: boolean; tone?: PreviewTone }
  | { kind: 'wallBand'; a: Vec2; b: Vec2; thickness: number; sMid: number; sag?: number }
  | { kind: 'label'; at: Vec2; text: string; dimensionStyle?: boolean; rotation?: number }
  | { kind: 'point'; at: Vec2 }
  | { kind: 'highlight'; ids: Id[] }
  /** Linha de corte ou elevação com a seta do lado de visão (a pré-visualização usa `dashed`). */
  | { kind: 'sectionLine'; a: Vec2; b: Vec2; dashed?: boolean; label?: string; elevation?: boolean };

/** Contexto de uma vista de corte/elevação para as ferramentas que também funcionam nela. */
export interface SectionToolContext {
  /** Vista ativa. */
  id: Id;
  /** Anotações atuais da vista; o conjunto é a fonte da verdade para as ferramentas de anotação. */
  annotations(): SectionAnnotations;
  /** Substitui o conjunto inteiro num único passo de desfazer. */
  setAnnotations(annotations: SectionAnnotations | undefined): void;
  /** Contexto de inferência em coordenadas (t, z) da seção, usando só o que está visível. */
  inferContext(extra?: Partial<InferContext>): InferContext;
  /** Resultado cacheado da seção ativa (geometria já ocluída/visível), em (t,z). */
  result(): SectionResult;
}

export interface ToolEnv {
  project(): Project;
  /** Presente quando a vista ativa é um corte/elevação; ausente na planta e no 3D. */
  section?(): SectionToolContext | null;
  levelId(): Id;
  selection(): Id[];
  setSelection(ids: Id[]): void;
  exec(cmd: Command): void;
  /** `session`: chave da sessão da ferramenta; transações da mesma sessão viram um só passo de desfazer. */
  transaction(label: string, fn: () => void, session?: object): void;
  /** Metros por pixel na vista atual; usado para tolerâncias de clique. */
  metersPerPixel(): number;
  /**
   * Escala de impressão (1:N) da vista ativa: planta de piso, planta de área ou corte/elevação. É o que converte as
   * medidas de papel (cota, texto, marca) em metros do desenho, igual na tela, na prancha e no DXF. Ausente = 100.
   */
  viewScale?(): number;
  /** Elementos ocultos na planta atual (fora do intervalo de vista ou categoria oculta): não são alvo de captura (S-07). Ausente = nenhum. */
  hiddenInView?(): ReadonlySet<Id>;
  /** Planta de área aberta na vista, quando a planta ativa é uma planta de área; null/ausente na planta de piso. */
  areaPlanId?(): Id | null;
  /** Pavimento de referência visível na planta (o de baixo, com Subpavimento ligado), ou null. A captura usa o que se vê. */
  underlayLevelId?(): Id | null;
  gridStep(): number;
  /** Mensagem da barra de status. */
  say(msg: string): void;
  /**
   * Alerta modal que o usuário precisa confirmar (OK). Ausente = só a barra de status.
   * `ids` são os elementos do conflito (decisão 0044: a parede que impede a operação), para a vista realçá-los.
   * A interface usa o diálogo; os testes podem capturar as mensagens.
   */
  alert?(message: string, ids?: readonly Id[]): void;
  /**
   * Confirma uma operação que deixaria aberturas fora da parede. Ausente = não pergunta (aplica e exclui).
   * Síncrono nos testes; na interface abre o diálogo e resolve quando o usuário escolhe.
   */
  confirmHostedLoss?(losses: readonly HostedLoss[], message: string): boolean | Promise<boolean>;
  /** Pede à interface para voltar à ferramenta de seleção. */
  done(): void;
  /** Abre uma vista de corte/elevação na área de desenho. Ausente = a interface não abre a vista sozinha. */
  openView?(id: Id): void;
  /** Opções vindas da barra de opções. */
  options(): ToolOptions;
  /** Altera opções da barra a partir da ferramenta (ex.: inclinação depois do Ajustar). Ausente = a ferramenta grava no objeto de `options()`. */
  setOptions?(patch: Partial<ToolOptions>): void;
  /** Idioma da interface: as mensagens traduzíveis das ferramentas (ex.: Matriz) saem nele. Ausente = português. */
  lang?(): Lang;
  /** Subelementos (linhas, segmentos e células) de uma parede cortina, lidos da grade do kernel; null sem kernel ou se não for cortina. Ausente = nenhum. */
  subelementos?(wallId: Id): ParedeSubelementos | null;
  /** Subelemento de cortina escolhido com o Tab (null = a parede inteira). Ausente = sempre a parede. */
  subelemento?(): SubelementoCortina | null;
  setSubelemento?(sub: SubelementoCortina | null): void;
}

/** Tipo da ferramenta Matriz: linear (repete pelo espaçamento) ou radial (gira em torno de um centro). */
export type ArrayKind = 'linear' | 'radial';

/** "Mover para" da Matriz: Segundo (o valor vai do 1º ao 2º item) ou Último (vai do 1º ao último, dividido entre os itens). */
export type ArrayAnchor = 'second' | 'last';

/**
 * Modo do Aparar/Estender (Revit): 'canto' ajusta as duas paredes ao canto; 'unico' mantém a referência e muda só a
 * segunda parede; 'varios' acumula paredes com Shift e aplica todas na referência.
 */
export type TrimMode = 'canto' | 'unico' | 'varios';

/** Quais capturas estão ligadas (AutoCAD / Revit Snaps). */
export interface SnapOptions {
  /** Chave mestre: se falso, desativa todas as capturas temporariamente (AutoCAD F3 / Revit SO). */
  enabled?: boolean;
  grid: boolean;
  /** Eixo das paredes e arestas estruturais. */
  axis: boolean;
  /** Cantos, arestas e pontos médios das faces de acabamento (por dentro e por fora dos cômodos). */
  faces: boolean;
  /** Cantos e arestas das faces do núcleo. */
  core: boolean;
  intersections: boolean;
  perpendicular: boolean;
  /** Alinhamento dinâmico e ortogonal com outros pontos e eixos (AutoCAD F11 / Revit). */
  alignment: boolean;
  /** Captura de extremidades/vértices (AutoCAD Endpoint - quadrado). */
  endpoint?: boolean;
  /** Captura de pontos médios (AutoCAD Midpoint - triângulo). */
  midpoint?: boolean;
  /** Captura nos desenhos CAD importados (DXF): vértices, meios, pontos e cruzamentos das linhas. */
  cad?: boolean;
}

export const DEFAULT_SNAP: SnapOptions = {
  enabled: true,
  // Grade desligada por padrão: a captura usa os pontos reais, e a grade entra só quando o usuário pede.
  grid: false,
  axis: true,
  faces: true,
  core: false,
  intersections: true,
  perpendicular: true,
  alignment: true,
  endpoint: true,
  midpoint: true,
  // O DXF importado serve de referência por padrão: é para isso que ele entra no projeto.
  cad: true,
};

/** Padrões do "Desconectar": Mover e Espelhar acompanham a vizinha (falso) e Rotacionar é livre (verdadeiro). */
export const DEFAULT_DISJOIN = { move: false, rotate: true, mirror: false } as const;

/** Alinhar: feição inicial oferecida nas paredes (Faces, Eixos ou Núcleo). */
export type AlignPrefer = 'faces' | 'eixos' | 'nucleo';

/**
 * Grupo Orto/Polar (F8/F10): rastreamento angular global. `ortho` trava em 0°/90° e tem prioridade quando os dois estão
 * ligados; `polar` trava nos múltiplos de `polarIncrementDeg` (15° por padrão, aceita valores personalizados).
 */
export interface AngleMode {
  ortho: boolean;
  polar: boolean;
  polarIncrementDeg: number;
}

export interface ToolOptions {
  /** Capturas ligadas; ausente = padrão. */
  snap?: SnapOptions;
  wallTypeId: Id;
  locationLine: LocationLine;
  wallHeight: number;
  /** Restrições padrão para paredes novas. `null` mantém o topo livre e usa `wallHeight`. */
  wallBaseOffset?: number;
  wallTopLevelId?: Id | null;
  wallTopOffset?: number;
  wallFlipped?: boolean;
  chain: boolean;
  /** Forma da parede ao desenhar: reta, arco por três pontos ou retângulo por dois cantos opostos. */
  wallShape: 'line' | 'arc' | 'rect';
  doorTypeId: Id;
  windowTypeId: Id;
  openingFlipHand?: boolean;
  openingFlipFacing?: boolean;
  /** Sentido da abertura na colocação: pelo lado do cursor (padrão) ou manual (`openingFlipFacing`). */
  openingFacingMode?: 'cursor' | 'fixed';
  /** Com sentido pelo cursor: abre para o lado do cursor (padrão) ou para o lado oposto. */
  openingToward?: 'cursor' | 'away';
  /** Ponto do cursor na abertura: centro (padrão), ombreira da dobradiça ou ombreira do trinco. */
  openingAnchor?: 'center' | 'hinge' | 'latch';
  /** Folga (m) da borda da abertura até a face da parede perpendicular. Ausente = 0,10 m. */
  openingClear?: number;
  /** Etiquetar ao inserir (Revit: Tag on Placement): liga `settings.showOpeningTags` ao colocar. Ausente = ligado. */
  openingTagOnPlace?: boolean;
  openingSillOverride?: number | null;
  placementMark?: string;
  placementComments?: string;
  roomName?: string;
  roomNumber?: string;
  roomHeightOffset?: number;
  roomCeilingHeight?: number;
  roomFloorFinish?: string;
  roomWallFinish?: string;
  roomCeilingFinish?: string;
  roomColor?: string;
  textHeight?: number;
  textRotation?: number;
  textWidth?: number;
  textLeader?: 'none' | 'straight' | 'elbow';
  dimensionMode?: 'auto' | 'aligned' | 'horizontal' | 'vertical';
  dimensionString?: 'single' | 'continuous' | 'baseline';
  /** Família de cotas da cota nova (ausente/null = família padrão do projeto). */
  dimensionFamilyId?: Id | null;
  /** Último afastamento digitado/arrastado: a cota nova nasce nele (como no Revit). */
  dimensionOffset?: number;
  dimensionUnit?: 'm' | 'cm' | 'mm';
  dimensionPrecision?: 0 | 1 | 2 | 3;
  dimensionPrefix?: string;
  dimensionSuffix?: string;
  dimensionTextHeight?: number;
  dimensionTickStyle?: 'slash' | 'arrow' | 'dot';
  tagProperty?: 'type' | 'name' | 'mark' | 'level' | 'width' | 'height';
  tagLeader?: boolean;
  tagOrientation?: 'horizontal' | 'vertical';
  regionMask?: boolean;
  regionColor?: string;
  detailLineStyle?: 'solid' | 'dashed' | 'dotted';
  /** Guarda-corpo: tipo usado pela ferramenta ao criar. Ausente = o padrão do projeto. */
  railingTypeId?: Id;
  orthoLock: boolean;
  /** Grupo Orto/Polar; ausente usa `orthoLock` para compatibilidade. */
  angleMode?: AngleMode;
  arrayCount: number;
  /** Matriz: linear (repete pelo espaçamento) ou radial (gira em torno de um centro). Ausente = linear. */
  arrayKind?: ArrayKind;
  /** Matriz radial: ângulo total em graus (positivo = anti-horário). Ausente = 360. */
  arrayAngle?: number;
  /** Matriz: "Mover para". Segundo = o espaçamento/ângulo é o do 1º ao 2º item; Último = o do 1º ao último. Ausente = Segundo. */
  arrayAnchor?: ArrayAnchor;
  /** Alinhar: qual feição da parede é a candidata inicial sob o cursor. Ausente = faces. */
  alignPrefer?: AlignPrefer;
  offsetDistance: number;
  /** Aparar/Estender: canto (duas paredes), um elemento (só a segunda muda) ou vários (Shift+clique). Ausente = vários. */
  trimMode?: TrimMode;
  rotateCopy: boolean;
  mirrorCopy: boolean;
  offsetCopy: boolean;
  /** Mover: "Desconectar" solta a ponta das vizinhas em vez de esticá-las. Ausente = falso (padrão do Revit). */
  moveDisjoin?: boolean;
  /** Rotacionar: "Desconectar" solta a ponta das vizinhas. Ausente = verdadeiro (giro livre). */
  rotateDisjoin?: boolean;
  /** Espelhar: "Desconectar" solta a ponta das vizinhas. Ausente = falso (a vizinha acompanha). */
  mirrorDisjoin?: boolean;
  floorTypeId: Id;
  /** Deslocamento do topo do piso em relação ao nível (m). */
  floorOffset: number;
  /** Estender até o núcleo (perímetro do piso): o contorno avança por baixo do reboco até a face do núcleo. Ausente = falso. */
  floorCore?: boolean;
  /** Parede paralela: distância medida entre faces (padrão) ou entre eixos. */
  offsetFrom?: 'axis' | 'face';
  /** Tipo, deslocamento do topo (m) e inclinação (%) da ferramenta Laje e de "Definir inclinação". */
  slabTypeId: Id;
  slabOffset: number;
  slabSlopePercent: number;
  /** Forro: tipo e cota do topo (m, relativa ao nível). Ausentes = padrão (primeiro tipo, 2,60 m). */
  ceilingTypeId?: Id;
  ceilingOffset?: number;
  /** Telhado: tipo, inclinação (%), balanço do beiral (m) e cota do beiral (m, relativa ao nível). Ausentes = padrão. */
  roofTypeId?: Id;
  roofSlope?: number;
  roofOverhang?: number;
  /** Deslocamento do beiral (m). `null` = automático: altura da parede mais alta do nível, ou 2,8 m sem paredes. */
  roofOffset?: number | null;
  /** Grade (ferramenta `grid`): modo de desenho e tipo. Ausente = linha, primeiro tipo padrão. */
  grid?: GridToolOptions;
  /** Escada por croqui: tipo, sub-modo, primitiva, N para distribuir e cotas da criação. Ausente = padrão. */
  stair?: StairToolOptions;
  /** Escada reta, em L, em U ou com leque, criada pronta por cliques (ferramenta `stairrun`). Ausente = reta, 1,20 m, giro à esquerda. */
  stairRun?: StairRunToolOptions;
  /** Rampa (ferramenta `ramp`). Ausente = reta, modo comprimento e padrões do tipo. */
  ramp?: RampToolOptions;
}

export interface PointerInfo {
  /** Posição crua do cursor em metros. */
  raw: Vec2;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  /**
   * Vista 3D: elemento sob o cursor, o mesmo que a 3D destaca (`pickElement`); null no vazio. Ausente na planta, onde a
   * ferramenta acha o elemento pelo ponto (`raw`).
   */
  hit3d?: Id | null;
}

/** Contrato único de ferramenta (docs/01 §7). A ferramenta nunca altera o modelo: ela emite comandos. */
/** Como a Grade é desenhada: linha (2 cliques), arco (início, fim e flecha), escolher linhas (paredes) ou multissegmento. */
export type GridMode = 'line' | 'arc' | 'pick' | 'multi';

export interface GridToolOptions {
  mode: GridMode;
  typeId: Id;
}

export interface Tool {
  readonly id: string;
  readonly label: string;
  /** Texto de ajuda para a barra de status. */
  readonly hint: string;
  /** Aceita clique na vista 3D: o ponto entregue é o (x, y) da superfície sob o cursor (`pickModelPoint`). */
  readonly pick3d?: boolean;
  /** Campo de valor aceita texto livre (letras e espaços), não só números. */
  readonly freeText?: boolean;
  start(): void;
  /** Atualiza a pré-visualização. */
  move(p: PointerInfo): void;
  click(p: PointerInfo): void;
  /** Valor digitado (medida em metros, ângulo em graus ou contagem), confirmado com Enter. */
  type(text: string): boolean;
  /** Tab alterna uma opção da ferramenta. */
  tab(reverso?: boolean): void;
  /** Espaço alterna uma opção secundária quando a ferramenta declara suporte. */
  space?(): void;
  /** Esc: cancela o passo; segundo Esc sai da ferramenta. */
  cancel(): void;
  confirm(): void;
  /** Arrastar com o botão pressionado (só ferramentas que usam arrasto). */
  down?(p: PointerInfo): void;
  drag?(p: PointerInfo): void;
  up?(p: PointerInfo): void;
  preview(): PreviewItem[];
  /** Cotas dinâmicas da prévia (sistema único de cotas); ausente = a ferramenta não mostra cotas ao desenhar. */
  tempDims?(overrides?: Readonly<Record<string, DimRef>>): TempDim[];
  /** Inferência corrente, para o desenho de guias e marcadores. */
  inference(): Inference | null;
  /** Delete com um vértice de piso em foco: remove o vértice e devolve true; false deixa o Delete excluir a seleção. */
  deleteKey?(): boolean;
  /** Tecla A: ajusta o desenho em andamento à norma (rampa livre). Devolve false se não há o que ajustar. */
  adjust?(): boolean;
  /** Rótulo do campo numérico pendente (ex.: "Comprimento"), ou null se a ferramenta não espera valor. */
  inputPrompt(): string | null;
}
