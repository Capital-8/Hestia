/** Projeto de teste do guarda-corpo (decisão 0055, Fase 2): escada, rampa e três guarda-corpos (escada, rampa e manual). Usado pelos testes do adaptador e do wasm. */
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeLevel, makeRamp, makeStair, type Project, type StairCurve, type StairRun } from '@hestia/model';
import { planRamp, type RampPlan } from './rampPlan.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });

export function straight(n: number, spacing: number, width = 1.2): StairRun {
  const xs = Array.from({ length: n }, (_, k) => k * spacing);
  const b = (n - 1) * spacing + 0.5;
  return { id: 'run', kind: 'run', boundaryLeft: [ln(-0.5, width / 2, b, width / 2)], boundaryRight: [ln(-0.5, -width / 2, b, -width / 2)], risers: xs.map((x) => ln(x, -1, x, 1)), path: [] };
}

export interface CenaGCDeTeste {
  p: Project;
}

/** Projeto com a escada `st1` (lance reto de 17 espelhos), a rampa `rp1` e um guarda-corpo em cada hospedeiro, mais um manual. */
export function projetoGuardaCorpo(): CenaGCDeTeste {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [straight(17, 0.28)] }) });
  const rampType = createEmptyProject().rampTypes.rmt_nbr9050!;
  const plan = planRamp({ start: v(0, 5), dir: v(1, 0), H: 1.2, type: rampType, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 }) as RampPlan;
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 1.2 }) });
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
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_e', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: { lance: true, patamar: false } }, posicaoBase: 'degrau' } }) });
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_r', levelId: 'lv_0', typeId: 'gct_vidro', hospedeiro: { tipo: 'rampa', rampaId: 'rp1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'lateral' } }) });
  s.exec({
    type: 'addGuardaCorpo',
    guardaCorpo: makeGuardaCorpo({
      id: 'gc_m',
      levelId: 'lv_0',
      typeId: 'gct_cabos',
      cotaBase: 3,
      altura: 1.2,
      hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 11, dz: 0.5 }], fechado: false, ladoDeslocamento: 'esquerdo' },
    }),
  });
  return { p: s.project };
}
