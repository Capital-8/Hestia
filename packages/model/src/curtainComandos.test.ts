import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, resolverParede, type CurtainInstance, type CurtainSpec, type Project, type Wall, type WallType } from './index.ts';
import { t } from './i18n.ts';

// Comandos da fase 2 (decisão 0056, §4.7): adicionar, mover, travar, apagar linha; remover e restaurar segmento (com a regra
// da região retangular); trocar o montante da linha; trocar o painel da célula; "Voltar ao padrão". Cada um é um passo de
// desfazer. Parede de L = 4 m, grade U de 4 células e grade V de 2 células (H = 2,8 m).

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

const novoProjeto = (): Project => {
  const p = createEmptyProject();
  for (const id of Object.keys(p.wallTypes)) if (p.wallTypes[id]!.family === 'curtain') delete p.wallTypes[id];
  return p;
};

function cenario(inst: CurtainInstance = {}, curtain: CurtainSpec = grade(), type: WallType | null = null): ProjectStore {
  const s = new ProjectStore(novoProjeto());
  const tipo: WallType = type ?? { ...base(), id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain, layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({
    type: 'addWall',
    wall: { ...makeWall({ id: 'w_ct', typeId: tipo.id, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: inst },
  });
  return s;
}

const instanciaDe = (s: ProjectStore): CurtainInstance => (s.project.elements.w_ct as Wall).curtain ?? {};

/** Linha gerada U de índice `index` (1 a 3) numa grade de 4 células, como a UI a monta (refs canônicas). */
const linhaU = (index: number) => ({ axis: 'u' as const, index, pos: index / 4, n: 4 });
/** Linha gerada V (única, índice 1) numa grade de 2 células. */
const linhaV = { axis: 'v' as const, index: 1, pos: 0.5, n: 2 };

describe('linhas da grade', () => {
  it('adicionar linha: posição dentro do vão, id único; um passo de desfazer', () => {
    const s = cenario();
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x1', axis: 'u', pos: 1.5 } });
    expect(instanciaDe(s).addedLines).toEqual([{ id: 'x1', axis: 'u', pos: 1.5 }]);
    expect(s.undoLabel).toBe('Adicionar linha da grade');
    s.undo();
    expect(instanciaDe(s).addedLines).toBeUndefined();
  });

  it('adicionar linha: recusa posição fora do vão, id repetido e montante inexistente', () => {
    const s = cenario();
    expect(() => s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x1', axis: 'u', pos: 4 } })).toThrow(t('pt', 'md_ct_line_pos'));
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x1', axis: 'u', pos: 1.5 } });
    expect(() => s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x1', axis: 'u', pos: 2 } })).toThrow(t('pt', 'md_ct_line_exists'));
    expect(() => s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x2', axis: 'v', pos: 1, mullionTypeId: 'mul_nao_existe' } })).toThrow(
      t('pt', 'md_ct_mullion_missing'),
    );
  });

  it('mover linha extra e linha gerada: a gerada vira sobrescrita de posição e o vão mostra a nova posição', () => {
    const s = cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }] });
    s.exec({ type: 'moveGridLine', wallId: 'w_ct', line: { added: 'x1' }, pos: 2.2 });
    expect(instanciaDe(s).addedLines![0]!.pos).toBe(2.2);
    s.exec({ type: 'moveGridLine', wallId: 'w_ct', line: linhaU(2), pos: 2.8 });
    const res = resolverParede(s.project, s.project.elements.w_ct as Wall)!;
    expect(res.u.map((l) => l.pos)).toEqual([1, 2.2, 2.8, 3]);
    expect(instanciaDe(s).lineOverrides).toHaveLength(1);
  });

  it('mover: recusa posição fora do vão e linha inexistente', () => {
    const s = cenario();
    expect(() => s.exec({ type: 'moveGridLine', wallId: 'w_ct', line: linhaU(1), pos: 0 })).toThrow(t('pt', 'md_ct_line_pos'));
    expect(() => s.exec({ type: 'moveGridLine', wallId: 'w_ct', line: { added: 'nao_existe' }, pos: 1 })).toThrow(t('pt', 'md_ct_line_missing'));
  });

  it('travar e destravar: linha extra e gerada', () => {
    const s = cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }] });
    s.exec({ type: 'lockGridLine', wallId: 'w_ct', line: { added: 'x1' }, locked: true });
    expect(instanciaDe(s).addedLines![0]!.locked).toBe(true);
    s.exec({ type: 'lockGridLine', wallId: 'w_ct', line: linhaU(3), locked: true });
    expect(instanciaDe(s).lineOverrides![0]!.locked).toBe(true);
    s.exec({ type: 'lockGridLine', wallId: 'w_ct', line: { added: 'x1' }, locked: false });
    expect(instanciaDe(s).addedLines![0]!.locked).toBe(false);
  });

  it('apagar linha extra: some da grade junto com os segmentos e sobrescritas dela', () => {
    const s = cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }] });
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: { added: 'x1' }, k: 0 });
    s.exec({ type: 'removeGridLine', wallId: 'w_ct', line: { added: 'x1' } });
    expect(instanciaDe(s).addedLines).toEqual([]);
    expect(instanciaDe(s).removedSegments).toEqual([]);
  });

  it('apagar linha gerada: remove todos os segmentos dela (cada par de células funde) e fica numa região retangular', () => {
    const s = cenario();
    s.exec({ type: 'removeGridLine', wallId: 'w_ct', line: linhaU(2) });
    expect(instanciaDe(s).removedSegments).toHaveLength(2);
    const res = resolverParede(s.project, s.project.elements.w_ct as Wall)!;
    // Colunas 1 e 2 viram uma região por fileira (2 regiões de 2 células); as demais 4 células ficam sozinhas: 6 regiões.
    expect(new Set(res.canon).size).toBe(6);
  });
});

