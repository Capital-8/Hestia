import { describe, expect, it } from 'vitest';
import {
  DIM_FAMILY_PADRAO,
  DIM_FAMILY_PADRAO_NAME,
  DEFAULT_DIMENSION_STYLE,
  ProjectStore,
  createEmptyProject,
  defaultDimensionFamilyIdOf,
  dimensionFamiliesOf,
  dimensionFamilyDraft,
  dimensionFamilyIssue,
  dimensionFamilyStyleOf,
  dimensionStyleFor,
  type DimensionFamily,
  type Dimension,
} from './index.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());
const dim = (over: Partial<Dimension> = {}): Dimension => ({ id: 'd1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.8, ...over });
const family = (over: Partial<DimensionFamily> = {}): DimensionFamily => ({ id: 'fam_a', name: 'Arquitetônica', ...DEFAULT_DIMENSION_STYLE, ...over });

describe('famílias de cotas: leitura', () => {
  it('sem famílias gravadas, devolve só a família implícita Padrão com o estilo global', () => {
    const s = store();
    s.exec({ type: 'setDimensionStyle', patch: { textHeight: 3.2 } });
    const list = dimensionFamiliesOf(s.project.settings);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: DIM_FAMILY_PADRAO, name: DIM_FAMILY_PADRAO_NAME, textHeight: 3.2 });
    expect(defaultDimensionFamilyIdOf(s.project.settings)).toBe(DIM_FAMILY_PADRAO);
  });

  it('cota sem família lê o estilo global; cota com família lê a família; id inexistente cai no global', () => {
    const s = store();
    s.exec({ type: 'setDimensionStyle', patch: { textHeight: 3.5 } });
    s.exec({ type: 'upsertDimensionFamily', family: family({ textHeight: 2 }) });
    expect(dimensionStyleFor(s.project.settings, dim()).textHeight).toBe(3.5);
    expect(dimensionStyleFor(s.project.settings, dim({ familyId: 'fam_a' })).textHeight).toBe(2);
    expect(dimensionStyleFor(s.project.settings, dim({ familyId: 'nao_existe' })).textHeight).toBe(3.5);
  });

  it('família com campos faltando cai nos padrões (arquivo antigo/intermediário)', () => {
    const s = store();
    s.exec({ type: 'setSettings', patch: { dimensionFamilies: [{ id: 'fam_x', name: 'Parcial', textHeight: 4 } as never] } });
    expect(dimensionFamilyStyleOf(s.project.settings, 'fam_x').textHeight).toBe(4);
    expect(dimensionFamilyStyleOf(s.project.settings, 'fam_x').readConvention).toBe('aligned');
    expect(dimensionFamilyStyleOf(s.project.settings, 'fam_x').precision).toBe(2);
  });

  it('família Padrão editada grava no estilo global, sem criar lista de famílias', () => {
    const s = store();
    const padrao = { ...family({ id: DIM_FAMILY_PADRAO, name: 'Padrão' }), textHeight: 3 };
    s.exec({ type: 'upsertDimensionFamily', family: padrao });
    expect(s.project.settings.dimensionFamilies).toBeUndefined();
    expect(s.project.settings.dimensionStyle?.textHeight).toBe(3);
    expect(dimensionFamilyStyleOf(s.project.settings, DIM_FAMILY_PADRAO).textHeight).toBe(3);
  });

  it('padrão do projeto é respeitado quando aponta para uma família existente', () => {
    const s = store();
    s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_a' }) });
    s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_b', name: 'Estrutural' }) });
    s.exec({ type: 'setDefaultDimensionFamily', id: 'fam_b' });
    expect(defaultDimensionFamilyIdOf(s.project.settings)).toBe('fam_b');
    s.exec({ type: 'setDefaultDimensionFamily', id: 'fam_a' });
    expect(defaultDimensionFamilyIdOf(s.project.settings)).toBe('fam_a');
    expect(() => s.exec({ type: 'setDefaultDimensionFamily', id: 'nao_existe' })).toThrow(/inexistente/);
  });
});

