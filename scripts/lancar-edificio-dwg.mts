/**
 * Lança o edifício do DWG (scripts/lancar-edificio-dwg/building.json) no modelo Hestia, headless.
 * Uso (cwd = raiz do repositório): npx vite-node scripts/lancar-edificio-dwg.mts [saida.hestia.json] [pasta-dxf]
 * Coordenadas: as LOCAIS por planta (origem no eixo 1/A), para os pisos repetidos coincidirem.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { difference, offsetMulti, pointInMulti, union, orientedRect, ringArea, type MultiPolygon, type Ring } from '@hestia/geom';
import {
  ProjectStore, createEmptyProject, makeRoom, makeSlab, makeStair, makeWall, migrateProject, validateProject,
  type Command, type Id, type Layer, type OpeningType, type Project, type SlabType, type WallType,
} from '@hestia/model';
import { resolveRooms, roomValidationIssues } from '@hestia/engine';
import { avisosDoProjeto } from '../apps/web/src/editor/avisosProjeto.ts';
import { planDxf } from '../apps/web/src/editor/dxfExport.ts';
import { buildFrame, joinStatus } from '@hestia/engine';
import { ajustaPlanta, type PAdj } from './lancar-edificio-dwg/topologia.mts';

const SAIDA = process.argv[2] ?? 'C:/Users/Dennylson/Downloads/hestia-edificio-teste/edificio-dwg_v2.hestia.json';
const PASTA_DXF = process.argv[3] ?? 'C:/tmp/ed57393/work/planta_hestia_v2';
const B = JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), 'lancar-edificio-dwg', 'building.json'), 'utf8'));

type V = { x: number; y: number };
const v2 = (a: number[]): V => ({ x: a[0]!, y: a[1]! });
const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const relatorio: string[] = [];
const log = (s: string): void => { relatorio.push(s); console.log(s); };

// ---------------------------------------------------------------- níveis
const NIVEIS: Array<{ id: string; nome: string; elevacao_m: number; planta: string }> = B.niveis;
const acima = (i: number): string | null => (i + 1 < NIVEIS.length ? NIVEIS[i + 1]!.id : null);
const origem = (planta: string): V => v2(B.origem_edificio.por_planta[planta].origem_global);
const loc = (planta: string, g: number[]): V => { const o = origem(planta); return { x: r3(g[0]! - o.x), y: r3(g[1]! - o.y) }; };

// ---------------------------------------------------------------- tipos
// espessuras: as presentes no JSON (mais 0,10 dos guarda-corpos); reboco de 1 cm até 0,125 m, senão 1,5 cm
const ESP: Array<[number, number]> = [...new Set<number>([0.1, ...B.paredes.map((w: any) => w.espessura_m as number)])].sort((p, q) => p - q).map((t) => [t, t <= 0.125 ? 0.01 : 0.015]);
const tipoParede = (t: number, f: number): WallType => {
  const nucleo = r3(t - 2 * f);
  const mat = t <= 0.125 ? 'mat_bloco9' : t <= 0.2 ? 'mat_bloco14' : 'mat_bloco19';
  const acab = (): Layer => ({ function: 'substrate', materialId: 'mat_reboco', thickness: f, wraps: true });
  return {
    id: `PAR-${Math.round(t * 1000)}`, name: `Parede DWG ${Math.round(t * 1000)} mm`, code: `PAR-${Math.round(t * 1000)}`,
    description: `Espessura acabada ${t} m (núcleo ${nucleo} m + 2 × ${f} m de reboco)`,
    layers: [acab(), { function: 'structure', materialId: mat, thickness: nucleo, wraps: false }, acab()],
    wrapInserts: 'both', wrapEnds: 'none', strips: [], cost: 0, thermalU: null, acousticRw: null, fireRating: null, manufacturer: '',
  };
};
const idParede = (t: number): string => `PAR-${Math.round(t * 1000)}`;

const LAJE: SlabType = {
  id: 'dwg_laje', name: 'Laje maciça 15 (DWG)', code: 'DW-LJ', description: 'Estrutura para na face externa do núcleo; acabamentos no núcleo.', cost: 240,
  layers: [
    { function: 'substrate', materialId: 'mat_argamassa', thickness: 0.02, wraps: false, termino: 'nucleo' },
    { function: 'structure', materialId: 'mat_concreto', thickness: 0.15, wraps: false, limiteExterno: 'nucleo' },
    { function: 'substrate', materialId: 'mat_tinta', thickness: 0.02, wraps: false, termino: 'nucleo' },
  ],
};

const store = new ProjectStore(createEmptyProject('edificio-dwg'));
const exec = (c: Command): void => store.exec(c);

// níveis: remove os padrão (vazios) e cria os 11
for (const n of NIVEIS) {
  exec({ type: 'upsertLevel', level: { id: n.id, name: n.nome, elevation: n.elevacao_m, viewRange: { top: 2.3, cut: 1.2, bottom: 0, depth: 0, direction: 'down' } } });
}
for (const id of ['lv_0', 'lv_1']) exec({ type: 'deleteLevel', id });
for (const [t, f] of ESP) exec({ type: 'upsertWallType', wallType: tipoParede(t, f) });
exec({ type: 'upsertSlabType', slabType: LAJE });

// ---------------------------------------------------------------- paredes
type Parede = { id: string; planta: string; a: number[]; b: number[]; espessura_m: number; a_local: number[]; b_local: number[]; pilar_curto?: boolean; possivel_batente?: boolean };
// paredes de comprimento zero no dado (colapsadas pela fusão) não são lançadas; ficam registradas em `semComprimento`
const semComprimento: string[] = B.paredes.filter((w: Parede) => Math.hypot(w.b_local[0]! - w.a_local[0]!, w.b_local[1]! - w.a_local[1]!) < 0.01).map((w: Parede) => `${w.planta}/${w.id}`);
const paredesDe = (planta: string): Parede[] => B.paredes.filter((w: Parede) => w.planta === planta && !semComprimento.includes(`${w.planta}/${w.id}`));
// topologia v3: locationLine nos degraus de eixo e pontas coincidentes (por planta)
const ADJ = new Map<string, Map<string, PAdj>>();
for (const pl of ['sotano2', 'semisotano', 'piso1', 'tipo_par', 'tipo_impar', 'azotea']) {
  console.log(`topologia ${pl}`);
  ADJ.set(pl, ajustaPlanta(paredesDe(pl) as any, (s) => console.log(s)));
}
const cmds: Command[] = [];
const idsParede = new Map<string, string>(); // `${nivel}|${W}` -> id
const contagem: Record<string, { paredes: number; aberturas: number; lajes: number; escadas: number; rooms: number }> = {};
const cnt = (n: string) => (contagem[n] ??= { paredes: 0, aberturas: 0, lajes: 0, escadas: 0, rooms: 0 });
let nPilar = 0, nBatente = 0;

NIVEIS.forEach((n, i) => {
  const topo = n.id === 'azotea' ? { topLevelId: null, height: B.casa_maquinas.altura_m } : { topLevelId: acima(i), topOffset: 0 };
  // ordem do motor: menor order domina canto/T; ordem_criacao_sugerida = mais espessas/longas primeiro
  const adj = ADJ.get(n.planta)!;
  const ws = [...paredesDe(n.planta)].sort((p, q) => adj.get(p.id)!.order - adj.get(q.id)!.order);
  for (const w of ws) {
    const id = `${n.id}-${w.id}`;
    idsParede.set(`${n.id}|${w.id}`, id);
    if (w.pilar_curto) nPilar++;
    if (w.possivel_batente) nBatente++;
    cmds.push({ type: 'addWall', wall: makeWall({ id, typeId: idParede(w.espessura_m), levelId: n.id, a: adj.get(w.id)!.a, b: adj.get(w.id)!.b, locationLine: adj.get(w.id)!.loc, ...topo }) });
    cnt(n.id).paredes++;
  }
});

// ---------------------------------------------------------------- aberturas
const tiposAbertura = (): Record<Id, OpeningType> => store.project.openingTypes;
const eq = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const novosTipos = new Map<string, OpeningType>();
function tipoAbertura(a: { tipo: string; largura_m: number; altura_m: number; peitoril_m: number }): Id {
  const kind: 'door' | 'window' = a.tipo === 'janela' ? 'window' : 'door';
  const sill = a.tipo === 'mampara' ? 0 : a.peitoril_m;
  const exist = Object.values(tiposAbertura()).find((t) => t.kind === kind && eq(t.width, a.largura_m) && eq(t.height, a.altura_m) && eq(t.sill, sill)
    && (kind === 'door' ? t.plan === 'swing' && t.leaves === 1 : (t.plan === 'sliding' && t.leaves === 2) || t.plan === 'casement'));
  if (exist) return exist.id;
  const cm = (x: number): string => String(Math.round(x * 1000));
  const id = `ot_dwg_${a.tipo === 'mampara' ? 'm' : kind === 'door' ? 'p' : 'j'}${cm(a.largura_m)}x${cm(a.altura_m)}${sill > 0 ? `s${cm(sill)}` : ''}`;
  if (!novosTipos.has(id)) {
    const nome = a.tipo === 'mampara' ? 'Mampara' : kind === 'door' ? 'Porta' : 'Janela';
    const t: OpeningType = a.tipo === 'mampara'
      ? { id, kind: 'door', name: `DWG ${nome} ${a.largura_m} x ${a.altura_m} (correr 2 folhas)`, width: a.largura_m, height: a.altura_m, sill: 0, leaves: 2, plan: 'sliding', frameMaterialId: 'mat_aluminio', glassMaterialId: 'mat_vidro', closure: 'inherit' }
      : kind === 'door'
        ? { id, kind, name: `DWG ${nome} ${a.largura_m} x ${a.altura_m} (giro)`, width: a.largura_m, height: a.altura_m, sill: 0, leaves: 1, plan: 'swing', frameMaterialId: 'mat_madeira', glassMaterialId: 'mat_vidro', closure: 'inherit' }
        : { id, kind, name: `DWG ${nome} ${a.largura_m} x ${a.altura_m}, peitoril ${sill}`, width: a.largura_m, height: a.altura_m, sill, leaves: a.largura_m >= 1.0 ? 2 : 1, plan: a.largura_m >= 1.0 ? 'sliding' : 'casement', frameMaterialId: 'mat_aluminio', glassMaterialId: 'mat_vidro', closure: 'inherit' };
    novosTipos.set(id, t);
    exec({ type: 'upsertOpeningType', openingType: t });
  }
  return id;
}
const desvios: string[] = [];
const reaproveitados = new Set<string>();
NIVEIS.forEach((n) => {
  for (const a of B.aberturas.filter((x: any) => x.planta === n.planta && x.hospedeira)) {
    const host = idsParede.get(`${n.id}|${a.hospedeira}`);
    if (!host) { desvios.push(`${n.id}/${a.id}: hospedeira ${a.hospedeira} inexistente`); continue; }
    const w = ADJ.get(n.planta)!.get(a.hospedeira)!;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    // offset = projeção do centro DXF na linha de locação ajustada (as pontas mudaram em relação ao v3)
    const proj = r3(((a.centro_local[0] - w.a.x) * (w.b.x - w.a.x) + (a.centro_local[1] - w.a.y) * (w.b.y - w.a.y)) / L);
    if (Math.abs(proj - a.offset_m) > 0.02) desvios.push(`${n.id}/${a.id}: offset v3 ${a.offset_m} -> ${proj} (ponta da hospedeira ajustada)`);
    a.offset_m = proj;
    if (a.offset_m - a.largura_m / 2 < -1e-6 || a.offset_m + a.largura_m / 2 > L + 1e-6) desvios.push(`${n.id}/${a.id}: vão excede a parede (offset ${a.offset_m}, L ${L.toFixed(3)})`);
    const typeId = tipoAbertura(a);
    if (!novosTipos.has(typeId)) reaproveitados.add(typeId);
    cmds.push({ type: 'addOpening', opening: { id: `${n.id}-${a.id}`, kind: a.tipo === 'janela' ? 'window' : 'door', typeId, hostId: host, offset: a.offset_m, flipHand: false, flipFacing: false, sillOverride: null, mark: a.marca ?? '' } });
    cnt(n.id).aberturas++;
  }
});

// ---------------------------------------------------------------- geometria: contornos de laje
const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const ringDeContorno = (planta: string, c: number[][]): Ring => c.map((p) => loc(planta, p));
function pegadaParedes(planta: string): MultiPolygon {
  const rs: MultiPolygon[] = [];
  for (const w of paredesDe(planta)) {
    const q = ADJ.get(planta)!.get(w.id)!;
    const [ax, ay, bx, by] = [q.ca.x, q.ca.y, q.cb.x, q.cb.y];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    rs.push([[orientedRect((ax + bx) / 2, (ay + by) / 2, (bx - ax) / L, (by - ay) / L, L / 2, w.espessura_m / 2)]]);
  }
  return union(...rs);
}
/** Contorno externo = fecho (dilata e contrai) da pegada das paredes, só o anel externo do maior polígono. */
const RAIO_FECHO = Number(process.env.RAIO_FECHO ?? 3);
const cacheContorno = new Map<string, Ring>();
function contornoExterno(planta: string): Ring {
  const c = cacheContorno.get(planta);
  if (c) return c;
  const fechado = offsetMulti(offsetMulti(pegadaParedes(planta), RAIO_FECHO), -RAIO_FECHO);
  const maior = [...fechado].sort((p, q) => Math.abs(ringArea(q[0]!)) - Math.abs(ringArea(p[0]!)))[0];
  if (!maior) throw new Error(`sem contorno em ${planta}`);
  const out = limpa(maior[0]!);
  cacheContorno.set(planta, out);
  return out;
}
/** Remove vértices colineares e repetidos (tolerância 5 mm). */
function limpa(r: Ring): Ring {
  let pts = r.map((p) => ({ x: r3(p.x), y: r3(p.y) }));
  let mudou = true;
  while (mudou && pts.length > 3) {
    mudou = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i + pts.length - 1) % pts.length]!, c = pts[i]!, n = pts[(i + 1) % pts.length]!;
      const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
      const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
      if (Math.hypot(c.x - p.x, c.y - p.y) < 0.005 || Math.abs(cross) / d < 0.005) { pts.splice(i, 1); mudou = true; break; }
    }
  }
  return pts;
}

