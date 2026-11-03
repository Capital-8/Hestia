import { familiaDaBiblioteca, type Familia, type PapelPeca } from '@hestia/model';
import { resolverFamilia, type PecaResolvida } from '@hestia/engine';

/*
 * Miniatura de frente das famílias da galeria. Resolve a família com a biblioteca base (para os aninhados) e projeta as
 * peças no plano X (horizontal) × Z (vertical), em unidades do SVG. Metros do motor viram só escala de desenho; nenhum
 * texto de medida é montado aqui.
 */

export interface RetanguloMiniatura {
  x: number;
  y: number;
  w: number;
  h: number;
  papel: PapelPeca;
  vazio: boolean;
}

export interface MiniaturaFamilia {
  retangulos: RetanguloMiniatura[];
  largura: number;
  altura: number;
}

/** Margem livre entre o desenho e a borda da miniatura, em unidades do SVG. */
export const MARGEM_MINIATURA = 6;

/** Papel da peça de reserva: a galeria pinta este papel em cinza. */
const PAPEL_QUEBRADA: PapelPeca = 'generica';

const cache = new Map<string, MiniaturaFamilia>();

/** Esvazia o cache (útil em teste e quando a mesma família muda de conteúdo). */
export function limparCacheMiniaturas(): void {
  cache.clear();
}

/** Retângulo único cinza, com a margem padrão, para família que não resolve. */
function miniaturaQuebrada(largura: number, altura: number): MiniaturaFamilia {
  const margem = Math.min(MARGEM_MINIATURA, largura / 2, altura / 2);
  const retangulo: RetanguloMiniatura = {
    x: margem,
    y: margem,
    w: Math.max(0, largura - 2 * margem),
    h: Math.max(0, altura - 2 * margem),
    papel: PAPEL_QUEBRADA,
    vazio: false,
  };
  return { retangulos: [retangulo], largura, altura };
}

interface Limites {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function limitesDasPecas(pecas: readonly PecaResolvida[]): Limites | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pecas) {
    const x = p.origem[0];
    const z = p.origem[2];
    const w = p.extensao[0];
    const h = p.extensao[2];
    if (![x, z, w, h].every(Number.isFinite)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z + h);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

function desenhar(pecas: readonly PecaResolvida[], largura: number, altura: number): MiniaturaFamilia {
  const limites = limitesDasPecas(pecas);
  if (limites === null) return miniaturaQuebrada(largura, altura);
  const spanX = limites.maxX - limites.minX;
  const spanZ = limites.maxZ - limites.minZ;
  const kx = spanX > 0 ? (largura - 2 * MARGEM_MINIATURA) / spanX : Infinity;
  const kz = spanZ > 0 ? (altura - 2 * MARGEM_MINIATURA) / spanZ : Infinity;
  const escala = Math.min(kx, kz);
  if (!Number.isFinite(escala) || escala <= 0) return miniaturaQuebrada(largura, altura);

  const esquerda = (largura - spanX * escala) / 2;
  const topo = (altura - spanZ * escala) / 2;
  const minX = Math.min(MARGEM_MINIATURA, largura / 2);
  const minY = Math.min(MARGEM_MINIATURA, altura / 2);
  const maxX = Math.max(minX, largura - MARGEM_MINIATURA);
  const maxY = Math.max(minY, altura - MARGEM_MINIATURA);
  const retangulos = pecas.map((p): RetanguloMiniatura => {
    const brutoX = esquerda + (p.origem[0] - limites.minX) * escala;
    const brutoY = topo + (limites.maxZ - (p.origem[2] + p.extensao[2])) * escala;
    const x = Math.min(Math.max(minX, brutoX), maxX);
    const y = Math.min(Math.max(minY, brutoY), maxY);
    return {
      x,
      y,
      w: Math.max(0, Math.min(p.extensao[0] * escala, maxX - x)),
      h: Math.max(0, Math.min(p.extensao[2] * escala, maxY - y)),
      papel: p.papel,
      vazio: p.vazio,
    };
  });
  return { retangulos, largura, altura };
}

/** Vista de frente da família (peças mais ao fundo primeiro), em unidades do SVG. Família que não resolve vira um retângulo. */
export function miniaturaDaFamilia(familia: Familia, largura = 150, altura = 78): MiniaturaFamilia {
  const chave = `${familia.id}|${largura}|${altura}`;
  const salva = cache.get(chave);
  if (salva !== undefined) return salva;

  const pecas = resolverFamilia(familia, { biblioteca: familiaDaBiblioteca })
    .pecas.filter((p) => [p.origem[0], p.origem[1], p.origem[2], p.extensao[0], p.extensao[2]].every(Number.isFinite))
    .sort((a, b) => b.origem[1] - a.origem[1]);

  const miniatura = pecas.length > 0 ? desenhar(pecas, largura, altura) : miniaturaQuebrada(largura, altura);
  cache.set(chave, miniatura);
  return miniatura;
}
