import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINE_WEIGHTS,
  DEFAULT_PROJECT_GRAPHICS,
  DEFAULT_VIEW_3D,
  DEFAULT_VIEW_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  graphicsIssues,
  graphicsOf,
  isDefaultLevelGraphics,
  levelGraphicsOf,
  migrateProject,
  sectionGraphicsOf,
  validateProject,
  view3dOf,
  type Command,
  type DeepPartial,
  type Project,
  type ProjectGraphics,
  type View3DSettings,
  type ViewGraphics,
} from './index.ts';
import { patchFloorOfTest } from './testVistas.ts';

const LV0 = 'lv_0';
const CODE = 'graphics-invalid';

/** Salva (JSON, como o arquivo) e abre de novo. */
const roundTrip = (p: Project): Project => migrateProject(JSON.parse(JSON.stringify(p)));
const issuesOf = (p: Project): string[] => validateProject(p).filter((i) => i.code === CODE).map((i) => i.message);
/** Força um valor fora do tipo, para testar a recusa. */
const bad = <T>(x: unknown): T => x as T;

const pg = (patch: DeepPartial<ProjectGraphics>): Command => ({ type: 'setProjectGraphics', patch });
const lg = (patch: DeepPartial<ViewGraphics>, levelId = LV0): Command => ({ type: 'setLevelGraphics', levelId, patch });
const v3 = (patch: DeepPartial<View3DSettings>): Command => ({ type: 'setView3D', patch });

describe('padrões e arquivos sem os campos de gráficos', () => {
  it('projeto novo: os getters dão o padrão e não há erro de gráficos', () => {
    const p = createEmptyProject();
    expect(graphicsOf(p)).toEqual(DEFAULT_PROJECT_GRAPHICS);
    expect(levelGraphicsOf(p, LV0)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(view3dOf(p)).toEqual(DEFAULT_VIEW_3D);
    expect(sectionGraphicsOf(p)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(issuesOf(p)).toEqual([]);
  });

  it('arquivo antigo, sem os campos, abre com o padrão e continua sem os campos salvos', () => {
    const antigo = migrateProject(JSON.parse(JSON.stringify(createEmptyProject())));
    expect(antigo.graphics).toBeUndefined();
    expect(antigo.view3d).toBeUndefined();
    expect(antigo.planViews[0]!.graphics).toBeUndefined();
    expect(levelGraphicsOf(antigo, LV0)).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('os padrões passam em graphicsIssues', () => {
    expect(graphicsIssues(DEFAULT_PROJECT_GRAPHICS)).toEqual([]);
    expect(graphicsIssues(DEFAULT_VIEW_GRAPHICS)).toEqual([]);
    expect(graphicsIssues(DEFAULT_VIEW_3D)).toEqual([]);
  });
});

describe('setProjectGraphics', () => {
  it('aplica o patch parcial e grava o projeto completo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(pg({ categories: { wall: { cutWeight: 7 } } }));
    const esperado = {
      lineWeights: DEFAULT_LINE_WEIGHTS,
      categories: { ...DEFAULT_PROJECT_GRAPHICS.categories, wall: { cutWeight: 7, projectionWeight: 2 } },
      detailByScale: DEFAULT_PROJECT_GRAPHICS.detailByScale,
    };
    expect(s.project.graphics).toEqual(esperado);
    expect(graphicsOf(s.project)).toEqual(esperado);
  });

  it('mescla por categoria: um segundo patch na mesma categoria mantém o primeiro', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(pg({ categories: { wall: { cutWeight: 7 } } }));
    s.exec(pg({ categories: { wall: { projectionWeight: 4 } } }));
    expect(graphicsOf(s.project).categories.wall).toEqual({ cutWeight: 7, projectionWeight: 4 });
    expect(graphicsOf(s.project).categories.door).toEqual(DEFAULT_PROJECT_GRAPHICS.categories.door);
  });

  it('lineWeights substitui a tabela inteira', () => {
    const s = new ProjectStore(createEmptyProject());
    const tabela = DEFAULT_LINE_WEIGHTS.map((r) => [r[0] * 2, r[1] * 2, r[2] * 2] as const);
    s.exec(pg({ lineWeights: tabela }));
    expect(graphicsOf(s.project).lineWeights).toEqual(tabela);
  });

  it('desfazer e refazer seguem a ordem, com o rótulo do histórico', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(pg({ categories: { wall: { cutWeight: 7 } } }));
    s.exec(pg({ categories: { door: { cutWeight: 4 } } }));
    expect(s.undoLabel).toBe('Alterar gráficos do projeto');

    s.undo();
    expect(graphicsOf(s.project).categories.door.cutWeight).toBe(DEFAULT_PROJECT_GRAPHICS.categories.door.cutWeight);
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(7);
    s.undo();
    expect(s.project.graphics).toBeUndefined();

    s.redo();
    s.redo();
    expect(graphicsOf(s.project).categories.wall.cutWeight).toBe(7);
    expect(graphicsOf(s.project).categories.door.cutWeight).toBe(4);
  });
});

describe('setLevelGraphics', () => {
  it('escala 1:50 muda só a escala e grava a planta completa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ scale: 50 }));
    expect(levelGraphicsOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50 });
    expect(s.project.planViews[0]!.graphics).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50 });
  });

  it('overrides mesclam por categoria', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ overrides: { window: { visible: false } } }));
    s.exec(lg({ overrides: { wall: { transparency: 0.5 } } }));
    const o = levelGraphicsOf(s.project, LV0).overrides;
    expect(o.window).toEqual({ visible: false, transparency: 0, halftone: false });
    expect(o.wall).toEqual({ visible: true, transparency: 0.5, halftone: false });
    expect(o.door).toEqual(DEFAULT_VIEW_GRAPHICS.overrides.door);
  });

  it('peso de corte da vista: undefined remove a substituição (volta a valer o do projeto)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ overrides: { wall: { cutWeight: 9 } } }));
    expect(levelGraphicsOf(s.project, LV0).overrides.wall.cutWeight).toBe(9);
    s.exec(lg({ overrides: { wall: { cutWeight: undefined } } }));
    expect(levelGraphicsOf(s.project, LV0).overrides.wall).toEqual({ visible: true, transparency: 0, halftone: false });
  });

  it('desfazer e refazer, com o rótulo do histórico', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ scale: 50 }));
    s.exec(lg({ style: 'shaded' }));
    expect(s.undoLabel).toBe('Alterar gráficos da vista');
    s.undo();
    expect(levelGraphicsOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50 });
    s.undo();
    expect(s.project.planViews[0]!.graphics).toBeUndefined();
    s.redo();
    s.redo();
    expect(levelGraphicsOf(s.project, LV0)).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50, style: 'shaded' });
  });
});

