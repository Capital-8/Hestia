import { compilar, referencias } from './expressao.ts';
import type { Familia } from './tipos.ts';
import { LIMITES_REPRESENTACAO } from './tiposRepresentacao.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Validação das REPRESENTAÇÕES que dependem de fórmulas (CONTRATO §5, ADR 0061 §D4): tabelas de dimensões e verificações.
 * Confere ids, limites, colunas (título, unidade e fórmula), condições e os placeholders `{param}` das mensagens, sempre
 * pelo escopo dos parâmetros da família. Nada aqui repete, então `i` e `n` não valem. Símbolos e detalhes ficam fora.
 * Nunca lança: entrada estranha vira `Problema`. Função pura.
 */

const RE_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RE_PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_.]*)\}/g;
const RESERVADOS = new Set(['i', 'n']);
const SEVERIDADES: readonly string[] = ['aviso', 'erro'];

/** Escopo de nomes das fórmulas de representação: ids dos parâmetros e `x.esp` para os de tipo chapa. */
interface Escopo {
  ids: Set<string>;
  chapas: Set<string>;
}

export function validarRepresentacao(f: Familia): Problema[] {
  const escopo = escopoDeParametros(f);
  return [...validarTabelas(f, escopo), ...validarVerificacoes(f, escopo)];
}

function escopoDeParametros(f: Familia): Escopo {
  const ids = new Set<string>();
  const chapas = new Set<string>();
  for (const p of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(p) || typeof p.id !== 'string') continue;
    ids.add(p.id);
    if (p.tipo === 'chapa') chapas.add(p.id);
  }
  return { ids, chapas };
}

function validarTabelas(f: Familia, escopo: Escopo): Problema[] {
  if (f.tabelas === undefined) return [];
  if (!Array.isArray(f.tabelas)) return [criarProblema('tipo', 'tabelas precisa ser uma lista', 'familia')];
  const tabelas = comoArray<unknown>(f.tabelas);
  const out: Problema[] = [];
  if (tabelas.length > LIMITES_REPRESENTACAO.tabelas) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_REPRESENTACAO.tabelas} tabelas`, 'familia'));
  }

  const vistos = new Set<string>();
  tabelas.forEach((tabela, k) => {
    if (!ehObjeto(tabela)) {
      out.push(criarProblema('tipo', 'a tabela precisa ser um objeto', `tabelas[${k}]`));
      return;
    }
    const onde = `tabela:${texto(tabela.id)}`;
    conferirId(tabela.id, `tabelas[${k}]`, onde, vistos, out);
    if (typeof tabela.nome !== 'string' || tabela.nome.trim() === '') {
      out.push(criarProblema('obrigatorio', 'tabela sem nome', `${onde}.nome`));
    }
    if (tabela.porTipo === undefined) {
      out.push(criarProblema('obrigatorio', 'porTipo ausente (verdadeiro: uma linha por tipo; falso: uma linha da instância)', `${onde}.porTipo`));
    } else if (typeof tabela.porTipo !== 'boolean') {
      out.push(criarProblema('tipo', 'porTipo precisa ser verdadeiro ou falso', `${onde}.porTipo`));
    }
    validarColunas(tabela, onde, escopo, out);
  });
  return out;
}

/** Colunas: pelo menos uma, no máximo o limite; cada uma com título, unidade textual opcional e fórmula válida. */
function validarColunas(tabela: Record<string, unknown>, onde: string, escopo: Escopo, out: Problema[]): void {
  if (tabela.colunas === undefined) {
    out.push(criarProblema('obrigatorio', 'colunas ausentes', `${onde}.colunas`));
    return;
  }
  if (!Array.isArray(tabela.colunas)) {
    out.push(criarProblema('tipo', 'colunas precisa ser uma lista', `${onde}.colunas`));
    return;
  }
  const colunas = comoArray<unknown>(tabela.colunas);
  if (colunas.length === 0) out.push(criarProblema('obrigatorio', 'a tabela precisa de ao menos uma coluna', `${onde}.colunas`));
  if (colunas.length > LIMITES_REPRESENTACAO.colunas) {
    out.push(criarProblema('limite', `a tabela passa de ${LIMITES_REPRESENTACAO.colunas} colunas`, `${onde}.colunas`));
  }

  colunas.slice(0, LIMITES_REPRESENTACAO.colunas).forEach((coluna, j) => {
    const campo = `${onde}.colunas[${j}]`;
    if (!ehObjeto(coluna)) {
      out.push(criarProblema('tipo', 'a coluna precisa ser um objeto', campo));
      return;
    }
    if (typeof coluna.titulo !== 'string' || coluna.titulo.trim() === '') {
      out.push(criarProblema('obrigatorio', 'coluna sem título', `${campo}.titulo`));
    }
    if (coluna.unidade !== undefined && typeof coluna.unidade !== 'string') {
      out.push(criarProblema('tipo', 'unidade precisa ser texto', `${campo}.unidade`));
    }
    validarFormula(coluna.valor, `${campo}.valor`, escopo, out);
  });
}

function validarVerificacoes(f: Familia, escopo: Escopo): Problema[] {
  if (f.verificacoes === undefined) return [];
  if (!Array.isArray(f.verificacoes)) return [criarProblema('tipo', 'verificacoes precisa ser uma lista', 'familia')];
  const verificacoes = comoArray<unknown>(f.verificacoes);
  const out: Problema[] = [];
  if (verificacoes.length > LIMITES_REPRESENTACAO.verificacoes) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_REPRESENTACAO.verificacoes} verificações`, 'familia'));
  }

  const vistos = new Set<string>();
  verificacoes.forEach((v, k) => {
    if (!ehObjeto(v)) {
      out.push(criarProblema('tipo', 'a verificação precisa ser um objeto', `verificacoes[${k}]`));
      return;
    }
    const onde = `verificacao:${texto(v.id)}`;
    conferirId(v.id, `verificacoes[${k}]`, onde, vistos, out);
    if (typeof v.severidade !== 'string' || !SEVERIDADES.includes(v.severidade)) {
      out.push(criarProblema('tipo', `severidade desconhecida “${texto(v.severidade)}” (use aviso ou erro)`, `${onde}.severidade`));
    }
    validarFormula(v.condicao, `${onde}.condicao`, escopo, out);
    validarMensagem(v.mensagem, `${onde}.mensagem`, escopo, out);
  });
  return out;
}

