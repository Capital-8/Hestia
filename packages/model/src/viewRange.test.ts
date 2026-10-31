import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_RANGE,
  ProjectStore,
  SCHEMA_VERSION,
  createEmptyProject,
  makeLevel,
  makeWall,
  migrateProject,
  validateProject,
  viewRangeIssues,
  viewRangeOf,
  type Level,
  type Project,
} from './index.ts';

const LV0 = 'lv_0';
const CODE = 'level-view-range-invalid';

/** Projeto no formato da versão 14: níveis sem `viewRange`, com um nível extra e uma parede. */
function legacyV14(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 14;
  p.levels = [
    { id: 'lv_0', name: 'Térreo', elevation: 0 },
    { id: 'lv_m', name: 'Mezanino', elevation: 1.5 },
  ];
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements = { w1: { ...w, order: 1 } };
  return p;
}

/** Salva (JSON, como o arquivo) e abre de novo. */
const roundTrip = (p: Project): Project => migrateProject(JSON.parse(JSON.stringify(p)));

describe('makeLevel e padrão do intervalo de vista', () => {
  it('sem viewRange, usa o padrão (topo 2,30; corte 1,20; base 0) sem compartilhar o objeto', () => {
    const l = makeLevel({ id: 'lv_x', name: 'X', elevation: 4 });
    expect(l).toEqual({ id: 'lv_x', name: 'X', elevation: 4, viewRange: DEFAULT_VIEW_RANGE });
    expect(l.viewRange).not.toBe(DEFAULT_VIEW_RANGE);
    l.viewRange.cut = 9;
    expect(DEFAULT_VIEW_RANGE.cut).toBe(1.2);
  });

  it('com viewRange, usa o informado', () => {
    const vr = { top: 3, cut: 1, bottom: 0, depth: 0, direction: 'down' as const };
    expect(makeLevel({ id: 'lv_x', name: 'X', elevation: 0, viewRange: vr }).viewRange).toEqual(vr);
  });

  it('todo nível de projeto novo tem o padrão', () => {
    for (const l of createEmptyProject().levels) expect(l.viewRange).toEqual(DEFAULT_VIEW_RANGE);
  });

  it('viewRangeIssues: o padrão é válido', () => {
    expect(viewRangeIssues(DEFAULT_VIEW_RANGE)).toEqual([]);
  });

  it('viewRangeOf devolve o intervalo do nível e, sem o nível, o padrão', () => {
    const p = createEmptyProject();
    p.levels[0] = { ...p.levels[0]!, viewRange: { ...DEFAULT_VIEW_RANGE, cut: 1.0 } };
    expect(viewRangeOf(p, LV0).cut).toBe(1.0);
    expect(viewRangeOf(p, 'lv_nao_existe')).toEqual(DEFAULT_VIEW_RANGE);
  });
});

