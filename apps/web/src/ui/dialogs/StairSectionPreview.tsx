import { useMemo, type ReactElement } from 'react';
import type { StairRunStyle, StairType } from '@hestia/model';
import { dictOf, fmtNum, useI18n } from '../../editor/i18n.ts';
import { SchematicViews } from '../schematic/SchematicDrawing.tsx';
import { buildStairSectionDrawing } from './stairSectionDrawing.ts';

const STYLE_KEY: Record<StairRunStyle, 'stt_style_monolithic' | 'stt_style_assembled' | 'stt_style_post'> = {
  monolithic: 'stt_style_monolithic',
  assembled: 'stt_style_assembled',
  post: 'stt_style_post',
};

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/** Corte técnico do tipo de escada: corpo, cotas fora do desenho e pé-direito quebrado, desenhados por `SchematicDrawing`. */
export function StairSectionPreview({ type, riser, tread }: { type: StairType; riser?: number; tread?: number }): ReactElement {
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const cm = (m: number, dec = 1): string => fmtNum(m * 100, dec, lang);
  const r = riser ?? type.maxRiser;
  const tp = tread ?? type.minTread;
  const valid = r > 0 && tp > 0 && Number.isFinite(r) && Number.isFinite(tp);
  const drawing = useMemo(() => {
    if (!valid) return null;
    try {
      return buildStairSectionDrawing(type, { riser: r, tread: tp, lang, fmt: (n, dec) => fmtNum(n, dec, lang) });
    } catch {
      return null;
    }
  }, [type, r, tp, lang, valid]);
  if (!drawing) return <p className="stt-preview-empty">{t.stt_preview_empty}</p>;
  const aria = fill(t.stt_preview_aria, { riser: cm(r), tread: cm(tp), style: t[STYLE_KEY[type.runStyle]] });
  return (
    <SchematicViews
      tabsLabel={t.stt_preview_title}
      views={[{ id: 'section', label: t.stt_preview_title, drawing, ariaLabel: aria }]}
    />
  );
}