describe('segmentos da grade', () => {
  it('remover um segmento funde as duas células vizinhas; restaurar devolve a divisão', () => {
    const s = cenario();
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    expect(instanciaDe(s).removedSegments).toHaveLength(1);
    expect(s.undoLabel).toBe('Remover segmento da grade');
    s.exec({ type: 'restoreSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    expect(instanciaDe(s).removedSegments).toEqual([]);
  });

  it('recusa remover um segmento que deixa região em L (regra da região retangular, §5.2) e não muda nada', () => {
    const s = cenario();
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    const antes = JSON.stringify(instanciaDe(s));
    // O segmento da linha V (horizontal) entre as células (0,0) e (0,1) junta uma célula a mais e vira L.
    expect(() => s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaV, k: 0 })).toThrow(t('pt', 'md_ct_regiao_nao_retangular'));
    expect(JSON.stringify(instanciaDe(s))).toBe(antes);
  });

  it('remover os dois segmentos de uma linha dá região retangular (a coluna inteira)', () => {
    const s = cenario();
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 1 });
    expect(instanciaDe(s).removedSegments).toHaveLength(2);
  });

  it('recusa segmento já removido, fora da grade e restaurar um que não foi removido', () => {
    const s = cenario();
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    expect(() => s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 })).toThrow(t('pt', 'md_ct_segment_invalid'));
    expect(() => s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 2 })).toThrow(t('pt', 'md_ct_segment_invalid'));
    expect(() => s.exec({ type: 'restoreSegment', wallId: 'w_ct', line: linhaU(2), k: 0 })).toThrow(t('pt', 'md_ct_segment_invalid'));
  });
});

