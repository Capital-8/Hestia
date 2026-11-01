import {
  applyCommand,
  areaPlansOfLevel,
  dimensionValue,
  isElementRef,
  levelDimensions,
  planAnnotationsOf,
  setStorePostHook,
  type Command,
  type Dimension,
  type Id,
  type Project,
  type StoreChange,
} from '@hestia/model';
import { drivenEditCommands } from './driven.ts';

/**
 * RESTRIÇÕES DE COTA (como o Revit): cota travada mantém o valor (o elemento não preso se move junto), cadeia EQ mantém
 * os trechos iguais e cota cujo elemento foi apagado sai junto. Roda no gancho do `ProjectStore`: os comandos devolvidos
 * entram no mesmo passo de desfazer e um erro recusa a mudança inteira (nada é gravado).
 */

interface Placed { dim: Dimension; levelId: Id; planId?: Id }

const TOL = 5e-4;

function placedDims(p: Project): Placed[] {
  const out: Placed[] = [];
  for (const level of p.levels) {
    for (const dim of levelDimensions(p, level.id)) out.push({ dim, levelId: level.id });
    for (const plan of areaPlansOfLevel(p, level.id)) for (const dim of planAnnotationsOf(plan).dimensions) out.push({ dim, levelId: level.id, planId: plan.id });
  }
  return out;
}

const refId = (r: unknown): Id | undefined => {
  if (!r || typeof r !== 'object') return undefined;
  return isElementRef(r as never) ? (r as { elementId: Id }).elementId : (r as { wallId?: Id }).wallId;
};
const endsOf = (d: Dimension): [Id | undefined, Id | undefined] => [refId(d.refs?.a), refId(d.refs?.b)];

function apply(sim: Project, cmds: Command[]): void {
  for (const c of cmds) applyCommand(sim, c);
}

/** Move os elementos do meio da cadeia (na ordem) até cada trecho valer `target`. Lança Error se algum não puder. */
function equalizeChain(sim: Project, ids: Id[], target: number, take: (cmds: Command[]) => void): void {
  for (let k = 0; k < ids.length - 1; k++) {
    const cur = placedDims(sim).find((x) => x.dim.id === ids[k])!.dim;
    if (Math.abs(dimensionValue(sim, cur) - target) <= TOL) continue;
    const r = drivenEditCommands(sim, unconstrained(cur), target, 'a');
    if (!r.ok) throw new Error(`Cadeia EQ impede a alteração: ${r.reason}`);
    take(r.commands as Command[]);
  }
}

const unconstrained = (d: Dimension): Dimension => ({ ...d, locked: false, eq: undefined });

