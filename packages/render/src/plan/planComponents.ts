import type { MultiPolygon, Ring } from '@hestia/geom';
import { caixaDoComponente, pecaNaPlanta, pegadaDoComponente, resolverComponente, type DetalhePlanta, type PecaResolvida } from '@hestia/engine';
import { levelElevation, type Component, type Project } from '@hestia/model';
import { mix } from './color.ts';
import { aneisDosCorpos, anelDaPecaEmPlanta, anelRetangulo, corDoPapel, pontoNoMundo } from './planComponentsGeo.ts';
import { aneisDasPecas, desenharPecasEmPlanta } from './planComponentsPecas.ts';
import { simbolosDePlanta } from './planComponentsSimbolos.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from './types.ts';

/** Cota mínima (m) relativa ao pavimento a partir da qual o móvel é considerado aéreo (projeção tracejada). */
const COTA_AEREO_M = 1.1;

/** Cota mínima e máxima aproximada dos recortes de tampo quando há peça tampo explícita. */
const RECORTE_REGEX = /cuba|cooktop|recorte/i;

function desenharRecorte(
  c: Component,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  strokes: StrokeOp[],
): void {
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return;
  strokes.push({ pts: anelRetangulo(c, x0, y0, x1, y1), closed: true, widthPx: 1, color, alpha: 0.85 });
  const margem = Math.min(0.02, Math.min(x1 - x0, y1 - y0) * 0.15);
  if (x1 - x0 > 2 * margem + 0.04 && y1 - y0 > 2 * margem + 0.04) {
    strokes.push({
      pts: anelRetangulo(c, x0 + margem, y0 + margem, x1 - margem, y1 - margem),
      closed: true,
      widthPx: 0.8,
      color,
      alpha: 0.55,
    });
  }
}

function desenharTamposERecortes(
  c: Component,
  pecas: readonly PecaResolvida[],
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
  sombreado: boolean,
  soRecortes = false,
): void {
  const tampos = pecas.filter((q) => !q.vazio && q.papel === 'tampo');
  const tampoPolys: MultiPolygon = [];
  for (const t of tampos) {
    if (!soRecortes) {
      const ring = anelDaPecaEmPlanta(c, t);
      tampoPolys.push([ring]);
      strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 0.9 });
    }
    if (t.eixo === 'z') {
      const [ox, oy] = t.origem;
      for (const u of t.usinagens) {
        if (u.tipo !== 'recorte') continue;
        desenharRecorte(c, ox + u.u, oy + u.v, ox + u.u + u.comprimento, oy + u.v + u.largura, theme.inkSoft, strokes);
      }
    }
  }
  if (tampoPolys.length > 0) {
    // Sombreado: cor do acabamento do tampo (da primeira peça tampo); senão o tom fixo de antes.
    const corTampo = sombreado ? corDoPapel(c, 'tampo', tampos[0]!.material ?? undefined) : undefined;
    fills.push({ polygons: tampoPolys, color: corTampo ?? mix(theme.bg, '#8c6a4a', 0.14), alpha: corTampo ? 1 : 0.85 });
  }

  // Peças explícitas de recorte/cuba/cooktop ou genéricas sobre o tampo (inclusive peças vazias `vazio: true`).
  const tampoZMin = tampos.length > 0 ? Math.min(...tampos.map((t) => t.origem[2])) - 0.05 : -Infinity;
  for (const q of pecas) {
    const nomeado = RECORTE_REGEX.test(q.id) || RECORTE_REGEX.test(q.nome);
    // Na projeção real a peça genérica é sólida e já foi desenhada; só vazios e peças de recorte seguem como recorte.
    const ehRecorte = q.vazio || nomeado || (q.papel === 'generica' && !soRecortes);
    if (!ehRecorte) continue;
    if (tampos.length > 0 && q.origem[2] + q.extensao[2] < tampoZMin) continue;
    const [ox, oy] = q.origem;
    const [ex, ey] = q.extensao;
    desenharRecorte(c, ox, oy, ox + ex, oy + ey, theme.inkSoft, strokes);
  }
}

