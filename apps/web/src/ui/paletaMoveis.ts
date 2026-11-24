import { categoriasDaAba, categoriasDoPainel, type CategoriaFamilia, type Familia, type Project } from '@hestia/model';
import { CATEGORIAS, FAMILIAS_GALERIA, filtrarFamilias, type CategoriaGaleria } from './familia/familiaNovo.ts';

/*
 * Apoio puro da paleta de móveis (F3-biblioteca): monta a lista da biblioteca base + famílias do projeto (marcadas) e
 * filtra por aba de categoria e busca, reaproveitando a normalização e o filtro da galeria do editor de famílias.
 */

/** Grupos da faixa (ficha J2): cada um junta as categorias que a tabela de destinos (J1) manda para o mesmo painel ou aba. */
export type GrupoPaleta = 'grupo:hidraulica' | 'grupo:eletrico' | 'grupo:hvac' | 'grupo:estrutura';
export type CategoriaPaleta = CategoriaGaleria | GrupoPaleta;

/** Categorias de cada grupo, lidas da tabela de destinos (nada escrito à mão aqui). */
export function categoriasDoGrupo(g: GrupoPaleta): CategoriaFamilia[] {
  if (g === 'grupo:hidraulica') return categoriasDoPainel('hidraulica');
  if (g === 'grupo:eletrico') return categoriasDoPainel('eletrico');
  if (g === 'grupo:hvac') return categoriasDoPainel('hvac');
  return categoriasDaAba('estrutura');
}

const ehGrupo = (c: CategoriaPaleta): c is GrupoPaleta => c.startsWith('grupo:');

/** Aba "Todas" na frente e as categorias da galeria (a última, "Meus modelos", vira "No projeto"). */
export const ABAS_PALETA: readonly { id: CategoriaPaleta; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'grupo:hidraulica', rotulo: 'Hidráulica' },
  { id: 'grupo:eletrico', rotulo: 'Elétrico' },
  { id: 'grupo:hvac', rotulo: 'HVAC' },
  { id: 'grupo:estrutura', rotulo: 'Estrutura' },
  ...CATEGORIAS,
];

export interface ItemPaleta {
  familia: Familia;
  /** A família já está no projeto aberto. */
  doProjeto: boolean;
}

/** Galeria da biblioteca (móveis, depois MEP por disciplina) mais as famílias do projeto, sem repetir id; as do projeto vêm primeiro e marcadas. */
export function montarItensDaPaleta(p: Project): ItemPaleta[] {
  const doProjeto = Object.values(p.componentFamilies ?? {});
  const idsDoProjeto = new Set(doProjeto.map((f) => f.id));
  return [
    ...doProjeto.map((familia): ItemPaleta => ({ familia, doProjeto: true })),
    ...FAMILIAS_GALERIA.filter((f) => !idsDoProjeto.has(f.id)).map((familia): ItemPaleta => ({ familia, doProjeto: false })),
  ];
}

/** Filtra os itens pela aba de categoria e pela busca (nome/descrição, sem acento). "Meus modelos" mostra só as do projeto. */
export function filtrarItensDaPaleta(itens: readonly ItemPaleta[], categoria: CategoriaPaleta, busca: string): ItemPaleta[] {
  if (ehGrupo(categoria)) {
    const cats = new Set<string>(categoriasDoGrupo(categoria));
    const doGrupo = itens.filter((item) => cats.has(item.familia.categoria));
    const achadas = new Set(filtrarFamilias(doGrupo.map((item) => item.familia), 'todas', busca).map((f) => f.id));
    return doGrupo.filter((item) => achadas.has(item.familia.id));
  }
  const fonte = categoria === 'meus' ? itens.filter((item) => item.doProjeto) : itens;
  const familias = filtrarFamilias(fonte.map((item) => item.familia), categoria === 'meus' ? 'todas' : categoria, busca);
  const aceitas = new Set(familias.map((f) => f.id));
  return fonte.filter((item) => aceitas.has(item.familia.id));
}
