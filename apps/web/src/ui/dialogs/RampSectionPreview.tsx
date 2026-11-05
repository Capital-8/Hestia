import { useMemo, type ReactElement } from 'react';
import { formatRampSlope, rampNormRowFor, type RampType } from '@hestia/model';
import { fmtNum, useT } from '../../editor/i18n.ts';
import { SchematicViews, type SchematicView } from '../schematic/SchematicDrawing.tsx';
import { buildRampSectionDrawing } from './rampSectionDrawing.ts';

/** Prévia técnica da rampa: corte com cotas e triângulo de inclinação, e planta esquemática em U. */
export function RampSectionPreview({ type }: { type: RampType }): ReactElement {
  const { t, lang } = useT();
  const views = useMemo(() => {
    const fmt = (n: number, dec: number): string => fmtNum(n, dec, lang);
    try {
      const section = buildRampSectionDrawing(type, { view: 'section', lang, fmt });
      const plan = buildRampSectionDrawing(type, { view: 'plan', lang, fmt });
      const slope = type.defaultSlope;
      const row = rampNormRowFor(type, slope);
      const slopeTxtRaw = formatRampSlope(slope);
      const slopeTxt = lang === 'en' ? slopeTxtRaw.replace(/,/g, '.') : slopeTxtRaw;
      const riseValue = row?.maxRise ?? (type.normTable.length > 0 ? type.normTable[type.normTable.length - 1]!.maxRise : slope);
      return [
        {
          id: 'section',
          label: t('dls_ramp_preview_section'),
          drawing: section,
          ariaLabel: t('dls_ramp_preview_section_aria', {
            slope: slopeTxt,
            rise: fmt(riseValue, 2),
            e: fmt(type.structuralDepth * 100, 1),
          }),
        },
        {
          id: 'plan',
          label: t('dls_ramp_preview_plan'),
          drawing: plan,
          ariaLabel: t('dls_ramp_preview_plan_aria', { w: fmt(type.defaultWidth, 2) }),
        },
      ] satisfies SchematicView[];
    } catch {
      return null;
    }
  }, [type, lang, t]);
  if (!views) return <p className="stt-preview-empty">{t('dls_ramp_preview_empty')}</p>;
  return <SchematicViews tabsLabel={t('dls_ramp_preview_tabs')} views={views} />;
}
