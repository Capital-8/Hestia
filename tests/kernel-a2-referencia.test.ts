import { describe, expect, it } from 'vitest';
import { createEmptyProject, migrateProject, type Id, type Project } from '@hestia/model';
import { readFileSync } from 'node:fs';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { referenciaA2, type OpcoesA2 } from '../packages/engine/src/kernelA2.ts';
import { resolveLevel } from '../packages/engine/src/resolve.ts';
import { projetoDeEstresseA2 } from '../scripts/kernel-a2-estresse.mts';

/**
 * A referência da A2 repete a orquestração de `resolveLevel` (grupos, pontas livres, T, corte) em volta de `buildItems` e
 * `paint`. Este teste confere que ela entrega o que `resolveLevel` entrega: `raw` e `fragment` de cada camada em planta.
 */
function conferir(p: Project, opcoes: OpcoesA2): number {
  const a1 = montarCenaA1(p);
  const idDe = new Map<number, Id>([...a1.idDe].map(([id, n]) => [n, id]));
  const nomeDoMaterial = new Map<number, Id>([...a1.materialDe].map(([id, n]) => [n, id]));
  let conferidos = 0;
  for (const l of p.levels) {
    const ref = referenciaA2(p, l.id, a1, opcoes);
    const res = resolveLevel(p, l.id, new Map(), opcoes);
    for (const it of ref) {
      const tem = it.fragmento.length > 0;
      if (!(it.emPlanta || it.contorno) || !tem) continue;
      const camadas = res.walls[idDe.get(it.parede)!]!.layers;
      const layerIndex = it.faixa ? -(it.indice + 1) : it.indice;
      const c = camadas.find((x) => x.layerIndex === layerIndex);
      expect(c, `parede ${it.parede} camada ${layerIndex}`).toBeDefined();
      expect(c!.materialId).toBe(nomeDoMaterial.get(it.material));
      expect(c!.raw).toEqual(it.bruto);
      expect(c!.fragment).toEqual(it.fragmento);
      conferidos++;
    }
  }
  return conferidos;
}

describe('referência da A2 x resolveLevel', () => {
  it('estresse com faixas, wrapEnds e arcos: raw e fragment iguais aos de resolveLevel', () => {
    let total = 0;
    for (const semente of [1, 2, 3]) {
      const p = projetoDeEstresseA2(semente, { paredes: 25, pavimentos: 1 });
      total += conferir(p, {});
      total += conferir(p, { cutZ: 2.0 });
    }
    expect(total).toBeGreaterThan(200);
  });

  it('projeto vazio não tem itens', () => {
    expect(conferir(createEmptyProject('vazio'), {})).toBe(0);
  });

  it('casa de 2 quartos', () => {
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    expect(conferir(p, {})).toBeGreaterThan(0);
  });
});
