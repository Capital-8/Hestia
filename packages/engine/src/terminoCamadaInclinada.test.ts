import { describe, expect, it } from 'vitest';
import { projetoParedeSobLaje } from '../../../tests/termino-camada-casos.ts';
import { bandPiece, overlapVolume, slabLayerPiece } from './junctionNet.ts';
import { junctionLevel, wallLayerBandsAfterJunction } from './junctionLevel.ts';
import { fuseBands } from './bandFuse.ts';
import { resolveLevel } from './resolve.ts';
import { resolveSlabs } from './slabs.ts';

/**
 * Parede de topo inclinado (anexada ao telhado) sob uma laje cuja camada de estrutura termina na face do núcleo: a junção tem de recortar as faixas
 * inclinadas como as retas. As peças medidas são as que o desenho usa (`wallLayerBandsAfterJunction` e as camadas da laje), então a sobreposição
 * de volume entre elas é a que o 3D mostraria.
 */
describe('junção: faixas de parede com topo inclinado são recortadas pela laje que entra', () => {
  for (const anexar of [false, true]) {
    it(`parede ${anexar ? 'anexada ao telhado' : 'reta'}: nenhuma peça da parede se sobrepõe à laje depois da junção`, () => {
      const p = projetoParedeSobLaje(anexar);
      const jl = junctionLevel(p, 'lv_0');
      const lv = resolveLevel(p, 'lv_0');
      const laje = resolveSlabs(p, 'lv_1')[0]!;
      const lajePecas = laje.layers.map((l) => slabLayerPiece(laje, l));
      let inclinadas = 0;
      let antes = 0;
      let depois = 0;
      for (const rw of Object.values(lv.walls)) {
        for (const l of rw.layers) {
          inclinadas += l.bands.filter((b) => b.slope).length;
          const cortadas = fuseBands(wallLayerBandsAfterJunction(jl, rw, l)).map((b) => bandPiece(rw, b));
          for (const c of lajePecas) {
            for (const b of l.bands) antes += overlapVolume(bandPiece(rw, b), c);
            for (const q of cortadas) depois += overlapVolume(q, c);
          }
        }
      }
      expect(antes, 'sem a junção a parede atravessa a laje').toBeGreaterThan(0.1);
      if (anexar) expect(inclinadas).toBeGreaterThan(0);
      expect(depois).toBeLessThan(1e-6);
    });
  }
});
