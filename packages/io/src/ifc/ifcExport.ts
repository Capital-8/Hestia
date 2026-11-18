import {
  isCurtainType,
  isOpening,
  isWall,
  levelElevation,
  openingFamilyName,
  openingHeight,
  openingRough,
  openingTypeById,
  profileHeightAt,
  validateOpeningShape,
  type Project,
  type Wall,
  type WallType,
} from '@hestia/model';
import { addOpeningProfile } from './ifcOpeningProfile.ts';
import { addOpeningQto } from './ifcOpeningLining.ts';
import { openingPartSolid } from './ifcOpeningParts.ts';
import { addPlates, addRamps, addRoofs, addStairs } from './ifcElements.ts';
import { addStructural } from './ifcStructural.ts';
import { addCurtainWalls, avisoCortinaSemKernel, footprintsDaCortina } from './ifcCurtainWall.ts';
import { addRailings } from './ifcGuardaCorpo.ts';
import { addMasses } from './ifcMassa.ts';
import { addGenerics } from './ifcGeneric.ts';
import { addHestiaPsets } from './ifcHestia.ts';
import { addPropertySet, type PropValue } from './ifcProperties.ts';
import { externalWalls, outwardNormal, wallAxis } from './ifcExterior.ts';
import { addGrids } from './ifcGrids.ts';
import { addQuantities } from './ifcQuantities.ts';
import { addSpaces } from './ifcSpaces.ts';
import { addItemStyles, addStyles } from './ifcStyles.ts';
import { addTypeRelations, doorOperationOf, doorPredefinedType, openingCommonProps, openingGlazingProps, openingTypeEntity, windowPanels, windowPartitionOf } from './ifcOpeningTypes.ts';
export { doorOperation, doorOperationOf, glazingAreaFraction, windowLeafOperation, windowOperation, windowPartition, windowPartitionOf } from './ifcOpeningTypes.ts';
import { gid, langOf, materialOf, optStr, storeyOf, type IfcCtx, type IfcStorey } from './ifcCtx.ts';
import { axis3, bodyShape, direction, extrudeSolid, localPlacement, rectOf, tiltBrepSolid, tiltExtrudeSolid } from './ifcSolids.ts';
import { en, list, num, OMIT, ref, StepWriter, stepString } from './ifcStep.ts';
import type { IfcGeometry, IfcOpeningGeo, IfcPoint, IfcPolygon, IfcWallGeo } from './ifcTypes.ts';
import { t, type Lang } from '../i18n.ts';

const EPS = 1e-9;

/** Opções da exportação. A data do cabeçalho entra como texto: com a mesma data o arquivo sai igual (determinismo). */
export interface IfcExportOptions {
  /** Data e hora do cabeçalho STEP (ISO 8601). Padrão: 1970-01-01T00:00:00. */
  timestamp?: string;
  /** Idioma dos nomes padrão gravados no arquivo; padrão `'pt'` (comportamento anterior). */
  lang?: Lang;
  /** Recebe os avisos de exportação (uma frase por ocorrência, no idioma da exportação). Ausente = nenhum aviso é coletado. */
  avisos?: string[];
}

/** Retângulo `width` × `thickness` centrado na origem do sistema local (x ao longo do eixo do vão, y na espessura). */

/** Direção unitária do eixo da parede (a→b); comprimento zero devolve `null`. */
function layerSetOf(c: IfcCtx, type: WallType): number | null {
  const known = c.layerSets.get(type.id);
  if (known !== undefined) return known;
  const layers = type.layers.filter((l) => l.thickness > 0);
  if (layers.length === 0) return null;
  const layerIds = layers.map((l) => {
    const name = c.p.materials[l.materialId]?.name ?? t(langOf(c), 'io_ifc_material_undefined');
    return ref(c.w.add('IFCMATERIALLAYER', [ref(materialOf(c, l.materialId)), num(l.thickness), OMIT, stepString(name), OMIT, OMIT, OMIT]));
  });
  const set = c.w.add('IFCMATERIALLAYERSET', [list(layerIds), stepString(type.name), OMIT]);
  c.layerSets.set(type.id, set);
  return set;
}

