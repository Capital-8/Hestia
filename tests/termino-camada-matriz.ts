/**
 * Matriz do término por camada da parede (decisão 0054): cada configuração (função x lado x face x cm), os presets e os modos antigos, em laje e piso,
 * na parede externa (elemento de perímetro e elemento vinculado ao cômodo) e na interna. A posição esperada da borda sai das espessuras, por uma conta
 * própria (coordenada `u` medida a partir da face da parede voltada para o elemento), sem usar `bordaDaCamada`. Compartilhada entre o teste do motor
 * TypeScript e o do Rust (wasm).
 */
import { intersection, multiArea } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, makeWall, type Layer, type LayerLimiteExterno, type LayerTermino, type OutlineSource, type Project, type TerminoCamada } from '@hestia/model';
import { resolveSlabs } from '../packages/engine/src/slabs.ts';
import { resolveFloors } from '../packages/engine/src/floors.ts';

const M = { kind: 'miter' as const, flip: false };
const B = { kind: 'butt' as const, flip: false };
const cam = (f: Layer['function'], mat: string, t: number): Layer => ({ function: f, materialId: mat, thickness: t, wraps: false });

/** Da face externa (d = 0) para a interna. */
export const PAREDE: ReadonlyArray<readonly [string, number]> = [['finish2', 0.01], ['substrate', 0.02], ['thermal', 0.03], ['membrane', 0.002], ['structure', 0.1], ['substrate', 0.02], ['finish1', 0.01]];
export const T = PAREDE.reduce((s, [, e]) => s + e, 0);

/** Borda esperada (profundidade d desde a face externa) para a regra, com o elemento do lado `lado` da parede. */
export function bordaEsperada(r: TerminoCamada, lado: 'ext' | 'int', camadas: ReadonlyArray<readonly [string, number]> = PAREDE): number {
  const T = camadas.reduce((s, [, e]) => s + e, 0);
  const ordem = lado === 'ext' ? camadas.map(([f, e]) => ({ f, e })) : camadas.map(([f, e]) => ({ f, e })).reverse();
  const ls: Array<{ f: string; u0: number; u1: number }> = [];
  for (const c of ordem) {
    const u0 = ls.length ? ls[ls.length - 1]!.u1 : 0;
    ls.push({ f: c.f, u0, u1: u0 + c.e });
  }
  const deD = (u: number): number => (lado === 'ext' ? u : T - u);
  const avanco = (r.cm / 100) * (lado === 'ext' ? 1 : -1);
  if (r.funcao === 'eixo') return T / 2 + avanco;
  const metade = T / 2;
  const centro = (c: { u0: number; u1: number }): number => (c.u0 + c.u1) / 2;
  const prox = r.lado === 'proximo';
  const naMetade = (c: { u0: number; u1: number }): boolean => (prox ? centro(c) <= metade + 1e-9 : centro(c) >= metade - 1e-9);
  // proximo parte da face do elemento (u = 0); distante, da face oposta (u = T)
  const seq = prox ? ls : ls.slice().reverse();
  const c = seq.find((x) => naMetade(x) && x.f === r.funcao) ?? seq.find((x) => x.f === r.funcao) ?? seq.find((x) => naMetade(x));
  if (!c) return T / 2 + avanco;
  const u = r.face === 'proxima' ? c.u0 : r.face === 'distante' ? c.u1 : (c.u0 + c.u1) / 2;
  return deD(u) + avanco;
}

export interface CasoMatriz {
  nome: string;
  grupo: string;
  regra: LayerTermino;
  limite?: LayerLimiteExterno;
  /** Esperado explícito (modos antigos); nos de camada sai de `bordaEsperada`. */
  esperado?: { perimetroH: number[][]; perimetroV: number[][]; salaH: number[][] };
}

const FUNCOES = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2', 'eixo'] as const;
const LADOS = ['proximo', 'distante'] as const;
const FACES = ['proxima', 'meio', 'distante'] as const;

