import { idLivre, idValido, lista } from './edicaoApoio.ts';
import type { Familia } from './tipos.ts';
import type { Ponto3 } from './tiposCorpo.ts';
import { LIMITES_LIGACAO, type DominioLigacao, type Ligacao, type SecaoLigacao } from './tiposLigacao.ts';
import { validarLigacoes } from './validarLigacoes.ts';

/*
 * Operações de edição das LIGAÇÕES (ficha C2; semântica em docs/familias-parametricas/CONTRATO.md §3). Mesmo contrato de
 * `edicaoCorpos.ts`: puras sobre o rascunho, devolvem `null` em sucesso ou o MOTIVO em português; com erro a família fica
 * exatamente como estava. Cada operação monta a ligação NOVA, confere com `validarLigacoes` (a família inteira serve de
 * contexto) e só então grava: o erro nunca deixa o rascunho pela metade.
 */

const SEM_LISTA = 'a família não tem lista de ligações';
const NUMERO_LITERAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** Ids das ligações já existentes (a unicidade vale só dentro da lista de ligações). */
function idsDasLigacoes(f: Familia): string[] {
  const out: string[] = [];
  for (const l of lista<Ligacao>(f.ligacoes)) if (typeof l?.id === 'string') out.push(l.id);
  return out;
}

/** Primeiro problema de ERRO que `validarLigacoes` acha na família com a lista nova, ou `null`. */
function problemaDaListaNova(f: Familia, nova: Ligacao[]): string | null {
  const erro = validarLigacoes({ ...f, ligacoes: nova }).find((p) => p.nivel === 'erro');
  return erro === undefined ? null : `${erro.mensagem} (${erro.onde})`;
}

/** Confere a lista nova e, só se estiver válida, grava no lugar da antiga. */
function gravarLista(f: Familia, nova: Ligacao[]): string | null {
  const erro = problemaDaListaNova(f, nova);
  if (erro !== null) return erro;
  f.ligacoes = nova;
  return null;
}

/** Ligação pelo id: índice e objeto, ou o motivo da recusa (lista ausente/corrompida ou id inexistente). */
function localizar(f: Familia, id: string): { indice: number; ligacao: Ligacao } | string {
  if (f.ligacoes !== undefined && !Array.isArray(f.ligacoes)) return SEM_LISTA;
  const indice = lista<Ligacao>(f.ligacoes).findIndex((l) => l?.id === id);
  const ligacao = lista<Ligacao>(f.ligacoes)[indice];
  if (indice < 0 || ligacao === undefined) return `ligação “${id}” não existe`;
  return { indice, ligacao };
}

/** Texto do sinal trocado: `"5"` → `"-5"`, `"-5"` → `"5"`, zero fica zero; fórmula vira `-(…)`. */
function negarExpr(e: string): string {
  const limpo = e.trim();
  if (NUMERO_LITERAL.test(limpo)) {
    if (/^[+-]?0*(?:\.0*)?$/.test(limpo)) return limpo;
    if (limpo.startsWith('-')) return limpo.slice(1);
    return `-${limpo.startsWith('+') ? limpo.slice(1) : limpo}`;
  }
  return `-(${e})`;
}

/** Acrescenta a ligação ao fim (cria a lista se não houver). Erros: objeto inválido, lista corrompida, id vazio ou repetido, nome vazio, limite e tudo que `validarLigacoes` recusa. */
export function adicionarLigacao(f: Familia, ligacao: Ligacao): string | null {
  if (!ligacao || typeof ligacao !== 'object') return 'ligação inválida';
  if (f.ligacoes !== undefined && !Array.isArray(f.ligacoes)) return SEM_LISTA;
  if (!idValido(ligacao.id)) return 'a ligação precisa de um id não vazio';
  if (idsDasLigacoes(f).includes(ligacao.id)) return `id repetido: “${ligacao.id}”`;
  if (typeof ligacao.nome !== 'string' || ligacao.nome.trim() === '') return 'a ligação precisa de um nome';
  const atuais = lista<Ligacao>(f.ligacoes);
  if (atuais.length >= LIMITES_LIGACAO.ligacoes) return `limite de ${LIMITES_LIGACAO.ligacoes} ligações atingido`;
  return gravarLista(f, [...atuais, ligacao]);
}