/** `IFCMATERIALLAYERSETUSAGE` (.AXIS2./.POSITIVE., deslocamento 0) da parede + `IFCRELASSOCIATESMATERIAL` com ela. */
function associateLayers(c: IfcCtx, wall: Wall, type: WallType | undefined, wallId: number): void {
  if (!type) return;
  const set = layerSetOf(c, type);
  if (set === null) return;
  const usage = c.w.add('IFCMATERIALLAYERSETUSAGE', [ref(set), en('AXIS2'), en('POSITIVE'), num(0), OMIT]);
  c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`matuse:${wall.id}`), OMIT, OMIT, OMIT, list([ref(wallId)]), ref(usage)]);
}

/**
 * `Pset_WallCommon` da parede: `Reference` (código ou nome do tipo), `IsExternal`, `LoadBearing` (o modelo não tem
 * flag estrutural: sempre `.F.`) e, quando o tipo informa, `FireRating`, `ThermalTransmittance` e `AcousticRating`.
 */
function wallCommonProps(c: IfcCtx, wall: Wall, type: WallType | undefined): Array<[string, PropValue]> {
  const reference = type?.code.trim() || type?.name || wall.mark;
  const props: Array<[string, PropValue]> = [];
  if (reference) props.push(['Reference', reference]);
  props.push(['IsExternal', c.external.has(wall.id)], ['LoadBearing', false]);
  if (type?.fireRating != null) props.push(['FireRating', `${type.fireRating} min`]);
  if (type?.thermalU != null) props.push(['ThermalTransmittance', type.thermalU]);
  if (type?.acousticRw != null) props.push(['AcousticRating', `${type.acousticRw} dB`]);
  return props;
}

/** Pontos `(t, h)` do topo entre `tMin` e `tMax`: os vértices do perfil dentro do trecho e as pontas já na altura dele. */
function topProfileWithin(profile: NonNullable<Wall['topProfile']>, tMin: number, tMax: number): Array<{ t: number; h: number }> {
  const inner = profile.filter((q) => q.t > tMin + EPS && q.t < tMax - EPS);
  return [{ t: tMin, h: profileHeightAt(profile, tMin) }, ...inner, { t: tMax, h: profileHeightAt(profile, tMax) }];
}

/** Remove pontos 2D consecutivos repetidos (e o de fechamento) da polilinha do perfil. */
function clean2d(points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const q of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - q[0]) < EPS && Math.abs(last[1] - q[1]) < EPS) continue;
    out.push([q[0], q[1]]);
  }
  return out;
}

/**
 * Corpo da parede com perfil superior editado (`Wall.topProfile`): `IFCARBITRARYCLOSEDPROFILEDEF` no plano longitudinal
 * (x ao longo do eixo, y altura acima da base) extrudado na espessura do footprint. É o perfil do topo (empena, degrau)
 * que a extrusão de altura constante não representa. O trecho longitudinal é o do footprint (as pontas já vêm cortadas
 * pela junção); entre as pontas o plano vira o retângulo espessura × comprimento, então só parede reta usa este caminho.
 */
function topProfileSolid(c: IfcCtx, st: IfcStorey, wall: Wall, g: IfcWallGeo, footprint: IfcPolygon): number | null {
  const u = wallAxis(wall);
  const profile = wall.topProfile;
  const ring = footprint[0];
  if (!u || !profile || profile.length < 2 || !ring || ring.length < 3) return null;
  const n = outwardNormal(wall, u);
  let tMin = Infinity;
  let tMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const ringPoints of footprint) {
    for (const v of ringPoints) {
      const t = (v.x - wall.a.x) * u.x + (v.y - wall.a.y) * u.y;
      const d = (v.x - wall.a.x) * n.x + (v.y - wall.a.y) * n.y;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
      dMin = Math.min(dMin, d);
      dMax = Math.max(dMax, d);
    }
  }
  const length = tMax - tMin;
  const depth = dMax - dMin;
  if (length <= EPS || depth <= EPS) return null;
  const top = topProfileWithin(profile, tMin, tMax);
  // Contorno no sentido anti-horário: pé esquerdo, pé direito, topo da direita para a esquerda.
  const poly = clean2d([[0, 0], [length, 0], ...[...top].reverse().map((q): [number, number] => [q.t - tMin, q.h])]);
  if (poly.length < 3) return null;
  const points = poly.map(([x, y]) => ref(c.w.add('IFCCARTESIANPOINT', [list([num(x), num(y)])])));
  const curve = c.w.add('IFCPOLYLINE', [list([...points, points[0]!])]);
  const area = c.w.add('IFCARBITRARYCLOSEDPROFILEDEF', [en('AREA'), OMIT, ref(curve)]);
  // Origem na face externa, X ao longo da parede e Z para dentro (o perfil cresce no sentido da espessura).
  const origin = c.w.add('IFCCARTESIANPOINT', [
    list([num(wall.a.x + u.x * tMin + n.x * dMax), num(wall.a.y + u.y * tMin + n.y * dMax), num(g.baseZ - st.elev)]),
  ]);
  const place = c.w.add('IFCAXIS2PLACEMENT3D', [ref(origin), ref(direction(c.w, -n.x, -n.y, 0)), ref(direction(c.w, u.x, u.y, 0))]);
  return c.w.add('IFCEXTRUDEDAREASOLID', [ref(area), ref(place), ref(direction(c.w, 0, 0, 1)), num(depth)]);
}