export const casosCamada = (): CasoMatriz[] => {
  const out: CasoMatriz[] = [];
  for (const funcao of FUNCOES) for (const lado of LADOS) for (const face of FACES) for (const cm of [0, 2, -2]) {
    out.push({ nome: `${funcao}/${lado}/${face}/${cm}`, grupo: 'camada', regra: { camada: { funcao, lado, face, cm } } });
  }
  const preset = (nome: string, funcao: TerminoCamada['funcao'], lado: TerminoCamada['lado'], face: TerminoCamada['face']): CasoMatriz => ({ nome, grupo: 'preset', regra: { camada: { funcao, lado, face, cm: 0 } } });
  out.push(preset('estrutura até o substrato externo', 'substrate', 'distante', 'proxima'), preset('estrutura até a face do núcleo', 'structure', 'proximo', 'proxima'), preset('até o eixo', 'eixo', 'proximo', 'proxima'));
  for (const limite of ['parede', 'nucleo'] as const) {
    for (const [funcao, lado, face] of [['substrate', 'distante', 'proxima'], ['structure', 'distante', 'distante'], ['finish2', 'proximo', 'proxima']] as const) {
      out.push({ nome: `limite ${limite}/${funcao}/${lado}/${face}`, grupo: 'limite', regra: { camada: { funcao, lado, face, cm: 0 } }, limite });
    }
  }
  out.push(...casosAntigos());
  return out;
};

/** Início e fim da camada de estrutura (o núcleo da parede), em profundidade desde a face externa. */
const NUCLEO = (() => {
  let d = 0;
  let ini = 0;
  let fim = T;
  for (const [f, e] of PAREDE) {
    if (f === 'structure') { ini = d; fim = d + e; }
    d += e;
  }
  return { ini, fim };
})();

/** Modos antigos (face, núcleo, passa, auto, cm). O `ate` depende da prioridade das camadas e fica fora da matriz exata. */
function casosAntigos(): CasoMatriz[] {
  const h = T / 2;
  const per = (xmin: number, xmax: number, ymin: number, ymax: number) => ({ perimetroH: [[xmin, xmax]], perimetroV: [[ymin, ymax]] });
  const caso = (nome: string, regra: LayerTermino, p: ReturnType<typeof per>, sala: number[][]): CasoMatriz => ({ nome, grupo: 'antigo', regra, esperado: { ...p, salaH: sala } });
  const nucOeste = -h + NUCLEO.fim; // face do núcleo voltada para dentro, na parede oeste
  const nucInterna = 3 - h + NUCLEO.ini; // face do núcleo da parede interna, lado oeste (d = 0 voltado para oeste)
  const out: CasoMatriz[] = [];
  out.push(caso('face', 'face', per(-h, 6 + h, -h, 4 + h), [[h, 3 - h]]));
  out.push(caso('auto', 'auto', per(-h, 6 + h, -h, 4 + h), [[nucOeste, nucInterna]]));
  out.push(caso('nucleo', 'nucleo', per(-h + NUCLEO.ini, 6 + h - NUCLEO.ini, -h + NUCLEO.ini, 4 + h - NUCLEO.ini), [[nucOeste, nucInterna]]));
  out.push(caso('passa', 'passa', per(-h, 6 + h, -h, 4 + h), [[-h, 3 + h]]));
  out.push(caso('cm 0', { cm: 0 }, per(-h, 6 + h, -h, 4 + h), [[h, 3 - h]]));
  for (const cm of [2, -2, 5]) {
    const k = cm / 100;
    out.push(caso(`cm ${cm}`, { cm }, per(-h - k, 6 + h + k, -h - k, 4 + h + k), [[h - k, 3 - h + k]]));
  }
  return out;
}

