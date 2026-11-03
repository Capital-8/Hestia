import { idLivre, lista } from './edicaoApoio.ts';
import { LIMITES, type Familia, type Parametro, type Tipo, type Valor } from './tipos.ts';
import { valorCompativel } from './validarValores.ts';

/*
 * Operações de edição dos tipos (ficha E4-edicao). Ver o contrato em `edicao.ts`. Todas conferem antes de alterar: com erro,
 * a família fica exatamente como estava.
 */

/** Id a partir do nome: minúsculas sem acento e sem `_` nas pontas. */
function normalizarId(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Cria o tipo `nome` (id = nome normalizado: minúsculas sem acento, `[^a-z0-9]+` → `_`, sem `_` nas pontas, único com sufixo `_2`…) com `valores` vazios. Erros: nome vazio, limite de LIMITES.tipos. */
export function adicionarTipo(f: Familia, nome: string): string | null {
  if (!Array.isArray(f.tipos)) return 'a família não tem lista de tipos';
  if (typeof nome !== 'string' || nome.trim() === '') return 'nome vazio';
  if (f.tipos.length >= LIMITES.tipos) return `limite de ${LIMITES.tipos} tipos atingido`;

  const base = normalizarId(nome);
  if (base === '') return 'nome vazio';
  const id = idLivre(base, f.tipos.map((t) => t.id));

  f.tipos.push({ id, nome, valores: {} });
  return null;
}

/** Duplica o tipo (valores copiados) logo depois, com nome `<nome> (cópia)` e id único. */
export function duplicarTipo(f: Familia, id: string): string | null {
  if (!Array.isArray(f.tipos)) return 'a família não tem lista de tipos';
  const indice = f.tipos.findIndex((t) => t?.id === id);
  if (indice < 0) return `tipo “${id}” não existe`;

  const original = f.tipos[indice]!;
  const copia = structuredClone(original);
  copia.id = idLivre(original.id, f.tipos.map((t) => t.id));
  copia.nome = `${original.nome} (cópia)`;
  f.tipos.splice(indice + 1, 0, copia);
  return null;
}

/** Remove o tipo (pode ser o único); se era o `tipoPadrao`, `tipoPadrao` passa a ser o primeiro tipo restante (ou a chave some se não restar nenhum). */
export function excluirTipo(f: Familia, id: string): string | null {
  if (!Array.isArray(f.tipos)) return 'a família não tem lista de tipos';
  const indice = f.tipos.findIndex((t) => t?.id === id);
  if (indice < 0) return `tipo “${id}” não existe`;

  f.tipos.splice(indice, 1);
  if (f.tipoPadrao === id) {
    const primeiro = f.tipos[0];
    if (primeiro !== undefined) f.tipoPadrao = primeiro.id;
    else delete f.tipoPadrao;
  }
  return null;
}

/**
 * Define o valor de um parâmetro num tipo; `valor` indefinido REMOVE a chave (volta ao padrão). Erros: tipo/parâmetro inexistente,
 * parâmetro com fórmula, valor de tipo errado para o parâmetro (mesmas regras do `padrao`), valor fora das opções (enum/chapa),
 * fora de [min, max] para números.
 */
export function definirValorDeTipo(f: Familia, tipoId: string, paramId: string, valor: Valor | undefined): string | null {
  const tipo = lista<Tipo>(f.tipos).find((t) => t?.id === tipoId);
  if (tipo === undefined) return `tipo “${tipoId}” não existe`;
  const parametro = lista<Parametro>(f.parametros).find((p) => p?.id === paramId);
  if (parametro === undefined) return `parâmetro “${paramId}” não existe`;

  const valores = tipo.valores;
  if (valores === undefined || typeof valores !== 'object') return `o tipo “${tipoId}” não tem valores`;
  if (parametro.formula !== undefined) return `o parâmetro “${paramId}” tem fórmula e não aceita valor de tipo`;
  if (valor === undefined) {
    delete valores[paramId];
    return null;
  }
  if (!valorCompativel(parametro.tipo, valor, parametro.opcoes)) return `o valor não é compatível com o tipo “${parametro.tipo}”`;
  if (typeof valor === 'number') {
    if (parametro.min !== undefined && valor < parametro.min) return `o valor ${valor} está abaixo do mínimo ${parametro.min}`;
    if (parametro.max !== undefined && valor > parametro.max) return `o valor ${valor} está acima do máximo ${parametro.max}`;
  }

  valores[paramId] = valor;
  return null;
}
