import { describe, expect, it } from 'vitest';
import {
  applyCommand as aplicarNoLugar,
  createEmptyProject,
  FAMILIA_ARMARIO,
  type Familia,
  type Project,
} from '@hestia/model';
import { larguraDoModulo } from './montarFila.ts';

/*
 * Segunda parte dos testes CEGOS de `montarFila` (ficha T-F5-fila-motor): só `larguraDoModulo`, separada para o primeiro
 * arquivo ficar abaixo de 420 linhas. Os valores esperados saem da especificação e da família `FAMILIA_ARMARIO` (L = 600/800 mm,
 * faixa 300..1200 mm); a função testada nunca calcula o esperado. Como `montarFila.ts` é o esboço que lança "não implementado"
 * neste worktree, estes testes falham aqui — e isso é esperado.
 */

const CASAS = 9;
const FAM = FAMILIA_ARMARIO.id;

/** Projeto vazio com a família de armário carregada. */
function projetoComArmario(): Project {
  const q = structuredClone(createEmptyProject('fila-cega'));
  aplicarNoLugar(q, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return q;
}

describe('larguraDoModulo', () => {
  it('A60: largura 0,6 m com faixa [0,3; 1,2]', () => {
    // L do tipo A60 = 600 mm → 0,6 m; parâmetro L: min 300 mm e max 1200 mm → 0,3 e 1,2 m.
    const r = larguraDoModulo(projetoComArmario(), FAM, 'A60');
    expect(r).not.toBeNull();
    expect(r!.largura).toBeCloseTo(0.6, CASAS);
    expect(r!.min).toBeCloseTo(0.3, CASAS);
    expect(r!.max).toBeCloseTo(1.2, CASAS);
  });

  it('A80: largura 0,8 m com a mesma faixa', () => {
    // L do tipo A80 = 800 mm → 0,8 m.
    const r = larguraDoModulo(projetoComArmario(), FAM, 'A80');
    expect(r).not.toBeNull();
    expect(r!.largura).toBeCloseTo(0.8, CASAS);
    expect(r!.min).toBeCloseTo(0.3, CASAS);
    expect(r!.max).toBeCloseTo(1.2, CASAS);
  });

  it('família ausente devolve null', () => {
    // Sem a família no projeto não há L para resolver.
    expect(larguraDoModulo(projetoComArmario(), 'fam_inexistente', 'A60')).toBeNull();
  });

  it('parâmetro L sem faixa: min = max = largura', () => {
    // Sem `min`/`max` no parâmetro, a faixa degenera na própria largura (0,6 m do A60).
    const familia: Familia = structuredClone(FAMILIA_ARMARIO);
    const largura = familia.parametros.find((parametro) => parametro.id === 'L')!;
    delete largura.min;
    delete largura.max;
    const p: Project = { ...createEmptyProject('sem-faixa'), componentFamilies: { [familia.id]: familia } };
    const r = larguraDoModulo(p, familia.id, 'A60');
    expect(r).not.toBeNull();
    expect(r!.largura).toBeCloseTo(0.6, CASAS);
    expect(r!.min).toBeCloseTo(0.6, CASAS);
    expect(r!.max).toBeCloseTo(0.6, CASAS);
  });
});
