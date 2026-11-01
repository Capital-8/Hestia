import { intersection, machineNumber, orientedRect, unionClipper, type MultiPolygon, type Polygon, type Vec2 } from '@hestia/geom';
import { openingLineConvention, openingType, openingsOfWall, wallsOnLevel, type HatchKind, type Id, type OpeningLineConvention, type Project } from '@hestia/model';
import { bandTopAt } from './profile.ts';
import { fuseBands } from './bandFuse.ts';
import { resolveFloors } from './floors.ts';
import { junctionLevel, layerPartsOf, wallLayerBandsAfterJunction } from './junctionLevel.ts';
import { resolveSlabs, slabRiseAt } from './slabs.ts';
import { sectionOfCeilings } from './sectionCeilings.ts';
import { resolveRoofs } from './roofs.ts';
import { sectionOfRoofs } from './sectionRoofs.ts';

export { sectionOfRoofs, squareCutRun, type RoofSection } from './sectionRoofs.ts';
import { frameOfWall, openingGeometry, resolveLevel } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningModel } from './openingModelTypes.ts';
import { EPS_T, lineIntervals, prismProjection, rect, sectionFrame, slabQuad, type SectionLine } from './sectionGeom.ts';
import { resolveStairsOnLevel } from './stairs.ts';
import { sectionOfStairs } from './sectionStairs.ts';
import { resolveRampsOnLevel } from './ramps.ts';
import type { SectionSnapRing } from './sectionSnapRings.ts';
import { sectionOfRamps } from './sectionRamps.ts';
import { OCCLUSION_RANK, visibleParts, type OcclusionItem } from './sectionOcclusion.ts';
import { uniqueOrigins, type SectionPart } from './sectionParts.ts';
import { cutPieces, cutRegions, type CutPiece } from './sectionCut.ts';
import { membraneCutsOf, type SectionMembrane } from './sectionMembrane.ts';

export { lineIntervals, sectionFrame, type SectionLine } from './sectionGeom.ts';
export { type SectionPart } from './sectionParts.ts';

/**
 * Corte e elevação a partir da geometria já resolvida em faixas (bands).
 *
 * Convenção do desenho: x = distância ao longo da linha (a→b), y = cota (z absoluta). O observador olha para a
 * normal à esquerda da linha; assim x cresce para a direita. Uma elevação é o mesmo cálculo com a linha fora da
 * construção e `depth` grande, onde nada é cortado e tudo é projetado.
 *
 * Linha oculta (como Revit e Archicad): todo elemento opaco (paredes, pisos, lajes, telhados, escadas e aberturas, com
 * caixilho, folha e vidro) esconde o que está atrás dele. O resultado traz só a parte visível de cada item (ver
 * `sectionOcclusion.ts`); o plano de corte é o mais próximo, então o cortado oculta tudo o que está além.
 */

/**
 * Origem de um item da seção: o elemento do modelo de onde ele veio. Preenchido o campo do tipo de origem (parede,
 * piso, laje, telhado, escada ou abertura); os demais ficam ausentes.
 */
export interface SectionOrigin {
  wallId?: Id;
  floorId?: Id;
  slabId?: Id;
  ceilingId?: Id;
  roofId?: Id;
  stairId?: Id;
  rampId?: Id;
  openingId?: Id;
}

/**
 * Material cortado no plano de corte, unido por material. `polygons` é a parte visível em (t, z); `sources` lista os
 * elementos de origem que contribuíram (sem repetição) para que a seleção ache o elemento de volta.
 */
export interface SectionRegion {
  materialId: Id;
  /** Hachura própria do corte (forro, D3); sem valor, vale a do material. */
  hatch?: HatchKind;
  /** Polígonos em (t, z), já sem o que está na frente. */
  polygons: MultiPolygon;
  sources: SectionOrigin[];
  /** Peças por origem (decisão 0016 §7): a parte visível de cada elemento do corte unido, para a seleção achar o dono. */
  parts?: SectionPart[];
}

