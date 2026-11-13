import { useId, type ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import {
  ceilingTypeThickness,
  floorTypeThickness,
  roofTypeThickness,
  slabTypeThickness,
  wallThicknessOf,
  type CeilingType,
  type DimensionStyle,
  type FloorType,
  type Material,
  type OpeningType,
  type RampType,
  type RoofType,
  type SlabType,
  type StairType,
  type TipoGuardaCorpo,
  type WallType,
} from '@hestia/model';
import { FloorSectionPreview } from './dialogs/FloorSectionPreview.tsx';
import { RampSectionPreview } from './dialogs/RampSectionPreview.tsx';
import { RoofSectionPreview } from './dialogs/RoofSectionPreview.tsx';
import { SectionPreview } from './dialogs/SectionPreview.tsx';
import { DimensionStylePreview } from './dialogs/dimensionStylePreview.tsx';
import { formatQuantity, type ResolvedUnits } from '@hestia/model';
import { useUnits } from './useUnits.ts';
import { SlabSectionPreview } from './dialogs/SlabSectionPreview.tsx';
import { StairSectionPreview } from './dialogs/StairSectionPreview.tsx';

/** Tipo a desenhar, com o que cada desenho precisa. Os materiais valem para as camadas (parede, piso, laje, forro, telhado). */
export type PreviewSubject =
  | { kind: 'wall'; type: WallType; materials: Record<string, Material> }
  | { kind: 'floor'; type: FloorType; materials: Record<string, Material> }
  | { kind: 'slab'; type: SlabType; materials: Record<string, Material> }
  | { kind: 'ceiling'; type: CeilingType; materials: Record<string, Material> }
  | { kind: 'roof'; type: RoofType; materials: Record<string, Material> }
  | { kind: 'stair'; type: StairType }
  | { kind: 'ramp'; type: RampType }
  | { kind: 'door' | 'window'; type: OpeningType }
  /** Tipo de guarda-corpo: a miniatura desenha a elevação do tipo (altura, trilhos, corrimãos e preenchimento). */
  | { kind: 'railing'; type: TipoGuardaCorpo }
  /** Família de cota: a miniatura desenha a cota com o estilo da família (sem tipo nem código). */
  | { kind: 'dimension'; style: DimensionStyle }
  /** Tipo de estrutura (pilar, viga, fundação): a miniatura é só o código; o contorno do perfil é do kernel (A.0 item 2). */
  | { kind: 'estr'; type: { code: string } };



/** Miniatura de tipo de estrutura: o código no centro (sem desenhar contorno: a geometria é do kernel). */
function EstrThumb({ code }: { code: string }): ReactElement {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <text x={60} y={46} textAnchor="middle" fontSize={22} fill="currentColor" fillOpacity={0.7}>{code}</text>
    </svg>
  );
}

/** Código do tipo (P-02, PA-14…), ou null quando o tipo não tem código. */
function codeOf(s: PreviewSubject): string | null {
  if (s.kind === 'dimension') return null;
  const c = s.type.code;
  return c ? c : null;
}

/** Texto do canto inferior direito: dimensões da abertura ou espessura total das camadas. A escada não tem. */
function dimsOf(s: PreviewSubject, units: ResolvedUnits): string | null {
  switch (s.kind) {
    case 'door':
    case 'window':
      return `${formatQuantity(units, 'length', s.type.width, { withUnit: false })} × ${formatQuantity(units, 'length', s.type.height)}`;
    case 'wall':
      return formatQuantity(units, 'smallLength', wallThicknessOf(s.type));
    case 'floor':
      return formatQuantity(units, 'smallLength', floorTypeThickness(s.type));
    case 'slab':
      return formatQuantity(units, 'smallLength', slabTypeThickness(s.type));
    case 'ceiling':
      return formatQuantity(units, 'smallLength', ceilingTypeThickness(s.type));
    case 'roof':
      return formatQuantity(units, 'smallLength', roofTypeThickness(s.type));
    case 'stair':
    case 'ramp':
    case 'railing':
    case 'dimension':
    case 'estr':
      return null;
  }
}

/** Desenho do tipo: reaproveita os cortes das abas dos diálogos; porta e janela são elevações ilustrativas. */
function Drawing({ subject }: { subject: PreviewSubject }): ReactElement {
  // Id estável por instância: as definições de padrão e marcador do SVG não colidem entre prévias na mesma tela.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  switch (subject.kind) {
    case 'wall':
      return <SectionPreview type={subject.type} materials={subject.materials} />;
    case 'floor':
      return <FloorSectionPreview type={subject.type} materials={subject.materials} />;
    case 'slab':
      return <SlabSectionPreview type={subject.type} materials={subject.materials} />;
    case 'ceiling':
      return <SlabSectionPreview type={subject.type} materials={subject.materials} />;
    case 'roof':
      return <RoofSectionPreview type={subject.type} materials={subject.materials} />;
    case 'stair':
      return <StairSectionPreview type={subject.type} />;
    case 'ramp':
      return <RampSectionPreview type={subject.type} />;
    case 'railing':
      return <RailingThumb type={subject.type} />;
    case 'dimension':
      return <DimensionStylePreview style={subject.style} />;
    case 'estr':
      return <EstrThumb code={subject.type.code} />;
    case 'door':
      return <DoorDrawing t={subject.type} uid={uid} />;
    case 'window':
      return <WindowDrawing t={subject.type} uid={uid} />;
  }
}

