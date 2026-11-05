/**
 * Adaptador da sub-etapa B3 do kernel Rust (decisão 0050 §3): cortadores por nível e junção entre pavimentos. NÃO calcula geometria de junção: só
 * (1) monta as seções `paredes_z_juncao` e `perfis_z_juncao` do esquema v11 (a cota e os perfis das paredes SEM `flatAttach`, a variante que a junção
 *     lê; o término por camada de piso e laje usa `flatAttach`, e as duas variantes convivem na mesma cena) e, desde a saída 3 da 0050, as faixas
 *     de parede da junção já resolvidas pelo TypeScript (`faixas_juncao` e `pontos_faixas_juncao`, em `montarFaixasB3`), que o Rust usa no lugar
 *     de recalcular a partição vertical (ver `crates/geom-wasm/schema/cena-v11.json`) e
 * (2) EXTRAI de `levelCutterSet` e `junctionLevel` o que o Rust produz em `junction_nivel`, na mesma codificação plana (ver
 *     `crates/geom-wasm/schema/cena-v11.json`), para o harness e os testes compararem.
 *
 * Os caches do TypeScript (`WeakMap`, LRU, assinatura `r6`) não migram. Os testes passam projetos novos a cada chamada, então o `WeakMap` por projeto não
 * devolve resultado de outro; o cache por assinatura de `junctionLevel` só reaproveita uma junção cujas peças sejam iguais a 1e-6.
 */
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import type { Id, ProfilePoint, Project, Slab, Wall } from '@hestia/model';
import type { CenaA1, ColunasA1 } from './kernelA1.ts';
import { zDoNivel } from './kernelA1.ts';
import type { CenaB1 } from './kernelB.ts';
import { argumentosB2 } from './kernelB.ts';
import { bandTopAt } from './profile.ts';
import { bandKey, junctionLevelTs, type JunctionLevel } from './junctionLevel.ts';
import { levelCutterSet, spanRange, type CutterSolid, type LevelCutters, type SolidPiece } from './junctionNet.ts';
import { resolveLevelTs } from './resolve.ts';
import { slabRiseAt } from './slabs.ts';
import { decodificarForma } from './kernelA2.ts';
import type { LayerBand } from './types.ts';

export const NOMES_SECOES_B3 = ['paredes_z_juncao', 'perfis_z_juncao', 'faixas_juncao', 'pontos_faixas_juncao'] as const;
export type NomeSecaoB3 = (typeof NOMES_SECOES_B3)[number];

export interface CenaB3 {
  secoes: Record<NomeSecaoB3, ColunasA1>;
  nLinhas: Record<NomeSecaoB3, number>;
  /** Paredes com linha na variante (a cota ou os perfis diferem dos do `flatAttach`, ou todas, com `todas`). */
  comVariante: number;
}

const iguais = (a: readonly ProfilePoint[] | null | undefined, b: readonly ProfilePoint[] | null | undefined): boolean => {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((q, i) => q.t === y[i]!.t && q.h === y[i]!.h);
};

/**
 * Projeto -> seções `paredes_z_juncao` e `perfis_z_juncao`. Só as paredes cuja cota ou perfil muda sem o `flatAttach` ganham linha (as demais valem pelas
 * seções base, montadas com `flatAttach`); `todas` manda todas as paredes, mesmo as iguais.
 */
export function montarCenaB3(p: Project, a1: CenaA1, opcoes: { todas?: boolean } = {}): CenaB3 {
  const z: ColunasA1 = { id_num: [], z0: [], altura: [] };
  const perfis: ColunasA1 = { id_num: [], parede_num: [], lista: [], indice: [], t: [], h: [] };
  const reais = new Map<Id, ReturnType<typeof zDoNivel>>();
  const planos = new Map<Id, ReturnType<typeof zDoNivel>>();
  let proximo = 1;
  let comVariante = 0;
  for (const [wallId, num] of a1.idDe) {
    const w = p.elements[wallId] as Wall;
    let r = reais.get(w.levelId);
    if (!r) reais.set(w.levelId, (r = zDoNivel(p, w.levelId, false)));
    let f = planos.get(w.levelId);
    if (!f) planos.set(w.levelId, (f = zDoNivel(p, w.levelId, true)));
    const real = r.get(wallId)!;
    const plano = f.get(wallId)!;
    const difere = real.z0 !== plano.z0 || real.height !== plano.height || !iguais(real.profile, plano.profile) || !iguais(real.bottomProfile, plano.bottomProfile);
    if (!difere && !opcoes.todas) continue;
    comVariante++;
    z['id_num']!.push(num);
    z['z0']!.push(real.z0);
    z['altura']!.push(real.height);
    const listas: Array<[number, ProfilePoint[] | null | undefined]> = [[0, real.profile], [1, real.bottomProfile], [2, w.topProfile]];
    for (const [lista, pts] of listas) {
      (pts ?? []).forEach((q, i) => {
        perfis['id_num']!.push(proximo++);
        perfis['parede_num']!.push(num);
        perfis['lista']!.push(lista);
        perfis['indice']!.push(i);
        perfis['t']!.push(q.t);
        perfis['h']!.push(q.h);
      });
    }
  }
  const fx = montarFaixasB3(p, a1);
  return {
    secoes: { paredes_z_juncao: z, perfis_z_juncao: perfis, faixas_juncao: fx.faixas, pontos_faixas_juncao: fx.pontos },
    nLinhas: { paredes_z_juncao: z['id_num']!.length, perfis_z_juncao: perfis['id_num']!.length, faixas_juncao: fx.nLinhas.faixas, pontos_faixas_juncao: fx.nLinhas.pontos },
    comVariante,
  };
}

