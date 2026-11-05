import { useRef, useEffect, useState, type ReactElement } from 'react';
import { createZip } from '@hestia/io';
import type { DxfLayerStyle } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { buildDxfBatch, dxfBatchTargetsOf } from '../../editor/dxfBatch.ts';
import type { DxfBatchGroup, DxfBatchSkip, DxfBatchTarget } from '../../editor/dxfBatch.types.ts';
import { dxfBatchRenderers } from '../../editor/dxfBatchRenderers.ts';
import { dxfLayerTableOf, type DxfExportTarget } from '../../editor/dxfExport.ts';
import {
  activeDxfTargetKey,
  defaultDxfSelection,
  defaultDxfUnitOf,
  DXF_UNIT_OPTIONS,
  dxfGroupRows,
  dxfGroupState,
} from '../../editor/dxfExportDialogModel.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type Dict } from '../../editor/i18n.ts';
import { saveBytes } from '../../editor/saveBytes.ts';
import { Dialog } from './Dialog.tsx';
import { DxfLayerTable } from './DxfLayerTable.tsx';

/** Caixa de seleção de grupo com o estado "alguns" (indeterminate) do HTML. */
function GroupCheck({ state, label, onToggle }: { state: 'all' | 'none' | 'some'; label: string; onToggle: () => void }): ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return <input ref={ref} type="checkbox" checked={state === 'all'} aria-label={label} onChange={onToggle} />;
}

/** Alvo da tabela de camadas (a primeira vista marcada) a partir de um alvo do lote. */
function layerTargetOf(target: DxfBatchTarget | null, showRoofProjection: boolean): DxfExportTarget | null {
  if (!target) return null;
  if (target.kind === 'plan') return { kind: 'plan', levelId: target.levelId, showRoofProjection };
  if (target.kind === 'area') return { kind: 'area', planId: target.planId };
  if (target.kind === 'section') return { kind: 'section', sectionId: target.viewId };
  return null;
}

const GROUP_HINT_KEYS: Record<DxfBatchGroup, keyof Dict> = {
  plantas: 'dlc_dxf_hint_plans',
  areas: 'dlc_dxf_hint_areas',
  cortes: 'dlc_dxf_hint_sections',
  pranchas: 'dlc_dxf_hint_sheets',
};

/**
 * Diálogo de exportação DXF em lote (fase 4), no fluxo do Revit: a lista vem do projeto (não das abas abertas), o usuário
 * marca desenhos e pranchas, escolhe unidade e nome, e o pacote sai num ZIP com pastas, manifest e LEIA-ME. A aba Camadas
 * mantém a tabela editável da fase 3 (vale para todos os arquivos do lote).
 */
