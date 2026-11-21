import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makePlanView, makeRoof, makeWall } from '@hestia/model';
import { planDxf } from './dxfExport.ts';

/*
 * Acabamento do DXF da planta de disciplina (decisão 0060 §7, etapa 4.4): a parede fora do corte e o cluster
 * parcialmente oculto seguem a MESMA regra da tela (`planViewVisivel`: vista resolvida sem as paredes ocultas), e
 * genéricos, cobertura, cotas de ponto e nuvens de revisão são POR PLANTA. Planta padrão idêntica à de antes.
 * Projeto: lv_0 com quatro paredes (duas em corte formando um cluster; duas baixas, fora do corte, formando outro),
 * um genérico, um telhado e uma segunda planta da disciplina. Referências LITERAIS lidas à mão.
 */

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

/** Pontos (x, y) de todas as entidades do DXF: pares de códigos 10/20 (vértice, início de LINE e âncora de TEXT). */
function pontos(text: string): Vec2[] {
  const linhas = text.split(/\r?\n/);
  const out: Vec2[] = [];
  let x: number | undefined;
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const code = Number(linhas[i]);
    const value = Number(linhas[i + 1]);
    if (code === 10) x = value;
    else if (code === 20 && x !== undefined) {
      out.push({ x, y: value });
      x = undefined;
    }
  }
  return out;
}

/** Há algum ponto do DXF a menos de `tol` metros de (x, y)? */
const temPerto = (pts: readonly Vec2[], x: number, y: number, tol = 0.2): boolean => pts.some((q) => Math.abs(q.x - x) <= tol && Math.abs(q.y - y) <= tol);

/** lv_0: w1+w2 em corte (cluster, w2 oculta na pvE); w3+w4 baixas fora do corte (cluster, w3 oculta na pvE). */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const wall = (id: string, a: Vec2, b: Vec2, height: number): void => {
    s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b, height }) });
  };
  wall('w1', { x: 0, y: 0 }, { x: 4, y: 0 }, 3);
  wall('w2', { x: 4, y: 0 }, { x: 8, y: 0 }, 3);
  wall('w3', { x: 0, y: 5 }, { x: 4, y: 5 }, 0.5);
  wall('w4', { x: 4, y: 5 }, { x: 8, y: 5 }, 0.5);
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvE', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvA', levelId: 'lv_0', name: 'Arquitetura 2', discipline: 'arquitetura' }) });
  // Estrutura: w2 (cluster em corte) e w3 (cluster fora do corte) ocultas no Hide in View da própria planta.
  s.exec({ type: 'updatePlanView', id: 'pvE', patch: { hidden: { elements: ['w2', 'w3'] } } });
  return s;
}

describe('parede fora do corte e cluster parcialmente oculto: a regra da tela', () => {
  it('a disciplina não desenha o cluster nem o contorno da parede oculta; a padrão desenha os dois', () => {
    const p = projeto().project;
    const padrao = pontos(planDxf(p, 'lv_0'));
    const estrutura = pontos(planDxf(p, 'lv_0', true, undefined, 'pt', 'pvE'));
    // Padrão: o cluster em corte chega ao fim (8, 0) e o contorno da parede baixa aparece em (0, 5).
    expect(temPerto(padrao, 8, 0)).toBe(true);
    expect(temPerto(padrao, 0, 5)).toBe(true);
    // Disciplina: w2 oculta, o cluster em corte termina em x = 4; w3 oculta, não sobra contorno em (0, 5).
    expect(temPerto(estrutura, 8, 0)).toBe(false);
    expect(temPerto(estrutura, 0, 5)).toBe(false);
    // O que fica visível continua: o fim de w1/W1 do cluster e o cluster baixo de w4 (4..8 em y = 5).
    expect(temPerto(estrutura, 4, 0)).toBe(true);
    expect(temPerto(estrutura, 8, 5)).toBe(true);
  });

  it('a outra planta do nível (sem ocultação) desenha exatamente o mesmo que a padrão', () => {
    const p = projeto().project;
    expect(planDxf(p, 'lv_0', true, undefined, 'pt', 'pvA')).toBe(planDxf(p, 'lv_0'));
  });
});

describe('genéricos e cobertura por planta', () => {
  it('o genérico e o telhado ocultos na pvE não saem nela e saem na pvA; o telhado oculto não vira projeção', () => {
    const s = projeto();
    s.exec({
      type: 'addGeneric',
      generic: {
        id: 'gn1',
        kind: 'generic',
        levelId: 'lv_0',
        name: 'Viga importada',
        sourceClass: 'IFCBEAM',
        mesh: { positions: [], indices: [] },
        outline: ring([[30, 30], [31, 30], [31, 31], [30, 31]]),
      },
    });
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'rf1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: ring([[0, 0], [10, 0], [10, 10], [0, 10]]) }) });
    s.exec({ type: 'updatePlanView', id: 'pvE', patch: { hidden: { elements: ['w2', 'w3', 'gn1', 'rf1'] } } });
    const p = s.project;
    const estrutura = planDxf(p, 'lv_0', true, undefined, 'pt', 'pvE');
    const outra = planDxf(p, 'lv_0', true, undefined, 'pt', 'pvA');
    expect(estrutura).not.toContain('IMPORTADO');
    expect(outra).toContain('IMPORTADO');
    expect(temPerto(pontos(outra), 30, 30)).toBe(true);
    // Telhado: some por inteiro na estrutura (nem o contorno, nem a projeção tracejada dos fora do intervalo).
    expect(estrutura).not.toContain('TELHADO');
    expect(outra).toContain('TELHADO');
  });
});

