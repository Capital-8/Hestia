import type { ReactElement } from 'react';
import type { DetalheFamilia, VistaFamilia } from './familiaStore.ts';
import type { PecaResolvida, Resolucao } from './resolver.ts';

/*
 * Desenho da família a partir das PEÇAS RESOLVIDAS (nunca das fórmulas): 3D oblíquo, frente, lateral e planta. Em SVG
 * porque é um protótipo de interface; o 3D real usa a malha do núcleo (fatia C do Rust, ADR 0049 §5).
 */

type Pt = [number, number];
const COS = Math.cos(Math.PI / 6) * 0.5;
const SIN = Math.sin(Math.PI / 6) * 0.5;
const oblico = (x: number, y: number, z: number): Pt => [x + y * COS, -(z + y * SIN)];
const fmt = (pts: Pt[]): string => pts.map((p) => p.join(',')).join(' ');

const COR: Record<PecaResolvida['cor'], string> = { corpo: 'var(--fam-corpo)', porta: 'var(--fam-porta)', tampo: 'var(--fam-tampo)', fundo: 'var(--fam-fundo)' };

/** Afasta cada peça do centro para ver a caixaria "explodida". */
function afastar(p: PecaResolvida, ex: number): PecaResolvida {
  if (!ex) return p;
  const dx = p.papel === 'lateral' ? (p.ox < 1 ? -ex : ex) : 0;
  const dy = p.papel === 'porta' ? -ex * 1.2 : p.papel === 'fundo' ? ex : 0;
  const dz = p.papel === 'tampo' ? ex : p.papel === 'rodape' ? -ex : 0;
  return { ...p, ox: p.ox + dx, oy: p.oy + dy, oz: p.oz + dz };
}

/** Nível de detalhe 3D: grosso mostra só o volume principal, médio tira travessas e rodapé. */
function visiveis(res: Resolucao, detalhe: DetalheFamilia, portas: boolean, ex: number): PecaResolvida[] {
  let ps = res.pecas.map((p) => afastar(p, ex)).filter((p) => portas || p.papel !== 'porta');
  if (detalhe === 'grosso') ps = ps.filter((p) => ['lateral', 'base', 'tampo', 'porta'].includes(p.papel));
  else if (detalhe === 'medio') ps = ps.filter((p) => p.papel !== 'travessa' && p.papel !== 'rodape');
  return ps;
}

interface Forma { id: string; cor: string; pts: Pt[][]; sombra: Array<[number, 'claro' | 'escuro']> }

function formas3d(ps: PecaResolvida[]): Forma[] {
  return [...ps].sort((a, b) => b.oy + b.sy / 2 - (a.oy + a.sy / 2) || a.oz - b.oz).map((p) => {
    const [x0, x1, y0, y1, z0, z1] = [p.ox, p.ox + p.sx, p.oy, p.oy + p.sy, p.oz, p.oz + p.sz];
    const f = (...c: Array<[number, number, number]>): Pt[] => c.map(([x, y, z]) => oblico(x, y, z));
    // Ordem de desenho: lado direito, topo, frente (a frente cobre o que está atrás).
    return {
      id: p.id,
      cor: COR[p.cor],
      pts: [f([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]), f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])],
      sombra: [[0, 'escuro'], [1, 'claro']],
    };
  });
}

function formas2d(ps: PecaResolvida[], vista: Exclude<VistaFamilia, '3d'>): Forma[] {
  const eixos = (p: PecaResolvida): [number, number, number, number, number] =>
    vista === 'frente' ? [p.ox, p.oz, p.sx, p.sz, p.oy] : vista === 'lateral' ? [p.oy, p.oz, p.sy, p.sz, p.ox] : [p.ox, p.oy, p.sx, p.sy, p.oz];
  const ordem = vista === 'planta' ? (a: PecaResolvida, b: PecaResolvida) => eixos(a)[4] - eixos(b)[4] : (a: PecaResolvida, b: PecaResolvida) => eixos(b)[4] - eixos(a)[4];
  return [...ps].sort(ordem).map((p) => {
    const [u, w, du, dw] = eixos(p);
    // y da tela cresce para baixo: o eixo vertical da vista sobe (altura; na planta, a profundidade, com a frente embaixo).
    const pts: Pt[] = [[u, -w], [u + du, -w], [u + du, -(w + dw)], [u, -(w + dw)]];
    return { id: p.id, cor: COR[p.cor], pts: [pts], sombra: [] };
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

const LARG = 760;
const ALT = 440;

export function FamiliaVista({ res, vista, explodir, portas, detalhe, sel, onSel }: { res: Resolucao; vista: VistaFamilia; explodir: boolean; portas: boolean; detalhe: DetalheFamilia; sel: string; onSel: (id: string) => void }): ReactElement {
  const ps = visiveis(res, detalhe, portas, explodir ? 70 : 0);
  const formas = vista === '3d' ? formas3d(ps) : formas2d(ps, vista);
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
  const env = res.env;
  const m = 26 / k;
  const L = String(env.L);
  const A = String(env.A);
  const P = String(env.P);
  return (
    <svg viewBox={`0 0 ${LARG} ${ALT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Família, vista ${vista}`}>
      <g transform={`translate(${tx},${ty}) scale(${k})`} strokeLinejoin="round">
        {formas.map((f, idx) => (
          <g key={`${f.id}-${idx}`} data-id={f.id} style={{ cursor: 'pointer' }} onClick={() => onSel(f.id)}>
            {f.pts.map((pts, i) => (
              <g key={i}>
                <polygon points={fmt(pts)} fill={f.cor} fillOpacity={vista === 'planta' ? 0.75 : 1} stroke={f.id === sel ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={f.id === sel ? 2 : 0.8} vectorEffect="non-scaling-stroke" />
                {f.sombra.filter(([idx]) => idx === i).map(([, tom]) => <polygon key={tom} points={fmt(pts)} fill={tom === 'escuro' ? '#000' : '#fff'} fillOpacity={tom === 'escuro' ? 0.2 : 0.28} />)}
              </g>
            ))}
          </g>
        ))}
      </g>
      {!explodir && vista === 'frente' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={`L ${L}`} k={k} tx={tx} ty={ty} /><Cota a={[minx - m, miny]} b={[minx - m, maxy]} texto={`A ${A}`} k={k} tx={tx} ty={ty} /></>}
      {!explodir && vista === 'lateral' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={`P ${P}`} k={k} tx={tx} ty={ty} /><Cota a={[minx - m, miny]} b={[minx - m, maxy]} texto={`A ${A}`} k={k} tx={tx} ty={ty} /></>}
      {!explodir && vista === 'planta' && <><Cota a={[minx, maxy + m]} b={[maxx, maxy + m]} texto={`L ${L}`} k={k} tx={tx} ty={ty} /><Cota a={[maxx + m, miny]} b={[maxx + m, maxy]} texto={`P ${P}`} k={k} tx={tx} ty={ty} /></>}
      <text x={10} y={ALT - 8} fill="var(--fg-faint)" fontSize={11}>vista: {vista} · mm · nível de detalhe: {detalhe}{explodir ? ' · explodido' : ''}</text>
    </svg>
  );
}
