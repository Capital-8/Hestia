import { disciplineOfElement, presetTone, type Discipline, type ElementDiscipline } from './discipline.ts';
import { GRAPHICS_CATEGORIES, type GraphicsCategory } from './graphics.ts';
import {
  DEFAULT_DISCIPLINE,
  DISCIPLINES,
  apresentacaoDe,
  isDiscipline,
  isDisciplineId,
  isTomOuApresentacao,
  type Apresentacao,
  type PlanView,
  type TomOuApresentacao,
} from './planView.ts';
import { disciplinaDaCategoria as disciplinaDaCategoriaDoRegistro } from './registroCategorias.ts';
import type { Element, Project } from './types.ts';

/**
 * Perfis por disciplina (decisão 0060, adendo 3, decisões 1, 3, 4 e 6; apresentação do plano de UX de 2026-11-23): as
 * disciplinas do projeto (as cinco embutidas mais as criadas pelo usuário), a apresentação de cada categoria dentro de
 * uma disciplina (tom, clareamento e opacidade) e o remapeamento da disciplina de origem de uma categoria. Tudo opcional
 * no projeto; ausente = comportamento de hoje. Dado inválido (disciplina, categoria ou apresentação desconhecida) é
 * ignorado na leitura e preservado no arquivo: nenhuma função daqui lança.
 */

/** Disciplina declarada no projeto (`Project.disciplines`): id estável, nome exibido e cor opcional. */
export interface ProjectDiscipline {
  id: Discipline;
  name: string;
  color?: string;
}

/** Apresentação de cada categoria dentro de uma disciplina: só as categorias presentes desviam; ausente = predefinido. */
export type DisciplineProfile = Partial<Record<GraphicsCategory, TomOuApresentacao>>;

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
 * Perfil de uma disciplina com só categorias conhecidas e apresentações válidas, normalizadas para objeto. Perfil
 * ausente, categoria desconhecida ou apresentação malformada são ignorados (a validação do projeto é que sinaliza);
 * nunca lança.
 */
export function perfilDaDisciplina(p: Pick<Project, 'disciplineProfiles'>, d: Discipline): DisciplineProfile {
  const out: DisciplineProfile = {};
  const bruto: unknown = typeof d === 'string' ? p.disciplineProfiles?.[d] : undefined;
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return out;
  const registro = bruto as Record<string, unknown>;
  for (const c of GRAPHICS_CATEGORIES) {
    const valor = registro[c];
    if (isTomOuApresentacao(valor)) out[c] = apresentacaoDe(valor);
  }
  return out;
}

/** Normal opaco, o ponto de partida de toda categoria sem desvio de disciplina (§4.1). */
const NORMAL: Apresentacao = { tone: 'normal', clareamento: 0, opacidade: 1 };

/**
 * Apresentação predefinida de uma disciplina de elemento na planta de `trabalho` (tabela §4.2 convertida). Toda
 * Arquitetura vista de outra disciplina é referência bem translúcida (12%): paredes têm várias camadas, e a opacidade
 * por camada empilha no 3D. O resto dos `halftone` mantém o visual de hoje (clareamento 0,5, opaco). `geral` nunca
 * recebe tom: normal opaco.
 */
export function presetApresentacao(trabalho: Discipline, elemento: ElementDiscipline): Apresentacao {
  if (elemento === 'geral') return { ...NORMAL };
  if (trabalho !== 'arquitetura' && elemento === 'arquitetura') return { tone: 'halftone', clareamento: 0.2, opacidade: 0.12 };
  if (trabalho === 'arquitetura' && elemento === 'estrutura') return { ...NORMAL };
  const tone = presetTone(trabalho, elemento);
  return tone === 'halftone' ? { tone, clareamento: 0.5, opacidade: 1 } : { tone, clareamento: 0, opacidade: 1 };
}

/**
 * Apresentação de uma categoria na planta (adendo 3, decisão 4; plano de UX de 2026-11-23), precedência do mais forte
 * ao mais fraco:
 * 1. exceção da vista (`PlanView.tones[alvo]`), onde `alvo` é a disciplina do elemento ou a de origem da categoria;
 * 2. perfil da disciplina de trabalho da planta (`Project.disciplineProfiles`);
 * 3. predefinido (`presetApresentacao` da disciplina de trabalho; categorias `geral` nunca recebem tom, ficam `normal`).
 * Disciplina de trabalho inválida cai em `DEFAULT_DISCIPLINE`; valor gravado inválido é ignorado; nunca lança.
 */
export function apresentacaoDaCategoria(
  p: Pick<Project, 'disciplineProfiles' | 'categoryDiscipline' | 'disciplines'>,
  plan: Pick<PlanView, 'discipline' | 'tones'> | undefined,
  categoria: GraphicsCategory,
  disciplinaElemento?: ElementDiscipline,
): Apresentacao {
  const alvo = disciplinaElemento ?? disciplinaDaCategoria(p, categoria);
  // Elementos e categorias `geral` não dependem de disciplina (§4.1): nenhum perfil nem exceção se aplica.
  if (alvo === 'geral') return { ...NORMAL };
  const excecao = plan?.tones?.[alvo];
  if (isTomOuApresentacao(excecao)) return apresentacaoDe(excecao);
  const disciplinaDaPlanta = plan?.discipline;
  const trabalho = isDisciplineId(disciplinaDaPlanta) ? disciplinaDaPlanta : DEFAULT_DISCIPLINE;
  const doPerfil = perfilDaDisciplina(p, trabalho)[categoria];
  if (doPerfil !== undefined) return apresentacaoDe(doPerfil);
  return presetApresentacao(trabalho, alvo);
}

/**
 * Tom de uma categoria na planta: a mesma precedência de `apresentacaoDaCategoria`, só com o tom. Mantida para os
 * chamadores antigos que não usam clareamento/opacidade.
 */
export function tomDaCategoria(
  p: Pick<Project, 'disciplineProfiles' | 'categoryDiscipline' | 'disciplines'>,
  plan: Pick<PlanView, 'discipline' | 'tones'> | undefined,
  categoria: GraphicsCategory,
  disciplinaElemento?: ElementDiscipline,
): Apresentacao['tone'] {
  return apresentacaoDaCategoria(p, plan, categoria, disciplinaElemento).tone;
}

/**
 * Uma pessoa pode editar `el` trabalhando em `trabalho`? `true` com “Liberar edição” ou com `todas`; senão só na
 * disciplina dona do elemento (terreno e lote agora são de Arquitetura; `geral` só edita em `geral`). Nunca lança.
 */
export function podeEditar(
  p: Pick<Project, 'componentFamilies'>,
  el: Element,
  trabalho: Discipline | 'todas',
  liberar: boolean,
): boolean {
  if (liberar || trabalho === 'todas') return true;
  try {
    const dono = disciplineOfElement(el, p);
    // `geral` (CAD e importado sem classe IFC) é de Arquitetura para edição: é referência de projeto, não de MEP.
    if (dono === 'geral') return trabalho === 'geral' || trabalho === 'arquitetura';
    return dono === trabalho;
  } catch {
    return false;
  }
}
