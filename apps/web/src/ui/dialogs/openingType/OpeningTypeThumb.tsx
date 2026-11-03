import { useMemo, type ReactElement } from 'react';
import type { OpeningType } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { previewMiniatureSvg } from './previewViews.ts';

/** Miniatura da elevação pelo mesmo caminho da prévia (projeto mínimo + seção), com cache por assinatura do tipo. */
export function OpeningTypeThumb({
  type,
  width = 96,
  height = 64,
}: {
  type: OpeningType;
  width?: number;
  height?: number;
}): ReactElement {
  const { lang } = useT();
  const svg = useMemo(() => previewMiniatureSvg(type, width, height, lang), [type, width, height, lang]);
  return (
    <span
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
