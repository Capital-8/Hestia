import { idReservado, idValido, idsOcupados, lista, usosDoNomeEm, usaNome } from './edicaoApoio.ts';
import { LIMITES, PARAMETROS_PADRAO, type Conector, type Escolha, type Familia, type Parametro, type Tipo } from './tipos.ts';
import { valorCompativel } from './validarValores.ts';

/*
 * Operações de edição dos parâmetros e dos planos (ficha E4-edicao). Ver o contrato em `edicao.ts`. Todas conferem antes de
 * alterar: com erro, a família fica exatamente como estava.
 */

/** Acrescenta o parâmetro ao fim. Erros: id inválido/reservado/repetido, limite de LIMITES.parametros, `padrao` de tipo errado para o `tipo`. */
export function adicionarParametro(f: Familia, p: Parametro): string | null {
  if (!p || typeof p !== 'object') return 'parâmetro inválido';
  if (!Array.isArray(f.parametros)) return 'a família não tem lista de parâmetros';
  if (!idValido(p.id)) return `id inválido: “${String(p.id)}”`;
  if (idReservado(p.id)) return `id reservado: “${p.id}”`;
  if (idsOcupados(f).has(p.id)) return `id repetido: “${p.id}”`;
  if (f.parametros.length >= LIMITES.parametros) return `limite de ${LIMITES.parametros} parâmetros atingido`;
  if (!valorCompativel(p.tipo, p.padrao, p.opcoes)) return `o padrão não é compatível com o tipo “${p.tipo}”`;

  f.parametros.push(p);
  return null;
}

/**
 * Remove o parâmetro. Recusa se houver uso FORA de `tipo.valores` (filtre de `usosDoNome` os lugares que começam com `tipo:`): o motivo
 * lista até 3 lugares ("em uso: peca:base.origem[0], …"). Recusa também L, A e P. Remove a chave dele em todos os `tipo.valores`.
 * Uso por escolha (`escolha:<id>`) ou por `folga` de conector (`conector:<id>.folga`) também recusa.
 */
export function excluirParametro(f: Familia, id: string): string | null {
  if (!Array.isArray(f.parametros)) return 'a família não tem lista de parâmetros';
  const indice = f.parametros.findIndex((p) => p?.id === id);
  if (indice < 0) return `parâmetro “${id}” não existe`;
  if ((PARAMETROS_PADRAO as readonly string[]).includes(id)) return `“${id}” é um parâmetro padrão e não pode ser excluído`;

  const usos = usosDoNomeEm(f, id).filter((onde) => !onde.startsWith('tipo:'));
  for (const e of lista<Escolha>(f.escolhas)) {
    if (e?.parametro === id) usos.push(`escolha:${String(e.id)}`);
  }
  for (const c of lista<Conector>(f.conectores)) {
    if (typeof c?.folga === 'string' && usaNome(c.folga, id)) usos.push(`conector:${String(c.id)}.folga`);
  }
  if (usos.length > 0) return `em uso: ${usos.slice(0, 3).join(', ')}`;

  f.parametros.splice(indice, 1);
  for (const t of lista<Tipo>(f.tipos)) {
    const valores = t?.valores;
    if (valores !== undefined && Object.prototype.hasOwnProperty.call(valores, id)) delete valores[id];
  }
  return null;
}
