import type { Familia, OpcaoParametro, TipoParametro } from './tipos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import { valorCompativel } from './validarValores.ts';
import type { Problema } from './validar.ts';

/*
 * Regra 5 da ficha E1-validar: coerência de tipo e de faixa dos parâmetros, além do eixo/papel das peças. Códigos:
 * `tipo` para tipo/escopo/opções e `faixa` para min/max/passo/padrão fora da faixa.
 */

const TIPOS: readonly string[] = ['comprimento', 'numero', 'inteiro', 'booleano', 'texto', 'enum', 'chapa', 'material'];
const ESCOPOS: readonly string[] = ['tipo', 'instancia'];
const COM_FORMULA: readonly string[] = ['comprimento', 'numero', 'inteiro', 'booleano'];
const EIXOS: readonly string[] = ['x', 'y', 'z'];
const PAPEIS: readonly string[] = [
  'lateral', 'base', 'topo', 'travessa', 'prateleira', 'divisoria', 'fundo', 'porta', 'frente_gaveta',
  'tampo', 'rodape', 'painel', 'bloco', 'generica',
];

export function validarParametros(f: Familia): Problema[] {
  const out: Problema[] = [];

  for (const item of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(item)) {
      out.push(criarProblema('tipo', 'o parâmetro não é um objeto', 'parametro:?'));
      continue;
    }
    conferirParametro(item, `parametro:${texto(item.id)}`, out);
  }

  for (const item of comoArray<unknown>(f.pecas)) {
    if (!ehObjeto(item)) {
      out.push(criarProblema('tipo', 'a peça não é um objeto', 'peca:?'));
      continue;
    }
    const base = `peca:${texto(item.id)}`;
    if (typeof item.eixo !== 'string' || !EIXOS.includes(item.eixo)) {
      out.push(criarProblema('tipo', `eixo fora de x/y/z: “${texto(item.eixo)}”`, `${base}.eixo`));
    }
    if (typeof item.papel !== 'string' || !PAPEIS.includes(item.papel)) {
      out.push(criarProblema('tipo', `papel de peça desconhecido: “${texto(item.papel)}”`, `${base}.papel`));
    }
  }

  return out;
}

function conferirParametro(p: Record<string, unknown>, base: string, out: Problema[]): void {
  const tipo = typeof p.tipo === 'string' ? p.tipo : undefined;
  const escopo = typeof p.escopo === 'string' ? p.escopo : undefined;
  const opcoes = Array.isArray(p.opcoes) ? (p.opcoes as OpcaoParametro[]) : undefined;

  if (tipo === undefined || !TIPOS.includes(tipo)) {
    out.push(criarProblema('tipo', `tipo de parâmetro desconhecido: “${texto(p.tipo)}”`, base));
  }
  if (escopo === undefined || !ESCOPOS.includes(escopo)) {
    out.push(criarProblema('tipo', `escopo de parâmetro desconhecido: “${texto(p.escopo)}”`, base));
  }

  if (p.formula !== undefined) {
    if (escopo !== 'tipo') {
      out.push(criarProblema('tipo', 'parâmetro com fórmula precisa ter escopo “tipo”', base));
    }
    if (tipo === undefined || !COM_FORMULA.includes(tipo)) {
      out.push(criarProblema('tipo', `parâmetro com fórmula não pode ser do tipo “${texto(p.tipo)}”`, base));
    }
  }

  if (tipo === 'enum' || tipo === 'chapa') {
    if (!opcoes || opcoes.length === 0) {
      out.push(criarProblema('tipo', `parâmetro do tipo “${tipo}” exige opções não vazias`, base));
    } else {
      if (!valorCompativel(tipo, p.padrao, opcoes)) {
        out.push(criarProblema('tipo', `o padrão “${texto(p.padrao)}” não está entre as opções`, base));
      }
      if (tipo === 'chapa') {
        opcoes.forEach((o) => {
          const esp = ehObjeto(o) ? o.esp : undefined;
          if (typeof esp !== 'number' || !Number.isFinite(esp) || esp <= 0) {
            out.push(criarProblema('tipo', `a opção “${texto(ehObjeto(o) ? o.valor : undefined)}” de chapa exige esp > 0`, base));
          }
        });
      }
    }
  } else if (tipo !== undefined && TIPOS.includes(tipo)) {
    if (!valorCompativel(tipo as TipoParametro, p.padrao, opcoes)) {
      out.push(criarProblema('tipo', `o padrão é incompatível com o tipo “${tipo}”`, base));
    }
  }

  conferirFaixas(p, base, out);
}

function conferirFaixas(p: Record<string, unknown>, base: string, out: Problema[]): void {
  const min = p.min;
  const max = p.max;
  const passo = p.passo;
  const minNum = typeof min === 'number' && Number.isFinite(min) ? min : undefined;
  const maxNum = typeof max === 'number' && Number.isFinite(max) ? max : undefined;

  if (min !== undefined && minNum === undefined) {
    out.push(criarProblema('faixa', `min precisa ser número finito (recebeu “${texto(min)}”)`, base));
  }
  if (max !== undefined && maxNum === undefined) {
    out.push(criarProblema('faixa', `max precisa ser número finito (recebeu “${texto(max)}”)`, base));
  }
  if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
    out.push(criarProblema('faixa', `min (${minNum}) é maior que max (${maxNum})`, base));
  }
  if (passo !== undefined && (typeof passo !== 'number' || !Number.isFinite(passo) || passo <= 0)) {
    out.push(criarProblema('faixa', `passo precisa ser número finito maior que zero (recebeu “${texto(passo)}”)`, base));
  }

  if (typeof p.padrao === 'number' && Number.isFinite(p.padrao)) {
    if (minNum !== undefined && p.padrao < minNum) {
      out.push(criarProblema('faixa', `o padrão (${p.padrao}) está abaixo do mínimo (${minNum})`, base));
    }
    if (maxNum !== undefined && p.padrao > maxNum) {
      out.push(criarProblema('faixa', `o padrão (${p.padrao}) está acima do máximo (${maxNum})`, base));
    }
  }
}
