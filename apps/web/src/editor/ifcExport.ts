import { union, type MultiPolygon } from '@hestia/geom';
import {
  servicoGuardaCorpo,
  ServicoGuardaCorpo,
  buildOpeningModel,
  frameOfWall,
  junctionLevel,
  openingGeometry,
  resolveFloors,
  resolveCeilings,
  resolveLevel,
  resolveRamps,
  resolveRoofs,
  resolveSlabs,
  resolveStairs,
  roofThickness,
  rampBody,
  stairArrivalTopZ,
  stairBody,
  paredesCortina,
  pointAt,
  servicoCortina,
  temCortina,
  zDaCortina,
  type OpeningGeometry,
  type PartMaterial,
  type ResolvedRamp,
  type ResolvedStair,
} from '@hestia/engine';
import {
  exportIfc,
  type IfcCurtainGeo,
  type IfcCurtainPrototypeGeo,
  type IfcCurtainWallGeo,
  type IfcGeometry,
  type IfcGuardaCorpoGeo,
  type IfcOpeningPartGeo,
  type IfcPlane,
  type IfcPolygon,
  type IfcPrism,
  type IfcRampGeo,
  type IfcStairGeo,
  type IfcWallGeo,
} from '@hestia/io';
import { isOpening, isRamp, mullionTypesOf, openingSill, openingType, wallBaseElevation, wallHeight, type Id, type Opening, type OpeningType, type Project, type Wall } from '@hestia/model';
import { massesOf } from './ifcExportMassa.ts';
import { saveText } from './saveText.ts';
import { useI18n, type Lang } from './i18n.ts';

/** Cota constante (sem inclinação). */
const flatPlane = (z: number): IfcPlane => ({ a: 0, b: 0, c: z });

/** Plano da inclinação `percent` (%) com origem `origin` e direção `dir` (unitária), cota `z0` na origem. */
function slopePlane(z0: number, origin: { x: number; y: number }, dir: { x: number; y: number }, percent: number): IfcPlane {
  const k = percent / 100;
  return { a: k * dir.x, b: k * dir.y, c: z0 - k * (dir.x * origin.x + dir.y * origin.y) };
}

/** Polígonos de um MultiPolygon do engine (cada um é [contorno, ...furos]) como prismas com as mesmas faces. */
function prismsOf(m: MultiPolygon, top: IfcPlane, bottom: IfcPlane): IfcPrism[] {
  return m.map((polygon) => ({ polygon, top, bottom }));
}

/** Cotas de topo e fundo de uma camada inclinada: o fundo é o topo deslocado pela espessura vertical. */
function slabPlanes(topZ: number, bottomZ: number, slope: { origin: { x: number; y: number }; dir: { x: number; y: number }; percent: number } | null): [IfcPlane, IfcPlane] {
  const thickness = topZ - bottomZ;
  const top = slope ? slopePlane(topZ, slope.origin, slope.dir, slope.percent) : flatPlane(topZ);
  return [top, { ...top, c: top.c - thickness }];
}

/** Paredes do nível: união das camadas (sem os vãos) como contorno e a base e a altura resolvidas pelo engine. */
function wallsOfLevel(p: Project, levelId: Id): IfcGeometry['walls'] {
  const level = resolveLevel(p, levelId);
  return Object.values(level.walls).map((rw) => {
    const footprint = rw.layers.reduce<MultiPolygon>((acc, l) => union(acc, l.fragment), []);
    return { wallId: rw.wallId, footprints: footprint.map((poly) => poly as IfcPolygon), baseZ: rw.baseZ, height: rw.height };
  });
}

/** Material do projeto para o papel lógico da peça, o mesmo mapeamento do 3D (`openingParts.ts`). */
function partMaterialId(p: Project, t: OpeningType, material: PartMaterial): Id {
  if (material === 'glass') return t.glassMaterialId;
  if (material === 'concrete') return p.materials['mat_concreto'] ? 'mat_concreto' : t.frameMaterialId;
  if (material === 'metal') {
    if (p.materials['mat_aco']) return 'mat_aco';
    if (p.materials['mat_perfil']) return 'mat_perfil';
    return t.frameMaterialId;
  }
  // 'frame', 'leaf' e 'casing' usam o material do batente do tipo.
  return t.frameMaterialId;
}

