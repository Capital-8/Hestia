import { useState, type ReactElement } from 'react';
import type { BatchItem, BatchState } from '../../editor/furniture/batchImport.ts';
import type { FileUnit, UpChoice } from '../../editor/furniture/importModel.ts';
import { fmtNum, useT, type Dict } from '../../editor/i18n.ts';
import { useFormat } from '../useUnits.ts';
import { UnitUpFields } from './ImportReviewForm.tsx';
import type { FlowError } from '../../editor/furniture/importFlow.ts';

type Tr = (k: keyof Dict, a?: Record<string, string | number>) => string;

const STATUS_KEY: Record<BatchItem['status'], keyof Dict> = {
  wait: 'fur_batch_wait',
  reading: 'fur_batch_reading',
  importing: 'fur_batch_importing',
  building: 'fur_batch_building',
  done: 'fur_batch_done',
  error: 'fur_err_generic',
  skipped: 'fur_batch_skipped',
};

/** Texto de um item do lote (o erro vem traduzido por `errorText`). */
export function batchItemText(it: BatchItem, t: Tr, errorText: (e: FlowError) => string, size: (m: number) => string, num: (n: number) => string): string {
  if (it.status === 'error' && it.error) return errorText(it.error);
  if (it.status === 'importing') return t('fur_batch_importing', { pct: Math.round(it.fraction * 100) });
  if (it.status === 'done' && it.dims) return `${t('fur_batch_done')} — ${t('fur_batch_info', { triangles: num(it.triangles), x: size(it.dims[0]), y: size(it.dims[1]), z: size(it.dims[2]) })}`;
  return t(STATUS_KEY[it.status], { msg: '' });
}

/** Vários arquivos escolhidos: opções do lote, progresso por arquivo e erro por arquivo. */
export function ImportBatchPanel({
  queued,
  state,
  errorText,
  onStart,
  onCancel,
  onNew,
  onBlocks,
}: {
  queued: string[];
  state: BatchState;
  errorText: (e: FlowError) => string;
  onStart: (o: { unit: FileUnit; up: UpChoice }) => void;
  onCancel: () => void;
  onNew: () => void;
  onBlocks: () => void;
}): ReactElement {
  const { t, lang } = useT();
  const fmt = useFormat();
  const [unit, setUnit] = useState<FileUnit>('m');
  const [up, setUp] = useState<UpChoice>('auto');
  const started = state.items.length > 0;
  const names = started ? state.items.map((i) => i.name) : queued;
  const ok = state.items.filter((i) => i.status === 'done').length;
  const err = state.items.filter((i) => i.status === 'error').length;
  const skipped = state.items.filter((i) => i.status === 'skipped').length;
  return (
    <div data-testid="fur-batch">
      <h4 style={{ margin: '8px 0 4px' }}>{t('fur_batch_title', { n: names.length })}</h4>
      {!started ? (
        <>
          <p style={{ margin: '0 0 8px', opacity: 0.75 }}>{t('fur_batch_hint')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
            <UnitUpFields unit={unit} up={up} onUnit={setUnit} onUp={setUp} />
          </div>
        </>
      ) : null}
      <ul data-testid="fur-batch-list" style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'grid', gap: 4 }}>
        {names.map((n, i) => {
          const it = state.items[i];
          return (
            <li key={`${n}:${i}`} data-status={it?.status ?? 'wait'} style={{ display: 'flex', gap: 10 }}>
              <b style={{ minWidth: 160 }}>{n}</b>
              <span role={it?.status === 'error' ? 'alert' : 'status'} style={{ color: it?.status === 'error' ? '#b91c1c' : undefined }}>
                {it ? batchItemText(it, t, errorText, (m) => fmt('length', m), (v) => fmtNum(v, 0, lang)) : t('fur_batch_wait')}
              </span>
            </li>
          );
        })}
      </ul>
      {started && !state.running ? <p role="status">{t('fur_batch_summary', { ok, err, skipped })}</p> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {!started ? <button className="btn primary" data-testid="fur-batch-start" onClick={() => onStart({ unit, up })}>{t('fur_batch_start', { n: names.length })}</button> : null}
        {state.running ? <button className="btn" onClick={onCancel}>{t('fur_cancel_import')}</button> : null}
        {started && !state.running ? <button className="btn" onClick={onNew}>{t('fur_batch_new')}</button> : null}
        {started && !state.running && ok > 0 ? <button className="btn primary" data-testid="fur-batch-blocks" onClick={onBlocks}>{t('fur_batch_blocks')}</button> : null}
      </div>
    </div>
  );
}
