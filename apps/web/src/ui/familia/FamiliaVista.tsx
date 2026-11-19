import type { PecaResolvida } from '@hestia/engine';
import type { ReactElement } from 'react';
import { corDaPeca, mm, visiveis, type Pt } from './familiaDesenho.ts';
import type { DetalheFamilia, VistaFamilia } from './familiaStore.ts';

/*
 * Vistas de frente, lateral e planta a partir das PEÇAS RESOLVIDAS (nunca das fórmulas). O motor devolve metros; os
 * rótulos de cota convertem para mm. Em SVG porque é um protótipo de interface.
 */

export interface FamiliaVistaProps {
  pecas: readonly PecaResolvida[];
  vista: Exclude<VistaFamilia, '3d'>;
  sel: string | null;
  onSel: (id: string) => void;
  explodir: number;
  portas: boolean;
  detalhe: DetalheFamilia;
}

const fmt = (pts: Pt[]): string => pts.map((p) => p.join(',')).join(' ');
const LARG = 760;
const ALT = 440;

interface Forma {
  id: string;
  cor: string;
  pts: Pt[];
}

type Eixos = [number, number, number, number, number];

function eixos(p: PecaResolvida, vista: FamiliaVistaProps['vista']): Eixos {
  if (vista === 'frente') return [p.origem[0], p.origem[2], p.extensao[0], p.extensao[2], p.origem[1] + p.extensao[1] / 2];
  if (vista === 'lateral') return [p.origem[1], p.origem[2], p.extensao[1], p.extensao[2], p.origem[0] + p.extensao[0] / 2];
  return [p.origem[0], p.origem[1], p.extensao[0], p.extensao[1], p.origem[2] + p.extensao[2] / 2];
}

function formas2d(ps: readonly PecaResolvida[], vista: FamiliaVistaProps['vista']): Forma[] {
  const ordem = vista === 'planta'
    ? (a: PecaResolvida, b: PecaResolvida) => eixos(a, vista)[4] - eixos(b, vista)[4]
    : (a: PecaResolvida, b: PecaResolvida) => eixos(b, vista)[4] - eixos(a, vista)[4];
  return [...ps].sort(ordem).map((p) => {
    const [u, w, du, dw] = eixos(p, vista);
    // y da tela cresce para baixo: o eixo vertical da vista sobe (altura; na planta, a profundidade, com a frente embaixo).
    const pts: Pt[] = [[u, -w], [u + du, -w], [u + du, -(w + dw)], [u, -(w + dw)]];
    return { id: p.id, cor: corDaPeca(p), pts };
  });
}

function Cota({ a, b, texto, k, tx, ty }: { a: Pt; b: Pt; texto: string; k: number; tx: number; ty: number }): ReactElement {
  const [x1, y1, x2, y2] = [a[0] * k + tx, a[1] * k + ty, b[0] * k + tx, b[1] * k + ty];
  const vert = x1 === x2;
  return (
    <g stroke="var(--fg-soft)" fill="var(--fg-soft)" strokeWidth={1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - 4} y1={y1 - 4} x2={x1 + 4} y2={y1 + 4} />
      <line x1={x2 - 4} y1={y2 - 4} x2={x2 + 4} y2={y2 + 4} />
      <text x={(x1 + x2) / 2 + (vert ? -8 : 0)} y={(y1 + y2) / 2 + (vert ? 0 : -6)} textAnchor={vert ? 'end' : 'middle'} stroke="none" fontSize={11}>{texto}</text>
    </g>
  );
}

export function FamiliaVista({ pecas, vista, sel, onSel, explodir, portas, detalhe }: FamiliaVistaProps): ReactElement {
  const ps = visiveis(pecas, detalhe, portas, explodir * 0.07);
  const formas = formas2d(ps, vista);
  const todos = formas.flatMap((f) => f.pts);
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
  const m = 26 / k;
  const largura = mm(maxx - minx);
  const altura = mm(maxy - miny);
  const horizontal = vista === 'lateral' ? `P ${largura}` : `L ${largura}`;
  const vertical = vista === 'planta' ? `P ${altura}` : `A ${altura}`;
  return (
    <svg viewBox={`0 0 ${LARG} ${ALT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Família, vista ${vista}`}>
      <g transform={`translate(${tx},${ty}) scale(${k})`} strokeLinejoin="round">
        {formas.map((f, idx) => (
          <g key={`${f.id}-${idx}`} data-id={f.id} style={{ cursor: 'pointer' }} onClick={() => onSel(f.id)}>
            <polygon points={fmt(f.pts)} fill={f.cor} fillOpacity={vista === 'planta' ? 0.75 : 1} stroke={f.id === sel ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={f.id === sel ? 2 : 0.8} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </g>
      {explodir === 0 && vista === 'frente' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={horizontal} k={k} tx={tx} ty={ty} /><Cota a={[minx - m, miny]} b={[minx - m, maxy]} texto={vertical} k={k} tx={tx} ty={ty} /></>}
      {explodir === 0 && vista === 'lateral' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={horizontal} k={k} tx={tx} ty={ty} /><Cota a={[minx - m, miny]} b={[minx - m, maxy]} texto={vertical} k={k} tx={tx} ty={ty} /></>}
      {explodir === 0 && vista === 'planta' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={horizontal} k={k} tx={tx} ty={ty} /><Cota a={[maxx + m, miny]} b={[maxx + m, maxy]} texto={vertical} k={k} tx={tx} ty={ty} /></>}
      <text x={10} y={ALT - 8} fill="var(--fg-faint)" fontSize={11}>vista: {vista} · dimensões em mm · nível de detalhe: {detalhe}{explodir > 0 ? ' · explodido' : ''}</text>
    </svg>
  );
}