describe('setSectionGraphics', () => {
  const sg = (patch: DeepPartial<ViewGraphics>): Command => ({ type: 'setSectionGraphics', patch });

  it('aplica o patch parcial e grava a vista do corte completa, com o detalhe pela escala', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(sg({ scale: 50 }));
    expect(s.project.sectionGraphics).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50 });
    expect(sectionGraphicsOf(s.project)).toEqual({ ...DEFAULT_VIEW_GRAPHICS, scale: 50 });
  });

  it('overrides mesclam por categoria e o histórico usa o rótulo do corte', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(sg({ overrides: { wall: { visible: false } } }));
    s.exec(sg({ overrides: { wall: { halftone: true } } }));
    expect(sectionGraphicsOf(s.project).overrides.wall).toEqual({ visible: false, transparency: 0, halftone: true });
    expect(s.undoLabel).toBe('Alterar gráficos do corte');
    s.undo();
    expect(sectionGraphicsOf(s.project).overrides.wall).toEqual({ visible: false, transparency: 0, halftone: false });
  });

  it('resetSectionGraphics remove o campo salvo; desfazer o traz de volta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(sg({ scale: 200 }));
    s.exec({ type: 'resetSectionGraphics' });
    expect(s.project.sectionGraphics).toBeUndefined();
    expect(sectionGraphicsOf(s.project)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(s.undoLabel).toBe('Restaurar gráficos do corte');
    s.undo();
    expect(sectionGraphicsOf(s.project).scale).toBe(200);
  });

  it('recusa escala inválida sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec(sg({ scale: 0 }))).toThrow('A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).');
    expect(s.project.sectionGraphics).toBeUndefined();
    expect(s.canUndo).toBe(false);
  });
});

