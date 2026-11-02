import { compilar, referencias } from './expressao.ts';
import type { Familia, OpcaoParametro, TipoParametro } from './tipos.ts';
import { listarCamposDeExpressao } from './validarCampos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import { valorCompativel } from './validarValores.ts';
import type { Problema } from './validar.ts';

/*
 * Regra 7 da ficha E1-validar: nomes usados nas fórmulas, valores de `tipo`, `tipoPadrao` e `peca.material`.
 *
 * `i` e `n` são especiais: só valem nas fórmulas de uma peça/aninhado que tenha `repetir`, nunca no próprio `repetir`.
 * `x.esp` só vale quando `x` é parâmetro de tipo `chapa`; ids de material do projeto (que não coincidem com parâmetro)
 * não existem no arquivo e por isso não são conferidos.
 */
export function validarReferencias(f: Familia): Problema[] {
  const out: Problema[] = [];

  const ids = new Set<string>();
  const chapas = new Set<string>();
  const parametrosPorId = new Map<string, Record<string, unknown>>();

  for (const item of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(item) || typeof item.id !== 'string') continue;
    ids.add(item.id);
    if (!parametrosPorId.has(item.id)) parametrosPorId.set(item.id, item);
    if (item.tipo === 'chapa') chapas.add(item.id);
  }
  for (const item of comoArray<unknown>(f.planos)) {
    if (ehObjeto(item) && typeof item.id === 'string') ids.add(item.id);
  }

  for (const campo of listarCamposDeExpressao(f)) {
    if (typeof campo.valor !== 'string') continue;
    const compilado = compilar(campo.valor);
    if ('erro' in compilado) continue;
    for (const nome of referencias(compilado.no)) {
      if (!referenciaValida(nome, ids, chapas, campo.permiteIN)) {
        out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo.onde));
      }
    }
  }

  for (const item of comoArray<unknown>(f.tipos)) {
    if (!ehObjeto(item)) continue;
    const onde = `tipo:${texto(item.id)}`;
    const valores = item.valores;
    if (!ehObjeto(valores)) {
      out.push(criarProblema('referencia', 'os valores do tipo precisam ser um objeto', `${onde}.valores`));
      continue;
    }
    for (const [chave, valor] of Object.entries(valores)) {
      const lugar = `${onde}.valores.${chave}`;
      const parametro = parametrosPorId.get(chave);
      if (!parametro) {
        out.push(criarProblema('referencia', `“${chave}” não é um parâmetro da família`, lugar));
        continue;
      }
      if (parametro.formula !== undefined) {
        out.push(criarProblema('referencia', `“${chave}” é calculado e não pode receber valor de tipo`, lugar));
        continue;
      }
      const opcoes = Array.isArray(parametro.opcoes) ? (parametro.opcoes as OpcaoParametro[]) : undefined;
      if (!valorCompativel(parametro.tipo as TipoParametro, valor, opcoes)) {
        out.push(criarProblema('referencia', `valor inválido para “${chave}” (${texto(parametro.tipo)})`, lugar));
      }
    }
  }

  if (f.tipoPadrao !== undefined) {
    const existe = comoArray<unknown>(f.tipos).some((item) => ehObjeto(item) && item.id === f.tipoPadrao);
    if (!existe) {
      out.push(criarProblema('referencia', `tipo padrão “${texto(f.tipoPadrao)}” não existe`, 'familia'));
    }
  }

  for (const item of comoArray<unknown>(f.pecas)) {
    if (!ehObjeto(item) || typeof item.material !== 'string') continue;
    const parametro = parametrosPorId.get(item.material);
    if (parametro && parametro.tipo !== 'material' && parametro.tipo !== 'chapa') {
      out.push(criarProblema(
        'referencia',
        `material “${item.material}” precisa apontar para parâmetro material ou chapa`,
        `peca:${texto(item.id)}.material`,
      ));
    }
  }

  return out;
}

function referenciaValida(nome: string, ids: ReadonlySet<string>, chapas: ReadonlySet<string>, permiteIN: boolean): boolean {
  if (nome === 'i' || nome === 'n') return permiteIN;
  const partes = nome.split('.');
  if (partes.length === 1) return ids.has(nome);
  if (partes.length === 2 && partes[1] === 'esp') {
    const base = partes[0];
    return base !== undefined && chapas.has(base);
  }
  return false;
}
