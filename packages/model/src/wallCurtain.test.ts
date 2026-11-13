import { describe, expect, it } from 'vitest';
import {
  CURTAIN_MIN_CELL,
  CURTAIN_MIN_REMAINDER,
  DEFAULT_CURTAIN_PANEL_TYPES,
  DEFAULT_MULLION_TYPES,
  ProjectStore,
  createEmptyProject,
  curtainPanelTypesOf,
  curtainShadowLayer,
  curtainTypeIssue,
  curtainWallIssues,
  isCurtainType,
  makeWall,
  migrateProject,
  mullionTypesOf,
  validateProject,
  wallThicknessOf,
  type CurtainSpec,
  type Element,
  type MullionType,
  type Project,
  type WallType,
} from './index.ts';
import { t } from './i18n.ts';

const base = (): WallType => createEmptyProject().wallTypes.wt_alv14!;

/** Sistema de referência: vidro com montantes retangulares; a grade é simples e válida. */
const spec = (over: Partial<CurtainSpec> = {}): CurtainSpec => ({
  depth: 0.1,
  u: { mode: 'maxDistance', distance: 1.2 },
  v: { mode: 'manual', positions: [2, 10] },
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

/** Tipo de cortina sem faixas nem retornos (campos que a cortina ignora). */
const cortina = (curtain: CurtainSpec = spec(), id = 'wt_ct'): WallType => ({
  ...base(),
  id,
  name: 'Cortina teste',
  family: 'curtain',
  curtain,
  layers: [],
  strips: [],
  wrapInserts: 'none',
  wrapEnds: 'none',
});

/** Base da fase 0: sem as predefinições de cortina de fábrica (elas usam os montantes e painéis e mudariam o "em uso"). */
const novoProjeto = (): Project => {
  const p = createEmptyProject();
  for (const id of Object.keys(p.wallTypes)) if (p.wallTypes[id]!.family === 'curtain') delete p.wallTypes[id];
  return p;
};

describe('tipos de parede: família, espessura e camada-sombra', () => {
  it('wallThicknessOf: parede básica soma as camadas; cortina devolve a profundidade do sistema', () => {
    const b = base();
    expect(wallThicknessOf(b)).toBeCloseTo(0.184, 9);
    expect(wallThicknessOf(cortina(spec({ depth: 0.15 })))).toBe(0.15);
  });

  it('isCurtainType só aceita família cortina com sistema', () => {
    expect(isCurtainType(base())).toBe(false);
    expect(isCurtainType(undefined)).toBe(false);
    expect(isCurtainType({ ...cortina(), curtain: undefined })).toBe(false);
    expect(isCurtainType(cortina())).toBe(true);
  });

  it('upsertWallType grava a camada-sombra com a profundidade e o material do montante interior', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina(spec({ depth: 0.12 })) });
    const gravado = s.project.wallTypes.wt_ct!;
    expect(gravado.layers).toHaveLength(1);
    expect(gravado.layers[0]).toEqual({ function: 'structure', materialId: 'mat_aluminio', thickness: 0.12, wraps: false });
    expect(wallThicknessOf(gravado)).toBe(0.12);
  });

  it('a camada-sombra acompanha a profundidade ao salvar de novo', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina(spec({ depth: 0.1 })) });
    s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes.wt_ct!, curtain: spec({ depth: 0.2 }) } });
    expect(s.project.wallTypes.wt_ct!.layers[0]!.thickness).toBe(0.2);
    expect(wallThicknessOf(s.project.wallTypes.wt_ct!)).toBe(0.2);
  });

  it('a camada-sombra usa o material do primeiro montante do sistema; sem montante, o do painel', () => {
    const p = novoProjeto();
    const semMontante = spec({ mullions: { ...spec().mullions, interiorVertical: null, interiorHorizontal: null, borderStart: null, borderEnd: null, borderBottom: null, borderTop: null } });
    expect(curtainShadowLayer(p, semMontante).materialId).toBe('mat_vidro');
    expect(curtainShadowLayer(p, spec()).materialId).toBe('mat_aluminio');
  });

  it('família não muda em tipo existente, nos dois sentidos', () => {
    const s = new ProjectStore(novoProjeto());
    expect(() => s.exec({ type: 'upsertWallType', wallType: { ...base(), family: 'curtain', curtain: spec(), layers: [] } })).toThrow(
      t('pt', 'md_ct_family_fixed'),
    );
    s.exec({ type: 'upsertWallType', wallType: cortina() });
    expect(() => s.exec({ type: 'upsertWallType', wallType: { ...cortina(), family: 'basic', curtain: undefined } })).toThrow(
      t('pt', 'md_ct_family_fixed'),
    );
  });

  it('tipo cortina sem sistema é recusado ao salvar', () => {
    const s = new ProjectStore(novoProjeto());
    expect(() => s.exec({ type: 'upsertWallType', wallType: { ...cortina(), curtain: undefined } })).toThrow(t('pt', 'md_ct_curtain_invalid'));
  });

  it('o tipo básico não passa pela validação de cortina', () => {
    expect(curtainTypeIssue(base(), novoProjeto())).toBeNull();
  });
});

