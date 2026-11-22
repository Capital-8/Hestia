import { presetTone, type Discipline, type ElementDiscipline, type Tone } from './discipline.ts';
import { GRAPHICS_CATEGORIES, type GraphicsCategory } from './graphics.ts';
import { DEFAULT_DISCIPLINE, DISCIPLINES, isDiscipline, isDisciplineId, isTone, type PlanView } from './planView.ts';
import { disciplinaDaCategoria as disciplinaDaCategoriaDoRegistro } from './registroCategorias.ts';
import type { Project } from './types.ts';

/**
 * Perfis por disciplina (decisão 0060, adendo 3, decisões 1, 3, 4 e 6): as disciplinas do projeto (as cinco embutidas
 * mais as criadas pelo usuário), o tom de cada categoria dentro de uma disciplina e o remapeamento da disciplina de
 * origem de uma categoria. Tudo opcional no projeto; ausente = comportamento de hoje. Dado inválido (disciplina,
 * categoria ou tom desconhecido) é ignorado na leitura e preservado no arquivo: nenhuma função daqui lança.
 */

/** Disciplina declarada no projeto (`Project.disciplines`): id estável, nome exibido e cor opcional. */
export interface ProjectDiscipline {
  id: Discipline;
  name: string;
  color?: string;
}

/** Tom de cada categoria dentro de uma disciplina: só as categorias presentes desviam; ausente = predefinido. */
export type DisciplineProfile = Partial<Record<GraphicsCategory, Tone>>;

/** Entrada de disciplina do projeto que serve como fonte de id (objeto com id válido e fora das embutidas). */
function idValido(item: ProjectDiscipline): boolean {
  if (item === null || typeof item !== 'object') return false;
  return isDisciplineId(item.id) && !isDiscipline(item.id);
}

/**
 * Disciplinas efetivas do projeto: as cinco embutidas (id = nome = valor, sem cor), na ordem de `DISCIPLINES`, seguidas
 * das do projeto válidas (id válido, fora das embutidas e sem repetição). Entrada malformada é ignorada; nunca lança.
 */
export function disciplinasDoProjeto(p: Pick<Project, 'disciplines'>): ProjectDiscipline[] {
  const out: ProjectDiscipline[] = DISCIPLINES.map((id) => ({ id, name: id }));
  const vistos = new Set<string>(DISCIPLINES);
  for (const item of p.disciplines ?? []) {
    if (!idValido(item) || vistos.has(item.id)) continue;
    vistos.add(item.id);
    const nome = typeof item.name === 'string' && item.name.trim() ? item.name : item.id;
    out.push(typeof item.color === 'string' && item.color ? { id: item.id, name: nome, color: item.color } : { id: item.id, name: nome });
  }
  return out;
}

/** A disciplina é embutida ou declarada validamente no projeto? (predicado; aceita valor desconhecido) */
export function disciplinaExiste(p: Pick<Project, 'disciplines'>, d: unknown): d is Discipline {
  if (!isDisciplineId(d)) return false;
  if (isDiscipline(d)) return true;
  return (p.disciplines ?? []).some((item) => idValido(item) && item.id === d);
}

/**
 * Disciplina de origem de uma categoria: o remapeamento de `Project.categoryDiscipline` quando a categoria existe, o
 * valor é um id de disciplina e a disciplina existe; senão a origem do registro único (`registroCategorias.ts`).
 * Categoria desconhecida (dado inválido) cai em `geral`.
 */
export function disciplinaDaCategoria(
  p: Pick<Project, 'disciplines' | 'categoryDiscipline'>,
  c: GraphicsCategory,
): ElementDiscipline {
  if (!GRAPHICS_CATEGORIES.includes(c)) return 'geral';
  const remapeada = p.categoryDiscipline?.[c];
  if (isDisciplineId(remapeada) && disciplinaExiste(p, remapeada)) return remapeada;
  return disciplinaDaCategoriaDoRegistro(c);
}

/**
 * Perfil de uma disciplina com só categorias conhecidas e tons válidos. Perfil ausente, categoria desconhecida ou tom
 * malformado são ignorados (a validação do projeto é que sinaliza); nunca lança.
 */
export function perfilDaDisciplina(p: Pick<Project, 'disciplineProfiles'>, d: Discipline): DisciplineProfile {
  const out: DisciplineProfile = {};
  const bruto: unknown = typeof d === 'string' ? p.disciplineProfiles?.[d] : undefined;
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return out;
  const registro = bruto as Record<string, unknown>;
  for (const c of GRAPHICS_CATEGORIES) {
    const tom = registro[c];
    if (isTone(tom)) out[c] = tom;
  }
  return out;
}

/**
 * Tom de uma categoria na planta (adendo 3, decisão 4), precedência do mais forte ao mais fraco:
 * 1. exceção da vista (`PlanView.tones[alvo]`), onde `alvo` é a disciplina do elemento ou a de origem da categoria;
 * 2. perfil da disciplina de trabalho da planta (`Project.disciplineProfiles`);
 * 3. predefinido (`presetTone` da disciplina de trabalho; categorias `geral` nunca recebem tom, ficam `normal`).
 * Disciplina de trabalho inválida cai em `DEFAULT_DISCIPLINE`; nunca lança.
 */
export function tomDaCategoria(
  p: Pick<Project, 'disciplineProfiles' | 'categoryDiscipline' | 'disciplines'>,
  plan: Pick<PlanView, 'discipline' | 'tones'> | undefined,
  categoria: GraphicsCategory,
  disciplinaElemento?: ElementDiscipline,
): Tone {
  const alvo = disciplinaElemento ?? disciplinaDaCategoria(p, categoria);
  // Elementos e categorias `geral` não dependem de disciplina (§4.1): nenhum perfil nem exceção se aplica.
  if (alvo === 'geral') return 'normal';
  const excecao = plan?.tones?.[alvo];
  if (isTone(excecao)) return excecao;
  const disciplinaDaPlanta = plan?.discipline;
  const trabalho = isDisciplineId(disciplinaDaPlanta) ? disciplinaDaPlanta : DEFAULT_DISCIPLINE;
  const tomDoPerfil = perfilDaDisciplina(p, trabalho)[categoria];
  if (isTone(tomDoPerfil)) return tomDoPerfil;
  return presetTone(trabalho, alvo);
}