/** Prévia da paleta e do diálogo: fundo claro nos dois temas, código no canto inferior esquerdo e dimensões à direita. */
export function TypePreview({ subject }: { subject: PreviewSubject }): ReactElement {
  const units = useUnits();
  const code = codeOf(subject);
  const dims = dimsOf(subject, units);
  return (
    <div className="rv-preview">
      <Drawing subject={subject} />
      {code ? <span className="chip">{code}</span> : null}
      {dims ? <span className="dims">{dims}</span> : null}
    </div>
  );
}

/** Miniatura do tipo (38 × 26), usada na lista e no botão do seletor. Decorativa: o nome do tipo vem ao lado. */
export function TypeThumb({ subject }: { subject: PreviewSubject }): ReactElement {
  return (
    <span className="rv-thumb" aria-hidden="true">
      <Drawing subject={subject} />
    </span>
  );
}

/** Elevação esquemática do guarda-corpo para a miniatura: um vão com postes, trilhos, corrimãos e preenchimento. */
function RailingThumb({ type }: { type: TipoGuardaCorpo }): ReactElement {
  const W = 120;
  const H = 80;
  const BASE = 74;
  const X0 = 8;
  const X1 = 112;
  const s = (BASE - 6) / Math.max(type.altura, 0.3);
  const sx = (X1 - X0) / 2.4;
  const y = (h: number): number => BASE - h * s;
  const painel = type.preenchimentos.some((p) => p.tipo === 'painel');
  const balaustre = type.preenchimentos.find((p) => p.tipo === 'balaustres');
  const passo = balaustre && balaustre.tipo === 'balaustres' ? Math.max(3, balaustre.periodo * sx) : 0;
  const balaustres: ReactElement[] = [];
  if (balaustre && balaustre.tipo === 'balaustres') {
    for (let x = X0 + passo, n = 0; x < X1 && n < 80; x += passo, n++) {
      balaustres.push(<line key={`b-${n}`} x1={x} y1={BASE} x2={x} y2={y(type.altura)} strokeWidth={1} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <g stroke="currentColor" fill="none">
        <line x1={0} y1={BASE} x2={W} y2={BASE} strokeOpacity={0.5} />
        {painel ? <rect x={X0} y={y(type.altura)} width={X1 - X0} height={BASE - y(type.altura)} fill="currentColor" fillOpacity={0.12} strokeOpacity={0.4} /> : null}
        {balaustres}
        {type.trilhos.map((tr, i) => (
          <line key={`t-${i}`} x1={X0} y1={y(tr.altura)} x2={X1} y2={y(tr.altura)} strokeWidth={1.5} strokeDasharray="3 2" />
        ))}
        {type.corrimaos.map((c, i) => (
          <line key={`c-${i}`} x1={X0} y1={y(c.altura)} x2={X1} y2={y(c.altura)} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        <line x1={X0} y1={BASE} x2={X0} y2={y(type.altura)} strokeWidth={2.5} />
        <line x1={X1} y1={BASE} x2={X1} y2={y(type.altura)} strokeWidth={2.5} />
      </g>
    </svg>
  );
}

/** Porta em elevação: folhas com painéis e maçaneta, sentido de correr, eixo do pivô e vão livre sem folha. */
function DoorDrawing({ t, uid }: { t: OpeningType; uid: string }): ReactElement {
  const { t: tr } = useT();
  const s = Math.min(92 / t.height, 150 / t.width);
  const W = t.width * s;
  const H = t.height * s;
  const x0 = 100 - W / 2;
  const y0 = 108 - H;
  const fw = Math.max(2.2, 0.05 * s);
  const n = Math.max(t.leaves, 1);
  const lw = (W - 2 * fw) / n;
  const hatch = `${uid}-hh`;
  const arrow = `${uid}-ar`;
  const leaves = Array.from({ length: t.leaves === 0 ? 0 : n }, (_, i) => {
    const lx = x0 + fw + i * lw + (t.plan === 'sliding' && i === 1 ? -lw * 0.15 : 0);
    const kx = t.plan === 'double' ? (i === 0 ? lx + lw - 4 : lx + 4) : lx + lw - 5;
    return (
      <g key={i}>
        <rect x={lx} y={y0 + fw} width={lw} height={H - fw} fill="#b98a5b" stroke="#5c4128" strokeWidth={0.8} />
        <rect x={lx + lw * 0.15} y={y0 + fw + 5} width={lw * 0.7} height={(H - fw) * 0.38} fill="none" stroke="#7a5a37" strokeWidth={0.6} />
        <rect x={lx + lw * 0.15} y={y0 + fw + (H - fw) * 0.5} width={lw * 0.7} height={(H - fw) * 0.42} fill="none" stroke="#7a5a37" strokeWidth={0.6} />
        {t.plan !== 'pivot' && <circle cx={kx} cy={y0 + H * 0.52} r={1.7} fill="#ecc66a" stroke="#6b5420" strokeWidth={0.4} />}
      </g>
    );
  });
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label={tr('prc_aria_door_preview')}>
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.35)" strokeWidth={1} />
        </pattern>
        <marker id={arrow} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6z" fill="#0078d4" />
        </marker>
      </defs>
      <rect x={8} y={12} width={184} height={96} fill={`url(#${hatch})`} opacity={0.18} />
      <line x1={8} y1={108} x2={192} y2={108} stroke="#4a5568" strokeWidth={1.4} />
      <rect x={x0} y={y0} width={W} height={H} fill="#fafcfd" />
      {t.leaves === 0 ? (
        <>
          <rect x={x0} y={y0} width={W} height={H} fill="none" stroke="#2d3748" strokeDasharray="4 3" />
          <text x={100} y={y0 + H / 2} textAnchor="middle" fontSize={9} fill="#718096">{tr('prc_msg_open_void')}</text>
        </>
      ) : (
        <>
          {leaves}
          {t.plan === 'pivot' && <line x1={x0 + W * 0.42} y1={y0 - 4} x2={x0 + W * 0.42} y2={y0 + H + 4} stroke="#d13438" strokeDasharray="3 2" />}
          {t.plan === 'sliding' && (
            <path d={`M${x0 + 8} ${y0 + H * 0.2} h${W - 16}`} stroke="#0078d4" strokeWidth={1.2} markerStart={`url(#${arrow})`} markerEnd={`url(#${arrow})`} />
          )}
        </>
      )}
      <rect x={x0} y={y0} width={W} height={H} fill="none" stroke="#5c4128" strokeWidth={fw} />
    </svg>
  );
}

/** Janela em elevação: vidro com degradê, folhas (maxim-ar tracejado, correr com seta) e peitoril. */
function WindowDrawing({ t, uid }: { t: OpeningType; uid: string }): ReactElement {
  const { t: tr } = useT();
  const s = Math.min(70 / t.height, 150 / t.width);
  const W = t.width * s;
  const H = t.height * s;
  const x0 = 100 - W / 2;
  const y0 = 60 - H / 2;
  const fw = Math.max(2, 0.05 * s);
  const n = Math.max(t.leaves, 1);
  const lw = (W - 2 * fw) / n;
  const hatch = `${uid}-hh`;
  const glass = `${uid}-gl`;
  const arrow = `${uid}-ar`;
  const leaves = Array.from({ length: t.leaves === 0 ? 0 : n }, (_, i) => {
    const lx = x0 + fw + i * lw;
    return (
      <g key={i}>
        <rect x={lx} y={y0 + fw} width={lw} height={H - 2 * fw} fill="none" stroke="#6c7782" strokeWidth={Math.max(1.2, fw * 0.7)} />
        {t.plan === 'casement' && (
          <path d={`M${lx} ${y0 + fw} L${lx + lw} ${y0 + H / 2} L${lx} ${y0 + H - fw}`} fill="none" stroke="#4a5568" strokeWidth={0.7} strokeDasharray="3 2" />
        )}
        {t.plan === 'sliding' && <path d={`M${lx + 5} ${y0 + H / 2} h${lw - 10}`} stroke="#0078d4" strokeWidth={1} markerEnd={`url(#${arrow})`} />}
        {(t.plan === 'fixed' || t.plan === 'sliding') && (
          <path d={`M${lx + lw * 0.2} ${y0 + H * 0.85} L${lx + lw * 0.55} ${y0 + H * 0.2}`} stroke="#fff" strokeOpacity={0.7} strokeWidth={2} />
        )}
      </g>
    );
  });
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label={tr('prc_aria_window_preview')}>
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,.35)" strokeWidth={1} />
        </pattern>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset={0} stopColor="#d6ecfa" />
          <stop offset={1} stopColor="#9ccbe6" />
        </linearGradient>
        <marker id={arrow} markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6z" fill="#0078d4" />
        </marker>
      </defs>
      <rect x={8} y={8} width={184} height={104} fill={`url(#${hatch})`} opacity={0.18} />
      <rect x={x0} y={y0} width={W} height={H} fill={`url(#${glass})`} />
      {t.leaves === 0 && (
        <text x={100} y={y0 + H / 2} textAnchor="middle" fontSize={9} fill="#4a5568">{tr('prc_msg_void_no_frame')}</text>
      )}
      {leaves}
      <rect x={x0} y={y0} width={W} height={H} fill="none" stroke="#6c7782" strokeWidth={fw} />
      <rect x={x0 - 3} y={y0 + H + fw / 2} width={W + 6} height={3} fill="#8d98a3" stroke="#4a5568" strokeWidth={0.5} />
    </svg>
  );
}
