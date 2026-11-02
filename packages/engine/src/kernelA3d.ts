/**
 * Adaptador da sub-etapa A3d do kernel Rust (decisão 0047 §7): `ResolvedLevel` completo. NÃO calcula geometria: monta a seção `perfis_z` do
 * esquema v7 (os perfis que `wallZRange` calcula no JS) e EXTRAI de `resolveLevel` o que o Rust produz em `resolver_nivel`, na mesma
 * codificação plana (ver `crates/geom-wasm/schema/cena-v7.json`).
 */
import type { MultiPolygon } from '@hestia/geom';
import type { Id, ProfilePoint, Project, Wall } from '@hestia/model';
import { zDoNivel, type CenaA1, type ColunasA1 } from './kernelA1.ts';
import { argumentosA3c, decodificarA3c, numeroDe, type CamadaA3c, type FaixaA3c, type OpcoesA3c, type RegiaoA3c } from './kernelA3.ts';
import { resolveLevel } from './resolve.ts';

// A3d: `ResolvedLevel` completo (`resolveLevel`): campos de `ResolvedWall`, membranas, perfis de topo e de base e as faixas verticais
// recortadas pelos perfis (`withBottomProfile`, `withProfile`).

/** Seção `perfis_z` (esquema v7): um ponto por linha. `lista`: 0 topo derivado, 1 base derivada, 2 `Wall.topProfile` do modelo. */
export interface CenaA3d {
  colunas: ColunasA1;
  n: number;
}

/**
 * Projeto -> seção `perfis_z`. O JS calcula `wallZRange` (`zDoNivel`, como `resolveLevel`) e envia os perfis: o topo e a base derivados
 * (`WallZ.profile`, `WallZ.bottomProfile`) e o `topProfile` do modelo (só aplicado pelo `withProfile` quando não há topo derivado).
 */
export function montarPerfisA3d(p: Project, a1: CenaA1): CenaA3d {
  const c: ColunasA1 = { id_num: [], parede_num: [], lista: [], indice: [], t: [], h: [] };
  let proximo = 1;
  const zPorNivel = new Map<Id, ReturnType<typeof zDoNivel>>();
  for (const [wallId, num] of a1.idDe) {
    const w = p.elements[wallId] as Wall;
    let zs = zPorNivel.get(w.levelId);
    if (!zs) zPorNivel.set(w.levelId, (zs = zDoNivel(p, w.levelId)));
    const z = zs.get(wallId)!;
    const listas: Array<[number, ProfilePoint[] | null | undefined]> = [[0, z.profile], [1, z.bottomProfile], [2, w.topProfile]];
    for (const [lista, pts] of listas) {
      (pts ?? []).forEach((q, i) => {
        c['id_num']!.push(proximo++);
        c['parede_num']!.push(num);
        c['lista']!.push(lista);
        c['indice']!.push(i);
        c['t']!.push(q.t);
        c['h']!.push(q.h);
      });
    }
  }
  return { colunas: c, n: c['id_num']!.length };
}

/** Inclinação do topo de uma faixa (`LayerBand.slope`). */
export interface InclinacaoA3d {
  o: { x: number; y: number };
  d: { x: number; y: number };
  t0: number;
  t1: number;
  h0: number;
  h1: number;
}

export interface FaixaA3d extends FaixaA3c {
  slope?: InclinacaoA3d;
}

export interface CamadaA3d extends Omit<CamadaA3c, 'faixas'> {
  faixas: FaixaA3d[];
}

export interface MembranaA3d {
  camada: number;
  material: number;
  pts: Array<{ x: number; y: number }>;
}

/** Uma parede resolvida (`ResolvedWall` sem as camadas), com o grupo a que pertence. */
export interface ParedeA3d {
  id: number;
  grupo: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  u: { x: number; y: number };
  n: { x: number; y: number };
  length: number;
  sHi: number;
  sLo: number;
  baseZ: number;
  height: number;
  nominalZ0: number | undefined;
  nominalZ1: number | undefined;
  profileTop: ProfilePoint[] | undefined;
  profileBottom: ProfilePoint[] | undefined;
  membranas: MembranaA3d[];
}

/** `ResolvedLevel` na codificação do esquema: paredes na ordem dos grupos (`ResolvedCluster.wallIds`), camadas, regiões e silhuetas. */
export interface ResolvidoA3d {
  paredes: ParedeA3d[];
  camadas: CamadaA3d[];
  regioes: RegiaoA3c[];
  silhuetas: MultiPolygon[];
}

/** Argumentos de `resolver_nivel`: os mesmos de `cluster_resolvido`. */
export const argumentosA3d = argumentosA3c;

