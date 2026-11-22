import {
  DISCIPLINE_ORDER,
  DISCIPLINES,
  categoriasPorDisciplina,
  disciplinaDaCategoria,
  disciplinasDoProjeto,
  isDisciplineId,
  perfilDaDisciplina,
  tomDaCategoria,
  tomPredefinidoDaCategoria,
  type Discipline,
  type DisciplineProfile,
  type ElementDiscipline,
  type GraphicsCategory,
  type Project,
  type ProjectStore,
  type Tone,
} from '@hestia/model';
import { t, useI18n, type Lang } from './i18n.ts';

/**
 * Configurador de disciplinas (decisão 0060, adendo 3, decisões 1 a 4): funções puras da matriz categoria × tom e
 * ações de gestão das disciplinas do projeto. Nada aqui desenha: o diálogo é só a tela por cima destas funções, e os
 * comandos do modelo (`packages/model/src/disciplineProfileCommands.ts`) continuam sendo a única escrita.
 */

/** Uma linha da matriz: a categoria, o grupo (origem efetiva), o tom atual e o predefinido da disciplina de trabalho. */
export interface LinhaDaMatriz {
  categoria: GraphicsCategory;
  origem: ElementDiscipline;
  tom: Tone;
  predefinido: Tone;
}

/** Resultado de uma alteração: `error` traz a mensagem de quem recusou (nada é gravado). */
export interface DisciplineEdit {
  ok: boolean;
  error: string | null;
}

const OK: DisciplineEdit = { ok: true, error: null };

const falhou = (e: unknown): DisciplineEdit => ({
  ok: false,
  error: e instanceof Error ? e.message : t(useI18n.getState().lang, 'dlc_err_unknown'),
});

const idioma = (): Lang => useI18n.getState().lang;

/** Ordem dos grupos: as disciplinas conhecidas primeiro, depois as do projeto que ainda não estão na lista. */
function ordemDosGrupos(p: Pick<Project, 'disciplines'>): ElementDiscipline[] {
  const ordem: ElementDiscipline[] = [...DISCIPLINE_ORDER];
  for (const d of disciplinasDoProjeto(p)) if (!ordem.includes(d.id)) ordem.push(d.id);
  return ordem;
}

/**
 * Matriz do configurador para a disciplina de trabalho `disciplina`: uma linha por categoria de `GRAPHICS_CATEGORIES`,
 * agrupada pela origem EFETIVA (`disciplinaDaCategoria`, que já aplica o remapeamento do projeto). O tom é o que a
 * vista mostraria com essa disciplina de trabalho (`tomDaCategoria`) e o predefinido é o da tabela, sem remapeamento
 * (`tomPredefinidoDaCategoria`). Categoria nova no registro entra sozinha; nenhuma tela lista categorias à mão.
 */
export function linhasDaMatriz(p: Project, disciplina: Discipline): LinhaDaMatriz[] {
  const porOrigem = new Map<ElementDiscipline, GraphicsCategory[]>();
  for (const grupo of categoriasPorDisciplina()) {
    for (const categoria of grupo.categorias) {
      const origem = disciplinaDaCategoria(p, categoria);
      const lista = porOrigem.get(origem);
      if (lista) lista.push(categoria);
      else porOrigem.set(origem, [categoria]);
    }
  }
  const linhas: LinhaDaMatriz[] = [];
  for (const origem of ordemDosGrupos(p)) {
    const categorias = porOrigem.get(origem);
    if (!categorias) continue;
    for (const categoria of categorias) {
      linhas.push({
        categoria,
        origem,
        tom: tomDaCategoria(p, { discipline: disciplina }, categoria),
        predefinido: tomPredefinidoDaCategoria(disciplina, categoria),
      });
    }
  }
  return linhas;
}

/** Grava o tom de uma categoria no perfil da disciplina, preservando o restante do perfil existente. */
export function definirTomDaCategoria(store: ProjectStore, disciplina: Discipline, categoria: GraphicsCategory, tom: Tone): DisciplineEdit {
  try {
    const perfil: DisciplineProfile = { ...perfilDaDisciplina(store.project, disciplina) };
    perfil[categoria] = tom;
    store.exec({ type: 'setDisciplineProfile', discipline: disciplina, tones: perfil }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Limpa o perfil da disciplina: todas as categorias voltam ao predefinido num só passo de desfazer. */
export function restaurarPerfil(store: ProjectStore, disciplina: Discipline): DisciplineEdit {
  try {
    store.exec({ type: 'setDisciplineProfile', discipline: disciplina, tones: null }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Remapeia a disciplina de origem de uma categoria; sem disciplina, volta ao registro padrão. */
export function definirOrigemDaCategoria(store: ProjectStore, categoria: GraphicsCategory, disciplina?: Discipline): DisciplineEdit {
  try {
    store.exec({ type: 'setCategoryDiscipline', category: categoria, ...(disciplina === undefined ? {} : { discipline: disciplina }) }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Slug estável do nome: sem acentos, minúsculas, palavras unidas por `_` e no máximo 40 caracteres. */
function slugDoNome(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const limitado = base.slice(0, 40).replace(/_+$/g, '');
  return isDisciplineId(limitado) ? limitado : 'disciplina';
}

/** Id livre derivado do nome: repetido (inclusive com uma embutida), recebe sufixo numérico antes dos 40 caracteres. */
function idLivre(p: Pick<Project, 'disciplines'>, nome: string): Discipline {
  const usados = new Set<string>(DISCIPLINES);
  for (const item of p.disciplines ?? []) if (isDisciplineId(item?.id)) usados.add(item.id);
  const base = slugDoNome(nome);
  let id = base;
  let n = 2;
  while (usados.has(id)) {
    const sufixo = `_${n}`;
    id = `${base.slice(0, 40 - sufixo.length).replace(/_+$/g, '')}${sufixo}`;
    n += 1;
  }
  return id;
}

/** Cria uma disciplina do projeto; o id nasce do nome (slug) e ganha sufixo numérico quando já existe. */
export function criarDisciplina(store: ProjectStore, nome: string, cor?: string): DisciplineEdit {
  try {
    const id = idLivre(store.project, nome);
    store.exec({ type: 'addProjectDiscipline', discipline: { id, name: nome, ...(cor ? { color: cor } : {}) } }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Renomeia e/ou muda a cor de uma disciplina do projeto; embutidas são recusadas pelo comando. */
export function renomearDisciplina(store: ProjectStore, id: Discipline, nome: string, cor?: string): DisciplineEdit {
  try {
    store.exec({ type: 'updateProjectDiscipline', id, name: nome, ...(cor === undefined ? {} : { color: cor }) }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Exclui uma disciplina do projeto; plantas, famílias e remapeamentos voltam a Arquitetura num só passo. */
export function excluirDisciplina(store: ProjectStore, id: Discipline): DisciplineEdit {
  try {
    store.exec({ type: 'removeProjectDiscipline', id }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}
