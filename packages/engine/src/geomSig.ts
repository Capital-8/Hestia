import type { MultiPolygon } from '@hestia/geom';

/** Arredonda para 1e-6 m: assinaturas de geometria comparam formas sem ruído de ponto flutuante. */
export const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Assinatura textual de uma forma (anéis arredondados): chave de cache de cotas e cortes. */
export const ringsOfShape = (m: MultiPolygon): string => m.map((p) => p.map((r) => r.map((v) => `${round(v.x)},${round(v.y)}`).join(';')).join('|')).join('/');

export const sigOf = (m: MultiPolygon): string => ringsOfShape(m);

/**
 * Assinatura canônica da forma: não depende do vértice em que cada anel começa, nem da ordem dos anéis e dos polígonos.
 * (`sigOf` depende: o polygon-clipping escolhe o início do anel pela ordem do sweep, então a mesma região pode ter
 * assinaturas diferentes.) Usada para decidir a fusão de faixas contíguas com a mesma região.
 */
export const sigCanonica = (m: MultiPolygon): string =>
  m
    .map((p) =>
      p
        .map((r) => {
          const pts = r.map((v) => `${round(v.x)},${round(v.y)}`);
          let melhor = 0;
          for (let i = 1; i < pts.length; i++) if (pts[i]! < pts[melhor]!) melhor = i;
          return pts.slice(melhor).concat(pts.slice(0, melhor)).join(';');
        })
        .sort()
        .join('|'),
    )
    .sort()
    .join('/');
