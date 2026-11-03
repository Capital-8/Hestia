import type { ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { compassLetter, ringGeometry, type CompassKey } from './viewcube-ring.ts';

interface ViewCubeRingProps {
  azimuth: number;
  elevation: number;
  /** Letra sob o ponteiro (realce). */
  hover: CompassKey | null;
  /** `back` vai antes do cubo no DOM (fica sob ele); `front` vai depois (fica sobre ele, com as letras). */
  layer: 'back' | 'front';
}

/**
 * Anel de bússola (N, L, S, O em pt-BR; N, E, S, W em EN) deitado no chão, em volta do cubo. Duas camadas: a de trás,
 * sob o cubo (sombra e faixa inteira), e a da frente, sobre ele (parte da faixa do lado da câmera e todas as letras).
 * Não recebe o ponteiro: o palco resolve o clique pela geometria (`ringHit`).
 */
export function ViewCubeRing({ azimuth, elevation, hover, layer }: ViewCubeRingProps): ReactElement {
  const { lang } = useT();
  const g = ringGeometry(azimuth, elevation);
  if (layer === 'back') {
    return (
      <svg className="vc-ring vc-ring--back" viewBox="-66 -66 132 132" aria-hidden="true" focusable="false">
        <path className="vc-shadow" d={g.shadow} />
        <path className="vc-band" d={g.back} fillRule="evenodd" />
      </svg>
    );
  }
  // As letras ficam sempre sobre o cubo: a de trás sai do cubo em pontos em que ele a cobriria, então ela fica mais apagada.
  return (
    <svg className="vc-ring vc-ring--front" viewBox="-66 -66 132 132" aria-hidden="true" focusable="false">
      <path className="vc-band vc-band--front" d={g.front} />
      {g.letters.map((l) => (
        <text
          key={l.key}
          className={`vc-letter${l.key === 'N' ? ' is-north' : ''}${l.front ? '' : ' is-back'}${hover === l.key ? ' is-hover' : ''}`}
          transform={l.transform}
          x={0}
          y={0}
        >
          {compassLetter(l.key, lang)}
        </text>
      ))}
    </svg>
  );
}
