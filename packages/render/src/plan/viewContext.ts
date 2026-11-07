import { resolveAllRoofs, resolveFloors, resolveRoofs, resolveSlabs, projetoInteiroDaJuncao, viewContextOf, wallZRange, type ResolvedFloor, type ResolvedRoof, type ResolvedSlab, type ViewContext } from '@hestia/engine';
import { isWall, levelAbove, levelElevation, wallMaxHeight, wallsOnLevel, wallTopElevation, type Id, type Project, type Wall } from '@hestia/model';

/**
 * Cotas que a classificação da vista de um nível usa. Sem parede anexada, a faixa das paredes não lê piso, laje nem
 * telhado (ver `wallZRange`), e a faixa de um telhado do próprio nível lê só os telhados do nível: então basta resolver
 * o nível. Com parede anexada (piso, laje ou telhado), a faixa pode depender de elementos de outros níveis, e aí vale o
 * projeto inteiro, como antes. `viewContextOf` resolvia todos os níveis a cada abertura da planta, mesmo sem anexo.
 */
export function contextoDaVista(p: Project, levelId: Id): ViewContext {
  const anexada = wallsOnLevel(p, levelId).some((w) => w.attachBottomToFloor === true || w.attachTopToFloor === true || w.attachTopToRoof === true);
  if (anexada) return viewContextOf(p);
  return { floors: [], slabs: [], roofs: resolveRoofs(p, levelId) };
}

/** Tolerância da comparação de faixas de cota (metros). */
const EPS = 1e-6;

/** Maior espessura total de um tipo de piso ou laje do projeto (margem das faixas de piso e laje para baixo e para cima). */
function espessuraMaxima(p: Project): number {
  let t = 0;
  for (const tipo of [...Object.values(p.floorTypes), ...Object.values(p.slabTypes)]) {
    t = Math.max(t, tipo.layers.reduce((s, l) => s + l.thickness, 0));
  }
  return t;
}

/** Faixa de cota absoluta de cada nível: a união das faixas de parede, piso e laje que estão nele. Sem elemento, fora do mapa. */
const faixasMemo = new WeakMap<Project, Map<Id, readonly [number, number]>>();

/** Pisos e lajes que a faixa de cota de uma parede anexada ao telhado lê, por nível. */
interface LeituraDeNivel {
  floors: ResolvedFloor[];
  slabs: ResolvedSlab[];
}

/**
 * Faixa de cota exata de uma parede anexada ao telhado (`wallZRange`, com o topo na face do telhado). A parede lê os
 * telhados de qualquer nível (o telhado que cobre o eixo pode estar no nível de cima, ver `axisRoofs`) e os pisos e lajes
 * do próprio nível e do nível de topo (`topLevelId`, ou o próprio). Por isso a faixa sai com a mesma leitura do motor.
 */
function faixaDaParedeNoTelhado(p: Project, w: Wall, porNivel: Map<Id, LeituraDeNivel>): readonly [number, number] {
  const niveis = [...new Set<Id>([w.levelId, w.topLevelId ?? w.levelId])];
  const floors: ResolvedFloor[] = [];
  const slabs: ResolvedSlab[] = [];
  for (const id of niveis) {
    let doNivel = porNivel.get(id);
    if (!doNivel) {
      doNivel = { floors: resolveFloors(p, id), slabs: resolveSlabs(p, id) };
      porNivel.set(id, doNivel);
    }
    floors.push(...doNivel.floors);
    slabs.push(...doNivel.slabs);
  }
  const z = wallZRange(p, w, floors, slabs, telhadosDoProjeto(p));
  return [z.z0, z.z0 + z.height];
}

/** Telhados de todos os níveis, resolvidos uma vez por projeto (a parede anexada pode ler qualquer um deles). */
const telhadosMemo = new WeakMap<Project, ResolvedRoof[]>();

function telhadosDoProjeto(p: Project): ResolvedRoof[] {
  const hit = telhadosMemo.get(p);
  if (hit) return hit;
  const valor = resolveAllRoofs(p);
  telhadosMemo.set(p, valor);
  return valor;
}

function faixasDosNiveis(p: Project): Map<Id, readonly [number, number]> {
  const hit = faixasMemo.get(p);
  if (hit) return hit;
  const margem = espessuraMaxima(p);
  const out = new Map<Id, readonly [number, number]>();
  const soma = (id: Id, lo: number, hi: number): void => {
    const h = out.get(id);
    out.set(id, h ? [Math.min(h[0], lo), Math.max(h[1], hi)] : [lo, hi]);
  };
  const porNivel = new Map<Id, LeituraDeNivel>();
  for (const e of Object.values(p.elements)) {
    if (isWall(e)) {
      const base = levelElevation(p, e.levelId) + e.baseOffset;
      const topo = wallTopElevation(p, e);
      soma(e.levelId, Math.min(base, topo), Math.max(base, topo, base + wallMaxHeight(p, e)));
      // Com o topo no telhado, a cota real sai do telhado (pode subir acima da altura normal): a união cobre as duas.
      if (e.attachTopToRoof === true) {
        const [lo, hi] = faixaDaParedeNoTelhado(p, e, porNivel);
        soma(e.levelId, lo, hi);
      }
    } else if (e.kind === 'floor' || e.kind === 'slab') {
      const z = levelElevation(p, e.levelId) + e.heightOffset;
      const inclinacao = e.kind === 'slab' && e.slope ? (Math.abs(e.slope.percent) / 100) * diagonal(e.boundary) : 0;
      soma(e.levelId, z - margem - inclinacao, z + margem + inclinacao);
    }
  }
  faixasMemo.set(p, out);
  return out;
}

