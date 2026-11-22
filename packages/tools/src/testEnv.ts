import { ProjectStore, createEmptyProject, wallsOnLevel, type Id, type Wall } from '@hestia/model';
import { createTool, DEFAULT_DISJOIN, type PointerInfo, type Tool, type ToolEnv, type ToolId, type ToolOptions } from './index.ts';

/**
 * Opções opcionais do ambiente. Sem nenhuma, o ambiente é o de sempre: planta do `lv_0`, nada oculto e sem
 * `hiddenInView`/`halftoneInView` (a ferramenta trata a ausência como "nenhum").
 */
export interface OpcoesMakeEnv {
  /** Nível da planta ativa (padrão `lv_0`). */
  levelId?: Id;
  /** Elementos ocultos na vista (alimentam `hiddenInView`). */
  hiddenIds?: Iterable<Id>;
  /** Elementos em meio-tom na vista (alimentam `halftoneInView`). Padrão: vazio. */
  halftoneIds?: Iterable<Id>;
  /** Planta de disciplina aberta (`ToolEnv.planViewId`; só existe no ambiente quando informada). */
  planViewId?: Id;
}

/** Ambiente de teste das ferramentas (usado pelos *.test.ts do pacote; não é exportado no índice). */
export function makeEnv(store = new ProjectStore(createEmptyProject()), opts: OpcoesMakeEnv = {}) {
  const levelId: Id = opts.levelId ?? 'lv_0';
  const hidden: ReadonlySet<Id> | null = opts.hiddenIds ? new Set<Id>(opts.hiddenIds) : null;
  const halftone: ReadonlySet<Id> | null = opts.halftoneIds ? new Set<Id>(opts.halftoneIds) : null;
  let selection: Id[] = [];
  let finished = 0;
  let areaPlan: Id | null = null;
  const planView: Id | null = opts.planViewId ?? null;
  const alerts: string[] = [];
  const alertIds: Id[][] = [];
  const options: ToolOptions = {
    wallTypeId: 'wt_alv14', locationLine: 'wallCenter', wallHeight: 2.8, chain: true, wallShape: 'line',
    doorTypeId: 'ot_p80', windowTypeId: 'ot_j120', orthoLock: false, arrayCount: 3, offsetDistance: 1,
    rotateCopy: false, mirrorCopy: false, offsetCopy: true, moveDisjoin: DEFAULT_DISJOIN.move, rotateDisjoin: DEFAULT_DISJOIN.rotate, mirrorDisjoin: DEFAULT_DISJOIN.mirror,
    floorTypeId: 'ft_ceram', floorOffset: 0, slabTypeId: 'ls_mac12', slabOffset: 0, slabSlopePercent: 2,
    ceilingTypeId: 'ct_gesso', ceilingOffset: 2.6,
  };
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => levelId,
    ...(hidden ? { hiddenInView: () => hidden } : {}),
    ...(halftone ? { halftoneInView: () => halftone } : {}),
    selection: () => selection,
    setSelection: (ids) => { selection = ids; },
    exec: (c) => store.exec(c),
    transaction: (l, fn, session) => store.transaction(l, fn, session),
    metersPerPixel: () => 0.01,
    areaPlanId: () => areaPlan,
    ...(opts.planViewId ? { planViewId: () => planView } : {}),
    gridStep: () => 0.1,
    say: () => {},
    alert: (message: string, ids?: readonly Id[]) => { alerts.push(message); alertIds.push([...(ids ?? [])]); },
    done: () => { finished += 1; },
    options: () => options,
    setOptions: (patch) => { Object.assign(options, patch); },
  };
  return { store, env, options, done: () => finished, sel: () => selection, areaPlanId: () => areaPlan, setAreaPlanId: (id: Id | null) => { areaPlan = id; }, planViewId: () => planView, alertas: () => alerts, alertIds: () => alertIds };
}

export const P = (x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false, ...extra });
export const clickAt = (t: Tool, x: number, y: number, extra: Partial<PointerInfo> = {}) => { t.move(P(x, y, extra)); t.click(P(x, y, extra)); };
export const walls = (s: ProjectStore): Wall[] => wallsOnLevel(s.project, 'lv_0');
export const tool = (id: ToolId, env: ToolEnv): Tool => { const t = createTool(id, env); t.start(); return t; };

/** Cria uma parede reta pela ferramenta Parede (encerra o encadeamento com Esc). */
export function drawWall(env: ToolEnv, a: [number, number], b: [number, number]): void {
  const w = tool('wall', env);
  clickAt(w, a[0], a[1]);
  clickAt(w, b[0], b[1]);
  w.cancel();
}
