import { LIMITES_CORPO, type Perfil } from '@hestia/model';
import type { PerfilResolvido } from './corposTipos.ts';

/*
 * Perfis de seção resolvidos (CONTRATO.md §2.2): cada perfil vira um polígono (u, v) em METROS, com contorno externo
 * anti-horário e furos horários, achatado em `[u0, v0, u1, v1, …]` como pede `PerfilResolvido`.
 * Medidas do texto (mm) passam por `avaliar` e viram metros arredondados a 1 µm, como o resolvedor de peças. Os vértices
 * calculados por trigonometria NÃO são arredondados (senão a área exata do caso N1 perderia a precisão de 1e-9).
 * Nunca lança por entrada do usuário: erro volta como `{ ok: false, erro }` com texto fixo em português.
 */

type Pt = [number, number];
type Avaliar = (expr: string) => number;
type Res<T> = { ok: true; v: T } | { ok: false; erro: string };
type Secao = { externo: Pt[]; furos: Pt[][] };

export type ResultadoPerfil = { ok: true; perfil: PerfilResolvido } | { ok: false; erro: string };

const SEGMENTOS_PADRAO = 32;
const SEGMENTOS_MINIMO = 8;
const SEGMENTOS_MAXIMO = LIMITES_CORPO.segmentosCirculo;
/** Segmentos de cada canto arredondado do retângulo (CONTRATO §2.2). */
const SEGMENTOS_CANTO = 6;
/** Área abaixo disto (em metros quadrados; 1 mm quadrado vale 1e-6) conta como polígono sem área. */
const AREA_MINIMA = 1e-9;

const ERRO = {
  medida: 'perfil: medida deve ser maior que zero',
  invalida: 'perfil: medida inválida (a fórmula não resolve para um número)',
  diametros: 'perfil: diâmetro interno precisa ser menor que o externo',
  espessura: 'perfil: espessura precisa ser menor que metade do menor lado',
  raioNegativo: 'perfil: raio de canto não pode ser negativo',
  raioGrande: 'perfil: raio de canto maior que metade do menor lado',
  segmentos: `perfil: segmentos deve estar entre ${SEGMENTOS_MINIMO} e ${SEGMENTOS_MAXIMO}`,
  poucosPontos: 'perfil: polígono precisa de pelo menos 3 pontos',
  muitosPontos: `perfil: polígono aceita no máximo ${LIMITES_CORPO.pontosPoligono} pontos`,
  semArea: 'perfil: polígono sem área',
  autoInterseccao: 'perfil: polígono se cruza a si mesmo',
  mesa: 'perfil: mesa precisa caber na altura (2 × mesaEsp < altura)',
  alma: 'perfil: alma precisa ser menor que a largura',
  aba: 'perfil: espessura precisa ser menor que as duas abas',
} as const;

/** Resolve um perfil. `avaliar` devolve o valor em mm de uma fórmula (ou a contagem, para `segmentos`). */
export function resolverPerfil(perfil: Perfil, avaliar: Avaliar): ResultadoPerfil {
  const r = secao(perfil, avaliar);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, perfil: { externo: plano(r.v.externo), furos: r.v.furos.map(plano) } };
}