/** Corpo da parede: perfil superior quando há `topProfile` em parede reta; senão a extrusão de altura constante. */
function wallSolids(c: IfcCtx, st: IfcStorey, wall: Wall, g: IfcWallGeo): number[] {
  const profiled = !g.tilt && wall.topProfile && wall.sag === 0 ? g.footprints.map((f) => topProfileSolid(c, st, wall, g, f)).filter((s): s is number => s !== null) : [];
  if (profiled.length > 0) return profiled;
  const [z, k] = [g.baseZ - st.elev, g.tilt];
  return g.footprints.map((f) => (!k ? extrudeSolid(c.w, f, z, g.height) : k.straight ? tiltExtrudeSolid(c.w, f, k.map, z, g.height) : tiltBrepSolid(c.w, f, k.map, z, g.height, langOf(c), k.zs)));
}

/** Paredes: IFCWALL com contorno extrudado, camadas do tipo (`IFCMATERIALLAYERSETUSAGE`) e `Pset_WallCommon`. */
function addWalls(c: IfcCtx, walls: readonly IfcWallGeo[]): void {
  for (const g of walls) {
    const wall = c.p.elements[g.wallId];
    if (!isWall(wall)) continue;
    const st = storeyOf(c, wall.levelId);
    if (!st || g.footprints.length === 0) continue;
    const type = c.p.wallTypes[wall.typeId];
    // Cortina sem geometria do kernel: sai como parede genérica (IFCWALL) e o aviso diz por quê.
    if (isCurtainType(type)) avisoCortinaSemKernel(c, wall.mark || type.name);
    const name = stepString(type?.name ?? t(langOf(c), 'io_ifc_default_wall'));
    const solids = wallSolids(c, st, wall, g);
    if (solids.length === 0) continue;
    const shape = bodyShape(c.w, c.ctx, g.tilt && !g.tilt.straight ? 'Brep' : 'SweptSolid', solids);
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const id = c.w.add('IFCWALL', [gid(`wall:${g.wallId}`), OMIT, name, OMIT, name, ref(place), ref(shape), optStr(wall.mark), en('STANDARD')]);
    c.walls.set(g.wallId, id);
    st.contained.push(id);
    associateLayers(c, wall, type, id);
    addPropertySet(c, `pset:wall:${g.wallId}`, 'Pset_WallCommon', wallCommonProps(c, wall, type), id);
  }
}

/**
 * Vazio retangular do vão bruto (o de sempre): cortador `rough` + 1 cm por face, no vão bruto. `place` é chamado só depois
 * de o sólido existir, para manter a mesma ordem de entidades (e o mesmo texto STEP) do caminho retangular.
 */
function rectVoid(c: IfcCtx, g: IfcOpeningGeo, name: string, place: () => number, roughHeight: number): number {
  const voidSolid = extrudeSolid(c.w, rectOf(g.roughWidth, g.thickness + 0.02), 0, roughHeight);
  const voidShape = bodyShape(c.w, c.ctx, 'SweptSolid', [voidSolid]);
  return c.w.add('IFCOPENINGELEMENT', [gid(`void:${g.openingId}`), OMIT, stepString(name), OMIT, OMIT, ref(place()), ref(voidShape), OMIT, en('OPENING')]);
}

