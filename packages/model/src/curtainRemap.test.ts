import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  makeWall,
  resolverParede,
  validateProject,
  type CurtainInstance,
  type CurtainSpec,
  type Project,
  type Wall,
  type WallType,
} from './index.ts';

// Remapeamento das sobrescritas (decisão 0056, §4.4): a chave é índice + posição normalizada, e cada caso do §10
// (fase 2) tem um teste: grade ganha linha, perde linha, encurta, estica, espelha, divide e funde duas sobrescritas.
// Parede de L = 4 m e H = 2,8 m (padrão do makeWall). Grade U: 4 células de 1 m; grade V: 2 células.

const base = (): WallType => createEmptyProject().wallTypes.wt_alv14!;

const grade = (over: Partial<CurtainSpec> = {}): CurtainSpec => ({
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
  ...over,
});

const tipoCortina = (curtain: CurtainSpec): WallType => ({
  ...base(),
  id: 'wt_ct',
  name: 'Cortina teste',
  family: 'curtain',
  curtain,
  layers: [],
  strips: [],
  wrapInserts: 'none',
  wrapEnds: 'none',
});

/** Projeto sem as predefinições de cortina de fábrica (a fase 1 as semeia; aqui o caso é controlado). */
const novoProjeto = (): Project => {
  const p = createEmptyProject();
  for (const id of Object.keys(p.wallTypes)) if (p.wallTypes[id]!.family === 'curtain') delete p.wallTypes[id];
  return p;
};

/** Projeto com uma parede cortina `w_ct` de comprimento L, de (0,0) a (L,0), com a instância dada. */
function cenario(L = 4, inst: CurtainInstance = {}, curtain: CurtainSpec = grade()): ProjectStore {
  const s = new ProjectStore(novoProjeto());
  s.exec({ type: 'upsertWallType', wallType: tipoCortina(curtain) });
  s.exec({
    type: 'addWall',
    wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: L, y: 0 } }), curtain: inst },
  });
  return s;
}

const paredeDe = (s: ProjectStore, id = 'w_ct'): Wall => s.project.elements[id] as Wall;
const instanciaDe = (s: ProjectStore, id = 'w_ct'): CurtainInstance => paredeDe(s, id).curtain ?? {};

describe('remapeamento: grade ganha e perde linha (§4.4 passos 1 e 2)', () => {
  it('grade ganha linha: as células que não passam da linha mantêm o índice; a que tem o centro sobre a linha vai para a de menor índice', () => {
    const s = cenario(4, { addedLines: [] });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 3, j: 0, panelTypeId: 'pnl_vazio' });
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x35', axis: 'u', pos: 3.5 } });
    const celulas = instanciaDe(s).cells ?? [];
    const solida = celulas.find((c) => c.override.kind === 'panel' && c.override.panelTypeId === 'pnl_solido_alu_4')!;
    const vazia = celulas.find((c) => c.override.kind === 'panel' && c.override.panelTypeId === 'pnl_vazio')!;
    expect(solida.key.i).toBe(1);
    expect(solida.key.nu).toBe(5);
    // Centro da célula 3 (3 a 4) = 3,5 = a linha nova: fica a de menor índice, [3; 3,5].
    expect(vazia.key.i).toBe(3);
    expect(vazia.key.s).toBeCloseTo(3.25 / 4, 9);
  });

  it('grade perde linha: a célula da direita da linha apagada cai na célula que a contém (índice novo)', () => {
    const s = cenario(4, { addedLines: [{ id: 'x35', axis: 'u', pos: 3.5 }] });
    // Célula [3,5; 4] (índice 4 na grade com a linha extra), centro 3,75.
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 4, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'removeGridLine', wallId: 'w_ct', line: { added: 'x35' } });
    const celulas = instanciaDe(s).cells ?? [];
    expect(celulas).toHaveLength(1);
    expect(celulas[0]!.key.i).toBe(3);
    expect(celulas[0]!.key.nu).toBe(4);
    expect(celulas[0]!.key.s).toBeCloseTo(3.5 / 4, 9);
  });
});