/** Casa de 6 x 4 m (eixos) com parede interna em x = 3, desenhada no sentido em que a face externa (d = 0) fica para fora. */
export function projetoDaMatriz(c: { regra: LayerTermino; limite?: LayerLimiteExterno }): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const t = base.wallTypes['wt_alv14']!;
  s.exec({ type: 'upsertWallType', wallType: { ...t, id: 'wt_m', name: 'm', code: 'm', layers: PAREDE.map(([f, e]) => cam(f as Layer['function'], 'mat_reboco', e)) } });
  const camadaElem: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.1, wraps: false, termino: c.regra, ...(c.limite ? { limiteExterno: c.limite } : {}) };
  s.exec({ type: 'upsertSlabType', slabType: { id: 'ls_m', name: 'm', code: 'm', description: '', cost: 0, layers: [camadaElem] } });
  s.exec({ type: 'upsertFloorType', floorType: { id: 'ft_m', name: 'm', code: 'm', description: '', cost: 0, layers: [camadaElem] } });
  const R = [[0, 0], [0, 4], [6, 4], [6, 0]] as const;
  R.forEach(([x, y], i) => {
    const [x2, y2] = R[(i + 1) % 4]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_m', levelId: 'lv_0', a: { x, y }, b: { x: x2, y: y2 }, height: 2.8, joinStart: M, joinEnd: M }) });
  });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'wi', typeId: 'wt_m', levelId: 'lv_0', a: { x: 3, y: 0 }, b: { x: 3, y: 4 }, height: 2.8, joinStart: B, joinEnd: B }) });
  const per: OutlineSource = { mode: 'perimeter', seed: { x: 1.5, y: 2 }, linked: true };
  const sala: OutlineSource = { mode: 'walls-finish', seed: { x: 1.5, y: 2 }, linked: true };
  const ret = (x0: number, x1: number) => [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 4 }, { x: x0, y: 4 }];
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'lp', typeId: 'ls_m', levelId: 'lv_0', heightOffset: 0.2, boundary: ret(0, 6), outlineSource: per }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'ls', typeId: 'ls_m', levelId: 'lv_0', heightOffset: 0.2, boundary: ret(0, 3), outlineSource: sala }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'fp', typeId: 'ft_m', levelId: 'lv_0', heightOffset: 0.2, boundary: ret(0, 6), outlineSource: per }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'fs', typeId: 'ft_m', levelId: 'lv_0', heightOffset: 0.2, boundary: ret(0, 3), outlineSource: sala }) });
  return s.project;
}

export type Intervalos = number[][];
export type Medida = { elemento: string; horizontal: Intervalos; vertical: Intervalos };

type Multi = ReadonlyArray<ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>>;

/** Intervalos [min, max] das peças do contorno que cruzam uma faixa fina (horizontal em y = 2, vertical em x = 1,5; longe dos cantos e das junções). */
function cortes(pol: Multi): { horizontal: Intervalos; vertical: Intervalos } {
  const faixa = (eixo: 'x' | 'y', c: number): Intervalos => {
    const h = 0.05;
    const r = eixo === 'x' ? [[[{ x: -5, y: c - h }, { x: 15, y: c - h }, { x: 15, y: c + h }, { x: -5, y: c + h }]]] : [[[{ x: c - h, y: -5 }, { x: c + h, y: -5 }, { x: c + h, y: 15 }, { x: c - h, y: 15 }]]];
    const cut = intersection(pol as never, r as never) as unknown as Multi;
    const out = cut.map((q) => { const v = q[0]!.map((pt) => pt[eixo]); return [Math.min(...v), Math.max(...v)]; });
    return out.sort((a, b) => a[0]! - b[0]!);
  };
  return { horizontal: faixa('x', 2), vertical: faixa('y', 1.5) };
}

/** Cortes do contorno da camada de cada laje e piso. */
export function medir(p: Project): Medida[] {
  const lajes = resolveSlabs(p, 'lv_0').map((r) => ({ elemento: (r as unknown as { slabId?: string; id?: string }).slabId ?? (r as unknown as { id: string }).id, ...cortes(r.layers[0]!.polygon as unknown as Multi) }));
  const pisos = resolveFloors(p, 'lv_0').map((r) => ({ elemento: (r as unknown as { floorId?: string; id?: string }).floorId ?? (r as unknown as { id: string }).id, ...cortes(r.layers[0]!.polygon as unknown as Multi) }));
  return [...lajes, ...pisos];
}

/** Esperado: perímetro (peças a oeste e a leste da parede interna, ou uma só se se sobrepõem) e cômodo oeste. */
export function esperadoCamada(c: CasoMatriz): { perimetroH: Intervalos; perimetroV: Intervalos; salaH: Intervalos } {
  if (c.esperado) return c.esperado;
  const r = (c.regra as { camada: TerminoCamada }).camada;
  const bInt = bordaEsperada(r, 'int');
  const bExt = bordaEsperada(r, 'ext');
  const faceO = 3 - T / 2;
  const oeste = [-T / 2 + bInt, faceO + bExt];
  const leste = [faceO + bInt, 6 + T / 2 - bInt];
  const perimetroH = oeste[1]! >= leste[0]! ? [[oeste[0]!, leste[1]!]] : [oeste, leste];
  return { perimetroH, perimetroV: [[-T / 2 + bInt, 4 + T / 2 - bInt]], salaH: [oeste] };
}

/** Cenários do caso real do dono: laje estática com excesso sub-micrométrico para o outro lado da parede externa, e laje que termina na junção em T. */
export type Cenario = 'excesso' | 't';
export const CENARIOS: ReadonlyArray<{ id: Cenario; nome: string }> = [
  { id: 'excesso', nome: 'laje estática passa 3e-7 m da face externa para o outro lado' },
  { id: 't', nome: 'laje estática termina na junção em T (sem ponta na parede externa)' },
];
const EXCESSO = 3e-7;