describe('curtainTypeIssue: uma regra por caso (§4.6)', () => {
  const p = novoProjeto();
  // Tipo com a camada-sombra que o upsertWallType gravaria; `over` troca campos para cada caso.
  const erro = (c: Partial<CurtainSpec>, over: Partial<WallType> = {}) => {
    const sistema = spec(c);
    return curtainTypeIssue({ ...cortina(sistema), layers: [curtainShadowLayer(p, sistema)], ...over }, p);
  };

  it('sistema válido de referência não tem problema', () => {
    expect(erro({})).toBeNull();
    expect(CURTAIN_MIN_REMAINDER).toBe(0.05);
    expect(CURTAIN_MIN_CELL).toBe(0.15);
  });

  it('profundidade não positiva', () => {
    expect(erro({ depth: 0 })).toBe(t('pt', 'md_ct_curtain_invalid'));
  });

  it('fixedNumber exige número inteiro de células ≥ 1', () => {
    expect(erro({ u: { mode: 'fixedNumber', count: 0 } })).toBe(t('pt', 'md_ct_axis_invalid'));
    expect(erro({ u: { mode: 'fixedNumber', count: 1.5 } })).toBe(t('pt', 'md_ct_axis_invalid'));
    expect(erro({ u: { mode: 'fixedNumber', count: 3 } })).toBeNull();
  });

  it('fixedDistance e maxDistance exigem distância positiva', () => {
    expect(erro({ u: { mode: 'fixedDistance', distance: 0 } })).toBe(t('pt', 'md_ct_axis_invalid'));
    expect(erro({ u: { mode: 'maxDistance', distance: -1 } })).toBe(t('pt', 'md_ct_axis_invalid'));
  });

  it('manual exige posições positivas e estritamente crescentes', () => {
    expect(erro({ v: { mode: 'manual', positions: [2, 1] } })).toBe(t('pt', 'md_ct_axis_invalid'));
    expect(erro({ v: { mode: 'manual', positions: [0] } })).toBe(t('pt', 'md_ct_axis_invalid'));
    expect(erro({ v: { mode: 'manual', positions: [1, 2] } })).toBeNull();
  });

  it('ângulo diferente de 0 é recusado até a fase 7', () => {
    expect(erro({ u: { mode: 'maxDistance', distance: 1, angle: 0.3 } })).toBe(t('pt', 'md_ct_angle'));
    expect(erro({ u: { mode: 'maxDistance', distance: 1, angle: 0 } })).toBeNull();
  });

  it('limiares não podem ser negativos; ausentes valem os padrões', () => {
    expect(erro({ minRemainder: -0.01 })).toBe(t('pt', 'md_ct_limits_negative'));
    expect(erro({ minCell: -1 })).toBe(t('pt', 'md_ct_limits_negative'));
    expect(erro({ minRemainder: 0.02, minCell: 0.2 })).toBeNull();
  });

  it('painel padrão e montantes precisam existir', () => {
    expect(erro({ defaultPanelTypeId: 'nao_existe' })).toBe(t('pt', 'md_ct_panel_missing'));
    expect(erro({ mullions: { ...spec().mullions, borderTop: 'nao_existe' } })).toBe(t('pt', 'md_ct_mullion_missing'));
  });

  it('seção do montante: trapézio exige widthBack; L exige thickness', () => {
    const comMontante = (mt: MullionType) => {
      const p2 = novoProjeto();
      p2.mullionTypes = { ...mullionTypesOf(p2), mul_teste: mt };
      const sistema = spec({ mullions: { ...spec().mullions, interiorVertical: 'mul_teste' } });
      return curtainTypeIssue({ ...cortina(sistema), layers: [curtainShadowLayer(p2, sistema)] }, p2);
    };
    const m = (profile: MullionType['profile']): MullionType => ({ id: 'mul_teste', name: 'teste', profile, materialId: 'mat_aluminio' });
    expect(comMontante(m({ shape: 'trapezoid', width: 0.05, depth: 0.1 }))).toBe(t('pt', 'md_ct_mullion_profile'));
    expect(comMontante(m({ shape: 'trapezoid', width: 0.05, depth: 0.1, widthBack: 0.03 }))).toBeNull();
    expect(comMontante(m({ shape: 'L', width: 0.05, depth: 0.1 }))).toBe(t('pt', 'md_ct_mullion_profile'));
    expect(comMontante(m({ shape: 'L', width: 0.05, depth: 0.1, thickness: 0.004 }))).toBeNull();
    expect(comMontante(m({ shape: 'rect', width: 0, depth: 0.1 }))).toBe(t('pt', 'md_ct_mullion_profile'));
  });

  it('camada-sombra divergente da profundidade é recusada', () => {
    const layers = [{ function: 'structure' as const, materialId: 'mat_aluminio', thickness: 0.05, wraps: false }];
    expect(erro({}, { layers })).toBe(t('pt', 'md_ct_shadow'));
  });
});

