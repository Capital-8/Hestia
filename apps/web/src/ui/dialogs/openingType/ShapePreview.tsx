import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import type { OPt, OpeningType } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { cmTexto } from './openingTypeControls.ts';
import { movePolygonPoint, polygonPointsOf, withPolygonPoints } from './openingTypeShape.ts';
import { polygonHandlePx, previewFrame, pxToPolygonUV, shapeGeometry, toPx, type PreviewFrame, type ShapeDim } from './shapePreview.ts';
import { useUnits } from '../../useUnits.ts';

const W = 300;
const H = 260;
/** Passo (m) das setas do teclado numa alça. */
const KEY_STEP = 0.01;

const px1 = (n: number): string => n.toFixed(1); // units-ok: pixels do SVG, não é medida do projeto
const path = (f: PreviewFrame, ring: readonly OPt[]): string => ring.map((p, i) => `${i === 0 ? 'M' : 'L'}${toPx(f, p).map(px1).join(' ')}`).join('') + 'Z';

/** Linha de cota: traço paralelo ao segmento, deslocado 14 px para o lado, com o texto no meio. */
function Dim({ f, dim, text }: { f: PreviewFrame; dim: ShapeDim; text: string }): ReactElement {
  const [ax, ay] = toPx(f, dim.a);
  const [bx, by] = toPx(f, dim.b);
  const off = dim.side === 'below' ? [0, 16] : dim.side === 'above' ? [0, -14] : dim.side === 'left' ? [-14, 0] : [14, 0];
  const [x1, y1, x2, y2] = [ax + off[0]!, ay + off[1]!, bx + off[0]!, by + off[1]!];
  const vertical = dim.side === 'left' || dim.side === 'right';
  const [tx, ty] = [(x1 + x2) / 2 + (vertical ? (dim.side === 'left' ? -4 : 4) : 0), (y1 + y2) / 2 + (vertical ? 0 : dim.side === 'below' ? 11 : -4)];
  return (
    <g className="op-shape-dim" data-dim={dim.id}>
      <line x1={ax} y1={ay} x2={x1} y2={y1} />
      <line x1={bx} y1={by} x2={x2} y2={y2} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <text x={tx} y={ty} textAnchor={vertical ? (dim.side === 'left' ? 'end' : 'start') : 'middle'} dominantBaseline={vertical ? 'middle' : undefined}>{text}</text>
    </g>
  );
}

/**
 * Prévia 2D da forma do vão: o contorno real (`outline`) do vão bruto, a esquadria recuada em outra cor e as cotas de largura,
 * altura e flecha (ou topo do trapézio). No polígono, os vértices são alças: arraste com o ponteiro ou use as setas do teclado.
 * Atualiza a cada mudança do rascunho (o contorno é recalculado na hora).
 */
export function ShapePreview({ d, onChange }: { d: OpeningType; onChange: (next: OpeningType) => void }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const g = shapeGeometry(d);
  const f = previewFrame(g.width, g.height, W, H);
  const points = d.shape?.kind === 'polygon' ? polygonPointsOf(d) : [];
  const editavel = points.length > 0;
  const mover = (i: number, u: number, v: number): void => onChange(withPolygonPoints(d, movePolygonPoint(points, i, u, v, d.width, d.height)));
  const alvo = (e: PointerEvent<SVGElement>): { u: number; v: number } | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return pxToPolygonUV(f, g, ((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height);
  };
  const aoArrastar = (e: PointerEvent<SVGElement>): void => {
    if (drag === null) return;
    const uv = alvo(e);
    if (uv) mover(drag, uv.u, uv.v);
  };
  const aoTeclar = (e: KeyboardEvent<SVGElement>, i: number): void => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    const dv = delta[e.key];
    if (!dv) return;
    e.preventDefault();
    const p = points[i]!;
    mover(i, p.u + dv[0], p.v + dv[1]);
  };
  const txt = (m: number): string => cmTexto(units, m);
  return (
    <figure className="op-shape-fig">
      <svg
        ref={svgRef}
        className="op-shape-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('dsh_prev_aria')}
        onPointerMove={aoArrastar}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {g.outer ? <path className="op-shape-hole" d={path(f, g.outer)} /> : null}
        {g.inner ? <path className="op-shape-inner" d={path(f, g.inner)} /> : null}
        {g.frame ? <path className="op-shape-frame" d={path(f, g.frame)} /> : null}
        {g.outer ? <path className="op-shape-outline" d={path(f, g.outer)} /> : null}
        {g.dims.map((dim) => <Dim key={dim.id} f={f} dim={dim} text={txt(dim.value)} />)}
        {editavel
          ? points.map((p, i) => {
              const [cx, cy] = polygonHandlePx(f, g, p);
              return (
                <circle
                  key={i}
                  className={`op-shape-handle${drag === i ? ' on' : ''}`}
                  cx={cx}
                  cy={cy}
                  r={5}
                  tabIndex={0}
                  role="slider"
                  aria-label={t('dsh_pts_handle', { n: i + 1 })}
                  aria-valuetext={`${txt(p.u)}; ${txt(p.v)}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    setDrag(i);
                  }}
                  onKeyDown={(e) => aoTeclar(e, i)}
                />
              );
            })
          : null}
      </svg>
      <figcaption className="op-shape-legend">
        <span className="op-shape-key opening" />{t('dsh_legend_opening')}
        <span className="op-shape-key frame" />{t('dsh_legend_frame')}
      </figcaption>
    </figure>
  );
}
