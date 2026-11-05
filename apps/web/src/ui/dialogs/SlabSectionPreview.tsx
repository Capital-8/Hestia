import type { ReactElement } from 'react';
import { formatQuantity, coreRange, slabTypeThickness, type Material, type SlabType } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { useUnits } from '../useUnits.ts';

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Seção da laje desenhada ao vivo: as camadas empilhadas do topo (cota da laje, à esquerda) para baixo,
 * na mesma convenção de cor e hachura do tipo de parede.
 */
export function SlabSectionPreview({ type, materials }: { type: SlabType; materials: Record<string, Material> }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const W = 340;
  const H = 230;
  const top = 26;
  const bodyH = 160;
  const total = Math.max(0.01, slabTypeThickness(type));
  const k = bodyH / total;
  let y = top;
  const bands = type.layers.map((l, i) => {
    const h = Math.max(2, l.thickness * k);
    const band = { i, layer: l, y, h };
    y += h;
    return band;
  });
  const bottom = y;
  const core = coreRange(type);
  const primeira = bands[core.first];
  const ultima = bands[core.last];
  return (
    <svg className="section-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dls_a11y_slab_section')}>
      <defs>
        {(['diagonal', 'cross', 'dots'] as const).map((h) => (
          <pattern key={h} id={`lh-${h}`} width="6" height="6" patternUnits="userSpaceOnUse">
            {h !== 'dots' && <path d="M0 6L6 0" stroke="currentColor" strokeWidth="0.8" />}
            {h === 'cross' && <path d="M0 0L6 6" stroke="currentColor" strokeWidth="0.8" />}
            {h === 'dots' && <circle cx="3" cy="3" r="0.7" fill="currentColor" />}
          </pattern>
        ))}
      </defs>
      <text x={22} y={14} fontSize="10" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('dls_svg_slab_top')}</text>
      <text x={22} y={H - 8} fontSize="10" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('dls_svg_bottom_face')}</text>
      {bands.map((b) => {
        const m = materials[b.layer.materialId];
        const fill = mixHex(m?.color ?? '#999999', '#ffffff', 0.55);
        const w = 260;
        const x = 22;
        const inCore = b.i >= core.first && b.i <= core.last;
        return (
          <g key={b.i}>
            <rect x={x} y={b.y} width={w} height={b.h} fill={fill} stroke="var(--fg)" strokeWidth="0.6" />
            {m && (m.hatch === 'diagonal' || m.hatch === 'cross' || m.hatch === 'dots') && (
              <rect x={x} y={b.y} width={w} height={b.h} fill={`url(#lh-${m.hatch})`} style={{ color: 'var(--fg-soft)' }} />
            )}
            {inCore && <rect x={x} y={b.y} width={w} height={b.h} fill="none" stroke="var(--accent)" strokeWidth={1.4} />}
            {b.h > 11 && (
              <text x={x + 6} y={b.y + b.h / 2 + 3} fontSize="9" fill="var(--fg)" fontFamily="var(--font-ui)">
                {formatQuantity(units, 'smallLength', b.layer.thickness)}
              </text>
            )}
          </g>
        );
      })}
      {primeira && ultima && (
        <g stroke="var(--accent)" strokeWidth="1.2" fill="none">
          <path d={`M14 ${primeira.y}H8V${ultima.y + ultima.h}H14`} />
          <text x={7} y={(primeira.y + ultima.y + ultima.h) / 2} fontSize="9" textAnchor="middle" fill="var(--accent)" stroke="none" fontFamily="var(--font-ui)" transform={`rotate(-90 7 ${(primeira.y + ultima.y + ultima.h) / 2})`}>{t('dls_svg_core')}</text>
        </g>
      )}
      <g stroke="var(--fg-soft)" strokeWidth="0.8" fill="none">
        <path d={`M${W - 30} ${top}V${bottom}M${W - 34} ${top}H${W - 26}M${W - 34} ${bottom}H${W - 26}`} />
      </g>
      <text x={W - 36} y={(top + bottom) / 2 + 3} fontSize="10" textAnchor="end" fill="var(--fg)" fontFamily="var(--font-mono)">
        {formatQuantity(units, 'smallLength', total)}
      </text>
    </svg>
  );
}
