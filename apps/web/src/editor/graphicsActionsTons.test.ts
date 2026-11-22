import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, DISCIPLINE_TONE_PRESETS, planTonesOf, planViewById, ProjectStore } from '@hestia/model';
import { editPlanTone, restorePlanTones } from './graphicsActions.ts';
import { resolveText, useI18n } from './i18n.ts';

/*
 * Tons por disciplina na planta ativa (decisão 0060 §4.2). A planta de disciplina grava só o DESVIO em
 * `PlanView.tones`; o tom igual ao predefinido apaga a chave. Valores LITERAIS à mão pela tabela do ADR.
 */

const comPlanta = (): ProjectStore => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', discipline: 'estrutura', name: 'Estrutura' } });
  return s;
};

const PRESETS_ESTRUTURA = {
  arquitetura: 'halftone',
  estrutura: 'normal',
  hidrossanitario: 'hidden',
  eletrico: 'hidden',
  hvac: 'hidden',
} as const;

describe('tons por disciplina (planTonesOf e desvios gravados)', () => {
  beforeEach(() => useI18n.setState({ lang: 'pt' }));

  it('o predefinido da planta de Estrutura é o da tabela §4.2 e não grava nada', () => {
    const s = comPlanta();
    expect(planViewById(s.project, 'pv_est')!.tones).toBeUndefined();
    expect(planTonesOf(planViewById(s.project, 'pv_est'))).toEqual(PRESETS_ESTRUTURA);
    expect(DISCIPLINE_TONE_PRESETS.estrutura).toEqual(PRESETS_ESTRUTURA);
  });

  it('mudar um tom grava SÓ o desvio, nunca a tabela inteira', () => {
    const s = comPlanta();
    expect(editPlanTone(s, 'pv_est', 'arquitetura', 'normal')).toEqual({ ok: true, error: null });
    expect(planViewById(s.project, 'pv_est')!.tones).toEqual({ arquitetura: 'normal' });
    expect(planTonesOf(planViewById(s.project, 'pv_est'))).toEqual({ ...PRESETS_ESTRUTURA, arquitetura: 'normal' });
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar tons da planta');
    s.undo();
    expect(planViewById(s.project, 'pv_est')!.tones).toBeUndefined();
  });

  it('voltar ao predefinido apaga a chave e, sem desvios, o campo tones sai do projeto', () => {
    const s = comPlanta();
    editPlanTone(s, 'pv_est', 'arquitetura', 'normal');
    expect(editPlanTone(s, 'pv_est', 'arquitetura', 'halftone')).toEqual({ ok: true, error: null });
    expect(planViewById(s.project, 'pv_est')!.tones).toBeUndefined();
    expect(planTonesOf(planViewById(s.project, 'pv_est'))).toEqual(PRESETS_ESTRUTURA);
  });

  it('escolher o tom que já é o predefinido não cria passo de desfazer', () => {
    const s = comPlanta();
    const rotulo = s.undoLabel;
    expect(editPlanTone(s, 'pv_est', 'estrutura', 'normal')).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(rotulo);
    expect(planViewById(s.project, 'pv_est')!.tones).toBeUndefined();
  });

  it('restaurar o predefinido de uma disciplina apaga só o desvio dela', () => {
    const s = comPlanta();
    editPlanTone(s, 'pv_est', 'arquitetura', 'normal');
    editPlanTone(s, 'pv_est', 'hidrossanitario', 'normal');
    expect(planViewById(s.project, 'pv_est')!.tones).toEqual({ arquitetura: 'normal', hidrossanitario: 'normal' });
    expect(restorePlanTones(s, 'pv_est', 'arquitetura')).toEqual({ ok: true, error: null });
    expect(planViewById(s.project, 'pv_est')!.tones).toEqual({ hidrossanitario: 'normal' });
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Restaurar tons da planta');
  });

  it('restaurar todos os predefinidos apaga todos os desvios', () => {
    const s = comPlanta();
    editPlanTone(s, 'pv_est', 'arquitetura', 'normal');
    editPlanTone(s, 'pv_est', 'eletrico', 'normal');
    expect(restorePlanTones(s, 'pv_est')).toEqual({ ok: true, error: null });
    expect(planViewById(s.project, 'pv_est')!.tones).toBeUndefined();
    expect(planTonesOf(planViewById(s.project, 'pv_est'))).toEqual(PRESETS_ESTRUTURA);
  });

  it('sem desvio, restaurar não cria passo de desfazer', () => {
    const s = comPlanta();
    const rotulo = s.undoLabel;
    expect(restorePlanTones(s, 'pv_est')).toEqual({ ok: true, error: null });
    expect(restorePlanTones(s, 'pv_est', 'hvac')).toEqual({ ok: true, error: null });
    expect(s.undoLabel).toBe(rotulo);
  });

  it('planta padrão (sem PlanView) não recebe tons; o predefinido é o de Arquitetura', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(planTonesOf(undefined)).toEqual(DISCIPLINE_TONE_PRESETS.arquitetura);
    expect(s.project.levels[0]!.graphics).toBeUndefined();
    expect(editPlanTone(s, 'pv_nao_existe', 'arquitetura', 'hidden').ok).toBe(false);
    expect(s.project.planViews).toBeUndefined();
  });
});