describe('remapeamento: a parede muda de comprimento (§4.4, §4.9 aparar/estender)', () => {
  it('encurta com a topologia mudando: a célula da ponta passa para a célula que tem a mesma posição relativa', () => {
    // Grade por distância 1,5: linhas em 1,5 e 3,0 (3 células). Sobrescrita na última célula, centro 3,5 (s = 0,875).
    const s = cenario(4, {}, grade({ u: { mode: 'fixedDistance', distance: 1.5 } }));
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 2, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    expect(instanciaDe(s).cells![0]!.key.nu).toBe(3);
    s.exec({ type: 'setWallEnds', id: 'w_ct', b: { x: 2.9, y: 0 } });
    const c = instanciaDe(s).cells!;
    expect(c).toHaveLength(1);
    // L = 2,9: uma linha em 1,5 e duas células. O ponto 0,875 × 2,9 = 2,5375 cai na célula de [1,5; 2,9] (índice 1).
    expect(c[0]!.key.i).toBe(1);
    expect(c[0]!.key.nu).toBe(2);
  });

  it('estica com a topologia mudando: a sobrescrita acompanha a célula de mesma posição relativa', () => {
    const s = cenario(4, {}, grade({ u: { mode: 'fixedDistance', distance: 1.5 } }));
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 2, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setWallEnds', id: 'w_ct', b: { x: 6, y: 0 } });
    const c = instanciaDe(s).cells!;
    expect(c).toHaveLength(1);
    // L = 6: linhas em 1,5, 3,0 e 4,5 (4 células). O ponto 0,875 × 6 = 5,25 cai na última célula, índice 3.
    expect(c[0]!.key.i).toBe(3);
    expect(c[0]!.key.nu).toBe(4);
  });

  it('estica com a topologia igual: vale o índice, a célula cresce com a parede', () => {
    const s = cenario(4);
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setWallEnds', id: 'w_ct', b: { x: 5, y: 0 } });
    const c = instanciaDe(s).cells!;
    expect(c[0]!.key.i).toBe(1);
    // L = 5 com 4 células: a célula 1 vai de 1,25 a 2,5; centro 1,875.
    expect(c[0]!.key.s).toBeCloseTo(1.875 / 5, 9);
  });

  it('altura: a sobrescrita de célula e a linha extra de V acompanham a fração (linha sem locked escala com H)', () => {
    const s = cenario(4, { addedLines: [{ id: 'h1', axis: 'v', pos: 1 }, { id: 'h2', axis: 'v', pos: 2, locked: true }] });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'updateElements', ids: ['w_ct'], patch: { height: 3.5 } });
    const extras = new Map((instanciaDe(s).addedLines ?? []).map((l) => [l.id, l.pos]));
    expect(extras.get('h1')).toBeCloseTo((1 * 3.5) / 2.8, 9);
    expect(extras.get('h2')).toBe(2);
  });
});

