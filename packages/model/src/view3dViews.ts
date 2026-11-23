import { disciplinaExiste } from './disciplineProfile.ts';
import { graphicsIssues, view3dOf, type View3DSettings } from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import { newId } from './ids.ts';
import { isDisciplineId, isTomOuApresentacao, type Discipline, type TomOuApresentacao } from './planView.ts';
import type { Id, Project } from './types.ts';

/**
 * Vistas 3D salvas do projeto (plano de UX das disciplinas, 2026-11-23). A vista 3D atual continua em
 * `Project.view3d` ("3D padrão"); esta coleção guarda cópias nomeadas que o navegador abre na aba `3d:<id>`.
 * Ausente = nenhuma, e um arquivo antigo abre e desenha exatamente como antes.
 */

/** Câmera de uma vista 3D salva: ângulos em graus, distância em metros e alvo no espaço do modelo. */
export interface Camera3D {
  azimuth: number;
  elevation: number;
  distance: number;
  target: { x: number; y: number; z: number };
  /** Projeção ortográfica em vez de perspectiva. */
  ortho: boolean;
}

export interface View3DView {
  /** Id novo (`newId`), único no projeto. */
  id: Id;
  /** Nome único no projeto. */
  name: string;
  /** Disciplina de trabalho da vista; ausente = todas (como a vista 3D padrão sem disciplina). */
  discipline?: Discipline;
  camera: Camera3D;
  settings: View3DSettings;
  /** Desvios de apresentação por disciplina (mesmo tipo dos tons das plantas). */
  tones?: Partial<Record<Discipline, TomOuApresentacao>>;
}

/** Câmera padrão de uma vista 3D nova: três quartos, acima do modelo, enquadrando 12 m. */
export const DEFAULT_VIEW3D_CAMERA: Camera3D = {
  azimuth: -45,
  elevation: 25,
  distance: 12,
  target: { x: 0, y: 0, z: 0 },
  ortho: false,
};

export const view3dViewsOf = (p: Partial<Pick<Project, 'view3dViews'>>): View3DView[] => p.view3dViews ?? [];

export const view3dViewOf = (p: Partial<Pick<Project, 'view3dViews'>>, id: Id): View3DView | undefined =>
  view3dViewsOf(p).find((x) => x.id === id);

/** Nome único no projeto: livre fica igual; ocupado recebe sufixo numérico ("3D" → "3D (2)" → "3D (3)"). */
export function uniqueView3dViewName(p: Partial<Pick<Project, 'view3dViews'>>, name: string, exceptId?: Id): string {
  const base = name.trim() || '3D';
  const usados = new Set(view3dViewsOf(p).filter((v) => v.id !== exceptId).map((v) => v.name.trim()));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidato = `${base} (${n})`;
    if (!usados.has(candidato)) return candidato;
  }
}

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Câmera válida: todos os números finitos, distância maior que zero e alvo finito. Nunca lança. */
export function camera3DIsValid(camera: unknown): camera is Camera3D {
  if (camera === null || typeof camera !== 'object' || Array.isArray(camera)) return false;
  const c = camera as Partial<Camera3D>;
  if (!finito(c.azimuth) || !finito(c.elevation) || !finito(c.distance) || !(c.distance > 0)) return false;
  const alvo = c.target;
  if (alvo === null || typeof alvo !== 'object' || Array.isArray(alvo)) return false;
  if (!finito(alvo.x) || !finito(alvo.y) || !finito(alvo.z)) return false;
  return typeof c.ortho === 'boolean';
}

/**
 * Problemas de UMA vista 3D salva (comando e validação), sem prefixo do contexto. `exceptId` ignora a própria vista
 * ao conferir id e nome únicos (renomear para o mesmo nome não muda nada); ausente, a vista candidata é confrontada com
 * o projeto inteiro (caso do "adicionar"). Nunca lança.
 */