export function DxfExportDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const ui = useUi();
  const targets = dxfBatchTargetsOf(p);
  const groups = dxfGroupRows(targets);
  const [selected, setSelected] = useState<string[]>(() => defaultDxfSelection(targets, activeDxfTargetKey(ui)));
  const [units, setUnits] = useState(() => defaultDxfUnitOf(p));
  const [prefix, setPrefix] = useState(() => p.name.trim() || t('dlc_fallback_project_name'));
  const [pattern, setPattern] = useState('{tipo}-{nome}');
  const [roof, setRoof] = useState(ui.showRoofProjection);
  const [tab, setTab] = useState<'documentos' | 'camadas'>('documentos');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; count: number; zipName: string; skipped: DxfBatchSkip[] } | null>(null);
  const close = (): void => useUi.setState({ dialog: null });

  const toggle = (key: string): void => setSelected((atual) => (atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key]));
  const toggleGroup = (group: DxfBatchGroup): void => {
    const keys = targets.filter((t) => t.group === group).map((t) => t.key);
    const all = keys.every((k) => selected.includes(k));
    setSelected((atual) => (all ? atual.filter((k) => !keys.includes(k)) : [...new Set([...atual, ...keys])]));
  };

  const firstSelected = targets.find((t) => selected.includes(t.key)) ?? null;
  const layerTarget = tab === 'camadas' ? layerTargetOf(firstSelected, roof) : null;
  const rows = layerTarget ? dxfLayerTableOf(p, layerTarget) : [];
  const setStyle = (layer: string, patch: Partial<DxfLayerStyle>): void => {
    const row = rows.find((r) => r.name === layer);
    if (!row) return;
    editor.store.exec({ type: 'setDxfLayerStyle', layer, style: { ...row.style, ...patch } }, t('dlc_dxf_undo_layer_style'));
  };

  const doExport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const built = buildDxfBatch(p, selected, { units, showRoofProjection: roof, prefix, pattern }, dxfBatchRenderers);
      const zip = createZip(built.files);
      const status = await saveBytes(built.zipName, zip);
      setDone({ status, count: built.files.filter((f) => f.path.endsWith('.dxf')).length, zipName: built.zipName, skipped: built.skipped });
      useUi.setState({ status: `DXF: ${status}` });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dlc_err_unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('btn_export_dxf')}
      sub={t('dlc_dxf_sub')}
      onClose={close}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={() => editor.store.exec({ type: 'resetDxfLayers' }, t('dlc_dxf_undo_reset_layers'))} disabled={!p.dxfLayers}>
            {t('dlc_dxf_reset_layers')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{done ? t('dlc_btn_close') : t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={() => void doExport()} disabled={busy || selected.length === 0}>
            {busy
              ? t('dlc_dxf_generating')
              : selected.length === 0
                ? t('dlc_dxf_export_none')
                : t(selected.length === 1 ? 'dlc_dxf_export_one' : 'dlc_dxf_export_many', { n: selected.length })}
          </button>
        </>
      }
    >
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button role="tab" aria-selected={tab === 'documentos'} className={tab === 'documentos' ? 'btn primary' : 'btn'} onClick={() => setTab('documentos')}>
          {t('dlc_dxf_tab_docs', { n: selected.length })}
        </button>
        <button role="tab" aria-selected={tab === 'camadas'} className={tab === 'camadas' ? 'btn primary' : 'btn'} onClick={() => setTab('camadas')}>
          {t('dlc_dxf_tab_layers')}
        </button>
      </div>

      {tab === 'documentos' ? (
        <div className="dxf-cols">
          <div className="dxf-list">
            {groups.map((row) => (
              <section key={row.group} style={{ marginBottom: 10 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '4px 0' }}>
                  <GroupCheck state={dxfGroupState(targets, selected, row.group)} label={t('dlc_aria_dxf_check_group', { group: row.label })} onToggle={() => toggleGroup(row.group)} />
                  {row.label}
                  <span style={{ fontWeight: 400, opacity: 0.65 }}>— {t(GROUP_HINT_KEYS[row.group])}</span>
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 0 22px' }}>
                  {row.targets.map((alvo) => (
                    <li key={alvo.key} style={{ padding: '2px 0' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.includes(alvo.key)} onChange={() => toggle(alvo.key)} aria-label={t('dlc_aria_dxf_check_target', { target: alvo.label })} />
                        <span>{alvo.label}</span>
                        {alvo.kind === 'section' && <span style={{ opacity: 0.6 }}>({t(alvo.elevation ? 'dlc_kind_elevation' : 'dlc_kind_section')})</span>}
                        {alvo.kind === 'sheet' && <span style={{ opacity: 0.6 }}>({t('dlc_kind_sheet')})</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="dxf-options">
            <h3 style={{ fontSize: 12, margin: '4px 0 6px' }}>{t('dlc_options')}</h3>
            <label className="fm-field" style={{ display: 'block', marginBottom: 8 }}>
              {t('dlc_unit')}
              <select aria-label={t('dlc_aria_dxf_unit')} value={units} onChange={(e) => setUnits(e.target.value as typeof units)} style={{ marginLeft: 8 }}>
                {DXF_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <input type="checkbox" checked={roof} onChange={(e) => setRoof(e.target.checked)} />
              {t('dlc_dxf_roof_projection')}
            </label>
            <label className="fm-field" style={{ display: 'block', marginBottom: 8 }}>
              {t('dlc_prefix')}
              <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ marginLeft: 8, width: '70%' }} />
            </label>
            <label className="fm-field" style={{ display: 'block', marginBottom: 4 }}>
              {t('dlc_dxf_file_pattern')}
              <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} style={{ marginLeft: 8, width: '70%' }} />
            </label>
            <p style={{ margin: '2px 0 10px', opacity: 0.7, fontSize: 11 }}>
              {t('dlc_dxf_tokens_hint')}
            </p>
            {done ? (
              <div role="status" style={{ borderTop: '1px solid var(--line, #ddd)', paddingTop: 8 }}>
                <p style={{ margin: '4px 0' }}>
                  {t(done.count === 1 ? 'dlc_dxf_done_one' : 'dlc_dxf_done_many', { n: done.count, zip: done.zipName })} {done.status}
                </p>
                {done.skipped.length > 0 && (
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {done.skipped.map((s) => <li key={s.key}>{s.label}: {s.reason}</li>)}
                  </ul>
                )}
              </div>
            ) : null}
            {error ? <p role="alert" style={{ color: '#b91c1c' }}>{error}</p> : null}
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: '2px 0 8px', opacity: 0.75 }}>
            {layerTarget ? t('dlc_dxf_layers_hint') : t('dlc_dxf_layers_hint_sheets')}
          </p>
          {rows.length > 0 ? <DxfLayerTable rows={rows} onStyle={setStyle} /> : null}
        </>
      )}
    </Dialog>
  );
}
