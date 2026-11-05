import { memo, type PointerEvent as ReactPointerEvent, type ReactElement, type RefObject } from 'react';
import type { SheetDrawList, SheetGroup } from '@hestia/render';
import type { Sheet } from '@hestia/model';
import { viewportOffset } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import type { SheetCamera, SheetSize } from './sheetCamera.ts';
import { HANDLES, handlePoint, type HandleId, type PaperBox } from './sheetSelection.ts';
import type { SnapGuide } from './sheetSnap.ts';
import type { SheetAlignFeature } from './sheetAlignTool.ts';

/** Número para o SVG, sem ruído de ponto flutuante. */
const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** O papel tem origem no canto inferior esquerdo e y para cima; o SVG tem y para baixo. */
const at = (q: { x: number; y: number }, h: number): string => `${n(q.x)} ${n(h - q.y)}`;

const ringsD = (rings: { x: number; y: number }[][], h: number): string => rings.map((ring) => `M${ring.map((q) => at(q, h)).join(' L')}Z`).join(' ');

/** Conteúdo de um grupo (preenchimentos, traços e textos) já em mm de papel. Não muda durante um arraste. */
const GroupContent = memo(function GroupContent({ g, h }: { g: Pick<SheetGroup, 'fills' | 'paths' | 'texts'>; h: number }): ReactElement {
  return (
    <>
      {g.fills.map((f, k) => (
        <path key={`f${k}`} d={f.polygons.map((poly) => ringsD(poly, h)).join(' ')} fill={f.color} fillRule="evenodd" stroke="none" />
      ))}
      {g.paths.map((s, k) => (
        <path
          key={`p${k}`}
          d={`M${s.pts.map((q) => at(q, h)).join(' L')}${s.closed ? 'Z' : ''}`}
          fill="none"
          stroke={s.color}
          strokeWidth={s.widthMm}
          strokeDasharray={s.dashMm ? `${n(s.dashMm[0])} ${n(s.dashMm[1])}` : undefined}
        />
      ))}
      {g.texts.map((t, k) => (
        <text
          key={`t${k}`}
          x={n(t.at.x)}
          y={n(h - t.at.y)}
          transform={t.rotation ? `rotate(${n(-t.rotation)} ${n(t.at.x)} ${n(h - t.at.y)})` : undefined}
          fontSize={t.sizeMm}
          fill={t.color}
          textAnchor={t.center ? 'middle' : 'start'}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {t.text}
        </text>
      ))}
    </>
  );
});

/**
 * Uma vista na folha: o conteúdo pode ser deslocado (pan) e recortado (crop). O grupo de recorte usa coordenadas de
 * papel; o deslocamento do conteúdo fica num grupo interno para o recorte não se mover junto.
 */
const ViewportLayer = memo(function ViewportLayer({
  vpId,
  clipId,
  g,
  box,
  offset,
  clip,
  move,
  h,
}: {
  vpId: string;
  clipId: string;
  g: Pick<SheetGroup, 'fills' | 'paths' | 'texts'>;
  box: PaperBox;
  offset: { x: number; y: number };
  clip: boolean;
  /** Deslocamento do preview de arraste, em mm de papel (move moldura e conteúdo juntos). */
  move: { x: number; y: number } | null;
  h: number;
}): ReactElement {
  const body = (
    <g transform={offset.x !== 0 || offset.y !== 0 ? `translate(${n(offset.x)} ${n(-offset.y)})` : undefined}>
      <GroupContent g={g} h={h} />
    </g>
  );
  return (
    <g data-vp-layer={vpId} transform={move ? `translate(${n(move.x)} ${n(-move.y)})` : undefined}>
      {clip ? (
        <>
          <clipPath id={clipId}>
            <rect x={n(box.x)} y={n(h - box.y - box.h)} width={n(box.w)} height={n(box.h)} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>{body}</g>
        </>
      ) : (
        body
      )}
    </g>
  );
});