describe('migração 14 → 15 (intervalo de vista)', () => {
  it('todo nível antigo ganha o padrão e preserva id, nome e cota', () => {
    const m = migrateProject(legacyV14());
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(23);
    expect(m.levels).toEqual([
      { id: 'lv_0', name: 'Térreo', elevation: 0, viewRange: DEFAULT_VIEW_RANGE },
      { id: 'lv_m', name: 'Mezanino', elevation: 1.5, viewRange: DEFAULT_VIEW_RANGE },
    ]);
  });

  it('não altera o restante do projeto (elementos, tipos, nome)', () => {
    const m = migrateProject(legacyV14());
    const base = createEmptyProject();
    expect(m.name).toBe(base.name);
    expect(m.elements.w1).toMatchObject({ kind: 'wall', id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(m.wallTypes).toEqual(base.wallTypes);
    expect(m.stairTypes).toEqual(base.stairTypes);
    expect(m.defaults).toEqual(base.defaults);
  });

  it('um intervalo que já exista no nível é mantido', () => {
    const raw = legacyV14();
    (raw.levels as Array<Record<string, unknown>>)[0]!.viewRange = { ...DEFAULT_VIEW_RANGE, cut: 1.0 };
    const m = migrateProject(raw);
    expect(m.levels[0]!.viewRange.cut).toBe(1.0);
    expect(m.levels[1]!.viewRange).toEqual(DEFAULT_VIEW_RANGE);
  });
});

describe('comando setLevelViewRange', () => {
  it('aplica o patch parcial e mantém o restante do intervalo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { cut: 1.0 } });
    expect(viewRangeOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.0 });
  });

  it('aceita a direção "up" (guardada; a planta ainda desenha como "down")', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { top: 3, direction: 'up' } });
    expect(viewRangeOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, top: 3, direction: 'up' });
  });

  it('não normaliza em silêncio: o valor aplicado é exatamente o pedido', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { top: 2.8, cut: 1.1, bottom: -0.2, depth: -1 } });
    expect(viewRangeOf(s.project, LV0)).toEqual({ top: 2.8, cut: 1.1, bottom: -0.2, depth: -1, direction: 'down' });
  });

  it.each([
    ['topo abaixo do corte', { top: 1.0 }, 'O topo do intervalo de vista deve estar acima ou no plano de corte.'],
    ['corte abaixo da base', { cut: -0.1 }, 'O plano de corte deve estar acima ou na base do intervalo de vista.'],
    // A base sozinha seria válida; o que se confere é o resultado final (corte 1,20 < base 1,50).
    ['base acima do corte', { bottom: 1.5 }, 'O plano de corte deve estar acima ou na base do intervalo de vista.'],
    ['profundidade acima da base', { depth: 0.5 }, 'A profundidade de vista deve estar abaixo ou na base do intervalo de vista.'],
    ['direção inválida', { direction: 'left' as unknown as 'down' }, 'A direção da vista deve ser "down" ou "up".'],
    ['cota NaN', { top: Number.NaN }, 'As cotas do intervalo de vista devem ser números finitos, em metros.'],
    ['cota infinita', { top: Number.POSITIVE_INFINITY }, 'As cotas do intervalo de vista devem ser números finitos, em metros.'],
  ])('recusa %s, com a mensagem, sem alterar o projeto nem entrar no histórico', (_nome, patch, mensagem) => {
    const s = new ProjectStore(createEmptyProject());
    const antes = s.project;
    expect(() => s.exec({ type: 'setLevelViewRange', levelId: LV0, patch })).toThrow(mensagem);
    expect(s.project).toBe(antes);
    expect(s.canUndo).toBe(false);
  });

  it('nível inexistente é recusado', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'setLevelViewRange', levelId: 'lv_nao_existe', patch: { cut: 1 } })).toThrow('Nível inexistente');
  });

  it('desfazer e refazer seguem a ordem dos comandos, com o rótulo do histórico', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { cut: 1.0 } });
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { top: 3 } });
    expect(s.undoLabel).toBe('Alterar intervalo de vista');

    s.undo();
    expect(viewRangeOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.0 });
    s.undo();
    expect(viewRangeOf(s.project, LV0)).toEqual(DEFAULT_VIEW_RANGE);

    s.redo();
    expect(viewRangeOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.0 });
    s.redo();
    expect(viewRangeOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.0, top: 3 });
  });
});

describe('validação do intervalo de vista', () => {
  it('projeto novo não tem erro de intervalo', () => {
    expect(validateProject(createEmptyProject()).filter((i) => i.code === CODE)).toEqual([]);
  });

  it('nível com topo abaixo do corte vira erro do projeto, com o nome do nível', () => {
    const p = createEmptyProject();
    p.levels[0] = { ...p.levels[0]!, viewRange: { ...DEFAULT_VIEW_RANGE, top: 1 } };
    expect(validateProject(p).filter((i) => i.code === CODE)).toEqual([
      {
        severity: 'error',
        code: CODE,
        message: 'Nível "Térreo" (lv_0): O topo do intervalo de vista deve estar acima ou no plano de corte.',
      },
    ]);
  });

  it('nível sem intervalo de vista vira erro', () => {
    const p = createEmptyProject();
    const semVista: Partial<Level> = { ...p.levels[1] };
    delete semVista.viewRange;
    p.levels[1] = semVista as Level;
    const msgs = validateProject(p).filter((i) => i.code === CODE).map((i) => i.message);
    expect(msgs).toEqual(['Nível "Pavimento 2" (lv_1): Falta o intervalo de vista do nível.']);
  });
});

describe('serialização do intervalo de vista (abrir e salvar)', () => {
  it('ida e volta mantém o intervalo de cada nível, inclusive direção "up" e valores negativos', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { top: 2.8, cut: 1.1, bottom: -0.2, depth: -1, direction: 'up' } });
    s.exec({
      type: 'upsertLevel',
      level: makeLevel({ id: 'lv_2', name: 'Cobertura', elevation: 6, viewRange: { top: 1.5, cut: 1.0, bottom: 0.5, depth: 0, direction: 'down' } }),
    });
    const volta = roundTrip(s.project);
    expect(volta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(volta.levels).toEqual(s.project.levels);
    expect(validateProject(volta).filter((i) => i.code === CODE)).toEqual([]);
  });

  it('arquivo da versão 14 aberto, editado e salvo volta como versão 15 com o intervalo', () => {
    const s = new ProjectStore(migrateProject(legacyV14()));
    s.exec({ type: 'setLevelViewRange', levelId: LV0, patch: { cut: 1.0 } });
    const volta = roundTrip(s.project);
    expect(volta.schemaVersion).toBe(23);
    expect(viewRangeOf(volta, LV0)).toEqual({ ...DEFAULT_VIEW_RANGE, cut: 1.0 });
    expect(viewRangeOf(volta, 'lv_m')).toEqual(DEFAULT_VIEW_RANGE);
  });
});
