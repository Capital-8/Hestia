import { CONEXOES_POR_DOMINIO } from './conexoesAutomaticas.ts';
import type { CategoriaPeca } from './conformidadeConexoes.ts';
import { TIPOS_TUBULACAO, type TipoTubulacao } from './tiposTubulacao.ts';

/*
 * Categoria de peça de tubulação a partir do id da família (ficha F1): procura o id nas regras de cada tipo de tubulação e nas regras
 * fixas dos domínios. Família que não é conexão de nenhuma regra (tubo, caixa, dispositivo, quadro) não tem categoria.
 */

const CHAVES: readonly CategoriaPeca[] = ['curva90', 'curva45', 'te', 'juncao45', 'luva', 'reducao', 'tampao'];

/** Categoria da família `familyId` e o tipo de tubulação a que pertence (`undefined` nas regras fixas do domínio); `null` se não é conexão. */
export function categoriaDaFamilia(familyId: string): { categoria: CategoriaPeca; tipo?: TipoTubulacao } | null {
  for (const tipo of TIPOS_TUBULACAO) {
    const c = CHAVES.find((k) => tipo.regras[k] === familyId);
    if (c) return { categoria: c, tipo };
  }
  for (const regras of Object.values(CONEXOES_POR_DOMINIO)) {
    const c = CHAVES.find((k) => regras[k] === familyId);
    if (c) return { categoria: c };
  }
  return null;
}