/**
 * Peças da esquadria pelo modelo único do engine: batente, folha, vidro, montantes, maçaneta, alizar, peitoril e verga.
 * A cavidade de embutir (`pocket`) é um vazio dentro da parede, não um sólido: fica de fora. Peças degeneradas também.
 * O estado é sempre o fechado: o IFC guarda a esquadria montada, não a pose da vista 3D.
 */
function openingPartsOf(p: Project, o: Opening, g: OpeningGeometry, t: OpeningType, frame: NonNullable<ReturnType<typeof frameOfWall>>): IfcOpeningPartGeo[] {
  const maxHeight = wallHeight(p, p.elements[o.hostId] as Wall) - g.sill;
  const geom = maxHeight > 0 && g.height > maxHeight ? { ...g, height: maxHeight } : g;
  const model = buildOpeningModel(p, o, geom, frame);
  const out: IfcOpeningPartGeo[] = [];
  for (const part of model.parts) {
    // `pocket` é a cavidade dentro da parede; `dashed` é anotação (trilho do portão projetado para dentro da garagem);
    // `lintel`/`sillBeam` ficam embutidos no núcleo da parede e não têm face visível. Nada disso é sólido do corpo.
    if (part.role === 'pocket' || part.dashed || part.role === 'lintel' || part.role === 'sillBeam') continue;
    const b = part.box;
    if (!(b.t1 - b.t0 > 1e-6 && b.s1 - b.s0 > 1e-6 && b.z1 - b.z0 > 1e-6)) continue;
    out.push({ ...b, materialId: partMaterialId(p, t, part.material), role: part.role });
  }
  return out;
}

/** Vãos do projeto: centro, eixo e esquadria no plano da parede hospedeira (vão bruto e peitoril em cota absoluta). */
function openingsOf(p: Project): IfcGeometry['openings'] {
  const out: IfcGeometry['openings'] = [];
  for (const o of Object.values(p.elements)) {
    if (!isOpening(o)) continue;
    const host = p.elements[o.hostId] as Wall | undefined;
    const frame = host ? frameOfWall(p, host.id) : null;
    if (!host || !frame) continue;
    const t = openingType(p, o);
    const g = openingGeometry(p, o, frame);
    const baseZ = wallBaseElevation(p, host);
    const sillZ = baseZ + openingSill(t, o);
    out.push({
      openingId: o.id,
      center: { x: g.center.x, y: g.center.y },
      u: { x: g.u.x, y: g.u.y },
      width: g.width,
      height: g.height,
      roughWidth: g.roughWidth,
      roughHeight: g.roughHeight,
      roughBottomZ: sillZ - (g.roughHeight - g.height) / 2,
      sillZ,
      thickness: g.thickness,
      parts: openingPartsOf(p, o, g, t, frame),
    });
  }
  return out;
}

/** Escada resolvida em lances (degraus e chegada agrupados pelo lance) e patamares, com as contagens do lance. */
function stairOf(p: Project, s: ResolvedStair): IfcStairGeo {
  const arrival = stairArrivalTopZ(p, s);
  const { pieces } = stairBody(s, { arrivalTopZ: arrival ?? undefined });
  const prismOf = (pc: (typeof pieces)[number]): IfcPrism => ({
    polygon: [pc.polygon],
    top: flatPlane(pc.zTop),
    bottom: { a: pc.bottom.a, b: pc.bottom.b, c: pc.bottom.c },
  });
  const comps = [...new Set(pieces.filter((pc) => pc.kind !== 'landing').map((pc) => pc.componentIndex))].sort((x, y) => x - y);
  const flights = comps.map((componentIndex) => {
    const mine = pieces.filter((pc) => pc.kind !== 'landing' && pc.componentIndex === componentIndex);
    return {
      componentIndex,
      pieces: mine.map(prismOf),
      treads: mine.filter((pc) => pc.kind === 'tread').length,
      risers: s.risers.filter((r) => r.componentIndex === componentIndex).length,
    };
  });
  return {
    stairId: s.id,
    levelId: s.levelId,
    spiral: pieces.some((pc) => pc.kind === 'post'),
    riserHeight: s.riserHeight,
    flights,
    landings: pieces.filter((pc) => pc.kind === 'landing').map(prismOf),
  };
}


