import { describe, expect, it } from 'vitest';
import { classifyLevelEntries, junctionLevel, resolveRoofs, viewContextOf } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeLevel, makeRoof, makeSlab, makeWall, viewRangeOf, type Project } from '@hestia/model';
import { contextoDaVista, projetoDaJuncao } from './viewContext.ts';

const BOX = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }];

/** Dois pavimentos com paredes, piso e telhado no de cima; `anexada` liga o topo de uma parede ao telhado. */
function projeto(anexada: boolean): Project {
  const s = new ProjectStore(createEmptyProject('Vista'));
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_ext19', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, attachTopToRoof: anexada }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_ext19', levelId: 'lv_1', a: { x: 6, y: 0 }, b: { x: 6, y: 6 } }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_1', boundary: BOX }) });
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_1', boundary: BOX, shape: 'gable', slopePercent: 30 }) });
  return s.project;
}

/** Entradas da classificação em ordem (a de `classifyLevelEntries` já vem ordenada por id). */
const entradas = (p: Project, levelId: string) => classifyLevelEntries(p, levelId, viewRangeOf(p, levelId), contextoDaVista(p, levelId));
const entradasPadrao = (p: Project, levelId: string) => classifyLevelEntries(p, levelId, viewRangeOf(p, levelId));

describe('contexto de cotas da vista (contextoDaVista)', () => {
  it('sem parede anexada, a classificação do nível é a mesma que com o projeto inteiro', () => {
    const p = projeto(false);
    for (const id of ['lv_0', 'lv_1']) expect(entradas(p, id)).toEqual(entradasPadrao(p, id));
  });

  it('sem anexo, o contexto não resolve piso nem laje de outros níveis', () => {
    const p = projeto(false);
    const ctx = contextoDaVista(p, 'lv_0');
    expect(ctx.floors).toEqual([]);
    expect(ctx.slabs).toEqual([]);
    expect(ctx.roofs).toEqual(resolveRoofs(p, 'lv_0'));
  });

  it('com parede anexada ao telhado, usa o projeto inteiro e a classificação continua igual', () => {
    const p = projeto(true);
    const ctx = contextoDaVista(p, 'lv_1');
    expect(ctx).toEqual(viewContextOf(p));
    expect(entradas(p, 'lv_1')).toEqual(entradasPadrao(p, 'lv_1'));
  });

  it('a faixa do telhado do próprio nível sai igual (sem anexo, o contexto só tem os telhados do nível)', () => {
    const p = projeto(false);
    const roof = entradas(p, 'lv_1').find((e) => e.id === 'r1');
    const roofPadrao = entradasPadrao(p, 'lv_1').find((e) => e.id === 'r1');
    expect(roof).toBeDefined();
    expect(roof).toEqual(roofPadrao);
  });
});

/** Pavimentos a cada 3 m, com parede de altura `altura` em cada um; `anexada` liga o topo da parede do nível 1 ao telhado. */
function predio(n: number, altura: number, anexada = false): Project {
  const s = new ProjectStore(createEmptyProject('Prédio'));
  for (let i = 0; i < n; i++) {
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Pav ${i}`, elevation: i * 3 }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_ext19', levelId: `lv_${i}`, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: altura, attachTopToRoof: anexada && i === 1 }) });
  }
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 's1', typeId: 'ls_mac12', levelId: 'lv_1', boundary: BOX }) });
  return s.project;
}

describe('junção da vista (projetoDaJuncao)', () => {
  it('sem dependência vertical, o projeto reduzido tem só o nível e os vizinhos próximos', () => {
    const p = predio(6, 2.8);
    expect(projetoDaJuncao(p, 'lv_3').levels.map((l) => l.id).sort()).toEqual(['lv_2', 'lv_3', 'lv_4']);
  });

  it('nível do topo: sem vizinho acima, o reduzido traz só o próprio nível e o de baixo', () => {
    const p = predio(4, 2.8);
    expect(projetoDaJuncao(p, 'lv_3').levels.map((l) => l.id).sort()).toEqual(['lv_2', 'lv_3']);
  });

  it('parede alta atravessa vários pavimentos: o alcance inclui os níveis que ela toca', () => {
    const p = predio(6, 9);
    expect(projetoDaJuncao(p, 'lv_2').levels.length).toBe(p.levels.length);
  });

  it('com parede anexada ao telhado num nível, a redução não traz o projeto inteiro (só o nível e os vizinhos)', () => {
    const p = predio(6, 2.8, true);
    const ids = projetoDaJuncao(p, 'lv_3').levels.map((l) => l.id).sort();
    expect(ids).toEqual(['lv_2', 'lv_3', 'lv_4']);
  });

  it('a junção do nível sai igual com o projeto reduzido e com o inteiro (parede cortada pela laje de cima)', () => {
    const p = predio(3, 6);
    const reduzido = junctionLevel(projetoDaJuncao(p, 'lv_0'), 'lv_0');
    const inteiro = junctionLevel(p, 'lv_0');
    expect(reduzido.walls.get('w0')?.cut).toBe(inteiro.walls.get('w0')?.cut);
    expect([...reduzido.walls.keys()]).toEqual([...inteiro.walls.keys()]);
  });

  it('pavimento alto com 20 níveis: a junção de um nível do meio lê só três níveis', () => {
    const p = predio(20, 2.8);
    expect(projetoDaJuncao(p, 'lv_10').levels.map((l) => l.id).sort()).toEqual(['lv_10', 'lv_11', 'lv_9']);
  });

  it('parede rebaixada de um nível alto alcança o nível de baixo (a faixa dela entra na junção)', () => {
    const s = new ProjectStore(createEmptyProject('Prédio'));
    for (let i = 0; i < 6; i++) {
      s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Pav ${i}`, elevation: i * 3 }) });
    }
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_baixo', typeId: 'wt_ext19', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 2.8 }) });
    // Base 9 m abaixo do pavimento 4 (cota 12 m): a faixa vai de 3 m a 5,8 m, a do pavimento 1.
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_fundo', typeId: 'wt_ext19', levelId: 'lv_4', a: { x: 0, y: 2 }, b: { x: 6, y: 2 }, baseOffset: -9, height: 2.8 }) });
    expect(projetoDaJuncao(s.project, 'lv_1').levels.map((l) => l.id)).toContain('lv_4');
  });

  it('parede anexada ao piso do nível: os níveis lidos entram e a junção sai igual à do projeto inteiro', () => {
    const base = predio(6, 2.8);
    const w3 = base.elements['w3'];
    if (!w3 || w3.kind !== 'wall') throw new Error('parede w3 ausente');
    const p = { ...base, elements: { ...base.elements, w3: { ...w3, attachBottomToFloor: true } } };
    expect(projetoDaJuncao(p, 'lv_3').levels.map((l) => l.id).sort()).toEqual(['lv_2', 'lv_3', 'lv_4']);
    const reduzido = junctionLevel(projetoDaJuncao(p, 'lv_3'), 'lv_3');
    const inteiro = junctionLevel(p, 'lv_3');
    expect([...reduzido.walls.keys()]).toEqual([...inteiro.walls.keys()]);
    for (const id of inteiro.walls.keys()) expect(reduzido.walls.get(id)?.cut).toBe(inteiro.walls.get(id)?.cut);
  });
});

