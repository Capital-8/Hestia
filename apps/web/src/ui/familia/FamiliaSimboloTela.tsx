import type { PrimitivoResolvido, SimboloResolvido } from '@hestia/engine';
import { pontosDoPrimitivo, type Primitivo2D } from '@hestia/model';
import { useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react';
import { literal, PASSOS_ARCO } from './familiaSimbolo.ts';

/*
 * Tela 2D da planta da família (ficha D3). Coordenadas em mm, eixo Y para cima (o SVG é invertido em Y). Clique no fundo cria o
 * primitivo da ferramenta no ponto; arrastar uma alça move o ponto (grava ao soltar, em números literais). A geometria desenhada
 * é a resolvida (metros do motor, convertida para mm), então fórmulas aparecem como o motor calcula. O símbolo selecionado fica
 * em cheio; os demais, apagados.
 */

const X0 = -500;
const Y0 = -500;
const LADO = 2000;
/** Limiar (mm) abaixo do qual um arrasto é só um clique: não grava. */
const LIMIAR_MM = 0.5;

interface Alca {
  indice: number;
  k: number;
  x: number;
  y: number;
}

interface Props {
  simboloId: string;
  /** Todos os símbolos resolvidos da família (metros). */
  resolvidos: SimboloResolvido[];
  /** Primitivos do símbolo selecionado, como estão no modelo (mm/texto), para as alças. */
  primitivos: Primitivo2D[];
  /** Ferramenta ativa. */
  ferramenta: 'linha' | 'circulo' | 'arco' | 'polilinha' | 'texto';
  aoCriar: (x: number, y: number) => void;
  aoMover: (indice: number, k: number, x: number, y: number) => void;
}

/** Ponto em mm (do modelo ou do motor já convertido) para a coordenada do SVG (Y invertido). */
const svgXY = (x: number, y: number): string => `${x},${-y}`;

function caminhoArco(cx: number, cy: number, r: number, inicio: number, fim: number): string {
  const partes: string[] = [];
  for (let i = 0; i <= PASSOS_ARCO; i++) {
    const a = inicio + ((fim - inicio) * i) / PASSOS_ARCO;
    partes.push(`${i === 0 ? 'M' : 'L'}${svgXY(cx + r * Math.cos(a), cy + r * Math.sin(a))}`);
  }
  return partes.join(' ');
}

/** Forma SVG de um primitivo resolvido (metros → mm). Texto usa a altura resolvida como tamanho da fonte. */
function formaSvg(p: PrimitivoResolvido, chave: string, classe: string): ReactElement | null {
  switch (p.tipo) {
    case 'linha':
      return <line key={chave} className={classe} x1={p.de[0] * 1000} y1={-p.de[1] * 1000} x2={p.ate[0] * 1000} y2={-p.ate[1] * 1000} />;
    case 'circulo':
      return <circle key={chave} className={classe} cx={p.centro[0] * 1000} cy={-p.centro[1] * 1000} r={p.raio * 1000} />;
    case 'arco':
      return <path key={chave} className={classe} d={caminhoArco(p.centro[0] * 1000, p.centro[1] * 1000, p.raio * 1000, p.inicioRad, p.fimRad)} />;
    case 'polilinha': {
      const pts = p.pontos.map(([x, y]) => svgXY(x * 1000, y * 1000)).join(' ');
      return p.fechada
        ? <polygon key={chave} className={classe} points={pts} />
        : <polyline key={chave} className={classe} points={pts} />;
    }
    case 'texto':
      return (
        <text key={chave} className={classe} x={p.posicao[0] * 1000} y={-p.posicao[1] * 1000} fontSize={p.altura * 1000}>{p.texto}</text>
      );
  }
}

/** Alça para cada ponto literal (número escrito direto); ponto com fórmula não tem alça. */
function alcas(primitivos: Primitivo2D[], arrasto: Alca | null): { indice: number; k: number; x: number; y: number }[] {
  const out: { indice: number; k: number; x: number; y: number }[] = [];
  primitivos.forEach((p, indice) => {
    pontosDoPrimitivo(p).forEach((ponto, k) => {
      const x = literal(ponto[0]);
      const y = literal(ponto[1]);
      if (x === null || y === null) return;
      const ativo = arrasto !== null && arrasto.indice === indice && arrasto.k === k;
      out.push({ indice, k, x: ativo ? arrasto.x : x, y: ativo ? arrasto.y : y });
    });
  });
  return out;
}

export function FamiliaSimboloTela({ simboloId, resolvidos, primitivos, ferramenta, aoCriar, aoMover }: Props): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [arrasto, setArrasto] = useState<Alca | null>(null);
  const [origem, setOrigem] = useState<{ x: number; y: number } | null>(null);

  /** Ponto do cursor em mm (eixo Y para cima). */
  const mmDoEvento = (e: ReactPointerEvent | { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (svg === null) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    return { x: X0 + fx * LADO, y: Y0 + LADO - fy * LADO };
  };

  const soSelecionado = resolvidos.filter((s) => s.id === simboloId);
  const outros = resolvidos.filter((s) => s.id !== simboloId);

  return (
    <svg
      ref={svgRef}
      className="fam-sim-tela"
      viewBox={`${X0} ${-(Y0 + LADO)} ${LADO} ${LADO}`}
      role="img"
      aria-label={`Planta do símbolo ${simboloId}`}
      data-ferramenta={ferramenta}
      onPointerMove={(e) => {
        if (arrasto === null) return;
        const m = mmDoEvento(e);
        if (m !== null) setArrasto({ ...arrasto, x: m.x, y: m.y });
      }}
      onPointerUp={() => {
        if (arrasto !== null && origem !== null) {
          const andou = Math.hypot(arrasto.x - origem.x, arrasto.y - origem.y) > LIMIAR_MM;
          if (andou) aoMover(arrasto.indice, arrasto.k, Math.round(arrasto.x), Math.round(arrasto.y));
        }
        setArrasto(null);
        setOrigem(null);
      }}
    >
      <rect className="fam-sim-fundo" x={X0} y={-(Y0 + LADO)} width={LADO} height={LADO}
        onClick={(e) => {
          const m = mmDoEvento(e);
          if (m !== null) aoCriar(Math.round(m.x), Math.round(m.y));
        }} />
      <line className="fam-sim-eixo" x1={X0} y1={0} x2={X0 + LADO} y2={0} />
      <line className="fam-sim-eixo" x1={0} y1={-(Y0 + LADO)} x2={0} y2={-Y0} />
      {outros.flatMap((s) => s.primitivos.map((p, k) => formaSvg(p, `o${s.id}${k}`, 'fam-sim-outro')))}
      {soSelecionado.flatMap((s) => s.primitivos.map((p, k) => formaSvg(p, `s${k}`, 'fam-sim-geo')))}
      {alcas(primitivos, arrasto).map((a) => {
        const sel = arrasto?.indice === a.indice && arrasto.k === a.k;
        return (
          <circle
            key={`a${a.indice}-${a.k}`}
            className={`fam-sim-alca${sel ? ' ativa' : ''}`}
            cx={a.x}
            cy={-a.y}
            r={18}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setOrigem({ x: a.x, y: a.y });
              setArrasto({ indice: a.indice, k: a.k, x: a.x, y: a.y });
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}
    </svg>
  );
}
