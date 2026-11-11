import { paredesCortina, servicoCortina, temCortina, ESTILO_PLANTA_CORTINA, PAPEL_PLANTA_CORTINA, type LinhaPlantaCortinaProjeto } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import { mix } from './color.ts';
import { STAIR_DASH } from './stairs.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { FloorOps } from './floors.ts';
import type { DetailLevel } from '@hestia/model';
import type { PlanTheme } from './types.ts';

/** Cota de corte padrão da planta (m acima do nível) quando a vista não traz uma (a mesma das paredes). */
export const CORTINA_CORTE_PADRAO = 1.2;

/** Nível de detalhe da planta (grosseiro, médio, fino) -> argumento `detalhe` de `cortina_planta` (0, 1, 2). */
export const detalheDaCortina = (d: DetailLevel): 0 | 1 | 2 => (d === 'coarse' ? 0 : d === 'fine' ? 2 : 1);

/**
 * Linhas de planta das cortinas de um nível (`cortina_planta`, ADR 0056 §5.6). Sem kernel pronto devolve `null` (a planta desenha só o eixo e o aviso
 * `cortina-sem-kernel` sai pelos avisos do projeto; nunca TypeScript no lugar).
 */
export function linhasCortinaPlanta(p: Project, levelId: Id, cutZ: number | undefined, detalhe: 0 | 1 | 2): LinhaPlantaCortinaProjeto[] | null {
  if (!temCortina(p)) return null;
  const nivel = p.levels.find((l) => l.id === levelId);
  if (!nivel) return null;
  const s = servicoCortina();
  if (!s.pronto()) return null;
  return s.planta(p, levelId, cutZ ?? nivel.elevation + CORTINA_CORTE_PADRAO, detalhe);
}

/** Contorno (planta, anel fechado) de uma parede cortina, para o realce de seleção e de aviso. Vazio sem kernel ou sem linha de contorno. */
export function contornoDaCortina(p: Project, levelId: Id, wallId: Id, cutZ: number | undefined): MultiPolygon {
  const linhas = linhasCortinaPlanta(p, levelId, cutZ, 0);
  const c = linhas?.find((l) => l.wallId === wallId && l.papel === PAPEL_PLANTA_CORTINA.contorno && l.pontos.length >= 4);
  return c ? [[c.pontos.map((q) => ({ x: q.x, y: q.y }))]] : [];
}

/**
 * Cortinas do nível na planta, no estilo da categoria parede: contorno e vidro com o traço de corte (cheio), de projeção (fino) ou de oculto (tracejado,
 * `estilo` 0, 1, 2); montantes cortados e painéis sólidos cortados com preenchimento. Sem o kernel, só o eixo (tracejado) de cada cortina.
 */
export function cortinaOps(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, theme: PlanTheme, dark: boolean, paint: PlanPaint, cutZ: number | undefined, detail: DetailLevel): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (!temCortina(p) || !paint.visible) return out;
  const corte = espessuraDeCorte(paint);
  const projecao = espessuraDeProjecao(paint);
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? theme.ink;
  const suave = mix(theme.ink, base, 0.55);
  const doNivel = paredesCortina(p).filter((c) => c.wall.levelId === levelId && !hidden?.has(c.wall.id));
  const linhas = linhasCortinaPlanta(p, levelId, cutZ, detalheDaCortina(detail));
  if (!linhas) {
    for (const c of doNivel) out.strokes.push({ pts: [{ x: c.wall.a.x, y: c.wall.a.y }, { x: c.wall.b.x, y: c.wall.b.y }], closed: false, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
    return out;
  }
  const visiveis = new Set(doNivel.map((c) => c.wall.id));
  const corMontante = mix(theme.ink, base, 0.25);
  for (const l of linhas) {
    if (!visiveis.has(l.wallId) || l.pontos.length < 2) continue;
    const pts = l.pontos.map((q) => ({ x: q.x, y: q.y }));
    // Só a linha do eixo do vidro do detalhe grosso é aberta; os demais contornos repetem o primeiro ponto no fim.
    const fechado = l.pontos.length > 3 && Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y) < 1e-9;
    if (l.estilo === ESTILO_PLANTA_CORTINA.cortado) {
      if (fechado && (l.papel === PAPEL_PLANTA_CORTINA.montante || l.papel === PAPEL_PLANTA_CORTINA.solido)) {
        out.fills.push({ polygons: [[pts]], color: l.papel === PAPEL_PLANTA_CORTINA.montante ? corMontante : mix(theme.ink, base, 0.6), alpha: 1 });
      }
      out.strokes.push({ pts, closed: fechado, ...(l.papel === PAPEL_PLANTA_CORTINA.vidro ? projecao : corte), color: cor, alpha: 1 });
    } else if (l.estilo === ESTILO_PLANTA_CORTINA.projetado) out.strokes.push({ pts, closed: fechado, ...projecao, color: cor, alpha: 1 });
    else out.strokes.push({ pts, closed: fechado, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
  }
  return out;
}
