import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate } from '@hestia/model';
import { useUi } from './state.ts';
import { editor } from './controller.ts';
import { categoryIdsOf, mergeHidden, removeHidden, toggleRevealHidden, unhideInView, visibilityKeyOf, visibilityOf } from './viewVisibility.ts';

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, viewTemp: {}, selection: [] }));

const parede = (p: ReturnType<typeof buildTemplate>) => Object.values(p.elements).find((e) => e.kind === 'wall')!;
const porta = (p: ReturnType<typeof buildTemplate>) => Object.values(p.elements).find((e) => e.kind === 'door')!;

describe('visibilidade por vista', () => {
  it('chave por vista: piso, cobertura, área, corte e 3D são distintos', () => {
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0' });
    expect(visibilityKeyOf(useUi.getState())).toBe('plan:lv_0');
    useUi.setState({ planKind: 'roof' });
    expect(visibilityKeyOf(useUi.getState())).toBe('roof:lv_0');
    useUi.setState({ planKind: 'area', areaPlanId: 'ap1' });
    expect(visibilityKeyOf(useUi.getState())).toBe('area:ap1');
    useUi.setState({ view: 'section', sectionId: 'sec1' });
    expect(visibilityKeyOf(useUi.getState())).toBe('section:sec1');
    useUi.setState({ view: '3d' });
    expect(visibilityKeyOf(useUi.getState())).toBe('3d');
  });

  it('junta e remove ocultações sem repetir', () => {
    expect(mergeHidden({ elements: ['a'], categories: ['wall'] }, { elements: ['a', 'b'], categories: ['door'] })).toEqual({ elements: ['a', 'b'], categories: ['wall', 'door'] });
    expect(removeHidden({ elements: ['a', 'b'], categories: ['wall'] }, { elements: ['a'], categories: ['wall'] })).toEqual({ elements: ['b'] });
    expect(removeHidden({ elements: ['a'] }, { elements: ['a'] })).toBeUndefined();
  });

  it('hide permanente e categoria oculta somem; Reveal os devolve com borda', () => {
    const p = structuredClone(buildTemplate('house2'));
    const w = parede(p);
    const d = porta(p);
    const level = p.levels[0]!;
    level.hidden = { elements: [w.id], categories: ['door'] };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: level.id, viewTemp: {} });
    const normal = visibilityOf(p, useUi.getState());
    expect(normal.hidden.has(w.id)).toBe(true);
    expect(normal.hidden.has(d.id)).toBe(true);
    expect(normal.reveal).toBe(false);
    expect(categoryIdsOf(p, ['door'])).toContain(d.id);

    useUi.setState({ viewTemp: { [`plan:${level.id}`]: { reveal: true } } });
    const revelado = visibilityOf(p, useUi.getState());
    expect(revelado.reveal).toBe(true);
    expect(revelado.hidden.has(w.id)).toBe(false);
    expect(revelado.revealed.has(w.id)).toBe(true);
    expect(revelado.revealed.has(d.id)).toBe(true);
  });

  it('temporário: HH oculta, HI isola e HR limpa', () => {
    const p = buildTemplate('house2');
    const w = parede(p);
    const d = porta(p);
    const level = p.levels[0]!;
    const key = `plan:${level.id}`;
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: level.id, viewTemp: { [key]: { hidden: { elements: [w.id] } } } });
    expect(visibilityOf(p, useUi.getState()).hidden.has(w.id)).toBe(true);
    useUi.setState({ viewTemp: { [key]: { isolated: { elements: [d.id] } } } });
    const iso = visibilityOf(p, useUi.getState());
    expect(iso.hidden.has(w.id)).toBe(true);
    expect(iso.hidden.has(d.id)).toBe(false);
    useUi.setState({ viewTemp: {} });
    expect(visibilityOf(p, useUi.getState()).hidden.size).toBe(0);
  });

  const VISTAS: Array<[string, Partial<ReturnType<typeof useUi.getState>>, string]> = [
    ['planta', { view: 'plan', planKind: 'floor', levelId: 'lv_0', sectionId: null }, 'plan:lv_0'],
    ['3D', { view: '3d' }, '3d'],
    ['corte', { view: 'section', sectionId: 'sec1' }, 'section:sec1'],
  ];

  for (const [nome, estado, chave] of VISTAS) {
    describe(`Revelar ocultos na vista ${nome}`, () => {
      it('desligado o oculto não aparece; ligado aparece como revelado; desligar não altera o oculto', () => {
        const p = structuredClone(buildTemplate('house2'));
        const w = parede(p);
        const lv = p.levels[0]!;
        useUi.setState({ ...estado, levelId: lv.id, viewTemp: { [chave]: { hidden: { elements: [w.id] } } } });
        const key = visibilityKeyOf(useUi.getState())!;
        const k = key.startsWith('plan:') ? `plan:${lv.id}` : key;
        useUi.setState({ viewTemp: { [k]: { hidden: { elements: [w.id] } } } });
        if (key.startsWith('plan:')) lv.hidden = { elements: [w.id] };
        const off = visibilityOf(p, useUi.getState());
        expect(off.hidden.has(w.id)).toBe(true);
        expect(off.revealed.has(w.id)).toBe(false);
        toggleRevealHidden();
        const on = visibilityOf(p, useUi.getState());
        expect(on.reveal).toBe(true);
        expect(on.hidden.has(w.id)).toBe(false);
        expect(on.revealed.has(w.id)).toBe(true);
        expect(useUi.getState().viewTemp[k]?.hidden?.elements).toEqual([w.id]);
        toggleRevealHidden();
        const volta = visibilityOf(p, useUi.getState());
        expect(volta.reveal).toBe(false);
        expect(volta.hidden.has(w.id)).toBe(true);
        expect(useUi.getState().viewTemp[k]?.hidden?.elements).toEqual([w.id]);
      });

      it('isolar: o que ficou fora aparece revelado no modo', () => {
        const p = structuredClone(buildTemplate('house2'));
        const w = parede(p);
        const d = porta(p);
        useUi.setState({ ...estado, levelId: p.levels[0]!.id });
        const k = visibilityKeyOf(useUi.getState())!;
        useUi.setState({ viewTemp: { [k]: { isolated: { elements: [d.id] }, reveal: true } } });
        const v = visibilityOf(p, useUi.getState());
        expect(v.revealed.has(w.id)).toBe(true);
        expect(v.hidden.has(w.id)).toBe(false);
      });

      it('Reexibir tira o elemento do oculto temporário e a borda só vale na vista com o modo', () => {
        editor.newProject('house2');
        const p = editor.project;
        const w = parede(p);
        useUi.setState({ ...estado, levelId: p.levels[0]!.id });
        const k = visibilityKeyOf(useUi.getState())!;
        useUi.setState({ viewTemp: { [k]: { hidden: { elements: [w.id] }, reveal: true } } });
        unhideInView([w.id]);
        const v = visibilityOf(p, useUi.getState());
        expect(v.hidden.has(w.id)).toBe(false);
        expect(v.revealed.has(w.id)).toBe(false);
        expect(useUi.getState().viewTemp[k]?.reveal).toBe(true);
        const outras = { ...useUi.getState(), view: nome === '3D' ? ('plan' as const) : ('3d' as const) };
        expect(visibilityOf(p, outras).reveal).toBe(false);
      });
    });
  }
});
