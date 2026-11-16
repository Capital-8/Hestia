import { describe, expect, it } from 'vitest';
import {
  TAG_FAMILY_PADRAO,
  applyCommand,
  createEmptyProject,
  duplicateMarks,
  elementTagText,
  expandTagFormat,
  makeWall,
  markAssignments,
  removeTagFamilyFrom,
  tagFamiliesOf,
  tagFamilyFor,
  tagFamilyIssue,
  tagPresets,
  writeTagFamily,
  type Opening,
  type Wall,
} from './index.ts';

function projectWithOpenings(): ReturnType<typeof createEmptyProject> {
  const p = createEmptyProject();
  const w: Wall = { ...makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }), order: 1 };
  const d1: Opening = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  const d2: Opening = { id: 'd2', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 2.5, flipHand: false, flipFacing: false, sillOverride: null, mark: 'P02' };
  const j1: Opening = { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'w1', offset: 4.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  p.elements[w.id] = w;
  p.elements[d1.id] = d1;
  p.elements[d2.id] = d2;
  p.elements[j1.id] = j1;
  return p;
}

describe('famílias de etiquetas', () => {
  it('devolve as 4 famílias predefinidas quando não há lista gravada', () => {
    const list = tagFamiliesOf(undefined, 'pt');
    expect(list).toHaveLength(4);
    expect(list[0]!.id).toBe(TAG_FAMILY_PADRAO);
    expect(list.map((f) => f.shape)).toEqual(['none', 'circle', 'rect', 'hexagon']);
  });

  it('expande o modelo paramétrico em várias linhas e omite linhas vazias', () => {
    expect(expandTagFormat('{mark}\n{width}×{height}', { mark: 'P01', width: '0,80', height: '2,10' })).toBe('P01\n0,80×2,10');
    expect(expandTagFormat('{mark}\n{width}×{height}', { mark: '', width: '', height: '' })).toBe('');
  });

  it('valida nome único, tokens conhecidos e faixa de altura em mm', () => {
    const presets = tagPresets('pt');
    expect(tagFamilyIssue({ ...presets[0]!, name: '' }, [], 'pt')).toBeTruthy();
    expect(tagFamilyIssue({ ...presets[0]!, id: 'other' }, presets, 'pt')).toBeTruthy();
    expect(tagFamilyIssue({ ...presets[0]!, id: 'other', name: 'Nova', format: '{desconhecido}' }, presets, 'pt')).toBeTruthy();
    expect(tagFamilyIssue({ ...presets[0]!, id: 'other', name: 'Nova', textMm: 10 }, presets, 'pt')).toBeTruthy();
    expect(tagFamilyIssue({ ...presets[0]!, id: 'other', name: 'Nova', format: '{mark}\n{type}' }, presets, 'pt')).toBeNull();
  });

  it('grava e remove famílias sem apagar a última restante', () => {
    const p = createEmptyProject();
    let settings = writeTagFamily(p.settings, { id: 'tf_custom', name: 'Personalizada', format: '{mark}', shape: 'circle', textMm: 2 });
    expect(tagFamiliesOf(settings).some((f) => f.id === 'tf_custom')).toBe(true);
    settings = removeTagFamilyFrom(settings, 'tf_custom');
    expect(tagFamiliesOf(settings).some((f) => f.id === 'tf_custom')).toBe(false);
    // Tentar remover todas mantém pelo menos 1.
    for (const f of tagFamiliesOf(settings)) settings = removeTagFamilyFrom(settings, f.id);
    expect(tagFamiliesOf(settings).length).toBeGreaterThanOrEqual(1);
  });

  it('elementTagText resolve família paramétrica e mantém compatibilidade sem familyId', () => {
    const p = projectWithOpenings();
    (p.elements.d1 as Opening).mark = 'P01';
    expect(elementTagText(p, { id: 't1', hostId: 'd1', at: { x: 1, y: 0 }, property: 'type', familyId: 'tagfam_esquadria' })).toBe('P01\n0,80×2,10');
    expect(elementTagText(p, { id: 't2', hostId: 'd1', at: { x: 1, y: 0 }, property: 'mark' })).toBe('P01');
    expect(tagFamilyFor(p.settings, { property: 'width' }).format).toBe('{width}');
  });
});

describe('numeração automática e duplicatas de marcas', () => {
  it('numera somente quem está sem marca, continuando após a maior existente', () => {
    const p = projectWithOpenings();
    const list = markAssignments(p, { onlyEmpty: true });
    expect(list).toEqual([
      { id: 'd1', mark: 'P03' },
      { id: 'j1', mark: 'J01' },
    ]);
    applyCommand(p, { type: 'setMarks', assignments: list });
    expect((p.elements.d1 as Opening).mark).toBe('P03');
    expect((p.elements.d2 as Opening).mark).toBe('P02');
    expect((p.elements.j1 as Opening).mark).toBe('J01');
  });

  it('renumera todas em ordem de leitura e detecta marcas repetidas', () => {
    const p = projectWithOpenings();
    (p.elements.d1 as Opening).mark = 'P02';
    expect([...duplicateMarks(p).keys()]).toEqual(['P02']);
    const renum = markAssignments(p, { onlyEmpty: false });
    applyCommand(p, { type: 'setMarks', assignments: renum });
    expect(duplicateMarks(p).size).toBe(0);
    expect([(p.elements.d1 as Opening).mark, (p.elements.d2 as Opening).mark].sort()).toEqual(['P01', 'P02']);
  });
});
