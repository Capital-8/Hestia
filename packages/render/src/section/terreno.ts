import { guardaCorpoNoPonto, guardaCorposNaCaixa, linhasVisiveisGC, planoDaSecao, servicoTerreno, ServicoTerreno, type LinhaCorteTN, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import type { HatchKind, Id, Project, Terrain } from '@hestia/model';
import { mix } from '../plan/color.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { FillOp, PlanTheme, StrokeOp } from '../plan/types.ts';

type Pt = { x: number; y: number };

/** Cor do solo sem material nem cor própria (a mesma do 3D). */
export const COR_PADRAO_TERRENO = '#b5a27a';
/** [traço, vão] do perfil do terreno existente (papel 1), em px. */
export const TRACO_PERFIL_EXISTENTE: [number, number] = [6, 4];

/**
 * Terreno no corte e na elevação (ficha V3): as linhas vêm do kernel (`terreno_corte`) em `(s, z)` do plano da vista, as mesmas coordenadas do resto
 * do desenho, e o mecanismo é o do guarda-corpo (`section/guardaCorpo.ts`): camada própria fora do `SectionResult`, visibilidade pelo `hidden` e
 * pela categoria, seleção e realce sobre as mesmas linhas desenhadas. Nenhum caminho TS gera o perfil: sem kernel pronto nada é desenhado. O lote
 * não entra, e a região só altera o perfil (superfície proposta); nenhuma das duas é desenhada como elemento.
 * Papel 0 (cortado): contorno de corte da categoria `site` e preenchimento (hachura do material, senão cor sólida); papel 1 (perfil existente):
 * tracejado fino; papel 2 (silhueta): linha fina.
 */

/** Como a vista pinta (vêm do desenho do corte: arame e detalhe grosso sem preenchimento, hachura com o zoom mínimo, meio-tom da categoria). */
export interface OpcoesTerrenoCorte {
  noFill: boolean;
  hatchFor: (kind: HatchKind | undefined, color: string) => FillOp['hatch'];
  halftone: (color: string, paint: PlanPaint) => string;
}

export interface OpsTerrenoCorte {
  fills: FillOp[];
  strokes: StrokeOp[];
  /** Contorno azul do modo Reveal, para entrar depois do desenho (como o das outras categorias). */
  reveal: StrokeOp[];
}

const ORDEM_PAPEL = { silhueta: 0, perfilExistente: 1, cortado: 2 } as const;

/**
 * Linhas do terreno visíveis no plano da vista: vazias sem terreno no projeto, sem plano, sem kernel pronto ou com o terreno oculto. O corte não
 * depende do nível: todo terreno do projeto aparece. Ordenadas do mais longe ao mais perto (silhueta, perfil existente, cortado).
 */
export function linhasDoTerrenoNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined): LinhaCorteTN[] {
  if (!ServicoTerreno.temTerreno(p)) return [];
  const plano = planoDaSecao(s);
  if (!plano) return [];
  const r = servicoTerreno().corte(p, { x: plano.a.x, y: plano.a.y }, { x: plano.b.x - plano.a.x, y: plano.b.y - plano.a.y }, plano.depth, null);
  if (!r) return [];
  return r.filter((l) => l.pontos.length >= 2 && !hidden?.has(l.terrenoId)).sort((a, b) => ORDEM_PAPEL[a.papel] - ORDEM_PAPEL[b.papel]);
}

const emPlano = (l: LinhaCorteTN): Pt[] => l.pontos.map((q) => ({ x: q.s, y: q.z }));

/**
 * Desenho do terreno no corte e na elevação, para ir ANTES dos elementos do edifício (fica atrás). `paint` é o da categoria `site`; com ela
 * desligada nada sai.
 */