/**
 * Camada de elemento visto além do plano de corte (parede, piso, laje, telhado ou escada). `polygons` é só a parte
 * visível em (t, z); `depth` é a distância do plano ao ponto mais próximo do item inteiro (ordem de oclusão).
 * A lista vem do mais longe ao mais perto (ordem de pintura) e não traz itens totalmente ocultos.
 */
export interface SectionBeyond extends SectionOrigin {
  materialId: Id;
  /** Hachura própria da elevação (forro, D3); sem valor, sem hachura. */
  hatch?: HatchKind;
  layerIndex: number;
  /** Distância do plano de corte ao ponto mais próximo. */
  depth: number;
  polygons: MultiPolygon;
}

/** Vão de porta ou janela. `t0..z1` é a caixa do vão; `polygons` é a parte visível (sem o que está na frente). */
export interface SectionOpening {
  openingId: Id;
  kind: 'door' | 'window';
  t0: number;
  t1: number;
  z0: number;
  z1: number;
  depth: number;
  /** O plano de corte atravessa o vão. */
  cut: boolean;
  polygons: MultiPolygon;
  /** Modelo único da esquadria: a vista só desenha estas peças (E-spec §0). */
  model: OpeningModel;
  /** Convenção do V do projeto (`ProjectSettings.openingLine`). */
  openingLine: OpeningLineConvention;
  /** Observador da elevação no lado de `n` (+1) ou no oposto (−1); a tela usa `x = −viewSide·t`. */
  viewSide: 1 | -1;
  /** Sinal de `s` no eixo da seção transversal (o corte pela espessura). */
  sSign: 1 | -1;
  /** Posição `t` local em que o plano da seção transversal atravessa o vão. */
  cutT: number;
  /** Materiais do tipo, para a cor e a hachura das peças do modelo. */
  frameMaterialId: Id;
  glassMaterialId: Id;
}

export interface SectionLevelMark {
  levelId: Id;
  name: string;
  z: number;
}

export interface SectionResult {
  length: number;
  zMin: number;
  zMax: number;
  /** Cortes por material, visíveis (depth 0). */
  cut: SectionRegion[];
  /** União das regiões visíveis de cortes, paredes, pisos, lajes, telhados e escadas (não inclui os vãos). */
  silhouette: MultiPolygon;
  /** Além do plano, visível, do mais longe ao mais perto. */
  beyond: SectionBeyond[];
  /** Vãos visíveis, do mais longe ao mais perto. */
  openings: SectionOpening[];
  /** Membranas de piso e laje cortadas pelo plano: linha na cota da face (decisão 0023 §5). */
  membranes: SectionMembrane[];
  levels: SectionLevelMark[];
  /** Aneis (t, z) de degraus, espelhos, patamares e rampas antes da uniao/envoltoria; so captura (snap). Ausente sem escada/rampa. */
  snapRings?: SectionSnapRing[];
}

/**
 * Peças de uma mesma camada da mesma parede, piso ou laje, na mesma profundidade, viram um item só (união): a parede
 * dividida em trechos pelas aberturas não deixa emendas falsas no desenho, e há menos itens na oclusão. Peças em
 * profundidades diferentes ficam separadas, pois a ordem é por profundidade; escadas e telhados não se agrupam.
 */
function groupBeyond(list: SectionBeyond[]): SectionBeyond[] {
  const byKey = new Map<string, SectionBeyond[]>();
  list.forEach((b, i) => {
    // Escadas e telhados ficam peça a peça (cada degrau, espelho e água é um item); paredes, pisos e lajes agrupam.
    const merge = b.wallId !== undefined || b.floorId !== undefined || b.slabId !== undefined || b.ceilingId !== undefined;
    const key = merge ? [b.wallId, b.floorId, b.slabId, b.ceilingId, b.materialId, b.layerIndex, machineNumber(b.depth, 6)].join('|') : `#${i}`;
    const group = byKey.get(key);
    if (group) group.push(b);
    else byKey.set(key, [b]);
  });
  return [...byKey.values()].map((g) => (g.length === 1 ? g[0]! : { ...g[0]!, polygons: unionClipper(...g.map((b) => b.polygons)) }));
}

