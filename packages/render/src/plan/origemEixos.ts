import type { Viewport } from '../viewport.ts';
import type { FillOp, LabelOp, PlanOps, StrokeOp } from './types.ts';

/** Cores dos eixos da origem (padrão de CAD e three.js): X vermelho, Y verde, Z azul. Legíveis nos temas claro e escuro. */
export const EIXO_X_COR = '#e5484d';
export const EIXO_Y_COR = '#30a46c';
export const EIXO_Z_COR = '#3e63dd';

/** Comprimento dos eixos na tela (px), a espessura (px), o raio do círculo do Z (px) e o tamanho da seta (px). */
export const EIXOS_PLANTA_PX = 48;
const ESPESSURA_PX = 1.5;
const RAIO_Z_PX = 4;
const SETA_PX = 7;
const LADOS_CIRCULO = 20;

/**
 * Marcador da origem (0, 0) na planta, em metros para o zoom dado (px/m): eixo X vermelho no sentido +X, eixo Y verde no
 * sentido +Y (para cima na tela), rótulos "X" e "Y" nas pontas e um círculo azul na origem (o Z, que sai do papel). O
 * comprimento e a espessura são constantes na tela: o comprimento em metros é `EIXOS_PLANTA_PX / zoom`.
 */
export function origemEixosPlanta(zoom: number): PlanOps {
  if (!(zoom > 0)) return { fills: [], strokes: [], labels: [] };
  const L = EIXOS_PLANTA_PX / zoom;
  const s = SETA_PX / zoom;
  const traco = (pts: { x: number; y: number }[], color: string, role: string): StrokeOp => ({ pts, closed: false, widthPx: ESPESSURA_PX, color, alpha: 1, role });
  const strokes: StrokeOp[] = [
    traco([{ x: 0, y: 0 }, { x: L, y: 0 }], EIXO_X_COR, 'origem-x'),
    traco([{ x: L - s, y: s * 0.45 }, { x: L, y: 0 }, { x: L - s, y: -s * 0.45 }], EIXO_X_COR, 'origem-x-seta'),
    traco([{ x: 0, y: 0 }, { x: 0, y: L }], EIXO_Y_COR, 'origem-y'),
    traco([{ x: s * 0.45, y: L - s }, { x: 0, y: L }, { x: -s * 0.45, y: L - s }], EIXO_Y_COR, 'origem-y-seta'),
  ];
  const r = RAIO_Z_PX / zoom;
  const anel = Array.from({ length: LADOS_CIRCULO }, (_, i) => {
    const a = (2 * Math.PI * i) / LADOS_CIRCULO;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  const fills: FillOp[] = [{ polygons: [[anel]], color: EIXO_Z_COR, alpha: 1 }];
  strokes.push({ pts: anel, closed: true, widthPx: ESPESSURA_PX, color: EIXO_Z_COR, alpha: 1, role: 'origem-z' });
  const rotulo = (at: { x: number; y: number }, text: string, color: string, dx: number, dy: number): LabelOp => ({ at, text, color, dx, dy, fontPx: 11, center: true, bold: true });
  const labels: LabelOp[] = [
    rotulo({ x: L, y: 0 }, 'X', EIXO_X_COR, 10, 0),
    rotulo({ x: 0, y: L }, 'Y', EIXO_Y_COR, 0, -10),
  ];
  return { fills, strokes, labels };
}

type AtualizacaoDoQuadro = { liveKey?: string; live?: () => PlanOps };

/**
 * Soma o marcador da origem à camada viva do quadro (só na tela de edição: prancha, PDF, DXF e plotagem não passam por aqui).
 * Desligado, devolve a atualização como veio. A chave leva o zoom, porque o comprimento em metros depende dele.
 */
export function comEixosDaOrigem<T extends AtualizacaoDoQuadro>(upd: T, ligado: boolean, v: Viewport): T {
  if (!ligado) return upd;
  const base = upd.live;
  return {
    ...upd,
    liveKey: `${upd.liveKey ?? ''}|origem:${v.zoom}`,
    live: () => {
      const o = base ? base() : { fills: [], strokes: [], labels: [] };
      const m = origemEixosPlanta(v.zoom);
      return { fills: [...o.fills, ...m.fills], strokes: [...o.strokes, ...m.strokes], labels: [...o.labels, ...m.labels] };
    },
  };
}
