import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { makeGuardaCorpo } from './guardaCorpo.ts';
import { makeStair } from './stair.ts';
import { isGuardaCorpo, type GuardaCorpo } from './types.ts';

function cena(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gm', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'manual', uso: 'livre', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0.5 }], fechado: false, ladoDeslocamento: 'esquerdo' } }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st', typeId: Object.keys(s.project.stairTypes)[0]!, levelId: 'lv_0', topLevelId: null, baseOffset: 0, topOffset: 0, height: 2.8 }) });
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gh', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st', lados: { esquerdo: { lance: true, patamar: true }, direito: { lance: false, patamar: false } }, posicaoBase: 'degrau' } }) });
  return s;
}
const g = (s: ProjectStore, id: string): GuardaCorpo => s.project.elements[id] as GuardaCorpo;

describe('comando transform e o guarda-corpo (ADR 0055 §25)', () => {
  it('manual: mover, girar e espelhar transformam o caminho e mantêm o desnível; espelhar troca o lado', () => {
    const s = cena();
    s.exec({ type: 'transform', ids: ['gm'], transform: { kind: 'translate', d: { x: 1, y: 2 } } });
    expect(g(s, 'gm').hospedeiro).toMatchObject({ caminho: [{ x: 1, y: 2, dz: 0 }, { x: 5, y: 2, dz: 0.5 }] });
    s.exec({ type: 'transform', ids: ['gm'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    expect(g(s, 'gm').hospedeiro).toMatchObject({ ladoDeslocamento: 'direito', caminho: [{ x: 1, y: -2 }, { x: 5, y: -2 }] });
    s.undo();
    expect(g(s, 'gm').hospedeiro).toMatchObject({ ladoDeslocamento: 'esquerdo' });
  });

  it('hospedado sozinho no comando transform não muda; com a escada, só o espelho troca os lados', () => {
    const s = cena();
    const antes = structuredClone(g(s, 'gh'));
    s.exec({ type: 'transform', ids: ['gh'], transform: { kind: 'translate', d: { x: 9, y: 9 } } });
    expect(g(s, 'gh')).toEqual(antes);
    s.exec({ type: 'transform', ids: ['st'], transform: { kind: 'translate', d: { x: 9, y: 9 } } });
    expect(g(s, 'gh')).toEqual(antes);
    s.exec({ type: 'transform', ids: ['st'], transform: { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    expect(g(s, 'gh').hospedeiro).toMatchObject({ lados: { esquerdo: { lance: false }, direito: { lance: true } } });
  });

  it('cópia da escada leva o guarda-corpo com o hospedeiro remapeado', () => {
    const s = cena();
    s.exec({ type: 'transform', ids: ['st'], transform: { kind: 'translate', d: { x: 5, y: 0 } }, copy: { idMap: { st: 'st2', gh: 'gh2' } } });
    expect(isGuardaCorpo(s.project.elements['gh2'])).toBe(true);
    expect(g(s, 'gh2').hospedeiro).toMatchObject({ tipo: 'escada', escadaId: 'st2' });
    expect(g(s, 'gh').hospedeiro).toMatchObject({ escadaId: 'st' });
  });
});
