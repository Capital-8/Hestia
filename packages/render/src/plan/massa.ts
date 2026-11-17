import { ESTILO_PLANTA_MASSA, MASSA_CORTE_PADRAO, aneisDaMassaNoNivel, contornoDaBase, girarEm, linhasMassaPlanta, massasNaCaixaDaPlanta, massasNaPlanta, pickMassaAt, pontosDaMassaEmPlanta, pontosDoPerfil, semAneisRepetidos, temMassaNoProjeto } from '@hestia/engine';
import { isMass, levelElevation, type Id, type Project } from '@hestia/model';
import { mix } from './color.ts';
import { STAIR_DASH } from './stairs.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { FloorOps } from './floors.ts';
import type { PlanTheme, StrokeOp } from './types.ts';

// A parte sem desenho (quais massas, anel cortado, clique e caixa) mora no motor, porque `tools` também a usa; reexportada aqui.
export {
  MASSA_CORTE_PADRAO,
  aneisDaMassaNoNivel,
  contornoDaBase,
  girarEm,
  linhasMassaPlanta,
  massasNaCaixaDaPlanta as massasNaCaixa,
  massasNaPlanta,
  pickMassaAt,
  pontosDaMassaEmPlanta,
  pontosDoPerfil,
  temMassaNoProjeto,
};

/** Realce de seleção: o anel cortado (ou o contorno da base) das massas selecionadas, na cor de seleção. */
export function massaSelectionOps(p: Project, levelId: Id, selection: readonly Id[], theme: PlanTheme, cutZ?: number): StrokeOp[] {
  if (selection.length === 0) return [];
  const sel = new Set(selection);
  const out: StrokeOp[] = [];
  for (const [id, aneis] of aneisDaMassaNoNivel(p, levelId, cutZ)) {
    if (!sel.has(id)) continue;
    for (const anel of aneis) out.push({ pts: anel, closed: true, widthPx: 3, color: theme.select, alpha: 1 });
  }
  return out;
}

/**
 * Massas da planta: linhas do kernel (cortado forte; projetado fino; acima do corte tracejado, na cor suave). Sem kernel pronto, só o
 * contorno tracejado da base de cada massa do nível, sem lançar. Massa oculta (`hidden`) não sai.
 */
export function massaOps(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, theme: PlanTheme, dark: boolean, paint: PlanPaint, cutZ: number | undefined): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (!paint.visible) return out;
  const corte = espessuraDeCorte(paint);
  const projecao = espessuraDeProjecao(paint);
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? theme.ink;
  const suave = mix(theme.ink, base, 0.55);
  const z = cutZ ?? levelElevation(p, levelId) + MASSA_CORTE_PADRAO;
  const linhas = linhasMassaPlanta(p, levelId, z);
  if (!linhas) {
    for (const m of massasNaPlanta(p, levelId, z)) {
      if (hidden?.has(m.id)) continue;
      for (const anel of contornoDaBase(m)) out.strokes.push({ pts: anel, closed: true, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
    }
    return out;
  }
  for (const l of linhas) {
    if (hidden?.has(l.massaId)) continue;
    const pts = semAneisRepetidos(l.pontos);
    if (pts.length < 2) continue;
    if (l.estilo === ESTILO_PLANTA_MASSA.cortado) out.strokes.push({ pts, closed: true, ...corte, color: cor, alpha: 1 });
    else if (l.estilo === ESTILO_PLANTA_MASSA.projetado) out.strokes.push({ pts, closed: true, ...projecao, color: cor, alpha: 1 });
    else out.strokes.push({ pts, closed: true, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
  }
  return out;
}

/**
 * Massas ocultas na vista: o Hide in View do usuário (menos as reveladas) e, com a categoria desligada, todas as massas do projeto (uma massa
 * de outro nível pode aparecer no nível atual). Não vem da vista do nível: a massa não entra nela.
 */
export function ocultosDaMassa(p: Project, hidden: ReadonlySet<Id> | undefined, revealed: ReadonlySet<Id> | undefined, categoriaVisivel: boolean): ReadonlySet<Id> | undefined {
  const out = new Set<Id>();
  if (hidden) for (const id of hidden) if (!revealed?.has(id)) out.add(id);
  if (!categoriaVisivel) for (const e of Object.values(p.elements)) if (isMass(e)) out.add(e.id);
  return out.size > 0 ? out : undefined;
}
