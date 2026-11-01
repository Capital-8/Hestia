import { useEffect, useRef, useState, type ReactElement } from 'react';
import { DEFAULT_STAIR_CALC_RULE, stairTypeUsage, type StairRunStyle, type StairType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { keptStairType } from '../../editor/stairActions.ts';
import { saveStairType, stairTypeDeleteBlock, tryDeleteStairType } from '../../editor/stairTypeActions.ts';
import { I18N, useI18n } from '../../editor/i18n.ts';
import { safeGet, safeSet } from '../../editor/storage.ts';
import { TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { TypeDialogHeader } from './TypeDialogHeader.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { StairSectionPreview } from './StairSectionPreview.tsx';
import { StairCalculatorPanel } from './StairCalculatorPanel.tsx';
import { StairBlondelCard } from './StairBlondelCard.tsx';
import { StairTypeSections, stairIssueText } from './StairTypeSections.tsx';
import { computeStairCalc } from './stairTypeCalc.ts';
import { duplicateDraft, finalizeForSave, hasUnsavedChanges, preserveOnStyleChange, validateStairType } from './stairTypeForm.ts';

const CALC_H_KEY = 'hestia.stt.calcH';

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/** Completa tipos antigos com a regra padrão (a migração pode não ter passado por todos os campos). */
function normalize(t: StairType): StairType {
  return {
    ...t,
    calcRiserFactor: t.calcRiserFactor ?? DEFAULT_STAIR_CALC_RULE.calcRiserFactor,
    calcTreadFactor: t.calcTreadFactor ?? DEFAULT_STAIR_CALC_RULE.calcTreadFactor,
    calcTarget: t.calcTarget ?? DEFAULT_STAIR_CALC_RULE.calcTarget,
    calcMin: t.calcMin ?? DEFAULT_STAIR_CALC_RULE.calcMin,
    calcMax: t.calcMax ?? DEFAULT_STAIR_CALC_RULE.calcMax,
    maxTread: t.maxTread ?? DEFAULT_STAIR_CALC_RULE.maxTread,
    treadOverlap: t.treadOverlap ?? 0,
  };
}

function initialHeight(): number {
  const raw = safeGet(CALC_H_KEY);
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/** Foca o primeiro campo da seção (abre a seção de identificação, que começa fechada). */
function focusSection(n: number): void {
  const box = document.getElementById(`stt-sec-${n}`);
  const details = box instanceof HTMLDetailsElement ? box : box?.closest('details');
  if (details) details.open = true;
  const el = box?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
  el?.focus();
}

/** Só grava o valor digitado no NumField ao sair do campo: desfoca e executa a ação no próximo passo. */
function runAction(action: () => void): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  window.setTimeout(action, 0);
}

/**
 * Modal do tipo de escada: nome no topo, seções 1 a 5 à esquerda e calculadora + prévia à direita. Os atalhos são
 * tratados em captura porque o NumField para a propagação do keydown (Ctrl+Enter no Dialog; Ctrl+S e Alt+1..5 aqui).
 */
export function StairTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const p = useProject();
  const selection = useUi((s) => s.selection);
  const lang = useI18n((s) => s.lang);
  const t = I18N[lang];
  const src = p.stairTypes[typeId];
  const base = src ? normalize(structuredClone(src)) : null;
  const [draft, setDraftState] = useState<StairType | null>(() => (src ? normalize(structuredClone(src)) : null));
  const draftRef = useRef<StairType | null>(draft);
  const [current, setCurrent] = useState(typeId);
  const styleStore = useRef<Partial<StairType>>({});
  const [calcHeight, setCalcHeightState] = useState<number>(initialHeight);
  const [saveError, setSaveError] = useState<string | null>(null);
  draftRef.current = draft;
  if (current !== typeId) {
    setCurrent(typeId);
    setSaveError(null);
    const next = p.stairTypes[typeId] ? normalize(structuredClone(p.stairTypes[typeId]!)) : null;
    draftRef.current = next;
    styleStore.current = {};
    setDraftState(next);
  }

  const set = (patch: Partial<StairType>): void => {
    const cur = draftRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    draftRef.current = next;
    setDraftState(next);
  };
  const changeStyle = (style: StairRunStyle): void => {
    const cur = draftRef.current;
    if (!cur) return;
    const next = preserveOnStyleChange(cur, style, styleStore);
    draftRef.current = next;
    setDraftState(next);
  };
  const setCalcHeight = (v: number): void => {
    setCalcHeightState(v);
    safeSet(CALC_H_KEY, String(v));
  };

  const materialIds = Object.keys(p.materials);
  const issues = draft ? validateStairType(draft, materialIds) : [];
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const canSave = errors.length === 0;
  const usage = draft ? stairTypeUsage(p, draft.id) : 0;
  const dirty = hasUnsavedChanges(draft, base);
  const impact = Boolean(
    draft && base && usage > 0 &&
    (['maxRiser', 'minRiser', 'minTread', 'calcRiserFactor', 'calcTreadFactor'] as const).some((f) => draft[f] !== base[f]),
  );
  const calc = draft ? computeStairCalc(draft, calcHeight / 100) : null;
  const nameIssue = issues.find((i) => i.field === 'name' && i.severity === 'error') ?? issues.find((i) => i.field === 'name');
  const nameMsg = nameIssue ? stairIssueText(nameIssue, t) : undefined;

  const closeNow = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const requestClose = (): void => {
    if (dirty && !window.confirm(t.stt_discard)) return;
    closeNow();
  };
  const persist = (): boolean => {
    const cur = draftRef.current;
    if (!cur) return false;
    if (validateStairType(cur, materialIds).some((i) => i.severity === 'error')) return false;
    const saved = finalizeForSave(cur);
    const r = saveStairType(editor.store, saved);
    if (!r.ok) {
      // O modelo recusou (regras mais estritas que as do modal): o diálogo continua aberto com o rascunho.
      setSaveError(`Não foi possível salvar: ${r.error}`);
      return false;
    }
    setSaveError(null);
    draftRef.current = saved;
    setDraftState(saved);
    return true;
  };
  const apply = (): void => {
    persist();
  };
  const ok = (): void => {
    if (persist()) closeNow();
  };
  const okRef = useRef(ok);
  const applyRef = useRef(apply);
  okRef.current = ok;
  applyRef.current = apply;

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        runAction(() => applyRef.current());
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        focusSection(Number(e.key));
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  const duplicate = (): void => {
    const cur = draftRef.current;
    if (!cur) return;
    // Parte do rascunho atual (com as alterações não salvas), não do tipo salvo.
    if (validateStairType(cur, materialIds).some((i) => i.severity === 'error')) {
      useUi.setState({ status: 'Corrija os erros do tipo antes de duplicar.' });
      return;
    }
    const copy = duplicateDraft(finalizeForSave(cur));
    editor.store.exec({ type: 'upsertStairType', stairType: copy }, 'Duplicar tipo de escada');
    useUi.setState({ dialogArg: copy.id });
  };
  const selectType = (id: string): void => {
    if (id === typeId) return;
    if (dirty && !window.confirm(t.stt_discard)) return;
    useUi.setState({ dialogArg: id });
  };
  const del = (): void => {
    if (!draftRef.current) return;
    const r = tryDeleteStairType(editor.store, draftRef.current.id);
    if (!r.ok) {
      useUi.setState({ status: `Não foi possível excluir: ${r.error}` });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.stair?.typeId === draftRef.current.id) {
      useUi.setState({ options: { ...ui.options, stair: { ...ui.options.stair, typeId: keptStairType(editor.project, undefined) } } });
    }
    closeNow();
  };

  if (!draft) {
    return (
      <Dialog title={t.stt_title} onClose={closeNow} size="mid" footer={<button className="btn" onClick={closeNow}>{t.stt_close}</button>}>
        <p className="hint">{t.stt_missing}</p>
      </Dialog>
    );
  }

  const blocked = stairTypeDeleteBlock(p, draft.id);
  const target = selection.map((id) => p.elements[id]).find((e) => e?.kind === 'stair');
  const goProps = (): void => {
    if (!target) return;
    if (dirty && !window.confirm(t.stt_discard)) return;
    useUi.setState({ selection: [target.id], dialog: null, dialogArg: null });
  };
  const focusFirstError = (): void => {
    const field = errors[0]?.field;
    if (!field) return;
    const el = document.getElementById(`stt-${field}`);
    if (el instanceof HTMLElement) {
      const details = el.closest('details');
      if (details) details.open = true;
      el.focus();
    }
  };
  const errorWord = errors.length === 1 ? t.stt_err_word_one : t.stt_err_word_many;
  const warnWord = warnings.length === 1 ? t.stt_warn_word_one : t.stt_warn_word_many;
  const count = `${errors.length} ${errorWord}, ${warnings.length} ${warnWord}`;
  const sub = fill(usage === 1 ? t.stt_sub_one : t.stt_sub_many, { n: String(usage) });
  const disabledReason = errors.length > 0 ? stairIssueText(errors[0]!, t) : undefined;

  return (
    <Dialog
      title={t.stt_title}
      sub={sub}
      onClose={requestClose}
      onSubmit={() => runAction(() => okRef.current())}
      size="wide"
      footer={
        <>
          <button className="btn danger" disabled={blocked !== null} title={blocked ?? t.stt_delete_type_tip} onClick={del}>{t.stt_delete}</button>
          {blocked ? <span className="stt-ref">{fill(t.stt_delete_blocked, { reason: blocked })}</span> : null}
          <span style={{ flex: 1 }} />
          {errors.length > 0 ? (
            <button className="btn small" onClick={focusFirstError} title={disabledReason}>{count}</button>
          ) : (
            <span className="stt-ref">{count}</span>
          )}
          {disabledReason ? <span className="stt-ref" style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{disabledReason}</span> : null}
          <button className="btn" onClick={requestClose}>{t.stt_cancel}</button>
          <button className="btn" onClick={apply} disabled={!canSave} aria-disabled={!canSave} title={disabledReason}>{t.stt_apply}</button>
          <button className="btn primary" onClick={ok} disabled={!canSave} aria-disabled={!canSave} title={disabledReason}>{t.stt_ok}</button>
          <span className="stt-ref">{t.stt_kbd_hint}</span>
        </>
      }
    >
      <TypeDialogHeader family={FAMILY.stair} types={Object.values(p.stairTypes)} currentId={draft.id} nameFieldId="stt-name" onDuplicate={duplicate} onSelect={selectType} />
      <div className="field-row">
        <label htmlFor="stt-name">{t.stt_f_name}</label>
        <TextField
          id="stt-name"
          value={draft.name}
          onCommit={(v) => set({ name: v })}
          invalid={Boolean(nameMsg)}
          describedBy={nameMsg ? 'stt-name-err' : undefined}
          dataAutofocus
        />
      </div>
      {nameMsg ? <div className="vr-error" id="stt-name-err">{nameMsg}</div> : null}
      {saveError ? <div className="vr-error" role="alert">{saveError}</div> : null}
      {impact ? <p className="hint" role="status" style={{ color: 'var(--warn)' }}>{fill(t.stt_impact, { n: String(usage) })}</p> : null}
      <div className="stt-grid">
        <div className="stt-main">
          <StairTypeSections
            draft={draft}
            set={set}
            onStyle={changeStyle}
            materials={p.materials}
            issues={issues}
            canGoProps={Boolean(target)}
            onGoProps={goProps}
          />
        </div>
        <div className="stt-side">
          <div>
            <div className="stt-ref" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t.stt_preview_title}</div>
            <StairSectionPreview
              type={draft}
              riser={calc?.valid ? calc.riser : undefined}
              tread={calc?.valid ? calc.tread : undefined}
            />
          </div>
          <StairCalculatorPanel type={draft} heightCm={calcHeight} onHeight={setCalcHeight} />
          <StairBlondelCard type={draft} heightCm={calcHeight} />
        </div>
      </div>
    </Dialog>
  );
}
