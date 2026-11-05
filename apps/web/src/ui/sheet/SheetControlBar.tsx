import { useEffect, useState, type ReactElement } from 'react';
import type { Id, Sheet, SheetViewport, View3DPoint } from '@hestia/model';
import { sheetDimsMm } from '@hestia/model';
import type { SheetCamera, SheetSize } from './sheetCamera.ts';
import type { AlignMode } from '../../editor/sheetAlign.ts';
import { fmtNum, type Dict, useT } from '../../editor/i18n.ts';
import { Icon } from '../Icon.tsx';

/** Escalas oferecidas na prancha (as mesmas de `sheetActions.SCALE_OPTIONS`, sem importar o editor aqui). */
const SCALES = [20, 25, 50, 100, 200, 500] as const;
/** Pixels de tela por mm a 100% (96 dpi), para mostrar o zoom relativo ao tamanho real. */
const PX_PER_MM = 96 / 25.4;

export interface SheetControlBarProps {
  sheet: Sheet;
  camera: SheetCamera;
  view: SheetSize;
  selected: readonly SheetViewport[];
  grid: boolean;
  snap: boolean;
  fitScale: boolean;
  /** Ferramenta Alinhar ativa. */
  alignOn: boolean;
  onToggleAlign: () => void;
  /** Ferramenta Mover ativa. */
  moveOn: boolean;
  onToggleMove: () => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onActualSize: () => void;
  onZoomToSelection: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onToggleFitScale: () => void;
  onScale: (scale: number) => void;
  onToggleClip: () => void;
  onToggleFrame: () => void;
  onToggleLabel: () => void;
  onToggleLock: () => void;
  onFitFrame: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'h' | 'v') => void;
  onAddView: () => void;
  onProps: () => void;
  /** Pontos de vista 3D salvos no projeto (decisão 0040), para trocar o da vista selecionada. */
  view3DPoints: readonly View3DPoint[];
  /** Troca o ponto de vista da vista 3D selecionada; `null` volta ao enquadramento padrão. */
  onChange3DPoint: (pointId: Id | null) => void;
}

const ALIGN: { mode: AlignMode; label: keyof Dict; title: keyof Dict }[] = [
  { mode: 'left', label: 'pro_sheet_align_left', title: 'pro_sheet_align_left_title' },
  { mode: 'hcenter', label: 'pro_sheet_align_hcenter', title: 'pro_sheet_align_hcenter_title' },
  { mode: 'right', label: 'pro_sheet_align_right', title: 'pro_sheet_align_right_title' },
  { mode: 'top', label: 'pro_sheet_align_top', title: 'pro_sheet_align_top_title' },
  { mode: 'vcenter', label: 'pro_sheet_align_vcenter', title: 'pro_sheet_align_vcenter_title' },
  { mode: 'bottom', label: 'pro_sheet_align_bottom', title: 'pro_sheet_align_bottom_title' },
];

/**
 * Barra inferior da prancha (o mesmo lugar da Barra de Controle de Vista): zoom, encaixe, escala e propriedades da
 * vista selecionada, alinhamento/distribuição e adicionar vista. Como no Revit, o zoom é da sessão, não do arquivo.
 */
