import type { ReactElement } from 'react';
import type { HatchKind } from '@hestia/model';
import { hatchPartsOf, type SheetFill, type SheetPath, type ViewportParts } from '@hestia/render';

/** Cor padrão dos traços (o material pode gravar outra). */
const COR_PADRAO = '#333333';
/** Cor do preenchimento de `solid`: cinza claro, como no papel. */
const COR_SOLIDO = '#e0e0e0';

/** Partes já calculadas por padrão/tamanho/cor: a miniatura aparece em vários campos do diálogo. */
const cache = new Map<string, ViewportParts>();

function partesDe(kind: HatchKind, w: number, h: number, color: string): ViewportParts {
  const chave = `${kind}|${w}|${h}|${color}`;
  const guardadas = cache.get(chave);
  if (guardadas) return guardadas;
  const partes = hatchPartsOf([[[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]]], kind, color);
  cache.set(chave, partes);
  return partes;
}

/** Caminho de um preenchimento: todos os anéis de todos os polígonos, com a regra par-ímpar. */
function caminhoDe(fill: SheetFill): string {
  const blocos: string[] = [];
  for (const polygon of fill.polygons) {
    for (const ring of polygon) {
      if (ring.length === 0) continue;
      let d = '';
      ring.forEach((p, i) => {
        d += `${i === 0 ? 'M' : 'L'}${p.x} ${p.y} `;
      });
      blocos.push(`${d}Z`);
    }
  }
  return blocos.join(' ');
}

/** Pontos de um traço; quando `closed`, repete o primeiro ponto para fechar. */
function pontosDe(path: SheetPath): string {
  const pontos = path.pts.map((p) => `${p.x},${p.y}`);
  const primeiro = path.pts[0];
  if (path.closed && primeiro) pontos.push(`${primeiro.x},${primeiro.y}`);
  return pontos.join(' ');
}

/**
 * Miniatura vetorial de um padrão de hachura. Reaproveita `hatchPartsOf` (mm de papel) num retângulo `w` × `h`;
 * o tamanho em px é ampliado para o desenho ficar legível no seletor.
 */
export function HatchSwatch({ kind, w = 14, h = 10, color = COR_PADRAO, label }: { kind: HatchKind; w?: number; h?: number; color?: string; label: string }): ReactElement {
  const cor = kind === 'solid' ? COR_SOLIDO : color;
  const partes = partesDe(kind, w, h, cor);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * 2.6} height={h * 2.6} role="img" aria-label={label} style={{ display: 'block' }}>
      <rect x={0} y={0} width={w} height={h} fill="#fff" stroke="currentColor" strokeWidth={0.3} />
      {partes.fills.map((fill, i) => (
        <path key={`f${i}`} d={caminhoDe(fill)} fill={fill.color} fillRule="evenodd" />
      ))}
      {partes.paths.map((path, i) => (
        <polyline key={`p${i}`} fill="none" stroke={path.color} strokeWidth={path.widthMm} points={pontosDe(path)} />
      ))}
    </svg>
  );
}