/** Grade leve da folha (10 mm, com traço mais forte a cada 50 mm). */
function GridLines({ w, h }: { w: number; h: number }): ReactElement {
  const d: string[] = [];
  for (let x = 10; x < w; x += 10) d.push(`M${x} 0V${h}`);
  for (let y = 10; y < h; y += 10) d.push(`M0 ${y}H${w}`);
  const strong: string[] = [];
  for (let x = 50; x < w; x += 50) strong.push(`M${x} 0V${h}`);
  for (let y = 50; y < h; y += 50) strong.push(`M0 ${y}H${w}`);
  return (
    <g pointerEvents="none">
      <path d={d.join(' ')} stroke="#dfe3ea" strokeWidth={0.08} fill="none" />
      <path d={strong.join(' ')} stroke="#cdd4df" strokeWidth={0.14} fill="none" />
    </g>
  );
}

export interface SheetCanvasProps {
  list: SheetDrawList;
  sheet: Sheet;
  camera: SheetCamera;
  view: SheetSize;
  selection: readonly string[];
  /** Caixa de preview da vista em arraste/redimensionamento, por id. */
  preview: Record<string, PaperBox> | null;
  /** Deslocamento do conteúdo em preview (pan do conteúdo), por id. */
  contentPreview: Record<string, { x: number; y: number }> | null;
  /** Vista sendo arrastada do navegador: retângulo tracejado no lugar onde vai entrar. */
  dropPreview: { box: PaperBox; label: string; scale: number; adjusted: boolean } | null;
  /** Ferramenta Alinhar ativa: referência, candidata sob o cursor, fila (Ctrl+clique) e fantasma do alvo. */
  align: { ref: SheetAlignFeature | null; candidate: SheetAlignFeature | null; queue: readonly SheetAlignFeature[]; ghost: { box: PaperBox; delta: { x: number; y: number } } | null } | null;
  /** Ferramenta Mover ativa: fantasmas no destino, ponto base e marcador de captura. */
  move: { ghosts: { id: string; box: PaperBox }[]; base: { x: number; y: number } | null; snap: { p: { x: number; y: number }; label: string } | null; text: string | null } | null;
  resizingHandle: HandleId | null;
  guides: readonly SnapGuide[];
  showGrid: boolean;
  hovered: string | null;
  cursor: string;
  svgRef: RefObject<SVGSVGElement | null>;
  onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerCancel: () => void;
  onDoubleClick: (e: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerLeave: () => void;
}

/** Linha de referência/candidata do Alinhar, esticada por toda a folha, com o rótulo ao lado do ponto. */
function AlignLineView({ f, H, W, zoom, color, prefix, solid = false }: { f: SheetAlignFeature; H: number; W: number; zoom: number; color: string; prefix: string; solid?: boolean }): ReactElement {
  const L = W + H;
  const a = { x: f.line.p.x - f.line.d.x * L, y: f.line.p.y - f.line.d.y * L };
  const b = { x: f.line.p.x + f.line.d.x * L, y: f.line.p.y + f.line.d.y * L };
  return (
    <g>
      <line
        x1={a.x}
        y1={H - a.y}
        x2={b.x}
        y2={H - b.y}
        stroke={color}
        strokeWidth={(solid ? 1.6 : 1.1) / zoom}
        strokeDasharray={solid ? undefined : `${6 / zoom} ${4 / zoom}`}
        opacity={0.9}
      />
      <text
        x={f.line.p.x + 3 / zoom}
        y={H - f.line.p.y - 3 / zoom}
        fontSize={10 / zoom}
        fill={color}
        stroke="#ffffff"
        strokeWidth={3 / zoom}
        paintOrder="stroke"
        fontFamily="Helvetica, Arial, sans-serif"
      >
        {prefix}
        {f.label}
      </text>
    </g>
  );
}

/**
 * Folha desenhada em SVG, em mm de papel, com a câmera (zoom/pan) aplicada pelo viewBox. Os grupos das vistas são
 * memoizados: durante um arraste só a moldura/seleção muda, a geometria do desenho não é refeita.
 */
export function SheetCanvas(props: SheetCanvasProps): ReactElement {
  const { list, sheet, camera, view, selection, preview, contentPreview, dropPreview, align, move, resizingHandle, guides, showGrid, hovered, cursor, svgRef } = props;
  const { t } = useT();
  const W = list.widthMm;
  const H = list.heightMm;
  const vb = { x: camera.cx - view.w / (2 * camera.zoom), y: H - camera.cy - view.h / (2 * camera.zoom), w: view.w / camera.zoom, h: view.h / camera.zoom };
  const selected = sheet.viewports.filter((v) => selection.includes(v.id));
  const single = selected.length === 1 ? selected[0]! : null;
  const handleBox = single ? (preview?.[single.id] ?? { x: single.at.x, y: single.at.y, w: single.size.w, h: single.size.h }) : null;
  const handleMm = 7 / camera.zoom;
  const inner = { x0: sheet.margin, y0: sheet.margin, x1: W - sheet.margin, y1: H - sheet.margin };

  const viewportLayers = sheet.viewports.map((v, i) => {
    const g = list.groups[i] ?? null;
    if (!g) return null;
    const box = preview?.[v.id] ?? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h };
    const resizing = resizingHandle !== null && single?.id === v.id;
    return (
      <ViewportLayer
        key={v.id}
        vpId={v.id}
        clipId={`sheet-clip-${i}`}
        g={g}
        box={box}
        offset={contentPreview?.[v.id] ?? viewportOffset(v)}
        clip={v.clip !== false}
        move={preview?.[v.id] && !resizing ? { x: box.x - v.at.x, y: box.y - v.at.y } : null}
        h={H}
      />
    );
  });

