import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_CORTE_MASSA, servicoMassa, type LinhaCorteMassaProjeto, type SectionResult } from '@hestia/engine';
import { massaM1, massaM3 } from '@hestia/engine/src/fixtureMassa.ts';
import { ProjectStore, createEmptyProject, makeLevel, type Id, type Project } from '@hestia/model';
import { massasNaCaixaDoCorteDoProjeto, selecaoComCaixa } from './sectionBoxSelect.ts';

/**
 * Caixa de seleção no corte e na elevação pega a MASSA (pendência E9-2a): as linhas vêm do kernel (consulta 143, simulada) e a caixa usa
 * a mesma regra de janela e cruzamento do guarda-corpo. O bloco de `ViewportCanvas.tsx` soma estes ids aos do corte e do guarda-corpo.
 */
afterEach(() => vi.restoreAllMocks());

const anel = (s0: number, z0: number, s1: number, z1: number): Array<{ s: number; z: number }> => [
  { s: s0, z: z0 }, { s: s1, z: z0 }, { s: s1, z: z1 }, { s: s0, z: z1 }, { s: s0, z: z0 },
];

const LINHAS: LinhaCorteMassaProjeto[] = [
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(0, 0, 10, 9) },
  { massaId: 'm3', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(12, 0, 14, 9) },
];

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'addMass', mass: massaM1() });
  s.exec({ type: 'addMass', mass: massaM3() });
  return s.project;
}

const secao = { length: 10, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 3 } } as unknown as SectionResult;

describe('caixa de seleção no corte: massa', () => {
  it('janela (esquerda para a direita) pega só a massa inteira dentro da caixa', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: -1, y: -1 }, { x: 11, y: 10 })).toEqual(['m1']);
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: -1, y: -1 }, { x: 15, y: 10 })).toEqual(['m1', 'm3']);
    // m1 não cabe inteira (s vai até 10 e a caixa para em 8).
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: -1, y: -1 }, { x: 8, y: 10 })).toEqual([]);
  });

  it('cruzamento (direita para a esquerda) pega toda massa que toca a caixa', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: 13, y: 5 }, { x: 8, y: 4 })).toEqual(['m1', 'm3']);
  });

  it('massa oculta na vista não entra; sem kernel nada entra', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: -1, y: -1 }, { x: 15, y: 10 }, new Set<Id>(['m1']))).toEqual(['m3']);
    vi.restoreAllMocks();
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    expect(massasNaCaixaDoCorteDoProjeto(projeto(), secao, { x: -1, y: -1 }, { x: 15, y: 10 })).toEqual([]);
  });

  it('Shift ou Ctrl somam a massa da caixa à seleção atual', () => {
    expect(selecaoComCaixa(['w1'], ['m1'], true)).toEqual(['w1', 'm1']);
    expect(selecaoComCaixa(['w1'], ['m1'], false)).toEqual(['m1']);
  });

  it('o bloco da caixa em ViewportCanvas.tsx liga a massa junto do guarda-corpo', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'ViewportCanvas.tsx'), 'utf8');
    expect(fonte).toMatch(/guardaCorposNaCaixaDoCorteDoProjeto\(editor\.project, result, wa, wb, hidden\),[\s\S]{0,200}massasNaCaixaDoCorteDoProjeto\(editor\.project, result, wa, wb, hidden\)/);
  });
});
