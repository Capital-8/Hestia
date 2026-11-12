import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  makeWall,
  resolverParede,
  type CurtainInstance,
  type CurtainSpec,
  type ParedeResolvida,
  type Project,
  type Wall,
  type WallType,
} from '@hestia/model';
import { GAP_MINIMO, alcasDeLinhas, encaixarNaGrade, iconeCadeado, resultadoArraste, type AlcaDeLinha } from './curtainHandles.ts';

// Parede cortina de L = 4 m (grade U de 4 células: linhas em 1, 2 e 3 m) e H = 2,8 m (grade V de 2 células: linha em 1,4 m).

const grade: CurtainSpec = {
  depth: 0.1,
  u: { mode: 'fixedNumber', count: 4 },
  v: { mode: 'fixedNumber', count: 2 },
  mullions: {
    interiorVertical: 'mul_ret_50x100',
    interiorHorizontal: 'mul_ret_50x100',
    borderStart: 'mul_ret_50x100',
    borderEnd: 'mul_ret_50x100',
    borderBottom: 'mul_ret_50x100',
    borderTop: 'mul_ret_50x100',
    corner: null,
    joinPriority: 'vertical',
  },
  defaultPanelTypeId: 'pnl_vidro_10',
};

/** Projeto com uma parede cortina (`w_ct`) e a grade resolvida dela, com a instância dada. */
function cenario(inst: CurtainInstance = {}): { p: Project; w: Wall; res: ParedeResolvida } {
  const base = createEmptyProject();
  for (const id of Object.keys(base.wallTypes)) if (base.wallTypes[id]!.family === 'curtain') delete base.wallTypes[id];
  const s = new ProjectStore(base);
  const tipo: WallType = { ...createEmptyProject().wallTypes.wt_alv14!, id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade, layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({
    type: 'addWall',
    wall: { ...makeWall({ id: 'w_ct', typeId: tipo.id, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: inst },
  });
  const w = s.project.elements.w_ct as Wall;
  const res = resolverParede(s.project, w);
  if (!res) throw new Error('parede cortina sem grade resolvida');
  return { p: s.project, w, res };
}

/** Alça de um eixo e índice, para os testes de arraste. */
function alcaDe(alcas: AlcaDeLinha[], eixo: 'u' | 'v', indice: number): AlcaDeLinha {
  const achada = alcas.find((a) => a.eixo === eixo && a.indice === indice);
  if (!achada) throw new Error(`sem alça ${eixo}${indice}`);
  return achada;
}

describe('alças das linhas internas (decisão 0056, §10 fase 2)', () => {
  it('gera uma alça por linha interna nos dois eixos, sem alça nas bordas', () => {
    const { w, res } = cenario();
    const alcas = alcasDeLinhas(w.id, res);
    expect(alcas).toHaveLength(4);
    expect(alcas.filter((a) => a.eixo === 'u').map((a) => a.indice)).toEqual([1, 2, 3]);
    expect(alcas.filter((a) => a.eixo === 'v').map((a) => a.indice)).toEqual([1]);
  });

  it('cada alça traz as vizinhas do mesmo eixo como limites (o início e o fim do vão nas pontas)', () => {
    const { w, res } = cenario();
    const alcas = alcasDeLinhas(w.id, res);
    const u2 = alcaDe(alcas, 'u', 2);
    expect(u2).toMatchObject({ pos: 2, anterior: 1, proxima: 3, wallId: 'w_ct' });
    expect(alcaDe(alcas, 'u', 1)).toMatchObject({ anterior: 0, proxima: 2 });
    expect(alcaDe(alcas, 'u', 3)).toMatchObject({ anterior: 2, proxima: 4 });
    expect(alcaDe(alcas, 'v', 1)).toMatchObject({ anterior: 0, proxima: 2.8 });
  });

  it('linha gerada usa a referência canônica (índice, posição normalizada e n) que os comandos aceitam', () => {
    const { w, res } = cenario();
    expect(alcaDe(alcasDeLinhas(w.id, res), 'u', 2).line).toEqual({ axis: 'u', index: 2, pos: 0.5, n: 4 });
  });

  it('linha extra usa a referência pelo id e fica entre as vizinhas dela', () => {
    const { w, res } = cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }] });
    const alcas = alcasDeLinhas(w.id, res);
    const extra = alcas.find((a) => 'added' in a.line);
    expect(extra).toMatchObject({ line: { added: 'x1' }, pos: 1.5, anterior: 1, proxima: 2 });
  });

  it('linha travada aparece como travada, e a livre não', () => {
    const { w, res } = cenario({ lineOverrides: [{ line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, locked: true }] });
    const alcas = alcasDeLinhas(w.id, res);
    expect(alcaDe(alcas, 'u', 2).travada).toBe(true);
    expect(alcaDe(alcas, 'u', 1).travada).toBe(false);
  });
});

describe('arraste de uma alça', () => {
  const { w, res } = cenario();
  const u2 = alcaDe(alcasDeLinhas(w.id, res), 'u', 2);

  it('sem passo de grade, a posição livre entre as vizinhas vale e gera moveGridLine', () => {
    const r = resultadoArraste(u2, 2.37);
    expect(r.pos).toBe(2.37);
    expect(r.comando).toEqual({ type: 'moveGridLine', wallId: 'w_ct', line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, pos: 2.37 });
  });

  it('encaixa no passo da grade do projeto', () => {
    expect(resultadoArraste(u2, 2.37, 0.1).pos).toBe(2.4);
    expect(resultadoArraste(u2, 2.2, 0.5).pos).toBe(2.0);
  });

  it('prende na vizinha anterior com a folga de um passo', () => {
    expect(resultadoArraste(u2, 0.95, 0.1).pos).toBe(1.1);
  });

  it('prende na vizinha seguinte com a folga de um passo', () => {
    expect(resultadoArraste(u2, 3.4, 0.1).pos).toBe(2.9);
  });

  it('sem passo, a folga entre linhas é de 1 mm', () => {
    expect(resultadoArraste(u2, 1.0005).pos).toBeCloseTo(1 + GAP_MINIMO, 6);
  });

  it('sem espaço entre as vizinhas: nenhum comando e a posição fica como está', () => {
    const colada: AlcaDeLinha = { ...u2, pos: 1, anterior: 0.95, proxima: 1.05 };
    expect(resultadoArraste(colada, 1.02, 0.1)).toEqual({ pos: 1, comando: null });
  });

  it('chegar na mesma posição depois do encaixe não gera comando', () => {
    expect(resultadoArraste(u2, 2.02, 0.1)).toEqual({ pos: 2, comando: null });
  });
});

describe('encaixe na grade do projeto', () => {
  it('sem passo, devolve a posição; com passo, arredonda para o múltiplo mais próximo', () => {
    expect(encaixarNaGrade(1.234, 0)).toBe(1.234);
    expect(encaixarNaGrade(1.26, 0.1)).toBe(1.3);
  });

  it('mede a grade a partir da origem do eixo (coordenada do mundo)', () => {
    expect(encaixarNaGrade(1, 0.5, 0.2)).toBe(0.8);
  });
});

describe('cadeado de travar', () => {
  it('o arco muda entre travada e livre; o corpo é o mesmo', () => {
    const fechado = iconeCadeado(true);
    const aberto = iconeCadeado(false);
    expect(fechado.arco).not.toBe(aberto.arco);
    expect(fechado.corpo).toBe(aberto.corpo);
  });
});
