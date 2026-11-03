import type { PecaResolvida } from '@hestia/engine';
import type { ReactElement } from 'react';
import { corDaPeca, visiveis, type Pt } from './familiaDesenho.ts';
import type { DetalheFamilia } from './familiaStore.ts';

/*
 * Vista 3D provisória da família: um SVG oblíquo montado a partir das PEÇAS RESOLVIDAS (em metros). O contrato de props
 * é estável; outra ficha troca o miolo por three.js sem mexer no editor.
 */

export interface Familia3DProps {
  pecas: readonly PecaResolvida[];
  sel: string | null;
  onSel: (id: string) => void;
  /** 0..1: quanto a caixaria aparece explodida. */
  explodir: number;
  portas: boolean;
  detalhe: DetalheFamilia;
}

const COS = Math.cos(Math.PI / 6) * 0.5;
const SIN = Math.sin(Math.PI / 6) * 0.5;
const oblico = (x: number, y: number, z: number): Pt => [x + y * COS, -(z + y * SIN)];
const fmt = (pts: Pt[]): string => pts.map((p) => p.join(',')).join(' ');
const LARG = 760;
const ALT = 440;

interface Forma {
  id: string;
  cor: string;
  pts: Pt[][];
  sombra: Array<[number, 'claro' | 'escuro']>;
}

function formas3d(ps: readonly PecaResolvida[]): Forma[] {
  return [...ps]
    .sort((a, b) => b.origem[1] + b.extensao[1] / 2 - (a.origem[1] + a.extensao[1] / 2) || a.origem[2] - b.origem[2])
    .map((p) => {
      const [x0, x1] = [p.origem[0], p.origem[0] + p.extensao[0]];
      const [y0, y1] = [p.origem[1], p.origem[1] + p.extensao[1]];
      const [z0, z1] = [p.origem[2], p.origem[2] + p.extensao[2]];
      const f = (...c: Array<[number, number, number]>): Pt[] => c.map(([x, y, z]) => oblico(x, y, z));
      // Ordem de desenho: lado direito, topo, frente (a frente cobre o que está atrás).
      return {
        id: p.id,
        cor: corDaPeca(p),
        pts: [
          f([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
          f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
          f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]),
        ],
        sombra: [[0, 'escuro'], [1, 'claro']],
      };
    });
}

export function Familia3D({ pecas, sel, onSel, explodir, portas, detalhe }: Familia3DProps): ReactElement {
  const ps = visiveis(pecas, detalhe, portas, explodir * 0.07);
  const formas = formas3d(ps);
  const todos = formas.flatMap((f) => f.pts.flat());
  if (!todos.length) {
    return <svg viewBox={`0 0 ${LARG} ${ALT}`}><text x={20} y={30} fill="var(--danger)">Sem peças válidas: veja os erros na árvore.</text></svg>;
  }
  const xs = todos.map((p) => p[0]);
  const ys = todos.map((p) => p[1]);
  const [minx, maxx, miny, maxy] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 70;
  const k = Math.min((LARG - pad * 2) / (maxx - minx || 1), (ALT - pad * 2) / (maxy - miny || 1));
  const tx = (LARG - (maxx - minx) * k) / 2 - minx * k;
  const ty = (ALT - (maxy - miny) * k) / 2 - miny * k;
  return (
    <svg viewBox={`0 0 ${LARG} ${ALT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Família, vista 3D">
      <g transform={`translate(${tx},${ty}) scale(${k})`} strokeLinejoin="round">
        {formas.map((f, idx) => (
          <g key={`${f.id}-${idx}`} data-id={f.id} style={{ cursor: 'pointer' }} onClick={() => onSel(f.id)}>
            {f.pts.map((pts, i) => (
              <g key={i}>
                <polygon points={fmt(pts)} fill={f.cor} stroke={f.id === sel ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={f.id === sel ? 2 : 0.8} vectorEffect="non-scaling-stroke" />
                {f.sombra.filter(([idx]) => idx === i).map(([, tom]) => <polygon key={tom} points={fmt(pts)} fill={tom === 'escuro' ? '#000' : '#fff'} fillOpacity={tom === 'escuro' ? 0.2 : 0.28} />)}
              </g>
            ))}
          </g>
        ))}
      </g>
      <text x={10} y={ALT - 8} fill="var(--fg-faint)" fontSize={11}>vista: 3d · nível de detalhe: {detalhe}{explodir > 0 ? ' · explodido' : ''}</text>
    </svg>
  );
}
