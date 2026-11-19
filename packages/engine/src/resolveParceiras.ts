import { levelElevation, wallBaseElevation, wallMaxHeight, wallThicknessOf, wallType, wallsOnLevel, type Id, type Project, type Wall } from '@hestia/model';

/**
 * Junção entre níveis. As junções são resolvidas por nível; uma parede de outro nível que cobre a mesma faixa de altura
 * nunca era parceira. Aqui o nível L ganha PARCEIRAS: paredes de outros níveis cuja faixa de altura (nominal, estrita)
 * se sobrepõe à de alguma parede de L e cuja caixa em planta encosta na dela. Elas entram na resolução de L como paredes
 * do nível (mesma base e topo, `baseOffset` compensa a troca de nível, como `projetoDaPlanta`), só para a junção; o
 * resultado é filtrado depois e cada parede continua sendo resolvida e desenhada uma vez, no nível dono.
 * Fora: parede com `attachBottomToFloor` ou `attachTopToRoof` (a cota depende do nível dono, como em `wallsCrossingCut`).
 * A seleção é um superset barato; quem decide a junção de fato é `computeEnds`, com a cota real (`withWallZ`).
 */
const EPS = 1e-9;

interface Caixa { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; }

/** Folga vertical de quem tem anexo (a cota real sai de piso, laje ou telhado): piso/laje até 1 m; telhado, o topo sobe até 10 m. */
const folgaZ = (w: Wall): { baixo: number; cima: number } => ({
  baixo: w.attachBottomToFloor === true ? 1 : 0,
  cima: w.attachTopToRoof === true ? 10 : w.attachTopToFloor === true ? 1 : 0,
});

/** Faixa vertical nominal com a folga dos anexos (sem tipo de parede: barata, serve de primeira peneira). */
function faixaZ(p: Project, w: Wall): [number, number] {
  const base = wallBaseElevation(p, w);
  const top = base + wallMaxHeight(p, w);
  return [Math.min(base, top) - folgaZ(w).baixo, Math.max(base, top) + folgaZ(w).cima];
}

function caixaDe(p: Project, w: Wall, z: [number, number]): Caixa {
  const m = wallThicknessOf(wallType(p, w)) / 2 + Math.abs(w.sag) + (p.settings?.joinTolerance ?? 0.02) + 0.01;
  return { x0: Math.min(w.a.x, w.b.x) - m, y0: Math.min(w.a.y, w.b.y) - m, x1: Math.max(w.a.x, w.b.x) + m, y1: Math.max(w.a.y, w.b.y) + m, z0: z[0], z1: z[1] };
}

const semAnexoDoDono = (w: Wall): boolean => w.attachBottomToFloor !== true && w.attachTopToRoof !== true;

const memoParceiras = new WeakMap<Project, Map<Id, Wall[]>>();

/** Paredes de outros níveis que são parceiras de junção do nível (ordem de criação). Memorizada por projeto e nível. */
export function paredesParceiras(p: Project, levelId: Id): Wall[] {
  let porNivel = memoParceiras.get(p);
  if (!porNivel) memoParceiras.set(p, (porNivel = new Map()));
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const donas = wallsOnLevel(p, levelId);
  const out: Wall[] = [];
  if (donas.length > 0 && p.levels.some((l) => l.id === levelId)) {
    const caixas = donas.map((w) => caixaDe(p, w, faixaZ(p, w)));
    const todas: Caixa = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const d of caixas) {
      todas.x0 = Math.min(todas.x0, d.x0); todas.y0 = Math.min(todas.y0, d.y0); todas.z0 = Math.min(todas.z0, d.z0);
      todas.x1 = Math.max(todas.x1, d.x1); todas.y1 = Math.max(todas.y1, d.y1); todas.z1 = Math.max(todas.z1, d.z1);
    }
    const encosta = (c: Caixa, d: Caixa): boolean => c.x0 <= d.x1 && d.x0 <= c.x1 && c.y0 <= d.y1 && d.y0 <= c.y1 && c.z0 < d.z1 - EPS && d.z0 < c.z1 - EPS;
    for (const w of Object.values(p.elements)) {
      if (w.kind !== 'wall' || w.levelId === levelId || !semAnexoDoDono(w)) continue;
      // Peneira vertical primeiro (sem consultar o tipo); nível ausente (projeto reduzido da junção) não fornece parceira.
      if (!p.levels.some((l) => l.id === w.levelId)) continue;
      const z = faixaZ(p, w);
      if (z[0] >= todas.z1 - EPS || todas.z0 >= z[1] - EPS) continue;
      const c = caixaDe(p, w, z);
      if (encosta(c, todas) && caixas.some((d) => encosta(c, d))) out.push(w);
    }
    out.sort((a, b) => a.order - b.order);
  }
  porNivel.set(levelId, out);
  return out;
}

const memoProjeto = new WeakMap<Project, Map<Id, Project>>();

/** Projeto em que as parceiras do nível entram como paredes dele; sem parceira devolve o próprio projeto. */
export function projetoComParceiras(p: Project, levelId: Id): Project {
  let porNivel = memoProjeto.get(p);
  if (!porNivel) memoProjeto.set(p, (porNivel = new Map()));
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const parceiras = paredesParceiras(p, levelId);
  let out = p;
  if (parceiras.length > 0) {
    const elements = { ...p.elements };
    const elev = levelElevation(p, levelId);
    for (const w of parceiras) elements[w.id] = { ...w, levelId, baseOffset: wallBaseElevation(p, w) - elev };
    out = { ...p, elements };
  }
  porNivel.set(levelId, out);
  return out;
}

/**
 * Resolve o nível com as parceiras de outros níveis e devolve só o que é do nível dono. A planta (`cutZ` definido) fica de
 * fora: lá quem cruza o corte já entra por `projetoDaPlanta`, e parceira que não cruza não pode aparecer na hachura.
 * `calcular` recebe o projeto com as parceiras (o TypeScript ou o despacho do Rust: os dois enxergam as mesmas paredes).
 */
export function resolverComParceiras<R extends { walls: Record<Id, unknown>; clusters: Array<{ wallIds: Id[] }> }>(
  p: Project,
  levelId: Id,
  cutZ: number | undefined,
  calcular: (q: Project) => R,
): R {
  const q = cutZ === undefined ? projetoComParceiras(p, levelId) : p;
  const r = calcular(q);
  if (q === p) return r;
  const donas = new Set(wallsOnLevel(p, levelId).map((w) => w.id));
  const walls: Record<Id, unknown> = {};
  for (const [id, w] of Object.entries(r.walls)) if (donas.has(id)) walls[id] = w;
  const clusters = r.clusters
    .filter((c) => c.wallIds.some((id) => donas.has(id)))
    .map((c) => (c.wallIds.every((id) => donas.has(id)) ? c : { ...c, wallIds: c.wallIds.filter((id) => donas.has(id)) }));
  return { ...r, walls, clusters } as R;
}
