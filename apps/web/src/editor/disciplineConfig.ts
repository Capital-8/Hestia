import {
  DISCIPLINE_ORDER,
  DISCIPLINES,
  apresentacaoDaCategoria,
  categoriasPorDisciplina,
  disciplinaDaCategoria,
  disciplinasDoProjeto,
  isDisciplineId,
  perfilDaDisciplina,
  presetApresentacao,
  type Apresentacao,
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
 * Configurador de disciplinas (decisão 0060, adendo 3, decisões 1 a 4; plano de UX de 2026-11-23): funções puras da
 * matriz categoria × apresentação, do resumo disciplina × estado e ações de gestão das disciplinas do projeto. Nada
 * aqui desenha: o diálogo é só a tela por cima destas funções, e os comandos do modelo
 * (`packages/model/src/disciplineProfileCommands.ts`) continuam sendo a única escrita.
 */

/** Uma linha da matriz: a categoria, o grupo (origem efetiva), a apresentação atual e a predefinida da disciplina de trabalho. */
export interface LinhaDaMatriz {
  categoria: GraphicsCategory;
  origem: ElementDiscipline;
  apresentacao: Apresentacao;
  predefinida: Apresentacao;
}

/**
 * Uma linha do modo simples: a outra disciplina, o estado agregado das categorias dela (Normal/Referência/Oculto) e as
 * médias de clareamento e opacidade que a vista mostraria com a disciplina de trabalho.
 */
export interface LinhaSimples {
  disciplina: Discipline;
  estado: Tone;
  clareamento: number;
  opacidade: number;
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

/** Normal opaco e oculto, os dois pontos fixos do modo simples (clareamento e opacidade neutros). */
const NORMAL: Apresentacao = { tone: 'normal', clareamento: 0, opacidade: 1 };
const HIDDEN: Apresentacao = { tone: 'hidden', clareamento: 0, opacidade: 1 };

/** Ordem dos grupos: as disciplinas conhecidas primeiro, depois as do projeto que ainda não estão na lista. */
function ordemDosGrupos(p: Pick<Project, 'disciplines'>): ElementDiscipline[] {
  const ordem: ElementDiscipline[] = [...DISCIPLINE_ORDER];
  for (const d of disciplinasDoProjeto(p)) if (!ordem.includes(d.id)) ordem.push(d.id);
  return ordem;
}

/** Categorias efetivas de cada disciplina de origem (aplica o remapeamento do projeto). */
function categoriasDaDisciplina(p: Pick<Project, 'disciplines' | 'categoryDiscipline'>): Map<ElementDiscipline, GraphicsCategory[]> {
  const porDisciplina = new Map<ElementDiscipline, GraphicsCategory[]>();
  for (const grupo of categoriasPorDisciplina()) {
    for (const categoria of grupo.categorias) {
      const origem = disciplinaDaCategoria(p, categoria);
      const lista = porDisciplina.get(origem);
      if (lista) lista.push(categoria);
      else porDisciplina.set(origem, [categoria]);
    }
  }
  return porDisciplina;
}

/** Apresentação que corresponde a um estado do modo simples: Referência usa o predefinido do par. */
export function apresentacaoDoEstado(trabalho: Discipline, alvo: ElementDiscipline, estado: Tone): Apresentacao {
  if (estado === 'halftone') return presetApresentacao(trabalho, alvo);
  if (estado === 'hidden') return { ...HIDDEN };
  return { ...NORMAL };
}

/**
 * Matriz do configurador para a disciplina de trabalho `disciplina`: uma linha por categoria de `GRAPHICS_CATEGORIES`,
 * agrupada pela origem EFETIVA (`disciplinaDaCategoria`, que já aplica o remapeamento do projeto). A apresentação é o
 * que a vista mostraria com essa disciplina de trabalho (`apresentacaoDaCategoria`) e a predefinida é a do par
 * trabalho/origem (`presetApresentacao`). Categoria nova no registro entra sozinha; nenhuma tela lista categorias à mão.
 */
export function linhasDaMatriz(p: Project, disciplina: Discipline): LinhaDaMatriz[] {
  const porOrigem = categoriasDaDisciplina(p);
  const linhas: LinhaDaMatriz[] = [];
  for (const origem of ordemDosGrupos(p)) {
    const categorias = porOrigem.get(origem);
    if (!categorias) continue;
    for (const categoria of categorias) {
      linhas.push({
        categoria,
        origem,
        apresentacao: apresentacaoDaCategoria(p, { discipline: disciplina }, categoria),
        predefinida: presetApresentacao(disciplina, origem),
      });
    }
  }
  return linhas;
}

/** Média arredondada a quatro casas, para o resumo não exibir ruído de ponto flutuante. */
function media(valores: number[]): number {
  if (valores.length === 0) return 0;
  const soma = valores.reduce((acc, v) => acc + v, 0);
  return Math.round((soma / valores.length) * 10000) / 10000;
}

/** Estado agregado: tudo normal/nada; tudo oculto/oculto; qualquer mistura (ou referência) vira Referência. */
function estadoAgregado(tons: Tone[]): Tone {
  if (tons.length === 0 || tons.every((tone) => tone === 'normal')) return 'normal';
  if (tons.every((tone) => tone === 'hidden')) return 'hidden';
  return 'halftone';
}

/**
 * Resumo do modo simples para as OUTRAS disciplinas do projeto (a de trabalho fica de fora): o estado agregado das
 * categorias de cada uma e as médias de clareamento/opacidade que `apresentacaoDaCategoria` devolve. Disciplina criada
 * sem categorias aparece como Normal opaca (nada dela para esconder).
 */
export function linhasSimples(p: Project, disciplina: Discipline): LinhaSimples[] {
  const porDisciplina = categoriasDaDisciplina(p);
  return disciplinasDoProjeto(p)
    .filter((d) => d.id !== disciplina)
    .map((d) => {
      const categorias = porDisciplina.get(d.id) ?? [];
      const apresentacoes = categorias.map((categoria) => apresentacaoDaCategoria(p, { discipline: disciplina }, categoria));
      return {
        disciplina: d.id,
        estado: estadoAgregado(apresentacoes.map((a) => a.tone)),
        clareamento: media(apresentacoes.map((a) => a.clareamento ?? 0)),
        opacidade: apresentacoes.length === 0 ? 1 : media(apresentacoes.map((a) => a.opacidade ?? 1)),
      };
    });
}

/** Grava a apresentação de uma categoria no perfil da disciplina, preservando o restante do perfil existente. */
export function definirApresentacaoDaCategoria(
  store: ProjectStore,
  disciplina: Discipline,
  categoria: GraphicsCategory,
  apresentacao: Apresentacao,
): DisciplineEdit {
  try {
    const perfil: DisciplineProfile = { ...perfilDaDisciplina(store.project, disciplina) };
    perfil[categoria] = { ...apresentacao };
    store.exec({ type: 'setDisciplineProfile', discipline: disciplina, tones: perfil }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/**
 * Aplica a mesma apresentação a todas as categorias da disciplina `alvo` no perfil de `trabalho` (padrão: o próprio
 * `alvo`), num só passo de desfazer e preservando as demais categorias do perfil. É o que o modo simples usa ao marcar
 * Normal/Referência/Oculto na linha de uma disciplina.
 */
export function definirApresentacaoDaDisciplina(
  store: ProjectStore,
  alvo: Discipline,
  apresentacao: Apresentacao,
  trabalho: Discipline = alvo,
): DisciplineEdit {
  try {
    const p = store.project;
    const perfil: DisciplineProfile = { ...perfilDaDisciplina(p, trabalho) };
    for (const [disciplina, categorias] of categoriasDaDisciplina(p)) {
      if (disciplina !== alvo) continue;
      for (const categoria of categorias) perfil[categoria] = { ...apresentacao };
    }
    store.exec({ type: 'setDisciplineProfile', discipline: trabalho, tones: perfil }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/** Prende o valor em 0..1 (fora da faixa ou NaN cai no limite mais próximo). */
function fracao(valor: number): number {
  if (!Number.isFinite(valor)) return 1;
  return Math.min(1, Math.max(0, valor));
}

/**
 * Slider global “Opacidade das referências”: grava a mesma opacidade em toda categoria que a vista mostraria em
 * Referência (meio-tom) com a disciplina de trabalho, preservando tom e clareamento. Ocultos e normais ficam intactos;
 * tudo num comando só.
 */
export function definirOpacidadeDasReferencias(store: ProjectStore, disciplina: Discipline, opacidade: number): DisciplineEdit {
  try {
    const p = store.project;
    const perfil: DisciplineProfile = { ...perfilDaDisciplina(p, disciplina) };
    for (const grupo of categoriasPorDisciplina()) {
      for (const categoria of grupo.categorias) {
        const atual = apresentacaoDaCategoria(p, { discipline: disciplina }, categoria);
        if (atual.tone !== 'halftone') continue;
        perfil[categoria] = { ...atual, opacidade: fracao(opacidade) };
      }
    }
    store.exec({ type: 'setDisciplineProfile', discipline: disciplina, tones: perfil }, undefined, idioma());
    return OK;
  } catch (e) {
    return falhou(e);
  }
}

/**
 * “Copiar de…”: copia a aparência efetiva da disciplina `origem` (o que a vista mostraria trabalhando nela) para o
 * perfil de `destino`, num comando só. Perfil vazio na origem limpa o destino e volta ao predefinido.
 */
export function copiarPerfilDe(store: ProjectStore, destino: Discipline, origem: Discipline): DisciplineEdit {
  try {
    const p = store.project;
    const perfil: DisciplineProfile = {};
    for (const grupo of categoriasPorDisciplina()) {
      for (const categoria of grupo.categorias) {
        perfil[categoria] = { ...apresentacaoDaCategoria(p, { discipline: origem }, categoria) };
      }
    }
    store.exec({ type: 'setDisciplineProfile', discipline: destino, tones: perfil }, undefined, idioma());
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
