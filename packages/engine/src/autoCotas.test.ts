import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, dimensionValue, makeWall, type Project } from '@hestia/model';
import { cotasAutomaticas, type AutoCotaOptions } from './autoCotas.ts';

/**
 * Cotas automáticas por lado. Retângulo 6 × 4 m desenhado no sentido anti-horário e com `flipped: true`: a face externa
 * fica para fora (como nas paredes do modelo). A porta de 0,90 m tem o centro a 2,00 m do início da parede sul.
 */
const RECT: Array<[number, number, number, number]> = [
  [0, 0, 6, 0],
  [6, 0, 6, 4],
  [6, 4, 0, 4],
  [0, 4, 0, 0],
];

function parede(s: ProjectStore, id: string, [x0, y0, x1, y1]: [number, number, number, number], flipped = true): void {
  s.exec({
    type: 'addWall',
    wall: makeWall({
      id,
      typeId: 'wt_alv14',
      levelId: 'lv_0',
      a: { x: x0, y: y0 },
      b: { x: x1, y: y1 },
      flipped,
      joinStart: { kind: 'butt', flip: false },
      joinEnd: { kind: 'butt', flip: false },
    }),
  });
}

function sala(porta = true): Project {
  const s = new ProjectStore(createEmptyProject());
  ['s', 'l', 'n', 'o'].forEach((id, i) => parede(s, id, RECT[i]!));
  if (porta) s.exec({ type: 'addOpening', opening: { id: 'p1', kind: 'door', typeId: 'ot_p90', hostId: 's', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  return s.project;
}

const comprimento = (d: { a: { x: number; y: number }; b: { x: number; y: number } }): number => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
const medidas = (cotas: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>): number[] =>
  cotas.map((c) => Math.round(comprimento(c) * 1000) / 1000).sort((a, b) => a - b);

const SUL: AutoCotaOptions = { lados: 'sul' };

describe('cotas automáticas', () => {
  it('sem parede no nível, nenhuma cota', () => {
    expect(cotasAutomaticas(createEmptyProject(), 'lv_0')).toEqual([]);
  });

  it('lado sem parede paralela não recebe cota (sem parede vertical, sem cota vertical)', () => {
    const s = new ProjectStore(createEmptyProject());
    parede(s, 's', [0, 0, 6, 0]);
    parede(s, 'n', [0, 4, 6, 4]);
    s.exec({ type: 'addOpening', opening: { id: 'p1', kind: 'door', typeId: 'ot_p90', hostId: 's', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const cotas = cotasAutomaticas(s.project, 'lv_0');
    expect(cotas.length).toBeGreaterThan(0);
    // todas as cotas são horizontais: a.y = b.y (não nasceu nenhuma cota vertical do lado leste/oeste)
    for (const c of cotas) expect(c.a.y).toBeCloseTo(c.b.y, 9);
    expect(cotasAutomaticas(s.project, 'lv_0', { lados: 'leste' })).toEqual([]);
    expect(cotasAutomaticas(s.project, 'lv_0', { lados: 'oeste' })).toEqual([]);
  });

  it('a abertura entra só no lado da parede que a hospeda', () => {
    const s = new ProjectStore(createEmptyProject());
    ['s', 'l', 'n', 'o'].forEach((id, i) => parede(s, id, RECT[i]!));
    s.exec({ type: 'addOpening', opening: { id: 'p1', kind: 'door', typeId: 'ot_p90', hostId: 's', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    s.exec({ type: 'addOpening', opening: { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'n', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const sul = cotasAutomaticas(s.project, 'lv_0', { ...SUL, paredes: false, geometria: false, geral: false });
    // contorno (-0,092 e 6,092) + arestas da porta (1,55 e 2,45): a janela da parede norte não aparece
    expect(medidas(sul)).toEqual([0.9, 1.642, 3.642]);
  });

  it('aberturas pelo centro medem até o centro do vão', () => {
    const cotas = cotasAutomaticas(sala(), 'lv_0', { ...SUL, paredes: false, geometria: false, geral: false, modoAberturas: 'centro' });
    expect(medidas(cotas)).toEqual([2.092, 4.092]);
  });

  it('a camada de paredes mostra as duas faces (espessura e vão livre)', () => {
    const cotas = cotasAutomaticas(sala(), 'lv_0', { ...SUL, aberturas: false, geometria: false, geral: false });
    expect(medidas(cotas)).toEqual([0.184, 0.184, 5.816]);
  });

  it('referência pelo eixo colapsa as faces e mede o eixo da parede', () => {
    const cotas = cotasAutomaticas(sala(), 'lv_0', { ...SUL, referencia: 'eixo', paredes: false, geometria: false, geral: false });
    expect(medidas(cotas)).toEqual([0.9, 1.55, 3.55]);
    const total = cotasAutomaticas(sala(), 'lv_0', { ...SUL, referencia: 'eixo', aberturas: false, paredes: false, geometria: true });
    expect(medidas(total)).toEqual([6]);
  });

  it('o total (geral) só entra quando difere do contorno', () => {
    const soContorno = cotasAutomaticas(sala(), 'lv_0', { ...SUL, aberturas: false, paredes: false, geral: false });
    const comTotal = cotasAutomaticas(sala(), 'lv_0', { ...SUL, aberturas: false, paredes: false, geral: true });
    expect(medidas(soContorno)).toEqual([6.184]);
    expect(medidas(comTotal)).toEqual([6.184]);
  });

  it('cada cota leva a referência da ponta de parede, projetada no eixo do lado', () => {
    const s = new ProjectStore(createEmptyProject());
    parede(s, 's', [0, 0, 6, 0]);
    parede(s, 'n', [0, 4, 6, 4]);
    const cotas = cotasAutomaticas(s.project, 'lv_0', { ...SUL, aberturas: false, paredes: false });
    const comRef = cotas.filter((c) => c.refs?.a || c.refs?.b);
    expect(comRef.length).toBeGreaterThan(0);
    for (const c of comRef) {
      const r = (c.refs?.a ?? c.refs?.b)!;
      expect((r as { axis?: string }).axis).toBe('x');
      expect(['a', 'b']).toContain((r as { end?: string }).end);
    }
  });

  it('cadeia reta entre pontas de paredes em alturas diferentes (referência projetada)', () => {
    const s = new ProjectStore(createEmptyProject());
    ['s', 'l', 'n', 'o'].forEach((id, i) => parede(s, id, RECT[i]!));
    parede(s, 'i1', [1, 0.5, 2, 0.5]);
    parede(s, 'i2', [4, 1.5, 5, 1.5]);
    const cotas = cotasAutomaticas(s.project, 'lv_0', { ...SUL, somenteExternas: false, aberturas: false, geometria: false, geral: false });
    const entre = cotas.find((c) => Math.abs(c.a.x - 2) < 1e-9 && Math.abs(c.b.x - 4) < 1e-9);
    expect(entre).toBeDefined();
    // sem a projeção no eixo, a cota mediria a diagonal (√(2² + 1²) ≈ 2,236) entre (2; 0,5) e (4; 1,5)
    expect(dimensionValue(s.project, entre!)).toBe(2);
  });

  it('só o contorno externo ignora a divisória interna escondida', () => {
    const s = new ProjectStore(createEmptyProject());
    ['s', 'l', 'n', 'o'].forEach((id, i) => parede(s, id, RECT[i]!));
    parede(s, 'div', [4, 1, 4, 3]);
    const externo = cotasAutomaticas(s.project, 'lv_0', { ...SUL, aberturas: false, geometria: false, geral: false });
    const tudo = cotasAutomaticas(s.project, 'lv_0', { ...SUL, somenteExternas: false, aberturas: false, geometria: false, geral: false });
    expect(medidas(externo)).toEqual([0.184, 0.184, 5.816]);
    expect(medidas(tudo)).toEqual([0.184, 0.184, 0.184, 1.816, 3.816]);
  });

  it('as camadas se afastam: 0,60 m, 1,05 m e 1,50 m', () => {
    const cotas = cotasAutomaticas(sala(), 'lv_0', { ...SUL, offset: 0.6, espacamento: 0.45 });
    const offsets = [...new Set(cotas.map((c) => Math.abs(c.offset)))].sort((a, b) => a - b);
    expect(offsets[0]).toBeCloseTo(0.6, 6);
    expect(offsets[1]).toBeCloseTo(1.05, 6);
    expect(offsets[2]).toBeCloseTo(1.5, 6);
  });

  it('sem nenhuma camada escolhida, nenhuma cota', () => {
    expect(cotasAutomaticas(sala(), 'lv_0', { ...SUL, geral: false, geometria: false, paredes: false, aberturas: false })).toEqual([]);
  });

  it('referência externa escolhe a face de fora mesmo com a parede desenhada ao contrário', () => {
    const s = new ProjectStore(createEmptyProject());
    ['s', 'l', 'n', 'o'].forEach((id, i) => parede(s, id, RECT[i]!, false));
    const cotas = cotasAutomaticas(s.project, 'lv_0', { ...SUL, aberturas: false, paredes: false });
    // sem a escolha pelo lado, a face "externa" do modelo estaria para dentro e o total daria 5,816
    expect(medidas(cotas)).toEqual([6.184]);
  });

  it('os quatro lados só geram cota onde há parede paralela', () => {
    const cotas = cotasAutomaticas(sala(false), 'lv_0');
    // por lado: 2 espessuras + vão livre (estruturas) + total (geometria); o geral coincide e não entra
    expect(cotas.length).toBe(16);
    expect(medidas(cotas)).toEqual([
      0.184, 0.184, 0.184, 0.184, 0.184, 0.184, 0.184, 0.184,
      3.816, 3.816, 4.184, 4.184, 5.816, 5.816, 6.184, 6.184,
    ]);
  });
});
