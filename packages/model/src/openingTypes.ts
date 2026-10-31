import type { Id, IfcProperty, WrapMode } from './types.ts';
import type { OpeningComposition } from './openingComposition.ts';

/**
 * Família do símbolo de planta. Portas: arco com folha (swing), dupla, correr, pivotante.
 * Janelas: fixa, basculante, maxim-ar (arco tracejado) e correr.
 */
export type PlanSymbol =
  | 'swing' | 'double' | 'sliding' | 'pivot' | 'fixed' | 'tilt' | 'casement'
  // Esquadrias v2 (decisão 0034): famílias novas. `hinged` = janela de abrir com giro lateral (`casement` segue sendo a maxim-ar).
  | 'dblact' | 'pocket' | 'bifold' | 'accordion' | 'garage' | 'hinged' | 'hung' | 'pivotwin' | 'louver';

/** Contagem de folhas de uma abertura. 0 = vão livre (sem folha nem caixilho). As famílias aceitas estão em `opening.ts`. */
export type OpeningLeaves = 0 | 1 | 2 | 3 | 4;

export interface OpeningType {
  id: Id;
  kind: 'door' | 'window';
  name: string;
  /** Código do tipo (Revit: Type Mark), como "P-01" ou "J-02"; vazio quando não informado. */
  code?: string;
  /** Descrição livre do tipo; vazio quando não informada. */
  description?: string;
  width: number;
  height: number;
  /** Peitoril padrão (0 para porta). */
  sill: number;
  /** Folhas. 0 = vão livre: só o recorte e a soleira, sem folha nem caixilho. */
  leaves: OpeningLeaves;
  /** Símbolo de planta da família. */
  plan: PlanSymbol;
  frameMaterialId: Id;
  glassMaterialId: Id;
  /** Fechamento do vão (Revit: Wall Closure): substitui o retorno do tipo de parede quando não é 'inherit'. */
  closure: 'inherit' | WrapMode;
  /*
   * Esquadria (m). Opcionais: arquivos antigos não os têm e a leitura usa o padrão (`openingFrame`, em defaults.ts).
   * Largura do perfil do batente e do caixilho; profundidade do batente na parede (limitada à espessura da parede);
   * espessura da folha; espessura do vidro.
   */
  frameWidth?: number;
  frameDepth?: number;
  /**
   * Como a profundidade do batente se liga à parede (decisão 0035): 'wall' (padrão) = a espessura TOTAL da parede acabada
   * (batente faceado com os acabamentos); 'core' = só o núcleo estrutural; 'fixed' = o valor de `frameDepth` (limitado à parede).
   */
  frameDepthMode?: OpeningFrameDepthMode;
  leafThickness?: number;
  glassThickness?: number;
  /*
   * Acabamento e vão bruto (m), todos opcionais: ausente vale o padrão por leitura (`openingExtras.ts`), sem migração.
   * `roughOversize`: folga total do vão bruto em relação à largura e à altura do tipo (o furo cresce, a esquadria não).
   * `casing`: alizar em volta do vão nas duas faces da parede (largura vista e espessura saliente).
   * `sillBoard`: peitoril saliente de janela (projeção além de cada face e espessura).
   * `lintel`/`sillBeam`: verga e contraverga (transpasse para cada lado e altura; padrão do transpasse 0,30 m).
   */
  roughOversize?: { w: number; h: number };
  casing?: { width: number; thickness: number; sides?: 'both' | 'swing' | 'opposite' };
  sillBoard?: { projection: number; thickness: number };
  lintel?: { over?: number; height?: number };
  sillBeam?: { over?: number; height?: number };
  /*
   * Esquadria v2 (docs/aberturas/E-spec-modelo-unico.md). Todos opcionais: ausente vale o padrão por leitura
   * (`openingStyle.ts`), sem migração e sem mudar a aparência de arquivos antigos.
   */
  /** Estilo da folha (miniatura no diálogo). Porta: padrão 'flush'. Janela: 'glass'. */
  leafStyle?: OpeningLeafStyle;
  /** Maçaneta da porta. Padrão 'lever' na porta de giro e 'none' nas demais. */
  handle?: OpeningHandle;
  /** Estilo do batente: com rebaixo (padrão), simples, aduela (pré-marco) ou bloco (sem perfil visível). */
  frameStyle?: OpeningFrameStyle;
  /** Divisões do caixilho/vidro (colunas × linhas de vidro). Padrão 1 × 1. */
  grid?: { cols: number; rows: number };
  /** Bandeira superior (vidro acima da folha) e bandeiras laterais. Ausente = sem. */
  transom?: { height: number; fixed?: boolean };
  sidelights?: { left?: boolean; right?: boolean; width: number };
  /** Ângulo de abertura em planta e no 3D, em graus (porta de giro padrão 90; maxim-ar e basculante no 3D, 30). */
  angle2d?: number;
  angle3d?: number;
  /** Exibição em planta: simbólica (padrão) ou projetada (folha fechada com espessura + o que está acima do corte). */
  planDisplay?: 'symbolic' | 'projected';
  /** Nível de detalhe da planta: 'scale' (padrão, depende da escala), 'low' | 'mid' | 'high' fixos ou 'off'. */
  detail2d?: 'scale' | 'low' | 'mid' | 'high' | 'off';
  /** Nível de detalhe do 3D: 'view' (padrão, segue a vista), 'schematic' | 'simple' | 'full' ou 'off' (só o vão). */
  detail3d?: 'view' | 'schematic' | 'simple' | 'full' | 'off';
  /** Arco de giro em planta: mostrar (padrão sim) e estilo. */
  showSwing?: boolean;
  swingStyle?: 'arc' | 'dash' | 'line';
  /** Folha em planta: só a aberta (padrão), só a fechada ou as duas (desenho técnico antigo). */
  leafPlan?: 'open' | 'closed' | 'both';
  /** Posição da folha na profundidade do batente: do lado em que ela abre (padrão) ou do lado oposto. */
  leafSide?: 'swing' | 'opposite';
  /** Dados BIM do tipo (quadro e IFC). */
  fireRating?: string;
  acousticRw?: number;
  uValue?: number;
  solarFactor?: number;
  cost?: number;
  manufacturer?: string;
  /** Material da folha (ausente = o do batente, `frameMaterialId`). */
  leafMaterialId?: Id;
  /** Tipo de vidro (ausente = liso). Muda a cor/transparência no 3D e a legenda do quadro. */
  glassKind?: OpeningGlassKind;
  /** Janela basculante: altura do eixo horizontal como fração do vão (0,2 a 0,8; padrão 0,5, eixo central). */
  tiltAxis?: number;
  /**
   * A que `width`/`height` se referem (ArchiCAD: Nominal Size Reference; NBR 15930: "80 x 210" é a FOLHA, não o vão): 'opening' (padrão) =
   * o vão; 'leaf' = a folha nominal, e o vão é derivado (folha + `spanGap`). A fonte única está em `openingNominal.ts`.
   */
  nominalRef?: 'opening' | 'leaf';
  /** Folga do vão sobre a folha com `nominalRef` 'leaf' (m); padrão 0,08 na largura e 0,05 na altura (NBR 15930-2). */
  spanGap?: { w: number; h: number };
  /** Porta com vidro: fração da altura da folha ocupada pelo vidro, a partir do topo (0,25 / 0,5 / 0,75; 0,1 a 0,9). */
  glassRatio?: number;
  /** Dobradiças: quantidade (0 a 6; padrão 3 em porta de giro, dupla e vai-e-vem) — peças de ferragem na face do batente do lado da folha. */
  hinges?: number;
  /** Soleira/limiar da porta: espessura (m) e material (padrão pedra). Ausente = sem soleira. */
  threshold?: { thickness: number; materialId?: Id };
  /** Recuo do batente em relação à face da parede (ArchiCAD: Reveal) e a âncora do recuo: na face acabada ou no núcleo. */
  reveal?: { depth: number; anchor?: 'face' | 'core' };
  /*
   * Esquadria v3 (ferragens e folga da porta). Bloco separado, ao fim do tipo: todos opcionais, com padrão por leitura
   * (`openingHardware.ts`). Janela ignora. Os limites e as famílias que os usam estão em `openingHardware.ts` e `openingSupport.ts`.
   */
  /** Folga inferior da folha (m): a face inferior sobe do piso (ou da soleira) por este valor. Padrão 0,007 (piso seco; 0,017 úmido; 0,027 com ventilação, NBR 15930-2). */
  leafUndercut?: number;
  /** Altura da maçaneta (m, do piso). Padrão 1,00; NBR 9050 pede 0,80 a 1,10 m (aviso fora da faixa; erro só fora de 0,50 a 1,50). */
  handleHeight?: number;
  /** Distância (m) da borda livre da folha ao eixo da maçaneta. Padrão 0,06. */
  handleInset?: number;
  /** Composição (células + perfis; docs/aberturas/F1-spec-composicao.md). Ausente = derivada dos campos atuais por `openingCompositionOf`. */
  composition?: OpeningComposition;
}

