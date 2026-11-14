import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_CORTE_MASSA, computeSection, servicoMassa, type LinhaCorteMassaProjeto } from '@hestia/engine';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import { ProjectStore, createEmptyProject, makeLevel } from '@hestia/model';
import { sectionSnapIndexDoProjeto } from './sectionSnapComGuardaCorpo.ts';

/**
 * Snaps de captura no corte e na elevação para a MASSA (E9-2b): vértices e meios de aresta das linhas cortadas, projetadas e de feição que o
 * kernel devolve (consulta 143, simulada), no mesmo índice das paredes e do guarda-corpo.
 */
afterEach(() => vi.restoreAllMocks());

const anel = (s0: number, z0: number, s1: number, z1: number): Array<{ s: number; z: number }> => [
  { s: s0, z: z0 }, { s: s1, z: z0 }, { s: s1, z: z1 }, { s: s0, z: z1 }, { s: s0, z: z0 },
];

const LINHAS: LinhaCorteMassaProjeto[] = [
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(0, 0, 10, 9) },
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.feicao, pontos: [{ s: 5, z: 0 }, { s: 5, z: 9 }] },
];

function cena() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'addMass', mass: massaM1() });
  const resultado = computeSection(s.project, { a: { x: -20, y: 0 }, b: { x: 20, y: 0 }, depth: 3 });
  return { projeto: s.project, resultado };
}

describe('massa no corte: índice de captura', () => {
  it('vértices (endpoint) e meios de aresta (midpoint) do contorno cortado entram, sem o ponto de fechamento repetido', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { projeto, resultado } = cena();
    const host = sectionSnapIndexDoProjeto(resultado, projeto).byHost.get('m1')!;
    const pts = (k: string) => host.points.filter((p) => p.kind === k).map((p) => `${p.x},${p.y}`);
    for (const q of ['0,0', '10,0', '10,9', '0,9']) expect(pts('endpoint')).toContain(q);
    for (const q of ['5,0', '10,4.5', '5,9', '0,4.5']) expect(pts('midpoint')).toContain(q);
    // 4 arestas do contorno fechado + 1 da feição: sem aresta de comprimento zero do ponto repetido.
    expect(host.segments).toHaveLength(5);
  });

  it('o resultado do kernel é o mesmo objeto entre chamadas: o índice é reaproveitado', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { projeto, resultado } = cena();
    expect(sectionSnapIndexDoProjeto(resultado, projeto)).toBe(sectionSnapIndexDoProjeto(resultado, projeto));
  });

  it('sem kernel a vista não ganha pontos da massa', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    const { projeto, resultado } = cena();
    expect(sectionSnapIndexDoProjeto(resultado, projeto).byHost.get('m1')).toBeUndefined();
  });
});
