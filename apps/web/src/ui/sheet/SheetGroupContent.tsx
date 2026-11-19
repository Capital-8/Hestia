import { memo, type ReactElement } from 'react';
import type { SheetGroup } from '@hestia/render';

/** Número para o SVG, sem ruído de ponto flutuante. */
export const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** O papel tem origem no canto inferior esquerdo e y para cima; o SVG tem y para baixo. */
export const at = (q: { x: number; y: number }, h: number): string => `${n(q.x)} ${n(h - q.y)}`;

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

