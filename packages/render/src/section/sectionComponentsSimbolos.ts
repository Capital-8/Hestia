import type { Vec2 } from '@hestia/geom';
import { resolverComponente, type DetalhePlanta } from '@hestia/engine';
import { levelElevation, type Component, type PlanoSimbolo, type Project } from '@hestia/model';
import { detalheDoSimbolo, geometriaDoSimbolo, rotuloDeTexto, simboloNoDetalhe } from '../plan/planComponentsSimbolos.ts';
import { pontoNoMundo } from '../plan/planComponentsGeo.ts';
import type { LabelOp, StrokeOp } from '../plan/types.ts';

/*
 * Símbolos 2D dos componentes no corte e na elevação (ficha D2, CONTRATO §4). A linha de corte define o plano: se ela corre
 * ao longo de X, o plano é `xz` (elevação frontal e corte paralelo a XZ); se corre ao longo de Y, é `yz`. Só os símbolos
 * desse plano entram. Um símbolo `xz` vive no plano y = 0 da família e um `yz` no plano x = 0; cada ponto vai ao mundo pela
 * instância (rotação e espelho) e depois a (t, z) da linha: t ao longo dela a partir de `a`, z a cota (nível + altura do
 * componente + z local). Sem recorte por profundidade nesta versão: o símbolo sai inteiro, desde que caia dentro do vão t.
 */

export interface SimbolosDeCorte {
  strokes: StrokeOp[];
  labels: LabelOp[];
}

const VAZIO: SimbolosDeCorte = { strokes: [], labels: [] };
/** Tolerância para considerar a linha paralela a um eixo (m). */
const EIXO_TOL = 1e-9;
/** Folga (m) além do vão t para não cortar um símbolo na borda. */
const FOLGA_T = 1e-6;

/** Plano do símbolo que vale para esta linha, ou `null` quando a linha é oblíqua aos eixos. */
export function planoDaLinha(a: Vec2, b: Vec2): { plano: PlanoSimbolo; d: Vec2 } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp < EIXO_TOL) return null;
  const d = { x: dx / comp, y: dy / comp };
  if (Math.abs(d.y) < EIXO_TOL) return { plano: 'xz', d };
  if (Math.abs(d.x) < EIXO_TOL) return { plano: 'yz', d };
  return null;
}

/**
 * Símbolos de um componente na linha de corte/elevação `a`→`b`, já em (t, z) do corte. `largura` é o traço da categoria de
 * componentes (o mesmo estilo que a build já usa para os símbolos). Um símbolo sai só se algum ponto cai no vão t [0, comprimento].
 */
export function simbolosDoCorte(
  p: Project,
  c: Component,
  linha: { a: Vec2; b: Vec2 },
  cor: string,
  largura: { widthPx: number; papel?: StrokeOp['papel'] },
  detalhe: DetalhePlanta,
): SimbolosDeCorte {
  const eixo = planoDaLinha(linha.a, linha.b);
  if (!eixo) return VAZIO;
  const { plano, d } = eixo;
  const vao = Math.hypot(linha.b.x - linha.a.x, linha.b.y - linha.a.y);
  const elevacao = levelElevation(p, c.levelId) + c.z;
  const res = resolverComponente(p, c);
  const visiveis = (res.simbolos ?? []).filter(
    (s) => (s.vistas.includes('corte') || s.vistas.includes('elevacao')) && s.plano === plano && simboloNoDetalhe(detalheDoSimbolo(p, c, s.id), detalhe),
  );
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  for (const s of visiveis) {
    const paraSecao = (u: number, v: number): Vec2 => {
      const [fx, fy, fz] = plano === 'xz' ? [u, 0, v] : [0, u, v];
      const w = pontoNoMundo(c, fx, fy);
      return { x: (w.x - linha.a.x) * d.x + (w.y - linha.a.y) * d.y, y: elevacao + fz };
    };
    const g = geometriaDoSimbolo(s, paraSecao);
    const ts = [...g.strokes.flatMap((t) => t.pts.map((q) => q.x)), ...g.textos.map((t) => t.at.x)];
    if (ts.length === 0 || Math.max(...ts) < -FOLGA_T || Math.min(...ts) > vao + FOLGA_T) continue;
    for (const traco of g.strokes) {
      strokes.push({ pts: traco.pts, closed: traco.closed, widthPx: largura.widthPx, ...(largura.papel ? { papel: largura.papel } : {}), color: cor, alpha: 1 });
    }
    for (const t of g.textos) labels.push(rotuloDeTexto(t.at, t.texto, t.altura, cor, 0));
  }
  return { strokes, labels };
}
