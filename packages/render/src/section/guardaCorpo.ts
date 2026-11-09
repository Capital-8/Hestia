import { guardaCorpoNoPonto, planoDaSecao, servicoGuardaCorpo, ServicoGuardaCorpo, type SectionResult } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { mix } from '../plan/color.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { FillOp, PlanTheme, StrokeOp } from '../plan/types.ts';

/**
 * Guarda-corpos no corte e na elevacao (decisao 0055): as linhas vem do kernel (`guarda_corte`) em coordenadas (s, z) do plano da vista, as mesmas do
 * resto do desenho. Peca cortada: contorno pesado e preenchimento claro; peca projetada: contorno fino. Sem kernel pronto nao desenha.
 */
export function guardaCorpoCorteOps(p: Project, s: SectionResult, theme: PlanTheme, dark: boolean, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, fills: FillOp[], strokes: StrokeOp[]): void {
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
  for (const l of r.linhas) {
    if (hidden?.has(l.guardaId) || l.pontos.length < 2) continue;
    const pts = l.pontos.map((q) => ({ x: q.x, y: q.y }));
    if (l.estilo === 0) {
      if (pts.length >= 3) fills.push({ polygons: [[pts]], color: mix(cor, base, 0.7), alpha: 1 });
      strokes.push({ pts, closed: true, ...paint.cut, color: cor, alpha: 1 });
    } else {
      strokes.push({ pts, closed: true, ...paint.proj, color: fraco, alpha: 1 });
    }
  }
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
