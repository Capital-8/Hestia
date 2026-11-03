import { isCeiling, isFloor, isRamp, isRoof, isSlab, isStair, type Id, type Layer, type Roof, type StairType } from '@hestia/model';
import { gid, langOf, materialOf, storeyOf, type IfcCtx, type IfcStorey } from './ifcCtx.ts';
import { localPlacement, normalizePolygon, prismsShape, ringArea, ringChainDirection, ringChainStep } from './ifcSolids.ts';
import { en, int, list, num, OMIT, ref, stepString } from './ifcStep.ts';
import { t } from '../i18n.ts';
import type { IfcFlightGeo, IfcGeometry, IfcPoint, IfcPrism, IfcRampGeo, IfcRing } from './ifcTypes.ts';

/**
 * Forro resolvido (o contrato `IfcGeometry` ainda não tem campo próprio: a leitura é opcional e o exportador funciona
 * sem ele). Quando o montador passar `geo.ceilings`, cada forro sai como IFCCOVERING .CEILING.
 */
interface IfcCeilingGeo {
  /** O contrato usa `ceilingId`; `id` fica aceito para montadores que usem o id do elemento direto. */
  ceilingId?: Id;
  id?: Id;
  prisms: IfcPrism[];
}

type GeometryWithCeilings = IfcGeometry & { ceilings?: IfcCeilingGeo[] };

/**
 * Tipo de laje (IfcSlabTypeEnum). A laje do Hestia sai como BASESLAB: o importador lê FLOOR como piso e só BASESLAB
 * (além de ROOF/LANDING/PAVEMENT) como laje — com FLOOR as lajes voltavam como pisos no round-trip.
 */
export const slabKindOf = (_typeName: string): 'BASESLAB' => 'BASESLAB';

/** Forma do telhado (IfcRoofTypeEnum): água única, duas águas, quatro águas; as demais formas saem como livre. */
export function roofKindOf(shape: Roof['shape']): string {
  switch (shape) {
    case 'shed':
      return 'SHED_ROOF';
    case 'gable':
      return 'GABLE_ROOF';
    case 'hip':
      return 'HIP_ROOF';
    default:
      return 'FREEFORM';
  }
}

/** Uma prancha horizontal (piso, laje, forro, patamar ou água de telhado) e o que ela precisa no IFC. */
interface PlateSpec {
  /** Chave estável do GlobalId (tipo:id). */
  key: string;
  /** Id do elemento no projeto (para o mapa de produtos dos psets). Água de telhado e patamar não têm produto próprio. */
  elementId?: Id;
  name: string;
  prisms: readonly IfcPrism[];
  /** PredefinedType: FLOOR, BASESLAB, CEILING, LANDING ou ROOF. */
  kind: string;
  /** IFCSLAB para piso/laje/patamar/água; IFCCOVERING para forro (IfcSlabTypeEnum não tem CEILING no IFC4). */
  entity: 'IFCSLAB' | 'IFCCOVERING';
  layers: readonly Layer[];
}

/** Nome do material do projeto (mesmo rótulo de `materialOf`). */
const materialName = (c: IfcCtx, materialId: Id): string => c.p.materials[materialId]?.name ?? t(langOf(c), 'io_ifc_material_undefined');

/** Espessura vertical do prisma (m), usada quando o tipo não informa camadas. */
const prismThickness = (pr: IfcPrism): number => Math.abs(pr.top.c - pr.bottom.c);

/**
 * Camadas do tipo no IFC: IFCMATERIALLAYERSET com todas as camadas de espessura positiva (material, nome e espessura),
 * IFCMATERIALLAYERSETUSAGE com o sentido de crescimento a partir do topo (.AXIS3./.NEGATIVE., deslocamento 0) e
 * IFCRELASSOCIATESMATERIAL ligando o conjunto às pranchas. Sem camada positiva, nada é escrito.
 */
