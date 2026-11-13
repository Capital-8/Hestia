import type { ReactElement } from 'react';
import type { PerfilForma } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { FamilyHint } from './familia/index.ts';
import { perfilContorno, type ContornoPerfil } from './perfilContorno.ts';

/** Caminho SVG dos anéis (regra par-ímpar: o furo fica vazado). Só converte os vértices que o kernel entregou. */
function caminhoDoContorno(c: ContornoPerfil): string {
  const anel = (pts: ContornoPerfil['anel']): string => `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
  return [anel(c.anel), ...c.furos.map(anel)].join('');
}

/** Caixa que envolve o anel externo, com folga; só para enquadrar o desenho (X para a direita, Y para cima). */
function enquadramento(c: ContornoPerfil): { x: number; y: number; w: number; h: number } {
  const xs = c.anel.map((v) => v[0]);
  const ys = c.anel.map((v) => v[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const folga = Math.max(x1 - x0, y1 - y0, 1e-6) * 0.12;
  return { x: x0 - folga, y: -y1 - folga, w: x1 - x0 + 2 * folga, h: y1 - y0 + 2 * folga };
}

/**
 * Prévia 2D do perfil. O contorno vem da consulta 205 do kernel (`perfilContorno`, injetável); sem ele (kernel ainda não
 * ligado ou perfil inválido) mostra "pré-visualização indisponível". Nunca calcula contorno em TS (A.0 item 2).
 */
export function PerfilPreview({ perfil }: { perfil: PerfilForma }): ReactElement {
  const { t } = useT();
  const contorno = perfilContorno(perfil);
  if (!contorno || contorno.anel.length < 3) return <FamilyHint role="status">{t('estr_preview_unavailable')}</FamilyHint>;
  const q = enquadramento(contorno);
  return (
    <svg className="estr-perfil-preview" viewBox={`${q.x} ${q.y} ${q.w} ${q.h}`} width="100%" height="140" role="img" aria-label={t('estr_preview_aria')} preserveAspectRatio="xMidYMid meet">
      <g transform="scale(1 -1)" fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={q.w / 90} fillRule="evenodd">
        <path d={caminhoDoContorno(contorno)} />
      </g>
    </svg>
  );
}
