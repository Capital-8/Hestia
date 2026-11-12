import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makeGuardaCorpo, type HospedeiroManual, type Project } from '@hestia/model';
import { decodificarLinhasGC, guardaCorpoNoPonto, linhasVisiveisGC } from '@hestia/engine';
import { useUi } from './state.ts';
import { categoryIdsOf, visibilityOf } from './viewVisibility.ts';

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, viewTemp: {}, selection: [] }));

const manual: HospedeiroManual = { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' };

function comGuardas(): Project {
  const p = structuredClone(buildTemplate('house2'));
  const lv = p.levels[0]!.id;
  p.elements.gcA = { ...makeGuardaCorpo({ id: 'gcA', levelId: lv, typeId: 'gct_balaustres', hospedeiro: manual }), order: 1 };
  p.elements.gcB = { ...makeGuardaCorpo({ id: 'gcB', levelId: lv, typeId: 'gct_vidro', hospedeiro: manual }), order: 2 };
  return p;
}

/** Vistas onde o guarda-corpo precisa aparecer: planta, corte/elevação e 3D. */
const VISTAS: Array<{ nome: string; estado: Record<string, unknown>; chave: (lv: string) => string }> = [
  { nome: 'planta', estado: { view: 'plan', planKind: 'floor' }, chave: (lv) => `plan:${lv}` },
  { nome: 'corte/elevação', estado: { view: 'section', sectionId: 'sec1' }, chave: () => 'section:sec1' },
  { nome: '3D', estado: { view: '3d' }, chave: () => '3d' },
];

describe('guarda-corpo na visibilidade por vista (visibilityOf)', () => {
  it('a categoria railing alcança os guarda-corpos', () => {
    const p = comGuardas();
    expect(categoryIdsOf(p, ['railing']).sort()).toEqual(['gcA', 'gcB']);
    expect(categoryIdsOf(p, ['stair'])).not.toContain('gcA');
  });

  for (const v of VISTAS) {
    describe(v.nome, () => {
      const p = comGuardas();
      const lv = p.levels[0]!.id;
      const usar = (temp: object): ReturnType<typeof visibilityOf> => {
        useUi.setState({ ...v.estado, levelId: lv, viewTemp: { [v.chave(lv)]: temp } });
        return visibilityOf(p, useUi.getState());
      };

      it('ocultar um elemento esconde só ele', () => {
        const r = usar({ hidden: { elements: ['gcA'] } });
        expect(r.hidden.has('gcA')).toBe(true);
        expect(r.hidden.has('gcB')).toBe(false);
      });

      it('ocultar a categoria railing esconde todos', () => {
        const r = usar({ hidden: { categories: ['railing'] } });
        expect(r.hidden.has('gcA') && r.hidden.has('gcB')).toBe(true);
      });

      it('isolar um guarda-corpo esconde o resto, e isolar a categoria deixa só os guarda-corpos', () => {
        const um = usar({ isolated: { elements: ['gcB'] } });
        expect(um.hidden.has('gcB')).toBe(false);
        expect(um.hidden.has('gcA')).toBe(true);
        const cat = usar({ isolated: { categories: ['railing'] } });
        expect(cat.hidden.has('gcA') || cat.hidden.has('gcB')).toBe(false);
        const parede = Object.values(p.elements).find((e) => e.kind === 'wall')!;
        expect(cat.hidden.has(parede.id)).toBe(true);
      });

      it('Reveal devolve o oculto com borda', () => {
        const r = usar({ hidden: { categories: ['railing'] }, reveal: true });
        expect(r.hidden.has('gcA')).toBe(false);
        expect(r.revealed.has('gcA')).toBe(true);
      });
    });
  }

  it('ocultação permanente da planta e do 3D pelo projeto', () => {
    const p = comGuardas();
    const lv = p.levels[0]!;
    lv.hidden = { categories: ['railing'] };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: lv.id, viewTemp: {} });
    expect(visibilityOf(p, useUi.getState()).hidden.has('gcA')).toBe(true);
    p.view3d = { ...(p.view3d ?? {}), hidden: { elements: ['gcB'] } } as Project['view3d'];
    useUi.setState({ view: '3d', viewTemp: {} });
    const r = visibilityOf(p, useUi.getState());
    expect(r.hidden.has('gcB')).toBe(true);
    expect(r.hidden.has('gcA')).toBe(false);
  });
});

describe('seleção do guarda-corpo nas vistas 2D', () => {
  // Duas linhas de eixo paralelas (planta) e, na mesma posição, um corte: o mesmo decodificador serve às duas vistas.
  const linhas = [0, 255, 1, 2, 1, 255, 1, 2, 7, 0, 0, 5];
  const pontos = [0, 0, 4, 0, 0, 0.5, 4, 0.5, 9, 9];
  const idDe = (n: number) => (n === 0 ? 'gcA' : n === 1 ? 'gcB' : undefined);

  it('decodifica as linhas e ignora guarda-corpo desconhecido', () => {
    const l = decodificarLinhasGC(linhas, pontos, idDe);
    expect(l.map((x) => x.guardaId)).toEqual(['gcA', 'gcB']);
    expect(l[1]!.pontos[1]).toEqual({ x: 4, y: 0.5 });
  });

  it('clique perto do eixo seleciona; longe, não', () => {
    const l = decodificarLinhasGC(linhas, pontos, idDe);
    expect(guardaCorpoNoPonto(l, new Set(), { x: 2, y: 0.02 }, 0.05)).toBe('gcA');
    expect(guardaCorpoNoPonto(l, new Set(), { x: 2, y: 0.49 }, 0.05)).toBe('gcB');
    expect(guardaCorpoNoPonto(l, new Set(), { x: 2, y: 3 }, 0.05)).toBeNull();
  });

  it('clique dentro do contorno de uma peça seleciona (poste em corte)', () => {
    const poste = decodificarLinhasGC([0, 0, 0, 5], [1, 0, 1.1, 0, 1.1, 1, 1, 1, 1, 0], idDe);
    expect(guardaCorpoNoPonto(poste, new Set(), { x: 1.05, y: 0.5 }, 0.001)).toBe('gcA');
  });

  it('o oculto não aparece nem é selecionado; o isolado sobra sozinho', () => {
    const l = decodificarLinhasGC(linhas, pontos, idDe);
    const oculto = new Set(['gcA']);
    expect(linhasVisiveisGC(l, oculto).map((x) => x.guardaId)).toEqual(['gcB']);
    expect(guardaCorpoNoPonto(l, oculto, { x: 2, y: 0.02 }, 0.05)).toBeNull();
    const p = comGuardas();
    useUi.setState({ view: '3d', viewTemp: { '3d': { isolated: { elements: ['gcB'] } } } });
    const hidden = visibilityOf(p, useUi.getState()).hidden;
    expect(guardaCorpoNoPonto(l, hidden, { x: 2, y: 0.02 }, 0.05)).toBeNull();
    expect(guardaCorpoNoPonto(l, hidden, { x: 2, y: 0.49 }, 0.05)).toBe('gcB');
  });
});
