import type { Command } from './commands.ts';
import { disciplinaExiste, type DisciplineProfile, type ProjectDiscipline } from './disciplineProfile.ts';
import { GRAPHICS_CATEGORIES, type GraphicsCategory } from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import { DEFAULT_DISCIPLINE, isDiscipline, isDisciplineId, isTone, type Discipline, type Tone } from './planView.ts';
import type { Project } from './types.ts';

/**
 * Comandos dos perfis por disciplina e da gestão de disciplinas (decisão 0060, adendo 3, decisões 1, 2, 3, 4 e 6).
 * Cada função grava um comando só; validação falha sem tocar no projeto, e o desfazer é o passo normal do `ProjectStore`.
 * `removeProjectDiscipline` devolve tudo o que apontava para a disciplina à origem padrão (Arquitetura) num só passo.
 */

const MAX_NAME = 60;

/** Cópia profunda do perfil (o estado nunca compartilha objeto com o chamador). */
function copyProfile(tones: DisciplineProfile): DisciplineProfile {
  return Object.fromEntries(Object.entries(tones)) as DisciplineProfile;
}

/**
 * Perfil de tom de uma disciplina: `null` remove a disciplina; qualquer categoria ou tom desconhecido é recusado e
 * nada é gravado. Só entram categorias de `GRAPHICS_CATEGORIES` com tom de `TONES`; perfil vazio remove a chave.
 */
export function applySetDisciplineProfile(p: Project, discipline: Discipline, tones: DisciplineProfile | null, lang: Lang = 'pt'): void {
  if (!disciplinaExiste(p, discipline)) throw new Error(t(lang, 'md_cmd_disc_missing', { id: String(discipline) }));
  if (tones === null) {
    if (!p.disciplineProfiles) return;
    delete p.disciplineProfiles[discipline];
    if (Object.keys(p.disciplineProfiles).length === 0) delete p.disciplineProfiles;
    return;
  }
  if (typeof tones !== 'object' || Array.isArray(tones)) throw new Error(t(lang, 'md_cmd_disc_tone', { tone: String(tones) }));
  const clean: DisciplineProfile = {};
  for (const [category, tone] of Object.entries(tones)) {
    if (!(GRAPHICS_CATEGORIES as readonly string[]).includes(category)) throw new Error(t(lang, 'md_cmd_disc_category', { category }));
    if (!isTone(tone)) throw new Error(t(lang, 'md_cmd_disc_tone', { tone: String(tone) }));
    clean[category as GraphicsCategory] = tone as Tone;
  }
  if (Object.keys(clean).length === 0) {
    if (!p.disciplineProfiles) return;
    delete p.disciplineProfiles[discipline];
    if (Object.keys(p.disciplineProfiles).length === 0) delete p.disciplineProfiles;
    return;
  }
  p.disciplineProfiles = { ...(p.disciplineProfiles ?? {}), [discipline]: copyProfile(clean) };
}

/** Remapeia a disciplina de origem de uma categoria; `undefined` remove o remapeamento (e o mapa vazio sai do projeto). */
export function applySetCategoryDiscipline(p: Project, category: GraphicsCategory, discipline: Discipline | undefined, lang: Lang = 'pt'): void {
  if (!(GRAPHICS_CATEGORIES as readonly string[]).includes(category)) throw new Error(t(lang, 'md_cmd_disc_category', { category: String(category) }));
  if (discipline !== undefined && !disciplinaExiste(p, discipline)) throw new Error(t(lang, 'md_cmd_disc_missing', { id: String(discipline) }));
  const next: Partial<Record<GraphicsCategory, Discipline>> = { ...(p.categoryDiscipline ?? {}) };
  if (discipline === undefined) delete next[category];
  else next[category] = discipline;
  if (Object.keys(next).length === 0) delete p.categoryDiscipline;
  else p.categoryDiscipline = next;
}

