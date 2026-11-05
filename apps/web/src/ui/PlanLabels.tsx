import { forwardRef, useImperativeHandle, useRef } from 'react';
import { worldToScreen, type LabelOp, type Viewport } from '@hestia/render';

/** Rótulos da planta (DOM sobre o canvas): etiquetas de tipo, cotas e textos de anotação (decisão 0019). */
export interface PlanLabelsHandle { syncView(v: Viewport): void; }

/** Margem (px) em torno da vista onde um rótulo ainda é montado: evita "pop" na borda ao arrastar. */
export const MARGEM_ROTULO_PX = 96;
/** Abaixo deste corpo (px) o texto não é legível: o rótulo sai por LOD (as cotas de 3 px do zoom 12 continuam). */
export const LOD_MIN_PX = 2.4;
/** Teto de rótulos visíveis de uma vez: protege a tela de um projeto com milhares de etiquetas. */
export const MAX_ROTULOS_VISIVEIS = 1200;

/** Caixa do rótulo em pixels de tela (aproximada: o texto é medido sem forçar layout). */
function caixaDoRotulo(l: LabelOp, v: Viewport): { x0: number; y0: number; x1: number; y1: number } | null {
  if (l.maskBoundary) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of l.maskBoundary) {
      const s = worldToScreen(v, p);
      if (s.x < x0) x0 = s.x;
      if (s.y < y0) y0 = s.y;
      if (s.x > x1) x1 = s.x;
      if (s.y > y1) y1 = s.y;
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }
  const s = worldToScreen(v, l.at);
  const x = s.x + (l.dx ?? 0);
  const y = s.y + (l.dy ?? 0);
  if (l.fontPx !== undefined) {
    const w = l.widthPx ?? Math.max(8, l.text.length * l.fontPx * 0.62);
    // Texto com quebra de linha ocupa mais de uma linha na caixa do culling.
    const linhas = l.text.split('\n').length;
    const h = l.fontPx * 1.5 * linhas;
    return l.center ? { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 } : { x0: x, y0: y - h / 2, x1: x + w, y1: y + h / 2 };
  }
  const w = Math.max(8, l.text.length * 7.2);
  return { x0: x, y0: y - 8, x1: x + w, y1: y + 8 };
}

/**
 * `transform` do rótulo: a posição em px entra num `translate3d` (o navegador compõe em subpixel de forma estável, sem o
 * arredondamento de `left`/`top` a cada quadro) e, à direita, a ancoragem e a rotação que o estilo do rótulo já usava.
 */
export function transformDoRotulo(l: LabelOp, x: number, y: number): string {
  const pos = `translate3d(${x}px, ${y}px, 0)`;
  if (l.fontPx !== undefined && l.center) return `${pos} translate(-50%, -50%) rotate(${-(l.rotation ?? 0)}deg)`;
  if (l.fontPx !== undefined) return `${pos} translate(${l.align === 'right' ? '-100%' : l.align === 'center' ? '-50%' : '0'}, -50%)`;
  return `${pos} translate(0, -100%)`;
}

/**
 * O rótulo aparece nesta vista? Culling (fora da vista com margem) e LOD (texto abaixo de `LOD_MIN_PX`). Função pura:
 * a camada DOM a usa a cada quadro, sem re-renderizar o React.
 */
export function rotuloVisivelNaVista(l: LabelOp, v: Viewport, margem = MARGEM_ROTULO_PX): boolean {
  if (l.fontPx !== undefined && l.fontPx < LOD_MIN_PX) return false;
  const c = caixaDoRotulo(l, v);
  if (!c) return false;
  return c.x1 >= -margem && c.x0 <= v.width + margem && c.y1 >= -margem && c.y0 <= v.height + margem;
}

