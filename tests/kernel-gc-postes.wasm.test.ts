/**
 * Postes e balaústres do guarda-corpo hospedado numa escada, pelo caminho REAL do app: tipo de fábrica -> linhas do kernel -> Rust -> malha 3D.
 * A seção inteira de CADA poste e de CADA balaústre tem de ficar sobre a planta da escada ACABADA (degraus, patamares e a faixa do bocel):
 * recuada da borda lateral e inteira sobre o piso (nunca na quina nem sobre o espelho). Escadas variadas (reta, L, U, patamar, winder, livre em
 * ângulos, leque, caracol, oblíqua), os dois lados, sentido normal e invertido, com e sem acabamento (bocel). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { straight } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { ServicoGuardaCorpo, definirGerenciadorDoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { generateFanRun, generateLShape, generateSpiralRun, generateUShape, generateWinderL, planRamp, planStairFree, resolveRamps, resolveStairs, stairFinishModel, type RampPlan, type StairComponentSketch } from '../packages/engine/src/index.ts';
import { asMulti, offsetMulti, pointInPolygon, union, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, makeGuardaCorpo, makeLevel, makeRamp, makeStair, type Project, type StairCurve, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const v = (x: number, y: number): Vec2 => ({ x, y });
const deg = (d: number): number => (d * Math.PI) / 180;
/** Folga numérica: a grade do Clipper é de 1 µm; qualquer vértice a mais de 10 µm fora da planta reprova. */
const TOL = 1e-5;
const ACABAMENTO = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.015 } as const;
const mono = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;

type Componentes = Array<StairRun | StairLanding>;
const fromSketch = (list: StairComponentSketch[]): Componentes =>
  list.map((c, i) => (c.kind === 'run' ? { id: `run${i}`, kind: 'run' as const, ...c.run } : { id: `land${i}`, kind: 'landing' as const, boundary: c.landing.boundary }));
function livre(path: Vec2[], H: number, width: number): Componentes {
  const r = planStairFree(path, H, mono, { width });
  if ('error' in r) throw new Error(r.error);
  return fromSketch(r.parts);
}
const turnPath = (theta: number, sign: 1 | -1): Vec2[] => {
  const t = deg(theta) * sign;
  return [v(0, 0), v(3, 0), v(3 + 3 * Math.cos(t), 3 * Math.sin(t))];
};
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
/** Lance em paralelogramo: limites retos e espelhos oblíquos a `alpha` graus do eixo. */
function oblique(alpha: number, n: number, p: number, w: number): StairRun {
  const t = Math.tan(deg(alpha - 90));
  const x = (k: number, y: number): number => k * p + y * t;
  const L = (n - 1) * p;
  return {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(v(-1.5, w / 2), v(L + 1.5, w / 2))],
    boundaryRight: [ln(v(-1.5, -w / 2), v(L + 1.5, -w / 2))],
    risers: Array.from({ length: n }, (_, k) => ln(v(x(k, -w / 2 - 0.2), -w / 2 - 0.2), v(x(k, w / 2 + 0.2), w / 2 + 0.2))),
    path: [],
  } as StairRun;
}

interface Caso {
  nome: string;
  componentes: () => Componentes;
  altura: number;
}
const casos: Caso[] = [
  { nome: 'reta 17 espelhos', componentes: () => [straight(17, 0.28)], altura: 2.8 },
  { nome: 'reta estreita (0,8 m)', componentes: () => [straight(12, 0.28, 0.8)], altura: 2.0 },
  { nome: 'L com patamar', componentes: () => fromSketch(generateLShape({ start: v(0, 0), dir: v(1, 0), width: 1.2, risersFirst: 8, risersSecond: 8, tread: 0.28, turn: 'left' })), altura: 2.8 },
  { nome: 'U com patamar (à direita)', componentes: () => fromSketch(generateUShape({ start: v(0, 0), dir: v(1, 0), width: 1.0, risersFirst: 8, risersSecond: 8, tread: 0.28, turn: 'right' })), altura: 2.8 },
  { nome: 'winder em L', componentes: () => fromSketch(generateWinderL({ start: v(0, 0), dir: v(1, 0), width: 1.0, risersFirst: 6, risersSecond: 6, tread: 0.28, turn: 'left', winderRisers: 4 })), altura: 2.8 },
  { nome: 'livre 45° esquerda', componentes: () => livre(turnPath(45, 1), 2.8, 1.0), altura: 2.8 },
  { nome: 'livre 90° direita', componentes: () => livre(turnPath(90, -1), 2.8, 1.0), altura: 2.8 },
  { nome: 'livre 135° esquerda', componentes: () => livre(turnPath(135, 1), 2.8, 1.0), altura: 2.8 },
  { nome: 'livre U', componentes: () => livre([v(0, 0), v(3, 0), v(3, 1.8), v(0, 1.8)], 2.8, 1.2), altura: 2.8 },
  { nome: 'livre dois giros 45°+60°', componentes: () => livre([v(0, 0), v(2.5, 0), v(4.5, 1.5), v(4.5, 4)], 3.2, 1.0), altura: 3.2 },
  { nome: 'oblíqua 60°', componentes: () => [oblique(60, 12, 0.28, 1.0)], altura: 2.1 },
  { nome: 'oblíqua 120°', componentes: () => [oblique(120, 12, 0.28, 1.0)], altura: 2.1 },
  { nome: 'leque 120°', componentes: () => [{ id: 'run', kind: 'run' as const, ...generateFanRun({ center: v(0, 0), innerRadius: 0.4, outerRadius: 1.4, startAngle: 0.3, endAngle: 0.3 + deg(120), risers: 10 }) } as StairRun], altura: 2.8 },
  { nome: 'caracol 270°', componentes: () => [{ id: 'run', kind: 'run' as const, ...generateSpiralRun({ center: v(0, 0), rInner: 0.3, rOuter: 1.2, startAngle: 0.3, sweep: deg(270), risers: 16 }) } as StairRun], altura: 2.8 },
];