/** Disciplina nova do projeto: id válido, fora das embutidas, sem repetição e com nome de até 60 caracteres. */
export function applyAddProjectDiscipline(p: Project, discipline: ProjectDiscipline, lang: Lang = 'pt'): void {
  if (!isDisciplineId(discipline?.id)) throw new Error(t(lang, 'md_cmd_disc_id_invalid', { id: String(discipline?.id) }));
  const name = typeof discipline.name === 'string' ? discipline.name.trim() : '';
  if (!name || name.length > MAX_NAME) throw new Error(t(lang, 'md_cmd_disc_name'));
  if (isDiscipline(discipline.id)) throw new Error(t(lang, 'md_cmd_disc_builtin', { id: discipline.id }));
  if ((p.disciplines ?? []).some((item) => item.id === discipline.id)) throw new Error(t(lang, 'md_cmd_disc_exists'));
  const color = typeof discipline.color === 'string' && discipline.color.trim() ? discipline.color.trim() : undefined;
  p.disciplines = [...(p.disciplines ?? []), color ? { id: discipline.id, name, color } : { id: discipline.id, name }];
}

/** Renomeia/muda a cor de uma disciplina do projeto; embutida e nome vazio são recusados (nada é gravado). */
export function applyUpdateProjectDiscipline(p: Project, id: Discipline, name: string | undefined, color: string | undefined, lang: Lang = 'pt'): void {
  if (isDiscipline(id)) throw new Error(t(lang, 'md_cmd_disc_builtin', { id }));
  const list = p.disciplines ?? [];
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(t(lang, 'md_cmd_disc_missing', { id }));
  if (name === undefined && color === undefined) return;
  const next: ProjectDiscipline = { ...list[index]! };
  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > MAX_NAME) throw new Error(t(lang, 'md_cmd_disc_name'));
    next.name = trimmed;
  }
  if (color !== undefined) {
    const trimmed = typeof color === 'string' ? color.trim() : '';
    if (trimmed) next.color = trimmed;
    else delete next.color;
  }
  p.disciplines = list.map((item, i) => (i === index ? next : item));
}

/**
 * Remove uma disciplina do projeto e devolve à origem padrão tudo o que apontava para ela, num só passo de desfazer:
 * perfil, remapeamento de categoria, plantas dessa disciplina (Arquitetura), `Level.discipline`, `view3d.discipline`
 * e famílias de componente. Embutidas e disciplinas inexistentes são recusadas.
 */
export function applyRemoveProjectDiscipline(p: Project, id: Discipline, lang: Lang = 'pt'): void {
  if (isDiscipline(id)) throw new Error(t(lang, 'md_cmd_disc_builtin', { id }));
  const list = p.disciplines ?? [];
  if (!list.some((item) => item.id === id)) throw new Error(t(lang, 'md_cmd_disc_missing', { id }));
  const rest = list.filter((item) => item.id !== id);
  if (rest.length > 0) p.disciplines = rest;
  else delete p.disciplines;

  if (p.disciplineProfiles) {
    delete p.disciplineProfiles[id];
    if (Object.keys(p.disciplineProfiles).length === 0) delete p.disciplineProfiles;
  }
  if (p.categoryDiscipline) {
    const next = { ...p.categoryDiscipline };
    for (const category of Object.keys(next) as GraphicsCategory[]) {
      if (next[category] === id) delete next[category];
    }
    if (Object.keys(next).length === 0) delete p.categoryDiscipline;
    else p.categoryDiscipline = next;
  }
  if (p.planViews?.some((plan) => plan.discipline === id)) {
    p.planViews = p.planViews.map((plan) => (plan.discipline === id ? { ...plan, discipline: DEFAULT_DISCIPLINE } : plan));
  }
  for (const level of p.levels) {
    if (level.discipline === id) delete level.discipline;
  }
  if (p.view3d?.discipline === id) delete p.view3d.discipline;
  for (const family of Object.values(p.componentFamilies ?? {})) {
    if (family.disciplina === id) family.disciplina = DEFAULT_DISCIPLINE;
  }
}

/** Aplica um comando desta família. Devolve false quando o comando não é desta família. */
export function applyDisciplineProfileCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'setDisciplineProfile':
      applySetDisciplineProfile(p, c.discipline, c.tones, lang);
      return true;
    case 'setCategoryDiscipline':
      applySetCategoryDiscipline(p, c.category, c.discipline, lang);
      return true;
    case 'addProjectDiscipline':
      applyAddProjectDiscipline(p, c.discipline, lang);
      return true;
    case 'updateProjectDiscipline':
      applyUpdateProjectDiscipline(p, c.id, c.name, c.color, lang);
      return true;
    case 'removeProjectDiscipline':
      applyRemoveProjectDiscipline(p, c.id, lang);
      return true;
    default:
      return false;
  }
}
