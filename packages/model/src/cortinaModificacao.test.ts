import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, validateProject, type CurtainInstance, type CurtainSpec, type Project, type Wall, type WallType } from './index.ts';

// Tabela de modificação da parede cortina (decisão 0056, §4.9): cada linha roda a operação de verdade e confere o que
// acontece com a instância (`Wall.curtain`). Parede de L = 4 m, grade U de 4 células, grade V de 2 células (H = 2,8 m).

const base = (): WallType => createEmptyProject().wallTypes.wt_alv14!;

const grade = (): CurtainSpec => ({
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
});

const novoProjeto = (): Project => {
  const p = createEmptyProject();
  for (const id of Object.keys(p.wallTypes)) if (p.wallTypes[id]!.family === 'curtain') delete p.wallTypes[id];
  return p;
};

function cenario(inst: CurtainInstance = {}): ProjectStore {
  const s = new ProjectStore(novoProjeto());
  const tipo: WallType = { ...base(), id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade(), layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({ type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: inst } });
  // Sobrescritas de referência: painel sólido na célula (1, 0) e vazio na célula (3, 1). Gravadas por comando.
  s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 0, panelTypeId: 'pnl_solido_alu_4' });
  s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 3, j: 1, panelTypeId: 'pnl_vazio' });
  return s;
}

const paredeDe = (s: ProjectStore, id = 'w_ct'): Wall => s.project.elements[id] as Wall;
const instanciaDe = (s: ProjectStore, id = 'w_ct'): CurtainInstance => paredeDe(s, id).curtain ?? {};
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('§4.9: tabela de modificação da parede cortina', () => {
  it('mover: a instância não muda (coordenadas relativas ao eixo)', () => {
    const s = cenario();
    const antes = copia(instanciaDe(s));
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'translate', d: { x: 2, y: 5 } } });
    expect(instanciaDe(s)).toEqual(antes);
    expect(paredeDe(s).a).toEqual({ x: 2, y: 5 });
  });

  it('girar: a instância não muda', () => {
    const s = cenario();
    const antes = copia(instanciaDe(s));
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(instanciaDe(s)).toEqual(antes);
  });

  it('copiar: a cópia leva a instância idêntica e a original não muda', () => {
    const s = cenario();
    const antes = copia(instanciaDe(s));
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'translate', d: { x: 0, y: 3 } }, copy: { idMap: { w_ct: 'w_cp' } } });
    expect(instanciaDe(s, 'w_cp')).toEqual(antes);
    expect(instanciaDe(s)).toEqual(antes);
  });

  it('colar entre níveis: a altura não muda, a instância fica igual nos dois modos de manter', () => {
    for (const keep of ['elevation', 'offset'] as const) {
      const s = cenario();
      const antes = copia(instanciaDe(s));
      s.exec({ type: 'setElementLevel', ids: ['w_ct'], levelId: 'lv_1', keep });
      expect(instanciaDe(s)).toEqual(antes);
    }
  });

  it('espelhar: a célula física da sobrescrita fica no lugar espelhado (não há troca de chave)', () => {
    const s = cenario();
    // Painel sólido na célula (1, 0), centro físico x = 1,5. Espelho em x = 2: o centro vai para x = 2,5.
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'mirror', a: { x: 2, y: 0 }, b: { x: 2, y: 1 } } });
    const w = paredeDe(s);
    const c = instanciaDe(s).cells!.find((e) => e.override.kind === 'panel' && e.override.panelTypeId === 'pnl_solido_alu_4')!;
    expect(c.key.i).toBe(1);
    expect(w.a.x + c.key.s * (w.b.x - w.a.x)).toBeCloseTo(2.5, 9);
  });

  it('aparar e estender: a grade recalcula e as chaves seguem a célula de mesmo índice', () => {
    const s = cenario();
    s.exec({ type: 'setWallEnds', id: 'w_ct', b: { x: 3, y: 0 } });
    const cells = instanciaDe(s).cells!;
    expect(cells.map((c) => c.key.i).sort()).toEqual([1, 3]);
    expect(cells.every((c) => c.key.nu === 4)).toBe(true);
    // Célula 1 continua na posição relativa 1 de 4 (centro 1,125 de 3 m).
    expect(cells.find((c) => c.key.i === 1)!.key.s).toBeCloseTo(1.125 / 3, 9);
    s.exec({ type: 'setWallEnds', id: 'w_ct', b: { x: 4.5, y: 0 } });
    expect(instanciaDe(s).cells!.find((c) => c.key.i === 1)!.key.s).toBeCloseTo(1.6875 / 4.5, 9);
  });

  it('dividir: cada sobrescrita vai para a parte do seu centro; a célula de centro sobre o corte é dividida pelo centro', () => {
    const s = cenario();
    s.exec({ type: 'splitWall', id: 'w_ct', newId: 'w_dir', t: 2.4 });
    // Centros: célula 1 em 1,5 (esquerda) e célula 3 em 3,5 (direita). Esquerda: L = 2,4, 4 células de 0,6; 1,5 cai na 2.
    const esq = instanciaDe(s, 'w_ct').cells!;
    expect(esq).toHaveLength(1);
    expect(esq[0]!.key.i).toBe(2);
    expect(esq[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_solido_alu_4' });
    // Direita: L = 1,6, 4 células de 0,4. A célula 3 tem centro 3,5 > 2,4 e vai para a direita; no novo referencial, 1,1 cai na 2.
    const dir = instanciaDe(s, 'w_dir').cells!;
    expect(dir).toHaveLength(1);
    expect(dir[0]!.key.i).toBe(2);
    expect(dir[0]!.override).toEqual({ kind: 'panel', panelTypeId: 'pnl_vazio' });
    expect(validateProject(s.project).filter((i) => i.code === 'cortina-override-orfao')).toEqual([]);
  });

  it('dividir: linha extra vai para a parte do seu lado, com a posição medida a partir do corte', () => {
    const s = cenario({ addedLines: [{ id: 'x25', axis: 'u', pos: 2.5 }] });
    s.exec({ type: 'splitWall', id: 'w_ct', newId: 'w_dir', t: 2.2 });
    expect(instanciaDe(s, 'w_ct').addedLines ?? []).toEqual([]);
    const dir = instanciaDe(s, 'w_dir').addedLines ?? [];
    expect(dir).toHaveLength(1);
    expect(dir[0]!.pos).toBeCloseTo(0.3, 9);
  });

  it('alterar altura: a grade V recalcula e a sobrescrita da fileira de cima continua nela', () => {
    const s = cenario();
    s.exec({ type: 'updateElements', ids: ['w_ct'], patch: { height: 3.6 } });
    const c = instanciaDe(s).cells!.find((e) => e.override.kind === 'panel' && e.override.panelTypeId === 'pnl_vazio')!;
    expect(c.key.j).toBe(1);
    expect(c.key.nv).toBe(2);
    // Fileira de cima: centro (1,8 + 3,6) / 2 = 2,7 de 3,6 → 0,75, igual ao gravado (2,1 / 2,8).
    expect(c.key.z).toBeCloseTo(0.75, 9);
  });

  it('apagar: a parede e a instância saem juntas', () => {
    const s = cenario();
    s.exec({ type: 'deleteElements', ids: ['w_ct'] });
    expect(s.project.elements.w_ct).toBeUndefined();
  });

  it('um comando que não muda a geometria não mexe nas chaves gravadas', () => {
    const s = cenario();
    const antes = copia(instanciaDe(s));
    s.exec({ type: 'updateElements', ids: ['w_ct'], patch: { mark: 'P-01' } });
    expect(instanciaDe(s)).toEqual(antes);
  });
});
