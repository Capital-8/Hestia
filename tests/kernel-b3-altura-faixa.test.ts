/**
 * Altura de faixa de parede medida só com peças de área real (> 1e-6 m², 2026-11-05). Peça de área menor (resíduo de arredondamento) não entra na medida de
 * altura do comparador; a região e o volume seguem com todas as peças. Sem nenhuma peça acima de 1e-6 m², a faixa não tem altura medida e não compara.
 */
import { describe, expect, it } from 'vitest';
import type { MultiPolygon } from '@hestia/geom';
import type { JuncaoB3, ParteB3, PecaB3 } from '../packages/engine/src/kernelB3.ts';
import { compararB3 } from '../packages/engine/src/kernelComparaB3.ts';

const retangulo = (largura: number, altura: number): MultiPolygon => [[[{ x: 0, y: 0 }, { x: largura, y: 0 }, { x: largura, y: altura }, { x: 0, y: altura }]]];
const faixaDeParede = (banda: number, z0: number, z1: number, poly: MultiPolygon): PecaB3 => ({
  meta: { tipo: 0, prioridade: 1, nucleo: false, explicita: false, venceParede: false, dono: 1, camada: 0, banda },
  externa: false,
  plana: true,
  poligono: poly,
  span: () => [z0, z1] as const,
  faixa: [z0, z1],
});
const parteDe = (poly: MultiPolygon, z0: number, z1: number): ParteB3 => ({ poligono: poly, z0, z1 });
const juncaoDeParede = (bandas: PecaB3[], faixas: JuncaoB3['paredes'][number]['faixas']): JuncaoB3 => ({
  cortadores: [{ tipo: 0, pecas: bandas }],
  elementos: [],
  paredes: [{ parede: 1, corte: true, faixas }],
});

// resíduo de arredondamento: área 1e-7 m² (abaixo do limite de 1e-6 m²), cota 3,00
const residuo = retangulo(1, 1e-7);
const r1 = retangulo(1, 1);

describe('altura de faixa de parede só com peças de área real (> 1e-6 m²)', () => {
  it('(a) faixa com peça de área zero de cota 3,00 e peça real de cota 2,88 mede 2,88: as cotas acima de 2,88 não entram', () => {
    const banda = faixaDeParede(0, 0, 2.88, r1);
    const partes = [parteDe(r1, 0, 2.88), parteDe(residuo, 0, 3.0)];
    const ref = juncaoDeParede([banda], [{ camada: 0, banda: 0, partes }]);
    const rust = juncaoDeParede([banda], [{ camada: 0, banda: 0, partes }]);
    const cmp = compararB3(ref, rust);
    // altura medida 2,88 nas duas seções: a da faixa (paredesDoCortador) tem 3 amostras e a da camada final (faixas de parede) tem 3, com pontos 0 e 2,88.
    // Com a regra antiga a cota 3,00 da peça de área zero entra na seção da camada final e são 9 amostras (antes: 9; depois: 6).
    expect(cmp.regioes).toBe(6);
    expect(cmp.divergencias).toEqual([]);
  });

  it('(b) faixa sem nenhuma peça acima de 1e-6 m² não tem altura medida e não compara', () => {
    const banda = faixaDeParede(0, 0, 3.0, residuo);
    const partes = [parteDe(residuo, 0, 3.0)];
    const ref = juncaoDeParede([banda], [{ camada: 0, banda: 0, partes }]);
    const rust = juncaoDeParede([banda], [{ camada: 0, banda: 0, partes }]);
    const cmp = compararB3(ref, rust);
    expect(cmp.regioes).toBe(0);
    expect(cmp.divergencias).toEqual([]);
  });
});