/**
 * Faixas de parede da junção (saída 3 da 0050, esquema v11): para cada nível e cada parede, as faixas verticais de cada camada na ordem em que
 * `wallBandPieces` (junctionNet.ts) as vê, isto é, `resolveLevel(p, nível)` padrão (SEM `flatAttach`) DEPOIS dos perfis. Não há cálculo novo: o
 * que sai é o `LayerBand` do TypeScript, com a região dele. A junção do Rust usa essa partição no lugar dos pontos de quebra próprios.
 */
export function montarFaixasB3(p: Project, a1: CenaA1): { faixas: ColunasA1; pontos: ColunasA1; nLinhas: { faixas: number; pontos: number } } {
  const f: ColunasA1 = { id_num: [], nivel_num: [], parede_num: [], camada: [], banda: [], prioridade: [], nucleo: [], base_z: [], z0: [], z1: [], inclinada: [], o_x: [], o_y: [], d_x: [], d_y: [], t0: [], t1: [], h0: [], h1: [] };
  const v: ColunasA1 = { id_num: [], faixa_num: [], poligono: [], anel: [], indice: [], x: [], y: [] };
  let idFaixa = 0;
  let idPonto = 0;
  for (const level of p.levels) {
    const nivel = a1.nivelDe.get(level.id);
    if (nivel === undefined) throw new Error(`nível ${level.id} sem nivel_num`);
    for (const rw of Object.values(resolveLevelTs(p, level.id).walls)) {
      const parede = a1.idDe.get(rw.wallId);
      if (parede === undefined) throw new Error(`parede ${rw.wallId} sem id_num`);
      for (const layer of rw.layers) {
        layer.bands.forEach((b, banda) => {
          idFaixa++;
          const s = b.slope;
          f['id_num']!.push(idFaixa);
          f['nivel_num']!.push(nivel);
          f['parede_num']!.push(parede);
          f['camada']!.push(layer.layerIndex);
          f['banda']!.push(banda);
          f['prioridade']!.push(layer.priority);
          f['nucleo']!.push(layer.core ? 1 : 0);
          f['base_z']!.push(rw.baseZ);
          f['z0']!.push(b.z0);
          f['z1']!.push(b.z1);
          f['inclinada']!.push(s ? 1 : 0);
          f['o_x']!.push(s?.o.x ?? 0);
          f['o_y']!.push(s?.o.y ?? 0);
          f['d_x']!.push(s?.d.x ?? 0);
          f['d_y']!.push(s?.d.y ?? 0);
          f['t0']!.push(s?.t0 ?? 0);
          f['t1']!.push(s?.t1 ?? 0);
          f['h0']!.push(s?.h0 ?? 0);
          f['h1']!.push(s?.h1 ?? 0);
          b.poly.forEach((pol, poligono) =>
            pol.forEach((anel, ai) =>
              anel.forEach((q, indice) => {
                idPonto++;
                v['id_num']!.push(idPonto);
                v['faixa_num']!.push(idFaixa);
                v['poligono']!.push(poligono);
                v['anel']!.push(ai);
                v['indice']!.push(indice);
                v['x']!.push(q.x);
                v['y']!.push(q.y);
              }),
            ),
          );
        });
      }
    }
  }
  return { faixas: f, pontos: v, nLinhas: { faixas: idFaixa, pontos: idPonto } };
}

/** Argumentos de `junction_nivel`: o nível e a tolerância de junção do projeto (os mesmos de `pisos_lajes_com_paredes`). */
export const argumentosB3 = argumentosB2;

/** Tipo de elemento no esquema (`JunctionKind`): 0 parede, 1 piso, 2 laje. */
export const TIPO_B3 = { wall: 0, floor: 1, slab: 2 } as const;