function addMaterialLayers(c: IfcCtx, key: string, name: string, layers: readonly Layer[], targets: readonly number[]): void {
  const positive = layers.filter((l) => l.thickness > 0);
  if (positive.length === 0 || targets.length === 0) return;
  const layerIds = positive.map((l) => {
    const matName = materialName(c, l.materialId);
    return ref(
      c.w.add('IFCMATERIALLAYER', [ref(materialOf(c, l.materialId)), num(l.thickness), OMIT, stepString(matName), OMIT, OMIT, OMIT]),
    );
  });
  const set = c.w.add('IFCMATERIALLAYERSET', [list(layerIds), stepString(name), OMIT]);
  const usage = c.w.add('IFCMATERIALLAYERSETUSAGE', [ref(set), en('AXIS3'), en('NEGATIVE'), num(0), OMIT]);
  c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:${key}`), OMIT, OMIT, OMIT, list(targets.map(ref)), ref(usage)]);
}

/**
 * Furos da prancha como IFCOPENINGELEMENT + IFCRELVOIDSELEMENT, um por laço interno de cada prisma, na posição do
 * prisma hospedeiro (mesmo posicionamento do nível e mesmas cotas de topo e fundo). O recorte do perfil continua sendo
 * feito; os vãos ficam explícitos para quem lê a estrutura do IFC.
 */
function addVoids(c: IfcCtx, st: IfcStorey, host: number, spec: PlateSpec): void {
  spec.prisms.forEach((pr, prismIndex) => {
    const holes = normalizePolygon(pr.polygon).slice(1);
    holes.forEach((hole, holeIndex) => {
      const n = `${prismIndex + 1}.${holeIndex + 1}`;
      const shape = prismsShape(c.w, c.ctx, [{ polygon: [hole], top: pr.top, bottom: pr.bottom }], st.elev, langOf(c));
      const place = localPlacement(c.w, st.place, [0, 0, 0]);
      const voidId = c.w.add('IFCOPENINGELEMENT', [
        gid(`void:${spec.key}:${n}`),
        OMIT,
        stepString(t(langOf(c), 'io_ifc_name_hole', { name: spec.name, n: holeIndex + 1 })),
        OMIT,
        OMIT,
        ref(place),
        ref(shape),
        OMIT,
        en('OPENING'),
      ]);
      c.w.add('IFCRELVOIDSELEMENT', [gid(`rvoid:${spec.key}:${n}`), OMIT, OMIT, OMIT, ref(host), ref(voidId)]);
    });
  });
}

/**
 * Entidade da prancha no pavimento `st`: IFCSLAB (piso/laje/patamar/água) ou IFCCOVERING (forro), com o corpo em cota
 * local, os furos como vãos e as camadas do tipo. Devolve o id, ou null quando não há prisma com área.
 */
function plateEntity(c: IfcCtx, st: IfcStorey, spec: PlateSpec): number | null {
  if (spec.prisms.length === 0) return null;
  const shape = prismsShape(c.w, c.ctx, spec.prisms, st.elev, langOf(c));
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const id = c.w.add(spec.entity, [gid(spec.key), OMIT, stepString(spec.name), OMIT, OMIT, ref(place), ref(shape), OMIT, en(spec.kind)]);
  if (spec.elementId) c.products?.set(spec.elementId, id);
  st.contained.push(id);
  addVoids(c, st, id, spec);
  addMaterialLayers(c, spec.key, spec.name, spec.layers, [id]);
  return id;
}

/** Pisos (.FLOOR.), lajes (.BASESLAB.) e forros (.CEILING.): um IFCSLAB/IFCCOVERING por elemento, com furos e camadas. */
export function addPlates(c: IfcCtx, geo: IfcGeometry): void {
  for (const f of geo.floors) {
    const el = c.p.elements[f.floorId];
    const st = isFloor(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isFloor(el) || !st) continue;
    const type = c.p.floorTypes[el.typeId];
    plateEntity(c, st, { key: `floor:${f.floorId}`, elementId: f.floorId, name: type?.name ?? t(langOf(c), 'io_ifc_default_floor'), prisms: f.prisms, kind: 'FLOOR', entity: 'IFCSLAB', layers: type?.layers ?? [] });
  }
  for (const s of geo.slabs) {
    const el = c.p.elements[s.slabId];
    const st = isSlab(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isSlab(el) || !st) continue;
    const type = c.p.slabTypes[el.typeId];
    const name = type?.name ?? t(langOf(c), 'io_ifc_default_slab');
    plateEntity(c, st, { key: `slab:${s.slabId}`, elementId: s.slabId, name, prisms: s.prisms, kind: slabKindOf(name), entity: 'IFCSLAB', layers: type?.layers ?? [] });
  }
  for (const ce of (geo as GeometryWithCeilings).ceilings ?? []) {
    const ceilingId = ce.ceilingId ?? ce.id;
    if (!ceilingId) continue;
    const el = c.p.elements[ceilingId];
    const st = isCeiling(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isCeiling(el) || !st) continue;
    const type = c.p.ceilingTypes[el.typeId];
    plateEntity(c, st, { key: `ceiling:${ceilingId}`, elementId: ceilingId, name: type?.name ?? t(langOf(c), 'io_ifc_default_ceiling'), prisms: ce.prisms, kind: 'CEILING', entity: 'IFCCOVERING', layers: type?.layers ?? [] });
  }
}

/**
 * Telhados: IFCROOF (contido no pavimento) com uma IFCSLAB ROOF por água, agregada ao telhado e com as camadas do tipo.
 * Cada água é um prisma de faces planas: topo inclinado na cota da água e fundo paralelo, a espessura vertical das
 * camadas do tipo. O importador atual ainda lê `.ROOF.` como laje (`slabKind` por PredefinedType) e o IFCROOF como
 * genérico: a distinção de telhado nativo na volta depende do importador, não do exportador.
 */
export function addRoofs(c: IfcCtx, geo: IfcGeometry): void {
  for (const r of geo.roofs) {
    const el = c.p.elements[r.roofId];
    const st = isRoof(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isRoof(el) || !st) continue;
    const type = c.p.roofTypes[el.typeId];
    const name = type?.name ?? t(langOf(c), 'io_ifc_default_roof');
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const roof = c.w.add('IFCROOF', [gid(`roof:${r.roofId}`), OMIT, stepString(name), OMIT, OMIT, ref(place), OMIT, OMIT, en(roofKindOf(el.shape))]);
    c.products?.set(r.roofId, roof);
    st.contained.push(roof);
    const waters = r.planes
      .map((pr, i) =>
        plateEntity(c, st, {
          key: `roofslab:${r.roofId}:${i}`,
          name: t(langOf(c), 'io_ifc_name_roof_face', { name, n: i + 1 }),
          prisms: [pr],
          kind: 'ROOF',
          entity: 'IFCSLAB',
          layers: type?.layers ?? [],
        }),
      )
      .filter((id): id is number => id !== null);
    if (waters.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`roofagg:${r.roofId}`), OMIT, OMIT, OMIT, ref(roof), list(waters.map(ref))]);
  }
}

/** Degrau do lance: cota do topo e anel em planta. */
interface StepRing {
  z: number;
  ring: IfcRing;
}

/** Anéis de topo crescente do lance, um por cota de degrau (peças divididas no mesmo plano contam uma vez). */
function flightRings(pieces: readonly IfcPrism[]): IfcRing[] {
  const byTop: StepRing[] = [];
  for (const pr of pieces) {
    const ring = normalizePolygon(pr.polygon)[0];
    if (ring) byTop.push({ z: pr.top.c, ring });
  }
  byTop.sort((a, b) => a.z - b.z);
  const steps: StepRing[] = [];
  for (const item of byTop) {
    const last = steps[steps.length - 1];
    if (last && Math.abs(last.z - item.z) < 1e-6) {
      // Mesma cota: fica o anel de maior área (o degrau, não o poste nem a chegada).
      if (ringArea(item.ring) > ringArea(last.ring)) last.ring = item.ring;
      continue;
    }
    steps.push({ ...item });
  }
  return steps.map((s) => s.ring);
}

/** Comprimento do piso (TreadLength) do lance: passo mediano entre os centros dos degraus. */
export function flightTreadLength(fl: IfcFlightGeo): number | null {
  return ringChainStep(flightRings(fl.pieces));
}

/** Direção de subida do lance (centro do primeiro ao do último degrau); null quando não há dois degraus. */
function flightDirection(fl: IfcFlightGeo): IfcPoint | null {
  return ringChainDirection(flightRings(fl.pieces));
}

/** Ângulo entre duas direções, em graus (0 a 180). */
function angleBetween(a: IfcPoint, b: IfcPoint): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * Tipo da escada (IfcStairTypeEnum) pela geometria: caracol, lance único reto e, com dois lances, reto (mesma direção),
 * em L (90°) ou em U (180°). Mais de dois lances fica NOTDEFINED.
 */
export function stairKindOf(s: IfcGeometry['stairs'][number]): string {
  if (s.spiral) return 'SPIRAL_STAIR';
  if (s.flights.length === 1) return 'STRAIGHT_RUN_STAIR';
  if (s.flights.length !== 2) return 'NOTDEFINED';
  const a = flightDirection(s.flights[0]!);
  const b = flightDirection(s.flights[1]!);
  if (!a || !b) return 'NOTDEFINED';
  const turn = angleBetween(a, b);
  if (turn <= 45) return 'TWO_STRAIGHT_RUN_STAIR';
  if (turn <= 135) return 'TWO_QUARTER_TURN_STAIR';
  return 'HALF_TURN_STAIR';
}

/** Camada única do patamar: material e espessura do tipo de escada (o patamar não tem tipo próprio). */
function landingLayers(type: StairType | undefined, pr: IfcPrism): Layer[] {
  if (!type) return [];
  const thickness = type.landingThickness > 0 ? type.landingThickness : prismThickness(pr);
  return thickness > 0 ? [{ function: 'structure', materialId: type.materialId, thickness, wraps: false }] : [];
}

/**
 * Escadas: IFCSTAIR contido no pavimento de baixo, agregando um IFCSTAIRFLIGHT por lance (degraus, chegada e poste do
 * lance, em faces planas) e um IFCSLAB LANDING por patamar, contido no pavimento. Espelho, contagens e comprimento do
 * piso vão nos atributos do lance; o tipo da escada vem da geometria dos lances.
 */
export function addStairs(c: IfcCtx, geo: IfcGeometry): void {
  for (const s of geo.stairs) {
    const el = c.p.elements[s.stairId];
    const st = isStair(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isStair(el) || !st) continue;
    const type = c.p.stairTypes[el.typeId];
    const name = type?.name ?? t(langOf(c), 'io_ifc_default_stair');
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const stair = c.w.add('IFCSTAIR', [gid(`stair:${s.stairId}`), OMIT, stepString(name), OMIT, OMIT, ref(place), OMIT, OMIT, en(stairKindOf(s))]);
    c.products?.set(s.stairId, stair);
    st.contained.push(stair);
    const flightMaterial = type?.materialId || (c.p.materials['mat_concreto'] ? 'mat_concreto' : '');
    const flights = s.flights.map((f) => {
      const fPlace = localPlacement(c.w, st.place, [0, 0, 0]);
      const shape = prismsShape(c.w, c.ctx, f.pieces, st.elev, langOf(c));
      const treadLength = flightTreadLength(f);
      const flight = c.w.add('IFCSTAIRFLIGHT', [
        gid(`flight:${s.stairId}:${f.componentIndex}`),
        OMIT,
        stepString(t(langOf(c), 'io_ifc_name_flight', { name, n: f.componentIndex })),
        OMIT,
        OMIT,
        ref(fPlace),
        ref(shape),
        OMIT,
        int(f.risers),
        int(f.treads),
        s.riserHeight > 0 ? num(s.riserHeight) : OMIT,
        treadLength !== null && treadLength > 0 ? num(treadLength) : OMIT,
        en(s.spiral ? 'SPIRAL' : 'STRAIGHT'),
      ]);
      // O lance não tem camadas próprias: o material do tipo (concreto/aço) evita o branco padrão do visualizador.
      if (flightMaterial) c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:flight:${s.stairId}:${f.componentIndex}`), OMIT, OMIT, OMIT, list([ref(flight)]), ref(materialOf(c, flightMaterial))]);
      return flight;
    });
    if (flights.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`stairagg:${s.stairId}`), OMIT, OMIT, OMIT, ref(stair), list(flights.map(ref))]);
    s.landings.forEach((pr, i) => {
      plateEntity(c, st, {
        key: `landing:${s.stairId}:${i}`,
        name: t(langOf(c), 'io_ifc_name_landing', { name, n: i + 1 }),
        prisms: [pr],
        kind: 'LANDING',
        entity: 'IFCSLAB',
        layers: landingLayers(type, pr),
      });
    });
  }
}