/**
 * Vãos: IFCOPENINGELEMENT (furo do vão bruto, ligado à parede por IFCRELVOIDSELEMENT) e a porta ou janela que o preenche
 * (IFCDOOR/IFCWINDOW por IFCRELFILLSELEMENT). Porta e janela têm placement no vão (eixo X = direção da parede) e um
 * corpo de caixa com a espessura da parede; o furo tem a cota do vão bruto. Cada abertura recebe o tipo do projeto
 * (`IFCDOORTYPE`/`IFCWINDOWTYPE`) e o pset comum.
 */
function addOpenings(c: IfcCtx, openings: readonly IfcOpeningGeo[]): void {
  for (const g of openings) {
    const o = c.p.elements[g.openingId];
    if (!isOpening(o)) continue;
    const host = c.p.elements[o.hostId];
    const wallId = isWall(host) ? c.walls.get(host.id) : undefined;
    const st = isWall(host) ? storeyOf(c, host.levelId) : undefined;
    const t = openingTypeById(c.p, o.typeId);
    if (wallId === undefined || !st || !t) continue;
    const axis: IfcPoint = g.u;
    const atZ = (z: number): ReturnType<typeof localPlacement> => localPlacement(c.w, st.place, [g.center.x, g.center.y, z], axis);
    // Altura efetiva da instância (override ou tipo) governa o furo e a esquadria; o vão bruto mantém a folga do tipo.
    const height = openingHeight(t, o);
    const roughHeight = openingRough({ ...t, height }).height;
    // O cortador atravessa a parede 1 cm para cada lado: as faces laterais não ficam coplanares com as faces da parede,
    // que é o caso clássico de CSG com arestas soltas no web-ifc. O furo na face continua com o vão bruto.
    // Vão com forma (arco, ogival, círculo): o vazio segue o contorno, no peitoril. Forma inválida cai no retângulo.
    const voidId =
      g.forma && validateOpeningShape(g.forma).length === 0
        ? addOpeningProfile(c.w, c.ctx, atZ(g.sillZ - st.elev), `void:${g.openingId}`, t.name, g.forma, { thickness: g.thickness }).opening
        : rectVoid(c, g, t.name, () => atZ(g.roughBottomZ - st.elev), roughHeight);
    c.w.add('IFCRELVOIDSELEMENT', [gid(`rvoid:${g.openingId}`), OMIT, OMIT, OMIT, ref(wallId), ref(voidId)]);
    // Esquadria detalhada do modelo único (batente, folha, vidro, montante, maçaneta...). Cada peça é um sólido com o
    // seu `IFCSTYLEDITEM`; o vidro usa o material transparente do projeto. Sem `parts` (contrato antigo), mantém o corpo
    // único de compatibilidade. `parts: []` (vão livre sem folha) não escreve corpo: o furo da parede já é o vão.
    const items: number[] = [];
    if (g.parts !== undefined) {
      for (const part of g.parts) {
        if (!(part.t1 - part.t0 > EPS && part.s1 - part.s0 > EPS && part.z1 - part.z0 > EPS)) continue;
        materialOf(c, part.materialId);
        const solid = openingPartSolid(c.w, part);
        c.itemStyles?.push({ item: solid, materialId: part.materialId });
        items.push(solid);
      }
    } else {
      materialOf(c, t.frameMaterialId);
      const body = extrudeSolid(c.w, rectOf(g.width, g.thickness), 0, height);
      c.itemStyles?.push({ item: body, materialId: t.frameMaterialId });
      items.push(body);
    }
    const shape = items.length > 0 ? bodyShape(c.w, c.ctx, 'SweptSolid', items) : null;
    const family = stepString(openingFamilyName(t) ?? t.name);
    const name = stepString(t.name);
    // Porta: operação e `UserDefinedOperationType` (só o `PIVOT`); janela: divisão de painéis e o rótulo `USERDEFINED`.
    const fillId =
      o.kind === 'door'
        ? (() => {
            const operation = doorOperationOf(t, o.flipHand);
            return c.w.add('IFCDOOR', [gid(`door:${g.openingId}`), OMIT, name, OMIT, family, ref(atZ(g.sillZ - st.elev)), shape === null ? OMIT : ref(shape), optStr(o.mark), num(height), num(g.width), en(doorPredefinedType(t)), en(operation.operation), optStr(operation.userDefined)]);
          })()
        : (() => {
            const partition = windowPartitionOf(t);
            return c.w.add('IFCWINDOW', [gid(`window:${g.openingId}`), OMIT, name, OMIT, family, ref(atZ(g.sillZ - st.elev)), shape === null ? OMIT : ref(shape), optStr(o.mark), num(height), num(g.width), en('WINDOW'), en(partition.partition), optStr(partition.userDefined)]);
          })();
    st.contained.push(fillId);
    c.w.add('IFCRELFILLSELEMENT', [gid(`rfill:${g.openingId}`), OMIT, OMIT, OMIT, ref(voidId), ref(fillId)]);
    addOpeningQto(c, g, t, fillId);
    // Material de fallback na instância: o web-ifc 0.0.78 ainda não propaga a associação do tipo para a ocorrência.
    // As peças com IFCSTYLEDITEM continuam com a cor específica; sem elas, a esquadria sai no material do batente.
    c.w.add('IFCRELASSOCIATESMATERIAL', [gid(`mat:${o.kind}:${g.openingId}`), OMIT, OMIT, OMIT, list([ref(fillId)]), ref(materialOf(c, t.frameMaterialId))]);
    if (o.kind === 'window') {
      // O atributo Operation do IFC4 fica no IFCWINDOWPANELPROPERTIES, não no IFCWINDOW: um painel por folha.
      const panels = windowPanels(c, t, o.flipHand, `winpanel:${g.openingId}`);
      c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`winpanelrel:${g.openingId}`), OMIT, OMIT, OMIT, list([ref(fillId)]), list(panels.map(ref))]);
    }
    openingTypeEntity(c, t);
    const members = c.openingTypeMembers.get(t.id);
    if (members) members.push(fillId);
    else c.openingTypeMembers.set(t.id, [fillId]);
    const external = isWall(host) && c.external.has(host.id);
    addPropertySet(c, `pset:${o.kind}:${g.openingId}`, o.kind === 'door' ? 'Pset_DoorCommon' : 'Pset_WindowCommon', openingCommonProps(o, t, external), fillId);
    addPropertySet(c, `pset:glazing:${g.openingId}`, 'Pset_DoorWindowGlazingType', openingGlazingProps(t), fillId);
  }
  addTypeRelations(c);
}

