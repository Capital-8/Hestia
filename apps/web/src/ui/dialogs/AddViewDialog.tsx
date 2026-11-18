import { useMemo, useState, type ReactElement } from 'react';
import { buildSheetDrawList } from '@hestia/render';
import { newViewportId, projectView3DPoints, sectionTitleOf, sheetDimsMm, sheetInnerBox, sheetOf, type Project, type Sheet, type SheetViewSource } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { decodeInsertArg } from '../../editor/sheetInsertArg.ts';
import { INSERT_SCALES, initialInsertScale, insertViewsWithMode, parseCustomScale, previewInsert, scaleForMode, type InsertPreview, type ScaleMode } from '../../editor/sheetInsertPreview.ts';
import { autoScaleForView } from '../../editor/sheetInsert.ts';
import { useUi } from '../../editor/state.ts';
import { fmtNum, t as translate, useT, type Lang } from '../../editor/i18n.ts';
import { Check, Row } from '../fields.tsx';
import { GroupContent } from '../sheet/SheetCanvas.tsx';
import { Dialog } from './Dialog.tsx';

interface Source {
  key: string;
  label: string;
  view: SheetViewSource;
}

/**
 * Vistas que uma prancha pode mostrar: plantas dos níveis, cortes e elevações do projeto, e o 3D — uma opção por ponto
 * de vista salvo (decisão 0040), mais o enquadramento padrão para quando o catálogo está vazio ou como alternativa.
 */
function sourcesOf(p: Project, lang: Lang): Source[] {
  return [
    ...p.levels.map((l) => ({ key: `plan:${l.id}`, label: translate(lang, 'dlc_src_plan', { name: l.name }), view: { kind: 'plan' as const, levelId: l.id } })),
    ...p.views.map((v) => ({ key: `section:${v.id}`, label: `${translate(lang, v.kind === 'elevation' ? 'dlc_kind_elevation' : 'dlc_kind_section')} · ${sectionTitleOf(v)}`, view: { kind: 'section' as const, sectionId: v.id } })),
    ...projectView3DPoints(p).map((ponto) => ({
      key: `3d:${ponto.id}`,
      label: translate(lang, 'dlc_src_3d', { name: ponto.name }),
      view: { kind: '3d' as const, pointId: ponto.id },
    })),
    { key: '3d', label: translate(lang, 'dlc_src_3d_default'), view: { kind: '3d' as const } },
  ];
}

/** Chave da fonte que corresponde a uma vista (para pré-marcar o que veio do arraste). */
const keyOfView = (v: SheetViewSource): string | null => {
  if (v.kind === 'plan') return `plan:${v.levelId}`;
  if (v.kind === 'section') return `section:${v.sectionId}`;
  if (v.kind === '3d') return v.pointId ? `3d:${v.pointId}` : '3d';
  return null;
};

const CUSTOM = 'custom';
const mm = (n: number, lang: Lang): string => fmtNum(n, 0, lang);

/**
 * Prévia grande da folha: papel, área de desenho, a vista na escala escolhida (miniatura real do desenho quando cabe) e
 * as demais vistas já existentes. Quando não cabe, mostra a caixa em vermelho saindo da área de desenho.
 */
