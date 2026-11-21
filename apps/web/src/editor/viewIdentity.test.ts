import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makePlanView } from '@hestia/model';
import { editor } from './controller.ts';
import { dxfBatchTargetsOf } from './dxfBatch.ts';
import { activeDxfTargetKey } from './dxfExportDialogModel.ts';
import { activeViewOf, viewKey as openViewKey, type OpenView } from './openViews.ts';
import { useUi } from './state.ts';
import { cameraKeyOf, dxfTargetKeyOfFields, identityOfFields, normalizaPlanViewId, planKey, planKeyOfFields, viewKey, visibilityKeyOfFields, type ViewIdentityFields } from './viewIdentity.ts';
import { viewKeyOf, type ViewKeyFields } from './viewKey.ts';
import { temporaryHide, visibilityKeyOf, visibilityOf } from './viewVisibility.ts';
import { activateView, closeTab, tabOf } from './viewTabActions.ts';

const piso = { view: 'plan', levelId: 'lv_1', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, planViewId: null } satisfies ViewIdentityFields & ViewKeyFields;

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null, viewTemp: {}, selection: [] }));

describe('chave canônica: idêntica às antigas nos casos antigos (valores literais)', () => {
  it('por tipo de vista', () => {
    expect(viewKey({ kind: 'plan', levelId: 'lv_1' })).toBe('plan:lv_1');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'floor' })).toBe('plan:lv_1');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'roof' })).toBe('roof:lv_1');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'area', areaPlanId: 'ap_7' })).toBe('area:ap_7');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'area' })).toBe('area:lv_1');
    expect(viewKey({ kind: 'section', viewId: 'sv_2' })).toBe('section:sv_2');
    expect(viewKey({ kind: 'sheet', sheetId: 'sh_3' })).toBe('sheet:sh_3');
    expect(viewKey({ kind: '3d' })).toBe('3d');
    expect(viewKey({ kind: 'face', elementId: 'w_1', face: 'sideExt', layer: 'all' })).toBe('face:w_1:sideExt:all');
    expect(viewKey({ kind: 'face', elementId: 'w_1', face: 'top', layer: 2 })).toBe('face:w_1:top:2');
  });

  it('planta de disciplina: pv:<id>; só vale na planta de piso', () => {
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planViewId: 'pv_a' })).toBe('pv:pv_a');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'floor', planViewId: 'pv_a' })).toBe('pv:pv_a');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'roof', planViewId: 'pv_a' })).toBe('roof:lv_1');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planKind: 'area', areaPlanId: 'ap_7', planViewId: 'pv_a' })).toBe('area:ap_7');
    expect(viewKey({ kind: 'plan', levelId: 'lv_1', planViewId: null })).toBe('plan:lv_1');
    expect(planKey('lv_1')).toBe('plan:lv_1');
    expect(planKey('lv_1', 'pv_a')).toBe('pv:pv_a');
  });

  it('os quatro pontos de uso devolvem as chaves antigas (visibilidade, aba, DXF) e as novas da câmera', () => {
    const casos: Array<{ f: ViewIdentityFields; aba: string; vis: string | null; dxf: string | null }> = [
      { f: piso, aba: 'plan:lv_1', vis: 'plan:lv_1', dxf: 'plan:lv_1' },
      { f: { ...piso, planKind: 'roof' }, aba: 'roof:lv_1', vis: 'roof:lv_1', dxf: null },
      { f: { ...piso, planKind: 'area', areaPlanId: 'ap_7' }, aba: 'area:ap_7', vis: 'area:ap_7', dxf: 'area:ap_7' },
      { f: { ...piso, planKind: 'area' }, aba: 'area:lv_1', vis: null, dxf: null },
      { f: { ...piso, view: 'section', sectionId: 'sv_2' }, aba: 'section:sv_2', vis: 'section:sv_2', dxf: 'section:sv_2' },
      { f: { ...piso, view: '3d' }, aba: '3d', vis: '3d', dxf: null },
      { f: { ...piso, view: 'sheet', sheetId: 'sh_3' }, aba: 'sheet:sh_3', vis: null, dxf: null },
    ];
    for (const { f, aba, vis, dxf } of casos) {
      const id = identityOfFields(f);
      expect(id && viewKey(id)).toBe(aba);
      expect(visibilityKeyOfFields(f)).toBe(vis);
      expect(dxfTargetKeyOfFields(f)).toBe(dxf);
    }
    // O mesmo pelas funções públicas que os módulos antigos continuam exportando.
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_1', planViewId: null });
    expect(visibilityKeyOf(useUi.getState())).toBe('plan:lv_1');
    expect(activeDxfTargetKey({ view: 'plan', planKind: 'floor', levelId: 'lv_1', areaPlanId: null, sectionId: null })).toBe('plan:lv_1');
    expect(openViewKey({ kind: 'plan', levelId: 'lv_1' })).toBe('plan:lv_1');
  });

  it('chave da câmera: a canônica (corte: section:, piso: plan:); 3D e prancha seguem a planta do nível', () => {
    expect(viewKeyOf({ view: 'plan', levelId: 'lv_1', sectionId: null, planKind: 'floor', areaPlanId: null })).toBe('plan:lv_1');
    expect(viewKeyOf({ view: 'section', levelId: 'lv_1', sectionId: 'sv_2', planKind: 'floor', areaPlanId: null })).toBe('section:sv_2');
    expect(cameraKeyOf({ ...piso, view: '3d' })).toBe('plan:lv_1');
    expect(cameraKeyOf({ ...piso, view: 'sheet', sheetId: 'sh_3' })).toBe('plan:lv_1');
    expect(planKeyOfFields({ levelId: 'lv_1', planKind: 'roof', areaPlanId: null, planViewId: null })).toBe('roof:lv_1');
  });

  it('o lote de DXF usa as mesmas chaves do alvo ativo', () => {
    const p = buildTemplate('house2');
    const lv = p.levels[0]!.id;
    expect(dxfBatchTargetsOf(p).find((t) => t.kind === 'plan' && t.levelId === lv)?.key).toBe(activeDxfTargetKey({ view: 'plan', planKind: 'floor', levelId: lv, areaPlanId: null, sectionId: null }));
  });
});

