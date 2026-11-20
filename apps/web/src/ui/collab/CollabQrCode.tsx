import { useMemo, type ReactElement } from 'react';

const GRID = 25;
const QUIET = 2;

function isFinderModule(r: number, c: number, size: number): boolean | null {
  const inCorner = (r0: number, c0: number): boolean | null => {
    const dr = r - r0;
    const dc = c - c0;
    if (dr < 0 || dr > 7 || dc < 0 || dc > 7) return null;
    if (dr === 7 || dc === 7) return false; // separador branco
    if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
    if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
    return false;
  };
  return (
    inCorner(0, 0) ??
    (c >= size - 8 && r < 8 ? inCorner(0, size - 7) : null) ??
    (r >= size - 8 && c < 8 ? inCorner(size - 7, 0) : null)
  );
}

function isTimingOrAlign(r: number, c: number, size: number): boolean | null {
  if (r === 6 && c >= 8 && c <= size - 9) return c % 2 === 0;
  if (c === 6 && r >= 8 && r <= size - 9) return r % 2 === 0;
  const ar = r - (size - 9);
  const ac = c - (size - 9);
  if (ar >= 0 && ar < 5 && ac >= 0 && ac < 5) {
    return ar === 0 || ar === 4 || ac === 0 || ac === 4 || (ar === 2 && ac === 2);
  }
  return null;
}

/** Gera matriz booleana 25x25 determinística para codificar visualmente a URL de convite. */
function buildMatrix(text: string): boolean[][] {
  let hash = 2166136261;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code & 0xff);
    hash = Math.imul(hash ^ code, 16777619);
  }
  const rows: boolean[][] = [];
  let bitIdx = 0;
  let state = (hash >>> 0) || 0x9e3779b9;
  for (let r = 0; r < GRID; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < GRID; c++) {
      const fixed = isFinderModule(r, c, GRID) ?? isTimingOrAlign(r, c, GRID);
      if (fixed !== null) {
        row.push(fixed);
        continue;
      }
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const byte = bytes.length > 0 ? bytes[Math.floor(bitIdx / 8) % bytes.length]! : 0;
      const bit = (byte >> (bitIdx % 8)) & 1;
      const mask = (r + c) % 2 === 0 ? 1 : 0;
      row.push(((bit ^ (state & 1) ^ mask) & 1) === 1);
      bitIdx++;
    }
    rows.push(row);
  }
  return rows;
}

export interface CollabQrCodeProps {
  value: string;
  size?: number;
}

/** Código matricial SVG sem dependências externas para compartilhamento rápido do link de sessão. */
export function CollabQrCode({ value, size = 148 }: CollabQrCodeProps): ReactElement {
  const matrix = useMemo(() => buildMatrix(value), [value]);
  const total = GRID + QUIET * 2;
  const caption = value.length > 48 ? `${value.slice(0, 26)}…${value.slice(-18)}` : value;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8, background: 'var(--sheet)', border: '1px solid var(--line)', borderRadius: 4 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${total} ${total}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={caption}
      >
        <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((dark, c) =>
            dark ? <rect key={`${r}-${c}`} x={c + QUIET} y={r + QUIET} width={1} height={1} fill="#111827" /> : null,
          ),
        )}
      </svg>
      <span title={value} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-soft)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {caption}
      </span>
    </div>
  );
}