describe('setView3D', () => {
  it('aplica o patch parcial e grava a vista 3D completa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(v3({ shadows: false, sunElevation: 30 }));
    expect(s.project.view3d).toEqual({ ...DEFAULT_VIEW_3D, shadows: false, sunElevation: 30 });
    expect(view3dOf(s.project)).toEqual({ ...DEFAULT_VIEW_3D, shadows: false, sunElevation: 30 });
  });

  it('overrides mesclam por categoria e o histórico usa o rótulo da vista 3D', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(v3({ overrides: { wall: { visible: false } } }));
    s.exec(v3({ overrides: { wall: { halftone: true } } }));
    expect(view3dOf(s.project).overrides.wall).toEqual({ visible: false, transparency: 0, halftone: true });
    expect(s.undoLabel).toBe('Alterar a vista 3D');
    s.undo();
    expect(view3dOf(s.project).overrides.wall).toEqual({ visible: false, transparency: 0, halftone: false });
  });
});

describe('reset', () => {
  it('resetLevelGraphics remove o campo salvo; desfazer o traz de volta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ scale: 50 }));
    s.exec({ type: 'resetLevelGraphics', levelId: LV0 });
    expect(s.project.planViews[0]!.graphics).toBeUndefined();
    expect(levelGraphicsOf(s.project, LV0)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(s.undoLabel).toBe('Restaurar gráficos da vista');
    s.undo();
    expect(levelGraphicsOf(s.project, LV0).scale).toBe(50);
  });

  it('resetView3D remove o campo salvo; desfazer o traz de volta', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(v3({ shadows: false }));
    s.exec({ type: 'resetView3D' });
    expect(s.project.view3d).toBeUndefined();
    expect(view3dOf(s.project)).toEqual(DEFAULT_VIEW_3D);
    expect(s.undoLabel).toBe('Restaurar a vista 3D');
    s.undo();
    expect(view3dOf(s.project).shadows).toBe(false);
  });

  it('reset sem nada salvo não entra no histórico', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'resetLevelGraphics', levelId: LV0 });
    s.exec({ type: 'resetView3D' });
    expect(s.canUndo).toBe(false);
  });

  it('resetLevelGraphics de nível inexistente é recusado', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'resetLevelGraphics', levelId: 'lv_nao_existe' })).toThrow('Nível inexistente');
  });
});