/**
 * Prédio de `n` pavimentos (a cada 3 m), com paredes, piso e uma parede por nível; telhados nos níveis de `telhados`.
 * `anexos` liga o topo de paredes ao telhado (`nivel`), com o nível de topo opcional (`topo`).
 */
function predioComTelhado(n: number, telhados: number[], anexos: Array<{ nivel: number; topo?: number }>): Project {
  const s = new ProjectStore(createEmptyProject('Telhado'));
  const anexo = new Map(anexos.map((a) => [a.nivel, a] as const));
  for (let i = 0; i < n; i++) {
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Pav ${i}`, elevation: i * 3 }) });
    const a = anexo.get(i);
    const topo = a?.topo !== undefined ? { topLevelId: `lv_${a.topo}` } : {};
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_ext19', levelId: `lv_${i}`, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 2.8, attachTopToRoof: a !== undefined, ...topo }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: `v${i}`, typeId: 'wt_ext19', levelId: `lv_${i}`, a: { x: 6, y: 0 }, b: { x: 6, y: 6 }, height: 2.8 }) });
    s.exec({ type: 'addFloor', floor: makeFloor({ id: `f${i}`, typeId: 'ft_ceram', levelId: `lv_${i}`, boundary: BOX }) });
  }
  for (const i of telhados) s.exec({ type: 'addRoof', roof: makeRoof({ id: `r${i}`, typeId: 'rt_ceramica', levelId: `lv_${i}`, boundary: BOX, shape: 'gable', slopePercent: 30 }) });
  return s.project;
}

describe('junção com parede anexada ao telhado (projetoDaJuncao, exato)', () => {
  const casos: Array<[string, number, number[], Array<{ nivel: number; topo?: number }>]> = [
    ['10 pavimentos, telhados em 2 e 6, parede do 2 no próprio telhado e a do 5 no telhado do 6', 10, [2, 6], [{ nivel: 2 }, { nivel: 5, topo: 6 }]],
    ['10 pavimentos, parede do 3 atada ao telhado do 7 (nível de topo)', 10, [7, 9], [{ nivel: 3, topo: 7 }]],
    ['20 pavimentos, telhados em 2, 6, 11 e 16, anexos no 2, no 5 (topo 6) e no 11', 20, [2, 6, 11, 16], [{ nivel: 2 }, { nivel: 5, topo: 6 }, { nivel: 11 }]],
    ['20 pavimentos, parede do 3 atada ao telhado do 9', 20, [2, 6, 9, 16], [{ nivel: 3, topo: 9 }]],
  ];

  for (const [nome, n, telhados, anexos] of casos) {
    it(`${nome}: a junção de cada nível com a redução sai igual à do projeto inteiro`, () => {
      const p = predioComTelhado(n, telhados, anexos);
      for (const l of p.levels) {
        const reduzido = projetoDaJuncao(p, l.id);
        expect(reduzido.levels.length).toBeLessThanOrEqual(p.levels.length);
        expect(junctionLevel(reduzido, l.id)).toEqual(junctionLevel(p, l.id));
      }
    });
  }

  it('20 pavimentos: a junção de um nível baixo lê poucos níveis, não os 20', () => {
    const p = predioComTelhado(20, [2, 6, 11, 16], [{ nivel: 2 }, { nivel: 5, topo: 6 }, { nivel: 11 }]);
    const ids = projetoDaJuncao(p, 'lv_9').levels.map((l) => l.id).sort();
    expect(ids.length).toBeLessThan(p.levels.length);
    expect(ids).toEqual(['lv_8', 'lv_9', 'lv_10'].sort());
  });

  it('a parede anexada ao telhado de outro nível, que não toca a faixa, fica fora da redução', () => {
    const p = predioComTelhado(20, [2, 6, 11, 16], [{ nivel: 15, topo: 16 }]);
    const ids = projetoDaJuncao(p, 'lv_1').levels.map((l) => l.id);
    expect(ids).not.toContain('lv_15');
  });
});
