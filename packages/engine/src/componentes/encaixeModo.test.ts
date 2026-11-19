import { describe, expect, it } from 'vitest';
import { posarArrastado } from './encaixeArrasto.ts';
import { lerModoEncaixe, MODO_ENCAIXE_PADRAO, MODOS_ENCAIXE, opcoesDoModoEncaixe } from './encaixeModo.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };
const FACE: FaceDeParede = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };
const pose = (x: number, y: number, rotation = 0): Pose => ({ x, y, rotation, mirrored: false, z: 0 });
const vizinho: Corpo = { id: 'v', pose: pose(0.6, 0.56, Math.PI), caixa: CAIXA };
const alvo: Corpo = { id: 'alvo', pose: pose(0.75, 0.3, 0.02), caixa: CAIXA };

describe('posarArrastado com encaixeVizinho', () => {
  it('false: encosta só na parede (x literal do reencoste), sem vizinho', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2, encaixeVizinho: false });
    expect(r.pose.rotation).toBeCloseTo(3.141592653589793, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    expect(r.pose.x).toBeCloseTo(1.3443403753258403, 9);
    expect(r.parede).toBe(0);
    expect(r.vizinho).toBeUndefined();
  });

  it('true e omitido: encaixa no vizinho como antes (x = 1,2)', () => {
    for (const extra of [{ encaixeVizinho: true }, {}]) {
      const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2, ...extra });
      expect(r.pose.x).toBeCloseTo(1.2, 9);
      expect(r.vizinho).toBe('v');
    }
  });

  it('false sem parede: pose desejada intacta, vizinho ignorado, colisão e guias seguem', () => {
    const perto: Corpo = { id: 'alvo', pose: pose(0.63, 0.02, 0.05), caixa: CAIXA };
    const a: Corpo = { id: 'A', pose: pose(0, 0), caixa: CAIXA };
    const off = posarArrastado({ alvo: perto, outros: [a], faces: [] }, { encaixeVizinho: false });
    expect(off.pose).toEqual({ x: 0.63, y: 0.02, rotation: 0.05, mirrored: false, z: 0 });
    expect(off.vizinho).toBeUndefined();
    expect(off.guias.length).toBeGreaterThanOrEqual(0);
    const on = posarArrastado({ alvo: perto, outros: [a], faces: [] }, { encaixeVizinho: true });
    expect(on.pose.x).toBeCloseTo(0.6, 9);
    expect(on.vizinho).toBe('A');
  });
});

describe('modo de encaixe da interface', () => {
  it('valores e padrão', () => {
    expect(MODOS_ENCAIXE).toEqual(['parede', 'parede_vizinho', 'livre']);
    expect(MODO_ENCAIXE_PADRAO).toBe('parede');
  });
  it('tabela literal para as opções do arrasto', () => {
    expect(opcoesDoModoEncaixe('parede', false)).toEqual({ semEncaixe: false, encaixeVizinho: false });
    expect(opcoesDoModoEncaixe('parede_vizinho', false)).toEqual({ semEncaixe: false, encaixeVizinho: true });
    expect(opcoesDoModoEncaixe('livre', false)).toEqual({ semEncaixe: true, encaixeVizinho: false });
    expect(opcoesDoModoEncaixe('parede', true).semEncaixe).toBe(true);
    expect(opcoesDoModoEncaixe('parede_vizinho', true).semEncaixe).toBe(true);
    expect(opcoesDoModoEncaixe('livre', true).semEncaixe).toBe(true);
  });
  it('leitura de valor guardado inválido volta ao padrão', () => {
    expect(lerModoEncaixe('livre')).toBe('livre');
    expect(lerModoEncaixe('xx')).toBe('parede');
    expect(lerModoEncaixe(null)).toBe('parede');
  });
});