export function terrenoCorteOps(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  dark: boolean,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  opcoes: OpcoesTerrenoCorte,
  revelados?: ReadonlySet<Id>,
): OpsTerrenoCorte {
  const out: OpsTerrenoCorte = { fills: [], strokes: [], reveal: [] };
  if (!paint.visible) return out;
  const papel = dark ? theme.bg : '#ffffff';
  const { noFill, hatchFor, halftone } = opcoes;
  for (const l of linhasDoTerrenoNoCorte(p, s, hidden)) {
    const pts = emPlano(l);
    const t = p.elements[l.terrenoId] as Terrain | undefined;
    const material = t?.materialId ? p.materials[t.materialId] : undefined;
    const base = paint.color ?? material?.color ?? t?.color ?? COR_PADRAO_TERRENO;
    if (l.papel === 'cortado') {
      if (!noFill && pts.length >= 3) {
        const cor = paint.visual === 'shaded' ? base : mix(base, papel, dark ? 0.5 : 0.58);
        const hatch = hatchFor(material?.hatch, halftone(mix(base, dark ? '#ffffff' : '#000000', 0.45), paint));
        out.fills.push({ polygons: [[pts]], color: halftone(cor, paint), alpha: paint.alpha, hatch });
      }
      out.strokes.push({ pts, closed: true, ...paint.cut, color: halftone(paint.color ?? mix(theme.ink, papel, 0.35), paint), alpha: 1 });
    } else if (l.papel === 'perfilExistente') {
      out.strokes.push({ pts, closed: false, ...paint.proj, color: halftone(mix(paint.color ?? theme.ink, papel, 0.45), paint), alpha: 1, dash: TRACO_PERFIL_EXISTENTE });
    } else {
      out.strokes.push({ pts, closed: false, ...paint.proj, color: halftone(mix(paint.color ?? theme.ink, papel, 0.2), paint), alpha: 1 });
    }
    if (revelados?.has(l.terrenoId)) out.reveal.push({ pts, closed: l.papel === 'cortado', widthPx: 2, color: '#2563eb', alpha: 1 });
  }
  return out;
}

/** Realce do terreno selecionado ou sob o cursor (decisão 0016): contorno na cor de seleção, e preenchimento 0,25 no solo cortado. Vai por último. */
export function terrenoCorteRealce(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  highlight: { selection: readonly Id[]; hover: Id | null } | undefined,
): { fills: FillOp[]; strokes: StrokeOp[] } {
  const out = { fills: [] as FillOp[], strokes: [] as StrokeOp[] };
  if (!paint.visible || !highlight || (highlight.selection.length === 0 && highlight.hover === null)) return out;
  const selecionados = new Set<Id>(highlight.selection);
  for (const l of linhasDoTerrenoNoCorte(p, s, hidden)) {
    const pts = emPlano(l);
    const fechada = l.papel === 'cortado';
    if (selecionados.has(l.terrenoId)) {
      if (fechada && pts.length >= 3) out.fills.push({ polygons: [[pts]], color: theme.select, alpha: 0.25 });
      out.strokes.push({ pts, closed: fechada, widthPx: 2, color: theme.select, alpha: 1 });
    } else if (highlight.hover === l.terrenoId) {
      out.strokes.push({ pts, closed: fechada, widthPx: 1.5, color: theme.select, alpha: 0.55 });
    }
  }
  return out;
}

/** As linhas do terreno no formato das do guarda-corpo, para usar a mesma seleção: o solo cortado é peça fechada (papel 0), o resto polilinha (255). */
function comoLinhasVista(ls: readonly LinhaCorteTN[]): LinhaVistaGC[] {
  return ls.map((l) => ({ guardaId: l.terrenoId, papel: l.papel === 'cortado' ? 0 : 255, estilo: l.papel === 'cortado' ? 0 : 1, pontos: emPlano(l) }));
}

/**
 * Terreno sob o ponto (s, z) do corte ou da elevação: o solo cortado vale no interior e na borda; o perfil existente e a silhueta, pela distância à
 * linha (`tolerance`, em unidades do desenho). Oculto ou categoria desligada não é alvo. Quem chama deve preferir o elemento do edifício a este.
 */
export function pickTerrenoNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, point: Pt, tolerance: number): Id | null {
  if (!paint.visible) return null;
  return guardaCorpoNoPonto(comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)), new Set<Id>(), point, tolerance);
}

/** Terrenos visíveis no desenho do corte ou da elevação (sem repetição). */
export function terrenosVisiveisNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint): Id[] {
  if (!paint.visible) return [];
  return [...new Set(linhasVisiveisGC(comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)), new Set<Id>()).map((l) => l.guardaId))];
}

/**
 * Terrenos que a caixa de seleção pega (coordenadas (s, z)): janela (`b.x >= a.x`) = todas as linhas dele dentro; cruzamento = alguma linha toca a caixa.
 * A seleção do guarda-corpo ignora polilinhas abertas; aqui o perfil e a silhueta entram como polígono de área nula (ida e volta), que tem as mesmas
 * arestas e vértices.
 */
export function terrenosNaCaixaDoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, a: Pt, b: Pt): Id[] {
  if (!paint.visible) return [];
  const linhas = comoLinhasVista(linhasDoTerrenoNoCorte(p, s, hidden)).map((l): LinhaVistaGC => (l.papel === 0 ? l : { ...l, papel: 0, pontos: [...l.pontos, ...l.pontos.slice(1, -1).reverse()] }));
  return guardaCorposNaCaixa(linhas, new Set<Id>(), a, b);
}
