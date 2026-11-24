import { LIMITES_REPRESENTACAO, ordemDeAvaliacao, tentar, type Env, type Familia, type Parametro, type Tipo, type Valor } from '@hestia/model';

/*
 * Verificações e tabelas de dimensões da família (CONTRATO §5). `avaliarVerificacoes` devolve um diagnóstico por condição
 * verdadeira, com `{param}` trocado pelo valor atual; `tabelaDaFamilia` monta a grade (cabeçalho + linhas) por tipo ou
 * com uma linha só da instância. Valores de comprimento e número ficam em mm; números saem com 0 casas. Nada lança por
 * entrada do usuário: fórmula ruim vira diagnóstico ou célula `—`. Função pura, sem relógio nem aleatório.
 */

export interface DiagnosticoVerificacao {
  id: string;
  severidade: 'aviso' | 'erro';
  mensagem: string;
  /** `verificacao:<id>`. */
  onde: string;
}

const RE_PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_.]*)\}/g;
const SEM_VALOR = '—';
const ARREDONDAR_MM = 1000;

/** Erro (`erro`) impede inserir a instância com estes valores (o painel mostra o motivo); `aviso` só mostra. */
export function temErro(diagnosticos: readonly DiagnosticoVerificacao[]): boolean {
  return diagnosticos.some((d) => d.severidade === 'erro');
}

/** Número sem casas decimais (mm); texto e booleano como estão; número inválido vira `—`. */
export function formatarValor(v: Valor): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v)) : SEM_VALOR;
  return String(v);
}

/** Troca cada `{nome}` pelo valor do ambiente; nome que não existe fica como está (a validação já o recusou). */
export function interpolar(mensagem: string, env: Env): string {
  return mensagem.replace(RE_PLACEHOLDER, (completo: string, nome: string) => {
    if (!Object.prototype.hasOwnProperty.call(env, nome)) return completo;
    const v = env[nome];
    return v === undefined ? completo : formatarValor(v);
  });
}

export function avaliarVerificacoes(familia: Familia, valores: Readonly<Record<string, Valor>>): DiagnosticoVerificacao[] {
  const verificacoes = lista(familia.verificacoes).slice(0, LIMITES_REPRESENTACAO.verificacoes);
  if (verificacoes.length === 0) return [];
  const env = ambienteDaFamilia(familia, valores);

  const out: DiagnosticoVerificacao[] = [];
  for (const v of verificacoes) {
    const onde = `verificacao:${v.id}`;
    const condicao = tentar(v.condicao, env);
    if (!condicao.ok) {
      out.push({ id: v.id, severidade: 'erro', mensagem: `verificação “${v.id}” não pôde ser avaliada: ${condicao.erro.message}`, onde });
      continue;
    }
    if (!ehVerdadeiro(condicao.valor)) continue;
    const mensagem = typeof v.mensagem === 'string' ? interpolar(v.mensagem, env) : '';
    out.push({ id: v.id, severidade: v.severidade, mensagem, onde });
  }
  return out;
}

/**
 * Grade da tabela: cabeçalho e linhas de texto. `porTipo`: uma linha por tipo, com a primeira coluna sendo o nome do
 * tipo; senão, uma linha só com os `valores` da instância. Coluna com unidade sai no cabeçalho como `Título (unidade)`.
 * Tabela inexistente devolve lista vazia.
 */
export function tabelaDaFamilia(
  familia: Familia,
  tabelaId: string,
  tipos: readonly Tipo[],
  valores: Readonly<Record<string, Valor>> = {},
): string[][] {
  const tabela = lista(familia.tabelas).find((t) => t.id === tabelaId);
  if (tabela === undefined) return [];

  const titulos = tabela.colunas.map((c) => (c.unidade !== undefined && c.unidade !== '' ? `${c.titulo} (${c.unidade})` : c.titulo));
  if (!tabela.porTipo) {
    return [titulos, linhaDe(tabela.colunas, ambienteDaFamilia(familia, valores))];
  }
  const linhas = tipos.map((tipo) => [tipo.nome, ...linhaDe(tabela.colunas, ambienteDaFamilia(familia, tipo.valores))]);
  return [['Tipo', ...titulos], ...linhas];
}

function linhaDe(colunas: readonly { valor: string }[], env: Env): string[] {
  return colunas.map((c) => {
    const r = tentar(c.valor, env);
    return r.ok ? formatarValor(r.valor) : SEM_VALOR;
  });
}

/**
 * Ambiente das fórmulas: valores dados (ou o padrão do parâmetro) para os parâmetros sem fórmula, `x.esp` para chapa e,
 * em seguida, os calculados na ordem de avaliação. Espelha o `prepararEnv` do resolvedor, sem os diagnósticos dele.
 * Um calculado que não avalia fica `NaN` (a condição que dele depende cai como falsa ou vira diagnóstico de erro).
 */
function ambienteDaFamilia(familia: Familia, valores: Readonly<Record<string, Valor>>): Record<string, Valor> {
  const env: Record<string, Valor> = {};
  const calculados = new Map<string, Parametro>();
  for (const p of familia.parametros) {
    if (p.formula !== undefined) {
      calculados.set(p.id, p);
      continue;
    }
    const v = Object.prototype.hasOwnProperty.call(valores, p.id) ? valores[p.id] : undefined;
    const valor = v ?? p.padrao;
    env[p.id] = valor;
    if (p.tipo === 'chapa') {
      const opcao = p.opcoes?.find((o) => o.valor === valor);
      env[`${p.id}.esp`] = opcao?.esp ?? Number.NaN;
    }
  }

  const ordem = ordemDeAvaliacao(familia);
  if (!ordem.ok) return env;
  for (const id of ordem.ordem) {
    const formula = calculados.get(id)?.formula;
    if (formula === undefined) continue;
    const r = tentar(formula, env);
    env[id] = r.ok ? arredondarMm(r.valor) : Number.NaN;
  }
  return env;
}

function arredondarMm(v: Valor): Valor {
  return typeof v === 'number' ? Math.round(v * ARREDONDAR_MM) / ARREDONDAR_MM : v;
}

function ehVerdadeiro(v: Valor): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return false;
}

function lista<T>(v: readonly T[] | undefined): readonly T[] {
  return Array.isArray(v) ? v : [];
}
