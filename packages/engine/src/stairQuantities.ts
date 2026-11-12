import { dist, multiArea, ringArea, type Vec2 } from '@hestia/geom';
import type { Id, StairRunStyle } from '@hestia/model';
import { pieceVolume, stairBody, type StairBodyPiece } from './stairBody.ts';
import { stairFinishQuantities } from './stairFinish.ts';
import type { ResolvedStair, ResolvedStairRiser, ResolvedStairStep } from './stairs.ts';

/** Quantitativos de um lance (componente de tipo lance, agrupado pelo índice do componente). */
export interface StairRunQuantity {
  componentIndex: number;
  treadCount: number;
  /** Largura do lance: menor espelho aparado (m). */
  width: number;
  /** Piso médio do lance (m) = área dos degraus ÷ (largura × nº de degraus). Exato no lance reto. */
  treadMean: number;
  /** Área em planta dos degraus do lance (metros quadrados). */
  treadArea: number;
}

/**
 * Quantitativos de uma escada, a partir da geometria resolvida. Valores em metros (SI). O volume segue o estilo do tipo:
 * - monolítico: soma dos volumes das peças de `stairBody` (decisão 0012 §2): degraus e patamares, com o fundo liso ou
 *   escalonado e o corte pelo piso base. A chegada (`arrival`) fica sob a laje de cima e não entra no volume da escada.
 *   Escada com erro de croqui tem volume zero no monolítico;
 * - poste (decisão 0014 §8): degraus em fatia (com a sobreposição) mais o poste central (`post`), separados em
 *   `volumeRun` e `volumePost`;
 * - piso e espelho: degraus × espessura do piso + comprimento dos espelhos × altura do espelho × espessura do espelho
 *   + patamares × espessura do patamar.
 * O nariz não entra no volume (só 3D e quantitativo de nariz, quando houver). `volumeByMaterial` separa o volume por
 * material: degraus, patamares e espelhos no material do tipo; poste no `postMaterialId`.
 */
export interface StairQuantities {
  stairId: Id;
  typeId: Id;
  runStyle: StairRunStyle;
  /** Nº de espelhos (linhas de espelho de todos os lances). */
  riserCount: number;
  /** Altura real do espelho (m). */
  riserHeight: number;
  /** Nº de degraus (pisos entre espelhos, sem os patamares). */
  treadCount: number;
  /** Piso médio (m), média dos pisos de todos os lances ponderada pelo nº de degraus. */
  treadMean: number;
  /** Largura da escada: menor espelho aparado (m). */
  width: number;
  /** Área em planta da escada (metros quadrados). */
  planArea: number;
  /** Área em planta dos degraus (metros quadrados). */
  treadArea: number;
  /** Área em planta dos patamares (metros quadrados). */
  landingArea: number;
  /** Comprimento total dos espelhos, em planta (m). */
  riserLength: number;
  /** Volume do lance: monolítico = estrutura (metros cúbicos); piso e espelho = pisos (metros cúbicos). */
  volumeRun: number;
  /** Volume dos espelhos, só no estilo piso e espelho (metros cúbicos). */
  volumeRisers: number;
  /** Volume dos patamares (metros cúbicos). */
  volumeLandings: number;
  /** Volume do poste central (metros cúbicos), só no estilo poste; 0 nos demais. */
  volumePost: number;
  /** Área em planta do poste central (metros quadrados), só no estilo poste; 0 nos demais. */
  postPlanArea: number;
  /** Volume total (metros cúbicos): degraus + espelhos + patamares + poste. */
  volume: number;
  /** Volume por material (metros cúbicos). Degraus, patamares e espelhos no material do tipo; poste no `postMaterialId`; acabamentos nos seus materiais. */
  volumeByMaterial: Record<Id, number>;
  /** Acabamento do piso: área em planta do piso acabado, com o bocel (metros quadrados). 0 sem acabamento. */
  treadFinishArea: number;
  /** Acabamento do espelho: comprimento × altura dos espelhos acabados (metros quadrados). 0 sem acabamento. */
  riserFinishArea: number;
  /** Bocel: comprimento total da aresta com ressalto (m). 0 sem acabamento do piso ou com o bocel desligado. */
  bocelLength: number;
  /** Volume dos acabamentos (metros cúbicos), já somado em `volume` e em `volumeByMaterial`. */
  volumeFinish: number;
  runs: StairRunQuantity[];
}

/** Comprimento de uma polilinha aberta. */
const polyLength = (pts: Vec2[]): number => pts.reduce((s, q, i) => (i === 0 ? 0 : s + dist(pts[i - 1]!, q)), 0);