// ---------------------------------------------------------------- escadas, poços, sacadas (por planta)
const plantaDeNivel = (n: { planta: string }): string => n.planta;
const pocosDe = (planta: string, ate = false): Ring[] =>
  B.pocos.filter((p: any) => p.planta === planta && !(p.nome.includes('(topo)'))).map((p: any) => ringDeContorno(planta, p.contorno));
const sacadasDe = (planta: string): Array<{ nome: string; ring: Ring }> =>
  B.sacadas.filter((s: any) => s.planta === planta).map((s: any) => ({ nome: s.nome, ring: ringDeContorno(planta, s.contorno) }));
const asMulti = (r: Ring): MultiPolygon => [[r]];
const S = (id: string) => B.escadas.find((e: any) => e.id === id);

const contornoPorPlanta = new Map<string, Ring>();
for (const n of NIVEIS) {
  // azotea: só 4 paredes (casa de máquinas) -> usa o contorno do tipo_par para a laje de cobertura
  contornoPorPlanta.set(n.planta, contornoExterno(n.planta === 'azotea' ? 'tipo_par' : n.planta));
}

// escada S3 em forma de U (dois lances de 8 espelhos + patamar) ancorada no canto do contorno medido
function escadaS3(nivel: string, planta: string, topLevelId: string | null): Command {
  const c = ringDeContorno(planta, S('S3').contorno_por_planta[planta]);
  const x0 = Math.min(...c.map((p) => p.x)), y0 = Math.min(...c.map((p) => p.y)), y1 = Math.max(...c.map((p) => p.y));
  const W = 1.2, G = y1 - y0 - 2 * W, T = S('S3').piso_m as number, Pat = 1.2; // medido 1,19 m; 1,20 m = mínimo de norma do Hestia
  const n = 8;
  const xe = x0 + (n - 1) * T; // última linha de espelho do 1º lance
  const xp = xe + Pat;
  const yA = y0, yB = y1 - W;
  const L = (a: V, b: V) => ({ a, b, sag: 0 });
  const lance1 = {
    id: `${nivel}-S3-l1`, kind: 'run' as const,
    boundaryLeft: [L({ x: x0, y: yA + W }, { x: xe, y: yA + W })],
    boundaryRight: [L({ x: x0, y: yA }, { x: xe, y: yA })],
    risers: Array.from({ length: n }, (_, k) => L({ x: x0 + k * T, y: yA }, { x: x0 + k * T, y: yA + W })),
    path: [], generatedBy: 'straight' as const,
  };
  const lance2 = {
    id: `${nivel}-S3-l2`, kind: 'run' as const,
    boundaryLeft: [L({ x: xe, y: yB }, { x: x0, y: yB })],
    boundaryRight: [L({ x: xe, y: yB + W }, { x: x0, y: yB + W })],
    risers: Array.from({ length: n }, (_, k) => L({ x: xe - k * T, y: yB }, { x: xe - k * T, y: yB + W })),
    path: [], generatedBy: 'straight' as const,
  };
  const pat = { id: `${nivel}-S3-pat`, kind: 'landing' as const, boundary: [L({ x: xe, y: yA }, { x: xp, y: yA }), L({ x: xp, y: yA }, { x: xp, y: y1 }), L({ x: xp, y: y1 }, { x: xe, y: y1 }), L({ x: xe, y: y1 }, { x: xe, y: yA })] };
  void G;
  return { type: 'addStair', stair: makeStair({ id: `${nivel}-S3`, typeId: 'stt_monolitica', levelId: nivel, topLevelId, components: [lance1, pat, lance2], mark: 'S3' }) };
}

