import { useEffect, useMemo, useState, useSyncExternalStore, type DragEvent, type ReactElement } from 'react';
import { importInWorker, type FurnitureImportedModel } from '@hestia/io';
import { assetUsage, type FurnitureCategory } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { addAssetToProject, deleteUnusedAsset, startPlacing } from '../../editor/furniture/actions.ts';
import { assetTriangles } from '../../editor/furniture/budget.ts';
import { FURNITURE_ACCEPT, ImportFlow, type FlowError, type FlowState, type ImportFn } from '../../editor/furniture/importFlow.ts';
import { buildAssetOffThread } from '../../editor/furniture/buildAssetOffThread.ts';
import {
  FILE_UNITS,
  FURNITURE_CATEGORIES,
  initialMaterialEdits,
  summarizeModel,
  UNIT_FACTOR,
  type FileUnit,
  type MaterialEdit,
} from '../../editor/furniture/importModel.ts';
import { fmtNum, useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

type Tr = (k: keyof Dict, a?: Record<string, string | number>) => string;

const UNIT_KEY: Record<FileUnit, keyof Dict> = { m: 'fur_unit_m', cm: 'fur_unit_cm', mm: 'fur_unit_mm', in: 'fur_unit_in' };
const catKey = (c: FurnitureCategory): keyof Dict => `fur_cat_${c}` as keyof Dict;
const nextTick = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** Texto (traduzido) de cada motivo de a importação não ter seguido. */
export function flowErrorText(e: FlowError, t: Tr): string {
  switch (e.kind) {
    case 'format': return t('fur_err_format', { ext: e.ext });
    case 'too_big': return t('fur_err_too_big', { mb: e.mb });
    case 'refused': return t('fur_err_refused');
    case 'cancelled': return t('fur_cancelled');
    case 'generic': return t('fur_err_generic', { msg: e.msg });
  }
}

/** Dados do formulário de revisão no momento de adicionar. */
export interface AddForm {
  name: string;
  unit: FileUnit;
  edits: MaterialEdit[];
}

/** Importar móvel: escolher/arrastar o arquivo, ler em Web Worker (barra + cancelar), revisar e adicionar ao projeto. */
export function ImportFurnitureDialog({ importFn = importInWorker as ImportFn }: { importFn?: ImportFn }): ReactElement {
  const { t } = useT();
  const tab = useUi((s) => (s.dialogArg === 'blocks' ? 'blocks' : 'import'));
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const setTab = (k: 'import' | 'blocks'): void => useUi.setState({ dialogArg: k === 'blocks' ? 'blocks' : null });
  const flow = useMemo(() => new ImportFlow(importFn), [importFn]);
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  // Fechar o diálogo (ou sair da tela) encerra o Worker.
  useEffect(() => () => flow.dispose(), [flow]);

  const add = async (place: boolean, form: AddForm): Promise<void> => {
    const model = state.model;
    if (!model) return;
    flow.setAdding();
    await nextTick();
    try {
      const asset = await buildAssetOffThread(model, { name: form.name, factor: UNIT_FACTOR[form.unit], materials: form.edits });
      addAssetToProject(asset);
      flow.reset();
      if (place) startPlacing(asset.id);
      else setTab('blocks');
    } catch (e) {
      flow.failAdding(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog
      title={t(tab === 'blocks' ? 'fur_blocks_title' : 'fur_import_title')}
      {...(tab === 'blocks' ? {} : { sub: t('fur_import_sub') })}
      onClose={close}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('fur_close')}</button>
        </>
      }
    >
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button role="tab" aria-selected={tab === 'import'} className={`btn${tab === 'import' ? ' primary' : ''}`} onClick={() => setTab('import')}>{t('fur_tab_import')}</button>
        <button role="tab" aria-selected={tab === 'blocks'} className={`btn${tab === 'blocks' ? ' primary' : ''}`} onClick={() => setTab('blocks')}>{t('fur_tab_blocks')}</button>
      </div>
      {tab === 'blocks' ? (
        <BlocksList />
      ) : (
        <ImportPanel state={state} onFile={(f) => void flow.start(f)} onCancel={() => flow.cancel()} onAdd={(place, form) => void add(place, form)} />
      )}
    </Dialog>
  );
}

/** Parte "Importar" do diálogo: desenha o estado do fluxo (testável por marcação estática). */
export function ImportPanel({
  state,
  onFile,
  onCancel,
  onAdd,
}: {
  state: FlowState;
  onFile: (f: File | undefined) => void;
  onCancel: () => void;
  onAdd: (place: boolean, form: AddForm) => void;
}): ReactElement {
  const { t } = useT();
  const [over, setOver] = useState(false);
  const busy = state.phase === 'reading' || state.phase === 'importing';
  const { progress } = state;
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setOver(false);
    onFile(e.dataTransfer.files?.[0]);
  };
  return (
    <>
      <div
        data-testid="fur-drop"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        style={{ border: `2px dashed ${over ? 'var(--accent)' : 'var(--line, #8886)'}`, borderRadius: 6, padding: 14, marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <label className="fm-field">
          {t('fur_file')}
          <input
            type="file"
            accept={FURNITURE_ACCEPT.join(',')}
            aria-label={t('fur_file')}
            data-testid="fur-file"
            disabled={busy || state.phase === 'adding'}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }}
            style={{ marginLeft: 8 }}
          />
        </label>
        <span style={{ opacity: 0.7 }}>{t('fur_drop')}</span>
      </div>

      {busy ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <progress
              role="progressbar"
              aria-label={t('fur_importing')}
              aria-valuenow={Math.round(progress.fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              {...(state.phase === 'reading' ? {} : { value: progress.fraction })}
              max={1}
              style={{ flex: 1 }}
            />
            <span className="mono" style={{ minWidth: 40 }}>{state.phase === 'reading' ? '' : `${Math.round(progress.fraction * 100)}%`}</span>
            <button className="btn" onClick={onCancel}>{t('fur_cancel_import')}</button>
          </div>
          <div role="status" style={{ opacity: 0.75, marginTop: 4 }}>{state.phase === 'reading' ? t('fur_reading') : progress.label || t('fur_importing')}</div>
        </div>
      ) : null}

      {state.error ? (
        <p role={state.error.kind === 'cancelled' ? 'status' : 'alert'} style={{ color: state.error.kind === 'cancelled' ? undefined : '#b91c1c', margin: '0 0 10px' }}>
          {flowErrorText(state.error, t)}
        </p>
      ) : null}

      {state.model ? <ReviewForm key={`${state.model.sourceFileName}:${state.model.stats.ms}`} model={state.model} adding={state.phase === 'adding'} onAdd={onAdd} /> : null}
    </>
  );
}

/** Revisão do que foi lido: nome, unidade e materiais; "Adicionar" entrega o formulário. */
function ReviewForm({ model, adding, onAdd }: { model: FurnitureImportedModel; adding: boolean; onAdd: (place: boolean, form: AddForm) => void }): ReactElement {
  const { t, lang } = useT();
  const [name, setName] = useState(model.name);
  const [unit, setUnit] = useState<FileUnit>('m');
  const [edits, setEdits] = useState<MaterialEdit[]>(() => initialMaterialEdits(model));
  const summary = useMemo(() => summarizeModel(model, UNIT_FACTOR[unit]), [model, unit]);
  const fmt = (n: number, d = 2): string => fmtNum(n, d, lang);
  const form: AddForm = { name, unit, edits };
  return (
    <div data-testid="fur-ready">
      <h4 style={{ margin: '8px 0 4px' }}>{t('fur_read_title')}</h4>
      <p style={{ margin: 0 }} role="status">
        <b>{model.sourceFileName}</b> — {t('fur_read_summary', { vertices: fmtNum(summary.vertices, 0, lang), triangles: fmtNum(summary.triangles, 0, lang), parts: summary.parts, textures: summary.textures })}
      </p>
      <p style={{ margin: '2px 0 8px' }} data-testid="fur-dims">{t('fur_dims', { x: fmt(summary.dims[0]), y: fmt(summary.dims[1]), z: fmt(summary.dims[2]) })}</p>

      {model.warnings.length > 0 ? (
        <div style={{ margin: '0 0 10px' }}>
          <b>{t('fur_warnings')}</b>
          <ul data-testid="fur-warnings" style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {model.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
        <label htmlFor="fur-name">{t('fur_name')}</label>
        <input id="fur-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="fur-unit">{t('fur_unit')}</label>
        <span>
          <select id="fur-unit" value={unit} onChange={(e) => setUnit(e.target.value as FileUnit)}>
            {FILE_UNITS.map((u) => <option key={u} value={u}>{t(UNIT_KEY[u])}</option>)}
          </select>
          <span style={{ opacity: 0.65, marginLeft: 8 }}>{t('fur_unit_hint')}</span>
        </span>
      </div>

      {model.materials.length > 0 ? (
        <>
          <h4 style={{ margin: '8px 0 4px' }}>{t('fur_materials')}</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {model.materials.map((m, i) => {
                const e = edits[i];
                if (!e) return null;
                const patch = (p: Partial<MaterialEdit>): void => setEdits((cur) => cur.map((x, k) => (k === i ? { ...x, ...p } : x)));
                const hasTex = m.textureIndex !== undefined;
                return (
                  <tr key={i}>
                    <td style={{ padding: '2px 8px 2px 0' }}>{m.name}</td>
                    <td>
                      <select aria-label={`${t('fur_mat_category')}: ${m.name}`} value={e.category} onChange={(ev) => patch({ category: ev.target.value as FurnitureCategory })}>
                        {FURNITURE_CATEGORIES.map((c) => <option key={c} value={c}>{t(catKey(c))}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="color" aria-label={`${t('fur_mat_color')}: ${m.name}`} value={e.color} onChange={(ev) => patch({ color: ev.target.value })} />
                    </td>
                    <td>
                      <label style={{ opacity: hasTex ? 1 : 0.5 }}>
                        <input type="checkbox" aria-label={`${t('fur_mat_texture')}: ${m.name}`} disabled={!hasTex} checked={hasTex && e.useEmbeddedTexture} onChange={(ev) => patch({ useEmbeddedTexture: ev.target.checked })} />
                        {' '}{t('fur_mat_texture')}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn" data-testid="fur-add" disabled={adding || !name.trim()} onClick={() => onAdd(false, form)}>{adding ? t('fur_adding') : t('fur_add')}</button>
        <button className="btn primary" data-testid="fur-add-place" disabled={adding || !name.trim()} onClick={() => onAdd(true, form)}>{t('fur_add_place')}</button>
      </div>
    </div>
  );
}

/** "Meus blocos": os blocos do projeto, com Colocar e Excluir (só sem uso). */
function BlocksList(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const assets = Object.values(p.furniture?.assets ?? {});
  if (assets.length === 0) return <p style={{ opacity: 0.75 }}>{t('fur_blocks_empty')}</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} data-testid="fur-blocks">
      {assets.map((a) => {
        const n = assetUsage(p, a.id).count;
        const size = [a.bbox.max[0] - a.bbox.min[0], a.bbox.max[1] - a.bbox.min[1], a.bbox.max[2] - a.bbox.min[2]].map((v) => fmtNum(v, 2, lang));
        return (
          <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              <b>{a.name}</b>
              <br />
              <span style={{ opacity: 0.7 }}>{t('fur_block_info', { triangles: fmtNum(Math.round(assetTriangles(a)), 0, lang), x: size[0]!, y: size[1]!, z: size[2]!, n })}</span>
            </span>
            <button className="btn primary" data-testid="fur-block-place" onClick={() => startPlacing(a.id)}>{t('fur_block_place')}</button>
            <button className="btn" data-testid="fur-block-delete" disabled={n > 0} title={n > 0 ? t('fur_block_in_use') : undefined} onClick={() => deleteUnusedAsset(a.id)}>{t('fur_block_delete')}</button>
          </li>
        );
      })}
    </ul>
  );
}