describe('recusas: mensagem pt-BR, sem alterar o projeto nem entrar no histórico', () => {
  const tabela = (): Array<[number, number, number]> => DEFAULT_LINE_WEIGHTS.map((r) => [...r] as [number, number, number]);
  const comTabela = (fn: (t: Array<[number, number, number]>) => void): DeepPartial<ProjectGraphics> => {
    const t = tabela();
    fn(t);
    return { lineWeights: t };
  };
  const PESO_PROJ = 'Peso de projeção de "porta" deve ser um número inteiro de 1 a 16.';
  const PARCIAL = 'A exibição parcial deve ser entire, noFinishes ou coreOnly.';
  const ELEV = 'A elevação do sol deve estar entre 0 e 90 graus.';

  it.each<[string, Command, string]>([
    ['peso de corte 0', pg({ categories: { wall: { cutWeight: 0 } } }), 'Peso de corte de "parede" deve ser um número inteiro de 1 a 16.'],
    ['peso de projeção 17', pg({ categories: { door: { projectionWeight: 17 } } }), PESO_PROJ],
    ['peso fracionário', pg({ categories: { stair: { cutWeight: 2.5 } } }), 'Peso de corte de "escada e rampa" deve ser um número inteiro de 1 a 16.'],
    ['espessura zero na tabela', pg(comTabela((t) => (t[2] = [0, 0.25, 0.18]))), 'Peso 3 da tabela de pesos: a espessura deve ser um número maior que zero, em mm de papel.'],
    ['espessura NaN na tabela', pg(comTabela((t) => (t[0] = [Number.NaN, 0.1, 0.1]))), 'Peso 1 da tabela de pesos: a espessura deve ser um número maior que zero, em mm de papel.'],
    ['linha com 2 colunas', pg(comTabela((t) => (t[4] = bad<[number, number, number]>([0.7, 0.5])))), 'Peso 5 da tabela de pesos deve ter 3 colunas (1:50, 1:100 e 1:200).'],
    ['tabela com 15 linhas', pg({ lineWeights: tabela().slice(0, 15) }), 'A tabela de pesos de linha deve ter 16 linhas (pesos 1 a 16).'],
    ['fino maior que o médio', pg({ detailByScale: { fineMax: 300, mediumMax: 200 } }), 'O limite do detalhe fino deve ser maior que zero e não maior que o do médio.'],
    ['fino zero', pg({ detailByScale: { fineMax: 0 } }), 'O limite do detalhe fino deve ser maior que zero e não maior que o do médio.'],
    ['escala 0', lg({ scale: 0 }), 'A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).'],
    ['escala 5001', lg({ scale: 5001 }), 'A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).'],
    ['escala fracionária', lg({ scale: 50.5 }), 'A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).'],
    ['transparência 1,2', lg({ overrides: { wall: { transparency: 1.2 } } }), 'Transparência de "parede" deve ser um número de 0 a 1.'],
    ['transparência negativa', lg({ overrides: { window: { transparency: -0.1 } } }), 'Transparência de "janela" deve ser um número de 0 a 1.'],
    ['cor sem #', lg({ overrides: { door: { color: 'red' } } }), 'Cor de "porta" deve estar no formato #rrggbb.'],
    ['cor de 3 dígitos', lg({ overrides: { door: { color: '#abc' } } }), 'Cor de "porta" deve estar no formato #rrggbb.'],
    ['peso de corte da vista 20', lg({ overrides: { wall: { cutWeight: 20 } } }), 'Peso de corte de "parede" deve ser um número inteiro de 1 a 16.'],
    ['estilo 3D na planta', lg({ style: bad<'shaded'>('realistic') }), 'O estilo visual da planta deve ser wireframe, hiddenLine ou shaded.'],
    ['parcial inválida na planta', lg({ partialStructure: bad<'entire'>('metade') }), PARCIAL],
    ['nível inexistente', lg({ scale: 50 }, 'lv_nao_existe'), 'Nível inexistente'],
    ['elevação do sol 91', v3({ sunElevation: 91 }), ELEV],
    ['elevação do sol negativa', v3({ sunElevation: -1 }), ELEV],
    ['azimute infinito', v3({ sunAzimuth: Number.POSITIVE_INFINITY }), 'O azimute do sol deve ser um número finito, em graus.'],
    ['fundo sem #', v3({ background: 'blue' }), 'A cor de fundo deve estar no formato #rrggbb, ou ser null para o padrão do tema.'],
    ['estilo 3D inválido', v3({ style: bad<'realistic'>('x') }), 'O estilo visual da vista 3D deve ser wireframe, hiddenLine, shaded, consistentColors ou realistic.'],
    ['parcial inválida no 3D', v3({ partialStructure: bad<'entire'>('x') }), PARCIAL],
  ])('recusa %s', (_nome, cmd, mensagem) => {
    const s = new ProjectStore(createEmptyProject());
    const antes = s.project;
    expect(() => s.exec(cmd)).toThrow(mensagem);
    expect(s.project).toBe(antes);
    expect(s.canUndo).toBe(false);
  });

  it('recusa com histórico anterior: o último passo válido continua sendo o desfeito', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ scale: 50 }));
    const antes = s.project;
    expect(() => s.exec(lg({ scale: 0 }))).toThrow('A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).');
    expect(s.project).toBe(antes);
    expect(s.undoLabel).toBe('Alterar gráficos da vista');
    expect(s.redoLabel).toBeNull();
  });

  it('a mensagem junta todas as violações do mesmo comando', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec(lg({ scale: 0, style: bad<'shaded'>('x') }))).toThrow(
      'A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100). O estilo visual da planta deve ser wireframe, hiddenLine ou shaded.',
    );
  });
});

describe('validação de arquivo com gráficos inválidos', () => {
  it('cada violação vira um erro graphics-invalid, com o nome do nível ou "Vista 3D"', () => {
    const p = createEmptyProject();
    patchFloorOfTest(p, 'lv_0', { graphics: bad<ViewGraphics>({ scale: 0 }) });
    p.graphics = bad<ProjectGraphics>({ lineWeights: [] });
    p.view3d = bad<View3DSettings>({ sunElevation: 120 });
    expect(issuesOf(p)).toEqual([
      'Gráficos do projeto: A tabela de pesos de linha deve ter 16 linhas (pesos 1 a 16).',
      'Nível "Térreo" (lv_0): A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).',
      'Vista 3D: A elevação do sol deve estar entre 0 e 90 graus.',
    ]);
    const erros = validateProject(p).filter((i) => i.code === CODE);
    expect(erros.every((i) => i.severity === 'error')).toBe(true);
  });
});