function SheetPreview({ p, sheet, view, pv, lang }: { p: Project; sheet: Sheet; view: SheetViewSource; pv: InsertPreview; lang: Lang }): ReactElement {
  const paper = sheetDimsMm(sheet);
  const inner = sheetInnerBox(sheet);
  const list = useMemo(() => {
    if (!pv.at) return null;
    const vp = { id: newViewportId(), view, at: pv.at, size: pv.size, scale: pv.scale };
    const tmp: Project = { ...p, sheets: [{ ...sheet, viewports: [...sheet.viewports, vp] }] };
    try {
      return buildSheetDrawList(tmp, sheet.id, lang);
    } catch {
      return null;
    }
  }, [p, sheet, view, pv.at, pv.size, pv.scale, lang]);
  const H = paper.h;
  const box = pv.at ?? { x: inner.x0, y: inner.y0 };
  const clipId = 'ins-clip';
  return (
    <svg className="ins-preview" data-testid="insert-preview" viewBox={`-4 -4 ${paper.w + 8} ${paper.h + 8}`} role="img" aria-label={translate(lang, 'cvs_ins_preview')} style={{ width: '100%', maxHeight: '58vh', background: '#e9ecf0', borderRadius: 4 }}>
      <rect x={0} y={0} width={paper.w} height={paper.h} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.4} />
      <rect x={inner.x0} y={H - inner.y1} width={inner.x1 - inner.x0} height={inner.y1 - inner.y0} fill="none" stroke="#c4cad2" strokeWidth={0.3} strokeDasharray="3 2" />
      {list ? (
        <g>
          {list.groups.map((g, k) => (
            <g key={k} clipPath={g.clip ? `url(#${clipId}-${k})` : undefined}>
              {g.clip ? (
                <clipPath id={`${clipId}-${k}`}>
                  <rect x={g.clip.x} y={H - g.clip.y - g.clip.h} width={g.clip.w} height={g.clip.h} />
                </clipPath>
              ) : null}
              <GroupContent g={g} h={H} />
            </g>
          ))}
        </g>
      ) : null}
      <rect
        x={box.x}
        y={H - box.y - pv.size.h}
        width={pv.size.w}
        height={pv.size.h}
        fill={pv.fitsSheet ? 'rgba(29,111,224,.07)' : 'rgba(214,48,49,.10)'}
        stroke={pv.fitsSheet ? '#1d6fe0' : '#d63031'}
        strokeWidth={0.6}
        strokeDasharray="4 2"
        data-testid="insert-box"
        data-fits={pv.fitsSheet ? '1' : '0'}
      />
    </svg>
  );
}

/**
 * "Inserir vistas na prancha": marca uma ou várias origens, vê a miniatura grande na folha e escolhe a escala ANTES de
 * inserir (a da vista, a maior que cabe, 1:20…1:500 ou personalizada). A prévia mostra o tamanho resultante na folha e
 * avisa se não cabe. Aberta pelo botão/menu "Adicionar vista" (entra no primeiro lugar livre) ou pelo arraste do
 * Navegador com Shift (entra centrada onde foi solta). Um passo de desfazer.
 */