describe('famílias de cotas: comandos e validação', () => {
  it('cria, renomeia e exclui família com desfazer em cada passo', () => {
    const s = store();
    s.exec({ type: 'upsertDimensionFamily', family: family() });
    expect(dimensionFamiliesOf(s.project.settings).map((f) => f.id)).toContain('fam_a');
    s.exec({ type: 'upsertDimensionFamily', family: family({ name: 'Arquitetônica A' }) });
    expect(dimensionFamiliesOf(s.project.settings).find((f) => f.id === 'fam_a')?.name).toBe('Arquitetônica A');
    s.exec({ type: 'removeDimensionFamily', id: 'fam_a' });
    expect(dimensionFamiliesOf(s.project.settings).map((f) => f.id)).not.toContain('fam_a');
    s.undo();
    expect(dimensionFamiliesOf(s.project.settings).map((f) => f.id)).toContain('fam_a');
  });

  it('excluir a família padrão explicitamente configurada volta o padrão para a primeira', () => {
    const s = store();
    s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_a' }) });
    s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_b', name: 'Estrutural' }) });
    s.exec({ type: 'setDefaultDimensionFamily', id: 'fam_b' });
    s.exec({ type: 'removeDimensionFamily', id: 'fam_b' });
    expect(s.project.settings.defaultDimensionFamilyId).toBeUndefined();
    expect(defaultDimensionFamilyIdOf(s.project.settings)).toBe('fam_a');
  });

  it('recusa nome vazio, nome repetido e medida absurda, sem alterar o projeto', () => {
    const s = store();
    s.exec({ type: 'upsertDimensionFamily', family: family() });
    expect(() => s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_b', name: '  ' }) })).toThrow(/precisa de nome/);
    expect(() => s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_b', name: 'arquitetônica' }) })).toThrow(/Já existe/);
    expect(() => s.exec({ type: 'upsertDimensionFamily', family: family({ id: 'fam_b', name: 'Outra', textHeight: 0 }) })).toThrow(/altura do texto/);
    expect(dimensionFamiliesOf(s.project.settings)).toHaveLength(1);
  });

  it('a família implícita Padrão não é removível', () => {
    const s = store();
    s.exec({ type: 'removeDimensionFamily', id: DIM_FAMILY_PADRAO });
    expect(dimensionFamiliesOf(s.project.settings)).toHaveLength(1);
    expect(dimensionFamiliesOf(s.project.settings)[0]!.id).toBe(DIM_FAMILY_PADRAO);
  });

  it('dimensionFamilyIssue cobre enums e limites', () => {
    expect(dimensionFamilyIssue(family())).toBeNull();
    expect(dimensionFamilyIssue(family({ name: 'x'.repeat(41) }))).toMatch(/40/);
    expect(dimensionFamilyIssue(family({ readConvention: 'diagonal' as never }))).toMatch(/Convenção/);
    expect(dimensionFamilyIssue(family({ textFit: 'fora' as never }))).toMatch(/fora do trecho/);
    expect(dimensionFamilyIssue(family({ unit: 'in' as never }))).toMatch(/Unidade/);
    expect(dimensionFamilyIssue(family({ precision: 5 as never }))).toMatch(/Precisão/);
    expect(dimensionFamilyIssue(family({ tick: 'x' as never }))).toMatch(/Marcador/);
    expect(dimensionFamilyIssue(family({ font: '  ' }))).toMatch(/fonte/);
    expect(dimensionFamilyIssue(family({ stackSpacing: 0 }))).toMatch(/empilhadas/);
  });

  it('rascunho novo recebe nome único a partir da base', () => {
    const s = store();
    s.exec({ type: 'upsertDimensionFamily', family: family() });
    const draft = dimensionFamilyDraft(s.project.settings, family());
    expect(draft.id).not.toBe('fam_a');
    expect(draft.name).toBe('Arquitetônica (cópia)');
    expect(draft.textHeight).toBe(DEFAULT_DIMENSION_STYLE.textHeight);
    const outro = dimensionFamilyDraft(s.project.settings);
    expect(outro.name).toBe('Nova família');
  });
});
