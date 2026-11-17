import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';
import { beamTypeMap, columnTypeMap, footingTypeMap, type Id, type Project, type ProjectStore } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import {
  compatibleTypes,
  duplicateFloorType,
  floorTypeDeleteBlock,
  instancesOfType,
  renameFloorType,
  replaceStatus,
  replaceType,
  selectAllPlan,
  tryDeleteFloorType,
  tryDeleteWallType,
  wallTypeDeleteBlock,
  whereUsed,
  type DeleteResult,
  type TypeKind,
} from '../editor/typeActions.ts';
import { duplicateSlabType, renameSlabType, slabTypeDeleteBlock, tryDeleteSlabType } from '../editor/slabTypeActions.ts';
import { duplicateCeilingType, renameCeilingType, ceilingTypeDeleteBlock, tryDeleteCeilingType } from '../editor/ceilingTypeActions.ts';
import { duplicateRoofType, renameRoofType, roofTypeDeleteBlock, tryDeleteRoofType } from '../editor/roofTypeActions.ts';
import { duplicateStairType, renameStairType, stairTypeDeleteBlock, tryDeleteStairType } from '../editor/stairTypeActions.ts';
import { duplicateRampType, rampTypeDeleteBlock, renameRampType, tryDeleteRampType } from '../editor/rampTypeActions.ts';
import {
  beamTypeDeleteBlock, columnTypeDeleteBlock, duplicateBeamType, duplicateColumnType, duplicateFootingType,
  footingTypeDeleteBlock, renameBeamType, renameColumnType, renameFootingType, tryDeleteBeamType, tryDeleteColumnType,
  tryDeleteFootingType,
} from '../editor/structuralTypeActions.ts';
import { Node, type MenuItem } from './browser/Tree.tsx';

interface TypeRowProps {
  kind: TypeKind;
  typeId: Id;
  name: string;
  icon: string;
  /** Tipo escolhido para desenhar (em negrito). */
  active: boolean;
  onUse: () => void;
  onEdit: () => void;
}

interface TypeCrud {
  deleteBlock: (p: Project, id: Id) => string | null;
  remove: (s: ProjectStore, id: Id) => DeleteResult;
  duplicate?: (s: ProjectStore, id: Id) => Id | null;
  rename?: (s: ProjectStore, id: Id, name: string) => DeleteResult;
  resetActive?: (p: Project, id: Id) => void;
}

const resetOpt = (key: 'floorTypeId' | 'slabTypeId' | 'ceilingTypeId' | 'roofTypeId' | 'columnTypeId' | 'beamTypeId' | 'footingTypeId', firstId: (p: Project) => Id | undefined) => (p: Project, deletedId: Id): void => {
  const ui = useUi.getState();
  if (ui.options[key] === deletedId) useUi.setState({ options: { ...ui.options, [key]: firstId(p) ?? ui.options[key] } });
};