export function AddViewDialog({ sheetId: argRaw }: { sheetId: string }): ReactElement | null {
  const arg = useMemo(() => decodeInsertArg(argRaw), [argRaw]);
  const { t, lang } = useT();
  const p = useProject();
  const sheet = sheetOf(p, arg.sheetId);
  const sources = sourcesOf(p, lang);
  const initialKey = (arg.view ? keyOfView(arg.view) : null) ?? sources[0]?.key ?? null;
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set(initialKey ? [initialKey] : []));
  const [focusKey, setFocusKey] = useState<string | null>(initialKey);
  const [mode, setMode] = useState<ScaleMode>('natural');
  const [custom, setCustom] = useState('');
  const [customOn, setCustomOn] = useState(false);
  const [err, setErr] = useState('');
  if (!sheet) return null;
  const inner = sheetInnerBox(sheet);
  const selected = sources.filter((s) => keys.has(s.key));
  const focus = sources.find((s) => s.key === focusKey && keys.has(s.key)) ?? selected[0] ?? null;
  const customScale = customOn ? parseCustomScale(custom) : null;
  const effectiveMode: ScaleMode = customOn ? (customScale ?? 'natural') : mode;
  const customInvalid = customOn && customScale === null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const toggle = (key: string, on: boolean): void => {
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    if (on) setFocusKey(key);
  };
  const innerBox = { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 };
  const naturalOf = (v: SheetViewSource): number => initialInsertScale(p, sheet, v);
  const autoOf = (v: SheetViewSource): number => autoScaleForView(p, v, innerBox);
  const refView = focus?.view ?? null;
  const focusScale = refView ? scaleForMode(p, sheet, refView, effectiveMode) : null;
  const pv = refView && focusScale !== null ? previewInsert(p, sheet, refView, focusScale, selected.length === 1 ? arg.centre : undefined) : null;
  const blocked = selected.length === 0 || customInvalid || selected.some((s) => !previewInsert(p, sheet, s.view, scaleForMode(p, sheet, s.view, effectiveMode)).fitsSheet);
  const add = (): void => {
    if (selected.length === 0) return setErr(t('cvs_ins_none'));
    if (customInvalid) return setErr(t('cvs_ins_custom_invalid'));
    try {
      const ids = insertViewsWithMode(editor.store, arg.sheetId, selected.map((s) => s.view), effectiveMode, selected.length === 1 ? arg.centre : undefined);
      useUi.setState({ status: { key: ids.length === 1 ? 'dlc_status_views_added_one' : 'dlc_status_views_added_many', args: { n: ids.length } } });
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('cvs_ins_dialog_error'));
    }
  };
  const selectValue = customOn ? CUSTOM : String(mode);
  const onSelect = (v: string): void => {
    setErr('');
    if (v === CUSTOM) {
      setCustomOn(true);
      return;
    }
    setCustomOn(false);
    setMode(v === 'natural' || v === 'auto' ? v : Number(v));
  };
  const warn = (() => {
    if (!pv) return null;
    if (!pv.fitsSheet) return t('cvs_ins_no_fit', { w: mm(pv.overflow.w, lang), h: mm(pv.overflow.h, lang) });
    if (!pv.at) return t('cvs_ins_no_spot');
    if (pv.overlapsOthers) return t('cvs_ins_overlap');
    return null;
  })();
  return (
    <Dialog
      title={t('cvs_ins_title')}
      sub={`${sheet.number} · ${sheet.name}`}
      onClose={close}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={add} disabled={blocked}>{t('cvs_ins_insert')}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 260px) 1fr', gap: 14, alignItems: 'start' }}>
        <div>
          <Row label={t('cvs_ins_views')}>
            <div style={{ display: 'grid', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {sources.map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: focus?.key === s.key ? 600 : undefined }}>
                  <Check checked={keys.has(s.key)} onChange={(on) => toggle(s.key, on)}>
                    <span onClick={(e) => { if (keys.has(s.key)) { e.preventDefault(); setFocusKey(s.key); } }}>{s.label}</span>
                  </Check>
                </div>
              ))}
            </div>
            <p className="hint">{t('cvs_ins_focus_hint')}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn" onClick={() => setKeys(new Set(sources.map((s) => s.key)))}>{t('dlc_btn_check_all')}</button>
              <button className="btn" onClick={() => setKeys(new Set())}>{t('dlc_btn_clear')}</button>
            </div>
          </Row>
          <Row label={t('cvs_ins_scale')} htmlFor="av-scale">
            <select id="av-scale" value={selectValue} onChange={(e) => onSelect(e.target.value)}>
              <option value="natural">{refView ? t('cvs_ins_scale_natural', { n: naturalOf(refView) }) : t('cvs_ins_scale')}</option>
              <option value="auto">{refView ? t('cvs_ins_scale_auto', { n: autoOf(refView) }) : t('dlc_scale_auto')}</option>
              {INSERT_SCALES.map((k) => (
                <option key={k} value={k}>1:{k}</option>
              ))}
              <option value={CUSTOM}>{t('cvs_ins_scale_custom')}</option>
            </select>
            {customOn ? (
              <input
                id="av-scale-custom"
                aria-label={t('cvs_ins_scale_custom')}
                aria-invalid={customInvalid}
                value={custom}
                placeholder={t('cvs_ins_custom_ph')}
                onChange={(e) => { setCustom(e.target.value); setErr(''); }}
                style={{ marginTop: 6, width: '100%' }}
                autoFocus
              />
            ) : null}
            {customInvalid ? <p className="error" role="alert">{t('cvs_ins_custom_invalid')}</p> : null}
          </Row>
          {arg.centre ? <p className="hint">{t('cvs_ins_at_drop')}</p> : <p className="hint">{t('cvs_ins_tip_shift')}</p>}
        </div>
        <div>
          {refView && pv ? (
            <>
              <SheetPreview p={p} sheet={sheet} view={refView} pv={pv} lang={lang} />
              <p className="hint" data-testid="insert-size">
                {t('cvs_ins_size', { w: mm(pv.size.w, lang), h: mm(pv.size.h, lang) })} · 1:{pv.scale}
                {pv.fitsSheet && pv.at && !warn ? ` · ${t('cvs_ins_fits')}` : ''}
              </p>
              {warn ? <p className="error" role="alert" data-testid="insert-warning">{warn}</p> : null}
            </>
          ) : (
            <p className="hint">{t('cvs_ins_none')}</p>
          )}
        </div>
      </div>
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
