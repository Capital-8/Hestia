/**
 * A3c sem wasm: os argumentos de `cluster_resolvido` e a referência (`referenciaA3c`, extraída de `resolveLevel`). Prova que (1) os
 * argumentos têm o formato do esquema v6, (2) a referência traz o que a consulta devolve (faixas verticais por camada, `cut` da planta,
 * contorno, regiões por material e silhueta) e (3) cada opção de planta muda a saída do TypeScript: se não mudasse nada, a mutação
 * correspondente no Rust seria invisível ao teste de equivalência (`kernel-a3c.wasm.test.ts`).
 */
import type { Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { montarCenaA1, zDoNivel } from '../packages/engine/src/kernelA1.ts';
import { argumentosA3c, montarCenaA3, referenciaA3c } from '../packages/engine/src/kernelA3.ts';
import { CONSULTAS } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { areaDaForma } from '../scripts/kernel-harness-a2.mts';
import { projetoDeEstresseA3c, variantesDoNivel } from '../scripts/kernel-a3c-estresse.mts';

const preparo = (p: Project) => {
  const a1 = montarCenaA1(p);
  const a3 = montarCenaA3(p, a1);
  const l = p.levels[0]!;
  const z = [...zDoNivel(p, l.id).values()];
  const zBase = Math.min(...z.map((x) => x.z0));
  const zTopo = Math.max(...z.map((x) => x.z0 + x.height));
  return { a1, a3, l, zBase, zTopo };
};

describe('A3c: argumentos e referência do motor TypeScript', () => {
  it('os argumentos seguem o esquema v6: 7 fixos, depois os ids de contorno e os das aberturas de planta', () => {
    const p = projetoDeEstresseA3c(2, { paredes: 14, pavimentos: 1 });
    const { a1, a3, l } = preparo(p);
    const fixos = CONSULTAS.cluster_resolvido.args.length;
    expect(fixos).toBe(7);
    expect(argumentosA3c(p, l.id, a1, a3)).toEqual([a1.nivelDe.get(l.id), 0.02, 0, 0, 0, 0, 0]);
    const [w1, w2] = [...a1.idDe.keys()].slice(0, 2) as [string, string];
    const [o1, o2] = [...a3.aberturaDe.keys()].slice(0, 2) as [string, string];
    const a = argumentosA3c(p, l.id, a1, a3, { cutZ: 1.5, outlineWalls: new Set([w1, w2]), planOpenings: new Set([o1, o2]) });
    expect(a.slice(0, 7)).toEqual([a1.nivelDe.get(l.id), 0.02, 1, 1.5, 2, 1, 2]);
    expect(a.slice(7)).toEqual([a1.idDe.get(w1), a1.idDe.get(w2), a3.aberturaDe.get(o1), a3.aberturaDe.get(o2)]);
    // lista de planta vazia é diferente de omitida
    expect(argumentosA3c(p, l.id, a1, a3, { planOpenings: new Set() }).slice(5, 7)).toEqual([1, 0]);
  });

  it('a referência traz camadas em ordem de layerIndex por parede, com faixas verticais, regiões e uma silhueta por grupo', () => {
    const p = projetoDeEstresseA3c(3, { paredes: 18, pavimentos: 1 });
    const { a1, l } = preparo(p);
    const r = referenciaA3c(p, l.id, a1);
    expect(r.camadas.length).toBeGreaterThan(30);
    expect(r.silhuetas.length).toBeGreaterThan(0);
    expect(r.regioes.length).toBeGreaterThan(0);
    // dentro de cada (grupo, parede): índices crescentes (faixas do tipo, de layerIndex negativo, primeiro)
    let ant: { g: number; p: number; k: number } | null = null;
    for (const c of r.camadas) {
      const k = c.faixa ? -c.indice - 1 : c.indice;
      if (ant && ant.g === c.grupo && ant.p === c.parede) expect(k).toBeGreaterThanOrEqual(ant.k);
      ant = { g: c.grupo, p: c.parede, k };
    }
    expect(r.camadas.some((c) => c.faixa), 'faixas verticais do tipo').toBe(true);
    expect(r.camadas.some((c) => c.faixas.length > 1), 'camadas com mais de uma faixa vertical').toBe(true);
  });

  it('cada opção de planta muda a saída do TypeScript onde o Rust precisa acompanhar', () => {
    const p = projetoDeEstresseA3c(4, { paredes: 22, pavimentos: 1 });
    const { a1, l, zBase, zTopo } = preparo(p);
    const v = Object.fromEntries(variantesDoNivel(p, l.id, 4, zBase, zTopo).map((x) => [x.nome, x.opcoes]));
    const base = referenciaA3c(p, l.id, a1, v['padrão']);
    const area = (m: Parameters<typeof areaDaForma>[0]): number => areaDaForma(m);
    // planOpenings vazio: o corte vira o fragmento (nada fura a planta); as faixas do 3D não mudam
    const vazio = referenciaA3c(p, l.id, a1, v['planOpenings vazio']);
    expect(vazio.camadas.every((c) => Math.abs(area(c.cut) - area(c.fragment)) < 1e-6)).toBe(true);
    expect(base.camadas.some((c) => area(c.fragment) - area(c.cut) > 1e-3), 'os vãos furam a planta no padrão').toBe(true);
    expect(JSON.stringify(vazio.camadas.map((c) => c.faixas))).toBe(JSON.stringify(base.camadas.map((c) => c.faixas)));
    // metade das aberturas: o corte fica entre os dois
    const metade = referenciaA3c(p, l.id, a1, v['planOpenings metade']);
    const soma = (r: typeof base): number => r.camadas.reduce((t, c) => t + area(c.cut), 0);
    expect(soma(metade)).toBeLessThan(soma(vazio));
    expect(soma(metade)).toBeGreaterThan(soma(base));
    // corte alto + contorno: paredes de contorno têm fragmento e corte vazio, e saem das regiões
    const alto = referenciaA3c(p, l.id, a1, v['corte alto, contorno']);
    expect(alto.camadas.length).toBeGreaterThan(0);
    expect(alto.camadas.every((c) => c.cut.length === 0)).toBe(true);
    expect(alto.camadas.some((c) => c.fragment.length > 0)).toBe(true);
    expect(alto.regioes.length).toBe(0);
    // corte baixo: as faixas do tipo que começam no chão entram na planta (aparecem camadas de faixa com corte)
    const baixo = referenciaA3c(p, l.id, a1, v['corte baixo']);
    const faixasNaPlanta = (r: typeof base): number => r.camadas.filter((c) => c.faixa && c.cut.length > 0).length;
    expect(faixasNaPlanta(baixo)).not.toBe(faixasNaPlanta(referenciaA3c(p, l.id, a1, v['corte alto, contorno'])));
  }, 60_000);

  it('parede com perfil superior entra na referência (a A3d a cobre; antes a A3c a recusava)', () => {
    const p = projetoDeEstresseA3c(5, { paredes: 6, pavimentos: 1 });
    const { a1, l } = preparo(p);
    const id = [...a1.idDe.keys()][0]!;
    const w = p.elements[id] as unknown as { topProfile?: unknown };
    const q = { ...p, elements: { ...p.elements, [id]: { ...w, topProfile: [{ t: 0, z: 1 }, { t: 1, z: 2 }] } } } as Project;
    expect(() => referenciaA3c(q, l.id, a1)).not.toThrow();
  });
});