/** Vínculo da profundidade do batente com a espessura da parede. */
export type OpeningFrameDepthMode = 'wall' | 'core' | 'fixed';
/** Vidro: liso/cristal, canelado, fumê, verde, bronze, jateado/fosco, aramado, laminado, temperado. */
export type OpeningGlassKind = 'clear' | 'ribbed' | 'smoke' | 'green' | 'bronze' | 'frosted' | 'wired' | 'laminated' | 'tempered';
export type OpeningLeafStyle = 'flush' | 'panel' | 'glass' | 'louver' | 'grille' | 'boards' | 'fullglass';
export type OpeningHandle = 'none' | 'lever' | 'knob' | 'pull';
export type OpeningFrameStyle = 'rebate' | 'simple' | 'aduela' | 'block';

/**
 * Convenção da linha de abertura nas elevações e cortes (decisão do dono, 2026-10-26): o vértice do V fica no lado
 * OPOSTO ao da dobradiça ('latch', padrão) ou no lado da dobradiça ('hinge'). `dashed`: tracejado quando a folha abre
 * 'toward' o observador (padrão) ou 'away' dele.
 */
export interface OpeningLineConvention {
  apex: 'latch' | 'hinge';
  dashed: 'toward' | 'away';
}

export interface Opening {
  id: Id;
  kind: 'door' | 'window';
  typeId: Id;
  hostId: Id;
  /** Distância do centro da abertura ao início (a) da parede, ao longo do eixo. */
  offset: number;
  /** Inverte o lado da dobradiça. */
  flipHand: boolean;
  /** Inverte o sentido de abertura (para qual lado a folha gira). */
  flipFacing: boolean;
  sillOverride: number | null;
  /** Altura por instância; ausente/null usa `OpeningType.height`. */
  heightOverride?: number | null;
  mark: string;
  /** Propriedades (psets/quantities) lidas do IFC de origem; ausente em elemento nativo ou sem pset. */
  ifcProperties?: IfcProperty[];
}
