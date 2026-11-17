import type { Material, MaterialTextura } from '@hestia/model';
import type { TexturaItem } from '@hestia/io';
import { PREFIXO_CATALOGO } from '../../../editor/texturasOnline.ts';

/**
 * Lógica pura do painel "Texturas online" (sem React, sem rede): filtro, ordenação, paginação e os blocos
 * `aparencia.textura` gravados ao criar ou aplicar uma textura do catálogo.
 */

/** Quantas miniaturas aparecem por vez; "Mostrar mais" soma outro lote. */
export const LOTE_TEXTURAS = 60;
/** Cor média neutra do material criado a partir de uma textura. */
export const COR_NEUTRA_TEXTURA = '#b9a98f';
export { PREFIXO_CATALOGO };

/** Rótulos das categorias comuns do catálogo. Categoria fora da lista mostra o próprio id. */
const ROTULOS_CATEGORIA: Readonly<Record<string, { pt: string; en: string }>> = {
  Tiles: { pt: 'Ladrilhos/Revestimentos', en: 'Tiles' },
  Wood: { pt: 'Madeira', en: 'Wood' },
  Bricks: { pt: 'Tijolos', en: 'Bricks' },
  Metal: { pt: 'Metal', en: 'Metal' },
  Concrete: { pt: 'Concreto', en: 'Concrete' },
  Ground: { pt: 'Solo', en: 'Ground' },
  Rock: { pt: 'Rocha', en: 'Rock' },
  Fabric: { pt: 'Tecido', en: 'Fabric' },
  Marble: { pt: 'Mármore', en: 'Marble' },
  Leather: { pt: 'Couro', en: 'Leather' },
  Asphalt: { pt: 'Asfalto', en: 'Asphalt' },
  Carpet: { pt: 'Carpete', en: 'Carpet' },
  Granite: { pt: 'Granito', en: 'Granite' },
  Onyx: { pt: 'Ônix', en: 'Onyx' },
  Travertine: { pt: 'Travertino', en: 'Travertine' },
  WoodSiding: { pt: 'Revestimento de madeira', en: 'Wood siding' },
  OfficeCeiling: { pt: 'Forro de escritório', en: 'Office ceiling' },
  Wallpaper: { pt: 'Papel de parede', en: 'Wallpaper' },
  Plastic: { pt: 'Plástico', en: 'Plastic' },
  WoodFloor: { pt: 'Piso de madeira', en: 'Wood floor' },
  Plaster: { pt: 'Reboco', en: 'Plaster' },
};

export interface FiltroTexturas {
  /** Trecho do nome (ou do id), sem diferenciar maiúsculas nem acentos. Vazio = todas. */
  busca: string;
  /** Categoria exata; `null` = todas. */
  categoria: string | null;
}

const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Itens que batem com a busca e a categoria, na ordem recebida. */
export function filtrarTexturas(itens: readonly TexturaItem[], f: FiltroTexturas): TexturaItem[] {
  const termo = semAcento(f.busca.trim());
  return itens.filter(
    (it) =>
      (f.categoria === null || it.categoria === f.categoria) &&
      (termo === '' || semAcento(it.nome).includes(termo) || semAcento(it.id).includes(termo)),
  );
}

/** Ordena por categoria e depois por nome (numérico: `Bricks 2` vem antes de `Bricks 10`). Não altera a entrada. */
export function ordenarTexturas(itens: readonly TexturaItem[]): TexturaItem[] {
  return [...itens].sort((a, b) => a.categoria.localeCompare(b.categoria, 'en') || a.nome.localeCompare(b.nome, 'en', { numeric: true }));
}

/** Categorias distintas do catálogo, em ordem alfabética. */
export function categoriasDistintas(itens: readonly TexturaItem[]): string[] {
  return [...new Set(itens.map((it) => it.categoria))].sort((a, b) => a.localeCompare(b, 'en'));
}

/** Rótulo da categoria: pt para português, en para os demais idiomas. Desconhecida = o próprio id. */
export function rotuloCategoria(id: string, lang: string): string {
  const r = ROTULOS_CATEGORIA[id];
  if (!r) return id;
  return lang === 'pt' ? r.pt : r.en;
}

/** Primeiros `limite` itens e quantos ficaram de fora (para o botão "Mostrar mais"). */
export function paginar<T>(itens: readonly T[], limite: number): { visiveis: T[]; restantes: number } {
  const n = Math.max(0, Math.floor(limite));
  return { visiveis: itens.slice(0, n), restantes: Math.max(0, itens.length - n) };
}

/** Tamanho dos mapas em megabytes (1 MB = 1024 × 1024 bytes). */
export function megabytes(bytes: number): number {
  return bytes / (1024 * 1024);
}

/** Bloco `aparencia.textura` para uma textura do catálogo: escala 1 m, sem rotação, repetido. */
export function texturaDaCatalogo(id: string): MaterialTextura {
  return { imagemId: `${PREFIXO_CATALOGO}${id}`, escalaMetros: 1, rotacao: 0, deslocamento: [0, 0], repetir: true };
}

/** Material novo a partir de uma textura: nome da textura, cor neutra e os padrões do gerenciador. */
export function criarMaterialDaTextura(item: Pick<TexturaItem, 'id' | 'nome'>, id: string): Material {
  return {
    id,
    name: item.nome,
    color: COR_NEUTRA_TEXTURA,
    hatch: 'none',
    gloss: 0.2,
    opacity: 1,
    cost: 0,
    unit: 'm2',
    aparencia: { textura: texturaDaCatalogo(item.id) },
  };
}

/** Cópia do material com `aparencia.textura` trocado; o restante do material e da aparência fica igual. */
export function aplicarTexturaNoMaterial(m: Material, item: Pick<TexturaItem, 'id'>): Material {
  return { ...m, aparencia: { ...m.aparencia, textura: texturaDaCatalogo(item.id) } };
}

/** "Aplicar" só vale com uma textura escolhida e um material selecionado. */
export function podeAplicarTextura(material: Material | undefined, item: TexturaItem | null): boolean {
  return material !== undefined && item !== null;
}