function secao(perfil: Perfil, avaliar: Avaliar): Res<Secao> {
  switch (perfil.tipo) {
    case 'circulo': {
      const d = positiva(avaliar, perfil.diametro);
      if (!d.ok) return d;
      const n = segmentosDe(avaliar, perfil.segmentos);
      if (!n.ok) return n;
      return bem({ externo: ccw(circuloPts(d.v / 2, n.v)), furos: [] });
    }
    case 'anel': {
      const de = positiva(avaliar, perfil.diametroExterno);
      if (!de.ok) return de;
      const di = positiva(avaliar, perfil.diametroInterno);
      if (!di.ok) return di;
      if (di.v >= de.v) return falha(ERRO.diametros);
      const n = segmentosDe(avaliar, perfil.segmentos);
      if (!n.ok) return n;
      return bem({ externo: ccw(circuloPts(de.v / 2, n.v)), furos: [cw(circuloPts(di.v / 2, n.v))] });
    }
    case 'retangulo': {
      const m = positivas(avaliar, { l: perfil.largura, a: perfil.altura });
      if (!m.ok) return m;
      const r = raio(avaliar, perfil.raio);
      if (!r.ok) return r;
      if (r.v > Math.min(m.v.l, m.v.a) / 2) return falha(ERRO.raioGrande);
      const pts = r.v === 0 ? retanguloPts(m.v.l, m.v.a) : retanguloArredondadoPts(m.v.l, m.v.a, r.v);
      return bem({ externo: ccw(pts), furos: [] });
    }
    case 'retanguloOco': {
      const m = positivas(avaliar, { l: perfil.largura, a: perfil.altura, e: perfil.espessura });
      if (!m.ok) return m;
      const { l, a, e } = m.v;
      if (2 * e >= Math.min(l, a)) return falha(ERRO.espessura);
      return bem({ externo: ccw(retanguloPts(l, a)), furos: [cw(retanguloPts(l - 2 * e, a - 2 * e))] });
    }
    case 'poligono':
      return poligono(perfil.pontos, avaliar);
    case 'perfilI': {
      const m = positivas(avaliar, { h: perfil.altura, b: perfil.largura, tw: perfil.almaEsp, tf: perfil.mesaEsp });
      if (!m.ok) return m;
      const { h, b, tw, tf } = m.v;
      const erro = erroMesaAlma(h, b, tw, tf);
      if (erro !== null) return falha(erro);
      const mb = b / 2;
      const mh = h / 2;
      const mw = tw / 2;
      return bem({
        externo: ccw([
          [-mb, -mh], [mb, -mh], [mb, -mh + tf], [mw, -mh + tf], [mw, mh - tf], [mb, mh - tf],
          [mb, mh], [-mb, mh], [-mb, mh - tf], [-mw, mh - tf], [-mw, -mh + tf], [-mb, -mh + tf],
        ]),
        furos: [],
      });
    }
    case 'perfilU': {
      const m = positivas(avaliar, { h: perfil.altura, b: perfil.largura, tw: perfil.almaEsp, tf: perfil.mesaEsp });
      if (!m.ok) return m;
      const { h, b, tw, tf } = m.v;
      const erro = erroMesaAlma(h, b, tw, tf);
      if (erro !== null) return falha(erro);
      const mb = b / 2;
      const mh = h / 2;
      return bem({
        externo: ccw([
          [-mb, -mh], [mb, -mh], [mb, -mh + tf], [-mb + tw, -mh + tf],
          [-mb + tw, mh - tf], [mb, mh - tf], [mb, mh], [-mb, mh],
        ]),
        furos: [],
      });
    }
    case 'perfilL': {
      const m = positivas(avaliar, { a: perfil.abaA, b: perfil.abaB, e: perfil.esp });
      if (!m.ok) return m;
      const { a, b, e } = m.v;
      if (e >= Math.min(a, b)) return falha(ERRO.aba);
      const ma = a / 2;
      const mb = b / 2;
      return bem({
        externo: ccw([[-mb, -ma], [mb, -ma], [mb, -ma + e], [-mb + e, -ma + e], [-mb + e, ma], [-mb, ma]]),
        furos: [],
      });
    }
    case 'perfilT': {
      const m = positivas(avaliar, { h: perfil.altura, b: perfil.largura, tw: perfil.almaEsp, tf: perfil.mesaEsp });
      if (!m.ok) return m;
      const { h, b, tw, tf } = m.v;
      const erro = erroMesaAlma(h, b, tw, tf);
      if (erro !== null) return falha(erro);
      const mb = b / 2;
      const mh = h / 2;
      const mw = tw / 2;
      return bem({
        externo: ccw([
          [-mw, -mh], [mw, -mh], [mw, mh - tf], [mb, mh - tf], [mb, mh], [-mb, mh], [-mb, mh - tf], [-mw, mh - tf],
        ]),
        furos: [],
      });
    }
  }
}

function poligono(pontos: [string, string][], avaliar: Avaliar): Res<Secao> {
  const n = pontos.length;
  if (n < 3) return falha(ERRO.poucosPontos);
  if (n > LIMITES_CORPO.pontosPoligono) return falha(ERRO.muitosPontos);
  const pts: Pt[] = [];
  for (const [xe, ye] of pontos) {
    const x = metros(avaliar, xe);
    if (!x.ok) return x;
    const y = metros(avaliar, ye);
    if (!y.ok) return y;
    pts.push([x.v, y.v]);
  }
  // Antes da área: um "laço de gravata" tem área líquida zero, e o diagnóstico útil é o cruzamento.
  if (cruzaSi(pts)) return falha(ERRO.autoInterseccao);
  if (Math.abs(area(pts)) < AREA_MINIMA) return falha(ERRO.semArea);
  return bem({ externo: ccw(pts), furos: [] });
}

/** Lê uma medida em mm e devolve metros arredondados a 1 µm; falha se a fórmula não der um número finito. */
function metros(avaliar: Avaliar, expr: string): Res<number> {
  let mm: number;
  try {
    mm = avaliar(expr);
  } catch {
    return falha(ERRO.invalida);
  }
  if (!Number.isFinite(mm)) return falha(ERRO.invalida);
  return bem(Math.round(mm * 1000) / 1e6);
}

