import { servicoGuardaCorpo, ServicoGuardaCorpo } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { mix } from './color.ts';
import { STAIR_DASH } from './stairs.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { FloorOps } from './floors.ts';
import type { PlanTheme } from './types.ts';

/** Cota de corte padrao da planta (m acima do nivel) quando a vista nao traz uma. */
export const GUARDA_CORPO_CORTE_PADRAO = 1.2;

/**
 * Guarda-corpos do nivel na planta (decisao 0055): as linhas vem do kernel (`guarda_planta`): o eixo e, nas pecas, o contorno cortado
 * (cheio, traco de corte), projetado (traco fino) ou oculto (tracejado). Sem kernel pronto nao desenha nada (nunca TypeScript no lugar).
 */
export function guardaCorpoOps(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, theme: PlanTheme, dark: boolean, paint: PlanPaint, cutZ: number | undefined): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (!ServicoGuardaCorpo.temGuardaCorpo(p)) return out;
  const nivel = p.levels.find((l) => l.id === levelId);
  if (!nivel) return out;
  const linhas = servicoGuardaCorpo().planta(p, levelId, cutZ ?? nivel.elevation + GUARDA_CORPO_CORTE_PADRAO, 1);
  if (!linhas) return out;
  const corte = espessuraDeCorte(paint);
  const projecao = espessuraDeProjecao(paint);
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? mix(theme.ink, base, 0.15);
  const suave = mix(theme.ink, base, 0.55);
  for (const l of linhas) {
    const e = p.elements[l.guardaId];
    if (!e || e.kind !== 'railing' || e.levelId !== levelId || hidden?.has(l.guardaId)) continue;
    const pts = l.pontos.map((q) => ({ x: q.x, y: q.y }));
    if (pts.length < 2) continue;
    if (l.papel === 255) out.strokes.push({ pts, closed: false, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
    else if (l.estilo === 0) out.strokes.push({ pts, closed: true, ...corte, color: cor, alpha: 1 });
    else if (l.estilo === 1) out.strokes.push({ pts, closed: true, ...projecao, color: cor, alpha: 1 });
    else out.strokes.push({ pts, closed: true, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
  }
  return out;
}
