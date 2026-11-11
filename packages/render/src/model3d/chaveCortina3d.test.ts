import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeWall } from '@hestia/model';
import { especCortinaTeste, projetoComCortina, tipoCortinaTeste } from '@hestia/engine/src/fixtureCortina.ts';
import { chavesDeCortina } from './chaveNivel3d.ts';

/** Duas cortinas em dois níveis (tipos diferentes), mais uma parede comum. */
function doisNiveis() {
  const s = new ProjectStore(projetoComCortina());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'N1', elevation: 3 }) });
  s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(especCortinaTeste({ u: { mode: 'fixedNumber', count: 3 } }), 'wt_ct2') });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct2', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  return s;
}

describe('chave do lote 3D das cortinas: hash, nunca o JSON da grade (ADR 0056 §9)', () => {
  it('só há chave para níveis com cortina', () => {
    expect([...chavesDeCortina(doisNiveis().project, 'm').keys()].sort()).toEqual(['lv_0', 'lv_1']);
    expect(chavesDeCortina(createEmptyProject(), 'm').size).toBe(0);
  });

  it('editar a grade de uma cortina muda só a chave do nível dela', () => {
    const s = doisNiveis();
    const antes = chavesDeCortina(s.project, 'm');
    s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(especCortinaTeste({ u: { mode: 'fixedNumber', count: 5 } }), 'wt_ct') });
    const depois = chavesDeCortina(s.project, 'm');
    expect(depois.get('lv_0')).not.toBe(antes.get('lv_0'));
    expect(depois.get('lv_1')).toBe(antes.get('lv_1'));
  });

  it('editar parede comum não muda a chave de nenhum nível; a marca da vista muda todas', () => {
    const s = doisNiveis();
    const antes = chavesDeCortina(s.project, 'm');
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w9', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 9 }, b: { x: 2, y: 9 }, height: 3 }) });
    expect(chavesDeCortina(s.project, 'm')).toEqual(antes);
    expect(chavesDeCortina(s.project, 'outra').get('lv_0')).not.toBe(antes.get('lv_0'));
  });

  it('o tamanho da chave não cresce com o número de células', () => {
    const pequena = chavesDeCortina(projetoComCortina(), 'm').get('lv_0')!;
    const grande = chavesDeCortina(projetoComCortina(especCortinaTeste({ u: { mode: 'fixedNumber', count: 100 }, v: { mode: 'fixedNumber', count: 30 } })), 'm').get('lv_0')!;
    expect(Math.abs(grande.length - pequena.length)).toBeLessThanOrEqual(2);
    expect(grande.length).toBeLessThan(20);
  });

  it('ocultar uma cortina muda a chave só do nível dela', () => {
    const s = doisNiveis();
    const antes = chavesDeCortina(s.project, 'm', { ocultos: new Set(), revelados: new Set() });
    const depois = chavesDeCortina(s.project, 'm', { ocultos: new Set(['ct2']), revelados: new Set() });
    expect(depois.get('lv_0')).toBe(antes.get('lv_0'));
    expect(depois.get('lv_1')).not.toBe(antes.get('lv_1'));
  });
});