function desenharFrentes(c: Component, pecas: readonly PecaResolvida[], color: string, fills: FillOp[], strokes: StrokeOp[], sombreado: boolean, soPuxador = false): void {
  const vistas = new Set<string>();
  for (const q of pecas) {
    if (q.vazio || (q.papel !== 'porta' && q.papel !== 'frente_gaveta')) continue;
    const [ox, oy] = q.origem;
    const [ex, ey] = q.extensao;
    if (ex <= 1e-4 || ey <= 1e-4) continue;
    const chave = `${Math.round(ox * 1e4)}:${Math.round(oy * 1e4)}:${Math.round(ex * 1e4)}:${Math.round(ey * 1e4)}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    if (!soPuxador) {
      const anel = anelRetangulo(c, ox, oy, ox + ex, oy + ey);
      const corFrente = sombreado ? corDoPapel(c, q.papel, q.material ?? undefined) : undefined;
      if (corFrente) fills.push({ polygons: [[anel]], color: corFrente, alpha: 1 });
      strokes.push({ pts: anel, closed: true, widthPx: 0.9, color, alpha: 0.75 });
    }
    const largPux = Math.min(0.12, ex * 0.35);
    if (largPux >= 0.03) {
      const cx = ox + ex / 2;
      const yf = oy - 0.014;
      strokes.push({
        pts: [pontoNoMundo(c, cx - largPux / 2, yf), pontoNoMundo(c, cx + largPux / 2, yf)],
        closed: false,
        widthPx: 0.9,
        color,
        alpha: 0.75,
      });
    }
  }
}

/** Silhueta dos corpos (ficha B3): fill no estilo das peças + contorno; as peças da família, se houver, são desenhadas por cima. */
function desenharSilhuetaDosCorpos(aneis: Ring[], theme: PlanTheme, fills: FillOp[], strokes: StrokeOp[], sombreado: boolean, c: Component): void {
  if (aneis.length === 0) return;
  const cor = sombreado ? corDoPapel(c, 'lateral') : undefined;
  fills.push({ polygons: aneis.map((r) => [r]), color: cor ?? mix(theme.bg, theme.inkSoft, 0.07), alpha: cor ? 1 : 0.85 });
  for (const ring of aneis) strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 1 });
}

/**
 * Geometria automática do componente na planta (projeção das peças e silhueta dos corpos), sem os símbolos.
 * - Aéreo elevado (`zMin >= 1,1 m`): contornos tracejados (`dash: [4, 3]`), sem fill opaco sobre os balcões abaixo.
 * - Piso/torre: contorno sólido + fill sutil, destaque de tampo (`papel === 'tampo'`), recortes/cubas/cooktops e
 *   marcação frontal de portas/gavetas (`papel === 'porta' | 'frente_gaveta'`).
 */
function desenharGeometriaDoComponente(
  p: Project,
  c: Component,
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
  sombreado: boolean,
  fillsAereos: FillOp[],
  detalhe: DetalhePlanta,
  aramado: boolean,
): void {
  const res = resolverComponente(p, c);
  const silhuetas = aneisDosCorpos(c, res, detalhe);
  desenharSilhuetaDosCorpos(silhuetas, theme, fills, strokes, sombreado, c);
  if (res.pecas.length === 0) return;
  const caixa = caixaDoComponente(p, c, res);
  if (!caixa) return;
  const pegada = pegadaDoComponente(p, c, res);
  if (pegada.length === 0) return;

  const visiveis = res.pecas.filter((q) => pecaNaPlanta(q, detalhe));
  const zMinNoNivel = caixa.min[2] - levelElevation(p, c.levelId);
  if (zMinNoNivel >= COTA_AEREO_M) {
    // Aéreo sombreado: véu leve na cor do corpo (alpha 0,25), emitido ANTES dos móveis de piso para nunca cobri-los.
    const corAereo = sombreado ? corDoPapel(c, 'lateral') : undefined;
    if (corAereo) fillsAereos.push({ polygons: pegada, color: corAereo, alpha: 0.25 });
    // Silhueta real tracejada (as peças); no grosseiro ou sem peças visíveis, a pegada.
    const aneis = visiveis.length > 0 ? aneisDasPecas(c, visiveis) : pegada.flat();
    for (const ring of aneis) strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 0.9, dash: [4, 3] });
    return;
  }

  if (visiveis.length > 0) {
    // Projeção real: a pegada só forra o fundo quando há caixa fechada (base, topo ou fundo); mesa, banco e estrutura aberta não.
    if (!aramado && res.pecas.some((q) => !q.vazio && (q.papel === 'base' || q.papel === 'topo' || q.papel === 'fundo'))) {
      const corCorpo = sombreado ? corDoPapel(c, 'lateral') : undefined;
      fills.push({ polygons: pegada, color: corCorpo ?? mix(theme.bg, theme.inkSoft, 0.07), alpha: corCorpo ? 1 : 0.85 });
    }
    desenharPecasEmPlanta(c, visiveis, theme, fills, strokes, sombreado, aramado, detalhe === 'fine');
    desenharFrentes(c, res.pecas, theme.inkSoft, fills, strokes, sombreado, true);
    desenharTamposERecortes(c, res.pecas, theme, fills, strokes, sombreado, true);
    return;
  }

  const corCorpo = sombreado ? corDoPapel(c, 'lateral') : undefined;
  fills.push({ polygons: pegada, color: corCorpo ?? mix(theme.bg, theme.inkSoft, 0.07), alpha: corCorpo ? 1 : 0.85 });
  for (const poly of pegada) {
    for (const ring of poly) {
      strokes.push({ pts: ring, closed: true, widthPx: 1, color: theme.inkSoft, alpha: 1 });
    }
  }
  desenharFrentes(c, res.pecas, theme.inkSoft, fills, strokes, sombreado);
  desenharTamposERecortes(c, res.pecas, theme, fills, strokes, sombreado);
}

/**
 * Desenha um componente na planta: a geometria automática (ver `desenharGeometriaDoComponente`) e os símbolos 2D da família
 * (ficha D2). Um símbolo com `substituiGeometria` que vale na planta tira a geometria automática; os símbolos entram por
 * cima. Os textos dos símbolos vão para `labels`.
 */
export function desenharComponenteEmPlanta(
  p: Project,
  c: Component,
  theme: PlanTheme,
  fills: FillOp[],
  strokes: StrokeOp[],
  sombreado = false,
  fillsAereos: FillOp[] = fills,
  detalhe: DetalhePlanta = 'medium',
  aramado = false,
  labels: LabelOp[] = [],
): void {
  const simb = simbolosDePlanta(p, c, theme.inkSoft, detalhe);
  labels.push(...simb.labels);
  if (!simb.substituiGeometria) desenharGeometriaDoComponente(p, c, theme, fills, strokes, sombreado, fillsAereos, detalhe, aramado);
  strokes.push(...simb.strokes);
}

/** Gera fills, strokes e textos (símbolos) de todos os componentes visíveis do nível para `build.ts`. */
export function componentsPlanOps(
  p: Project,
  levelId: string,
  theme: PlanTheme,
  hidden: ReadonlySet<string> | undefined,
  sombreado = false,
  detalhe: DetalhePlanta = 'medium',
  aramado = false,
): { fills: FillOp[]; strokes: StrokeOp[]; labels: LabelOp[] } {
  const fills: FillOp[] = [];
  const aereos: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  const labels: LabelOp[] = [];
  for (const e of Object.values(p.elements)) {
    if (e.kind === 'component' && e.levelId === levelId && !hidden?.has(e.id)) {
      desenharComponenteEmPlanta(p, e, theme, fills, strokes, sombreado, aereos, detalhe, aramado, labels);
    }
  }
  return { fills: [...aereos, ...fills], strokes, labels };
}
