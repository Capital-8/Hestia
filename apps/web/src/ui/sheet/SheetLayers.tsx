import { memo, useEffect, useState, type ReactElement } from 'react';
import type { SheetGroup } from '@hestia/render';
import type { SheetCamera, SheetSize } from './sheetCamera.ts';
import type { PaperBox } from './sheetSelection.ts';
import { GroupContent, n } from './SheetGroupContent.tsx';

/** Conteúdo vetorial de uma camada (na coordenada do cache). Só é refeito quando o desenho da vista muda. */
const LayerBody = memo(function LayerBody({ vpId, g, h }: { vpId: string; g: Pick<SheetGroup, 'fills' | 'paths' | 'texts'>; h: number }): ReactElement {
  return (
    <g data-vp-layer={vpId}>
      <GroupContent g={g} h={h} />
    </g>
  );
});

/** Acima desta área (px²) a camada deixa de ser promovida (não vale guardar um bitmap tão grande). */
const MAX_PROMOTED_PX2 = 6e6;

/**
 * Uma camada da folha (uma vista, ou a moldura e o carimbo): um `<svg>` próprio posicionado por CSS. Durante o pan, o
 * zoom e o arraste da vista só o `transform` muda: o navegador reaproveita o raster da camada em vez de repintar
 * milhares de traços a cada quadro. O tamanho CSS é fixo no zoom de referência (`base`) e o zoom corrente entra como
 * escala; quando o gesto termina o `base` alcança o zoom e a camada é rasterizada de novo, nítida.
 */
export function ViewportLayer({
  vpId,
  parts,
  box,
  shift,
  offset,
  clip,
  move,
  H,
  camera,
  view,
  base,
}: {
  vpId: string;
  parts: Pick<SheetGroup, 'fills' | 'paths' | 'texts'>;
  box: PaperBox;
  shift: { x: number; y: number };
  offset: { x: number; y: number };
  clip: boolean;
  /** Deslocamento do preview de arraste, em mm de papel (move moldura e conteúdo juntos). */
  move: { x: number; y: number } | null;
  H: number;
  camera: SheetCamera;
  view: SheetSize;
  base: number;
}): ReactElement {
  const mv = move ?? { x: 0, y: 0 };
  const z = camera.zoom;
  const sx = view.w / 2 + (box.x + mv.x - camera.cx) * z;
  const sy = view.h / 2 - (box.y + box.h + mv.y - camera.cy) * z;
  const pxW = Math.max(1, box.w * base);
  const pxH = Math.max(1, box.h * base);
  // Mesmo recorte de antes: a caixa da vista; o desenho está na coordenada do cache, então o viewBox absorve o deslocamento.
  const vb = `${n(box.x - shift.x - offset.x)} ${n(H - box.y - box.h + shift.y + offset.y)} ${n(box.w)} ${n(box.h)}`;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: pxW,
        height: pxH,
        transform: `translate(${n(sx)}px, ${n(sy)}px) scale(${n(z / base)})`,
        transformOrigin: '0 0',
        willChange: pxW * pxH <= MAX_PROMOTED_PX2 ? 'transform' : 'auto',
        pointerEvents: 'none',
      }}
    >
      <svg viewBox={vb} width="100%" height="100%" style={{ display: 'block', overflow: clip ? 'hidden' : 'visible' }} preserveAspectRatio="none" pointerEvents="none">
        <LayerBody vpId={vpId} g={parts} h={H} />
      </svg>
    </div>
  );
}

/** Razão máxima/mínima entre o zoom corrente e o de referência antes de rasterizar de novo na hora (evita bitmaps enormes ou borrados). */
const MAX_STRETCH = 2;
const MIN_STRETCH = 0.4;
/** Zoom de referência das camadas: acompanha o zoom da câmera só depois de ele parar (refino nítido ao fim do gesto). */
export const REFINE_DELAY_MS = 140;
export function useRefinedZoom(zoom: number): number {
  const [base, setBase] = useState(zoom);
  const ratio = zoom / base;
  // Zoom muito longe do raster atual: refina já (setState na renderização: o React repete a renderização sem passar pelo DOM).
  if (ratio > MAX_STRETCH || ratio < MIN_STRETCH) setBase(zoom);
  useEffect(() => {
    if (zoom === base) return;
    const id = window.setTimeout(() => setBase(zoom), REFINE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [zoom, base]);
  return ratio > MAX_STRETCH || ratio < MIN_STRETCH ? zoom : base;
}