const CRUD: Partial<Record<TypeKind, TypeCrud>> = {
  wall: { deleteBlock: wallTypeDeleteBlock, remove: tryDeleteWallType, resetActive: (p, id) => { const ui = useUi.getState(); if (ui.options.wallTypeId === id) useUi.setState({ options: { ...ui.options, wallTypeId: p.defaults.wallTypeId } }); } },
  floor: { deleteBlock: floorTypeDeleteBlock, remove: tryDeleteFloorType, duplicate: duplicateFloorType, rename: renameFloorType, resetActive: resetOpt('floorTypeId', (p) => Object.keys(p.floorTypes)[0]) },
  slab: { deleteBlock: slabTypeDeleteBlock, remove: tryDeleteSlabType, duplicate: duplicateSlabType, rename: renameSlabType, resetActive: resetOpt('slabTypeId', (p) => Object.keys(p.slabTypes)[0]) },
  ceiling: { deleteBlock: ceilingTypeDeleteBlock, remove: tryDeleteCeilingType, duplicate: duplicateCeilingType, rename: renameCeilingType, resetActive: resetOpt('ceilingTypeId', (p) => Object.keys(p.ceilingTypes)[0]) },
  roof: { deleteBlock: roofTypeDeleteBlock, remove: tryDeleteRoofType, duplicate: duplicateRoofType, rename: renameRoofType, resetActive: resetOpt('roofTypeId', (p) => Object.keys(p.roofTypes)[0]) },
  stair: { deleteBlock: stairTypeDeleteBlock, remove: tryDeleteStairType, duplicate: duplicateStairType, rename: renameStairType, resetActive: (p, id) => { const ui = useUi.getState(); if (ui.options.stair?.typeId === id) useUi.setState({ options: { ...ui.options, stair: { ...ui.options.stair, typeId: Object.keys(p.stairTypes)[0] } } }); } },
  ramp: { deleteBlock: rampTypeDeleteBlock, remove: tryDeleteRampType, duplicate: duplicateRampType, rename: renameRampType, resetActive: (p, id) => { const ui = useUi.getState(); if (ui.options.ramp?.typeId === id) useUi.setState({ options: { ...ui.options, ramp: { ...ui.options.ramp, typeId: Object.keys(p.rampTypes)[0] } } }); } },
  column: { deleteBlock: columnTypeDeleteBlock, remove: tryDeleteColumnType, duplicate: duplicateColumnType, rename: renameColumnType, resetActive: resetOpt('columnTypeId', (p) => Object.keys(columnTypeMap(p))[0]) },
  beam: { deleteBlock: beamTypeDeleteBlock, remove: tryDeleteBeamType, duplicate: duplicateBeamType, rename: renameBeamType, resetActive: resetOpt('beamTypeId', (p) => Object.keys(beamTypeMap(p))[0]) },
  footing: { deleteBlock: footingTypeDeleteBlock, remove: tryDeleteFootingType, duplicate: duplicateFootingType, rename: renameFootingType, resetActive: resetOpt('footingTypeId', (p) => Object.keys(footingTypeMap(p))[0]) },
};

/**
 * Tipo na árvore do navegador (Famílias ▸ Categoria ▸ Família ▸ Tipo). Clique usa o tipo ao desenhar (negrito), duplo
 * clique edita o tipo e o botão direito abre o menu: onde é usado, selecionar instâncias, substituir, duplicar, renomear, excluir.
 */
