import { lista } from './edicaoApoio.ts';
import type { Familia } from './tipos.ts';
import { LIMITES_REPRESENTACAO, type CotaFamilia, type DetalheFamilia } from './tiposRepresentacao.ts';
import { validarDetalhes } from './validarDetalhes.ts';

/*
 * Operações de edição dos DETALHES e das COTAS (ficha D4; CONTRATO §5). Mesmo contrato de `edicaoLigacoes.ts`: puras sobre o
 * rascunho, devolvem `null` em sucesso ou o MOTIVO em português; com erro a família fica exatamente como estava. Cada operação
 * monta a lista nova, confere com `validarDetalhes` (a família inteira é o contexto) e só então grava.
 * A cota dirigida: `valorDaCotaParaParametro` calcula o novo valor do parâmetro (recusa fora de min/max) e
 * `editarCotaDirigida` o aplica; como roda dentro de `executar` do store, entra no histórico e tem desfazer.
 */

const SEM_LISTA = 'a família não tem lista de detalhes';

/** Resultado da conversão valor da cota → valor do parâmetro. */
export type ValorDeCota = { ok: true; parametro: string; valor: number } | { ok: false; motivo: string };

function primeiroErro(f: Familia, nova: DetalheFamilia[]): string | null {
  const erro = validarDetalhes({ ...f, detalhes: nova }).find((p) => p.nivel === 'erro');
  return erro === undefined ? null : `${erro.mensagem} (${erro.onde})`;
}

function gravar(f: Familia, nova: DetalheFamilia[]): string | null {
  const erro = primeiroErro(f, nova);
  if (erro !== null) return erro;
  f.detalhes = nova;
  return null;
}

function localizar(f: Familia, id: string): { indice: number; detalhe: DetalheFamilia } | string {
  if (f.detalhes !== undefined && !Array.isArray(f.detalhes)) return SEM_LISTA;
  const indice = lista<DetalheFamilia>(f.detalhes).findIndex((d) => d?.id === id);
  const detalhe = lista<DetalheFamilia>(f.detalhes)[indice];
  if (indice < 0 || detalhe === undefined) return `detalhe “${id}” não existe`;
  return { indice, detalhe };
}

function idOk(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== '';
}

/** Detalhe novo (planta, 1:20, sem cotas) pronto para `adicionarDetalhe`. */
export function criarDetalhePadrao(id: string, nome: string): DetalheFamilia {
  return { id, nome, vista: 'planta', escala: 20, cotas: [], simbolos: [] };
}

/** Acrescenta o detalhe ao fim. Erros: objeto inválido, id vazio/repetido, nome vazio, limite e tudo que `validarDetalhes` recusa. */
export function adicionarDetalhe(f: Familia, detalhe: DetalheFamilia): string | null {
  if (!detalhe || typeof detalhe !== 'object') return 'detalhe inválido';
  if (f.detalhes !== undefined && !Array.isArray(f.detalhes)) return SEM_LISTA;
  if (!idOk(detalhe.id)) return 'o detalhe precisa de um id não vazio';
  const atuais = lista<DetalheFamilia>(f.detalhes);
  if (atuais.some((d) => d?.id === detalhe.id)) return `id repetido: “${detalhe.id}”`;
  if (typeof detalhe.nome !== 'string' || detalhe.nome.trim() === '') return 'o detalhe precisa de um nome';
  if (atuais.length >= LIMITES_REPRESENTACAO.detalhes) return `limite de ${LIMITES_REPRESENTACAO.detalhes} detalhes atingido`;
  return gravar(f, [...atuais, detalhe]);
}

/** Troca os campos presentes no patch (`undefined` remove o campo opcional). O id e as cotas não mudam por aqui. */
export function editarDetalhe(f: Familia, id: string, patch: Partial<Omit<DetalheFamilia, 'id' | 'cotas'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'alteração inválida';
  if ('id' in patch || 'cotas' in patch) return 'o id e as cotas não mudam por aqui';
  if ('nome' in patch && (typeof patch.nome !== 'string' || patch.nome.trim() === '')) return 'o detalhe precisa de um nome';
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const novo: DetalheFamilia = { ...achado.detalhe, ...patch };
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete novo[k];
  const nova = [...lista<DetalheFamilia>(f.detalhes)];
  nova[achado.indice] = novo;
  return gravar(f, nova);
}

/** Remove o detalhe. Erro: inexistente. */
export function excluirDetalhe(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  const nova = lista<DetalheFamilia>(f.detalhes).filter((_, k) => k !== achado.indice);
  return gravar(f, nova);
}

/** Troca as cotas do detalhe pela lista nova, validando antes. */
function trocarCotas(f: Familia, detalheId: string, fazer: (cotas: CotaFamilia[]) => CotaFamilia[] | string): string | null {
  const achado = localizar(f, detalheId);
  if (typeof achado === 'string') return achado;
  const atuais = lista<CotaFamilia>(achado.detalhe.cotas);
  const novas = fazer([...atuais]);
  if (typeof novas === 'string') return novas;
  const nova = [...lista<DetalheFamilia>(f.detalhes)];
  nova[achado.indice] = { ...achado.detalhe, cotas: novas };
  return gravar(f, nova);
}

