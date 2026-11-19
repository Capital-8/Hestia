import { wallsOnLevel, type Id, type Project } from '@hestia/model';
import type { WallFrame } from './frame.ts';
import { semCortina } from './cortinaProjeto.ts';
import { levelFrames } from './resolveFrames.ts';
import { projetoComParceiras } from './resolveParceiras.ts';
import type { LevelTiltAnalysis, WallTiltJoin } from './wallTiltJoinLevel.ts';

/**
 * Junção inclinada entre níveis: o nível analisa também as paredes parceiras de outros níveis (`resolveParceiras`), mas cada
 * parede continua resolvida só no nível dono. A análise supõe paredes de mesma base: parceira inclinada só entra se alguma
 * parede do nível tem a mesma faixa de cota (base e topo); a vertical parceira entra sempre (o plano dela não muda com a cota).
 */
export const mesmaFaixa = (a: WallFrame, b: WallFrame): boolean => !!a.z && !!b.z && Math.abs(a.z.z0 - b.z.z0) < 1e-6 && Math.abs(a.z.top - b.z.top) < 1e-6;

export function quadrosDaInclinada(p: Project, levelId: Id): { q: Project; donas: Set<Id>; frames: WallFrame[] } {
  const q = projetoComParceiras(p, levelId);
  const donas = new Set(wallsOnLevel(p, levelId).map((w) => w.id));
  const todos = levelFrames(q, levelId).filter((f) => semCortina(q, [f.wall]).length > 0);
  const frames = q === p ? todos : todos.filter((f) => donas.has(f.wall.id) || !f.wall.tilt || todos.some((o) => donas.has(o.wall.id) && mesmaFaixa(o, f)));
  return { q, donas, frames };
}

const memoProprio = new WeakMap<LevelTiltAnalysis, LevelTiltAnalysis>();

/**
 * Só o que é do nível dono: cunhas das paredes do nível e junções de parede vertical só quando toda parceira inclinada tem a
 * mesma faixa de cota dela (a junção supõe base comum: parede vertical mais alta que a parceira inclinada não é refeita).
 * Memorizado pela análise: o Map de junções é estável enquanto a análise vale.
 */
export function proprioDoNivel(an: LevelTiltAnalysis, frames: readonly WallFrame[], donas: ReadonlySet<Id>): LevelTiltAnalysis {
  const hit = memoProprio.get(an);
  if (hit) return hit;
  const inclinadasDeFora = frames.filter((f) => !donas.has(f.wall.id) && f.wall.tilt);
  const joins = new Map<Id, WallTiltJoin>();
  for (const [id, j] of an.joins) {
    const f = frames.find((x) => x.wall.id === id);
    if (!donas.has(id) || !f) continue;
    if (!f.wall.tilt && !inclinadasDeFora.every((o) => mesmaFaixa(o, f))) continue;
    joins.set(id, j);
  }
  const out = { joins, avisos: an.avisos, cunhas: an.cunhas.filter((c) => donas.has(c.wallId)) };
  memoProprio.set(an, out);
  return out;
}