describe('duas plantas do mesmo nível', () => {
  const lv = 'lv_1';
  const a = { ...piso, planViewId: 'pv_a' };
  const b = { ...piso, planViewId: 'pv_b' };

  it('chaves distintas entre si e da planta padrão, em todos os pontos de uso', () => {
    const chaves = [piso, a, b].map((f) => ({
      aba: viewKey(identityOfFields(f)!),
      camera: cameraKeyOf(f),
      vis: visibilityKeyOfFields(f),
      dxf: dxfTargetKeyOfFields(f),
    }));
    expect(chaves).toEqual([
      { aba: `plan:${lv}`, camera: `plan:${lv}`, vis: `plan:${lv}`, dxf: `plan:${lv}` },
      { aba: 'pv:pv_a', camera: 'pv:pv_a', vis: 'pv:pv_a', dxf: 'pv:pv_a' },
      { aba: 'pv:pv_b', camera: 'pv:pv_b', vis: 'pv:pv_b', dxf: 'pv:pv_b' },
    ]);
  });

  it('abas: a vista ativa com planViewId é outra aba, mesmo no mesmo nível', () => {
    const ativa = (planViewId: string | null): OpenView | null => activeViewOf({ view: 'plan', levelId: lv, sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, planViewId });
    expect(ativa(null)).toEqual({ kind: 'plan', levelId: lv });
    expect(ativa('pv_a')).toEqual({ kind: 'plan', levelId: lv, planViewId: 'pv_a' });
    expect(openViewKey(ativa('pv_a')!)).not.toBe(openViewKey(ativa(null)!));
  });

  it('câmera 2D: cada planta guarda a sua', () => {
    editor.setViewport({ cx: 1, cy: 2, zoom: 10, width: 100, height: 100 }, { ...piso, planKind: 'floor' });
    editor.setViewport({ cx: 7, cy: 8, zoom: 20, width: 100, height: 100 }, { ...a, planKind: 'floor' });
    expect(editor.viewport({ ...piso, planKind: 'floor' })?.cx).toBe(1);
    expect(editor.viewport({ ...a, planKind: 'floor' })?.cx).toBe(7);
    expect(editor.viewport({ ...b, planKind: 'floor' })).toBeNull();
  });

  it('visibilidade temporária: Hide numa planta não vale na outra nem na padrão', () => {
    const p = structuredClone(buildTemplate('house2'));
    const level = p.levels[0]!;
    p.planViews = [makePlanView({ id: 'pv_a', levelId: level.id, name: 'A' }), makePlanView({ id: 'pv_b', levelId: level.id, name: 'B' })];
    const parede = Object.values(p.elements).find((e) => e.kind === 'wall')!;
    const em = (planViewId: string | null): ReturnType<typeof visibilityOf> => {
      useUi.setState({ view: 'plan', planKind: 'floor', levelId: level.id, planViewId });
      return visibilityOf(p, useUi.getState());
    };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: level.id, planViewId: 'pv_a', selection: [] });
    temporaryHide([parede.id]);
    expect(Object.keys(useUi.getState().viewTemp)).toEqual(['pv:pv_a']);
    expect(em('pv_a').hidden.has(parede.id)).toBe(true);
    expect(em('pv_b').hidden.has(parede.id)).toBe(false);
    expect(em(null).hidden.has(parede.id)).toBe(false);
  });

  it('ocultação permanente da planta de disciplina vale só nela', () => {
    const p = structuredClone(buildTemplate('house2'));
    const level = p.levels[0]!;
    const parede = Object.values(p.elements).find((e) => e.kind === 'wall')!;
    p.planViews = [makePlanView({ id: 'pv_a', levelId: level.id, name: 'A', hidden: { elements: [parede.id] } }), makePlanView({ id: 'pv_b', levelId: level.id, name: 'B' })];
    const em = (planViewId: string | null): boolean => {
      useUi.setState({ view: 'plan', planKind: 'floor', levelId: level.id, planViewId });
      return visibilityOf(p, useUi.getState()).hidden.has(parede.id);
    };
    expect([em('pv_a'), em('pv_b'), em(null)]).toEqual([true, false, false]);
  });
});

