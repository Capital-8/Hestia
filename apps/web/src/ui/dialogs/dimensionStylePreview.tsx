import type { ReactElement } from 'react';
import type { DimensionStyle } from '@hestia/model';
import { formatDimValue } from './dimensionStyleModel.ts';
import { useT } from '../../editor/i18n.ts';

/** Pixels por milímetro de papel na prévia (só para o desenho caber; não é a escala de impressão). */
const PX_PER_MM = 4;
const SAMPLE = 3.5;
const OBJ_Y = 95;
const DIM_Y = 45;
const X0 = 40;
const X1 = 200;
const MID = (X0 + X1) / 2;

/** Prévia ao vivo: uma cota horizontal de 3,50 com as linhas de extensão, o marcador e o texto do estilo. */
export function DimensionStylePreview({ style }: { style: DimensionStyle }): ReactElement {
  const { t, lang } = useT();
  const s = PX_PER_MM;
  const tick = style.tickSize * s;
  const fs = style.textHeight * s;
  const label = formatDimValue(SAMPLE, style, lang);
  const textW = label.length * fs * 0.6;
  const extStart = OBJ_Y - style.extensionGap * s;
  const extEnd = Math.max(2, DIM_Y - style.extensionOvershoot * s);
  const centered = style.textPlacement === 'centered';
  const gapHalf = textW / 2 + 3;

  const marker = (x: number, dir: 1 | -1): ReactElement => {
    const bx = x + dir * tick;
    switch (style.tick) {
      case 'slash':
        return <line x1={x - tick / 2} y1={DIM_Y + tick / 2} x2={x + tick / 2} y2={DIM_Y - tick / 2} />;
      case 'dot':
        return <circle cx={x} cy={DIM_Y} r={tick / 2} fill="currentColor" />;
      case 'arrow-open':
        return <polyline points={`${bx},${DIM_Y - tick / 3} ${x},${DIM_Y} ${bx},${DIM_Y + tick / 3}`} fill="none" />;
      case 'arrow-filled':
      default:
        return <polygon points={`${x},${DIM_Y} ${bx},${DIM_Y - tick / 3} ${bx},${DIM_Y + tick / 3}`} fill="currentColor" />;
    }
  };

  return (
    <svg
      className="dim-style-preview"
      viewBox="0 0 240 110"
      role="img"
      aria-label={t('dlt_a11y_dim_preview', { value: label })}
      style={{ width: '100%', maxWidth: 420, height: 'auto', background: 'var(--panel, #fff)', border: '1px solid var(--line)', borderRadius: 4 }}
    >
      <g stroke="currentColor" strokeWidth={1} fill="none" color="#1f2937">
        {/* linhas de extensão: folga junto ao objeto, ultrapassagem além da linha de cota */}
        <line x1={X0} y1={extStart} x2={X0} y2={extEnd} />
        <line x1={X1} y1={extStart} x2={X1} y2={extEnd} />
        {/* linha de cota, interrompida pelo texto quando centrado */}
        {centered ? (
          <>
            <line x1={X0} y1={DIM_Y} x2={MID - gapHalf} y2={DIM_Y} />
            <line x1={MID + gapHalf} y1={DIM_Y} x2={X1} y2={DIM_Y} />
          </>
        ) : (
          <line x1={X0} y1={DIM_Y} x2={X1} y2={DIM_Y} />
        )}
        {marker(X0, 1)}
        {marker(X1, -1)}
      </g>
      <text
        x={MID}
        y={centered ? DIM_Y + fs * 0.35 : DIM_Y - 4}
        textAnchor="middle"
        fontSize={fs}
        fontFamily={style.font}
        fill="#1f2937"
      >
        {label}
      </text>
    </svg>
  );
}
