import { DEFAULT_JOIN_TOL } from './joins.ts';
import { registrarProjetoBase } from './projetoBase.ts';
import { zRealDe } from './wallFrameZ.ts';
import { levelElevation, wallBaseElevation, wallMaxHeight, wallThicknessOf, wallType, wallsCrossingCut, wallsOnLevel, type Id, type Project, type Wall } from '@hestia/model';

/**
 * Junção entre níveis. As junções são resolvidas por nível; uma parede de outro nível que cobre a mesma faixa de altura
 * nunca era parceira. Aqui o nível L ganha PARCEIRAS: paredes de outros níveis cuja faixa de altura (nominal, estrita)
 * se sobrepõe à de alguma parede de L e cuja caixa em planta encosta na dela. Elas entram na resolução de L como paredes
 * do nível (mesma base e topo, `baseOffset` compensa a troca de nível, como `projetoDaPlanta`), só para a junção; o
 * resultado é filtrado depois e cada parede continua sendo resolvida e desenhada uma vez, no nível dono.
 * Parceira com anexo (`attachBottomToFloor`, `attachTopToFloor`, `attachTopToRoof`): a faixa REAL vem de `wallZRange`
 * (`zRealDe`); entra promovida SEM anexos (base e altura já resolvidas), porque o anexo depende do nível dono. Em resolução
 * reentrante (pisos, lajes, telhados) a parceira com anexo fica de fora: sem ciclo.
 * Sobreposição vertical real menor ou igual à tolerância de junção do projeto (2 cm) conta como encosto e NÃO une.
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

/** Faixa nominal, sem folga de anexo (modo leve). */
const nominalZ = (p: Project, w: Wall): [number, number] => {
  const b = wallBaseElevation(p, w);
  const t = b + wallMaxHeight(p, w);
  return [Math.min(b, t), Math.max(b, t)];
};

const comAnexo = (w: Wall): boolean => w.attachBottomToFloor === true || w.attachTopToFloor === true || w.attachTopToRoof === true;

/** Parceira com anexo: a base e a altura reais (resolvidas) que a promoção usa no lugar dos anexos. */
const zResolvido = new WeakMap<Wall, { z0: number; height: number }>();

const memoParceiras = new WeakMap<Project, Map<Id, Wall[]>>();
const memoLeve = new WeakMap<Project, Map<Id, Wall[]>>();

/** Paredes de outros níveis que são parceiras de junção do nível (ordem de criação). Memorizada por projeto e nível. */
export function paredesParceiras(p: Project, levelId: Id, leve = false): Wall[] {
  const memoDe = leve ? memoLeve : memoParceiras;
  let porNivel = memoDe.get(p);
  if (!porNivel) memoDe.set(p, (porNivel = new Map()));
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const donas = wallsOnLevel(p, levelId);
  const out: Wall[] = [];
  let reentrante = false;
  if (donas.length > 0 && p.levels.some((l) => l.id === levelId)) {
    const caixas = donas.map((w) => caixaDe(p, w, faixaZ(p, w)));
    const todas: Caixa = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const d of caixas) {
      todas.x0 = Math.min(todas.x0, d.x0); todas.y0 = Math.min(todas.y0, d.y0); todas.z0 = Math.min(todas.z0, d.z0);
      todas.x1 = Math.max(todas.x1, d.x1); todas.y1 = Math.max(todas.y1, d.y1); todas.z1 = Math.max(todas.z1, d.z1);
    }
    // `tz`: sobreposição vertical mínima. Peneiras usam EPS; a decisão final usa a tolerância de junção (≤ 2 cm é encosto, não une).
    const encosta = (c: Caixa, d: Caixa, tz = EPS): boolean => c.x0 <= d.x1 && d.x0 <= c.x1 && c.y0 <= d.y1 && d.y0 <= c.y1 && c.z0 < d.z1 - tz && d.z0 < c.z1 - tz;
    const tolZ = p.settings?.joinTolerance ?? DEFAULT_JOIN_TOL;
    const candidatas: Wall[] = [];
    for (const w of Object.values(p.elements)) {
      if (w.kind !== 'wall' || w.levelId === levelId) continue;
      if (leve && comAnexo(w)) continue; // leve: sem resolver pisos, lajes nem telhados (só cota nominal)
      // Peneira vertical primeiro (sem consultar o tipo); nível ausente (projeto reduzido da junção) não fornece parceira.
      if (!p.levels.some((l) => l.id === w.levelId)) continue;
      const z = faixaZ(p, w);
      if (z[0] >= todas.z1 - EPS || todas.z0 >= z[1] - EPS) continue;
      if (encosta(caixaDe(p, w, z), todas) && caixas.some((d) => encosta(caixaDe(p, w, z), d))) candidatas.push(w);
    }
    const reais = leve ? new Map() : zRealDe(p, candidatas.filter(comAnexo));
    // Donas com anexo: a faixa REAL (e não a folga) decide; senão topo que só encosta na base da outra (3,0 e 3,0) viraria parceira.
    const donasReais = leve ? null : zRealDe(p, donas.filter(comAnexo));
    const caixasReais = donas.map((w, i) => {
      const r = donasReais?.get(w.id);
      return r ? caixaDe(p, w, [r.z0, r.z0 + r.height]) : leve ? caixaDe(p, w, nominalZ(p, w)) : caixas[i]!;
    });
    for (const w of candidatas) {
      if (!comAnexo(w)) {
        // Sem anexo a faixa é a nominal; ainda assim a dona com anexo decide pela faixa REAL (topo 3,0 só encosta na base 3,0).
        if (caixasReais.some((d) => encosta(caixaDe(p, w, faixaZ(p, w)), d, tolZ))) out.push(w);
        continue;
      }
      const r = reais?.get(w.id);
      if (!r) { reentrante = true; continue; }
      const z: [number, number] = [r.z0, r.z0 + r.height];
      if (caixasReais.some((d) => encosta(caixaDe(p, w, z), d, tolZ))) {
        zResolvido.set(w, { z0: r.z0, height: r.height });
        out.push(w);
      }
    }
    out.sort((a, b) => a.order - b.order);
  }
  if (!reentrante) porNivel.set(levelId, out);
  return out;
}