// ---------------------------------------------------------------- lajes por nível
const omissoes: string[] = [];
NIVEIS.forEach((n, i) => {
  const planta = n.planta;
  const base = contornoPorPlanta.get(planta)!;
  const sac = sacadasDe(planta);
  const sacU = sac.length ? union(...sac.map((s) => asMulti(s.ring))) : [];
  // furos: poços e elevador; escadas omitidas (S2 em piso1, S4 em semisotano) como furo explícito
  const furos: Ring[] = [...pocosDe(planta)];
  for (const id of ['S2', 'S4']) {
    const e = S(id);
    if (e.contorno_por_planta[planta]) {
      const alvo = id === 'S2' ? 'piso1' : 'semisotano';
      if (planta === alvo) furos.push(ringDeContorno(planta, e.contorno_por_planta[planta]));
    }
  }
  let corpo: MultiPolygon = asMulti(base);
  if (sacU.length) corpo = difference(corpo, offsetMulti(sacU, 0.006));
  const furosU = furos.length ? union(...furos.map(asMulti)) : [];
  const principal = furosU.length ? difference(corpo, furosU) : corpo;
  let k = 0;
  for (const poly of principal) {
    const outer = limpa(poly[0]!);
    const holes = poly.slice(1).map((h) => limpa(h));
    cmds.push({ type: 'addSlab', slab: makeSlab({ id: `${n.id}-LAJE${k ? `-${k}` : ''}`, typeId: LAJE.id, levelId: n.id, boundary: outer, holes }) });
    cnt(n.id).lajes++; k++;
  }
  // sacadas: laje separada, 5 cm abaixo do nível, + parede baixa (guarda-corpo) nos lados livres
  sac.forEach((s, j) => {
    cmds.push({ type: 'addSlab', slab: makeSlab({ id: `${n.id}-SAC${j + 1}`, typeId: LAJE.id, levelId: n.id, heightOffset: -0.05, boundary: limpa(s.ring) }) });
    cnt(n.id).lajes++;
  });
  void i;
});

