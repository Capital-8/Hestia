/**
 * Adaptador da sub-etapa A1 do kernel Rust (decisão 0047). NÃO calcula geometria: só
 * (1) monta as seções de coluna da cena v2 a partir de um `Project` e
 * (2) EXTRAI do TypeScript existente (`levelFrames`, `computeEnds`, `joinStatus`, `clusterWalls`) o que o Rust
 * produz em `quadros_e_juncoes`, na mesma codificação plana (ver `crates/geom-wasm/schema/cena-v11.json`), para o
 * harness e os testes compararem. A referência de correção é o próprio motor; nada aqui reimplementa o algoritmo.
 */
import { wallThicknessOf, wallBaseElevation, wallMaxHeight, wallsOnLevel, type Id, type LocationLine, type Project, type Wall, type WallType, type WrapMode } from '@hestia/model';
import { clusterWalls, levelFrames } from './resolve.ts';
import { attachTargets } from './attachTargets.ts';
import { resolveAllRoofs } from './roofs.ts';
import { wallZRange, type WallZ } from './wallZ.ts';
import { computeEnds, DEFAULT_JOIN_TOL, joinStatus, type JoinStatus, type SideSpec, type WallEnds } from './joins.ts';
import type { MiterSide } from './joinTypes.ts';
import type { WallFrame } from './frame.ts';

export type ColunasA1 = Record<string, number[]>;

const LINHA_LOC: Record<LocationLine, number> = { wallCenter: 0, coreCenter: 1, finishExterior: 2, finishInterior: 3, coreExterior: 4, coreInterior: 5 };
const FUNCAO: Record<string, number> = { structure: 0, substrate: 1, thermal: 2, membrane: 3, finish1: 4, finish2: 5 };
const WRAP: Record<WrapMode, number> = { none: 0, exterior: 1, interior: 2, both: 3 };

/**
 * Cota real (`wallZRange`) das paredes de um nível, montada como `resolveLevel` a monta: pisos e lajes pelo
 * `attachTargets` e telhados só se alguma parede do nível se anexa a um. É o que o Rust recebe em `paredes_z`
 * (A2: a cota depende de pisos, lajes e telhados, que só migram nas fatias B e E).
 */
export function zDoNivel(p: Project, levelId: Id, flatAttach = false): Map<Id, WallZ> {
  const walls = wallsOnLevel(p, levelId);
  const { floors, slabs } = attachTargets(p, walls, flatAttach);
  const roofs = walls.some((w) => w.attachTopToRoof === true) ? resolveAllRoofs(p) : [];
  return new Map(walls.map((w) => [w.id, wallZRange(p, w, floors, slabs, roofs)] as const));
}

export interface CenaA1 {
  /** Seções por nome do esquema v2, em colunas. */
  secoes: { paredes: ColunasA1; paredes_quadro: ColunasA1; tipos_parede: ColunasA1; camadas: ColunasA1; faixas: ColunasA1; paredes_z: ColunasA1 };
  nLinhas: { paredes: number; paredes_quadro: number; tipos_parede: number; camadas: number; faixas: number; paredes_z: number };
  /** id do material -> `material_num`. */
  materialDe: Map<Id, number>;
  /** id da parede -> `id_num`. */
  idDe: Map<Id, number>;
  /** id do nível -> `nivel_num`. */
  nivelDe: Map<Id, number>;
  /** Paredes ignoradas por não terem nível ou tipo resolvível. */
  ignoradas: number;
}

function tipoDe(p: Project, w: Wall): WallType | undefined {
  return p.wallTypes[w.typeId] ?? p.wallTypes[p.defaults.wallTypeId];
}

