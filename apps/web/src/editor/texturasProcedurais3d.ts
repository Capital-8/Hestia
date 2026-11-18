import * as THREE from 'three';
import { prepararMapa, type MapasTextura3D } from '@hestia/render';

export const TAM = 256;
const cache = new Map<string, MapasTextura3D>();

export function desenharTijolo(ctx: CanvasRenderingContext2D, cor1: string, cor2: string): void {
  const rows = 4;
  const cols = 2;
  const rowH = TAM / rows;
  const colW = TAM / cols;
  const junta = 6;
  const halfJ = junta / 2;

  ctx.fillStyle = cor2;
  ctx.fillRect(0, 0, TAM, TAM);

  ctx.fillStyle = cor1;
  const h = rowH - junta;
  const halfBrick = colW / 2 - halfJ;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH + halfJ;
    if (r % 2 === 0) {
      for (let c = 0; c < cols; c++) {
        ctx.fillRect(c * colW + halfJ, y, colW - junta, h);
      }
    } else {
      ctx.fillRect(0, y, halfBrick, h);
      ctx.fillRect(colW / 2 + halfJ, y, colW - junta, h);
      ctx.fillRect(TAM - halfBrick, y, halfBrick, h);
    }
  }
}

export function desenharAzulejo(ctx: CanvasRenderingContext2D, cor1: string, cor2: string): void {
  const n = 2;
  const step = TAM / n;
  const junta = 6;
  const halfJ = junta / 2;
  const lado = step - junta;

  ctx.fillStyle = cor2;
  ctx.fillRect(0, 0, TAM, TAM);

  ctx.fillStyle = cor1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillRect(c * step + halfJ, r * step + halfJ, lado, lado);
    }
  }
}

const DESENHO: Record<string, (ctx: CanvasRenderingContext2D, c1: string, c2: string) => void> = {
  brick: desenharTijolo,
  tile: desenharAzulejo,
};

/**
 * Gera (e armazena em cache) texturas 3D procedurais tileables `256x256` para ids no formato
 * `proc:<tipo>:<cor1>:<cor2>` onde `<tipo>` é `brick` ou `tile`.
 * Fora do navegador ou para outros tipos/prefixos retorna `undefined`.
 */
export function obterTexturaProcedural(imagemId: string): MapasTextura3D | undefined {
  if (!imagemId.startsWith('proc:') || typeof document === 'undefined') return undefined;
  const existente = cache.get(imagemId);
  if (existente) return existente;
  const [, tipo = '', cor1 = '#cccccc', cor2 = '#999999'] = imagemId.split(':');
  const fn = Object.hasOwn(DESENHO, tipo) ? DESENHO[tipo] : undefined;
  if (!fn) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = TAM;
  canvas.height = TAM;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  fn(ctx, cor1, cor2);
  const tex = new THREE.CanvasTexture(canvas);
  const mapas: MapasTextura3D = { cor: prepararMapa(tex, true) };
  cache.set(imagemId, mapas);
  return mapas;
}