/** Id de tabela ou de verificação: texto no formato de identificador e único dentro da sua lista. */
function conferirId(id: unknown, campoLista: string, onde: string, vistos: Set<string>, out: Problema[]): void {
  if (id === undefined || typeof id !== 'string') {
    out.push(criarProblema('id_invalido', `${campoLista} sem id`, onde));
    return;
  }
  if (!RE_ID.test(id)) {
    out.push(criarProblema('id_invalido', `id “${id}” fora do formato de identificador`, onde));
    return;
  }
  if (vistos.has(id)) {
    out.push(criarProblema('id_duplicado', `id “${id}” já existe nesta lista`, onde));
    return;
  }
  vistos.add(id);
}

/** Fórmula obrigatória: compila e só usa nomes do escopo. */
function validarFormula(valor: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (valor === undefined) {
    out.push(criarProblema('obrigatorio', 'fórmula ausente', campo));
    return;
  }
  if (typeof valor !== 'string') {
    out.push(criarProblema('tipo', 'expressão precisa ser texto', campo));
    return;
  }
  const compilado = compilar(valor);
  if ('erro' in compilado) {
    out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo));
    return;
  }
  for (const nome of referencias(compilado.no)) {
    if (!referenciaValida(nome, escopo)) out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo));
  }
}

/** Mensagem obrigatória; cada `{nome}` precisa ser parâmetro (ou `x.esp` de chapa) da família. */
function validarMensagem(mensagem: unknown, campo: string, escopo: Escopo, out: Problema[]): void {
  if (mensagem === undefined) {
    out.push(criarProblema('obrigatorio', 'mensagem ausente', campo));
    return;
  }
  if (typeof mensagem !== 'string' || mensagem.trim() === '') {
    out.push(criarProblema('tipo', 'mensagem precisa ser um texto não vazio', campo));
    return;
  }
  for (const casamento of mensagem.matchAll(RE_PLACEHOLDER)) {
    const nome = casamento[1];
    if (nome !== undefined && !referenciaValida(nome, escopo)) {
      out.push(criarProblema('referencia', `{${nome}} não é parâmetro da família`, campo));
    }
  }
}

function referenciaValida(nome: string, escopo: Escopo): boolean {
  if (RESERVADOS.has(nome)) return false;
  if (escopo.ids.has(nome)) return true;
  const partes = nome.split('.');
  return partes.length === 2 && partes[1] === 'esp' && partes[0] !== undefined && escopo.chapas.has(partes[0]);
}
