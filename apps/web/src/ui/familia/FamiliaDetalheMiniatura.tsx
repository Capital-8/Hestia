import type { DetalheResolvido } from '@hestia/engine';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { caminhoSvg, enquadrar } from './familiaDetalhe.ts';

/*
 * Miniatura SVG de um detalhe resolvido (ficha D4): seção do corte (cheia), contornos e peças (linha), símbolos e as linhas de
 * cota com o valor. Coordenadas em metros, eixo v para cima (o `caminhoSvg` e o `viewBox` invertem). Só desenha.
 */

const ARCO_PASSOS = 24;

function primitivoSvg(p: DetalheResolvido['simbolos'][number]['primitivos'][number], k: number): ReactElement | null {
  switch (p.tipo) {
    case 'linha':
      return <path key={k} d={caminhoSvg([...p.de, ...p.ate], false)} />;
    case 'polilinha':
      return <path key={k} d={caminhoSvg(p.pontos.flat(), p.fechada)} />;
    case 'circulo':
      return <circle key={k} cx={p.centro[0]} cy={-p.centro[1]} r={p.raio} />;
    case 'arco': {
      const pts: number[] = [];
      for (let i = 0; i <= ARCO_PASSOS; i++) {
        const a = p.inicioRad + ((p.fimRad - p.inicioRad) * i) / ARCO_PASSOS;
        pts.push(p.centro[0] + p.raio * Math.cos(a), p.centro[1] + p.raio * Math.sin(a));
      }
      return <path key={k} d={caminhoSvg(pts, false)} />;
    }
    default:
      return null;
  }
}

export function FamiliaDetalheMiniatura({ detalhe }: { detalhe: DetalheResolvido }): ReactElement {
  const { t } = useT();
  const q = enquadrar(detalhe);
  if (q === null) return <div className="fam-hint">{t('fam_det_miniatura_vazia')}</div>;
  const traco = q.traco;
  return (
    <svg
      role="img"
      aria-label={t('fam_det_miniatura')}
      viewBox={q.viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', maxHeight: 220, background: 'var(--fam-bg, transparent)' }}
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
    >
      {detalhe.cortados.map((c, k) => <path key={`c${k}`} d={caminhoSvg(c, true)} fill="currentColor" fillOpacity={0.18} />)}
      {detalhe.contornos.map((c, k) => <path key={`o${k}`} d={caminhoSvg(c, true)} />)}
      {detalhe.simbolos.map((s) => <g key={s.id} strokeOpacity={0.75}>{s.primitivos.map((p, k) => primitivoSvg(p, k))}</g>)}
      {detalhe.cotas.map((c) => (
        <g key={c.id} stroke="var(--fam-cota, #c0392b)">
          <path d={caminhoSvg([...c.de, ...c.linha.de], false)} strokeWidth={traco / 2} />
          <path d={caminhoSvg([...c.ate, ...c.linha.ate], false)} strokeWidth={traco / 2} />
          <path d={caminhoSvg([...c.linha.de, ...c.linha.ate], false)} />
          <text
            x={(c.linha.de[0] + c.linha.ate[0]) / 2}
            y={-(c.linha.de[1] + c.linha.ate[1]) / 2}
            fontSize={c.alturaTexto}
            textAnchor="middle"
            fill="var(--fam-cota, #c0392b)"
            stroke="none"
          >
            {c.texto}
          </text>
        </g>
      ))}
    </svg>
  );
}
