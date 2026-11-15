import { describe, expect, it } from 'vitest';
import { t, type Lang } from './i18n.ts';

/** T-B: rótulos de face superior nos 7 idiomas (valores literais). */
const ESPERADO: Record<Lang, [string, string, string, string, string]> = {
  pt: ['Face superior', 'Aresta superior externa', 'Aresta superior interna', 'Aresta superior do núcleo', 'Canto superior'],
  en: ['Top face', 'Outer top edge', 'Inner top edge', 'Core top edge', 'Top corner'],
  es: ['Cara superior', 'Arista superior exterior', 'Arista superior interior', 'Arista superior del núcleo', 'Esquina superior'],
  de: ['Oberseite', 'Äußere Oberkante', 'Innere Oberkante', 'Oberkante des Kerns', 'Obere Ecke'],
  fr: ['Face supérieure', 'Arête supérieure extérieure', 'Arête supérieure intérieure', 'Arête supérieure du noyau', 'Coin supérieur'],
  it: ['Faccia superiore', 'Spigolo superiore esterno', 'Spigolo superiore interno', 'Spigolo superiore del nucleo', 'Angolo superiore'],
  pl: ['Powierzchnia górna', 'Górna krawędź zewnętrzna', 'Górna krawędź wewnętrzna', 'Górna krawędź rdzenia', 'Górny narożnik'],
};

describe('rótulos de face superior', () => {
  it('7 idiomas, textos literais', () => {
    expect(Object.keys(ESPERADO)).toHaveLength(7);
    for (const [lang, v] of Object.entries(ESPERADO) as Array<[Lang, string[]]>) {
      expect([t(lang, 'tl_snap_top_face'), t(lang, 'tl_snap_top_edge_ext'), t(lang, 'tl_snap_top_edge_int'), t(lang, 'tl_snap_top_edge_core'), t(lang, 'tl_snap_top_corner')]).toEqual(v);
    }
  });
});