export function view3dViewIssues(
  p: Partial<Pick<Project, 'view3dViews' | 'disciplines'>>,
  view: View3DView,
  lang: Lang = 'pt',
  exceptId?: Id,
): string[] {
  const out: string[] = [];
  const outras = view3dViewsOf(p).filter((x) => x !== view && x.id !== exceptId);
  if (typeof view.id !== 'string' || !view.id) out.push(t(lang, 'md_v3dview_id_invalid', { id: String(view.id) }));
  else if (outras.some((x) => x.id === view.id)) out.push(t(lang, 'md_v3dview_id_exists', { id: view.id }));
  const nome = typeof view.name === 'string' ? view.name.trim() : '';
  if (!nome) out.push(t(lang, 'md_v3dview_name_required'));
  else if (outras.some((x) => x.name.trim() === nome)) out.push(t(lang, 'md_v3dview_name_exists', { name: nome }));
  if (!camera3DIsValid(view.camera)) out.push(t(lang, 'md_v3dview_camera'));
  if (view.discipline !== undefined && !disciplinaExiste(p, view.discipline)) {
    out.push(t(lang, 'md_cmd_disc_missing', { id: String(view.discipline) }));
  }
  if (view.settings === null || typeof view.settings !== 'object' || Array.isArray(view.settings)) {
    out.push(t(lang, 'md_v3dview_settings'));
  } else {
    out.push(...graphicsIssues(view3dOf({ view3d: view.settings }), lang));
  }
  if (view.tones !== undefined) {
    if (view.tones === null || typeof view.tones !== 'object' || Array.isArray(view.tones)) {
      out.push(t(lang, 'md_cmd_disc_tone', { tone: String(view.tones) }));
    } else {
      for (const [disciplina, valor] of Object.entries(view.tones)) {
        if (!isDisciplineId(disciplina) || !disciplinaExiste(p, disciplina)) {
          out.push(t(lang, 'md_cmd_disc_missing', { id: disciplina }));
        }
        if (!isTomOuApresentacao(valor)) out.push(t(lang, 'md_cmd_disc_tone', { tone: String(valor) }));
      }
    }
  }
  return out;
}

/** Entrada de `makeView3DView`: campos ausentes recebem os padrões da vista nova. */
export interface MakeView3DViewInput {
  id?: Id;
  name?: string;
  discipline?: Discipline;
  camera?: Partial<Omit<Camera3D, 'target'>> & { target?: Partial<Camera3D['target']> };
  settings?: View3DSettings;
  tones?: Partial<Record<Discipline, TomOuApresentacao>>;
}

/**
 * Vista 3D salva nova: id `v3d_…`, nome único a partir de "3D", gráficos padrão (`view3dOf({})`) e câmera padrão
 * (azimute −45, elevação 25, distância 12, alvo na origem, perspectiva). Nada é compartilhado com a entrada.
 */
export function makeView3DView(p: Partial<Pick<Project, 'view3dViews'>>, input: MakeView3DViewInput = {}): View3DView {
  const camera: Camera3D = {
    ...DEFAULT_VIEW3D_CAMERA,
    ...(input.camera ?? {}),
    target: { ...DEFAULT_VIEW3D_CAMERA.target, ...(input.camera?.target ?? {}) },
  };
  const view: View3DView = {
    id: input.id ?? newId('v3d'),
    name: uniqueView3dViewName(p, input.name ?? '3D'),
    camera,
    settings: input.settings ? copy(input.settings) : view3dOf({}),
  };
  if (input.discipline !== undefined) view.discipline = input.discipline;
  if (input.tones !== undefined) view.tones = copy(input.tones);
  return view;
}

/** Cópia sem referências compartilhadas (a vista gravada nunca aponta para objetos do chamador). */
export function copyView3dView(view: View3DView): View3DView {
  const out: View3DView = {
    id: view.id,
    name: view.name,
    camera: { ...view.camera, target: { ...view.camera.target } },
    settings: copy(view.settings),
  };
  if (view.discipline !== undefined) out.discipline = view.discipline;
  if (view.tones !== undefined) out.tones = copy(view.tones);
  return out;
}

function copy<T>(x: T): T {
  if (Array.isArray(x)) return x.map(copy) as T;
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) as T;
  return x;
}