/** Uma peça (`SolidPiece`) na codificação do esquema; `span` é a função de cota da peça. */
export interface PecaB3 {
  meta: { tipo: number; prioridade: number; nucleo: boolean; explicita: boolean; dono: number; camada: number; banda: number | null } | null;
  externa: boolean;
  plana: boolean;
  poligono: MultiPolygon;
  span: (q: Vec2) => readonly [number, number];
  /** `spanRange`: a envolvente das cotas nos vértices (null sem vértices). */
  faixa: readonly [number, number] | null;
}

export interface CortadorB3 {
  tipo: number;
  pecas: PecaB3[];
}

export interface ParteB3 {
  poligono: MultiPolygon;
  z0: number;
  z1: number;
}

export interface ElementoJuncaoB3 {
  tipo: number;
  dono: number;
  corte: boolean;
  camadas: Array<{ camada: number; partes: ParteB3[] }>;
  regiao: MultiPolygon;
}

export interface ParedeJuncaoB3 {
  parede: number;
  corte: boolean;
  faixas: Array<{ camada: number; banda: number; partes: ParteB3[] }>;
}

/** O que `levelCutterSet` e `junctionLevel` produzem para um nível, na codificação do esquema. */
export interface JuncaoB3 {
  /** Pisos, depois lajes e depois paredes (a ordem de `LevelCutters`). */
  cortadores: CortadorB3[];
  elementos: ElementoJuncaoB3[];
  paredes: ParedeJuncaoB3[];
}

const numero = (m: Map<Id, number>, id: Id, o: string): number => {
  const n = m.get(id);
  if (n === undefined) throw new Error(`${o} ${id} sem número interno`);
  return n;
};

/** O que o motor TypeScript produz: `levelCutterSet` (cortadores) e `junctionLevel` (junção) do nível, campo a campo. Não passa por cache do Rust. */
export const referenciaB3 = (p: Project, levelId: Id, cena: CenaB1, a1: CenaA1): JuncaoB3 => referenciaB3De(levelCutterSet(p, levelId), junctionLevelTs(p, levelId), cena, a1);

/** A mesma extração a partir dos cortadores e da junção já calculados pelo TypeScript (o modo sombra reaproveita o que acabou de calcular). */
export function referenciaB3De(set: LevelCutters, jl: JunctionLevel, cena: CenaB1, a1: CenaA1): JuncaoB3 {
  const dono = (tipo: string, id: Id): number => numero(tipo === 'wall' ? a1.idDe : tipo === 'floor' ? cena.pisoDe : cena.lajeDe, id, tipo);
  const peca = (sp: SolidPiece): PecaB3 => ({
    meta: sp.meta
      ? { tipo: TIPO_B3[sp.meta.kind], prioridade: sp.meta.priority, nucleo: sp.meta.core, explicita: sp.meta.explicit === true, dono: dono(sp.meta.kind, sp.meta.owner), camada: sp.meta.layerIndex ?? -1, banda: sp.meta.bandIndex ?? null }
      : null,
    externa: sp.external === true,
    plana: sp.flat,
    poligono: sp.poly,
    span: sp.span,
    faixa: spanRange(sp),
  });
  const cortadores: CortadorB3[] = [...set.floors, ...set.slabs, ...set.walls].map((c: CutterSolid) => ({ tipo: TIPO_B3[c.kind], pecas: c.pieces.map(peca) }));
  const partes = (ps: ReadonlyArray<{ poly: MultiPolygon; z0: number; z1: number }>): ParteB3[] => ps.map((x) => ({ poligono: x.poly, z0: x.z0, z1: x.z1 }));
  const elementos: ElementoJuncaoB3[] = [...jl.elements].map(([id, e]) => {
    const tipo = cena.pisoDe.has(id) ? TIPO_B3.floor : TIPO_B3.slab;
    return { tipo, dono: dono(tipo === TIPO_B3.floor ? 'floor' : 'slab', id), corte: e.cut, camadas: e.layers.map((l) => ({ camada: l.layerIndex, partes: partes(l.parts) })), regiao: e.region };
  });
  const paredes: ParedeJuncaoB3[] = [...jl.walls].map(([id, w]) => ({
    parede: dono('wall', id),
    corte: w.cut,
    faixas: [...w.bands].map(([chave, ps]) => {
      const [camada, banda] = chave.split('/').map(Number) as [number, number];
      return { camada, banda, partes: partes(ps) };
    }),
  }));
  return { cortadores, elementos, paredes };
}

