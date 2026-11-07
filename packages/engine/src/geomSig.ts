import { difference, dist, multiArea, type MultiPolygon } from '@hestia/geom';

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

/** Grade do kernel Rust (1 µm, ADR 0049): a área de uma região muda no máximo `perímetro x grade` por causa dela. */
const GRADE = 1e-6;

const perimetro = (m: MultiPolygon): number => m.reduce((s, poly) => s + poly.reduce((t, r) => t + r.reduce((u, q, i) => u + dist(q, r[(i + 1) % r.length]!), 0), 0), 0);

/**
 * As duas regiões são a mesma, a menos da grade do kernel? A mesma forma calculada em duas cadeias de operações do Rust (uma por faixa de cota
 * da parede) sai com vértices uma célula de 1 µm para lá ou para cá; `sigCanonica` enxerga duas formas e a camada ganhava uma faixa a mais, de
 * mesmo volume (nos projetos reais, a causa da troca de faixas de 1 para 2 na junção e das diferenças de 1,4 a 2,4 em células de parede).
 * A diferença simétrica de duas cópias da mesma região é mais fina que a grade: área de no máximo `perímetro x grade`. Acima disso é geometria
 * de verdade (vão, término, outra camada) e as faixas continuam separadas.
 */
export function mesmaRegiaoNaGrade(a: MultiPolygon, b: MultiPolygon): boolean {
  if (a === b || sigCanonica(a) === sigCanonica(b)) return true;
  if (a.length === 0 || b.length === 0) return false;
  const limite = Math.max(perimetro(a), perimetro(b)) * GRADE;
  if (Math.abs(multiArea(a) - multiArea(b)) > limite) return false;
  return multiArea(difference(a, b)) + multiArea(difference(b, a)) <= limite;
}