/** Pisos do nível com o contorno da região resolvida pela junção (F7.1): a região quando houve corte, senão o contorno. */
function resolveFloorsWithJunction(p: Project, levelId: Id) {
  const jl = junctionLevel(p, levelId);
  return resolveFloors(p, levelId).map((f) => {
    const el = jl.elements.get(f.floorId);
    return el?.cut ? { ...f, polygon: el.region } : f;
  });
}

/** Lajes do nível com o contorno da região resolvida pela junção (F7.1). */
function resolveSlabsWithJunction(p: Project, levelId: Id) {
  const jl = junctionLevel(p, levelId);
  return resolveSlabs(p, levelId).map((s) => {
    const el = jl.elements.get(s.slabId);
    return el?.cut ? { ...s, polygon: el.region } : s;
  });
}

/**
 * Geometria RESOLVIDA do projeto para o IFC (decisão 0020): paredes, vãos, pisos, lajes, telhados e escadas pelo mesmo
 * motor da planta e do DXF. O io não importa o engine, então a montagem fica aqui, no web.
 */
/** Rampa resolvida em lances (prismas de topo inclinado) e patamares, com o comprimento horizontal de cada lance. */
function rampOf(p: Project, rr: ResolvedRamp): IfcRampGeo {
  const { pieces } = rampBody(rr);
  const prismOf = (pc: (typeof pieces)[number]): IfcPrism => ({
    polygon: [pc.polygon],
    top: { a: pc.top.a, b: pc.top.b, c: pc.top.c },
    bottom: { a: pc.bottom.a, b: pc.bottom.b, c: pc.bottom.c },
  });
  const el = p.elements[rr.id];
  const flights = rr.flights.flatMap((f) => {
    const piece = pieces.find((pc) => pc.kind === 'flight' && pc.componentIndex === f.componentIndex);
    return piece ? [{ componentIndex: f.componentIndex, prism: prismOf(piece), length: f.length }] : [];
  });
  return {
    rampId: rr.id,
    levelId: rr.levelId,
    shape: isRamp(el) && el.shape !== 'free' ? el.shape : 'straight',
    slope: rr.slope,
    flights,
    landings: pieces.filter((pc) => pc.kind === 'landing').map(prismOf),
  };
}

/**
 * Guarda-corpos do projeto para o IFC (decisao 0055): a malha por parte (guarda_malha) e o comprimento desenvolvido (quant_guarda) vem do kernel Rust,
 * a mesma saida do 3D e das quantidades. Papel e material vem do grupo (material_num ja traduzido para o id do projeto). Sem kernel pronto, sem railings.
 */
export function railingsOf(p: Project): IfcGuardaCorpoGeo[] | undefined {
  if (!ServicoGuardaCorpo.temGuardaCorpo(p)) return undefined;
  const servico = servicoGuardaCorpo();
  const malhas = servico.malhas(p);
  if (!malhas) return undefined;
  const quant = new Map((servico.quantidades(p) ?? []).map((q) => [q.guardaId, q.comprimentoDesenvolvido] as const));
  return malhas.map((m) => ({
    guardaId: m.guardaId,
    partes: m.partes.map((pt) => ({
      papel: pt.papel,
      materialId: pt.materialId,
      mesh: { positions: pt.positions, indices: pt.indices },
      ...(pt.papel === 'painel' && (p.materials[pt.materialId]?.opacity ?? 1) < 1 ? { vidro: true } : {}),
      pecas: pt.pecas,
    })),
    ...(quant.get(m.guardaId) ? { comprimentoDesenvolvido: quant.get(m.guardaId)! } : {}),
  }));
}

