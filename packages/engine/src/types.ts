import type { Arc, MultiPolygon, Vec2 } from '@hestia/geom';
import type { TiltCut } from './openingTilt.ts';
import type { Id, OpeningShape, PlanSymbol, ProfilePoint } from '@hestia/model';

export interface ResolvedLayer {
  layerIndex: number;
  materialId: Id;
  priority: number;
  /** Camada dentro do núcleo da parede (decisão 0023 §1.2): entra na junção por camada (P7). */
  core: boolean;
  /** Fragmento da camada depois da prioridade de junção, SEM os vãos (base do 3D). */
  fragment: MultiPolygon;
  /** Fragmento com os vãos recortados (planta). */
  cut: MultiPolygon;
  /**
   * Geometria por faixa de altura (3D e quantitativos): o vão só fura as faixas que ele atravessa e uma
   * parede só corta a vizinha onde as duas existem na mesma altura.
   */
  bands: LayerBand[];
  /**
   * Forma de origem da camada ANTES do pintor: a esquadria (pontas da parede) e os envolvimentos já aplicados, mas
   * sem o recorte por prioridade (outras paredes, acabamentos) nem o dos vãos. O perfil superior não entra: ele só
   * recorta as faixas do 3D (`withProfile`). É a base das guardas de sobreposição (docs/08 §7): `cut` já vem
   * recortado pelo pintor, então a interseção entre `cut` de duas camadas é zero por construção.
   * Uma camada tem uma só forma para a altura inteira da parede (só as faixas verticais são itens próprios, e cada
   * uma tem o seu `raw`). Planta e 3D não o usam.
   */
  raw: MultiPolygon;
}

/** Faixa vertical de uma camada com a mesma geometria em planta. z relativo à base da parede. */
export interface LayerBand {
  z0: number;
  z1: number;
  poly: MultiPolygon;
  /**
   * Topo inclinado (perfil superior da parede): a altura relativa em `p` é h0 + (h1−h0)·(d·(p−o) − t0)/(t1 − t0).
   * Nesse caso `z1` é a maior altura da faixa (para caixas e limites).
   */
  slope?: { o: Vec2; d: Vec2; t0: number; t1: number; h0: number; h1: number };
}

export interface ResolvedWall {
  wallId: Id;
  /** Eixo (linha de localização) original. */
  a: Vec2;
  b: Vec2;
  u: Vec2;
  n: Vec2;
  length: number;
  sHi: number;
  sLo: number;
  baseZ: number;
  height: number;
  /** Faixa de cota da parede sem anexar a piso/laje (base do modelo até a altura máxima): é a que o término por camada usa. */
  nominalZ0?: number;
  nominalZ1?: number;
  /** Inclinação em graus (+ = topo à esquerda de a→b), só quando não nula, com a flecha `sag` do eixo (arco). */
  tilt?: number;
  sag?: number;
  /**
   * Planta de parede inclinada (F2.5): cota z do plano de corte (relativa à base) em que `layers[].cut` foi mapeado, e a
   * projeção da base (z=0) e do topo (z=H). Só em parede inclinada ou ligada a uma por junção inclinada.
   */
  tiltPlan?: { z: number; base: MultiPolygon; top: MultiPolygon };
  /** Vãos cortados perpendicular às faces (F2.8, modo 'inclinado'); só em parede inclinada, ausente sem eles. */
  tiltCuts?: TiltCut[];
  layers: ResolvedLayer[];
  /** Camadas de espessura zero (membranas, barreiras): linhas no limite entre camadas, em planta e nos quantitativos. */
  membranes: Membrane[];
  /** Topo do perfil (relativo a baseZ) quando o topo vem de telhado ou de piso/laje; ausente nas demais. */
  profileTop?: ProfilePoint[];
  /** Base por trecho (relativa a baseZ), só quando a base não é uniforme (decisão 0023 §6, P9). */
  profileBottom?: ProfilePoint[];
  /**
   * Vãos com forma que furam esta parede por contorno (booleana 3D no cliente do furo, docs/estudo-esquadrias/26). As faixas
   * de `layers` NÃO têm esses vãos (a camada vem inteira); 3D, quantitativo e planta aplicam o furo. Ausente = nenhum.
   */
  furosContorno?: FuroContornoDaParede[];
}

