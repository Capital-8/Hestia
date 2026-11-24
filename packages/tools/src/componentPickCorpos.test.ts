import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, type Component, type Corpo, type Familia } from '@hestia/model';
import { componentAt, componentIdsInBox } from './pick.ts';
import { makeEnv } from './testEnv.ts';

/*
 * Pick de componente com corpos (ficha B5, planta): a pegada de clique é a silhueta de B3 do corpo, não a caixa dos corpos.
 * A família não tem peças (`pecas: []`), então só o corpo define a pegada.
 */

const MPP = 0.001; // tolerância de 4 px = 4 mm: o clique na borda da caixa não "encosta" no círculo

/** Cilindro Ø100 em pé (extrusão no eixo Z), na origem da instância: na planta é um círculo de raio 50 mm. */
const cilindro = (): Corpo => ({
  id: 'cil',
  nome: 'Cilindro',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'], rotacao: ['0', '0', '0'] },
});

/** Tubo Ø50 × 1 m deitado em X, a partir da origem da instância (silhueta na planta: retângulo 1 × 0,05). */
const tuboDeitado = (): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'], rotacao: ['0', '90', '0'] },
});

const familiaCom = (corpo: Corpo): Familia => ({ ...structuredClone(FAMILIA_ARMARIO), pecas: [], corpos: [corpo] });

const comp = (extra: Partial<Component> = {}): Omit<Component, 'order'> => ({
  id: 'c1',
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  x: 1,
  y: 2,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
  ...extra,
});

/** A família entra direto no projeto (como no teste de corpos do 3D): o comando de família exige zonas de peça. */
function ctxCom(corpo: Corpo) {
  const ctx = makeEnv();
  const familia = familiaCom(corpo);
  ctx.store.project.componentFamilies = { [familia.id]: familia };
  ctx.store.exec({ type: 'addComponent', component: comp() });
  return ctx;
}

describe('componentAt com corpos (ficha B5)', () => {
  it('clique dentro da silhueta do cilindro acha a instância', () => {
    const ctx = ctxCom(cilindro());
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1, y: 2 }, MPP)).toBe('c1');
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.03, y: 2.02 }, MPP)).toBe('c1');
  });

  it('clique no canto da caixa dos corpos, fora do círculo, não acha a instância', () => {
    // Canto da caixa (±50 mm) a ~64 mm do centro: fora do círculo de raio 50 mm e além da tolerância de 4 mm.
    const ctx = ctxCom(cilindro());
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.045, y: 2.045 }, MPP)).toBeNull();
  });

  it('tubo deitado: clique no meio do comprimento acha a instância; clique além do fim não', () => {
    const ctx = ctxCom(tuboDeitado());
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.5, y: 2 }, MPP)).toBe('c1');
    expect(componentAt(ctx.store.project, 'lv_0', { x: 2.2, y: 2 }, MPP)).toBeNull();
  });
});

describe('componentIdsInBox com corpos (ficha B5)', () => {
  it('janela que cobre a silhueta inteira seleciona a instância; janela que corta o cilindro não', () => {
    const ctx = ctxCom(cilindro());
    expect(componentIdsInBox(ctx.store.project, 'lv_0', { x: 0.9, y: 1.9 }, { x: 1.1, y: 2.1 })).toEqual(['c1']);
    expect(componentIdsInBox(ctx.store.project, 'lv_0', { x: 0.9, y: 1.9 }, { x: 1.02, y: 2.1 })).toEqual([]);
  });
});