describe('anotações de cada tipo isoladas por planta', () => {
  it('cotas, textos, detalhes, etiquetas, cotas de ponto e nuvens: cada planta só com as suas', () => {
    const s = projeto();
    // Padrão (nível).
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, offset: 0.5 } });
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tN', at: { x: 0, y: 1 }, text: 'NOTA NIVEL', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addSpot', levelId: 'lv_0', item: { id: 'spN', kind: 'elevation', target: { x: 5, y: 5 }, at: { x: 5, y: 5 }, z: 5 } });
    s.exec({ type: 'addRevisionCloud', levelId: 'lv_0', item: { id: 'rcN', points: ring([[50, 50], [52, 50], [52, 52]]), closed: true, revisionTag: 'NUVEM-NIVEL' } });
    // pvE: cota de 2 m, texto, detalhe, etiqueta, cota de ponto (+3,00 m) e nuvem.
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvE', dimension: { id: 'dE', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, offset: 0.5 } });
    s.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvE', text: { id: 'tE', at: { x: 1, y: 2 }, text: 'NOTA ESTRUTURA', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', planId: 'pvE', item: { id: 'dlE', a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, style: 'solid' } });
    s.exec({ type: 'addTag', levelId: 'lv_0', planId: 'pvE', item: { id: 'tgE', hostId: 'w1', at: { x: 10, y: 10 }, property: 'type', leader: false, orientation: 'horizontal' } });
    s.exec({ type: 'addSpot', levelId: 'lv_0', planId: 'pvE', item: { id: 'spE', kind: 'elevation', target: { x: 2, y: 2 }, at: { x: 2, y: 2 }, z: 3 } });
    s.exec({ type: 'addRevisionCloud', levelId: 'lv_0', planId: 'pvE', item: { id: 'rcE', points: ring([[20, 20], [22, 20], [22, 22]]), closed: true, revisionTag: 'NUVEM-E' } });
    // pvA: cota de 5 m, texto, detalhe, etiqueta, cota de ponto (+7,00 m) e nuvem.
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, offset: 0.5 } });
    s.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvA', text: { id: 'tA', at: { x: 3, y: 3 }, text: 'NOTA ARQUITETURA', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', planId: 'pvA', item: { id: 'dlA', a: { x: 3, y: 4 }, b: { x: 4, y: 4 }, style: 'solid' } });
    s.exec({ type: 'addTag', levelId: 'lv_0', planId: 'pvA', item: { id: 'tgA', hostId: 'w4', at: { x: 30, y: 30 }, property: 'type', leader: false, orientation: 'horizontal' } });
    s.exec({ type: 'addSpot', levelId: 'lv_0', planId: 'pvA', item: { id: 'spA', kind: 'elevation', target: { x: 4, y: 4 }, at: { x: 4, y: 4 }, z: 7 } });
    s.exec({ type: 'addRevisionCloud', levelId: 'lv_0', planId: 'pvA', item: { id: 'rcA', points: ring([[40, 40], [42, 40], [42, 42]]), closed: true, revisionTag: 'NUVEM-A' } });
    const p = s.project;
    const padrao = planDxf(p, 'lv_0');
    const estrutura = planDxf(p, 'lv_0', true, undefined, 'pt', 'pvE');
    const outra = planDxf(p, 'lv_0', true, undefined, 'pt', 'pvA');
    // Cotas e textos.
    expect(estrutura).toContain('2,00 m');
    expect(estrutura).not.toContain('5,00 m');
    expect(outra).toContain('5,00 m');
    expect(outra).not.toContain('2,00 m');
    expect(padrao).toContain('1,00 m');
    expect(estrutura).toContain('NOTA ESTRUTURA');
    expect(estrutura).not.toContain('NOTA ARQUITETURA');
    expect(outra).toContain('NOTA ARQUITETURA');
    expect(padrao).toContain('NOTA NIVEL');
    expect(estrutura).not.toContain('NOTA NIVEL');
    expect(outra).not.toContain('NOTA NIVEL');
    // Detalhe e etiqueta pela posição (as duas plantas têm o mesmo texto de etiqueta, em pontos diferentes).
    expect(temPerto(pontos(estrutura), 1, 1)).toBe(true);
    expect(temPerto(pontos(estrutura), 3, 4)).toBe(false);
    expect(temPerto(pontos(outra), 3, 4)).toBe(true);
    expect(temPerto(pontos(outra), 1, 1)).toBe(false);
    expect(temPerto(pontos(estrutura), 10, 10)).toBe(true);
    expect(temPerto(pontos(estrutura), 30, 30)).toBe(false);
    expect(temPerto(pontos(outra), 30, 30)).toBe(true);
    expect(temPerto(pontos(outra), 10, 10)).toBe(false);
    // Cotas de ponto e nuvens (só a planta de disciplina as leva ao DXF, e só as dela).
    expect(estrutura).toContain('+3,00 m');
    expect(estrutura).not.toContain('+7,00 m');
    expect(outra).toContain('+7,00 m');
    expect(outra).not.toContain('+3,00 m');
    expect(estrutura).toContain('NUVEM-E');
    expect(estrutura).not.toContain('NUVEM-A');
    expect(outra).toContain('NUVEM-A');
    expect(outra).not.toContain('NUVEM-E');
    // Nada do nível (nem cotas de ponto, nem nuvens) vaza para as plantas de disciplina, e as delas não vazam entre si.
    expect(estrutura).not.toContain('+5,00 m');
    expect(outra).not.toContain('+5,00 m');
    expect(estrutura).not.toContain('NUVEM-NIVEL');
    expect(outra).not.toContain('NUVEM-NIVEL');
    expect(padrao).not.toContain('+3,00 m');
    expect(padrao).not.toContain('NUVEM-E');
    expect(padrao).not.toContain('NUVEM-A');
  });
});
