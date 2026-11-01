import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Project, type ValidationIssue } from '@hestia/model';
import { SETTLE_MS, agendarAvisos, avisosDoProjeto } from './avisosProjeto.ts';

/** Projeto vazio com uma parede, para que os avisos rodem sobre algum elemento. */
function projetoComParede(): Project {
  const s = new ProjectStore(createEmptyProject('Teste de avisos'));
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_teste', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  return s.project;
}

describe('agendarAvisos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('não entrega nada antes do prazo de silêncio', () => {
    const recebido: ValidationIssue[][] = [];
    agendarAvisos(projetoComParede(), (a) => recebido.push(a));
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(recebido).toHaveLength(0);
  });

  it('entrega exatamente o resultado de avisosDoProjeto, uma vez, depois do prazo', () => {
    const p = projetoComParede();
    const direto = avisosDoProjeto(p);
    const recebido: ValidationIssue[][] = [];
    agendarAvisos(p, (a) => recebido.push(a), SETTLE_MS, { worker: null });
    vi.advanceTimersByTime(SETTLE_MS);
    vi.runAllTimers();
    expect(recebido).toHaveLength(1);
    expect(recebido[0]).toEqual(direto);
  });

  it('cancelar a agenda impede a entrega (troca de projeto ou desmontagem)', () => {
    const recebido: ValidationIssue[][] = [];
    const cancelar = agendarAvisos(projetoComParede(), (a) => recebido.push(a));
    cancelar();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(recebido).toHaveLength(0);
  });
});