/** Camada de laje entre as cotas de base (b0 em t0, b1 em t1) e de topo (u0 em t0, u1 em t1): trapézio se inclinada. */

/** Contribuição de um pavimento ao corte (antes da união e da oclusão); depende só do pavimento, dos vizinhos que ele lê e da linha. */
export interface SectionLevelPart {
  cuts: Array<{ materialId: Id; hatch?: HatchKind; polygon: Polygon; origin: SectionOrigin }>;
  beyond: SectionBeyond[];
  openings: SectionOpening[];
  membranes: SectionMembrane[];
  snapRings: SectionSnapRing[];
  zMin: number;
  zMax: number;
}

/** Parte do corte vinda de um único pavimento: cortes por material, além do plano, vãos, membranas e capturas. */
export function sectionLevelPart(p: Project, levelId: Id, line: SectionLine): SectionLevelPart {
  const { length, d, n, slab } = sectionFrame(line);
  const cuts: SectionLevelPart['cuts'] = [];
  const addCut = (materialId: Id, polygon: Polygon, origin: SectionOrigin, hatch?: HatchKind): void => {
    cuts.push({ materialId, hatch, polygon, origin });
  };
  const beyond: SectionBeyond[] = [];
  const snapRings: SectionSnapRing[] = [];
  const membranes: SectionMembrane[] = []; const frame = { line, length, d, n };
  const openings: SectionOpening[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  const dist = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const grow = (z0: number, z1: number): void => {
    zMin = Math.min(zMin, z0);
    zMax = Math.max(zMax, z1);
  };
  if (length < 1e-6) return { cuts, beyond, openings, membranes, snapRings, zMin, zMax };
  const resolved = resolveLevel(p, levelId);
  // Junção resolvida do nível (P7b e P7c): cada camada de piso, de laje e de parede corta só a parte que sobra dela
  // (`layerPartsOf` para piso e laje; `wallLayerBandsAfterJunction` para as paredes, 0023 §3 regra B). Sem corte, a
  // camada inteira. Pisos entram como as paredes: a linha corta cada camada (retângulo t×z) e a laje de visão mostra o
  // resto.
  const jl = junctionLevel(p, levelId);
  for (const f of resolveFloors(p, levelId)) {
    membranes.push(...membraneCutsOf(f.layers, { floorId: f.floorId }, null, frame));
    for (const layer of f.layers) {
      const parts = layerPartsOf(jl.elements.get(f.floorId), layer.layerIndex, [{ poly: layer.polygon, z0: layer.z0, z1: layer.z1 }]);
      for (const part of parts) {
        for (const poly of part.poly) {
          for (const [t0, t1] of lineIntervals(poly, line.a, d, n)) {
            const lo = Math.max(0, t0);
            const hi = Math.min(length, t1);
            if (hi - lo < EPS_T) continue;
            addCut(layer.materialId, [rect(lo, hi, part.z0, part.z1)], { floorId: f.floorId });
            grow(part.z0, part.z1);
          }
        }
        for (const sp of intersection(part.poly, slab)) {
          const outer = sp[0];
          if (!outer || outer.length < 3) continue;
          const ts = outer.map(along);
          const tMin = Math.max(0, Math.min(...ts));
          const tMax = Math.min(length, Math.max(...ts));
          if (tMax - tMin < EPS_T) continue;
          beyond.push({
            floorId: f.floorId,
            materialId: layer.materialId,
            layerIndex: layer.layerIndex,
            depth: Math.max(0, Math.min(...outer.map(dist))),
            polygons: [[rect(tMin, tMax, part.z0, part.z1)]],
          });
          grow(part.z0, part.z1);
        }
      }
    }
  }
  // Lajes (D3): como os pisos, mas com inclinação; cada cota (base e topo) soma a subida no ponto da linha de corte.
  // Lajes com caimento não entram na junção (`junctionLevel`) e seguem como antes.
  for (const sl of resolveSlabs(p, levelId)) {
    membranes.push(...membraneCutsOf(sl.layers, { slabId: sl.slabId }, sl.slope, frame));
    for (const layer of sl.layers) {
      const parts = layerPartsOf(jl.elements.get(sl.slabId), layer.layerIndex, [{ poly: layer.polygon, z0: layer.z0, z1: layer.z1 }]);
      for (const part of parts) {
        for (const poly of part.poly) {
          for (const [t0, t1] of lineIntervals(poly, line.a, d, n)) {
            const lo = Math.max(0, t0);
            const hi = Math.min(length, t1);
            if (hi - lo < EPS_T) continue;
            const rl = slabRiseAt(sl.slope, { x: line.a.x + d.x * lo, y: line.a.y + d.y * lo });
            const rh = slabRiseAt(sl.slope, { x: line.a.x + d.x * hi, y: line.a.y + d.y * hi });
            addCut(layer.materialId, [slabQuad(lo, hi, part.z0 + rl, part.z0 + rh, part.z1 + rl, part.z1 + rh)], { slabId: sl.slabId });
            grow(part.z0 + Math.min(rl, rh), part.z1 + Math.max(rl, rh));
          }
        }
        for (const sp of intersection(part.poly, slab)) {
          const outer = sp[0];
          if (!outer || outer.length < 3) continue;
          const ts = outer.map(along);
          const tMin = Math.max(0, Math.min(...ts));
          const tMax = Math.min(length, Math.max(...ts));
          if (tMax - tMin < EPS_T) continue;
          // Laje plana: retângulo. Inclinada: projeção exata do prisma (a cota sobe linear sobre o contorno).
          const rise = (v: Vec2): number => slabRiseAt(sl.slope, v);
          const zs = outer.map(rise);
          beyond.push({
            slabId: sl.slabId,
            materialId: layer.materialId,
            layerIndex: layer.layerIndex,
            depth: Math.max(0, Math.min(...outer.map(dist))),
            polygons: sl.slope ? prismProjection(outer, along, (v) => part.z0 + rise(v), (v) => part.z1 + rise(v)) : [[rect(tMin, tMax, part.z0, part.z1)]],
          });
          grow(part.z0 + Math.min(...zs), part.z1 + Math.max(...zs));
        }
      }
    }
  }
  // Forros (decisão 0021): mesmo tratamento dos pisos planos (`sectionCeilings.ts`).
  const ck = sectionOfCeilings(p, levelId, line);
  for (const c of ck.cut) addCut(c.materialId, c.polygon, c.origin, c.hatch);
  beyond.push(...ck.beyond);
  grow(ck.zMin, ck.zMax);
  // Telhados (D3): como as lajes, por água e por camada (cada faixa segue a cota da água menos `below`).
  const rf = sectionOfRoofs(resolveRoofs(p, levelId), line);
  for (const c of rf.cut) addCut(c.materialId, c.polygon, { roofId: c.roofId });
  beyond.push(...rf.beyond);
  grow(rf.zMin, rf.zMax);
  // Escadas (decisão 0011 §6) das que nascem neste nível: degraus, patamares e espelhos (`sectionStairs.ts`).
  const sk = sectionOfStairs(resolveStairsOnLevel(p, levelId), line, p);
  for (const c of sk.cut) addCut(c.materialId, c.polygon, { stairId: c.stairId });
  beyond.push(...sk.beyond);
  snapRings.push(...sk.snapRings);
  grow(sk.zMin, sk.zMax);
  // Rampas da rampa §4.3: mesma leitura das escadas monolíticas, com `rampId` na origem.
  const rk = sectionOfRamps(resolveRampsOnLevel(p, levelId), line, p);
  for (const c of rk.cut) addCut(c.materialId, c.polygon, { rampId: c.rampId });
  beyond.push(...rk.beyond);
  snapRings.push(...rk.snapRings);
  grow(rk.zMin, rk.zMax);
  for (const w of wallsOnLevel(p, levelId)) {
    const rw = resolved.walls[w.id];
    if (!rw) continue;
    for (const layer of rw.layers) {
      // Parede recortada pela junção (0023 §3, regra B): a faixa cortada entra só com as partes que sobram.
      // Faixas fundidas em prismas (bandFuse): sem contorno horizontal falso entre faixas da mesma região.
      for (const band of fuseBands(wallLayerBandsAfterJunction(jl, rw, layer))) {
        const z0 = rw.baseZ + band.z0;
        const z1 = rw.baseZ + band.z1;
        for (const poly of band.poly) {
          for (const [t0, t1] of lineIntervals(poly, line.a, d, n)) {
            const lo = Math.max(0, t0);
            const hi = Math.min(length, t1);
            if (hi - lo < EPS_T) continue;
            const at = (t: number): number => (band.slope ? rw.baseZ + bandTopAt(band, { x: line.a.x + d.x * t, y: line.a.y + d.y * t }) : z1);
            addCut(layer.materialId, [rect(lo, hi, z0, at(lo), at(hi))], { wallId: w.id });
            grow(z0, z1);
          }
        }
        for (const sp of intersection(band.poly, slab)) {
          const outer = sp[0];
          if (!outer || outer.length < 3) continue;
          const ts = outer.map(along);
          const tMin = Math.max(0, Math.min(...ts));
          const tMax = Math.min(length, Math.max(...ts));
          if (tMax - tMin < EPS_T) continue;
          beyond.push({
            wallId: w.id,
            materialId: layer.materialId,
            layerIndex: layer.layerIndex,
            depth: Math.max(0, Math.min(...outer.map(dist))),
            // Topo plano: retângulo; topo inclinado: projeção exata do prisma (como as lajes inclinadas).
            polygons: band.slope ? prismProjection(outer, along, () => z0, (v) => rw.baseZ + bandTopAt(band, v)) : [[rect(tMin, tMax, z0, z1)]],
          });
          grow(z0, z1);
        }
      }
    }
    const f = frameOfWall(p, w.id);
    if (!f) continue;
    for (const o of openingsOfWall(p, w.id)) {
      const g = openingGeometry(p, o, f);
      const foot = orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.width / 2, g.thickness / 2);
      const crossing = lineIntervals([foot], line.a, d, n).some(([t0, t1]) => t1 > 0 && t0 < length);
      if (!crossing && intersection([[foot]], slab).length === 0) continue;
      const t0 = Math.max(0, Math.min(...foot.map(along)));
      const t1 = Math.min(length, Math.max(...foot.map(along)));
      if (t1 - t0 < EPS_T) continue;
      const z0 = rw.baseZ + g.sill;
      const model = buildOpeningModel(p, o, g, f);
      const ot = openingType(p, o);
      const du = d.x * g.u.x + d.y * g.u.y;
      const dn = d.x * g.n.x + d.y * g.n.y;
      openings.push({
        openingId: o.id,
        kind: g.kind,
        t0,
        t1,
        z0,
        z1: z0 + g.height,
        depth: Math.max(0, Math.min(...foot.map(dist))),
        cut: crossing,
        polygons: [[rect(t0, t1, z0, z0 + g.height)]],
        model,
        openingLine: openingLineConvention(p),
        // A tela cresce no sentido de `d`; `x = −viewSide·t` equivale a `x = sign(d·u)·t`.
        viewSide: du >= 0 ? -1 : 1,
        sSign: dn >= 0 ? 1 : -1,
        cutT: (line.a.x - g.center.x) * g.u.x + (line.a.y - g.center.y) * g.u.y,
        frameMaterialId: ot.frameMaterialId,
        glassMaterialId: ot.glassMaterialId,
      });
    }
  }
  return { cuts, beyond, openings, membranes, snapRings, zMin, zMax };
}