/** Comprimento do espelho (em planta, seguindo o arco quando houver). */
const riserLen = (r: ResolvedStairRiser): number => (r.points.length >= 2 ? polyLength(r.points) : dist(r.a, r.b));

/** Área em planta de um conjunto de degraus ou patamares. */
const areaOf = (steps: ResolvedStairStep[]): number => steps.reduce((s, x) => s + multiArea([[x.polygon]]), 0);

/**
 * Quantitativos de cada lance (nº de degraus, largura, área e piso médio). Só lê degraus e espelhos: o validador de norma usa isto sem
 * pagar o volume do corpo e dos acabamentos, que `stairQuantities` também calcula.
 */
export function stairRunQuantities(s: ResolvedStair): StairRunQuantity[] {
  const treads = s.steps.filter((x) => x.kind === 'tread');
  const indexes = [...new Set(treads.map((t) => t.componentIndex))].sort((a, b) => a - b);
  return indexes.map<StairRunQuantity>((ci) => {
    const ts = treads.filter((t) => t.componentIndex === ci);
    const rs = s.risers.filter((r) => r.componentIndex === ci);
    const w = rs.length ? Math.min(...rs.map(riserLen)) : 0;
    const area = areaOf(ts);
    return { componentIndex: ci, treadCount: ts.length, width: w, treadArea: area, treadMean: w > 0 ? area / (w * ts.length) : 0 };
  });
}

/** Quantitativos de uma escada resolvida. Escada sem geometria (erro no croqui) sai com tudo zero. */
export function stairQuantities(s: ResolvedStair): StairQuantities {
  const treads = s.steps.filter((x) => x.kind === 'tread');
  const landings = s.steps.filter((x) => x.kind === 'landing');
  const treadArea = areaOf(treads);
  const landingArea = areaOf(landings);
  const riserLength = s.risers.reduce((acc, r) => acc + riserLen(r), 0);
  const width = s.risers.length ? Math.min(...s.risers.map(riserLen)) : 0;

  const runs = stairRunQuantities(s);
  const treadCount = treads.length;
  const treadMean = treadCount ? runs.reduce((acc, r) => acc + r.treadMean * r.treadCount, 0) / treadCount : 0;

  const monolithic = s.type.runStyle === 'monolithic';
  const post = s.type.runStyle === 'post';
  // Monolítico e poste: volume das peças de corpo (a chegada fica fora; o poste tem peça própria). Piso e espelho: espessuras do tipo.
  const body: StairBodyPiece[] = monolithic || post ? stairBody(s).pieces : [];
  const bodyVolume = (kind: StairBodyPiece['kind']): number =>
    body.reduce((acc, p) => (p.kind === kind ? acc + pieceVolume(p) : acc), 0);
  const volumeRun = monolithic || post ? bodyVolume('tread') : treadArea * s.type.treadThickness;
  const volumeRisers = monolithic || post ? 0 : riserLength * s.riserHeight * s.type.riserThickness;
  const volumeLandings = monolithic ? bodyVolume('landing') : post ? 0 : landingArea * s.type.landingThickness;
  const volumePost = post ? bodyVolume('post') : 0;
  const postPlanArea = body.reduce((acc, p) => (p.kind === 'post' ? acc + Math.abs(ringArea(p.polygon)) : acc), 0);
  const volumeByMaterial: Record<Id, number> = {};
  volumeByMaterial[s.type.materialId] = volumeRun + volumeRisers + volumeLandings;
  if (post) volumeByMaterial[s.type.postMaterialId] = (volumeByMaterial[s.type.postMaterialId] ?? 0) + volumePost;
  // Acabamentos: sólidos próprios, nos materiais deles. A estrutura (acima) já perdeu a espessura que eles ocupam.
  const finish = stairFinishQuantities(s);
  let volumeFinish = 0;
  for (const [m, v] of Object.entries(finish.volumeByMaterial)) {
    volumeByMaterial[m] = (volumeByMaterial[m] ?? 0) + v;
    volumeFinish += v;
  }

  return {
    stairId: s.id,
    typeId: s.typeId,
    runStyle: s.type.runStyle,
    riserCount: s.riserCount,
    riserHeight: s.riserHeight,
    treadCount,
    treadMean,
    width,
    planArea: multiArea(s.footprint),
    treadArea,
    landingArea,
    riserLength,
    volumeRun,
    volumeRisers,
    volumeLandings,
    volumePost,
    postPlanArea,
    volume: volumeRun + volumeRisers + volumeLandings + volumePost + volumeFinish,
    volumeByMaterial,
    treadFinishArea: finish.treadArea,
    riserFinishArea: finish.riserArea,
    bocelLength: finish.bocelLength,
    volumeFinish,
    runs,
  };
}
