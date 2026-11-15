import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, estimarTamanhoSerializado, type Generic, type Project } from '@hestia/model';
import { AUTOSAVE_OCIOSO, AUTOSAVE_TETO, gravarAutosave, type DepsAutosave } from './autosave.ts';
import { AUTOSAVE_KEY } from './storage.ts';

/** Projeto com um genérico cuja malha tem `numeros` números (posições + índices). */
function comMalha(numeros: number): Project {
  const p = createEmptyProject('t');
  const g = { id: 'g1', kind: 'generic', mesh: { positions: new Float32Array(numeros - 3), indices: new Uint32Array(3) } } as unknown as Generic;
  (p.elements as Record<string, unknown>)['g1'] = g;
  return p;
}

function deps(): DepsAutosave & { ocioso: ReturnType<typeof vi.fn> } {
  return { serializar: vi.fn(() => 'json'), gravar: vi.fn(), remover: vi.fn(), ocioso: vi.fn((f: () => void) => f()) } as never;
}

describe('estimarTamanhoSerializado', () => {
  it('cresce com os números da malha e com os elementos', () => {
    const a = estimarTamanhoSerializado(createEmptyProject('t'));
    const b = estimarTamanhoSerializado(comMalha(1000));
    expect(b - a).toBeGreaterThanOrEqual(1000 * 10);
  });
  it('o limiar separa pequeno de grande', () => {
    expect(estimarTamanhoSerializado(comMalha(1000))).toBeLessThan(AUTOSAVE_OCIOSO);
    expect(estimarTamanhoSerializado(comMalha(AUTOSAVE_TETO / 10 + 10))).toBeGreaterThan(AUTOSAVE_TETO);
  });
});

describe('gravarAutosave', () => {
  it('projeto pequeno serializa e grava na hora', () => {
    const d = deps();
    expect(gravarAutosave(comMalha(300), () => true, d)).toBe('gravado');
    expect(d.serializar).toHaveBeenCalledTimes(1);
    expect(d.gravar).toHaveBeenCalledWith(AUTOSAVE_KEY, 'json');
    expect(d.remover).not.toHaveBeenCalled();
  });
  it('projeto grande não serializa, não grava e apaga o autosave antigo', () => {
    const d = deps();
    expect(gravarAutosave(comMalha(AUTOSAVE_TETO / 10 + 10), () => true, d)).toBe('pulado');
    expect(d.serializar).not.toHaveBeenCalled();
    expect(d.gravar).not.toHaveBeenCalled();
    expect(d.remover).toHaveBeenCalledWith(AUTOSAVE_KEY);
  });
  it('projeto médio adia para o momento ocioso e respeita a vigência', () => {
    const d = deps();
    const medio = comMalha(AUTOSAVE_OCIOSO / 10 + 1000);
    expect(gravarAutosave(medio, () => true, d)).toBe('adiado');
    expect(d.gravar).toHaveBeenCalledWith(AUTOSAVE_KEY, 'json');
    const d2 = deps();
    gravarAutosave(medio, () => false, d2);
    expect(d2.serializar).not.toHaveBeenCalled();
  });
});
