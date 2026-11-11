import type { ReactElement } from 'react';
import { formatQuantity, coreRange, layerSpans, wallThicknessOf, type Material, type WallType } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { useUnits } from '../useUnits.ts';

const HATCH_BG: Record<string, string> = {};
void HATCH_BG;

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Seção da parede desenhada ao vivo, na mesma convenção da planta (exterior à esquerda). */
export function SectionPreview({ type, materials }: { type: WallType; materials: Record<string, Material> }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const W = 340;
  const H = 150;
  const pad = 22;
  const total = Math.max(0.01, wallThicknessOf(type));
  const k = (W - pad * 2) / total;
  const spans = layerSpans(type);
  const core = coreRange(type);
  const top = 30;
  const bot = H - 38;
  return (
    <svg className="section-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dls_a11y_wall_section')}>
      <defs>
        {(['diagonal', 'cross', 'dots'] as const).map((h) => (
          <pattern key={h} id={`h-${h}`} width="6" height="6" patternUnits="userSpaceOnUse">
            {h !== 'dots' && <path d="M0 6L6 0" stroke="currentColor" strokeWidth="0.8" />}
            {h === 'cross' && <path d="M0 0L6 6" stroke="currentColor" strokeWidth="0.8" />}
            {h === 'dots' && <circle cx="3" cy="3" r="0.7" fill="currentColor" />}
          </pattern>
        ))}
      </defs>
      <text x={pad} y={14} fontSize="10" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('dls_svg_exterior')}</text>
      <text x={W - pad} y={14} fontSize="10" textAnchor="end" fill="var(--fg-faint)" fontFamily="var(--font-ui)">{t('dls_svg_interior')}</text>
      {spans.map((sp) => {
        const m = materials[sp.layer.materialId];
        const x = pad + sp.from * k;
        const w = Math.max(1.5, sp.layer.thickness * k);
        const fill = mixHex(m?.color ?? '#999999', '#ffffff', 0.55);
        return (
          <g key={sp.index}>
            <rect x={x} y={top} width={w} height={bot - top} fill={fill} stroke="var(--fg)" strokeWidth="0.6" />
            {m && (m.hatch === 'diagonal' || m.hatch === 'cross' || m.hatch === 'dots') && w > 4 && (
              <rect x={x} y={top} width={w} height={bot - top} fill={`url(#h-${m.hatch})`} style={{ color: 'var(--fg-soft)' }} />
            )}
            {w > 14 && (
              <text x={x + w / 2} y={bot + 12} fontSize="9" textAnchor="middle" fill="var(--fg-soft)" fontFamily="var(--font-mono)">
                {formatQuantity(units, 'smallLength', sp.layer.thickness)}
              </text>
            )}
          </g>
        );
      })}
      {spans[core.first] && spans[core.last] && (
        <g stroke="var(--accent)" strokeWidth="1.2" fill="none">
          <path d={`M${pad + spans[core.first]!.from * k} ${top - 6}V${top - 12}H${pad + spans[core.last]!.to * k}V${top - 6}`} />
          <text x={pad + ((spans[core.first]!.from + spans[core.last]!.to) / 2) * k} y={top - 15} fontSize="9" textAnchor="middle" fill="var(--accent)" stroke="none" fontFamily="var(--font-ui)">{t('dls_svg_core')}</text>
        </g>
      )}
      <g stroke="var(--fg-soft)" strokeWidth="0.8" fill="none">
        <path d={`M${pad} ${H - 14}H${W - pad}M${pad} ${H - 18}V${H - 10}M${W - pad} ${H - 18}V${H - 10}`} />
      </g>
      <text x={W / 2} y={H - 3} fontSize="10" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)">
        {formatQuantity(units, 'smallLength', total)}
      </text>
    </svg>
  );
}