/** Os mesmos `Slab` e as funções de cota de uma saída do Rust: `slabRiseAt` e `bandTopAt` do motor, alimentadas com os parâmetros devolvidos. */
function spanDe(num: ArrayLike<number>, o: number, plana: boolean): (q: Vec2) => readonly [number, number] {
  const tipo = num[o + 2]!;
  const z0 = num[o + 3]!;
  const z1 = num[o + 4]!;
  if (tipo === 1) {
    const slope: NonNullable<Slab['slope']> = { origin: { x: num[o + 6]!, y: num[o + 7]! }, dir: { x: num[o + 8]!, y: num[o + 9]! }, percent: num[o + 10]! };
    return (q) => [z0 + slabRiseAt(slope, q), z1 + slabRiseAt(slope, q)] as const;
  }
  if (tipo === 2) {
    const baseZ = num[o + 5]!;
    const band: LayerBand = { z0, z1, poly: [], ...(plana ? {} : { slope: { o: { x: num[o + 6]!, y: num[o + 7]! }, d: { x: num[o + 8]!, y: num[o + 9]! }, t0: num[o + 10]!, t1: num[o + 11]!, h0: num[o + 12]!, h1: num[o + 13]! } }) };
    return (q) => [baseZ + z0, baseZ + bandTopAt(band, q)] as const;
  }
  return () => [z0, z1] as const;
}

/** Decodifica as saídas de `junction_nivel` (arrays tipados do Rust) para o mesmo formato de `referenciaB3`. */
export function decodificarB3(s: Record<string, ArrayLike<number>>): JuncaoB3 {
  const forma = (ini: number, n: number): MultiPolygon => decodificarForma(s['poligonos']!, s['aneis']!, s['pontos']!, ini, n);
  const cort = s['cortadores']!;
  const pecasU = s['pecas']!;
  const pecasN = s['pecas_num']!;
  const cortadores: CortadorB3[] = [];
  for (let i = 0; i < cort.length / 3; i++) {
    const pecas: PecaB3[] = [];
    for (let k = cort[3 * i + 2]!; k < cort[3 * i + 2]! + cort[3 * i + 1]!; k++) {
      const u = (j: number): number => pecasU[11 * k + j]!;
      const o = 16 * k;
      const plana = u(6) === 1;
      pecas.push({
        meta: u(0) === 1 ? { tipo: u(1), prioridade: pecasN[o + 1]!, nucleo: u(4) === 1, explicita: u(3) === 1, dono: u(2), camada: pecasN[o]!, banda: u(7) === 1 ? u(8) : null } : null,
        externa: u(5) === 1,
        plana,
        poligono: forma(u(9), u(10)),
        span: spanDe(pecasN, o, plana),
        faixa: pecasN[o + 14]! <= pecasN[o + 15]! ? ([pecasN[o + 14]!, pecasN[o + 15]!] as const) : null,
      });
    }
    cortadores.push({ tipo: cort[3 * i]!, pecas });
  }
  const partesU = s['partes']!;
  const partesZ = s['partes_z']!;
  const partes = (ini: number, n: number): ParteB3[] => Array.from({ length: n }, (_, j) => ({ poligono: forma(partesU[2 * (ini + j)]!, partesU[2 * (ini + j) + 1]!), z0: partesZ[2 * (ini + j)]!, z1: partesZ[2 * (ini + j) + 1]! }));
  const el = s['elementos']!;
  const cam = s['camadas']!;
  const camIdx = s['camadas_indice']!;
  const elementos: ElementoJuncaoB3[] = [];
  for (let i = 0; i < el.length / 7; i++) {
    const e = (j: number): number => el[7 * i + j]!;
    elementos.push({
      tipo: e(0),
      dono: e(1),
      corte: e(2) === 1,
      camadas: Array.from({ length: e(4) }, (_, j) => ({ camada: camIdx[e(3) + j]!, partes: partes(cam[2 * (e(3) + j)]!, cam[2 * (e(3) + j) + 1]!) })),
      regiao: forma(e(5), e(6)),
    });
  }
  const pa = s['paredes']!;
  const fx = s['faixas']!;
  const fxCam = s['faixas_camada']!;
  const paredes: ParedeJuncaoB3[] = [];
  for (let i = 0; i < pa.length / 4; i++) {
    const w = (j: number): number => pa[4 * i + j]!;
    paredes.push({
      parede: w(0),
      corte: w(1) === 1,
      faixas: Array.from({ length: w(3) }, (_, j) => ({ camada: fxCam[w(2) + j]!, banda: fx[3 * (w(2) + j) + 2]!, partes: partes(fx[3 * (w(2) + j)]!, fx[3 * (w(2) + j) + 1]!) })),
    });
  }
  return { cortadores, elementos, paredes };
}

/** A chave de uma faixa de parede como o TypeScript a escreve (`bandKey`): para os testes. */
export const chaveDaFaixa = bandKey;