/** Projeto -> seções `paredes`, `paredes_quadro`, `tipos_parede`, `camadas`, `faixas` e `paredes_z`. Ids internados na ordem do projeto. `flatAttach`: a cota de `paredes_z` é a do término por camada (`PlanResolveOptions.flatAttach`). */
export function montarCenaA1(p: Project, flatAttach = false): CenaA1 {
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const idDe = new Map<Id, number>();
  const tipoNum = new Map<Id, number>();
  const col = (): ColunasA1 => ({});
  const paredes = col();
  const quadro = col();
  const tipos = col();
  const camadas = col();
  const faixas = col();
  const paredesZ = col();
  const materialDe = new Map<Id, number>();
  const materialNum = (id: Id): number => {
    let n = materialDe.get(id);
    if (n === undefined) materialDe.set(id, (n = materialDe.size + 1));
    return n;
  };
  const zPorNivel = new Map<Id, Map<Id, WallZ>>();
  const push = (c: ColunasA1, nome: string, v: number): void => {
    (c[nome] ??= []).push(v);
  };
  let ignoradas = 0;
  let proximoTipo = 1;
  let proximaCamada = 1;
  let proximaFaixa = 1;
  let proximoId = 1;
  for (const el of Object.values(p.elements)) {
    if (el.kind !== 'wall') continue;
    const nivel = nivelDe.get(el.levelId);
    const tipo = tipoDe(p, el);
    if (nivel === undefined || !tipo) {
      ignoradas++;
      continue;
    }
    const id = proximoId++;
    idDe.set(el.id, id);
    let tn = tipoNum.get(tipo.id);
    if (tn === undefined) {
      tn = proximoTipo++;
      tipoNum.set(tipo.id, tn);
      push(tipos, 'id_num', tn);
      push(tipos, 'n_camadas', tipo.layers.length);
      push(tipos, 'wrap_ends', WRAP[tipo.wrapEnds] ?? 0);
      push(tipos, 'n_faixas', (tipo.strips ?? []).length);
      push(tipos, 'wrap_inserts', WRAP[tipo.wrapInserts] ?? 0);
      tipo.layers.forEach((l, i) => {
        push(camadas, 'id_num', proximaCamada++);
        push(camadas, 'tipo_num', tn!);
        push(camadas, 'indice', i);
        push(camadas, 'espessura', l.thickness);
        push(camadas, 'funcao', FUNCAO[l.function] ?? 255);
        push(camadas, 'tem_prioridade', l.priority === undefined ? 0 : 1);
        push(camadas, 'prioridade', l.priority ?? 0);
        push(camadas, 'material_num', materialNum(l.materialId));
        push(camadas, 'envolve', l.wraps ? 1 : 0);
      });
      (tipo.strips ?? []).forEach((st, k) => {
        push(faixas, 'id_num', proximaFaixa++);
        push(faixas, 'tipo_num', tn!);
        push(faixas, 'indice', k);
        push(faixas, 'lado', st.side === 'interior' ? 1 : 0);
        push(faixas, 'material_num', materialNum(st.materialId));
        push(faixas, 'espessura', st.thickness);
        push(faixas, 'z0', st.z0);
        push(faixas, 'z1', st.z1);
      });
    }
    push(paredes, 'id_num', id);
    push(paredes, 'nivel_num', nivel);
    push(paredes, 'ax', el.a.x);
    push(paredes, 'ay', el.a.y);
    push(paredes, 'bx', el.b.x);
    push(paredes, 'by', el.b.y);
    push(paredes, 'espessura', wallThicknessOf(tipo));
    const z0 = wallBaseElevation(p, el);
    push(quadro, 'id_num', id);
    push(quadro, 'tipo_num', tn);
    push(quadro, 'ordem', el.order);
    push(quadro, 'linha_loc', LINHA_LOC[el.locationLine]);
    push(quadro, 'invertida', el.flipped ? 1 : 0);
    push(quadro, 'sem_junta_a', el.noJoinStart ? 1 : 0);
    push(quadro, 'sem_junta_b', el.noJoinEnd ? 1 : 0);
    push(quadro, 'junta_a_tipo', el.joinStart.kind === 'miter' ? 1 : 0);
    push(quadro, 'junta_a_inverte', el.joinStart.flip ? 1 : 0);
    push(quadro, 'junta_b_tipo', el.joinEnd.kind === 'miter' ? 1 : 0);
    push(quadro, 'junta_b_inverte', el.joinEnd.flip ? 1 : 0);
    push(quadro, 'sag', el.sag);
    push(quadro, 'z0', z0);
    push(quadro, 'topo', z0 + wallMaxHeight(p, el));
    let zs = zPorNivel.get(el.levelId);
    if (!zs) zPorNivel.set(el.levelId, (zs = zDoNivel(p, el.levelId, flatAttach)));
    const z = zs.get(el.id)!;
    push(paredesZ, 'id_num', id);
    push(paredesZ, 'z0', z.z0);
    push(paredesZ, 'altura', z.height);
  }
  const vazio = (c: ColunasA1, nomes: string[]): ColunasA1 => {
    for (const n of nomes) c[n] ??= [];
    return c;
  };
  vazio(paredes, ['id_num', 'nivel_num', 'ax', 'ay', 'bx', 'by', 'espessura']);
  vazio(quadro, ['id_num', 'tipo_num', 'ordem', 'linha_loc', 'invertida', 'sem_junta_a', 'sem_junta_b', 'junta_a_tipo', 'junta_a_inverte', 'junta_b_tipo', 'junta_b_inverte', 'sag', 'z0', 'topo']);
  vazio(tipos, ['id_num', 'n_camadas', 'wrap_ends', 'n_faixas', 'wrap_inserts']);
  vazio(camadas, ['id_num', 'tipo_num', 'indice', 'espessura', 'funcao', 'tem_prioridade', 'prioridade', 'material_num', 'envolve']);
  vazio(faixas, ['id_num', 'tipo_num', 'indice', 'lado', 'material_num', 'espessura', 'z0', 'z1']);
  vazio(paredesZ, ['id_num', 'z0', 'altura']);
  return {
    secoes: { paredes, paredes_quadro: quadro, tipos_parede: tipos, camadas, faixas, paredes_z: paredesZ },
    nLinhas: {
      paredes: paredes['id_num']!.length,
      paredes_quadro: quadro['id_num']!.length,
      tipos_parede: tipos['id_num']!.length,
      camadas: camadas['id_num']!.length,
      faixas: faixas['id_num']!.length,
      paredes_z: paredesZ['id_num']!.length,
    },
    materialDe,
    idDe,
    nivelDe,
    ignoradas,
  };
}