/** Tipo do IFCRAMP pela forma e pelo número de lances. */
export function rampKindOf(shape: IfcRampGeo['shape'], flights: number): string {
  if (shape === 'lshape') return 'QUARTER_TURN_RAMP';
  if (shape === 'ushape') return 'HALF_TURN_RAMP';
  if (shape === 'straight' && flights === 1) return 'STRAIGHT_RUN_RAMP';
  if (shape === 'straight' && flights === 2) return 'TWO_STRAIGHT_RUN_RAMP';
  return 'NOTDEFINED';
}

/**
 * Rampas: IFCRAMP contido no pavimento de base, agregando um IFCRAMPFLIGHT por lance (prisma de topo inclinado) e um
 * IFCSLAB LANDING por patamar, contido no pavimento. O tipo do IFCRAMP segue a forma e o número de lances.
 */
export function addRamps(c: IfcCtx, geo: IfcGeometry): void {
  for (const r of geo.ramps ?? []) {
    const el = c.p.elements[r.rampId];
    const st = isRamp(el) ? storeyOf(c, el.levelId) : undefined;
    if (!isRamp(el) || !st) continue;
    const name = c.p.rampTypes[el.typeId]?.name ?? t(langOf(c), 'io_ifc_default_ramp');
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const ramp = c.w.add('IFCRAMP', [gid(`ramp:${r.rampId}`), OMIT, stepString(name), OMIT, OMIT, ref(place), OMIT, OMIT, en(rampKindOf(r.shape, r.flights.length))]);
    st.contained.push(ramp);
    const flights = r.flights.map((f) => {
      const fPlace = localPlacement(c.w, st.place, [0, 0, 0]);
      const shape = prismsShape(c.w, c.ctx, [f.prism], st.elev, langOf(c));
      return c.w.add('IFCRAMPFLIGHT', [
        gid(`rampflight:${r.rampId}:${f.componentIndex}`),
        OMIT,
        stepString(t(langOf(c), 'io_ifc_name_flight', { name, n: f.componentIndex })),
        OMIT,
        OMIT,
        ref(fPlace),
        ref(shape),
        OMIT,
        en('STRAIGHT'),
      ]);
    });
    if (flights.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`rampagg:${r.rampId}`), OMIT, OMIT, OMIT, ref(ramp), list(flights.map(ref))]);
    r.landings.forEach((pr, i) => {
      plateEntity(c, st, {
        key: `landing:${r.rampId}:${i}`,
        name: t(langOf(c), 'io_ifc_name_landing', { name, n: i + 1 }),
        prisms: [pr],
        kind: 'LANDING',
        entity: 'IFCSLAB',
        layers: [],
      });
    });
  }
}