export function TypeRow({ kind, typeId, name, icon, active, onUse, onEdit }: TypeRowProps): ReactElement {
  const { t } = useT();
  const p = useProject();
  const panelId = useId();
  const errText = (e: unknown): string => (e instanceof Error ? e.message : t('prc_err_unknown'));
  const [replacing, setReplacing] = useState(false);
  const [target, setTarget] = useState<Id>('');
  /** Depois de substituir, pergunta se o tipo antigo (que ficou sem uso) deve ser excluído. */
  const [askDelete, setAskDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const crud = CRUD[kind];
  const uses = instancesOfType(p, kind, typeId).length;
  const choices = compatibleTypes(p, kind, typeId);
  const chosen = choices.some((c) => c.id === target) ? target : (choices[0]?.id ?? '');
  const deletable = Boolean(crud);
  const renamable = Boolean(crud?.rename && crud?.duplicate);
  const deleteBlock = crud ? crud.deleteBlock(p, typeId) : null;
  const replaceBlock = choices.length === 0 ? t('prc_msg_no_compatible_type') : uses === 0 ? t('prc_msg_type_has_no_instances') : null;

  const selectAll = (): void => {
    const plan = selectAllPlan(editor.project, kind, typeId, useUi.getState().levelId, name);
    useUi.setState({ selection: plan.ids, status: plan.status });
  };
  const showWhereUsed = (): void => {
    useUi.setState({ status: whereUsed(editor, kind, typeId, name, (ids) => useUi.setState({ selection: ids })) });
  };
  const apply = (): void => {
    const to = choices.find((c) => c.id === chosen);
    if (!to) return;
    try {
      const n = replaceType(editor.store, kind, typeId, to.id);
      useUi.setState({ status: replaceStatus(n, to.name) });
      setReplacing(false);
      setAskDelete(deletable && n > 0 && crud?.deleteBlock(editor.project, typeId) === null);
    } catch (e) {
      useUi.setState({ status: t('prc_msg_replace_failed', { error: errText(e) }) });
    }
  };
  const remove = (): void => {
    if (!crud) return;
    const r = crud.remove(editor.store, typeId);
    if (!r.ok) {
      useUi.setState({ status: t('prc_msg_delete_type_failed', { name, error: r.error }) });
      return;
    }
    crud.resetActive?.(editor.project, typeId);
    setAskDelete(false);
    useUi.setState({ status: t('prc_msg_type_deleted', { name }) });
  };
  const duplicate = (): void => {
    const id = crud?.duplicate?.(editor.store, typeId) ?? null;
    useUi.setState({ status: id ? t('prc_msg_type_duplicated', { name }) : t('prc_msg_duplicate_failed') });
  };
  const applyRename = (): void => {
    if (!crud?.rename) return;
    const r = crud.rename(editor.store, typeId, newName);
    if (!r.ok) {
      useUi.setState({ status: r.error });
      return;
    }
    setRenaming(false);
    useUi.setState({ status: t('prc_msg_type_renamed', { name: newName.trim() }) });
  };
  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); applyRename(); }
    else if (e.key === 'Escape') setRenaming(false);
  };

  const menu: MenuItem[] = [
    { label: t('prc_menu_type_properties'), run: onEdit },
    { label: t('prc_menu_use_for_drawing'), run: onUse },
    { label: t('prc_menu_select_all_instances'), run: selectAll, sep: true },
    { label: t('prc_menu_where_used'), run: showWhereUsed, disabled: uses === 0, hint: uses === 0 ? t('prc_msg_type_has_no_instances') : t('prc_menu_where_used_hint') },
    { label: t('prc_menu_replace_type'), run: () => setReplacing(true), disabled: replaceBlock !== null, hint: replaceBlock ?? undefined },
    ...(renamable ? [{ label: t('prc_menu_duplicate'), run: duplicate, sep: true }, { label: t('prc_menu_rename'), run: () => { setNewName(name); setRenaming(true); } }] : []),
    ...(deletable ? [{ label: t('prc_menu_delete'), run: remove, disabled: deleteBlock !== null, danger: true, sep: !renamable, hint: deleteBlock ? t('prc_menu_delete_blocked', { reason: deleteBlock }) : undefined }] : []),
  ];

  const label = renaming ? (
    <input className="input view-rename" aria-label={t('prc_aria_new_type_name')} value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} onKeyDown={onRenameKey} onBlur={() => setRenaming(false)} onClick={(e) => e.stopPropagation()} />
  ) : name;

  const panels = (
    <>
      {replacing ? (
        <div id={panelId} className="type-replace" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setReplacing(false); } }}>
          <label>
            <span>{t('prc_fld_replace_with')}</span>
            <select className="select" aria-label={t('prc_aria_new_type')} value={chosen} onChange={(e) => setTarget(e.target.value)}>
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="type-replace-btns">
            <button type="button" className="btn small primary" disabled={!chosen} onClick={apply}>{t('prc_btn_apply')}</button>
            <button type="button" className="btn small" onClick={() => setReplacing(false)}>{t('prc_btn_cancel')}</button>
          </div>
        </div>
      ) : null}
      {askDelete ? (
        <div className="type-replace" role="group" aria-label={t('prc_aria_delete_type', { name })}>
          <span>{t('prc_msg_delete_unused_type', { name })}</span>
          <div className="type-replace-btns">
            <button type="button" className="btn small danger" onClick={remove}>{t('prc_btn_delete_type')}</button>
            <button type="button" className="btn small" onClick={() => setAskDelete(false)}>{t('prc_btn_keep')}</button>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <Node
      id={`type:${kind}:${typeId}`}
      label={label}
      icon={icon}
      bold={active}
      title={t('prc_tip_type_row', { name, n: uses, use: t(uses === 1 ? 'prc_use_one' : 'prc_use_many') })}
      onSelect={onUse}
      onOpen={onEdit}
      menu={menu}
      after={panels}
    />
  );
}