/** Troca os campos presentes no patch (`undefined` remove o campo). O id não muda. Erros: patch inválido, id no patch, nome vazio, ligação inexistente, medida ou direção inválidas. */
export function editarLigacao(f: Familia, id: string, patch: Partial<Omit<Ligacao, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'patch inválido';
  if ('id' in patch) return 'o id da ligação não muda por edição';
  if (patch.nome !== undefined && (typeof patch.nome !== 'string' || patch.nome.trim() === '')) return 'a ligação precisa de um nome';
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;

  const nova: Ligacao = { ...achado.ligacao, ...patch };
  for (const chave of Object.keys(patch) as (keyof typeof patch)[]) {
    if (patch[chave] === undefined) Reflect.deleteProperty(nova, chave);
  }
  const lista2 = lista<Ligacao>(f.ligacoes).slice();
  lista2[achado.indice] = nova;
  return gravarLista(f, lista2);
}

/** Remove a ligação pelo id. Recusada se a validação do restante da família quebrar (a família fica como estava). */
export function excluirLigacao(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const nova = lista<Ligacao>(f.ligacoes).filter((_, k) => k !== achado.indice);
  return gravarLista(f, nova);
}

/** Cópia da ligação logo após a original, com id livre e nome "… (cópia)". Mesma posição: a edição a move depois. */
export function duplicarLigacao(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const novoId = idLivre(achado.ligacao.id, idsDasLigacoes(f));
  const copia: Ligacao = structuredClone({ ...achado.ligacao, id: novoId, nome: `${achado.ligacao.nome} (cópia)` });
  const nova = lista<Ligacao>(f.ligacoes).slice();
  nova.splice(achado.indice + 1, 0, copia);
  if (nova.length > LIMITES_LIGACAO.ligacoes) return `limite de ${LIMITES_LIGACAO.ligacoes} ligações atingido`;
  return gravarLista(f, nova);
}

/** Cópia espelhada em X (posição e direção com X trocado de sinal), logo após a original. Medidas, domínio e fluxo iguais. */
export function espelharLigacaoEmX(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const original = achado.ligacao;
  const espelho: Ligacao = structuredClone({
    ...original,
    id: idLivre(original.id, idsDasLigacoes(f)),
    nome: `${original.nome} (espelho)`,
    posicao: [negarExpr(original.posicao[0]), original.posicao[1], original.posicao[2]] as Ponto3,
    direcao: [negarExpr(original.direcao[0]), original.direcao[1], original.direcao[2]] as Ponto3,
  });
  const nova = lista<Ligacao>(f.ligacoes).slice();
  nova.splice(achado.indice + 1, 0, espelho);
  if (nova.length > LIMITES_LIGACAO.ligacoes) return `limite de ${LIMITES_LIGACAO.ligacoes} ligações atingido`;
  return gravarLista(f, nova);
}

/**
 * Ligação nova com valores padrão para o domínio e a seção: direção para cima (+Z), fluxo `ambos` (casa com qualquer
 * sentido), medidas de 20 mm (redonda) ou 100 × 50 mm (retangular). Não grava nada: quem chama passa pelo `adicionarLigacao`.
 * O id padrão é `ligacao`; quem chama troca por um id livre antes de gravar.
 */
export function criarLigacaoPadrao(dominio: DominioLigacao, secao: SecaoLigacao, id = 'ligacao'): Ligacao {
  const base: Ligacao = {
    id,
    nome: id,
    dominio,
    secao,
    posicao: ['0', '0', '0'],
    direcao: ['0', '0', '1'],
    fluxo: 'ambos',
  };
  if (secao === 'redonda') return { ...base, diametro: '20' };
  return { ...base, largura: '100', altura: '50' };
}