function diagonal(pontos: readonly { x: number; y: number }[]): number {
  const xs = pontos.map((v) => v.x);
  const ys = pontos.map((v) => v.y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/**
 * Pavimentos vizinhos de um nível, como a junção e a resolução de lajes os leem: os dois da ordenação por cota e o
 * imediatamente acima e abaixo por cota (`levelAbove`). A união cobre as duas regras usadas no motor.
 */
function adjacentesDoNivel(p: Project, levelId: Id): Id[] {
  const ordem = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const i = ordem.findIndex((l) => l.id === levelId);
  const base = p.levels.find((l) => l.id === levelId);
  if (i < 0 || !base) return [];
  let below: Id | null = null;
  let belowElev = -Infinity;
  for (const l of p.levels) if (l.elevation < base.elevation && l.elevation > belowElev) { below = l.id; belowElev = l.elevation; }
  const ids = [ordem[i - 1]?.id, ordem[i + 1]?.id, levelAbove(p, levelId)?.id, below ?? undefined];
  return ids.filter((id): id is Id => id !== undefined);
}

/**
 * Adiciona a `mantidos` os níveis que as paredes do nível leem além do próprio: o nível e seus vizinhos
 * (`attachBottomToFloor`, `attachTopToFloor`), o nível de topo com os vizinhos dele (`attachTopToFloor` com `topLevelId`)
 * e, para `attachTopToRoof`, os níveis que têm telhado (a parede lê qualquer telhado que cubra o eixo, ver `axisRoofs`).
 */
function adicionaDependencias(p: Project, nivel: Id, mantidos: Set<Id>): void {
  let comTelhado: Id[] | null = null;
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || e.levelId !== nivel) continue;
    if (e.attachBottomToFloor === true || e.attachTopToFloor === true) {
      for (const d of [nivel, ...adjacentesDoNivel(p, nivel)]) mantidos.add(d);
    }
    if (e.attachTopToFloor === true && e.topLevelId) {
      for (const d of [e.topLevelId, ...adjacentesDoNivel(p, e.topLevelId)]) mantidos.add(d);
    }
    // Parede anexada ao telhado lê os telhados de todos os níveis: qualquer um pode cobrir o eixo dela.
    if (e.attachTopToRoof === true) {
      comTelhado ??= niveisComTelhado(p);
      for (const d of comTelhado) mantidos.add(d);
    }
  }
}

/** Níveis que têm pelo menos um telhado (o que uma parede anexada pode ler). */
function niveisComTelhado(p: Project): Id[] {
  const out = new Set<Id>();
  for (const e of Object.values(p.elements)) if (e.kind === 'roof') out.add(e.levelId);
  return [...out];
}

/** Fecha as dependências: cada nível mantido puxa os níveis que as paredes dele leem, até o conjunto parar de crescer. */
function fechaDependencias(p: Project, mantidos: Set<Id>): void {
  let tamanho = -1;
  while (tamanho !== mantidos.size) {
    tamanho = mantidos.size;
    for (const id of [...mantidos]) adicionaDependencias(p, id, mantidos);
  }
}

/** Projetos reduzidos por projeto e nível (memorizados, para que os caches de cortadores reencontrem o mesmo objeto). */
const juncaoMemo = new WeakMap<Project, Map<Id, Project>>();

/**
 * Projeto para a junção da vista de um nível. A junção só recebe cortadores de outro nível que tocam a faixa de cota do
 * nível (`levelCutterSet`), então os outros níveis são calculados à toa. Ficam:
 *  - o próprio nível e os vizinhos (a resolução de lajes lê os vizinhos);
 *  - os níveis cuja faixa de elementos (paredes, pisos e lajes, com a espessura dos tipos) toca a faixa do nível. Para
 *    parede anexada ao telhado, a faixa é a cota exata que o motor calcula (`wallZRange`);
 *  - os níveis que as paredes anexadas desses níveis leem: piso de base ou de topo (com os vizinhos) e, para telhado,
 *    todos os níveis com telhado. O conjunto fecha sobre si mesmo, porque cada nível novo traz as próprias dependências.
 * Assim a junção do nível sai igual à do projeto inteiro: nível fora do conjunto não tem peça que alcance a faixa do nível.
 */
export function projetoDaJuncao(p: Project, levelId: Id): Project {
  let byLevel = juncaoMemo.get(p);
  if (!byLevel) {
    byLevel = new Map();
    juncaoMemo.set(p, byLevel);
  }
  const hit = byLevel.get(levelId);
  if (hit) return hit;
  let out: Project = p;
  const faixas = faixasDosNiveis(p);
  const mantidos = new Set<Id>([levelId, ...adjacentesDoNivel(p, levelId)]);
  const propria = faixas.get(levelId);
  if (propria) {
    // Níveis cuja faixa toca a do nível; para cada um, os vizinhos (resolução de lajes).
    for (const l of p.levels) {
      const f = faixas.get(l.id);
      if (f && f[1] >= propria[0] - EPS && f[0] <= propria[1] + EPS) {
        mantidos.add(l.id);
        for (const v of adjacentesDoNivel(p, l.id)) mantidos.add(v);
      }
    }
  }
  fechaDependencias(p, mantidos);
  const levels = p.levels.filter((l) => mantidos.has(l.id));
  if (levels.length < p.levels.length) {
    out = { ...p, levels };
    projetoInteiroDaJuncao.set(out, p);
  }
  byLevel.set(levelId, out);
  return out;
}