describe('controlador: selectLevel, load e abas com planta de disciplina', () => {
  const abre = (): { lv0: string; lv1: string } => {
    const p = structuredClone(buildTemplate('house2'));
    const [l0, l1] = p.levels;
    p.planViews = [makePlanView({ id: 'pv_e', levelId: l0!.id, name: 'Planta de fôrmas', discipline: 'estrutura' })];
    editor.load(p, 'x.hestia.json');
    return { lv0: l0!.id, lv1: l1!.id };
  };

  it('selectLevel com planta existente do nível a ativa; sem o parâmetro, inexistente ou de outro nível vira a padrão', () => {
    const { lv0, lv1 } = abre();
    editor.selectLevel(lv0, 'floor', null, 'pv_e');
    expect(useUi.getState().planViewId).toBe('pv_e');
    editor.selectLevel(lv0);
    expect(useUi.getState().planViewId).toBeNull();
    editor.selectLevel(lv0, 'floor', null, 'pv_x');
    expect(useUi.getState().planViewId).toBeNull();
    editor.selectLevel(lv1, 'floor', null, 'pv_e');
    expect(useUi.getState().planViewId).toBeNull();
    editor.selectLevel(lv0, 'roof', null, 'pv_e');
    expect(useUi.getState().planViewId).toBeNull();
  });

  it('trocar de nível pelo seletor mantém a disciplina quando o nível de destino tem planta dela; explícita nunca reaplica', () => {
    const p = structuredClone(buildTemplate('house2'));
    const [l0, l1] = p.levels;
    p.planViews = [
      makePlanView({ id: 'pv0_e', levelId: l0!.id, name: 'Térreo - Estrutura', discipline: 'estrutura' }),
      makePlanView({ id: 'pv0_h', levelId: l0!.id, name: 'Térreo - Hidrossanitário', discipline: 'hidrossanitario' }),
      makePlanView({ id: 'pv1_e', levelId: l1!.id, name: 'Superior - Estrutura', discipline: 'estrutura' }),
    ];
    editor.load(p, 'x.hestia.json');
    editor.selectLevel(l0!.id, 'floor', null, 'pv0_e');
    // Seletor de nível (sem a planta): a mesma disciplina no destino.
    editor.selectLevel(l1!.id);
    expect(useUi.getState().planViewId).toBe('pv1_e');
    // Planta explícita (navegador/aba) nunca reaplica: null = planta padrão.
    editor.selectLevel(l1!.id, 'floor', null, null);
    expect(useUi.getState().planViewId).toBeNull();
    // Vindo da planta padrão, não procura planta adicional da disciplina: abre a padrão.
    editor.selectLevel(l0!.id);
    expect(useUi.getState().planViewId).toBeNull();
    // Sem planta da disciplina no destino, a padrão.
    editor.selectLevel(l0!.id, 'floor', null, 'pv0_h');
    editor.selectLevel(l1!.id);
    expect(useUi.getState().planViewId).toBeNull();
  });

  it('trocar de nível sem informar a planta zera planViewId; load também', () => {
    const { lv0, lv1 } = abre();
    editor.selectLevel(lv0, 'floor', null, 'pv_e');
    editor.selectLevel(lv1);
    expect(useUi.getState().planViewId).toBeNull();
    editor.selectLevel(lv0, 'floor', null, 'pv_e');
    abre();
    expect(useUi.getState().planViewId).toBeNull();
  });

  it('a aba da planta de disciplina leva o nome da planta com a disciplina e convive com a da padrão; fechar não derruba a padrão', () => {
    const { lv0 } = abre();
    const pv: OpenView = { kind: 'plan', levelId: lv0, planViewId: 'pv_e' };
    expect(tabOf(editor.project, pv)).toEqual({ icon: 'plan', label: 'Planta de fôrmas · Estrutura' });
    expect(tabOf(editor.project, { kind: 'plan', levelId: lv0, planViewId: 'pv_x' })).toBeNull();
    activateView({ kind: 'plan', levelId: lv0 });
    activateView(pv);
    expect(useUi.getState().planViewId).toBe('pv_e');
    expect(useUi.getState().openViews.map(openViewKey)).toEqual([`plan:${lv0}`, 'pv:pv_e']);
    closeTab(pv);
    expect(useUi.getState().planViewId).toBeNull();
    expect(useUi.getState().openViews.map(openViewKey)).toEqual([`plan:${lv0}`]);
  });
});

