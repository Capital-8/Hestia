import { memo, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement, type RefObject } from 'react';
import type { SheetGroup, SheetLayer, SheetLayers } from '@hestia/render';
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

/** Sequência de traços consecutivos de mesmo estilo (cor, espessura, tracejado), fundidos num só `<path>`. */
export interface StrokeRun {
  d: string;
  color: string;
  widthMm: number;
  dash: string | undefined;
}

/**
 * Funde traços CONSECUTIVOS de mesmo estilo num único elemento: a ordem de pintura não muda (só se juntam vizinhos) e o
 * tracejado recomeça a cada subcaminho, como antes. Reduz milhares de nós SVG por vista a algumas centenas.
 */
export function strokeRuns(paths: readonly SheetGroup['paths'][number][], h: number): StrokeRun[] {
  const out: StrokeRun[] = [];
  let cur: StrokeRun | null = null;
  let key = '';
  for (const s of paths) {
    const dash = s.dashMm ? `${n(s.dashMm[0])} ${n(s.dashMm[1])}` : undefined;
    const k = `${s.color}|${s.widthMm}|${dash ?? ''}`;
    const d = `M${s.pts.map((q) => at(q, h)).join(' L')}${s.closed ? 'Z' : ''}`;
    if (cur && k === key) {
      cur.d += ` ${d}`;
    } else {
      cur = { d, color: s.color, widthMm: s.widthMm, dash };
      key = k;
      out.push(cur);
    }
  }
  return out;
}

/** Textos de caminho (`d`) de um grupo, prontos para o React: guardados por objeto de partes para não serem refeitos. */
interface LayerStrings {
  h: number;
  fills: string[];
  runs: StrokeRun[];
}
const stringsOf = new WeakMap<object, LayerStrings>();

export function layerStrings(g: Pick<SheetGroup, 'fills' | 'paths'>, h: number): LayerStrings {
  const hit = stringsOf.get(g);
  if (hit && hit.h === h) return hit;
  const v: LayerStrings = { h, fills: g.fills.map((f) => f.polygons.map((poly) => ringsD(poly, h)).join(' ')), runs: strokeRuns(g.paths, h) };
  stringsOf.set(g, v);
  return v;
}

/** Prepara os textos de caminho de uma vista (ao arrastá-la do Navegador): o soltar só cria os elementos. */
export function warmLayerStrings(g: Pick<SheetGroup, 'fills' | 'paths'>, h: number): void {
  layerStrings(g, h);
}

/** Conteúdo de um grupo (preenchimentos, traços e textos) já em mm de papel. Não muda durante um arraste. */
export const GroupContent = memo(function GroupContent({ g, h }: { g: Pick<SheetGroup, 'fills' | 'paths' | 'texts'>; h: number }): ReactElement {
  const st = layerStrings(g, h);
  return (
    <>
      {g.fills.map((f, k) => (
        <path key={`f${k}`} d={st.fills[k]} fill={f.color} fillRule="evenodd" stroke="none" />
      ))}
      {st.runs.map((r, k) => (
        <path key={`p${k}`} d={r.d} fill="none" stroke={r.color} strokeWidth={r.widthMm} strokeDasharray={r.dash} />
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
function ViewportLayer({
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
function useRefinedZoom(zoom: number): number {
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
  layers: SheetLayers;
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
  const { layers, sheet, camera, view, selection, preview, contentPreview, dropPreview, align, move, resizingHandle, guides, showGrid, hovered, cursor, svgRef } = props;
  const { t } = useT();
  const W = layers.widthMm;
  const H = layers.heightMm;
  const base = useRefinedZoom(camera.zoom);
  const vb = { x: camera.cx - view.w / (2 * camera.zoom), y: H - camera.cy - view.h / (2 * camera.zoom), w: view.w / camera.zoom, h: view.h / camera.zoom };
  const selected = sheet.viewports.filter((v) => selection.includes(v.id));
  const single = selected.length === 1 ? selected[0]! : null;
  const handleBox = single ? (preview?.[single.id] ?? { x: single.at.x, y: single.at.y, w: single.size.w, h: single.size.h }) : null;
  const handleMm = 7 / camera.zoom;
  const inner = { x0: sheet.margin, y0: sheet.margin, x1: W - sheet.margin, y1: H - sheet.margin };

  const layerOf = new Map<string, SheetLayer>(layers.layers.map((ly) => [ly.id, ly]));
  const viewportLayers = sheet.viewports.map((v) => {
    const ly = layerOf.get(v.id);
    if (!ly) return null;
    const box = preview?.[v.id] ?? { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h };
    const resizing = resizingHandle !== null && single?.id === v.id;
    return (
      <ViewportLayer
        key={v.id}
        vpId={v.id}
        parts={ly.parts}
        box={box}
        shift={ly.shift}
        offset={contentPreview?.[v.id] ?? viewportOffset(v)}
        clip={v.clip !== false}
        move={preview?.[v.id] && !resizing ? { x: box.x - v.at.x, y: box.y - v.at.y } : null}
        H={H}
        camera={camera}
        view={view}
        base={base}
      />
    );
  });

  const dimsText = (b: PaperBox): string => `${Math.round(b.w)} × ${Math.round(b.h)} mm`;

  const viewBox = `${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}`;
  const fill: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block' };
  return (
    <>
      {/* Sombra e papel (por baixo das camadas das vistas) */}
      <svg viewBox={viewBox} style={fill} pointerEvents="none" aria-hidden="true">
        <rect x={2} y={2} width={W} height={H} fill="rgba(0,0,0,.22)" />
        <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      </svg>
      {viewportLayers}
    <svg
      ref={svgRef}
      viewBox={viewBox}
      style={{ ...fill, touchAction: 'none', cursor }}
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
      <g data-sheet-furniture="">
        <GroupContent g={layers.furniture} h={H} />
      </g>
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
    </>
  );
}