/** Contorno em planta de uma parede reta (os dois lados do eixo, pela locação e a espessura do tipo), para a face externa e a parede genérica. */
function footprintOfWall(p: Project, wallId: Id): IfcPolygon | null {
  const f = frameOfWall(p, wallId);
  if (!f) return null;
  const at = (x: number, s: number): IfcPolygon[number][number] => pointAt(f, x, s);
  return [[at(0, f.sHi), at(f.length, f.sHi), at(f.length, f.sLo), at(0, f.sLo)]];
}

/**
 * Cortinas do projeto para o IFC (decisão 0056, fase 6): os protótipos e as matrizes de `cortina_malha`, os quantitativos de `quant_cortina` por
 * parede e o contorno de cada uma. Sem kernel pronto, ou sem nenhuma cortina que ele resolva, devolve `undefined`: a cortina sai como parede
 * genérica (`ifcGeometryOf` a põe em `walls`) e o exportador registra o aviso.
 */
export function curtainsOf(p: Project): IfcCurtainGeo | undefined {
  if (!temCortina(p)) return undefined;
  const s = servicoCortina();
  const malha = s.malha(p);
  const quant = s.quantidades(p);
  if (!malha || !quant) return undefined;
  const resolvidas = new Set(quant.filter((q) => q.papel === 20).map((q) => q.wallId));
  const montantes = mullionTypesOf(p);
  const materialDoProto = new Map<number, Id | null>();
  for (const g of malha.instancias) if (!materialDoProto.has(g.proto)) materialDoProto.set(g.proto, g.materialId);
  const prototypes: IfcCurtainPrototypeGeo[] = [...malha.protos.values()]
    .sort((a, b) => a.proto - b.proto)
    .map((pr) => ({
      proto: pr.proto,
      papel: pr.papel as 0 | 1 | 2,
      typeId: pr.tipoId,
      ...(pr.papel === 0 && pr.tipoId !== null && montantes[pr.tipoId] ? { shape: montantes[pr.tipoId]!.profile.shape } : {}),
      materialId: materialDoProto.get(pr.proto) ?? null,
      mesh: { positions: Array.from(pr.vertices), indices: Array.from(pr.indices) },
    }));
  const walls: IfcCurtainWallGeo[] = [];
  for (const { wall } of paredesCortina(p)) {
    if (!resolvidas.has(wall.id)) continue;
    const footprint = footprintOfWall(p, wall.id);
    if (!footprint) continue;
    const instances = malha.instancias
      .filter((g) => g.wallId === wall.id)
      .flatMap((g) => Array.from({ length: g.n }, (_, k) => ({ proto: g.proto, matrix: Array.from(g.matrizes.subarray(12 * k, 12 * k + 12)) })));
    const linhas = quant.filter((q) => q.wallId === wall.id);
    const soma = (filtro: (q: (typeof linhas)[number]) => boolean, valor: (q: (typeof linhas)[number]) => number): number => linhas.filter(filtro).reduce((acc, q) => acc + valor(q), 0);
    const sistema = linhas.find((q) => q.papel === 20);
    walls.push({
      wallId: wall.id,
      footprint,
      instances,
      quantities: {
        length: sistema?.comprimento ?? 0,
        grossArea: sistema?.area ?? 0,
        glassArea: soma((q) => q.papel === 10, (q) => q.areaLiquida),
        solidArea: soma((q) => q.papel === 11, (q) => q.areaLiquida),
        mullionLength: soma((q) => q.papel <= 5, (q) => q.comprimento),
      },
    });
  }
  return { prototypes, walls };
}

/** Cortina sem geometria do kernel como parede genérica (contorno e cota do tipo de cortina), para sair como `IFCWALL` com aviso. */
function genericWallOfCurtain(p: Project, wall: Wall): IfcWallGeo | null {
  const footprint = footprintOfWall(p, wall.id);
  const z = zDaCortina(p, wall);
  if (!footprint || !z) return null;
  return { wallId: wall.id, footprints: [footprint], baseZ: z.z0, height: z.height };
}