export const PlanLabels = forwardRef<PlanLabelsHandle, { labels: LabelOp[]; v: Viewport | null }>(function PlanLabels({ labels, v }, ref) {
  const nodes = useRef<Array<HTMLSpanElement | null>>([]);
  const masks = useRef<Array<SVGPolygonElement | null>>([]);
  /** Última visibilidade aplicada por índice: evita escrever `display` a cada quadro. */
  const visiveis = useRef<boolean[]>([]);
  const masksVisiveis = useRef<boolean[]>([]);
  useImperativeHandle(ref, () => ({
    syncView(view) {
      let mostrados = 0;
      labels.forEach((label, i) => {
        if (label.maskBoundary) {
          const mask = masks.current[i];
          if (!mask) return;
          const visivel = mostrados < MAX_ROTULOS_VISIVEIS && rotuloVisivelNaVista(label, view);
          if (masksVisiveis.current[i] !== visivel) {
            masksVisiveis.current[i] = visivel;
            mask.style.display = visivel ? '' : 'none';
          }
          if (!visivel) return;
          mostrados++;
          mask.setAttribute('points', label.maskBoundary.map((p) => { const s = worldToScreen(view, p); return `${s.x},${s.y}`; }).join(' '));
          return;
        }
        const node = nodes.current[i];
        if (!node) return;
        const visivel = mostrados < MAX_ROTULOS_VISIVEIS && rotuloVisivelNaVista(label, view);
        if (visiveis.current[i] !== visivel) {
          visiveis.current[i] = visivel;
          node.style.display = visivel ? '' : 'none';
        }
        if (!visivel) return;
        mostrados++;
        const screen = worldToScreen(view, label.at);
        // `left`/`top` ficam em 0: a posição fracionária vai no `translate3d`, composta no mesmo passo da rotação.
        node.style.transform = transformDoRotulo(label, screen.x + (label.dx ?? 0), screen.y + (label.dy ?? 0));
      });
    },
  }), [labels]);
  return (
    <div className="labels" aria-hidden="true">
      {v && labels.some((l) => l.maskBoundary) ? (
        <svg className="plan-mask-layer" width={v.width} height={v.height} viewBox={`0 0 ${v.width} ${v.height}`}>
          {labels.map((l, i) => l.maskBoundary ? <polygon key={i} ref={(node) => { masks.current[i] = node; }} points={l.maskBoundary.map((p) => { const s = worldToScreen(v, p); return `${s.x},${s.y}`; }).join(' ')} fill={l.maskColor ?? '#fbfbfa'} stroke={l.maskBorderColor ?? 'none'} strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null)}
        </svg>
      ) : null}
      {v
        ? labels.map((l, i) => {
            if (l.maskBoundary && !l.text) return null;
            const sp = worldToScreen(v, l.at);
            // Anotação (cota ou texto, decisão 0019): fonte e rotação do papel, centrada no ponto.
            if (l.fontPx !== undefined && l.center) {
              return (
                <span
                  key={i}
                  ref={(node) => { nodes.current[i] = node; }}
                  className={`plan-note${l.appearance === 'dimension-preview' ? ' plan-note--dimension-preview' : ''}`}
                  style={{
                    left: 0,
                    top: 0,
                    fontSize: l.fontPx,
                    fontFamily: l.fontFamily,
                    width: l.widthPx,
                    whiteSpace: l.whiteSpace ?? 'pre-wrap',
                    textAlign: l.align,
                    fontWeight: l.bold ? 700 : undefined,
                    fontStyle: l.italic ? 'italic' : undefined,
                    textDecoration: l.underline ? 'underline' : undefined,
                    color: l.color,
                    transform: transformDoRotulo(l, sp.x + (l.dx ?? 0), sp.y + (l.dy ?? 0)),
                  }}
                >
                  {l.text}
                </span>
              );
            }
            // Rótulo com fonte em mm de papel, mas não centrado (etiqueta de parede, ambiente, escada): usa plan-note
            // sem centralizar em X, só em Y (para o ponto de ancoragem ficar no centro vertical do texto).
            if (l.fontPx !== undefined)
              return (
                <span key={i} ref={(node) => { nodes.current[i] = node; }} className="plan-note" style={{ left: 0, top: 0, fontSize: l.fontPx, textAlign: l.align, color: l.color, transform: transformDoRotulo(l, sp.x + (l.dx ?? 0), sp.y + (l.dy ?? 0)) }}>
                  {l.text}
                </span>
              );
            return (
              <span key={i} ref={(node) => { nodes.current[i] = node; }} className={l.tone === 'soft' ? 'dim-label dim-label--soft' : 'dim-label'} style={{ left: 0, top: 0, color: l.color, transform: transformDoRotulo(l, sp.x + (l.dx ?? 0), sp.y + (l.dy ?? 0)) }}>
                {l.text}
              </span>
            );
          })
        : null}
    </div>
  );
});
