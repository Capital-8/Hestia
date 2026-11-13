import { guardaCorpoNoPonto, guardaCorposNaCaixa, linhasVisiveisGC, planoDaSecao, servicoGuardaCorpo, ServicoGuardaCorpo, type SectionResult } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { mix } from '../plan/color.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { FillOp, PlanTheme, StrokeOp } from '../plan/types.ts';

type Pt = { x: number; y: number };

/**
 * Guarda-corpos no corte e na elevacao (decisao 0055): as linhas vem do kernel (`guarda_corte`) em coordenadas (s, z) do plano da vista, as mesmas do
 * resto do desenho. Peca cortada: contorno pesado e preenchimento claro; peca projetada: contorno fino. Sem kernel pronto nao desenha.
 */
export function guardaCorpoCorteOps(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  dark: boolean,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  fills: FillOp[],
  strokes: StrokeOp[],
  reveal?: { revelados: ReadonlySet<Id> | undefined; contorno: (pts: Pt[]) => void },
  /** Seleção e cursor da vista: o guarda-corpo selecionado leva a cor de seleção, como parede e escada (decisão 0016). */
  highlight?: { selection: readonly Id[]; hover: Id | null },
): void {
  if (!paint.visible || !ServicoGuardaCorpo.temGuardaCorpo(p)) return;
  const plano = planoDaSecao(s);
  if (!plano) return;
  const dx = plano.b.x - plano.a.x;
  const dy = plano.b.y - plano.a.y;
  const r = servicoGuardaCorpo().corte(p, null, plano.a.x, plano.a.y, dx, dy, plano.depth);
  if (!r) return;
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? theme.ink;
  const fraco = mix(cor, base, 0.45);
  // Realce por cima de todas as linhas do guarda-corpo (as peças dele são muitas: o realce sai depois do laço).
  const selecionados = new Set<Id>(highlight?.selection ?? []);
  const realceFills: FillOp[] = [];
  const realceStrokes: StrokeOp[] = [];
  for (const l of r.linhas) {
    if (hidden?.has(l.guardaId) || l.pontos.length < 2) continue;
    const pts = l.pontos.map((q) => ({ x: q.x, y: q.y }));
    if (l.estilo === 0) {
      if (pts.length >= 3) fills.push({ polygons: [[pts]], color: mix(cor, base, 0.7), alpha: 1 });
      strokes.push({ pts, closed: true, ...paint.cut, color: cor, alpha: 1 });
    } else {
      strokes.push({ pts, closed: true, ...paint.proj, color: fraco, alpha: 1 });
    }
    // Reveal: o contorno azul do guarda-corpo revelado sai por cima (o desenho normal continua).
    if (reveal?.revelados?.has(l.guardaId)) reveal.contorno(pts);
    if (selecionados.has(l.guardaId)) {
      if (pts.length >= 3 && l.papel !== 255) realceFills.push({ polygons: [[pts]], color: theme.select, alpha: 0.25 });
      realceStrokes.push({ pts, closed: l.papel !== 255, widthPx: 2, color: theme.select, alpha: 1 });
    } else if (highlight?.hover === l.guardaId) {
      realceStrokes.push({ pts, closed: l.papel !== 255, widthPx: 1.5, color: theme.select, alpha: 0.55 });
    }
  }
  fills.push(...realceFills);
  strokes.push(...realceStrokes);
}

/** Guarda-corpos que aparecem no desenho do corte ou da elevação (visíveis, fora os ocultos da vista). */
export function guardaCorposVisiveisNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined): Id[] {
  if (!ServicoGuardaCorpo.temGuardaCorpo(p)) return [];
  const plano = planoDaSecao(s);
  if (!plano) return [];
  const r = servicoGuardaCorpo().corte(p, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
  return r ? [...new Set(linhasVisiveisGC(r.linhas, hidden ?? new Set<Id>()).map((l) => l.guardaId))] : [];
}

/** Guarda-corpos que a caixa de seleção do corte pega (coordenadas (t,z)): janela = todas as peças dentro; cruzamento = alguma peça toca a caixa. */
export function guardaCorpoNaCaixaDoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, a: Pt, b: Pt): Id[] {
  if (!ServicoGuardaCorpo.temGuardaCorpo(p)) return [];
  const plano = planoDaSecao(s);
  if (!plano) return [];
  const r = servicoGuardaCorpo().corte(p, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
  return r ? guardaCorposNaCaixa(r.linhas, hidden ?? new Set<Id>(), a, b) : [];
}

/**
 * Guarda-corpo sob o ponto (s, z) do corte ou da elevacao: usa as mesmas linhas desenhadas (`guarda_corte`), pelo `guardaCorpoNoPonto` das vistas.
 * Oculto ou isolado fora nao e alvo. Null sem kernel pronto ou fora do desenho.
 */
export function pickGuardaCorpoNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, point: { x: number; y: number }, tolerance: number): Id | null {
  if (!ServicoGuardaCorpo.temGuardaCorpo(p)) return null;
  const plano = planoDaSecao(s);
  if (!plano) return null;
  const r = servicoGuardaCorpo().corte(p, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
  return r ? guardaCorpoNoPonto(r.linhas, hidden ?? new Set<Id>(), point, tolerance) : null;
}