function positiva(avaliar: Avaliar, expr: string): Res<number> {
  const r = metros(avaliar, expr);
  if (!r.ok) return r;
  return r.v > 0 ? r : falha(ERRO.medida);
}

function positivas<K extends string>(avaliar: Avaliar, campos: Record<K, string>): Res<Record<K, number>> {
  const out = {} as Record<K, number>;
  for (const k of Object.keys(campos) as K[]) {
    const r = positiva(avaliar, campos[k]);
    if (!r.ok) return r;
    out[k] = r.v;
  }
  return bem(out);
}

function raio(avaliar: Avaliar, expr: string | undefined): Res<number> {
  if (expr === undefined) return bem(0);
  const r = metros(avaliar, expr);
  if (!r.ok) return r;
  return r.v < 0 ? falha(ERRO.raioNegativo) : r;
}

function segmentosDe(avaliar: Avaliar, expr: string | undefined): Res<number> {
  if (expr === undefined) return bem(SEGMENTOS_PADRAO);
  let valor: number;
  try {
    valor = avaliar(expr);
  } catch {
    return falha(ERRO.invalida);
  }
  const n = Math.round(valor);
  if (!Number.isFinite(n) || n < SEGMENTOS_MINIMO || n > SEGMENTOS_MAXIMO) return falha(ERRO.segmentos);
  return bem(n);
}

/** Regra comum de I, U e T (CONTRATO §2.2): mesa não pode ocupar a altura toda, e a alma cabe na largura. */
function erroMesaAlma(h: number, b: number, tw: number, tf: number): string | null {
  if (2 * tf >= h) return ERRO.mesa;
  if (tw >= b) return ERRO.alma;
  return null;
}

function circuloPts(r: number, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const angulo = (2 * Math.PI * k) / n;
    pts.push([r * Math.cos(angulo), r * Math.sin(angulo)]);
  }
  return pts;
}

function retanguloPts(largura: number, altura: number): Pt[] {
  const hw = largura / 2;
  const hh = altura / 2;
  return [
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
    [-hw, -hh],
  ];
}

/** Retângulo com os quatro cantos em arcos de SEGMENTOS_CANTO trechos, anti-horário a partir do canto inferior direito. */
function retanguloArredondadoPts(largura: number, altura: number, r: number): Pt[] {
  const hw = largura / 2;
  const hh = altura / 2;
  const cantos: [number, number, number][] = [
    [hw - r, -hh + r, -Math.PI / 2],
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
  ];
  const pts: Pt[] = [];
  for (const [cx, cy, inicio] of cantos) {
    for (let k = 0; k <= SEGMENTOS_CANTO; k++) {
      const angulo = inicio + (Math.PI / 2) * (k / SEGMENTOS_CANTO);
      pts.push([cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]);
    }
  }
  return pts;
}

/** Área com sinal (positiva no anti-horário), pela fórmula de shoelace. */
function area(pts: Pt[]): number {
  let soma = 0;
  pts.forEach(([x1, y1], i) => {
    const p2 = pts[(i + 1) % pts.length];
    if (p2 === undefined) return;
    soma += x1 * p2[1] - p2[0] * y1;
  });
  return soma / 2;
}

function ccw(pts: Pt[]): Pt[] {
  return area(pts) < 0 ? pts.slice().reverse() : pts;
}

function cw(pts: Pt[]): Pt[] {
  return area(pts) > 0 ? pts.slice().reverse() : pts;
}

function plano(pts: Pt[]): number[] {
  return pts.flatMap(([u, v]) => [u, v]);
}

/** Sinal da orientação do trio (p, q, r): +1 anti-horário, -1 horário, 0 colinear. */
function orientacao(p: Pt, q: Pt, r: Pt): number {
  const cruz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return Math.sign(cruz);
}

/** Cruzamento próprio de dois segmentos (ab e cd). Encostar em vértice não conta. */
function cruzam(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return orientacao(a, b, c) * orientacao(a, b, d) < 0 && orientacao(c, d, a) * orientacao(c, d, b) < 0;
}

/** Verdadeiro se alguma aresta não vizinha cruza outra. Laço limitado pelo máximo de pontos do polígono. */
function cruzaSi(pts: Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (c === undefined || d === undefined) continue;
      if (cruzam(a, b, c, d)) return true;
    }
  }
  return false;
}

function bem<T>(v: T): Res<T> {
  return { ok: true, v };
}

function falha(erro: string): { ok: false; erro: string } {
  return { ok: false, erro };
}
