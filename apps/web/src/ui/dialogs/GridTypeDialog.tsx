import { useState, type ReactElement } from 'react';
import { gridTypeIssue, gridTypeOf, projectGridTypes, type GridCenterSegment, type GridLinePattern, type GridType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField, Row, TextField } from '../fields.tsx';
import { camposDoSegmento, copiaDoTipo, PATTERN_LABEL, SEGMENT_LABEL } from '../gridUi.ts';
import { Dialog } from './Dialog.tsx';
import { useT } from '../../editor/i18n.ts';

const SEGMENTS = Object.keys(SEGMENT_LABEL) as GridCenterSegment[];
const PATTERNS = Object.keys(PATTERN_LABEL) as GridLinePattern[];

/** Cor do campo: `null` é a tinta do tema (checado = usa a tinta); senão a cor escolhida. */
function CorField({ id, label, cor, onChange }: { id: string; label: string; cor: string | null; onChange: (c: string | null) => void }): ReactElement {
  const { t } = useT();
  return (
    <Row label={label}>
      <span className="iconrow">
        <Check id={`${id}-tinta`} checked={cor === null} onChange={(v) => onChange(v ? null : '#000000')}>{t('dlt_grid_theme_ink')}</Check>
        {cor !== null ? <input id={id} className="input" type="color" aria-label={label} value={cor} onChange={(e) => onChange(e.target.value)} /> : null}
      </span>
    </Row>
  );
}

/**
 * Editor de tipo de grade (Revit: Tipo de grade). Medidas em mm de papel; o modelo valida (`gridTypeIssue`) e a mensagem
 * dele aparece no rodapé, com Aplicar e OK desabilitados enquanto houver erro.
 */
export function GridTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const { t } = useT();
  const p = useProject();
  const src = gridTypeOf(p, typeId);
  const [draft, setDraft] = useState<GridType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [erro, setErro] = useState<string | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setErro(null);
    setDraft(gridTypeOf(p, typeId) ? structuredClone(gridTypeOf(p, typeId)!) : null);
  }
  if (!draft) return null;
  const issue = gridTypeIssue(draft);
  const campos = camposDoSegmento(draft.centerSegment);
  const set = (patch: Partial<GridType>): void => setDraft({ ...draft, ...patch });
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const falha = (e: unknown): void => setErro(e instanceof Error ? e.message : t('dlt_err_operation_refused'));
  /** Grava o rascunho. Devolve true se gravou (o diálogo pode fechar). */
  const aplicar = (): boolean => {
    if (issue) return false;
    try {
      const { id, ...patch } = draft;
      editor.store.exec({ type: 'updateGridType', id, patch }, 'Editar tipo de grade');
      setErro(null);
      return true;
    } catch (e) {
      falha(e);
      return false;
    }
  };
  const ok = (): void => {
    if (aplicar()) close();
  };
  const duplicar = (): void => {
    const copia = copiaDoTipo(draft);
    try {
      editor.store.exec({ type: 'addGridType', gridType: copia }, 'Duplicar tipo de grade');
      useUi.setState({ dialogArg: copia.id });
    } catch (e) {
      falha(e);
    }
  };
  const excluir = (): void => {
    try {
      editor.store.exec({ type: 'removeGridType', id: draft.id }, 'Excluir tipo de grade');
      const ui = useUi.getState();
      if (ui.options.grid?.typeId === draft.id) {
        const restante = projectGridTypes(editor.project).find((t) => t.id !== draft.id);
        useUi.setState({ options: { ...ui.options, grid: { mode: ui.options.grid.mode, typeId: restante?.id ?? draft.id } } });
      }
      close();
    } catch (e) {
      falha(e);
    }
  };
  return (
    <Dialog
      title={t('dlt_grid_title')}
      sub={t('dlt_grid_sub')}
      onClose={close}
      size="mid"
      footer={
        <>
          <button className="btn danger" onClick={excluir}>{t('stt_delete')}</button>
          <button className="btn" onClick={duplicar}>{t('dlt_btn_duplicate_plain')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('stt_cancel')}</button>
          <button className="btn" onClick={() => aplicar()} disabled={issue !== null}>{t('stt_apply')}</button>
          <button className="btn primary" onClick={ok} disabled={issue !== null} title={issue ?? undefined}>{t('stt_ok')}</button>
        </>
      }
    >
      {issue || erro ? <div role="alert" className="hint" style={{ color: 'var(--danger, #b42318)' }}>{erro ?? issue}</div> : null}
      <Row label={t('stt_f_name')} htmlFor="gt-name"><TextField id="gt-name" value={draft.name} onCommit={(v) => set({ name: v.trim() })} /></Row>
      <Row label={t('dlt_fld_center_segment')} htmlFor="gt-seg">
        <select id="gt-seg" className="select" value={draft.centerSegment} onChange={(e) => set({ centerSegment: e.target.value as GridCenterSegment })}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}
        </select>
      </Row>
      <Row label={t('dlt_fld_weight')} htmlFor="gt-weight"><NumField id="gt-weight" value={draft.weightMm / 1000} quantity="smallLength" onCommit={(v) => set({ weightMm: v * 1000 })} /></Row>
      <Row label={t('dlt_fld_pattern')} htmlFor="gt-pattern">
        <select id="gt-pattern" className="select" value={draft.pattern} onChange={(e) => set({ pattern: e.target.value as GridLinePattern })}>
          {PATTERNS.map((s) => <option key={s} value={s}>{PATTERN_LABEL[s]}</option>)}
        </select>
      </Row>
      <CorField id="gt-color" label={t('dlt_fld_color')} cor={draft.color} onChange={(c) => set({ color: c })} />
      {campos.pontas ? <Row label={t('dlt_fld_end_length')} htmlFor="gt-end"><NumField id="gt-end" value={draft.endLengthMm / 1000} quantity="smallLength" min={0} onCommit={(v) => set({ endLengthMm: v * 1000 })} /></Row> : null}
      {campos.centro ? (
        <>
          <Row label={t('dlt_fld_center_weight')} htmlFor="gt-cweight"><NumField id="gt-cweight" value={draft.centerWeightMm / 1000} quantity="smallLength" onCommit={(v) => set({ centerWeightMm: v * 1000 })} /></Row>
          <Row label={t('dlt_fld_center_pattern')} htmlFor="gt-cpattern">
            <select id="gt-cpattern" className="select" value={draft.centerPattern} onChange={(e) => set({ centerPattern: e.target.value as GridLinePattern })}>
              {PATTERNS.map((s) => <option key={s} value={s}>{PATTERN_LABEL[s]}</option>)}
            </select>
          </Row>
          <CorField id="gt-ccolor" label={t('dlt_fld_center_color')} cor={draft.centerColor} onChange={(c) => set({ centerColor: c })} />
        </>
      ) : null}
      <Row label={t('dlt_fld_bubble_diameter')} htmlFor="gt-bdiam"><NumField id="gt-bdiam" value={draft.bubbleDiameterMm / 1000} quantity="smallLength" onCommit={(v) => set({ bubbleDiameterMm: v * 1000 })} /></Row>
      <Row label={t('dlt_fld_text_height')} htmlFor="gt-btext"><NumField id="gt-btext" value={draft.bubbleTextMm / 1000} quantity="smallLength" onCommit={(v) => set({ bubbleTextMm: v * 1000 })} /></Row>
    </Dialog>
  );
}