export function computeSection(p: Project, line: SectionLine, levelIds: Id[] = p.levels.map((l) => l.id)): SectionResult {
  return assembleSection(p, line, levelIds.map((id) => sectionLevelPart(p, id, line)));
}

/** União, oclusão e acabamento das partes por pavimento (na ordem dos pavimentos) num `SectionResult`. */
export function assembleSection(p: Project, line: SectionLine, parts: readonly SectionLevelPart[]): SectionResult {
  const { length } = sectionFrame(line);
  const empty: SectionResult = { length, zMin: 0, zMax: 3, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [] };
  if (length < 1e-6) return empty;
  const cutBy = new Map<string, { materialId: Id; hatch?: HatchKind; items: Array<{ polygon: Polygon; origin: SectionOrigin }> }>();
  const beyond: SectionBeyond[] = [];
  const snapRings: SectionSnapRing[] = [];
  const membranes: SectionMembrane[] = [];
  const openings: SectionOpening[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const part of parts) {
    for (const c of part.cuts) {
      const key = `${c.materialId}|${c.hatch ?? ''}`;
      const entry = cutBy.get(key) ?? { materialId: c.materialId, hatch: c.hatch, items: [] };
      entry.items.push({ polygon: c.polygon, origin: c.origin });
      cutBy.set(key, entry);
    }
    for (const b of part.beyond) beyond.push(b);
    for (const o of part.openings) openings.push(o);
    for (const m of part.membranes) membranes.push(m);
    for (const r of part.snapRings) snapRings.push(r);
    zMin = Math.min(zMin, part.zMin);
    zMax = Math.max(zMax, part.zMax);
  }
  // Linha oculta: corte (depth 0), vãos e o além numa só ordem do mais perto ao mais longe; cada um vê o que sobra.
  // O corte é ocluído peça a peça (uma por origem em cada material), pela cota (`cotaKeys`), não pela ordem de inserção.
  const cutEntries = [...cutBy.values()];
  const cutSources = cutEntries.map((entry) => uniqueOrigins(entry.items.map((c) => c.origin)));
  const pieces = cutPieces(cutEntries, cutSources);
  type Ref = { cut: CutPiece } | { beyond: SectionBeyond } | { opening: SectionOpening };
  const refs: Ref[] = [];
  const items: OcclusionItem[] = [];
  for (const piece of pieces) {
    refs.push({ cut: piece });
    items.push(piece.item);
  }
  for (const b of groupBeyond(beyond)) {
    refs.push({ beyond: b });
    items.push({ depth: b.depth, rank: OCCLUSION_RANK.beyond, polygons: b.polygons });
  }
  for (const o of openings) {
    refs.push({ opening: o });
    items.push({ depth: o.depth, rank: OCCLUSION_RANK.opening, polygons: o.polygons });
  }
  const visible = visibleParts(items);
  const beyondVisible: SectionBeyond[] = [];
  const openingsVisible: SectionOpening[] = [];
  const cutVisible: SectionPart[][] = cutEntries.map((): SectionPart[] => []);
  refs.forEach((ref, i) => {
    const polygons = visible[i]!;
    if (polygons.length === 0) return;
    if ('cut' in ref) cutVisible[ref.cut.entry]!.push({ origin: ref.cut.part.origin, polygons });
    else if ('beyond' in ref) beyondVisible.push({ ...ref.beyond, polygons });
    else openingsVisible.push({ ...ref.opening, polygons });
  });
  const cut = cutRegions(cutEntries, cutSources, cutVisible);
  // Telhado: as camadas projetam na mesma área (a face é inclinada), então a de cima (índice menor) desenha por último.
  beyondVisible.sort((x, y) => y.depth - x.depth || (x.roofId || y.roofId ? y.layerIndex - x.layerIndex : x.layerIndex - y.layerIndex));
  openingsVisible.sort((x, y) => y.depth - x.depth);
  const silhouette = unionClipper(...cut.map((c) => c.polygons), ...beyondVisible.map((b) => b.polygons));
  const levels = p.levels.map((l) => ({ levelId: l.id, name: l.name, z: l.elevation }));
  if (!isFinite(zMin)) return { ...empty, levels };
  return { length, zMin, zMax, cut, silhouette, beyond: beyondVisible, openings: openingsVisible, membranes, levels, ...(snapRings.length > 0 ? { snapRings } : {}) };
}