describe('montante da linha e painel da célula', () => {
  it('trocar o montante de uma linha gerada e de uma extra; voltar ao padrão', () => {
    const s = cenario({ addedLines: [{ id: 'x1', axis: 'u', pos: 1.5 }] });
    s.exec({ type: 'setLineMullion', wallId: 'w_ct', line: { added: 'x1' }, mullionTypeId: 'mul_red_50' });
    s.exec({ type: 'setLineMullion', wallId: 'w_ct', line: linhaU(3), mullionTypeId: null });
    const res = resolverParede(s.project, s.project.elements.w_ct as Wall)!;
    expect(res.u.find((l) => l.added === 'x1')!.montante).toBe('mul_red_50');
    expect(res.u.find((l) => l.gerada === 2)!.montante).toBeNull();
    s.exec({ type: 'clearLineOverride', wallId: 'w_ct', line: { added: 'x1' } });
    s.exec({ type: 'clearLineOverride', wallId: 'w_ct', line: linhaU(3) });
    const depois = resolverParede(s.project, s.project.elements.w_ct as Wall)!;
    expect(depois.u.find((l) => l.added === 'x1')!.montante).toBeUndefined();
    expect(instanciaDe(s).lineOverrides).toEqual([]);
  });

  it('montante: recusa tipo inexistente', () => {
    const s = cenario();
    expect(() => s.exec({ type: 'setLineMullion', wallId: 'w_ct', line: linhaU(1), mullionTypeId: 'mul_nao_existe' })).toThrow(t('pt', 'md_ct_mullion_missing'));
  });

  it('trocar o painel de uma célula: sólido numa fileira; a célula vira chave e recebe o override', () => {
    const s = cenario();
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 2, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    const c = instanciaDe(s).cells!;
    expect(c).toHaveLength(1);
    expect(c[0]!.key).toMatchObject({ i: 2, j: 0, nu: 4, nv: 2 });
    expect(c[0]!.key.s).toBeCloseTo(2.5 / 4, 9);
    expect(c[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_solido_alu_4' });
    expect(s.undoLabel).toBe('Trocar painel da célula');
  });

  it('trocar o painel de uma célula de região fundida vale para a região toda (chave canônica)', () => {
    const s = cenario();
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: linhaU(1), k: 0 });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_vazio' });
    const c = instanciaDe(s).cells!;
    expect(c).toHaveLength(1);
    expect(c[0]!.key).toMatchObject({ i: 0, j: 0 });
    expect(c[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_vazio' });
  });

  it('voltar célula ao padrão: remove a sobrescrita da célula (e da região dela)', () => {
    const s = cenario();
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 2, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    s.exec({ type: 'clearCellOverride', wallId: 'w_ct', i: 2, j: 1 });
    expect(instanciaDe(s).cells).toEqual([]);
    expect(s.undoLabel).toBe('Voltar célula ao padrão');
    s.undo();
    expect(instanciaDe(s).cells).toHaveLength(1);
  });

  it('painel e célula: recusa painel inexistente, célula fora da grade e parede que não é cortina', () => {
    const s = cenario();
    expect(() => s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_nao_existe' })).toThrow(t('pt', 'md_ct_panel_missing'));
    expect(() => s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 4, j: 0, panelTypeId: 'pnl_vazio' })).toThrow(t('pt', 'md_ct_cell_missing'));
    s.exec({ type: 'upsertWallType', wallType: { ...base(), id: 'wt_basica', name: 'Básica' } });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_basica', typeId: 'wt_basica', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 4, y: 5 } }) });
    expect(() => s.exec({ type: 'addGridLine', wallId: 'w_basica', line: { id: 'x', axis: 'u', pos: 1 } })).toThrow(t('pt', 'md_ct_not_curtain'));
  });
});

describe('um passo de desfazer por comando', () => {
  it('cada comando de sobrescrita volta com um único undo', () => {
    const s = cenario();
    const antes = JSON.stringify(s.project.elements.w_ct);
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x1', axis: 'u', pos: 1.5 } });
    s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 0, j: 0, panelTypeId: 'pnl_solido_alu_4' });
    s.undo();
    s.undo();
    expect(JSON.stringify(s.project.elements.w_ct)).toBe(antes);
  });
});