/** Saídas de `quadros_e_juncoes`, na codificação do esquema (números simples; NaN = ausente em `pontas_dados`). */
export interface SaidaA1 {
  ids: number[];
  quadro: number[];
  arco: number[];
  estado_pontas: number[];
  parceiros: number[];
  pontas_cab: number[];
  pontas_dados: number[];
  cordas_cab: number[];
  cordas: number[];
  grupos: number[];
}

const SEM_HOSPEDEIRA = 0xffffffff;

function ladoMitra(m: MiterSide, idDe: (id: Id) => number, out: number[]): void {
  out.push(idDe(m.wallId), m.o.x, m.o.y, m.u.x, m.u.y, m.n.x, m.n.y, m.sHi, m.sLo, m.sigma, m.outerToCore, m.coreEnd);
  if (m.arc) out.push(1, m.arc.center.x, m.arc.center.y, m.arc.radius, m.arc.k);
  else out.push(0, 0, 0, 0, 0);
  out.push(m.bounds.length, ...m.bounds);
}

function corte(c: SideSpec, idDe: (id: Id) => number, out: number[]): number {
  switch (c.kind) {
    case 'flat':
      out.push(c.t);
      return 0;
    case 'miter':
      ladoMitra(c.self, idDe, out);
      ladoMitra(c.other, idDe, out);
      return 1;
    case 'steps':
      out.push(c.runs.length);
      for (const r of c.runs) out.push(r.s, r.s1 ?? NaN, r.t, r.t1 ?? NaN, r.on ?? NaN, r.host === undefined ? -1 : idDe(r.host));
      return 2;
    case 'plane':
      out.push(c.p.x, c.p.y, c.q.x, c.q.y, c.pts.length);
      for (const x of c.pts) out.push(x.x, x.y);
      return 3;
  }
}