// guarda-corpos das sacadas: lados que não encostam em parede existente
const pegadaCache = new Map<string, MultiPolygon>();
const pegada = (pl: string): MultiPolygon => { let p = pegadaCache.get(pl); if (!p) { p = offsetMulti(pegadaParedes(pl), 0.08); pegadaCache.set(pl, p); } return p; };
let nGuarda = 0;
NIVEIS.forEach((n) => {
  sacadasDe(n.planta).forEach((s, j) => {
    const pts = s.ring, g = pegada(n.planta);
    for (let e = 0; e < pts.length; e++) {
      const a = pts[e]!, b = pts[(e + 1) % pts.length]!;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const passos = Math.max(1, Math.round(L / 0.1));
      const livre = (t: number): boolean => !pointInMulti({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, g);
      if (Array.from({ length: passos + 1 }, (_, q) => livre(q / passos)).filter(Boolean).length < (passos + 1) * 0.7) continue;
      cmds.push({ type: 'addWall', wall: makeWall({ id: `${n.id}-GC${j + 1}-${e}`, typeId: idParede(0.1), levelId: n.id, a, b, topLevelId: null, height: 1.1 }) });
      cnt(n.id).paredes++; nGuarda++;
    }
  });
});

// ---------------------------------------------------------------- escadas S3 (uma por nível, de piso1 até piso8; a de azotea é o desembarque)
NIVEIS.forEach((n, i) => {
  if (['piso1', 'piso2', 'piso3', 'piso4', 'piso5', 'piso6', 'piso7', 'piso8'].includes(n.id)) {
    cmds.push(escadaS3(n.id, n.planta, acima(i)));
    cnt(n.id).escadas++;
  }
});

// ---------------------------------------------------------------- ambientes (só os contidos em recinto fechado)
// v3: os recintos do JSON estão defasados; tenta todo rótulo não vertical e deixa o circuito real do motor decidir.
const PRIO: Record<string, number> = { ambiente: 0, servicio: 1, circulacion: 2, exterior: 3, numero: 4 };
const ambs = B.ambientes.filter((a: any) => a.categoria !== 'vertical' && a.ponto_local).sort((p: any, q: any) => (PRIO[p.categoria] ?? 9) - (PRIO[q.categoria] ?? 9));
const roomsTentativa: Array<{ nivel: string; cmd: Command }> = [];
NIVEIS.forEach((n) => {
  let num = 1;
  for (const a of ambs.filter((x: any) => x.planta === n.planta)) {
    roomsTentativa.push({ nivel: n.id, cmd: { type: 'addRoom', room: makeRoom({ id: `${n.id}-AMB${num}`, levelId: n.id, name: a.nome, number: String(num), point: v2(a.ponto_local) }) } });
    num++;
  }
});

// ---------------------------------------------------------------- aplica
store.exec({ type: 'batch', commands: cmds });
log(`comandos aplicados: ${cmds.length}`);
// ambientes: testa um a um e mantém só os que resolvem (sem problema)
{
  const todos = roomsTentativa.map((r) => r.cmd);
  store.exec({ type: 'batch', commands: todos });
  const apagar: string[] = [];
  const motivos: Record<string, number> = {};
  for (const n of NIVEIS) {
    for (const r of resolveRooms(store.project, n.id)) {
      if (r.problem) { apagar.push(r.roomId); motivos[r.problem] = (motivos[r.problem] ?? 0) + 1; }
    }
  }
  log(`ambientes tentados ${todos.length}; com problema ${apagar.length} ${JSON.stringify(motivos)}`);
  if (apagar.length) store.exec({ type: 'deleteElements', ids: apagar });
  // mais de um rótulo no mesmo circuito: mantém o primeiro (aviso room-duplicate)
  const dup = roomValidationIssues(store.project).filter((i) => i.code === 'room-duplicate').map((i) => i.elementId!).filter(Boolean);
  log(`ambientes duplicados no mesmo circuito (omitidos): ${dup.length}`);
  if (dup.length) store.exec({ type: 'deleteElements', ids: [...new Set(dup)] });
  apagar.push(...dup);
  for (const n of NIVEIS) cnt(n.id).rooms = roomsTentativa.filter((r) => r.nivel === n.id).length - apagar.filter((id) => id.startsWith(`${n.id}-`)).length;
}

const p: Project = store.project;
// eixos reais (centro do corpo) por planta, para a comparação com o DXF original
if (process.env.EIXOS_JSON ?? 'C:/tmp/ed57393/work/v2_eixos.json') {
  const eixos: Record<string, unknown> = {};
  for (const [pl, m] of ADJ) eixos[pl] = [...m.values()].map((q) => ({ id: q.id, a_local: [q.ca.x, q.ca.y].map(r3), b_local: [q.cb.x, q.cb.y].map(r3), espessura_m: q.espessura, loc: q.loc }));
  writeFileSync(process.env.EIXOS_JSON ?? 'C:/tmp/ed57393/work/v2_eixos.json', JSON.stringify({ paredes: eixos, aberturas: B.aberturas }));
}
mkdirSync(dirname(SAIDA), { recursive: true });
writeFileSync(SAIDA, JSON.stringify(p, null, 1));
log(`gravado ${SAIDA}`);

// ---------------------------------------------------------------- verificação
log('\n== round-trip migrateProject ==');
const lido = migrateProject(JSON.parse(readFileSync(SAIDA, 'utf8')));
log(`schemaVersion ${lido.schemaVersion}, elementos ${Object.keys(lido.elements).length} (original ${Object.keys(p.elements).length}), níveis ${lido.levels.length}`);

log('\n== contagem por nível (modelo vs building.json) ==');
const el = Object.values(p.elements) as any[];
let ok = true;
for (const n of NIVEIS) {
  const q = (k: string) => el.filter((e) => e.kind === k && e.levelId === n.id).length;
  const hospedeiras = B.aberturas.filter((a: any) => a.planta === n.planta && a.hospedeira).length;
  const op = el.filter((e) => (e.kind === 'door' || e.kind === 'window') && String(e.id).startsWith(`${n.id}-`)).length;
  const esperadoParedes = paredesDe(n.planta).length + cnt(n.id).paredes - paredesDe(n.planta).length; // paredes + guarda-corpos já em cnt
  const bateP = q('wall') === esperadoParedes && cnt(n.id).paredes === q('wall');
  const bateO = op === hospedeiras;
  if (!bateP || !bateO) ok = false;
  log(`${n.id.padEnd(11)} paredes ${String(q('wall')).padStart(3)} (json ${paredesDe(n.planta).length}${cnt(n.id).paredes !== paredesDe(n.planta).length ? ` + ${cnt(n.id).paredes - paredesDe(n.planta).length} guarda-corpos` : ''}) aberturas ${String(op).padStart(3)} (json hospedadas ${hospedeiras}) lajes ${q('slab')} escadas ${q('stair')} ambientes ${q('room')}`);
}
log(ok ? 'CONTAGENS BATEM' : 'CONTAGENS NÃO BATEM');

log('\n== validateProject ==');
const val = validateProject(p);
log(`erros: ${val.filter((x) => x.severity === 'error').length}`);
log('\n== avisosDoProjeto por tipo (severity:code -> n) ==');
const avisos = avisosDoProjeto(p);
const porTipo: Record<string, number> = {};
for (const a of avisos) porTipo[`${a.severity}:${a.code}`] = (porTipo[`${a.severity}:${a.code}`] ?? 0) + 1;
for (const [k, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) log(`${String(n).padStart(5)}  ${k}`);
for (const [k] of Object.entries(porTipo)) {
  const code = k.split(':')[1]!;
  for (const a of avisos.filter((x) => x.code === code).slice(0, 2)) log(`   ex ${code}: ${a.message} [${(a.ids ?? [a.elementId]).slice(0, 3).join(',')}]`);
}
for (const code of ['wall-type-missing', 'opening-type-missing', 'opening-host-missing', 'level-missing', 'top-level-missing', 'wall-zero-length']) {
  const n = avisos.filter((a) => a.code === code).length;
  if (n) log(`!! ${code}: ${n}`);
}
log(`paredes de comprimento zero no dado, não lançadas: ${semComprimento.join(', ') || 'nenhuma'}`);
log('\n== junções por nível (motor: joinStatus nas pontas; avisos por nível) ==');
for (const n of NIVEIS) {
  const ws = (Object.values(p.elements) as any[]).filter((e) => e.kind === 'wall' && e.levelId === n.id && !String(e.id).includes('-GC'));
  const frames = ws.map((w) => buildFrame(w, p.wallTypes[w.typeId]!)).filter((f): f is NonNullable<typeof f> => !!f);
  const c: Record<string, number> = { free: 0, pair: 0, node: 0, tee: 0 };
  for (const w of ws) for (const e of ['a', 'b'] as const) { const k = joinStatus(frames, w.id, e).kind; c[k] = (c[k] ?? 0) + 1; }
  const ids = new Set(ws.map((w) => w.id));
  const av = avisos.filter((x: any) => (x.ids ?? [x.elementId]).some((i: string) => ids.has(i)));
  const k = (code: string): number => av.filter((x: any) => x.code === code).length;
  const tot = ws.length * 2;
  log(`${n.id.padEnd(11)} pontas ${tot}: livres ${c.free} (${((100 * c.free!) / tot).toFixed(1)}%) par ${c.pair} nó ${c.node} T ${c.tee} | near-miss ${k('wall-end-near-miss')} overlap ${k('wall-overlap')} unjoined ${k('wall-end-unjoined')}`);
}
log(`\ndesvios de dado nas aberturas: ${desvios.length}`);
for (const d of desvios.slice(0, 20)) log('  ' + d);
log(`tipos de abertura reaproveitados: ${[...reaproveitados].join(', ')}`);
log(`tipos de abertura criados: ${[...novosTipos.keys()].join(', ')}`);
log(`paredes pilar_curto lançadas como normais: ${nPilar}; possivel_batente: ${nBatente}; guarda-corpos de sacada: ${nGuarda}`);
log('aberturas órfãs não lançadas: ' + B.aberturas_orfas.map((o: any) => o.id ?? o).join(', '));
void omissoes; void plantaDeNivel;
writeFileSync(SAIDA.replace(/\.hestia\.json$/, '.relatorio.txt'), relatorio.join('\n'));

// ---------------------------------------------------------------- DXF por nível
if (!process.env.SEM_DXF) {
  mkdirSync(PASTA_DXF, { recursive: true });
  for (const n of NIVEIS) {
    const t0 = Date.now();
    writeFileSync(join(PASTA_DXF, `${n.id}.dxf`), planDxf(p, n.id));
    console.log(`DXF ${n.id} (${Date.now() - t0} ms)`);
  }
}