/** Comandos que satisfazem as cotas travadas e EQ depois de `change`; lança Error com o motivo se não der. */
function solve(project: Project, change: StoreChange): Command[] {
  const all = placedDims(project);
  const out: Command[] = [];
  const hasLocked = all.some((x) => x.dim.locked && x.dim.lockedValue !== undefined);
  const hasEq = all.some((x) => x.dim.eq && x.dim.chainId);
  if (!hasLocked && !hasEq) return out;
  const sim = structuredClone(project) as Project;
  const changed = new Set(change.changed);
  const note = (cmds: Command[]): void => {
    for (const c of cmds) {
      const batch = c.type === 'batch' ? c.commands : [c];
      for (const q of batch) {
        const ids = (q as { ids?: Id[] }).ids ?? ((q as { id?: Id }).id ? [(q as { id: Id }).id] : []);
        for (const id of ids) changed.add(id);
        if (q.type === 'setWallEnds') changed.add(q.id);
      }
    }
  };
  const trackDiff = (before: Project): void => {
    for (const [id, el] of Object.entries(sim.elements)) if (before.elements[id] !== el && JSON.stringify(before.elements[id]) !== JSON.stringify(el)) changed.add(id);
  };

  for (let guard = 0; guard < 24; guard++) {
    let progressed = false;
    // 1. Travas
    for (const { dim } of placedDims(sim)) {
      if (!dim.locked || dim.lockedValue === undefined || dim.angular) continue;
      const [ea, eb] = endsOf(dim);
      if (!ea || !eb || ea === eb) continue;
      const cur = dimensionValue(sim, dim);
      if (Math.abs(cur - dim.lockedValue) <= TOL) continue;
      const ca = changed.has(ea);
      const cb = changed.has(eb);
      if (ca === cb) {
        if (ca) throw new Error('Uma cota travada impede esta alteração: os dois elementos que ela mede se moveram de modos diferentes.');
        continue;
      }
      const r = drivenEditCommands(sim, unconstrained(dim), dim.lockedValue, ca ? 'a' : 'b');
      if (!r.ok) throw new Error(`Cota travada impede a alteração: ${r.reason}`);
      const before = structuredClone(sim) as Project;
      const cmds = r.commands as Command[];
      apply(sim, cmds);
      out.push(...cmds);
      note(cmds);
      trackDiff(before);
      progressed = true;
      break;
    }
    if (progressed) continue;
    // 2. Cadeias EQ
    const chains = new Map<Id, Placed[]>();
    for (const x of placedDims(sim)) if (x.dim.eq && x.dim.chainId && !x.dim.angular) chains.set(x.dim.chainId, [...(chains.get(x.dim.chainId) ?? []), x]);
    for (const members of chains.values()) {
      if (members.length < 2) continue;
      const values = members.map((m) => dimensionValue(sim, m.dim));
      const total = values.reduce((a, b) => a + b, 0);
      const target = total / members.length;
      if (values.every((v) => Math.abs(v - target) <= TOL)) continue;
      const touched = members.some((m) => endsOf(m.dim).some((id) => id && changed.has(id)));
      if (!touched) continue;
      // Elemento do meio alterado diretamente: a cadeia EQ não deixa (as pontas é que se movem).
      const middle = new Set(members.slice(0, -1).map((m) => endsOf(m.dim)[1]).filter((x): x is Id => !!x));
      if ([...middle].some((id) => change.changed.has(id))) throw new Error('A cadeia EQ mantém os trechos iguais: mova as extremidades da cadeia, não os elementos do meio.');
      equalizeChain(sim, members.map((m) => m.dim.id), target, (cmds) => {
        const before = structuredClone(sim) as Project;
        apply(sim, cmds);
        out.push(...cmds);
        note(cmds);
        trackDiff(before);
      });
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  return out;
}

/** Comandos que removem as cotas cujo elemento foi apagado (o Revit também apaga a cota órfã). */
function orphans(project: Project, removed: Set<Id>): Command[] {
  if (removed.size === 0) return [];
  const out: Command[] = [];
  for (const { dim, levelId, planId } of placedDims(project)) {
    const [ea, eb] = endsOf(dim);
    if ((ea && removed.has(ea)) || (eb && removed.has(eb))) out.push({ type: 'removeDimension', levelId, ...(planId ? { planId } : {}), id: dim.id });
  }
  return out;
}

/** Gancho do store: órfãs saem, travas e EQ são resolvidas. */
export function constraintCommands(project: Project, change: StoreChange): Command[] {
  const gone = orphans(project, change.removed);
  if (gone.length === 0) return solve(project, change);
  const sim = structuredClone(project) as Project;
  apply(sim, gone);
  return [...gone, ...solve(sim, change)];
}

setStorePostHook(constraintCommands);

/**
 * Comandos que ligam (ou desligam) o EQ de uma cadeia: marcam as cotas com `eq` e, ao ligar, redistribuem os elementos
 * do meio para os trechos ficarem iguais. Lança Error se a cadeia não puder ser igualada.
 */
export function eqChainCommands(project: Project, chainId: Id, on: boolean): Command[] {
  const members = placedDims(project).filter((x) => x.dim.chainId === chainId && !x.dim.angular);
  const marks: Command[] = members.map((m) => ({ type: 'updateDimension', levelId: m.levelId, ...(m.planId ? { planId: m.planId } : {}), id: m.dim.id, patch: { eq: on ? true : undefined } }));
  if (!on || members.length < 2) return marks;
  const sim = structuredClone(project) as Project;
  apply(sim, marks);
  const total = members.reduce((acc, m) => acc + dimensionValue(sim, m.dim), 0);
  const moves: Command[] = [];
  equalizeChain(sim, members.map((m) => m.dim.id), total / members.length, (cmds) => { apply(sim, cmds); moves.push(...cmds); });
  return [...moves, ...marks];
}
