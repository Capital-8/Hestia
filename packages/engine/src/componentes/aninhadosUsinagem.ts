import type { Eixo, FaceUsinagem } from '@hestia/model';
import type { UsinagemResolvida } from './pecas.ts';

/*
 * Usinagens acompanhando a peça aninhada girada (ficha E5): a entrada e a direção de cada furo e os quatro cantos de
 * cada rasgo/recorte vão para o mundo da peça original, giram pelas tabelas exatas de 90°, transladam e voltam ao plano
 * da peça nova. Sem trigonometria; arredondamento a 1 µm.
 */

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

type Graus = 0 | 90 | 180 | 270;
type Ponto = [number, number, number];

/** Geometria mínima de uma peça para converter usinagens de/para o mundo (m). */
export interface GeometriaUsinagem {
  eixo: Eixo;
  origem: readonly [number, number, number];
  tamanho: readonly [number, number];
  espessura: number;
}

/** Reduz a rotação (já validada como múltipla de 90°) a um dos quatro casos. */
function normalizar(graus: number): Graus {
  const n = ((graus % 360) + 360) % 360;
  if (n === 90) return 90;
  if (n === 180) return 180;
  if (n === 270) return 270;
  return 0;
}

/** Rotação anti-horária no plano XY pelas tabelas exatas de 0, 90, 180 e 270 graus. */
function girarXY(x: number, y: number, graus: Graus): [number, number] {
  switch (graus) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

/** Índices do mundo (0 = x, 1 = y, 2 = z) das direções `u`, `v` e da espessura `t` no plano da peça. */
function indices(eixo: Eixo): { u: number; v: number; t: number } {
  if (eixo === 'x') return { u: 1, v: 2, t: 0 };
  if (eixo === 'y') return { u: 0, v: 2, t: 1 };
  return { u: 0, v: 1, t: 2 };
}

/** Direção para dentro do material, no mundo, a partir da face ou borda (convenção de `pecas.ts`). */
function direcao(face: FaceUsinagem, eixo: Eixo): Ponto {
  const { u, v, t } = indices(eixo);
  const d: Ponto = [0, 0, 0];
  if (face === 'a') d[t] = 1;
  else if (face === 'b') d[t] = -1;
  else if (face === 'o') d[u] = 1;
  else if (face === 'l') d[u] = -1;
  else if (face === 's') d[v] = 1;
  else d[v] = -1;
  return d;
}

/**
 * Ponto (u, v) da face ou borda levado para o mundo. Nas faces `a`/`b`, `u` corre no eixo `u` e `v` no eixo `v`; nas
 * bordas, `u` corre ao longo da borda e `v` é a distância da face `a` na espessura.
 */
function pontoNoMundo(p: GeometriaUsinagem, face: FaceUsinagem, u: number, v: number): Ponto {
  const { u: U, v: V, t: T } = indices(p.eixo);
  const [a, b] = p.tamanho;
  const pt: Ponto = [p.origem[0], p.origem[1], p.origem[2]];
  if (face === 'a' || face === 'b') {
    pt[U] = pt[U]! + u;
    pt[V] = pt[V]! + v;
    if (face === 'b') pt[T] = pt[T]! + p.espessura;
  } else if (face === 'o' || face === 'l') {
    pt[V] = pt[V]! + u;
    pt[T] = pt[T]! + v;
    if (face === 'l') pt[U] = pt[U]! + a;
  } else {
    pt[U] = pt[U]! + u;
    pt[T] = pt[T]! + v;
    if (face === 'n') pt[V] = pt[V]! + b;
  }
  return pt;
}

/** Gira o ponto em torno de Z e translada em XY (mesma translação aplicada à peça). */
function girarPonto(pt: Ponto, graus: Graus, dx: number, dy: number): Ponto {
  const [x, y] = girarXY(pt[0], pt[1], graus);
  return [x + dx, y + dy, pt[2]];
}

/** Gira a direção em torno de Z (sem translação). */
function girarDirecao(d: Ponto, graus: Graus): Ponto {
  const [x, y] = girarXY(d[0], d[1], graus);
  return [x, y, d[2]];
}

/** Coordenada local do ponto em relação ao canto mínimo da peça nova. */
function local(p: GeometriaUsinagem, pt: Ponto): Ponto {
  return [pt[0] - p.origem[0], pt[1] - p.origem[1], pt[2] - p.origem[2]];
}

/** Face ou borda cuja normal para dentro coincide com a direção girada. */
function faceDaDirecao(p: GeometriaUsinagem, d: Ponto): FaceUsinagem {
  const { u, v, t } = indices(p.eixo);
  if (d[t] === 1) return 'a';
  if (d[t] === -1) return 'b';
  if (d[u] === 1) return 'o';
  if (d[u] === -1) return 'l';
  if (d[v] === 1) return 's';
  return 'n';
}

/** Converte a coordenada local para (u, v) na convenção da face ou borda. */
function paraPlano(p: GeometriaUsinagem, face: FaceUsinagem, d: Ponto): [number, number] {
  const { u, v, t } = indices(p.eixo);
  if (face === 'a' || face === 'b') return [d[u]!, d[v]!];
  if (face === 'o' || face === 'l') return [d[v]!, d[t]!];
  return [d[u]!, d[t]!];
}

/** Furo: leva a entrada e a direção ao mundo, gira, translada e volta ao plano novo. */
function girarFuro(u: UsinagemResolvida, antiga: GeometriaUsinagem, nova: GeometriaUsinagem, g: Graus, dx: number, dy: number): UsinagemResolvida {
  const entrada = pontoNoMundo(antiga, u.face, u.u, u.v);
  const pt = girarPonto(entrada, g, dx, dy);
  const nd = girarDirecao(direcao(u.face, antiga.eixo), g);
  const face = faceDaDirecao(nova, nd);
  const [nu, nv] = paraPlano(nova, face, local(nova, pt));
  return { ...u, face, u: round6(nu), v: round6(nv) };
}

/** Rasgo/recorte: gira os quatro cantos e recompõe o retângulo mínimo no plano novo. */
function girarRetangulo(u: UsinagemResolvida, antiga: GeometriaUsinagem, nova: GeometriaUsinagem, g: Graus, dx: number, dy: number): UsinagemResolvida {
  const cantos: Ponto[] = [
    pontoNoMundo(antiga, u.face, u.u, u.v),
    pontoNoMundo(antiga, u.face, u.u + u.comprimento, u.v),
    pontoNoMundo(antiga, u.face, u.u + u.comprimento, u.v + u.largura),
    pontoNoMundo(antiga, u.face, u.u, u.v + u.largura),
  ].map((c) => girarPonto(c, g, dx, dy));
  const face = faceDaDirecao(nova, girarDirecao(direcao(u.face === 'b' ? 'b' : 'a', antiga.eixo), g));
  const { u: U, v: V } = indices(nova.eixo);
  const locais = cantos.map((c) => local(nova, c));
  const us = locais.map((c) => c[U]!);
  const vs = locais.map((c) => c[V]!);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  return {
    ...u,
    face,
    u: round6(minU),
    v: round6(minV),
    comprimento: round6(maxU - minU),
    largura: round6(maxV - minV),
  };
}

/** Gira todas as usinagens de uma peça junto com ela (mesmo ângulo e translação de `girarPeca`). */
export function girarUsinagens(
  usinagens: readonly UsinagemResolvida[],
  antiga: GeometriaUsinagem,
  nova: GeometriaUsinagem,
  graus: number,
  dx: number,
  dy: number,
): UsinagemResolvida[] {
  const g = normalizar(graus);
  return usinagens.map((u) =>
    u.tipo === 'furo' ? girarFuro(u, antiga, nova, g, dx, dy) : girarRetangulo(u, antiga, nova, g, dx, dy),
  );
}