/** Projeto da matriz mais a laje `lq` e o piso `fq`, estáticos, do cenário. */
export function projetoDoCenario(c: { regra: LayerTermino }, cenario: Cenario): Project {
  const p = projetoDaMatriz(c);
  const s = new ProjectStore(p);
  const h = T / 2 + (cenario === 'excesso' ? EXCESSO : 0);
  const [x0, x1, y0, y1] = cenario === 'excesso' ? [-h, 6 + h, -h, 4 + h] : [0, 3, 0, 4];
  const boundary = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'lq', typeId: 'ls_m', levelId: 'lv_0', heightOffset: 0.2, boundary }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'fq', typeId: 'ft_m', levelId: 'lv_0', heightOffset: 0.2, boundary }) });
  return s.project;
}

/** Caixa [xmin, xmax, ymin, ymax] do contorno da camada de `lq` e de `fq`. */
export function caixasDoCenario(p: Project): Record<string, number[]> {
  const caixa = (pol: Multi): number[] => {
    const xs: number[] = [];
    const ys: number[] = [];
    // Peças de área desprezível (o excesso de 3e-7 m da laje estática fora da parede, que nenhuma regra alcança) ficam fora da caixa.
    for (const poly of pol) {
      if (multiArea([poly] as never) < 1e-4) continue;
      for (const ring of poly) for (const q of ring) { xs.push(q.x); ys.push(q.y); }
    }
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  const out: Record<string, number[]> = {};
  for (const r of resolveSlabs(p, 'lv_0')) { const id = (r as unknown as { slabId?: string; id?: string }).slabId ?? (r as unknown as { id: string }).id; if (id === 'lq') out.lq = caixa(r.layers[0]!.polygon as unknown as Multi); }
  for (const r of resolveFloors(p, 'lv_0')) { const id = (r as unknown as { floorId?: string; id?: string }).floorId ?? (r as unknown as { id: string }).id; if (id === 'fq') out.fq = caixa(r.layers[0]!.polygon as unknown as Multi); }
  return out;
}

/** Menor largura média (área sobre meio perímetro) entre as peças do contorno da camada 0 de `lq` e de `fq`: peça fio é a que fica abaixo de 1 µm. */
export function larguraMinimaDasPecas(p: Project): Record<string, number> {
  const menor = (pol: Multi): number => {
    let m = Infinity;
    for (const poly of pol) {
      let per = 0;
      for (const ring of poly) for (let i = 0; i < ring.length; i++) per += Math.hypot(ring[(i + 1) % ring.length]!.x - ring[i]!.x, ring[(i + 1) % ring.length]!.y - ring[i]!.y);
      m = Math.min(m, per > 0 ? (2 * multiArea([poly] as never)) / per : 0);
    }
    return m;
  };
  const out: Record<string, number> = {};
  for (const r of resolveSlabs(p, 'lv_0')) { const id = (r as unknown as { slabId?: string; id?: string }).slabId ?? (r as unknown as { id: string }).id; if (id === 'lq') out.lq = menor(r.layers[0]!.polygon as unknown as Multi); }
  for (const r of resolveFloors(p, 'lv_0')) { const id = (r as unknown as { floorId?: string; id?: string }).floorId ?? (r as unknown as { id: string }).id; if (id === 'fq') out.fq = menor(r.layers[0]!.polygon as unknown as Multi); }
  return out;
}

/** Caixa esperada do cenário (a borda sai de `bordaEsperada`, as mesmas contas da matriz). */
export function caixaEsperada(c: CasoMatriz, cenario: Cenario): number[] {
  const r = (c.regra as { camada: TerminoCamada }).camada;
  const bInt = bordaEsperada(r, 'int');
  const bExt = bordaEsperada(r, 'ext');
  if (cenario === 'excesso') return [-T / 2 + bInt, 6 + T / 2 - bInt, -T / 2 + bInt, 4 + T / 2 - bInt];
  // A laje termina em x = 3: a regra da parede interna pode recuá-la, mas nenhuma regra a faz passar do fim dela nem do fim da camada na parede interna.
  return [-T / 2 + bInt, Math.max(3, 3 - T / 2 + bExt), -T / 2 + bInt, 4 + T / 2 - bInt];
}
