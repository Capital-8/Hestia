import { useEffect, useMemo, useState, useSyncExternalStore, type DragEvent, type ReactElement } from 'react';
import { importInWorker } from '@hestia/io';
import { assetUsage } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { addAssetToProject, deleteUnusedAsset, startPlacing } from '../../editor/furniture/actions.ts';
import { assetTriangles } from '../../editor/furniture/budget.ts';
import { FURNITURE_ACCEPT, ImportFlow, type FlowError, type FlowState, type ImportFn } from '../../editor/furniture/importFlow.ts';
import { buildAssetOffThread } from '../../editor/furniture/buildAssetOffThread.ts';
import { BatchImport } from '../../editor/furniture/batchImport.ts';
import { UNIT_FACTOR } from '../../editor/furniture/importModel.ts';
import { fmtNum, useT, type Dict } from '../../editor/i18n.ts';
import { ImportBatchPanel } from './ImportBatchPanel.tsx';
import { ReviewForm, type AddForm } from './ImportReviewForm.tsx';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

type Tr = (k: keyof Dict, a?: Record<string, string | number>) => string;

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

export type { AddForm };

/** Importar móvel: escolher/arrastar o arquivo, ler em Web Worker (barra + cancelar), revisar e adicionar ao projeto. */
export function ImportFurnitureDialog({ importFn = importInWorker as ImportFn }: { importFn?: ImportFn }): ReactElement {
  const { t } = useT();
  const tab = useUi((s) => (s.dialogArg === 'blocks' ? 'blocks' : 'import'));
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const setTab = (k: 'import' | 'blocks'): void => useUi.setState({ dialogArg: k === 'blocks' ? 'blocks' : null });
  const flow = useMemo(() => new ImportFlow(importFn), [importFn]);
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);
  const batch = useMemo(() => new BatchImport(importFn, buildAssetOffThread, addAssetToProject), [importFn]);
  const batchState = useSyncExternalStore(batch.subscribe, batch.getState, batch.getState);
  const [queued, setQueued] = useState<File[]>([]);
  // Fechar o diálogo (ou sair da tela) encerra o Worker.
  useEffect(() => () => { flow.dispose(); batch.dispose(); }, [flow, batch]);
  const onFiles = (files: File[]): void => {
    if (files.length > 1) setQueued(files);
    else void flow.start(files[0]);
  };

  const add = async (place: boolean, form: AddForm): Promise<void> => {
    const model = state.model;
    if (!model) return;
    flow.setAdding();
    await nextTick();
    try {
      const asset = await buildAssetOffThread(model, { name: form.name, factor: UNIT_FACTOR[form.unit], up: form.up, axisScale: form.axisScale, materials: form.edits });
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
        queued.length > 0 || batchState.items.length > 0 ? (
          <ImportBatchPanel
            queued={queued.map((f) => f.name)}
            state={batchState}
            errorText={(e) => flowErrorText(e, t)}
            onStart={(o) => void batch.start(queued, o)}
            onCancel={() => batch.cancel()}
            onNew={() => { batch.reset(); setQueued([]); }}
            onBlocks={() => { batch.reset(); setQueued([]); setTab('blocks'); }}
          />
        ) : (
          <ImportPanel state={state} onFiles={onFiles} onCancel={() => flow.cancel()} onAdd={(place, form) => void add(place, form)} />
        )
      )}
    </Dialog>
  );
}

/** Parte "Importar" do diálogo: desenha o estado do fluxo (testável por marcação estática). */
export function ImportPanel({
  state,
  onFiles,
  onCancel,
  onAdd,
}: {
  state: FlowState;
  onFiles: (files: File[]) => void;
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
    onFiles(Array.from(e.dataTransfer.files ?? []));
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
            multiple
            disabled={busy || state.phase === 'adding'}
            onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
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