/** Tipos de fábrica que têm poste (o corrimão de parede liga os postes só nas pontas, mas o teste cobre todos). */
const TIPOS = Object.keys(createEmptyProject().tiposGuardaCorpo);

/** Rampa com guarda-corpo hospedado nos dois lados (base no piso da rampa): reta, em L e em U (os patamares entram), pelo planejador do app. */
function projetoRampa(forma: 'straight' | 'lshape' | 'ushape', tipoId: string, inverter: boolean): { p: Project; plano: MultiPolygon } {
  const s = new ProjectStore(createEmptyProject());
  const rampType = createEmptyProject().rampTypes.rmt_nbr9050!;
  const plan = planRamp({ start: v(0, 0), dir: v(1, 0), H: 2.4, type: rampType, shape: forma, turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 }) as RampPlan;
  if ('error' in plan) throw new Error(String((plan as { error: string }).error));
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 2.4 }) });
  s.exec({
    type: 'addRamp',
    ramp: makeRamp({
      id: 'rp1',
      typeId: rampType.id,
      levelId: 'lv_0',
      topLevelId: 'lv_top',
      components: plan.parts.map((x, i) => (x.kind === 'run' ? { id: `c${i}`, kind: 'run' as const, ...x.run } : { id: `c${i}`, kind: 'landing' as const, ...x.landing })),
      inputMode: 'slope',
      slopeTarget: 1 / 12,
    }),
  });
  const lado = { lance: true, patamar: true };
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: tipoId, inverter, hospedeiro: { tipo: 'rampa', rampaId: 'rp1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  const rr = resolveRamps(s.project)[0]!;
  const plano = union(...rr.flights.map((x) => asMulti(x.polygon)), ...rr.landings.map((x) => asMulti(x.polygon)));
  return { p: s.project, plano };
}

