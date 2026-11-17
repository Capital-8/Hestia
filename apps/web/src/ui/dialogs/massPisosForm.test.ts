import { describe, expect, it } from 'vitest';
import { projetoComMassas, massaM3 } from '@hestia/engine/src/fixtureMassa.ts';
import { ProjectStore, createEmptyProject, makeFloor, makeMass, secaoCirculo, type Project } from '@hestia/model';
import { massaUnicaSelecionada, motivoNaoGerar, niveisDaMassa, tiposDoTipo, TOLERANCIA_MAXIMA_PISO } from './massPisosForm.ts';

/** Projeto com as massas de referência (M1 a M5) e os níveis de 0 a 30 m, de 3 em 3 m. */
const comMassas = (): Project => projetoComMassas();

const formulario = (over: Partial<Parameters<typeof motivoNaoGerar>[0]> = {}) => ({
  niveis: ['lv_2'],
  tipo: 'piso' as const,
  typeId: 'ft_ceram',
  tolerancia: 0.005,
  ...over,
});

describe('diálogo Pisos da massa: lógica pura do formulário (ficha D1)', () => {
  it('a massa única só existe com exatamente um elemento selecionado que é massa', () => {
    const p = comMassas();
    expect(massaUnicaSelecionada(p, ['m3'])?.id).toBe('m3');
    expect(massaUnicaSelecionada(p, [])).toBeNull();
    expect(massaUnicaSelecionada(p, ['m1', 'm3'])).toBeNull();
    expect(massaUnicaSelecionada(p, ['nao_existe'])).toBeNull();
    const s = new ProjectStore(createEmptyProject());
    const lv = s.project.levels[0]!.id;
    s.exec({ type: 'addMass', mass: makeMass({ id: 'mx', levelId: lv, name: 'X', secoes: [secaoCirculo(0, 1), secaoCirculo(3, 1)] }) });
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'pz', typeId: Object.keys(s.project.floorTypes)[0]!, levelId: lv, boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] }) });
    expect(massaUnicaSelecionada(s.project, ['pz'])).toBeNull();
    expect(massaUnicaSelecionada(s.project, ['mx'])?.id).toBe('mx');
  });

  it('os níveis marcados por padrão são os que caem dentro da massa (pontas inclusivas)', () => {
    const p = comMassas();
    // M3: de 0 a 30 m, nível de 0 a 30 m de 3 em 3 m: todos os 11 níveis.
    expect(niveisDaMassa(p, massaM3())).toHaveLength(11);
  });

  it('com deslocamento da base, os níveis abaixo da base ficam de fora', () => {
    const s = new ProjectStore(comMassas());
    s.exec({ type: 'addMass', mass: makeMass({ id: 'mb', levelId: 'lv_0', name: 'B', baseOffset: 4, secoes: [secaoCirculo(0, 2), secaoCirculo(10, 2)] }) });
    // Base em 4 m, topo em 14 m: entram lv_2 (6 m), lv_3 (9 m) e lv_4 (12 m). lv_0 (0 m) e lv_1 (3 m) ficam de fora.
    const niveis = niveisDaMassa(s.project, massaUnicaSelecionada(s.project, ['mb'])!);
    expect(niveis).toEqual(['lv_2', 'lv_3', 'lv_4']);
  });

  it('tipos de piso e de laje vêm do projeto, na ordem dele', () => {
    const p = comMassas();
    expect(tiposDoTipo(p, 'piso').map((x) => x.id)).toEqual(Object.keys(p.floorTypes));
    expect(tiposDoTipo(p, 'laje').map((x) => x.id)).toEqual(Object.keys(p.slabTypes));
  });

  it('Gerar fica desligado sem massa (motivo "Selecione uma massa.")', () => {
    expect(motivoNaoGerar(formulario(), false)).toBe('ui_mp_no_mass');
  });

  it('Gerar fica desligado sem nível marcado, sem tipo ou com tolerância fora do intervalo', () => {
    expect(motivoNaoGerar(formulario({ niveis: [] }), true)).toBe('ui_mp_no_levels');
    expect(motivoNaoGerar(formulario({ typeId: '' }), true)).toBe('ui_mp_no_type');
    expect(motivoNaoGerar(formulario({ tolerancia: -0.001 }), true)).toBe('ui_mp_bad_tol');
    expect(motivoNaoGerar(formulario({ tolerancia: TOLERANCIA_MAXIMA_PISO + 0.001 }), true)).toBe('ui_mp_bad_tol');
    expect(motivoNaoGerar(formulario({ tolerancia: Number.NaN }), true)).toBe('ui_mp_bad_tol');
  });

  it('com massa, nível, tipo e tolerância válidos, Gerar está liberado para piso e para laje', () => {
    expect(motivoNaoGerar(formulario(), true)).toBeNull();
    expect(motivoNaoGerar(formulario({ tipo: 'laje', typeId: 'ls_unica' }), true)).toBeNull();
    expect(motivoNaoGerar(formulario({ tolerancia: 0 }), true)).toBeNull();
  });
});