/** Vão com forma que fura a parede por contorno, mais o retorno do acabamento que segue a forma (camadas envolventes). */
export interface FuroContornoDaParede {
  g: OpeningGeometry;
  retornos: Array<{
    layerIndex: number;
    espessura: number;
    recuo: number;
    y0: number;
    y1: number;
    /**
     * Região do mundo (planta) onde o retorno pode existir: a pegada do retorno menos o pintado das paredes vizinhas (canto, T).
     * Ausente = a pegada inteira; `[]` = a vizinha cobre tudo (sem retorno). docs/estudo-esquadrias/33 §2.2.
     */
    recorte?: MultiPolygon;
  }>;
}

export interface Membrane {
  layerIndex: number;
  materialId: Id;
  /** Linha da membrana entre as duas extremidades da parede (reta; parede curva não desenha membrana). */
  pts: Vec2[];
}

export interface Region {
  materialId: Id;
  polygons: MultiPolygon;
}

export interface ResolvedCluster {
  wallIds: Id[];
  /** Região por material (união entre paredes): hachura e preenchimento da planta. */
  regions: Region[];
  /** Contorno externo do corte: linha pesada da planta. */
  silhouette: MultiPolygon;
}

export interface ResolvedLevel {
  levelId: Id;
  walls: Record<Id, ResolvedWall>;
  clusters: ResolvedCluster[];
}

export interface OpeningGeometry {
  openingId: Id;
  hostId: Id;
  kind: 'door' | 'window';
  center: Vec2;
  /** Direção ao longo da parede. */
  u: Vec2;
  /** Normal à esquerda. */
  n: Vec2;
  width: number;
  height: number;
  /** Vão bruto (furo na parede): `width/height` + `roughOversize` do tipo. A esquadria continua com width/height. */
  roughWidth: number;
  roughHeight: number;
  sill: number;
  thickness: number;
  /** Faixa s da parede em que o vão está. */
  sHi: number;
  sLo: number;
  /** 0 = vão livre: sem folha nem caixilho (só o recorte e a soleira). Janela de correr aceita até 3. */
  leaves: 0 | 1 | 2 | 3 | 4;
  /** Família do símbolo de planta. */
  plan: PlanSymbol;
  flipHand: boolean;
  flipFacing: boolean;
  /** Distância ao longo do eixo a partir de `a`. */
  offset: number;
  /**
   * Meia profundidade do retângulo que fura a parede (m). Ausente = espessura/2 + 0,02. Em parede curva cresce com o desvio
   * da face nas ombreiras (o furo é reto pela tangente no centro; a face se afasta dele ao longo da corda do vão).
   */
  cutHalf?: number;
  /** Arco da parede hospedeira e `sMid`, quando curva: permite alinhar batente, soleira, vidro e alizar exatamente à curvatura. */
  curve?: { arc: Arc; sMid: number };
  /** Plano efetivo do vão na parede inclinada (F2.8): presente só quando é 'inclinado' e o vão cabe (arco: w² ≤ 0,4·R). */
  tiltPlane?: 'inclinado';
  /**
   * Forma de contorno livre do vão (arco, ogival, círculo...), já dimensionada pelo vão bruto (`openingShapeOf`) e válida.
   * Ausente = vão retangular (o caso de sempre). Fonte única da forma para 3D, quantitativo, planta e junção; quem decide o
   * caminho do furo é `rotaDoVao` (`furoContornoDespacho.ts`). Docs/estudo-esquadrias/24.
   */
  forma?: OpeningShape;
}
