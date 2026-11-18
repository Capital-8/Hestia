import { BIBLIOTECA_BASE, type Familia, type Project } from '@hestia/model';
import { CATEGORIAS, filtrarFamilias, type CategoriaGaleria } from './familia/familiaNovo.ts';

/*
 * Apoio puro da paleta de móveis (F3-biblioteca): monta a lista da biblioteca base + famílias do projeto (marcadas) e
 * filtra por aba de categoria e busca, reaproveitando a normalização e o filtro da galeria do editor de famílias.
 */

export type CategoriaPaleta = CategoriaGaleria;

/** Aba "Todas" na frente e as categorias da galeria (a última, "Meus modelos", vira "No projeto"). */
export const ABAS_PALETA: readonly { id: CategoriaPaleta; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  ...CATEGORIAS,
];

export interface ItemPaleta {
  familia: Familia;
  /** A família já está no projeto aberto. */
  doProjeto: boolean;
}

/** Biblioteca base mais as famílias do projeto, sem repetir id; as do projeto vêm primeiro e marcadas. */
export function montarItensDaPaleta(p: Project): ItemPaleta[] {
  const doProjeto = Object.values(p.componentFamilies ?? {});
  const idsDoProjeto = new Set(doProjeto.map((f) => f.id));
  return [
    ...doProjeto.map((familia): ItemPaleta => ({ familia, doProjeto: true })),
    ...BIBLIOTECA_BASE.filter((f) => !idsDoProjeto.has(f.id)).map((familia): ItemPaleta => ({ familia, doProjeto: false })),
  ];
}

/** Filtra os itens pela aba de categoria e pela busca (nome/descrição, sem acento). "Meus modelos" mostra só as do projeto. */
export function filtrarItensDaPaleta(itens: readonly ItemPaleta[], categoria: CategoriaPaleta, busca: string): ItemPaleta[] {
  const fonte = categoria === 'meus' ? itens.filter((item) => item.doProjeto) : itens;
  const familias = filtrarFamilias(fonte.map((item) => item.familia), categoria === 'meus' ? 'todas' : categoria, busca);
  const aceitas = new Set(familias.map((f) => f.id));
  return fonte.filter((item) => aceitas.has(item.familia.id));
}
