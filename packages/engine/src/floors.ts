import type { MultiPolygon } from '@hestia/geom';
import { floorsOnLevel, isMembraneLayer, layerPriority, levelElevation, terminoCamadaOf, terminoEhRegraParede, terminoOf, type Id, type Project } from '@hestia/model';
import { layerOutlines, memoCut } from './layerOutline.ts';
import { layerCoreFlags } from './junctionPlanar.ts';
import { resolveBoundary, type OutlineProblem } from './outlineBound.ts';
import { cutStairOpenings } from './stairOpenings.ts';
import { holesFor, openingsOnLevel } from './levelOpenings.ts';
import { despachanteDePisos } from './resolveDespacho.ts';

/** Camada resolvida do piso: o mesmo polígono em planta, entre as cotas absolutas z0 e z1. */
export interface ResolvedFloorLayer {
  layerIndex: number;
  materialId: Id;
  z0: number;
  z1: number;
  /** Prioridade efetiva e núcleo, para a junção por camada (decisão 0023 §1, P7). */
  priority: number;
  core: boolean;
  /** Membrana (decisão 0023 §5): sem volume e sem sólido; a linha fica na face `z1`. Espessura zero tem z0 = z1. */
  membrane: boolean;
  /** Término com regra explícita (decisão 0025): a junção automática por prioridade contra paredes não recorta a camada. */
  explicit: boolean;
  /** Término por camada da parede (decisão 0054): a camada vence as camadas de parede onde se cruzam (a parede perde a região comum). */
  venceParede: boolean;
  /** Contorno da camada, em planta, menos furos (decisão 0023 §2, P8): o do piso, salvo término que vai ao núcleo ou desloca. */
  polygon: MultiPolygon;
}

export interface ResolvedFloor {
  floorId: Id;
  typeId: Id;
  levelId: Id;
  /** Contorno menos furos, em planta. */
  polygon: MultiPolygon;
  /** Cota absoluta do topo do piso (nível + deslocamento). */
  topZ: number;
  /** Cota absoluta da face inferior (topo menos a espessura total). */
  bottomZ: number;
  /** Do topo para baixo (índice 0 = camada de cima). Inclui as membranas (`membrane: true`). */
  layers: ResolvedFloorLayer[];
  /** Motivo do circuito vinculado não fechar (decisão 0023 §8.2c); null quando fechou ou o piso é estático. */
  problem: OutlineProblem | null;
}

/**
 * Opções da resolução. `layers: false` deixa as camadas com o contorno do elemento (sem término por parede): é o que a
 * resolução de paredes usa para se anexar ao piso, e quebra o ciclo piso → camada → parede → piso (decisão 0025).
 */
export interface FloorResolveOptions {
  layers?: boolean;
}

/** Pisos de todos os níveis do projeto (quem cruza níveis, como a parede anexada, usa esta lista). */
const todosPisosPorProjeto = new WeakMap<Project, ResolvedFloor[]>();

/**
 * Com as opções padrão, o resultado fica em cache por projeto (imutável): validação, avisos, anexo de parede e classificação de
 * vista pedem a lista inteira várias vezes por edição, e resolvê-la custa segundos num prédio grande. O vetor é compartilhado:
 * quem chama não o altera.
 */
export const resolveAllFloors = (p: Project, opts: FloorResolveOptions = {}): ResolvedFloor[] => {
  if (Object.keys(opts).length > 0) return p.levels.flatMap((l) => resolveFloors(p, l.id, opts));
  let r = todosPisosPorProjeto.get(p);
  if (!r) todosPisosPorProjeto.set(p, (r = p.levels.flatMap((l) => resolveFloors(p, l.id, opts))));
  return r;
};

/**
 * Geometria dos pisos de um nível. O piso não é recortado pelas paredes (como no Revit, a parede fica sobre o piso
 * e a planta desenha o piso atrás dela). O furo de escada é calculado pela cota da face inferior de cada piso (decisão
 * 0011, §6). Piso vinculado às paredes (`outlineSource.linked`) tem o contorno derivado do circuito (`resolveBoundary`):
 * quando o circuito abre, mantém o último contorno válido e devolve `problem`. Tipos ausentes ou contornos com menos de
 * 3 pontos são ignorados: a validação do modelo é quem avisa.
 */
export function resolveFloors(p: Project, levelId: Id, opts: FloorResolveOptions = {}): ResolvedFloor[] {
  // Fatia B do kernel Rust (0050, B5): só a chamada padrão é despachada; `layers: false` (a cena de paredes) fica sempre no TypeScript.
  const d = despachanteDePisos();
  return d && Object.keys(opts).length === 0 ? d(p, levelId, () => resolveFloorsTs(p, levelId, opts)) : resolveFloorsTs(p, levelId, opts);
}

/** O motor TypeScript dos pisos, sem despacho (a referência do Rust e o retorno de qualquer falha do kernel). */
export function resolveFloorsTs(p: Project, levelId: Id, opts: FloorResolveOptions = {}): ResolvedFloor[] {
  const openings = openingsOnLevel(p, levelId);
  const out: ResolvedFloor[] = [];
  for (const f of floorsOnLevel(p, levelId)) {
    const type = p.floorTypes[f.typeId];
    if (!type) continue;
    let boundary = f.boundary;
    let holes = f.holes;
    let problem: OutlineProblem | null = null;
    if (f.outlineSource?.linked) {
      const outline = resolveBoundary(p, f.levelId, f);
      if (outline.polygon) {
        boundary = outline.polygon[0]!;
        holes = [...f.holes, ...outline.polygon.slice(1)];
      }
      problem = outline.problem;
    }
    if (boundary.length < 3) continue;
    const topZ = levelElevation(p, f.levelId) + f.heightOffset;
    let z = topZ;
    const bounds = type.layers.map((l) => {
      const r = { z0: z - l.thickness, z1: z };
      z = r.z0;
      return r;
    });
    const bottomZ = z;
    const core = layerCoreFlags(type.layers);
    const base: MultiPolygon = [[boundary, ...holes]];
    const cut = memoCut((m) => cutStairOpenings(m, holesFor(openings, bottomZ)));
    const polygon = cut(base);
    if (polygon.length === 0) continue;
    // Faixa de cota de cada camada (decisão 0025, revista): a parede só recorta as camadas com que se cruza de fato.
    const zones = bounds;
    const outlines = opts.layers === false ? type.layers.map(() => base) : layerOutlines(p, f.levelId, f, type.layers, core, base, { levelIds: [f.levelId], zones });
    const layers: ResolvedFloorLayer[] = type.layers.map((l, i) => ({
      layerIndex: i,
      materialId: l.materialId,
      z0: bounds[i]!.z0,
      z1: bounds[i]!.z1,
      membrane: isMembraneLayer(l),
      priority: layerPriority(l),
      core: core[i]!,
      explicit: terminoEhRegraParede(l),
      venceParede: terminoCamadaOf(terminoOf(l)) !== null,
      polygon: cut(outlines[i]!),
    }));
    out.push({ floorId: f.id, typeId: f.typeId, levelId: f.levelId, polygon, topZ, bottomZ, layers, problem });
  }
  return out;
}