describe('normalizaPlanViewId', () => {
  const p = { planViews: [makePlanView({ id: 'pv_a', levelId: 'lv_1', name: 'A' })] };
  it('existente no mesmo nível, em planta de piso, é mantida', () => expect(normalizaPlanViewId(p, 'lv_1', 'floor', 'pv_a')).toBe('pv_a'));
  it('inexistente, de outro nível, em cobertura/área, nula ou sem coleção vira null', () => {
    expect(normalizaPlanViewId(p, 'lv_1', 'floor', 'pv_x')).toBeNull();
    expect(normalizaPlanViewId(p, 'lv_2', 'floor', 'pv_a')).toBeNull();
    expect(normalizaPlanViewId(p, 'lv_1', 'roof', 'pv_a')).toBeNull();
    expect(normalizaPlanViewId(p, 'lv_1', 'area', 'pv_a')).toBeNull();
    expect(normalizaPlanViewId(p, 'lv_1', 'floor', null)).toBeNull();
    expect(normalizaPlanViewId(p, 'lv_1', 'floor', undefined)).toBeNull();
    expect(normalizaPlanViewId({}, 'lv_1', 'floor', 'pv_a')).toBeNull();
  });
});

describe('guarda de texto: uma só fonte de chave de vista', () => {
  /** Arquivos de produção de apps/web/src (sem testes). */
  function producao(dir: string, out: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) producao(caminho, out);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && !/\.(perf|lote)\.test\./.test(nome)) out.push(caminho);
    }
    return out;
  }
  const raiz = join(__dirname, '..');

  it('nenhuma chave de planta (`plan:${`, `pv:${`) é montada à mão fora de viewIdentity.ts', () => {
    const achados = producao(raiz)
      .filter((f) => !f.endsWith('viewIdentity.ts'))
      .filter((f) => /[`'"](plan|pv):\$\{/.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });

  it('as chaves de cobertura, área, corte e prancha também só nascem no helper', () => {
    const achados = producao(raiz)
      .filter((f) => !f.endsWith('viewIdentity.ts'))
      .filter((f) => /`(roof|area|section|sheet):\$\{/.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });
});
