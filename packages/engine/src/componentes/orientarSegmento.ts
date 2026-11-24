import type { Component, Familia, Id } from '@hestia/model';

/*
 * Orientação de um trecho reto (ficha C5, CONTRATO §7): a instância cujo eixo Z local vai do ponto `a` ao ponto `b`.
 * Funções puras e determinísticas. Unidades: pontos em metros, ângulos em radianos; `values.L` e `values.DN` em mm.
 */

/** Ponto no mundo, em metros. */
export type PontoSegmento = readonly [number, number, number];

/** Posição e orientação de um segmento: `mundo = Rz(rotation) · Ry(inclinacao[0]) · Rz(inclinacao[1]) · local + (x, y, z)`. */
export interface OrientacaoSegmento {
  x: number;
  y: number;
  z: number;
  rotation: number;
  inclinacao: [number, number];
}

/** Comprimento (m) abaixo do qual o segmento é tratado como degenerado (vertical sem direção). */
const COMPRIMENTO_MINIMO = 1e-9;

/** Comprimento (m) do segmento `a`→`b`. */
export function comprimentoDoSegmento(a: PontoSegmento, b: PontoSegmento): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/**
 * Orientação do tubo de comprimento `|ab|` cujo eixo Z local vai de `a` a `b`: `inclinacao[0] = acos(dz/L)`,
 * `rotation = atan2(dy, dx)` (0 se vertical) e `inclinacao[1] = giro`. Segmento de comprimento nulo: de pé, com o giro pedido.
 */
export function orientarSegmento(a: PontoSegmento, b: PontoSegmento, giro = 0): OrientacaoSegmento {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const vertical = Math.hypot(dx, dy) < COMPRIMENTO_MINIMO;
  const inc = L < COMPRIMENTO_MINIMO ? 0 : Math.acos(Math.max(-1, Math.min(1, dz / L)));
  return { x: a[0], y: a[1], z: a[2], rotation: vertical ? 0 : Math.atan2(dy, dx), inclinacao: [inc, giro] };
}

/** Quem é o dono e onde mora a instância nova (o resto vem da família, do segmento e do DN). */
export interface BaseTrecho {
  id: Id;
  levelId: Id;
}

/**
 * Instância pronta de um trecho de tubo entre `a` e `b` (m): posição e inclinação de `orientarSegmento`, `values.L` = comprimento em
 * mm e `values.DN` = diâmetro nominal em mm. Segmento degenerado ou DN inválido devolve `null` (nada a criar).
 */
export function trechoDeTubo(a: PontoSegmento, b: PontoSegmento, familia: Pick<Familia, 'id'>, dn: number, base: BaseTrecho): Component | null {
  const L = comprimentoDoSegmento(a, b);
  if (!(L >= COMPRIMENTO_MINIMO) || !Number.isFinite(dn) || dn <= 0) return null;
  const o = orientarSegmento(a, b);
  return {
    id: base.id,
    kind: 'component',
    familyId: familia.id,
    typeId: null,
    levelId: base.levelId,
    x: o.x,
    y: o.y,
    z: o.z,
    rotation: o.rotation,
    inclinacao: o.inclinacao,
    mirrored: false,
    values: { L: L * 1000, DN: dn },
    mark: '',
    order: 0,
  };
}
