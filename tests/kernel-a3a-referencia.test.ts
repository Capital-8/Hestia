/**
 * A3a sem wasm: a montagem das seções e a referência (`referenciaA3a`) do motor TypeScript. Prova que (1) a referência é o que
 * `openingGeometry`/`openingRect` entregam, na ordem de `resolveLevel`, (2) as seções têm o formato do esquema v4 e (3) cada
 * caso de limiar muda a saída do TypeScript entre os dois lados: se um caso não mudasse nada, a mutação do limiar no Rust
 * seria invisível para o teste de equivalência (`kernel-a3a.wasm.test.ts`).
 */
import { openingsOfWall, wallsOnLevel, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3, referenciaA3a } from '../packages/engine/src/kernelA3.ts';
import { frameOfWall, openingGeometry } from '../packages/engine/src/resolve.ts';
import { openingRect } from '../packages/engine/src/openingCut.ts';
import { SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { casosDeLimiarA3a, projetoDeEstresseA3a } from '../scripts/kernel-a3a-estresse.mts';

const ref = (p: Project) => {
  const a1 = montarCenaA1(p);
  const a3 = montarCenaA3(p, a1);
  return p.levels.flatMap((l) => referenciaA3a(p, l.id, a1, a3));
};

describe('A3a: montagem e referência do motor TypeScript', () => {
  it('as seções têm as colunas do esquema, com o mesmo comprimento', () => {
    const p = projetoDeEstresseA3a(2, { paredes: 20, pavimentos: 1 });
    const a3 = montarCenaA3(p, montarCenaA1(p));
    for (const nome of ['tipos_abertura', 'aberturas'] as const) {
      expect(Object.keys(a3.secoes[nome])).toEqual(SECOES[nome].colunas.map((c) => c.nome));
      for (const v of Object.values(a3.secoes[nome])) expect(v.length).toBe(a3.nLinhas[nome]);
    }
    expect(a3.nLinhas.aberturas).toBeGreaterThan(10);
    expect(a3.ignoradas).toBe(0);
  });

  it('a referência é openingGeometry/openingRect, na ordem de wallsOnLevel e openingsOfWall', () => {
    const p = projetoDeEstresseA3a(4, { paredes: 25, pavimentos: 1 });
    const a1 = montarCenaA1(p);
    const a3 = montarCenaA3(p, a1);
    const esperado = wallsOnLevel(p, p.levels[0]!.id).flatMap((w) => {
      const f = frameOfWall(p, w.id);
      return f ? openingsOfWall(p, w.id).map((o) => ({ g: openingGeometry(p, o, f), id: o.id })) : [];
    });
    const r = referenciaA3a(p, p.levels[0]!.id, a1, a3);
    expect(r.length).toBe(esperado.length);
    r.forEach((x, i) => {
      const e = esperado[i]!;
      expect(x.id).toBe(a3.aberturaDe.get(e.id));
      expect(x.centro).toEqual(e.g.center);
      expect(x.cutHalf).toBe(e.g.cutHalf);
      expect(x.retangulo).toEqual(openingRect(e.g));
    });
  });
});

describe('A3a: cada limiar de decisão muda a saída do motor TypeScript entre os dois lados', () => {
  const porLimiar = new Map<string, Partial<Record<'abaixo' | 'acima', Project>>>();
  for (const c of casosDeLimiarA3a()) porLimiar.set(c.limiar, { ...porLimiar.get(c.limiar), [c.lado]: c.projeto });
  for (const [limiar, lados] of porLimiar) {
    it(limiar, () => {
      if (!lados.abaixo || !lados.acima) {
        // só sensibilidade: o caso tem exatamente uma abertura e a referência a devolve
        const [c] = [...casosDeLimiarA3a()].filter((x) => x.limiar === limiar);
        expect(ref(c!.projeto).length).toBe(1);
        return;
      }
      const a = ref(lados.abaixo);
      const b = ref(lados.acima);
      expect(a.length).toBe(1);
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });
  }
});