describe('utilitários', () => {
  it('isDefaultLevelGraphics: verdadeiro no padrão, falso depois de mudar, verdadeiro de novo após o reset', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(isDefaultLevelGraphics(levelGraphicsOf(s.project, LV0))).toBe(true);
    s.exec(lg({ overrides: { wall: { halftone: true } } }));
    expect(isDefaultLevelGraphics(levelGraphicsOf(s.project, LV0))).toBe(false);
    s.exec({ type: 'resetLevelGraphics', levelId: LV0 });
    expect(isDefaultLevelGraphics(levelGraphicsOf(s.project, LV0))).toBe(true);
  });

  it('graphicsIssues aponta o campo errado sem depender de nível', () => {
    expect(graphicsIssues({ ...DEFAULT_VIEW_3D, sunElevation: 95 })).toEqual(['A elevação do sol deve estar entre 0 e 90 graus.']);
    expect(graphicsIssues({ ...DEFAULT_VIEW_GRAPHICS, scale: 2.5 })).toEqual(['A escala deve ser um denominador inteiro de 1 a 5000 (100 = 1:100).']);
  });
});

describe('serialização dos gráficos (abrir e salvar)', () => {
  it('ida e volta mantém gráficos do projeto, de cada nível e do 3D', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(pg({ categories: { wall: { cutWeight: 7 } }, detailByScale: { fineMax: 40 } }));
    s.exec(lg({ scale: 50, partialStructure: 'coreOnly', overrides: { window: { visible: false, color: '#ff0000', cutWeight: 9 } } }));
    s.exec(v3({ shadows: false, background: '#101010', sunAzimuth: 10 }));
    const volta = roundTrip(s.project);
    expect(volta.graphics).toEqual(s.project.graphics);
    expect(volta.levels).toEqual(s.project.levels);
    expect(volta.view3d).toEqual(s.project.view3d);
    expect(issuesOf(volta)).toEqual([]);
  });

  it('arquivo antigo aberto, editado e salvo: campos ausentes continuam com o padrão', () => {
    const s = new ProjectStore(migrateProject(JSON.parse(JSON.stringify(createEmptyProject()))));
    s.exec(v3({ sunElevation: 30 }));
    const volta = roundTrip(s.project);
    expect(view3dOf(volta)).toEqual({ ...DEFAULT_VIEW_3D, sunElevation: 30 });
    expect(levelGraphicsOf(volta, LV0)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(graphicsOf(volta)).toEqual(DEFAULT_PROJECT_GRAPHICS);
  });
});

describe('linhas finas (decisão 0015, só na tela)', () => {
  it('padrão ligado: sem o campo salvo, a planta e o corte leem true', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(levelGraphicsOf(s.project, LV0).thinLines).toBe(true);
    expect(sectionGraphicsOf(s.project).thinLines).toBe(true);
    expect(s.project.planViews[0]!.graphics).toBeUndefined();
  });

  it('desliga na planta e no corte, grava no projeto e desfaz', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(lg({ thinLines: false }));
    expect(levelGraphicsOf(s.project, LV0).thinLines).toBe(false);
    s.exec({ type: 'setSectionGraphics', patch: { thinLines: false } });
    expect(s.project.sectionGraphics?.thinLines).toBe(false);
    expect(sectionGraphicsOf(s.project).thinLines).toBe(false);
    s.undo();
    expect(sectionGraphicsOf(s.project).thinLines).toBe(true);
    s.undo();
    expect(levelGraphicsOf(s.project, LV0).thinLines).toBe(true);
  });

  it('recusa valor que não é sim ou não, com mensagem pt-BR, e não grava', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec(lg({ thinLines: 'sim' as unknown as boolean }))).toThrow('Linhas finas deve ser sim ou não.');
    expect(s.project.planViews[0]!.graphics).toBeUndefined();
    expect(graphicsIssues({ ...DEFAULT_VIEW_GRAPHICS, thinLines: 1 as unknown as boolean })).toContain('Linhas finas deve ser sim ou não.');
  });
});