/**
 * O que o motor TypeScript produz para um pavimento, codificado como a consulta `quadros_e_juncoes` do Rust.
 * `tol` é a tolerância de junção do projeto (`settings.joinTolerance`, padrão 0,02 m).
 */
export function referenciaA1(p: Project, levelId: Id, cena: CenaA1): SaidaA1 {
  const tol = p.settings?.joinTolerance;
  const frames = levelFrames(p, levelId).filter((f) => cena.idDe.has(f.wall.id));
  const ends = computeEnds(frames, tol);
  const idDe = (id: Id): number => {
    const n = cena.idDe.get(id);
    if (n === undefined) throw new Error(`parede ${id} sem id_num`);
    return n;
  };
  const grupoDe = new Map<WallFrame, number>();
  clusterWalls(frames, ends).forEach((g, gi) => g.forEach((f) => grupoDe.set(f, gi)));
  const s: SaidaA1 = { ids: [], quadro: [], arco: [], estado_pontas: [], parceiros: [], pontas_cab: [], pontas_dados: [], cordas_cab: [], cordas: [], grupos: [] };
  for (const f of frames) {
    s.ids.push(idDe(f.wall.id));
    s.quadro.push(f.a.x, f.a.y, f.b.x, f.b.y, f.u.x, f.u.y, f.n.x, f.n.y, f.length, f.sign, f.extOffset, f.thickness, f.sExt, f.sInt, f.sHi, f.sLo, f.sMid);
    if (f.arc) s.arco.push(1, f.arc.center.x, f.arc.center.y, f.arc.radius, f.arc.a0, f.arc.sweep, f.arc.length, f.arc.k);
    else s.arco.push(0, 0, 0, 0, 0, 0, 0, 0);
    const e = ends.get(f.wall.id)!;
    for (const which of ['a', 'b'] as const) {
      const st: JoinStatus = joinStatus(frames, f.wall.id, which, tol ?? DEFAULT_JOIN_TOL);
      const ini = s.parceiros.length / 2;
      let tipo: number;
      let host = SEM_HOSPEDEIRA;
      let n = 0;
      if (st.kind === 'free') tipo = 0;
      else if (st.kind === 'disallowed') tipo = 1;
      else if (st.kind === 'tee') {
        tipo = 4;
        host = idDe(st.hostId);
      } else {
        tipo = st.kind === 'pair' ? 2 : 3;
        for (const q of st.partners) s.parceiros.push(idDe(q.wallId), q.end === 'a' ? 0 : 1);
        n = st.partners.length;
      }
      s.estado_pontas.push(tipo, host, ini, n);
      const spec = e[which];
      if (spec.hi !== spec.lo) throw new Error('EndSpec com hi != lo: a codificação do esquema v2 não cobre');
      const ini_d = s.pontas_dados.length;
      const cod = corte(spec.hi, idDe, s.pontas_dados);
      s.pontas_cab.push(cod, ini_d, s.pontas_dados.length - ini_d);
    }
    const cordas = (e as WallEnds).cordas ?? [];
    s.cordas_cab.push(s.cordas.length / 5, cordas.length);
    for (const c of cordas) s.cordas.push(c.s, c.p.x, c.p.y, c.q.x, c.q.y);
    s.grupos.push(grupoDe.get(f)!);
  }
  return s;
}

/** Paredes de um nível com quadro (as mesmas que `levelFrames` devolve), só para testes e diagnóstico. */
export const paredesComQuadro = (p: Project, levelId: Id): Wall[] => levelFrames(p, levelId).map((f) => f.wall);
