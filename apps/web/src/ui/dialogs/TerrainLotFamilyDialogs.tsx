import { useState, type ReactElement } from 'react';
import {
  defaultLotFamilyIdOf,
  defaultTerrainTextFamilyIdOf,
  FAMILY_FONT_PADRAO,
  lotFamiliesOf,
  terrainTextFamiliesOf,
  type FamilyLengthUnit,
  type LotFamily,
  type TerrainTextFamily,
  type TerrainTextKind,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { FamilyCheck, FamilyRow, FamilyTypeDialog } from './familia/index.ts';
import { NumField, TextField } from '../fields.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const uid = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Campos comuns de texto: fonte, cor, unidade e casas. `value` é a família em edição e `patch` grava o rascunho. */
function TextoFields<T extends { font: string; unit: FamilyLengthUnit; precision?: 0 | 1 | 2 | 3; textMm: number; bold?: boolean; italic?: boolean }>({ pre, value, color, onColor, patch }: { pre: string; value: T; color: string | undefined; onColor: (c: string | undefined) => void; patch: (k: Partial<T>) => void }): ReactElement {
  const { t } = useT();
  return (
    <>
      <FamilyRow label={t('ui_fam_font')} htmlFor={`${pre}-font`}>
        <select id={`${pre}-font`} className="select" value={value.font} onChange={(e) => patch({ font: e.target.value } as Partial<T>)}>
          <option value={FAMILY_FONT_PADRAO}>{t('ui_fam_font_narrow')}</option>
          <option value="monospace">{t('ui_fam_font_mono')}</option>
          <option value="serif">{t('ui_fam_font_serif')}</option>
        </select>
      </FamilyRow>
      <FamilyRow label={t('ui_fam_text_mm')} htmlFor={`${pre}-h`}>
        <NumField id={`${pre}-h`} value={value.textMm} decimals={1} unit="mm" min={0.5} onCommit={(v) => patch({ textMm: v } as Partial<T>)} />
      </FamilyRow>
      <FamilyRow label={t('ui_fam_unit')} htmlFor={`${pre}-unit`}>
        <select id={`${pre}-unit`} className="select" value={value.unit} onChange={(e) => patch({ unit: e.target.value as FamilyLengthUnit } as Partial<T>)}>
          <option value="project">{t('ui_fam_unit_project')}</option>
          <option value="m">m</option>
          <option value="cm">cm</option>
          <option value="mm">mm</option>
        </select>
      </FamilyRow>
      <FamilyRow label={t('ui_fam_precision')} htmlFor={`${pre}-prec`}>
        <select id={`${pre}-prec`} className="select" value={value.precision === undefined ? '' : String(value.precision)} onChange={(e) => patch({ precision: e.target.value === '' ? undefined : (Number(e.target.value) as 0 | 1 | 2 | 3) } as Partial<T>)}>
          <option value="">{t('ui_fam_prec_project')}</option>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </FamilyRow>
      <FamilyRow label={t('ui_fam_color')} htmlFor={`${pre}-color`}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input id={`${pre}-color`} type="color" value={color ?? '#16181c'} onChange={(e) => onColor(e.target.value)} />
          <button type="button" className="btn small" onClick={() => onColor(undefined)}>{t('ui_fam_color_theme')}</button>
        </div>
      </FamilyRow>
      <FamilyCheck id={`${pre}-bold`} checked={value.bold === true} onChange={(v) => patch({ bold: v } as Partial<T>)}>{t('ui_fam_bold')}</FamilyCheck>
      <FamilyCheck id={`${pre}-italic`} checked={value.italic === true} onChange={(v) => patch({ italic: v } as Partial<T>)}>{t('ui_fam_italic')}</FamilyCheck>
    </>
  );
}

/** Tipos do texto do terreno: rótulo de curva de nível (`contour`) e cota de ponto do terreno (`spot`). */
export function TerrainTextFamiliesDialog({ kind }: { kind: TerrainTextKind }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultTerrainTextFamilyIdOf(p.settings, kind);
  const [list, setList] = useState<TerrainTextFamily[]>(() => terrainTextFamiliesOf(p.settings));
  const mine = list.filter((x) => x.kind === kind);
  const [selId, setSelId] = useState<string>(() => mine.find((x) => x.id === initialId)?.id ?? mine[0]!.id);
  const draft = mine.find((x) => x.id === selId) ?? mine[0]!;
  const patch = (k: Partial<TerrainTextFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: TerrainTextFamily = { ...draft, id: uid('tntxt'), name: `${draft.name} ${t('ui_fam_copy')}` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (mine.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next.find((x) => x.kind === kind)!.id);
  };
  const apply = (): void => {
    editor.store.transaction(t('ui_fam_undo_terrain'), () => {
      for (const f of list) editor.store.exec({ type: 'upsertTerrainTextFamily', family: f });
      const gone = terrainTextFamiliesOf(p.settings).filter((o) => !list.some((x) => x.id === o.id));
      for (const g of gone) editor.store.exec({ type: 'removeTerrainTextFamily', id: g.id });
      editor.store.exec({ type: 'setSettings', patch: kind === 'contour' ? { defaultTerrainContourFamilyId: draft.id } : { defaultTerrainSpotFamilyId: draft.id } });
    });
  };
  const famLabel = t(kind === 'contour' ? 'ui_fam_family_contour' : 'ui_fam_family_spot');
  return (
    <FamilyTypeDialog
      title={t(kind === 'contour' ? 'ui_fam_title_contour' : 'ui_fam_title_spot')}
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family={famLabel}
      types={mine}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'tt-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: mine.length <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <TextoFields pre="tt" value={draft} color={draft.color} onColor={(c) => patch({ color: c })} patch={patch} />
      <FamilyRow label={t('ui_fam_prefix')} htmlFor="tt-pre"><TextField id="tt-pre" value={draft.prefix} onCommit={(v) => patch({ prefix: v })} /></FamilyRow>
    </FamilyTypeDialog>
  );
}

/** Tipos do lote: linha de propriedade (contorno) e texto dos lados. */
export function LotFamiliesDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultLotFamilyIdOf(p.settings);
  const [list, setList] = useState<LotFamily[]>(() => lotFamiliesOf(p.settings));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<LotFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: LotFamily = { ...draft, id: uid('lotfam'), name: `${draft.name} ${t('ui_fam_copy')}` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (list.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next[0]!.id);
  };
  const apply = (): void => {
    editor.store.transaction(t('ui_fam_undo_lot'), () => {
      for (const f of list) editor.store.exec({ type: 'upsertLotFamily', family: f });
      const gone = lotFamiliesOf(p.settings).filter((o) => !list.some((x) => x.id === o.id));
      for (const g of gone) editor.store.exec({ type: 'removeLotFamily', id: g.id });
      editor.store.exec({ type: 'setSettings', patch: { defaultLotFamilyId: draft.id } });
    });
  };
  return (
    <FamilyTypeDialog
      title={t('ui_fam_title_lot')}
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family={t('ui_fam_family_lot')}
      types={list}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'lf-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: list.length <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <FamilyRow label={t('ui_fam_line_style')} htmlFor="lf-style">
        <select id="lf-style" className="select" value={draft.lineStyle} onChange={(e) => patch({ lineStyle: e.target.value as LotFamily['lineStyle'] })}>
          <option value="dashed">{t('ui_fam_line_dashed')}</option>
          <option value="solid">{t('ui_fam_line_solid')}</option>
          <option value="dash-dot">{t('ui_fam_line_dashdot')}</option>
        </select>
      </FamilyRow>
      <FamilyRow label={t('ui_fam_line_weight')} htmlFor="lf-weight"><NumField id="lf-weight" value={draft.lineWeight} decimals={1} min={0.5} onCommit={(v) => patch({ lineWeight: v })} /></FamilyRow>
      <FamilyRow label={t('ui_fam_line_color')} htmlFor="lf-lcolor">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input id="lf-lcolor" type="color" value={draft.lineColor ?? '#ff0000'} onChange={(e) => patch({ lineColor: e.target.value })} />
          <button type="button" className="btn small" onClick={() => patch({ lineColor: undefined })}>{t('ui_fam_color_theme')}</button>
        </div>
      </FamilyRow>
      <TextoFields pre="lf" value={draft} color={draft.textColor} onColor={(c) => patch({ textColor: c })} patch={patch} />
      <FamilyCheck id="lf-paper" checked={draft.showPaper} onChange={(v) => patch({ showPaper: v })}>{t('ui_fam_show_paper')}</FamilyCheck>
      <FamilyCheck id="lf-len" checked={draft.showLength} onChange={(v) => patch({ showLength: v })}>{t('ui_fam_show_length')}</FamilyCheck>
    </FamilyTypeDialog>
  );
}