describe('montantes e painéis: padrões, leitura e comandos (§4.5, §4.7)', () => {
  it('sem mapa gravado, valem os padrões e nada é gravado no projeto', () => {
    const p = novoProjeto();
    expect(Object.keys(mullionTypesOf(p))).toHaveLength(Object.keys(DEFAULT_MULLION_TYPES).length);
    expect(Object.keys(curtainPanelTypesOf(p))).toHaveLength(Object.keys(DEFAULT_CURTAIN_PANEL_TYPES).length);
    expect(p.mullionTypes).toBeUndefined();
    expect(p.curtainPanelTypes).toBeUndefined();
  });

  it('a primeira escrita grava o conjunto completo, e apagar um padrão não o faz voltar', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'deleteMullionType', id: 'mul_red_50' });
    expect(Object.keys(s.project.mullionTypes!).sort()).toEqual(
      Object.keys(DEFAULT_MULLION_TYPES).filter((id) => id !== 'mul_red_50').sort(),
    );
    s.exec({ type: 'upsertMullionType', mullionType: { id: 'mul_novo', name: 'Novo', profile: { shape: 'rect', width: 0.04, depth: 0.08 }, materialId: 'mat_aluminio' } });
    expect(mullionTypesOf(s.project).mul_red_50).toBeUndefined();
    expect(mullionTypesOf(s.project).mul_novo).toBeDefined();
  });

  it('montante em uso por parede cortina não é apagado', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina() });
    expect(() => s.exec({ type: 'deleteMullionType', id: 'mul_ret_50x100' })).toThrow(t('pt', 'md_cmd_mullion_in_use'));
  });

  it('montante usado só numa linha da instância também conta como uso', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina(spec({ mullions: { ...spec().mullions, interiorVertical: null, interiorHorizontal: null, borderStart: null, borderEnd: null, borderBottom: null, borderTop: null } })) });
    s.exec({
      type: 'addWall',
      wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }), curtain: { addedLines: [{ id: 'ln1', axis: 'u', pos: 1, mullionTypeId: 'mul_red_50' }] } },
    });
    expect(() => s.exec({ type: 'deleteMullionType', id: 'mul_red_50' })).toThrow(t('pt', 'md_cmd_mullion_in_use'));
  });

  it('o último tipo de montante não é apagado', () => {
    const s = new ProjectStore(novoProjeto());
    for (const id of ['mul_red_50', 'mul_ret_50x150', 'mul_ret_60x120', 'mul_junta_12']) s.exec({ type: 'deleteMullionType', id });
    expect(() => s.exec({ type: 'deleteMullionType', id: 'mul_ret_50x100' })).toThrow(t('pt', 'md_cmd_mullion_last'));
  });

  it('montante com seção inválida é recusado ao salvar', () => {
    const s = new ProjectStore(novoProjeto());
    expect(() =>
      s.exec({ type: 'upsertMullionType', mullionType: { id: 'mul_x', name: 'x', profile: { shape: 'rect', width: 0, depth: 0.1 }, materialId: 'mat_aluminio' } }),
    ).toThrow(t('pt', 'md_ct_mullion_profile'));
  });

  it('painel em uso como padrão do tipo não é apagado; o último também não', () => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina() });
    expect(() => s.exec({ type: 'deleteCurtainPanelType', id: 'pnl_vidro_10' })).toThrow(t('pt', 'md_cmd_panel_in_use'));
    for (const id of ['pnl_vidro_duplo_24', 'pnl_solido_alu_4', 'pnl_vazio']) s.exec({ type: 'deleteCurtainPanelType', id });
    expect(() => s.exec({ type: 'deleteCurtainPanelType', id: 'pnl_vidro_10' })).toThrow(t('pt', 'md_cmd_panel_in_use'));
  });

  it('o último painel livre não é apagado', () => {
    const s = new ProjectStore(novoProjeto());
    for (const id of ['pnl_vidro_duplo_24', 'pnl_solido_alu_4', 'pnl_vazio']) s.exec({ type: 'deleteCurtainPanelType', id });
    expect(() => s.exec({ type: 'deleteCurtainPanelType', id: 'pnl_vidro_10' })).toThrow(t('pt', 'md_cmd_panel_last'));
  });

  it('painel com espessura inválida é recusado; vazio pode ter espessura zero', () => {
    const s = new ProjectStore(novoProjeto());
    expect(() => s.exec({ type: 'upsertCurtainPanelType', panelType: { ...DEFAULT_CURTAIN_PANEL_TYPES.pnl_vidro_10!, thickness: -0.01 } })).toThrow(
      t('pt', 'md_ct_panel_invalid'),
    );
    s.exec({ type: 'upsertCurtainPanelType', panelType: { ...DEFAULT_CURTAIN_PANEL_TYPES.pnl_vazio!, id: 'pnl_vazio_2' } });
    expect(curtainPanelTypesOf(s.project).pnl_vazio_2).toBeDefined();
  });
});