export function SheetControlBar(p: SheetControlBarProps): ReactElement {
  const { sheet, camera, selected } = p;
  const { t, lang } = useT();
  const dims = sheetDimsMm(sheet);
  const one = selected.length === 1 ? selected[0]! : null;
  // Ponto de vista 3D da vista selecionada ('' = enquadramento padrão); só as vistas 3D têm esse campo.
  const pontoAtual = one && one.view.kind === '3d' ? (one.view.pointId ?? '') : '';
  // Rascunho do seletor "Ponto": a troca só vale ao clicar em "Trocar", como as demais propriedades da vista.
  const [ponto, setPonto] = useState(pontoAtual);
  useEffect(() => setPonto(pontoAtual), [pontoAtual]);
  const zoomPct = Math.round((camera.zoom / PX_PER_MM) * 100);
  const btn = (key: string, icon: string, label: string, title: string, onClick: () => void, opts: { on?: boolean; disabled?: boolean; danger?: boolean } = {}): ReactElement => (
    <button key={key} className={`vcb-btn${opts.on ? ' on' : ''}${opts.danger ? ' danger' : ''}`} title={title} aria-label={title} aria-pressed={opts.on} disabled={opts.disabled} onClick={onClick}>
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
  const sep = (k: string): ReactElement => <span key={k} className="vcb-sep" />;

  return (
    <div className="vcb sheet-vcb" role="toolbar" aria-label={t('pro_sheet_bar_aria')}>
      {btn('zo', 'zoom', '−', t('pro_sheet_zoom_out'), () => p.onZoom(1 / 1.25))}
      <span className="vcb-zoom" aria-label={t('pro_sheet_zoom_aria', { pct: zoomPct })}>{zoomPct}%</span>
      {btn('zi', 'zoom', '+', t('pro_sheet_zoom_in'), () => p.onZoom(1.25))}
      {btn('fit', 'fit', t('pro_sheet_fit'), t('pro_sheet_fit_title'), p.onFit)}
      {btn('act', 'scale', '1:1', t('pro_sheet_actual_title'), p.onActualSize)}
      {btn('zs', 'sheet', t('pro_sheet_zoom_view'), t('pro_sheet_zoom_view_title'), p.onZoomToSelection, { disabled: selected.length === 0 })}
      {sep('s1')}
      {btn('grid', 'grid', t('pro_sheet_grid'), t('pro_sheet_grid_title'), p.onToggleGrid, { on: p.grid })}
      {btn('snap', 'align', t('pro_sheet_snap'), t('pro_sheet_snap_title'), p.onToggleSnap, { on: p.snap })}
      {btn('move', 'move', t('tool_move'), t('pro_sheet_move_title'), p.onToggleMove, { on: p.moveOn })}
      {btn('align', 'align', t('tool_align'), t('pro_sheet_align_title'), p.onToggleAlign, { on: p.alignOn })}
      {one ? (
        <>
          {sep('s2')}
          <label className="vcb-field" title={t('pro_sheet_scale_title')}>
            <Icon name="scale" size={14} />
            <span>{t('pro_sheet_scale')}</span>
            <select
              className="vcb-select"
              value={SCALES.includes(one.scale as (typeof SCALES)[number]) ? String(one.scale) : ''}
              aria-label={t('pro_sheet_scale_aria')}
              onChange={(e) => e.target.value && p.onScale(Number(e.target.value))}
            >
              {!SCALES.includes(one.scale as (typeof SCALES)[number]) && <option value="">{`1 : ${one.scale}`}</option>}
              {SCALES.map((k) => (
                <option key={k} value={k}>{`1 : ${k}`}</option>
              ))}
            </select>
          </label>
          {one.view.kind === '3d' ? (
            <>
              <label className="vcb-field" title={t('pro_sheet_point_title')} htmlFor="vcb-ponto3d">
                <Icon name="cube" size={14} />
                <span>{t('pro_sheet_point')}</span>
                <select
                  id="vcb-ponto3d"
                  className="vcb-select"
                  aria-label={t('pro_sheet_point_aria')}
                  value={ponto}
                  onChange={(e) => setPonto(e.target.value)}
                >
                  <option value="">{t('pro_sheet_point_default')}</option>
                  {p.view3DPoints.map((pt) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
              </label>
              {btn('ponto3d', 'cube', t('pro_sheet_change'), t('pro_sheet_change_title'), () => p.onChange3DPoint(ponto === '' ? null : ponto), { disabled: ponto === pontoAtual })}
            </>
          ) : null}
          {btn('fitframe', 'crop', t('pro_sheet_fit_frame'), t('pro_sheet_fit_frame_title'), p.onFitFrame)}
          {btn('clip', 'crop', t('pro_sheet_clip'), t('pro_sheet_clip_title'), p.onToggleClip, { on: one.clip !== false })}
          {btn('frame', 'detail', t('pro_sheet_frame'), t('pro_sheet_frame_title'), p.onToggleFrame, { on: one.frame !== false })}
          {btn('label', 'text', t('pro_sheet_label'), t('pro_sheet_label_title'), p.onToggleLabel, { on: one.label?.show !== false })}
          {btn('lock', 'crop', t('pro_sheet_lock'), t('pro_sheet_lock_title'), p.onToggleLock, { on: one.locked === true })}
          {btn('autofit', 'scale', t('pro_sheet_autofit'), t('pro_sheet_autofit_title'), p.onToggleFitScale, { on: p.fitScale })}
        </>
      ) : null}
      {selected.length >= 2 ? (
        <>
          {sep('s3')}
          {ALIGN.map((a) => btn(`al-${a.mode}`, 'align', t(a.label), t(a.title), () => p.onAlign(a.mode)))}
          {btn('dist-h', 'align', t('pro_sheet_distribute_h'), t('pro_sheet_distribute_h_title'), () => p.onDistribute('h'))}
          {btn('dist-v', 'align', t('pro_sheet_distribute_v'), t('pro_sheet_distribute_v_title'), () => p.onDistribute('v'))}
        </>
      ) : null}
      {sep('s4')}
      {btn('add', 'plus', t('pro_sheet_add_view'), t('pro_sheet_add_view_title'), p.onAddView)}
      {btn('props', 'props', t('pro_sheet_props'), t('pro_sheet_props_title'), p.onProps)}
      <span className="vcb-sheet-info" title={t('pro_sheet_info_title', { size: sheet.size, n: sheet.viewports.length })}>
        {sheet.number} · {fmtNum(dims.w, 0, lang)} × {fmtNum(dims.h, 0, lang)} mm · {t(sheet.viewports.length === 1 ? 'pro_sheet_views_one' : 'pro_sheet_views_many', { n: sheet.viewports.length })}
        {one ? ` · ${t('pro_sheet_view_size', { w: fmtNum(Math.round(one.size.w), 0, lang), h: fmtNum(Math.round(one.size.h), 0, lang) })}` : ''}
      </span>
    </div>
  );
}
