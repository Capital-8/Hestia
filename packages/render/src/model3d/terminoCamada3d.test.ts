import { describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { view3dOf, type Project } from '@hestia/model';
import { projetoParedeSobLaje } from '../../../../tests/termino-camada-casos.ts';
import { ModelScene } from './scene3d.ts';
import { sobreposicaoDeMalhas, trianguloDaCena } from './sobreposicaoMalhas3d.ts';

/** A cena do projeto, com todas as paredes como geometria (o caminho de referência, sem caixas instanciadas). */
function cena(p: Project): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  const pv: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic' } };
  const niveis: ResolvedLevel[] = pv.levels.map((l) => resolveLevel(pv, l.id));
  ms.update(pv, niveis, { edges: false, shadows: false, dark: false });
  return ms;
}

describe('3D: a laje com término por camada não se sobrepõe à parede, reta ou anexada ao telhado', () => {
  for (const anexar of [false, true]) {
    it(`parede ${anexar ? 'anexada ao telhado (topo inclinado)' : 'reta'}: volume comum entre a malha de cada parede e a da laje é zero`, () => {
      const tris = trianguloDaCena(cena(projetoParedeSobLaje(anexar)));
      for (const w of ['w0', 'w1', 'w2', 'w3', 'wi']) {
        const r = sobreposicaoDeMalhas(tris, (id) => id === w, (id) => id === 'laje');
        expect(r.volA, `${w} tem malha`).toBeGreaterThan(1);
        expect(r.volB, 'a laje tem malha').toBeGreaterThan(1);
        expect(r.volume, `${w}: volume comum`).toBeLessThan(1e-6);
      }
    });
  }

  it('a parede anexada perde só o que a laje ocupa: o volume cortado é o da região comum de 2,88 a 3,00 m', () => {
    const projeto = projetoParedeSobLaje(true);
    const tris = trianguloDaCena(cena(projeto));
    const w1 = sobreposicaoDeMalhas(tris, (id) => id === 'w1', (id) => id === 'laje');
    // sem a junção a parede ocuparia 0,014 m³ a mais (valor medido antes da correção, parede x = 6 de 4 m): o volume da parede fica abaixo do bruto
    expect(w1.volA).toBeLessThan(2.3728);
    expect(w1.volA).toBeGreaterThan(2.35);
  });
});
