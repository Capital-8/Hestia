// NOTA (lane C): este módulo lê os quantitativos do MOTOR. O `docs/01 §1` proíbe `io → engine`; a chamada foi pedida
// assim para os números não virem da malha. Se a fronteira tiver de ser mantida, mover o cálculo para `apps/web` e passar
// os quantitativos já resolvidos (o `IfcGeometry` é montado lá).
import { isCeiling, type Id } from '@hestia/model';
import {
  quantifyCeilings,
  quantifyFloors,
  quantifyLevel,
  quantifyRoofs,
  quantifySlabs,
  resolveLevel,
  resolveStairs,
  stairQuantities,
} from '@hestia/engine';
import { gid, type IfcCtx } from './ifcCtx.ts';
import { ifcGuid } from './ifcGuid.ts';
import { list, num, OMIT, ref, stepString } from './ifcStep.ts';
import type { IfcGeometry } from './ifcTypes.ts';

/** Classe STEP de `IfcPhysicalSimpleQuantity` que escreve cada medida. */
type Quantity = [kind: 'length' | 'area' | 'volume' | 'count', name: string, value: number];

const QUANTITY_TYPE: Record<Quantity[0], string> = {
  length: 'IFCQUANTITYLENGTH',
  area: 'IFCQUANTITYAREA',
  volume: 'IFCQUANTITYVOLUME',
  count: 'IFCQUANTITYCOUNT',
};

/**
 * Índice `GlobalId → #n` do STEP já escrito. O `IfcCtx` só guarda o id das paredes; pisos, lajes, forros, telhados e
 * escadas são localizados pelo GlobalId determinístico que o exportador escreveu (`floor:`, `slab:`, `ceiling:`,
 * `roof:`, `stair:`). GlobalId é sempre o primeiro atributo das entidades com raiz; o filtro de 22 caracteres ignora as
 * demais (pontos, curvas, relações sem raiz não entram porque não começam com um GlobalId).
 */
function entitiesByGuid(c: IfcCtx): Map<string, number> {
  const text = c.w.text({ fileName: 'index', timestamp: '1970-01-01T00:00:00' });
  const out = new Map<string, number>();
  for (const m of text.matchAll(/^#(\d+)=[A-Z0-9]+\('([0-9A-Za-z_$]{22})'/gm)) out.set(m[2]!, Number(m[1]));
  return out;
}

/** `IFCELEMENTQUANTITY` (`Qto_*BaseQuantities`) com as quantidades finitas, ligado ao elemento por `IFCRELDEFINESBYPROPERTIES`. */
export function addSet(c: IfcCtx, key: string, setName: string, objectId: number, quantities: readonly Quantity[]): void {
  const values: number[] = [];
  for (const [kind, name, value] of quantities) {
    if (!Number.isFinite(value)) continue;
    values.push(c.w.add(QUANTITY_TYPE[kind], [stepString(name), OMIT, OMIT, num(value), OMIT]));
  }
  if (values.length === 0) return;
  const set = c.w.add('IFCELEMENTQUANTITY', [gid(`qto:${key}`), OMIT, stepString(setName), OMIT, OMIT, list(values.map(ref))]);
  c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`qto:${key}:rel`), OMIT, OMIT, OMIT, list([ref(objectId)]), ref(set)]);
}

/** Espessura total do tipo de parede (m): a largura que o IFC espera em `Width`. */
const wallWidth = (c: IfcCtx, typeId: Id): number => (c.p.wallTypes[typeId]?.layers ?? []).reduce((s, l) => s + l.thickness, 0);

/** Comprimento horizontal desenvolvido da escada (m): soma dos pisos dos lances (médio × nº de degraus). */
const stairLength = (runs: readonly { treadMean: number; treadCount: number }[]): number =>
  runs.reduce((s, r) => s + r.treadMean * r.treadCount, 0);

/**
 * Quantitativos dos elementos já escritos, SEMPRE os do MOTOR (nunca medidos na malha): paredes (`quantifyLevel`),
 * pisos (`quantifyFloors`), lajes (`quantifySlabs`), forros (`quantifyCeilings`), telhados (`quantifyRoofs`) e escadas
 * (`stairQuantities`). Cada conjunto sai como `Qto_*BaseQuantities` ligado ao elemento por `IFCRELDEFINESBYPROPERTIES`,
 * com GlobalId `qto:<tipo>:<id>`. Só entra a quantidade que o motor tem: valor ausente não é inventado.
 *
 * Deve ser chamado DEPOIS dos elementos: o vínculo acha o `#n` pelo GlobalId já escrito. Ambiente fica em `addSpaces`
 * (`Qto_SpaceBaseQuantities`). Forro só recebe quantitativos quando lane de forro já escreveu `IFCCOVERING`.
 */
