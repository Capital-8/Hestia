import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeSlab, type Lot, type Project } from '@hestia/model';
import { loteIssues } from './loteIssues.ts';
import { loteL1, projetoI1, projetoLote } from './fixtureLote.ts';

const comLimites = (p: Project, limites: Lot['limites']): Project => {
  const s = new ProjectStore(p);
  s.exec({ type: 'updateLot', id: 'lote_l1', patch: { limites } });
  return s.project;
};
const codigos = (p: Project): string[] => loteIssues(p).map((i) => i.code);

describe('avisos do lote', () => {
  it('lote-excede-ocupacao: positivo e negativo', () => {
    expect(codigos(comLimites(projetoI1(), { taxaOcupacaoMax: 0.2 }))).toContain('lote-excede-ocupacao');
    expect(codigos(comLimites(projetoI1(), { taxaOcupacaoMax: 0.25 }))).not.toContain('lote-excede-ocupacao');
    expect(codigos(projetoI1())).not.toContain('lote-excede-ocupacao');
  });

  it('lote-excede-coeficiente: positivo e negativo', () => {
    const a = loteIssues(comLimites(projetoI1(), { coefAproveitamentoMax: 0.4 })).find((i) => i.code === 'lote-excede-coeficiente');
    expect(a?.elementId).toBe('lote_l1');
    expect(a?.severity).toBe('warning');
    expect(codigos(comLimites(projetoI1(), { coefAproveitamentoMax: 0.5 }))).not.toContain('lote-excede-coeficiente');
  });

  it('lote-abaixo-permeabilidade: positivo e negativo', () => {
    expect(codigos(comLimites(projetoI1(), { permeabilidadeMin: 0.7 }))).toContain('lote-abaixo-permeabilidade');
    expect(codigos(comLimites(projetoI1(), { permeabilidadeMin: 0.6 }))).not.toContain('lote-abaixo-permeabilidade');
  });

  it('lote-edificacao-fora-do-edificavel: positivo e negativo', () => {
    expect(codigos(projetoI1())).not.toContain('lote-edificacao-fora-do-edificavel');
    const s = new ProjectStore(projetoLote(loteL1()));
    // Laje 4 × 4 que invade a faixa de recuo da frente (y de 3 a 7; o recuo vai até y = 5).
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 's_fora', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 4, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 7 }, { x: 4, y: 7 }] }) });
    expect(codigos(s.project)).toContain('lote-edificacao-fora-do-edificavel');
  });

  it('projeto sem lote não gera aviso', () => {
    expect(loteIssues(createEmptyProject())).toEqual([]);
  });

  it('mensagem em inglês', () => {
    const [i] = loteIssues(comLimites(projetoI1(), { taxaOcupacaoMax: 0.2 }), 'en');
    expect(i!.message).toContain('site coverage');
  });
});
