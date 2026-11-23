import { PLAN_VISUAL_STYLES, planGraphicsOf, sectionGraphicsOf, view3dOf, type Id, type Project, type View3DSettings, type View3DView, type ViewGraphics, type VisualStyle } from '@hestia/model';
import { findPane, type PaneId, type PaneStyle } from './panes.ts';
import { usePanes } from './paneStore.ts';
import { editor } from './controller.ts';

/**
 * Estilo visual por painel (multitelas, onda 3F). Funções puras: mesclam o `PaneStyle` do painel sobre o que o projeto
 * define para a vista; campo ausente herda. Nada aqui grava no projeto. Estilo vazio devolve o MESMO objeto base.
 */

/** Mescla o estilo do painel nos gráficos 3D do projeto. Sem nada a mudar, devolve `base` (mesma referência). */
export function effectiveView3d(base: View3DSettings, s: PaneStyle): View3DSettings {
  const patch: Partial<View3DSettings> = {};
  if (s.style !== undefined && s.style !== base.style) patch.style = s.style;
  if (s.shadows !== undefined && s.shadows !== base.shadows) patch.shadows = s.shadows;
  if (s.edges !== undefined && s.edges !== base.edges) patch.edges = s.edges;
  if (s.background !== undefined && s.background !== base.background) patch.background = s.background;
  return Object.keys(patch).length === 0 ? base : { ...base, ...patch };
}

/** Estilo válido numa planta ou corte (só os de `PLAN_VISUAL_STYLES`); outro valor é ignorado. */
function planStyleOf(s: PaneStyle): VisualStyle | undefined {
  return s.style !== undefined && PLAN_VISUAL_STYLES.includes(s.style) ? s.style : undefined;
}

/** Mescla o estilo do painel nos gráficos da planta/corte. Sem nada a mudar, devolve `base` (mesma referência). */
export function effectivePlanGraphics(base: ViewGraphics, s: PaneStyle): ViewGraphics {
  const patch: Partial<ViewGraphics> = {};
  const st = planStyleOf(s);
  if (st !== undefined && st !== base.style) patch.style = st;
  if (s.thinLines !== undefined && s.thinLines !== (base.thinLines === true)) patch.thinLines = s.thinLines;
  return Object.keys(patch).length === 0 ? base : { ...base, ...patch };
}

/** Presets nomeados do menu de estilo (`label` é chave i18n). */
export interface PaneStylePreset { key: string; label: string; style: VisualStyle }
const preset = (style: VisualStyle): PaneStylePreset => ({ key: style, label: `pane_style_${style}`, style });
export const PANE_STYLE_PRESETS: { readonly view3d: readonly PaneStylePreset[]; readonly view2d: readonly PaneStylePreset[] } = {
  view3d: (['wireframe', 'hiddenLine', 'shaded', 'consistentColors', 'realistic'] as const).map(preset),
  view2d: (['wireframe', 'hiddenLine', 'shaded'] as const).map(preset),
};

const derivados = new WeakMap<Project, Map<string, Project>>();

/**
 * Projeto "visto" por uma vista 3D salva: cópia rasa com os gráficos da vista (`settings`) no lugar dos do projeto.
 * Só o desenho usa (nunca é gravado) e a disciplina da vista, quando existe, entra nos gráficos para a cena e o estilo
 * concordarem. Memorizado por projeto + id da vista para a identidade ser estável entre quadros.
 */
const derivadosVista3d = new WeakMap<Project, Map<Id, Project>>();

export function projetoDaVista3d(p: Project, view: View3DView | undefined): Project {
  if (!view) return p;
  let m = derivadosVista3d.get(p);
  if (!m) derivadosVista3d.set(p, (m = new Map()));
  const guardado = m.get(view.id);
  if (guardado) return guardado;
  const settings: View3DSettings = view.discipline ? { ...view.settings, discipline: view.discipline } : view.settings;
  const out: Project = { ...p, view3d: settings };
  m.set(view.id, out);
  return out;
}

/**
 * Cópia rasa do projeto com os gráficos de UMA planta trocados: a padrão grava em `levels[].graphics`; a de disciplina,
 * em `planViews[].graphics`. Só o desenho usa (nunca é gravado). Sem `planId`, é a substituição que já existia.
 */
export function comGraficosDaPlanta(p: Project, levelId: Id, planId: Id | undefined, g: ViewGraphics): Project {
  if (planId === undefined) return { ...p, levels: p.levels.map((l) => (l.id === levelId ? { ...l, graphics: g } : l)) };
  return { ...p, planViews: (p.planViews ?? []).map((x) => (x.id === planId && x.levelId === levelId ? { ...x, graphics: g } : x)) };
}

/**
 * Projeto "visto pelo painel": cópia rasa do projeto com os gráficos da vista trocados pelos efetivos. Só serve ao
 * desenho (nunca é gravado). Memorizado por (projeto, estilo, vista) para a identidade ser estável entre quadros: os
 * caches da cena (por projeto) continuam valendo. Estilo que não muda nada devolve o próprio projeto.
 */
export function projetoDoPainel(p: Project, s: PaneStyle, alvo: { kind: '3d' } | { kind: 'plan'; levelId: Id; planId?: Id } | { kind: 'section' }): Project {
  let base: Project = p;
  if (alvo.kind === '3d') {
    const v = view3dOf(p);
    const e = effectiveView3d(v, s);
    if (e !== v) base = { ...p, view3d: e };
  } else if (alvo.kind === 'plan') {
    const g = planGraphicsOf(p, alvo.levelId, alvo.planId);
    const e = effectivePlanGraphics(g, s);
    if (e !== g) base = comGraficosDaPlanta(p, alvo.levelId, alvo.planId, e);
  } else {
    const g = sectionGraphicsOf(p);
    const e = effectivePlanGraphics(g, s);
    if (e !== g) base = { ...p, sectionGraphics: e };
  }
  if (base === p) return p;
  const key = `${alvo.kind}|${alvo.kind === 'plan' ? `${alvo.levelId}|${alvo.planId ?? ''}` : ''}|${s.style ?? ''}|${s.shadows ?? ''}|${s.edges ?? ''}|${s.background ?? ''}|${s.thinLines ?? ''}`;
  let m = derivados.get(p);
  if (!m) derivados.set(p, (m = new Map()));
  const guardado = m.get(key);
  if (guardado) return guardado;
  m.set(key, base);
  return base;
}

/** O que o painel usa de fato depois de mesclar com o projeto (verificação do e2e). */
export interface EstiloAplicado { style: VisualStyle; shadows: boolean; edges: boolean; background: string | null }

/** Estilo efetivo de um painel, ou null se o painel não existe. Planta/corte não têm sombras nem arestas (false). */
export function descreverEstiloAplicado(paneId: PaneId): EstiloAplicado | null {
  const pane = findPane(usePanes.getState().layout, paneId);
  if (!pane) return null;
  const p = editor.project;
  const v = pane.view;
  if (v.kind === '3d') {
    const e = effectiveView3d(view3dOf(p), pane.style);
    return { style: e.style, shadows: e.shadows, edges: e.edges, background: e.background };
  }
  if (v.kind === 'plan' || v.kind === 'section') {
    const base = v.kind === 'plan' ? planGraphicsOf(p, v.levelId, v.planViewId ?? undefined) : sectionGraphicsOf(p);
    return { style: effectivePlanGraphics(base, pane.style).style, shadows: false, edges: false, background: null };
  }
  return null;
}