/** Acrescenta a cota ao detalhe. Erros: id vazio/repetido no detalhe, limite, referência inexistente, parâmetro que não pode ser dirigido. */
export function adicionarCota(f: Familia, detalheId: string, cota: CotaFamilia): string | null {
  if (!cota || typeof cota !== 'object') return 'cota inválida';
  if (!idOk(cota.id)) return 'a cota precisa de um id não vazio';
  return trocarCotas(f, detalheId, (cotas) => {
    if (cotas.some((c) => c?.id === cota.id)) return `id repetido: “${cota.id}”`;
    if (cotas.length >= LIMITES_REPRESENTACAO.cotas) return `limite de ${LIMITES_REPRESENTACAO.cotas} cotas atingido`;
    return [...cotas, cota];
  });
}

/** Troca os campos presentes no patch da cota (`undefined` remove o campo opcional). O id não muda. */
export function editarCota(f: Familia, detalheId: string, cotaId: string, patch: Partial<Omit<CotaFamilia, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'alteração inválida';
  if ('id' in patch) return 'o id da cota não muda';
  return trocarCotas(f, detalheId, (cotas) => {
    const k = cotas.findIndex((c) => c?.id === cotaId);
    const atual = cotas[k];
    if (k < 0 || atual === undefined) return `cota “${cotaId}” não existe`;
    const nova: CotaFamilia = { ...atual, ...patch };
    for (const campo of Object.keys(patch) as (keyof typeof patch)[]) if (patch[campo] === undefined) delete nova[campo];
    cotas[k] = nova;
    return cotas;
  });
}

/** Remove a cota do detalhe. */
export function excluirCota(f: Familia, detalheId: string, cotaId: string): string | null {
  return trocarCotas(f, detalheId, (cotas) => {
    if (!cotas.some((c) => c?.id === cotaId)) return `cota “${cotaId}” não existe`;
    return cotas.filter((c) => c?.id !== cotaId);
  });
}

/**
 * Cota dirigida: valor (mm) que o parâmetro passa a ter quando o usuário edita a cota para `novoValor` (mm). A cota mede o
 * parâmetro 1:1, então o valor é o próprio `novoValor`. Recusa (com o motivo): cota sem `parametro`, parâmetro inexistente,
 * calculado por fórmula ou não numérico, valor não finito, inteiro com fração e valor fora de `min`/`max` do parâmetro.
 * Função pura: não altera nada.
 */
export function valorDaCotaParaParametro(cota: CotaFamilia, novoValor: number, f: Familia): ValorDeCota {
  if (typeof cota?.parametro !== 'string') return { ok: false, motivo: 'a cota não é dirigida por parâmetro' };
  const p = lista(f.parametros).find((q) => q?.id === cota.parametro);
  if (p === undefined) return { ok: false, motivo: `o parâmetro “${cota.parametro}” não existe` };
  if (p.formula !== undefined) return { ok: false, motivo: `“${p.id}” é calculado por fórmula e não pode ser editado pela cota` };
  if (p.tipo !== 'comprimento' && p.tipo !== 'numero' && p.tipo !== 'inteiro') return { ok: false, motivo: `“${p.id}” não é um parâmetro numérico` };
  if (typeof novoValor !== 'number' || !Number.isFinite(novoValor)) return { ok: false, motivo: 'o valor precisa ser um número' };
  if (p.tipo === 'inteiro' && !Number.isInteger(novoValor)) return { ok: false, motivo: `“${p.id}” precisa de um valor inteiro` };
  if (p.min !== undefined && novoValor < p.min) return { ok: false, motivo: `${novoValor} é menor que o mínimo de “${p.id}” (${p.min})` };
  if (p.max !== undefined && novoValor > p.max) return { ok: false, motivo: `${novoValor} é maior que o máximo de “${p.id}” (${p.max})` };
  return { ok: true, parametro: p.id, valor: novoValor };
}

/** Aplica a edição da cota dirigida: grava o valor novo no `padrao` do parâmetro (tipos que o recebem na instância ficam como estão). */
export function editarCotaDirigida(f: Familia, detalheId: string, cotaId: string, novoValor: number): string | null {
  const achado = localizar(f, detalheId);
  if (typeof achado === 'string') return achado;
  const cota = lista<CotaFamilia>(achado.detalhe.cotas).find((c) => c?.id === cotaId);
  if (cota === undefined) return `cota “${cotaId}” não existe`;
  const r = valorDaCotaParaParametro(cota, novoValor, f);
  if (!r.ok) return r.motivo;
  const p = lista(f.parametros).find((q) => q?.id === r.parametro);
  if (p === undefined) return `o parâmetro “${r.parametro}” não existe`;
  p.padrao = r.valor;
  return null;
}