  const furniture = list.groups[list.groups.length - 1] ?? null;
  const dimsText = (b: PaperBox): string => `${Math.round(b.w)} × ${Math.round(b.h)} mm`;

  return (
    <svg
      ref={svgRef}
      viewBox={`${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}`}
      style={{ width: '100%', height: '100%', touchAction: 'none', cursor, display: 'block' }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onPointerLeave={props.onPointerLeave}
      onDoubleClick={props.onDoubleClick}
      role="application"
      aria-label={t('cvs_canvas_aria', {
        size: sheet.size,
        orientation: t(sheet.orientation === 'landscape' ? 'cvs_landscape' : 'cvs_portrait'),
        n: sheet.viewports.length,
      })}
    >
      {/* Sombra e papel */}
      <rect x={2} y={2} width={W} height={H} fill="rgba(0,0,0,.22)" />
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />

      {viewportLayers}
      {furniture ? <GroupContent g={furniture} h={H} /> : null}
      {showGrid ? <GridLines w={W} h={H} /> : null}

      {/* Guias de encaixe */}
      {guides.map((g, i) =>
        g.axis === 'v' ? (
          <line key={`g${i}`} x1={g.at} y1={inner.y0} x2={g.at} y2={inner.y1} stroke="#e0559a" strokeWidth={0.5 / camera.zoom} strokeDasharray={`${2 / camera.zoom} ${1.5 / camera.zoom}`} pointerEvents="none" />
        ) : (
          <line key={`g${i}`} x1={inner.x0} y1={H - g.at} x2={inner.x1} y2={H - g.at} stroke="#e0559a" strokeWidth={0.5 / camera.zoom} strokeDasharray={`${2 / camera.zoom} ${1.5 / camera.zoom}`} pointerEvents="none" />
        ),
      )}

      {/* Ferramenta Mover: fantasmas no destino, ponto base e marcador de captura */}
      {move ? (
        <g pointerEvents="none">
          {move.ghosts.map((g) => (
            <rect
              key={`mg-${g.id}`}
              x={g.box.x}
              y={H - g.box.y - g.box.h}
              width={g.box.w}
              height={g.box.h}
              fill="rgba(29,111,224,.08)"
              stroke="#1d6fe0"
              strokeWidth={1.2 / camera.zoom}
              strokeDasharray={`${6 / camera.zoom} ${3 / camera.zoom}`}
            />
          ))}
          {move.base ? (
            <g>
              <line x1={move.base.x - 3 / camera.zoom} y1={H - move.base.y} x2={move.base.x + 3 / camera.zoom} y2={H - move.base.y} stroke="#d98a00" strokeWidth={1.4 / camera.zoom} />
              <line x1={move.base.x} y1={H - move.base.y - 3 / camera.zoom} x2={move.base.x} y2={H - move.base.y + 3 / camera.zoom} stroke="#d98a00" strokeWidth={1.4 / camera.zoom} />
            </g>
          ) : null}
          {move.snap ? (
            <g>
              <rect
                x={move.snap.p.x - 2.2 / camera.zoom}
                y={H - move.snap.p.y - 2.2 / camera.zoom}
                width={4.4 / camera.zoom}
                height={4.4 / camera.zoom}
                transform={`rotate(45 ${move.snap.p.x} ${H - move.snap.p.y})`}
                fill="none"
                stroke="#1d6fe0"
                strokeWidth={1.3 / camera.zoom}
              />
              <text
                x={move.snap.p.x + 3.5 / camera.zoom}
                y={H - move.snap.p.y - 3 / camera.zoom}
                fontSize={10 / camera.zoom}
                fill="#1d6fe0"
                stroke="#ffffff"
                strokeWidth={3 / camera.zoom}
                paintOrder="stroke"
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {move.snap.label}
              </text>
            </g>
          ) : null}
          {move.text && (move.snap || move.base) ? (
            <text
              x={(move.snap?.p.x ?? move.base!.x) + 3.5 / camera.zoom}
              y={H - (move.snap?.p.y ?? move.base!.y) + 12 / camera.zoom}
              fontSize={10 / camera.zoom}
              fill="#d98a00"
              stroke="#ffffff"
              strokeWidth={3 / camera.zoom}
              paintOrder="stroke"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              {move.text}
            </text>
          ) : null}
        </g>
      ) : null}

      {/* Ferramenta Alinhar: referência, candidata, fila e fantasma do alvo */}
      {align ? (
        <g pointerEvents="none">
          {align.ref ? <AlignLineView f={align.ref} H={H} W={W} zoom={camera.zoom} color="#1d6fe0" prefix={t('cvs_ref_prefix')} solid /> : null}
          {align.queue.map((f) => (
            <AlignLineView key={`q-${f.key}`} f={f} H={H} W={W} zoom={camera.zoom} color="#d98a00" prefix={t('cvs_align_prefix')} />
          ))}
          {align.candidate ? (
            <AlignLineView f={align.candidate} H={H} W={W} zoom={camera.zoom} color={align.ref ? '#1d6fe0' : '#7a828c'} prefix={align.ref ? t('cvs_move_prefix') : t('cvs_ref_prefix')} />
          ) : null}
          {align.ghost ? (
            <>
              <rect
                x={align.ghost.box.x}
                y={H - align.ghost.box.y - align.ghost.box.h}
                width={align.ghost.box.w}
                height={align.ghost.box.h}
                fill="rgba(29,111,224,.06)"
                stroke="#1d6fe0"
                strokeWidth={1.2 / camera.zoom}
                strokeDasharray={`${5 / camera.zoom} ${3 / camera.zoom}`}
              />
              <text
                x={align.ghost.box.x + 2.5 / camera.zoom}
                y={H - align.ghost.box.y - align.ghost.box.h + 12 / camera.zoom}
                fontSize={10 / camera.zoom}
                fill="#1d6fe0"
                stroke="#ffffff"
                strokeWidth={3 / camera.zoom}
                paintOrder="stroke"
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {t('cvs_delta', { value: Math.round(Math.hypot(align.ghost.delta.x, align.ghost.delta.y) * 10) / 10 })}
              </text>
            </>
          ) : null}
        </g>
      ) : null}

      {/* Vista arrastada do navegador: retângulo de prévia no lugar onde vai entrar */}
      {dropPreview ? (
        <g pointerEvents="none">
          <rect
            x={dropPreview.box.x}
            y={H - dropPreview.box.y - dropPreview.box.h}
            width={dropPreview.box.w}
            height={dropPreview.box.h}
            fill="rgba(29,111,224,.10)"
            stroke="#1d6fe0"
            strokeWidth={1.4 / camera.zoom}
            strokeDasharray={`${6 / camera.zoom} ${4 / camera.zoom}`}
          />
          <text
            x={dropPreview.box.x + 2.5 / camera.zoom}
            y={H - dropPreview.box.y - dropPreview.box.h + 13 / camera.zoom}
            fontSize={11 / camera.zoom}
            fill="#1d6fe0"
            stroke="#ffffff"
            strokeWidth={3 / camera.zoom}
            paintOrder="stroke"
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {t(dropPreview.adjusted ? 'cvs_drop_preview_adjusted' : 'cvs_drop_preview', { label: dropPreview.label, scale: dropPreview.scale })}
          </text>
        </g>
      ) : null}

      {/* Realce de hover e seleção (a seleção some enquanto o Alinhar está ativo) */}
      {!align && hovered && !selection.includes(hovered)
        ? sheet.viewports
            .filter((v) => v.id === hovered)
            .map((v) => (
              <rect key={`h-${v.id}`} x={v.at.x} y={H - v.at.y - v.size.h} width={v.size.w} height={v.size.h} fill="rgba(29,111,224,.05)" stroke="#1d6fe0" strokeWidth={0.4 / camera.zoom} opacity={0.7} pointerEvents="none" />
            ))
        : null}
      {!align
        ? selected.map((v) => {
            const b = preview?.[v.id] ?? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h };
            return (
              <g key={`s-${v.id}`} pointerEvents="none">
                <rect x={b.x} y={H - b.y - b.h} width={b.w} height={b.h} fill="none" stroke="#1d6fe0" strokeWidth={0.6 / camera.zoom} />
              </g>
            );
          })
        : null}

      {/* Alças da vista selecionada (uma só) */}
      {!align && single && handleBox ? (
        <g pointerEvents="none" data-handles={HANDLES.length}>
          {HANDLES.map((hd) => {
            const p = handlePoint(handleBox, hd);
            const active = resizingHandle === hd;
            return (
              <rect
                key={hd}
                x={p.x - handleMm / 2}
                y={H - p.y - handleMm / 2}
                width={handleMm}
                height={handleMm}
                fill={active ? '#1d6fe0' : '#ffffff'}
                stroke="#1d6fe0"
                strokeWidth={0.7 / camera.zoom}
              />
            );
          })}
          <text x={handleBox.x + 1.4 / camera.zoom} y={H - handleBox.y - handleBox.h + 3.2 / camera.zoom} fontSize={2.6 / camera.zoom} fill="#1d6fe0" fontFamily="Helvetica, Arial, sans-serif">
            {dimsText(handleBox)}
          </text>
        </g>
      ) : null}

      {/* Seleção múltipla: contorno leve em todas */}
      {selection.length > 1
        ? selected.map((v) => {
            const b = preview?.[v.id] ?? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h };
            return <rect key={`m-${v.id}`} x={b.x} y={H - b.y - b.h} width={b.w} height={b.h} fill="rgba(29,111,224,.06)" stroke="#1d6fe0" strokeWidth={0.4 / camera.zoom} pointerEvents="none" />;
          })
        : null}
    </svg>
  );
}