describe('round-trip JSON e validação do projeto', () => {
  const projetoComCortina = (): Project => {
    const s = new ProjectStore(novoProjeto());
    s.exec({ type: 'upsertWallType', wallType: cortina(spec({ u: { mode: 'fixedDistance', distance: 1.2, justify: 'center', offset: 0.1 } })) });
    s.exec({ type: 'upsertMullionType', mullionType: { id: 'mul_novo', name: 'Novo', profile: { shape: 'L', width: 0.05, depth: 0.1, thickness: 0.004 }, materialId: 'mat_aluminio' } });
    s.exec({
      type: 'addWall',
      wall: {
        ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3.6, y: 0 } }),
        curtain: {
          grid: { u: { distance: 1.5 } },
          defaultPanelTypeId: 'pnl_solido_alu_4',
          addedLines: [{ id: 'ln1', axis: 'u', pos: 1.8, locked: true, mullionTypeId: 'mul_novo' }],
          removedSegments: [{ line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, k: 0, nk: 1, mid: 0.5 }],
          lineOverrides: [{ line: { added: 'ln1' }, pos: 1.9 }],
          cells: [{ key: { i: 0, j: 0, s: 0.25, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }],
        },
      },
    });
    return s.project;
  };

  it('ida e volta JSON preserva tipos, instância e mapas gravados', () => {
    const p = projetoComCortina();
    const volta = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(volta.wallTypes.wt_ct).toEqual(p.wallTypes.wt_ct);
    expect(volta.elements.w_ct).toEqual(p.elements.w_ct);
    expect(volta.mullionTypes).toEqual(p.mullionTypes);
    expect(volta.curtainPanelTypes).toBeUndefined();
    expect(volta.schemaVersion).toBe(25);
  });

  it('um projeto de cortina limpo não tem problema de validação', () => {
    const issues = validateProject(projetoComCortina());
    expect(issues.filter((i) => i.code === 'curtain-type-invalid' || i.code === 'opening-host-curtain')).toEqual([]);
  });

  it('esquadria hospedada em parede cortina é erro', () => {
    const p = structuredClone(projetoComCortina());
    const opening = {
      id: 'op_porta',
      kind: 'door',
      typeId: 'ot_p80',
      hostId: 'w_ct',
      offset: 1,
      flipHand: false,
      flipFacing: false,
      sillOverride: null,
      mark: 'P1',
      order: 99,
    } as unknown as Element;
    p.elements.op_porta = opening;
    const erros = curtainWallIssues(p).filter((i) => i.severity === 'error' && i.code === 'opening-host-curtain');
    expect(erros).toHaveLength(1);
    expect(erros[0]!.elementId).toBe('op_porta');
    expect(validateProject(p).some((i) => i.code === 'opening-host-curtain')).toBe(true);
  });

  it('avisos: montante mais fundo que o sistema e faixas num tipo de cortina', () => {
    const p = structuredClone(projetoComCortina());
    p.wallTypes.wt_ct = {
      ...p.wallTypes.wt_ct!,
      strips: [{ id: 'f1', name: 'Rodapé', side: 'interior', materialId: 'mat_aluminio', thickness: 0.01, z0: 0, z1: 0.1 }],
      curtain: spec({ mullions: { ...spec().mullions, interiorVertical: 'mul_ret_50x150' } }),
      layers: [{ function: 'structure', materialId: 'mat_aluminio', thickness: 0.1, wraps: false }],
    };
    const codigos = curtainWallIssues(p).filter((i) => i.severity === 'warning').map((i) => i.code);
    expect(codigos).toEqual(expect.arrayContaining(['cortina-profundidade-menor-que-perfil', 'cortina-campo-ignorado']));
  });
});
