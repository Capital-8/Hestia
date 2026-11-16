import type { ReactElement } from 'react';
import { expandTagFormat, type TagFamily } from '@hestia/model';

const SAMPLE = {
  mark: 'P01',
  type: 'P-80',
  name: 'Porta 80×210',
  width: '0,80',
  height: '2,10',
  level: 'Térreo',
} as const;

/** Prévia ao vivo de uma família de etiqueta (contorno, fundo e modelo preenchido com um exemplo). */
export function TagFamilyPreview({ family, compact = false }: { family: TagFamily; compact?: boolean }): ReactElement {
  const text = expandTagFormat(family.format, SAMPLE) || '—';
  const shapeClass = family.shape === 'none'
    ? 'plan-note'
    : `plan-note plan-note--badge plan-note--${family.shape}${family.fill ? ' plan-note--fill' : ''}`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: compact ? '100%' : 76,
        minHeight: compact ? 42 : 76,
        background: 'var(--sheet)',
        border: compact ? 'none' : '1px solid var(--line)',
        borderRadius: compact ? 0 : 4,
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 7px, rgba(120,130,145,0.12) 7px, rgba(120,130,145,0.12) 8px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        className={shapeClass}
        style={{
          position: 'relative',
          whiteSpace: 'pre-wrap',
          fontSize: Math.max(10, Math.min(16, family.textMm * (compact ? 5.5 : 6.8))),
          color: 'var(--fg)',
        }}
      >
        {text}
      </span>
    </div>
  );
}