describe('remapeamento: espelho, divisão e fusão (§4.4, §4.9)', () => {
  it('espelha: a célula física da sobrescrita fica no lugar espelhado (o referencial a→b acompanha o espelho)', () => {
    const s = cenario(4);
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    const antes = instanciaDe(s).cells![0]!.key;
    // Centro físico antes: x = 0,5. Espelho em x = 2: o centro físico vai para x = 3,5.
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'mirror', a: { x: 2, y: 0 }, b: { x: 2, y: 1 } } });
    const w = paredeDe(s);
    expect(w.a.x).toBeCloseTo(4, 9);
    const depois = instanciaDe(s).cells![0]!.key;
    expect(depois.i).toBe(antes.i);
    const xFisico = w.a.x + depois.s * (w.b.x - w.a.x);
    expect(xFisico).toBeCloseTo(3.5, 9);
  });

  it('divide: cada célula vai para a parte do seu centro e recebe a chave da parte (regravada pela posição)', () => {
    const s = cenario(4);
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 0, panelTypeId: 'pnl_vazio' });
    s.exec({ type: 'splitWall', id: 'w_ct', newId: 'w_dir', t: 1.4 });
    const esq = instanciaDe(s, 'w_ct').cells ?? [];
    const dir = instanciaDe(s, 'w_dir').cells ?? [];
    // Parte esquerda, L = 1,4 (4 células de 0,35): o centro 0,5 cai no índice 1.
    expect(esq).toHaveLength(1);
    expect(esq[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_solido_alu_4' });
    expect(esq[0]!.key.i).toBe(1);
    // Parte direita, L = 2,6 (4 células de 0,65): o centro 1,5 vira o ponto 0,1, que cai no índice 0.
    expect(dir).toHaveLength(1);
    expect(dir[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_vazio' });
    expect(dir[0]!.key.i).toBe(0);
  });

  it('funde duas sobrescritas na mesma célula: vence a de menor distância entre o ponto gravado e o centro; a outra cai', () => {
    const s = cenario(4);
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x32', axis: 'u', pos: 3.2 } });
    // Células [3; 3,2] (centro 3,1) e [3,2; 4] (centro 3,6). Sobrescritas nas duas.
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 3, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 4, j: 0, panelTypeId: 'pnl_vazio' });
    expect(instanciaDe(s).cells).toHaveLength(2);
    // Remover a linha junta as duas no centro 3,5: a de centro 3,6 está a 0,1; a de 3,1 está a 0,4.
    s.exec({ type: 'removeGridLine', wallId: 'w_ct', line: { added: 'x32' } });
    const c = instanciaDe(s).cells ?? [];
    expect(c).toHaveLength(1);
    expect(c[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_vazio' });
    expect(c[0]!.key.i).toBe(3);
  });
});

describe('normalizarSobrescritas (§4.4 passos 5 e 6)', () => {
  /** Duas sobrescritas que caem na mesma célula, gravadas direto (sem passar por um comando). */
  const sobrando = (): ProjectStore =>
    cenario(4, {
      cells: [
        { key: { i: 0, j: 0, s: 0.13, z: 0.25, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
        { key: { i: 0, j: 0, s: 0.2, z: 0.25, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } },
      ],
    });

  it('o aviso de projeto cortina-override-orfao aparece antes da normalização e some depois', () => {
    const s = sobrando();
    expect(validateProject(s.project).filter((i) => i.code === 'cortina-override-orfao')).toHaveLength(1);
    s.exec({ type: 'normalizarSobrescritas', wallId: 'w_ct' });
    expect(validateProject(s.project).filter((i) => i.code === 'cortina-override-orfao')).toHaveLength(0);
  });

  it('descarta a órfã, regrava a chave da sobrevivente e fica num único passo de desfazer', () => {
    const s = sobrando();
    s.exec({ type: 'normalizarSobrescritas', wallId: 'w_ct' });
    const c = instanciaDe(s).cells!;
    expect(c).toHaveLength(1);
    expect(c[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_solido_alu_4' });
    expect(c[0]!.key.s).toBeCloseTo(0.125, 9);
    expect(s.undoLabel).toBe('Normalizar sobrescritas da cortina');
    s.undo();
    expect(instanciaDe(s).cells).toHaveLength(2);
  });

  it('normalizar sem id percorre todas as paredes cortina', () => {
    const s = sobrando();
    s.exec({ type: 'normalizarSobrescritas' });
    expect(instanciaDe(s).cells).toHaveLength(1);
  });

  it('a resolução é só leitura: não grava no modelo', () => {
    const s = sobrando();
    const antes = JSON.stringify(s.project.elements.w_ct);
    const res = resolverParede(s.project, paredeDe(s));
    expect(res!.orfas).toHaveLength(1);
    expect(JSON.stringify(s.project.elements.w_ct)).toBe(antes);
  });
});
