import type { OpcaoParametro, TipoParametro } from './tipos.ts';
import { ehObjeto } from './validarComum.ts';

/*
 * Regras de tipo de um valor de parâmetro (ficha E1-validar, regra 5). Usadas tanto no `padrao` do parâmetro quanto nos
 * valores de `tipo.valores` (regra 7), para que as duas checagens não divirjam.
 */
export function valorCompativel(
  tipo: TipoParametro,
  valor: unknown,
  opcoes: readonly OpcaoParametro[] | undefined,
): boolean {
  switch (tipo) {
    case 'comprimento':
    case 'numero':
      return typeof valor === 'number' && Number.isFinite(valor);
    case 'inteiro':
      return typeof valor === 'number' && Number.isInteger(valor);
    case 'booleano':
      return typeof valor === 'boolean';
    case 'texto':
      return typeof valor === 'string';
    case 'material':
      return typeof valor === 'string' && valor.trim() !== '';
    case 'enum':
    case 'chapa':
      return Array.isArray(opcoes) && opcoes.some((o) => ehObjeto(o) && o.valor === valor);
    default:
      return false;
  }
}
