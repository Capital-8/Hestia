import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { materialUsage, newId, type HatchKind, type Material } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { NumField, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { cmpTexto, useT } from '../../editor/i18n.ts';

/** Navegador de materiais único: abre de qualquer campo "material" ou pelo navegador de projeto. */
export function MaterialsDialog({ pickFor, onPick, onClose }: { pickFor?: string | null; onPick?: (id: string) => void; onClose?: () => void }): ReactElement {
  const { t, lang } = useT();
  const HATCHES: Array<[HatchKind, string]> = [
    ['none', t('dlt_hatch_none')],
    ['diagonal', t('dlt_hatch_diagonal')],
    ['cross', t('dlt_hatch_cross')],
    ['dots', t('dlt_hatch_dots')],
    ['solid', t('dlt_hatch_solid')],
  ];
  const p = useProject();
  const [sel, setSel] = useState<string>(pickFor && p.materials[pickFor] ? pickFor : (Object.keys(p.materials)[0] ?? ''));
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'aparencia' | 'graficos' | 'fisico'>('aparencia');
  const stored = p.materials[sel];
  const [draft, setDraft] = useState<Material | undefined>(stored ? { ...stored } : undefined);
  useEffect(() => setDraft(p.materials[sel] ? { ...p.materials[sel]! } : undefined), [sel, p.materials]);
  const list = useMemo(() => Object.values(p.materials).filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => cmpTexto(a.name, b.name, lang)), [p.materials, q, lang]);
  const used = draft ? materialUsage(p, draft.id) : 0;
  const commit = (next: Material | undefined = draft): void => {
    if (next && JSON.stringify(next) !== JSON.stringify(p.materials[next.id])) editor.store.exec({ type: 'upsertMaterial', material: next }, 'Editar material');
  };
  const change = (patch: Partial<Material>, now = false): void => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (now) commit(next);
  };
  const close = (): void => {
    commit();
    if (onClose) onClose();
    else useUi.setState({ dialog: null, dialogArg: null });
  };
  const add = (from?: Material): void => {
    commit();
    const m: Material = from
      ? { ...from, id: newId('mat'), name: `${from.name} ${t('dlt_duplicate_suffix')}` }
      : { id: newId('mat'), name: t('dlt_mat_new'), color: '#b9a98f', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' };
    editor.store.exec({ type: 'upsertMaterial', material: m }, 'Novo material');
    setSel(m.id);
  };
  const tabBtn = (t: typeof tab, label: string): ReactElement => <button className={`dtab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{label}</button>;
  return (
    <Dialog
      title={t('dlt_mat_title')}
      sub={t(Object.keys(p.materials).length === 1 ? 'dlt_mat_count_one' : 'dlt_mat_count_many', { n: Object.keys(p.materials).length })}
      onClose={close}
      z={60}
      size="mid"
      footer={
        <>
          {onPick && draft && (
            <button className="btn primary" onClick={() => { commit(); onPick(draft.id); }}>{t('dlt_mat_use')}</button>
          )}
          <button className="btn" onClick={close}>{onPick ? t('stt_cancel') : t('stt_close')}</button>
        </>
      }
    >
      <div className="split mat-split">
        <div>
          <input id="mat-search" className="input wide" placeholder={t('dlt_mat_search')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label={t('dlt_mat_search')} />
          <div className="matlist" style={{ marginTop: 6 }}>
            {list.map((m) => (
              <button key={m.id} className={`matitem${m.id === sel ? ' on' : ''}`} onClick={() => { commit(); setSel(m.id); }}>
                <span className="swatch" style={{ width: 16, height: 16, borderRadius: 2, border: '1px solid var(--line-strong)', background: m.color, flex: 'none' }} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn small" onClick={() => add()}>{t('dlt_mat_new_button')}</button>
            <button className="btn small" disabled={!draft} onClick={() => draft && add(draft)}>{t('dlt_btn_duplicate_plain')}</button>
          </div>
        </div>
        {draft ? (
          <div onBlur={() => commit()}>
            <div className="field-row"><label htmlFor="mat-name">{t('dlt_fld_name')}</label><TextField id="mat-name" value={draft.name} onCommit={(v) => change({ name: v }, true)} /></div>
            <div className="dtabs">{tabBtn('aparencia', t('dlt_mat_tab_appearance'))}{tabBtn('graficos', t('dlt_mat_tab_graphics'))}{tabBtn('fisico', t('dlt_mat_tab_physical'))}</div>
            {tab === 'aparencia' && (
              <>
                <div className="field-row"><label htmlFor="mat-color">{t('dlt_fld_color')}</label><input id="mat-color" type="color" value={draft.color} onChange={(e) => change({ color: e.target.value })} style={{ width: 54, height: 28, padding: 0, border: '1px solid var(--line-strong)', background: 'none' }} /></div>
                <div className="field-row"><label htmlFor="mat-gloss">{t('dlt_fld_gloss')}</label><input id="mat-gloss" type="range" min={0} max={1} step={0.05} value={draft.gloss} onChange={(e) => change({ gloss: parseFloat(e.target.value) })} /></div>
                <div className="field-row"><label htmlFor="mat-op">{t('dlt_fld_opacity')}</label><input id="mat-op" type="range" min={0.05} max={1} step={0.05} value={draft.opacity} onChange={(e) => change({ opacity: parseFloat(e.target.value) })} /></div>
              </>
            )}
            {tab === 'graficos' && (
              <div className="field-row">
                <label htmlFor="mat-hatch">{t('dlt_mat_cut_hatch')}</label>
                <select id="mat-hatch" className="select" value={draft.hatch} onChange={(e) => change({ hatch: e.target.value as HatchKind }, true)}>
                  {HATCHES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            )}
            {tab === 'fisico' && (
              <>
                <div className="field-row"><label htmlFor="mat-cost">{t('dlt_cost')}</label><NumField id="mat-cost" value={draft.cost} quantity="currency" onCommit={(v) => change({ cost: v }, true)} /></div>
                <div className="field-row">
                  <label htmlFor="mat-unit">{t('dlt_fld_unit')}</label>
                  <select id="mat-unit" className="select" value={draft.unit} onChange={(e) => change({ unit: e.target.value as Material['unit'] }, true)}>
                    {/* units-ok: unidade do material (identificador) */}
                    <option value="m2">m²</option>
                    {/* units-ok: unidade do material (identificador) */}
                    <option value="m3">m³</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </>
            )}
            <p className="hint" style={{ padding: '6px 0' }}>{t(used === 1 ? 'dlt_mat_usage_one' : 'dlt_mat_usage_many', { n: used })}</p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