/** O que o motor TypeScript produz: `resolveLevel` com as opções de planta (cache próprio, vazio), campo a campo. */
export function referenciaA3d(p: Project, levelId: Id, cena: CenaA1, opcoes: OpcoesA3c = {}): ResolvidoA3d {
  const r = resolveLevel(p, levelId, new Map(), opcoes);
  const saida: ResolvidoA3d = { paredes: [], camadas: [], regioes: [], silhuetas: [] };
  r.clusters.forEach((c, grupo) => {
    for (const id of c.wallIds) {
      const w = r.walls[id]!;
      const parede = numeroDe(cena.idDe, id, 'parede');
      saida.paredes.push({
        id: parede,
        grupo,
        a: w.a,
        b: w.b,
        u: w.u,
        n: w.n,
        length: w.length,
        sHi: w.sHi,
        sLo: w.sLo,
        baseZ: w.baseZ,
        height: w.height,
        nominalZ0: w.nominalZ0,
        nominalZ1: w.nominalZ1,
        profileTop: w.profileTop,
        profileBottom: w.profileBottom,
        membranas: w.membranes.map((m) => ({ camada: m.layerIndex, material: numeroDe(cena.materialDe, m.materialId, 'material'), pts: m.pts })),
      });
      for (const l of w.layers) {
        const faixa = l.layerIndex < 0;
        saida.camadas.push({
          parede,
          grupo,
          faixa,
          indice: faixa ? -l.layerIndex - 1 : l.layerIndex,
          material: numeroDe(cena.materialDe, l.materialId, 'material'),
          core: l.core,
          prioridade: l.priority,
          raw: l.raw,
          fragment: l.fragment,
          cut: l.cut,
          faixas: l.bands.map((b) => ({ z0: b.z0, z1: b.z1, poly: b.poly, ...(b.slope ? { slope: b.slope } : {}) })),
        });
      }
    }
    for (const g of c.regions) saida.regioes.push({ grupo, material: numeroDe(cena.materialDe, g.materialId, 'material'), poligonos: g.polygons });
    saida.silhuetas.push(c.silhouette);
  });
  return saida;
}

/** Decodifica as saídas de `resolver_nivel` (arrays tipados do Rust) para o mesmo formato de `referenciaA3d`. */
export function decodificarA3d(s: Record<string, ArrayLike<number>>): ResolvidoA3d {
  const par = s['paredes']!;
  const num = s['paredes_num']!;
  const perfis = s['perfis']!;
  const mem = s['membranas']!;
  const memPts = s['membranas_pts']!;
  const fx = s['faixas']!;
  const perfil = (ini: number, n: number): ProfilePoint[] => Array.from({ length: n }, (_, k) => ({ t: perfis[2 * (ini + k)]!, h: perfis[2 * (ini + k) + 1]! }));
  const paredes: ParedeA3d[] = [];
  for (let i = 0; i < par.length / 8; i++) {
    const n = (k: number): number => num[15 * i + k]!;
    const id = par[8 * i]!;
    const membranas: MembranaA3d[] = [];
    for (let m = 0; m < mem.length / 3; m++) {
      if (mem[3 * m] !== id) continue;
      membranas.push({ camada: mem[3 * m + 1]!, material: mem[3 * m + 2]!, pts: [{ x: memPts[4 * m]!, y: memPts[4 * m + 1]! }, { x: memPts[4 * m + 2]!, y: memPts[4 * m + 3]! }] });
    }
    paredes.push({
      id,
      grupo: par[8 * i + 1]!,
      a: { x: n(0), y: n(1) },
      b: { x: n(2), y: n(3) },
      u: { x: n(4), y: n(5) },
      n: { x: n(6), y: n(7) },
      length: n(8),
      sHi: n(9),
      sLo: n(10),
      baseZ: n(11),
      height: n(12),
      nominalZ0: n(13),
      nominalZ1: n(14),
      profileTop: par[8 * i + 2] === 1 ? perfil(par[8 * i + 3]!, par[8 * i + 4]!) : undefined,
      profileBottom: par[8 * i + 5] === 1 ? perfil(par[8 * i + 6]!, par[8 * i + 7]!) : undefined,
      membranas,
    });
  }
  // As camadas, regiões e silhuetas têm a codificação de `cluster_resolvido`, com 11 valores por faixa (z0, z1, tem_slope, o, d, t0, t1, h0, h1).
  const nFaixas = fx.length / 11;
  const alturas = Array.from({ length: nFaixas * 2 }, (_, k) => fx[11 * (k >> 1) + (k & 1)]!);
  const inclinacao = (b: number): InclinacaoA3d | undefined =>
    fx[11 * b + 2] === 1 ? { o: { x: fx[11 * b + 3]!, y: fx[11 * b + 4]! }, d: { x: fx[11 * b + 5]!, y: fx[11 * b + 6]! }, t0: fx[11 * b + 7]!, t1: fx[11 * b + 8]!, h0: fx[11 * b + 9]!, h1: fx[11 * b + 10]! } : undefined;
  const base = decodificarA3c({
    camadas: s['camadas']!,
    camadas_num: s['camadas_num']!,
    camadas_formas: s['camadas_formas']!,
    faixas: alturas,
    faixas_forma: s['faixas_forma']!,
    regioes: s['regioes']!,
    silhuetas: s['silhuetas']!,
    poligonos: s['poligonos']!,
    aneis: s['aneis']!,
    pontos: s['pontos']!,
  });
  const cabecalho = s['camadas_formas']!;
  const camadas: CamadaA3d[] = base.camadas.map((c, i) => {
    const ini = cabecalho[8 * i + 6]!;
    return { ...c, faixas: c.faixas.map((f, k) => ({ ...f, ...(inclinacao(ini + k) ? { slope: inclinacao(ini + k)! } : {}) })) };
  });
  return { paredes, camadas, regioes: base.regioes, silhuetas: base.silhuetas };
}