const memoProjeto = new WeakMap<Project, Map<Id, Project>>();
const memoProjetoLeve = new WeakMap<Project, Map<Id, Project>>();

/** Projeto em que as parceiras do nível entram como paredes dele; sem parceira devolve o próprio projeto. */
export function projetoComParceiras(p: Project, levelId: Id, leve = false): Project {
  const memoDe = leve ? memoProjetoLeve : memoProjeto;
  let porNivel = memoDe.get(p);
  if (!porNivel) memoDe.set(p, (porNivel = new Map()));
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const parceiras = paredesParceiras(p, levelId, leve);
  let out = p;
  if (parceiras.length > 0) {
    const elements = { ...p.elements };
    const elev = levelElevation(p, levelId);
    for (const w of parceiras) {
      const r = zResolvido.get(w);
      elements[w.id] = r
        ? { ...w, levelId, baseOffset: r.z0 - elev, topLevelId: null, topOffset: 0, height: r.height, topProfile: null, attachBottomToFloor: false, attachTopToFloor: false, attachTopToRoof: false }
        : { ...w, levelId, baseOffset: wallBaseElevation(p, w) - elev };
    }
    out = { ...p, elements };
    registrarProjetoBase(out, p);
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

const memoAmbientes = new WeakMap<Project, Map<Id, Project>>();

/**
 * Projeto para os ambientes e o contorno da edificação de um nível: a parede de outro nível que cruza o plano de corte do
 * nível (`wallsCrossingCut`, o mesmo critério da planta) entra como parede dele e fecha o circuito. Só para a geometria em
 * planta; o dono (e os quantitativos) continuam sendo o nível de origem, nada é copiado para o projeto real.
 */
export function projetoDeAmbientes(p: Project, levelId: Id): Project {
  let porNivel = memoAmbientes.get(p);
  if (!porNivel) memoAmbientes.set(p, (porNivel = new Map()));
  const hit = porNivel.get(levelId);
  if (hit) return hit;
  const cruzam = wallsCrossingCut(p, levelId);
  let out = p;
  if (cruzam.length > 0) {
    const elements = { ...p.elements };
    const elev = levelElevation(p, levelId);
    for (const w of cruzam) elements[w.id] = { ...w, levelId, baseOffset: wallBaseElevation(p, w) - elev };
    out = { ...p, elements };
  }
  porNivel.set(levelId, out);
  return out;
}