function projeto(c: Caso, tipoId: string, acabamento: boolean, inverter: boolean): { p: Project; plano: MultiPolygon } {
  const s = new ProjectStore(createEmptyProject());
  let typeId = 'stt_monolitica';
  if (acabamento) {
    typeId = 'stt_acab';
    s.exec({ type: 'upsertStairType', stairType: { ...mono, id: typeId, ...ACABAMENTO } as StairType });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', topOffset: c.altura - 3, height: c.altura, components: c.componentes(), openingMargin: 0 }) });
  const lado = { lance: true, patamar: true };
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: tipoId, inverter, hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  const rs = resolveStairs(s.project)[0]!;
  // Planta da escada ACABADA: degraus e patamares mais os pisos acabados (que incluem o bocel à frente de cada degrau).
  const pisos = (stairFinishModel(rs)?.solids ?? []).filter((x) => x.kind === 'tread');
  const plano = union(...rs.steps.map((x) => asMulti(x.polygon)), ...pisos.map((x) => asMulti(x.polygon)));
  return { p: s.project, plano };
}

interface Secao {
  papel: string;
  /** Vértices da seção (planta) deduplicados. */
  pontos: Vec2[];
  z0: number;
  z1: number;
}

/** Peças de poste e balaústre da malha: cada componente conexa de triângulos é uma peça. */
function pecas(p: Project): Secao[] {
  definirGerenciadorDoGuardaCorpo(() => ger);
  const malhas = new ServicoGuardaCorpo(() => ger).malhas(p);
  if (!malhas || !malhas[0]) throw new Error('malha do guarda-corpo indisponível');
  const out: Secao[] = [];
  for (const parte of malhas[0].partes.filter((x) => x.papel === 'poste' || x.papel === 'balaustre')) {
    const n = parte.positions.length / 3;
    const pai = Array.from({ length: n }, (_, i) => i);
    const raiz = (a: number): number => {
      while (pai[a] !== a) a = pai[a] = pai[pai[a]!]!;
      return a;
    };
    for (let i = 0; i < parte.indices.length; i += 3) {
      const a = raiz(parte.indices[i]!);
      for (const j of [1, 2]) {
        const b = raiz(parte.indices[i + j]!);
        if (a !== b) pai[b] = a;
      }
    }
    const grupos = new Map<number, number[]>();
    for (let i = 0; i < n; i++) grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i]);
    for (const idx of grupos.values()) {
      const zs = idx.map((i) => parte.positions[3 * i + 2]!);
      const vistos = new Map<string, Vec2>();
      for (const i of idx) {
        const q = v(parte.positions[3 * i]!, parte.positions[3 * i + 1]!);
        vistos.set(`${q.x.toFixed(6)}|${q.y.toFixed(6)}`, q);
      }
      out.push({ papel: parte.papel, pontos: [...vistos.values()], z0: Math.min(...zs), z1: Math.max(...zs) });
    }
  }
  return out;
}

/** Menor distância de `q` ao contorno de `plano` (m). */
function distanciaAoContorno(q: Vec2, plano: MultiPolygon): number {
  let melhor = Infinity;
  for (const poly of plano) {
    for (const anel of poly) {
      for (let i = 0; i < anel.length; i++) {
        const a = anel[i]!;
        const b = anel[(i + 1) % anel.length]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        melhor = Math.min(melhor, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
      }
    }
  }
  return melhor;
}

/** Peças cuja seção sai da planta (algum vértice a mais de `TOL` fora): `papel em (x, y)` com quantos vértices e a pior distância (mm). */
function foraDaPlanta(secoes: Secao[], plano: MultiPolygon): string[] {
  const largo = offsetMulti(plano, TOL);
  const dentro = (q: Vec2): boolean => largo.some((poly) => pointInPolygon(q, poly));
  const ruins: string[] = [];
  for (const sc of secoes) {
    const fora = sc.pontos.filter((q) => !dentro(q));
    if (fora.length === 0) continue;
    const cx = sc.pontos.reduce((a, q) => a + q.x, 0) / sc.pontos.length;
    const cy = sc.pontos.reduce((a, q) => a + q.y, 0) / sc.pontos.length;
    const pior = Math.max(...fora.map((q) => distanciaAoContorno(q, plano)));
    ruins.push(`${sc.papel} em (${cx.toFixed(3)}, ${cy.toFixed(3)}): ${fora.length} de ${sc.pontos.length} vértices fora da planta, o pior a ${(pior * 1000).toFixed(1)} mm`);
  }
  return ruins;
}

describe('postes e balaústres do guarda-corpo na escada: a seção inteira fica sobre a planta do degrau acabado', () => {
  for (const c of casos) {
    for (const tipoId of TIPOS) {
      for (const acab of [false, true]) {
        for (const inverter of [false, true]) {
          it.skipIf(!bytes)(`${c.nome} | ${tipoId}${acab ? ' | acabamento' : ''}${inverter ? ' | invertido' : ''}`, () => {
            const { p, plano } = projeto(c, tipoId, acab, inverter);
            const s = pecas(p);
        
            const ruins = foraDaPlanta(s, plano);
            expect(ruins.length, ruins.slice(0, 8).join(' ; ')).toBe(0);
          });
        }
      }
    }
  }
});

describe('postes e balaústres do guarda-corpo na rampa: a seção inteira fica sobre a planta da rampa e do patamar', () => {
  for (const forma of ['straight', 'lshape', 'ushape'] as const) {
    for (const tipoId of TIPOS) {
      for (const inverter of [false, true]) {
        it.skipIf(!bytes)(`rampa ${forma} | ${tipoId}${inverter ? ' | invertido' : ''}`, () => {
          const { p, plano } = projetoRampa(forma, tipoId, inverter);
          const ruins = foraDaPlanta(pecas(p), plano);
          expect(ruins.length, ruins.slice(0, 8).join(' ; ')).toBe(0);
        });
      }
    }
  }
});
