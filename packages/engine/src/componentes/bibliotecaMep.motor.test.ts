import { BIBLIOTECA_MEP } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { malhaDosCorpos } from './corposMalha.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Aceitação da biblioteca MEP no MOTOR (orquestrador): toda família de BIBLIOTECA_MEP, em todos os tipos, resolve sem erros,
 * tem ao menos um corpo sólido, gera malha sem erros, de volume positivo, e as ligações apontam para fora do corpo.
 * O volume de cada família é conferido pelos testes do próprio modelo; aqui só a sanidade da malha real.
 */
function volume(positions: number[], indices: number[]): number {
  let v = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!;
    const bx = positions[b]!, by = positions[b + 1]!, bz = positions[b + 2]!;
    const cx = positions[c]!, cy = positions[c + 1]!, cz = positions[c + 2]!;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

describe('biblioteca MEP no motor', () => {
  it('há famílias MEP registradas', () => {
    expect(BIBLIOTECA_MEP.length).toBeGreaterThan(0);
  });
  for (const f of BIBLIOTECA_MEP) {
    for (const t of f.tipos) {
      it(`${f.id} (${t.id}): resolve, malha estanque e ligações coerentes`, () => {
        const r = resolverFamilia(f, { tipoId: t.id });
        expect(r.erros).toEqual([]);
        const corpos = r.corpos ?? [];
        expect(corpos.filter((c) => !c.vazio).length).toBeGreaterThan(0);
        const m = malhaDosCorpos(corpos);
        expect(m.erros).toEqual([]);
        expect(m.solidas.indices.length).toBeGreaterThan(0);
        expect(Math.abs(volume(m.solidas.positions, m.solidas.indices))).toBeGreaterThan(1e-9);
        for (const l of r.ligacoes ?? []) {
          expect(l.dominio).toBeTruthy();
          expect(Math.hypot(...l.direcao)).toBeCloseTo(1, 9);
          expect(l.diametro).toBeGreaterThan(0);
        }
        // Tampão e ralos têm uma única ligação (a ponta fechada / a saída; a entrada do ralo é a grelha); as demais têm ao menos duas.
        expect((r.ligacoes ?? []).length).toBeGreaterThanOrEqual(f.id.endsWith('tampao') || f.id.startsWith('fam_ralo') ? 1 : 2);
      });
    }
  }
});