export function addQuantities(c: IfcCtx, geo: IfcGeometry): void {
  const byGuid = entitiesByGuid(c);
  // Fonte preferida: o mapa de produtos do contexto (quando o integrador o preenche); senão, o mapa de paredes e o
  // GlobalId já escrito.
  const productOf = (id: Id, key: string): number | undefined => c.products?.get(id) ?? c.walls.get(id) ?? byGuid.get(ifcGuid(key));
  const exported = {
    floors: new Set(geo.floors.map((f) => f.floorId)),
    slabs: new Set(geo.slabs.map((s) => s.slabId)),
    roofs: new Set(geo.roofs.map((r) => r.roofId)),
    stairs: new Set(geo.stairs.map((s) => s.stairId)),
  };

  for (const level of c.p.levels) {
    const levelId = level.id;
    // Paredes: o mapa do exportador dá o #n direto.
    for (const wq of quantifyLevel(c.p, resolveLevel(c.p, levelId)).walls) {
      const objectId = productOf(wq.wallId, `wall:${wq.wallId}`);
      const wall = c.p.elements[wq.wallId];
      if (objectId === undefined || !wall || wall.kind !== 'wall') continue;
      addSet(c, `wall:${wq.wallId}`, 'Qto_WallBaseQuantities', objectId, [
        ['length', 'Length', wq.length],
        ['length', 'Height', wq.height],
        ['length', 'Width', wallWidth(c, wall.typeId)],
        ['area', 'GrossSideArea', wq.grossFaceArea],
        ['area', 'NetSideArea', wq.netFaceArea],
        ['volume', 'GrossVolume', wq.grossVolume],
        ['volume', 'NetVolume', wq.volume],
      ]);
    }

    // Pisos e lajes: IFCSLAB; a GlobalId diz se o elemento foi escrito.
    for (const fq of quantifyFloors(c.p, levelId).floors) {
      if (!exported.floors.has(fq.floorId)) continue;
      const objectId = productOf(fq.floorId, `floor:${fq.floorId}`);
      if (objectId === undefined) continue;
      addSet(c, `floor:${fq.floorId}`, 'Qto_SlabBaseQuantities', objectId, [
        ['area', 'GrossArea', fq.area],
        ['area', 'NetArea', fq.netArea],
        ['volume', 'GrossVolume', fq.grossVolume],
        ['volume', 'NetVolume', fq.volume],
        ['length', 'Thickness', fq.thickness],
      ]);
    }
    for (const sq of quantifySlabs(c.p, levelId).slabs) {
      if (!exported.slabs.has(sq.slabId)) continue;
      const objectId = productOf(sq.slabId, `slab:${sq.slabId}`);
      if (objectId === undefined) continue;
      // A laje do motor não expõe volume bruto: sai só o líquido.
      addSet(c, `slab:${sq.slabId}`, 'Qto_SlabBaseQuantities', objectId, [
        ['area', 'GrossArea', sq.faceArea],
        ['area', 'NetArea', sq.planArea],
        ['volume', 'NetVolume', sq.volume],
        ['length', 'Thickness', sq.thickness],
      ]);
    }

    // Forros: o lane de forro ainda não escreve IFCCOVERING; quando escrever, o vínculo acha a entidade pelo GlobalId.
    for (const cq of quantifyCeilings(c.p, levelId).ceilings) {
      const element = c.p.elements[cq.ceilingId];
      if (!isCeiling(element)) continue;
      const objectId = productOf(cq.ceilingId, `ceiling:${cq.ceilingId}`);
      if (objectId === undefined) continue;
      addSet(c, `ceiling:${cq.ceilingId}`, 'Qto_CeilingBaseQuantities', objectId, [
        ['area', 'GrossArea', cq.area],
        ['area', 'NetArea', cq.area],
        ['volume', 'NetVolume', cq.volume],
        ['length', 'Thickness', cq.thickness],
      ]);
    }

    // Telhados: área real (águas inclinadas), área projetada em planta e volume vertical das camadas.
    for (const rq of quantifyRoofs(c.p, levelId).roofs) {
      if (!exported.roofs.has(rq.roofId)) continue;
      const objectId = productOf(rq.roofId, `roof:${rq.roofId}`);
      if (objectId === undefined) continue;
      addSet(c, `roof:${rq.roofId}`, 'Qto_RoofBaseQuantities', objectId, [
        ['area', 'GrossArea', rq.faceArea],
        ['area', 'ProjectedArea', rq.planArea],
        ['volume', 'GrossVolume', rq.volume],
        ['length', 'Thickness', rq.thickness],
      ]);
    }
  }

  // Escadas: contagens e comprimento desenvolvido, do motor (não do corpo da malha).
  for (const stair of resolveStairs(c.p)) {
    if (!exported.stairs.has(stair.id)) continue;
    const sq = stairQuantities(stair);
    const element = c.p.elements[stair.id];
    if (!element || element.kind !== 'stair') continue;
    const objectId = productOf(stair.id, `stair:${stair.id}`);
    if (objectId === undefined) continue;
    addSet(c, `stair:${stair.id}`, 'Qto_StairBaseQuantities', objectId, [
      ['count', 'NumberOfRisers', sq.riserCount],
      ['count', 'NumberOfTreads', sq.treadCount],
      ['length', 'Length', stairLength(sq.runs)],
    ]);
  }
}