export function ifcGeometryOf(p: Project): IfcGeometry {
  const levels = p.levels.map((l) => l.id);
  const curtains = curtainsOf(p);
  const resolvidas = new Set(curtains?.walls.map((w) => w.wallId) ?? []);
  // Cortina que o kernel não resolveu (inclusive sem kernel) sai como parede genérica: o exportador avisa.
  const cortinasGenericas = paredesCortina(p)
    .filter((c) => !resolvidas.has(c.wall.id))
    .flatMap((c) => {
      const g = genericWallOfCurtain(p, c.wall);
      return g ? [g] : [];
    });
  const walls = [...levels.flatMap((id) => wallsOfLevel(p, id)), ...cortinasGenericas];
  // Pisos e lajes com a região resolvida pela junção, como a planta e o DXF (F7.1, 0023 §6). Sem corte, o contorno do elemento.
  const floors = levels
    .flatMap((id) => resolveFloorsWithJunction(p, id))
    .map((f) => ({ floorId: f.floorId, prisms: prismsOf(f.polygon, flatPlane(f.topZ), flatPlane(f.bottomZ)) }))
    .filter((f) => f.prisms.length > 0);
  const slabs = levels
    .flatMap((id) => resolveSlabsWithJunction(p, id))
    .map((s) => {
      const [top, bottom] = slabPlanes(s.topZ, s.bottomZ, s.slope);
      return { slabId: s.slabId, prisms: prismsOf(s.polygon, top, bottom) };
    })
    .filter((s) => s.prisms.length > 0);
  const roofs = levels.flatMap((id) => resolveRoofs(p, id)).map((r) => {
    const t = roofThickness(r);
    const planes = r.planes.flatMap((pl) => {
      const top = slopePlane(pl.z0, pl.origin, pl.up, pl.percent);
      return prismsOf(pl.polygon, top, { ...top, c: top.c - t });
    });
    return { roofId: r.roofId, planes };
  });
  const stairs = resolveStairs(p).map((s) => stairOf(p, s));
  const ceilings = levels
    .flatMap((id) => resolveCeilings(p, id))
    .map((c) => ({ ceilingId: c.ceilingId, prisms: prismsOf(c.polygon, flatPlane(c.topZ), flatPlane(c.bottomZ)) }))
    .filter((c) => c.prisms.length > 0);
  const ramps = resolveRamps(p).map((r) => rampOf(p, r));
  const railings = railingsOf(p);
  const masses = massesOf(p);
  return {
    walls,
    openings: openingsOf(p),
    floors,
    slabs,
    ceilings,
    roofs,
    stairs,
    ramps,
    ...(railings ? { railings } : {}),
    ...(curtains ? { curtains } : {}),
    ...(masses ? { masses } : {}),
  };
}

/** Texto IFC4 (STEP) do projeto e os avisos de exportação (cortina sem geometria do kernel), no idioma pedido. */
export function projectIfcComAvisos(p: Project, now: Date = new Date(), lang: Lang = useI18n.getState().lang): { texto: string; avisos: string[] } {
  const avisos: string[] = [];
  const texto = exportIfc(p, ifcGeometryOf(p), { timestamp: now.toISOString().slice(0, 19), lang, avisos });
  return { texto, avisos };
}

/** Texto IFC4 (STEP) do projeto inteiro, com a data atual no cabeçalho e os nomes padrão no idioma ativo. */
export function projectIfc(p: Project, now: Date = new Date(), lang: Lang = useI18n.getState().lang): string {
  return projectIfcComAvisos(p, now, lang).texto;
}

/** Entrega o `.ifc` pelo mesmo caminho do DXF (`saveText`) e devolve a frase de status, com os avisos de exportação no fim. */
export async function saveProjectIfc(p: Project, lang: Lang = useI18n.getState().lang): Promise<string> {
  const base = p.name.trim() || (lang === 'en' ? 'project' : 'projeto');
  const { texto, avisos } = projectIfcComAvisos(p, new Date(), lang);
  const status = await saveText(`${base}.ifc`, texto);
  return avisos.length > 0 ? `${status} ${avisos.join(' ')}` : status;
}
