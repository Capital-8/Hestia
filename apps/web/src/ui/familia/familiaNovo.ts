import type { CategoriaFamilia, Familia } from '@hestia/model';

/*
 * Apoio puro do diálogo "Novo módulo": filtro da galeria, ids das cópias do usuário e o registro dos ids já abertos
 * nesta sessão. Nada aqui toca o DOM: o contador vive no módulo e os testes podem reiniciá-lo.
 */

export type CategoriaGaleria = 'todas' | CategoriaFamilia | 'meus';

export interface OpcaoCategoria {
  id: CategoriaGaleria;
  rotulo: string;
}

/** Categorias da árvore, na ordem em que aparecem (a "Todas" fica no topo e é montada à parte). */
export const CATEGORIAS: readonly OpcaoCategoria[] = [
  { id: 'marcenaria', rotulo: 'Marcenaria' },
  { id: 'mobiliario', rotulo: 'Mobiliário' },
  { id: 'loucas', rotulo: 'Louças e metais' },
  { id: 'equipamento', rotulo: 'Equipamentos' },
  { id: 'generico', rotulo: 'Genéricos' },
  { id: 'meus', rotulo: 'Meus modelos' },
];

/** Minúsculas e sem acento, para busca por nome ou descrição. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Filtra por categoria (ou todas/meus) e por busca em nome e descrição, sem acento e sem diferenciar maiúscula. */
export function filtrarFamilias(lista: readonly Familia[], categoria: CategoriaGaleria, busca: string): Familia[] {
  const termo = normalizarTexto(busca);
  return lista.filter((f) => {
    if (categoria !== 'todas' && categoria !== 'meus' && f.categoria !== categoria) return false;
    if (termo === '') return true;
    return normalizarTexto(f.nome).includes(termo) || normalizarTexto(f.descricao ?? '').includes(termo);
  });
}

/** Primeiro `fam_usuario_<n>` livre (n começa em 1) entre os ids já usados. */
export function proximoIdDeUsuario(existentes: readonly string[]): string {
  const usados = new Set(existentes);
  let n = 1;
  while (usados.has(`fam_usuario_${n}`)) n += 1;
  return `fam_usuario_${n}`;
}

const idsAbertos = new Set<string>();

/** Marca um id como usado nesta sessão (cópia criada ou família aberta de arquivo). */
export function registrarIdAberto(id: string): void {
  idsAbertos.add(id);
}

/** Ids que o usuário já abriu nesta sessão. */
export function idsAbertosNestaSessao(): string[] {
  return [...idsAbertos];
}

/** Reinicia o registro da sessão (teste). */
export function reiniciarIdsAbertos(): void {
  idsAbertos.clear();
}

/** Cópia profunda da família com id novo (`fam_usuario_<n>`) e nome terminado em " (nova)". */
export function criarCopiaDeFamilia(familia: Familia): Familia {
  const id = proximoIdDeUsuario(idsAbertosNestaSessao());
  idsAbertos.add(id);
  const copia = structuredClone(familia);
  copia.id = id;
  copia.nome = `${familia.nome} (nova)`;
  return copia;
}