/**
 * Materiais citados por tipos que não escrevem `IFCMATERIAL` por conta própria: esquadrias (batente e vidro de cada
 * tipo de abertura) e tipos de piso, laje, forro, telhado e escada (camadas e material estrutural). Só entram no arquivo
 * para receberem estilo; nenhuma geometria é escrita aqui.
 */
function registerTypeMaterials(c: IfcCtx): void {
  for (const t of Object.values(c.p.openingTypes)) {
    materialOf(c, t.frameMaterialId);
    materialOf(c, t.glassMaterialId);
  }
  for (const types of [c.p.floorTypes, c.p.slabTypes, c.p.ceilingTypes, c.p.roofTypes]) {
    for (const t of Object.values(types)) {
      for (const layer of t.layers) materialOf(c, layer.materialId);
    }
  }
  for (const t of Object.values(c.p.stairTypes)) materialOf(c, t.materialId);
}

/** Exporta o projeto como IFC4 (texto STEP): IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey (um por nível) e os elementos. */
export { externalWalls } from './ifcExterior.ts';

export function exportIfc(p: Project, geo: IfcGeometry, opts: IfcExportOptions = {}): string {
  const lang = opts.lang ?? 'pt';
  const w = new StepWriter();
  const lengthUnit = w.add('IFCSIUNIT', ['*', en('LENGTHUNIT'), OMIT, en('METRE')]);
  const areaUnit = w.add('IFCSIUNIT', ['*', en('AREAUNIT'), OMIT, en('SQUARE_METRE')]);
  const volumeUnit = w.add('IFCSIUNIT', ['*', en('VOLUMEUNIT'), OMIT, en('CUBIC_METRE')]);
  const angleUnit = w.add('IFCSIUNIT', ['*', en('PLANEANGLEUNIT'), OMIT, en('RADIAN')]);
  const units = w.add('IFCUNITASSIGNMENT', [list([lengthUnit, areaUnit, volumeUnit, angleUnit].map(ref))]);
  const world = axis3(w, [0, 0, 0]);
  // Norte verdadeiro: o modelo ainda não tem georreferência, então (0, 1) é o norte do mundo.
  const trueNorth = w.add('IFCDIRECTION', [list([num(0), num(1)])]);
  const context = w.add('IFCGEOMETRICREPRESENTATIONCONTEXT', [OMIT, "'Model'", '3', num(1e-5), ref(world), ref(trueNorth)]);
  const project = w.add('IFCPROJECT', [gid('project'), OMIT, stepString(p.name), OMIT, OMIT, OMIT, OMIT, list([ref(context)]), ref(units)]);
  const sitePlace = localPlacement(w, null, [0, 0, 0]);
  const site = w.add('IFCSITE', [gid('site'), OMIT, stepString(p.name), OMIT, OMIT, ref(sitePlace), OMIT, OMIT, en('ELEMENT'), OMIT, OMIT, OMIT, OMIT, OMIT]);
  const buildingPlace = localPlacement(w, sitePlace, [0, 0, 0]);
  const building = w.add('IFCBUILDING', [gid('building'), OMIT, stepString(p.name), OMIT, OMIT, ref(buildingPlace), OMIT, OMIT, en('ELEMENT'), OMIT, OMIT, OMIT]);
  const c: IfcCtx = {
    p,
    w,
    ctx: context,
    lang,
    storeys: new Map(),
    materials: new Map(),
    walls: new Map(),
    layerSets: new Map(),
    openingTypes: new Map(),
    openingTypeMembers: new Map(),
    external: externalWalls(p, [...geo.walls, ...footprintsDaCortina(geo)]),
    styles: new Map(),
    itemStyles: [],
    ...(opts.avisos ? { avisos: opts.avisos } : {}),
  };
  const storeyIds: number[] = [];
  for (const lv of p.levels) {
    const elev = levelElevation(p, lv.id);
    const place = localPlacement(w, buildingPlace, [0, 0, elev]);
    const id = w.add('IFCBUILDINGSTOREY', [gid(`storey:${lv.id}`), OMIT, stepString(lv.name), OMIT, OMIT, ref(place), OMIT, OMIT, en('ELEMENT'), num(elev)]);
    c.storeys.set(lv.id, { id, place, elev, contained: [] });
    storeyIds.push(id);
  }
  w.add('IFCRELAGGREGATES', [gid('agg:project'), OMIT, OMIT, OMIT, ref(project), list([ref(site)])]);
  w.add('IFCRELAGGREGATES', [gid('agg:site'), OMIT, OMIT, OMIT, ref(site), list([ref(building)])]);
  if (storeyIds.length > 0) w.add('IFCRELAGGREGATES', [gid('agg:building'), OMIT, OMIT, OMIT, ref(building), list(storeyIds.map(ref))]);
  addWalls(c, geo.walls);
  if (geo.curtains) addCurtainWalls(c, geo.curtains);
  addOpenings(c, geo.openings);
  addPlates(c, geo);
  addRoofs(c, geo);
  addStairs(c, geo);
  addRamps(c, geo);
  addStructural(c);
  addRailings(c, geo);
  addMasses(c, geo);
  addGenerics(c); addSpaces(c);
  addGrids(c);
  addQuantities(c, geo);
  addHestiaPsets(c);
  for (const lv of p.levels) {
    const st = c.storeys.get(lv.id);
    if (st && st.contained.length > 0) {
      w.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', [gid(`contain:${lv.id}`), OMIT, OMIT, OMIT, list(st.contained.map(ref)), ref(st.id)]);
    }
  }
  // Estilos por último: os materiais das esquadrias e dos tipos sem geometria própria entram só para receber cor.
  registerTypeMaterials(c);
  addStyles(c);
  addItemStyles(c);
  return w.text({ fileName: `${p.name}.ifc`, timestamp: opts.timestamp ?? '1970-01-01T00:00:00' });
}
