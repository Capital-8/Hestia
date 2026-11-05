import { useRef, useState, type ReactElement } from 'react';
import { areaPlansOf, formatQuantity, projectSheets, projectView3DPoints, view3DPointOf, view3DPointsUsage, type Element, type SectionView, type SheetViewSource, type View3DPoint } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { fmtNum, t, useI18n, useT } from '../../editor/i18n.ts';
import { duplicateSheetCommand, addSheetAction } from '../../editor/sheetActions.ts';
import { moveSheetCommand } from '../../editor/sheetNumbering.ts';
import { beginSheetDrag, endSheetDrag, SHEET_VIEW_MIME } from '../../editor/sheetDrag.ts';
import { createAreaPlansForLevels, openAreaPlan } from '../../editor/areaPlanActions.ts';
import { useUi, type DialogKind } from '../../editor/state.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { atualizarPonto3DAction, excluirPonto3DAction, irParaPonto3DAction, renomearPonto3DAction, salvarPonto3DAction } from '../../editor/view3dPointActions.ts';
import { Node, type DragData, type MenuItem } from './Tree.tsx';
import { useUnits } from '../useUnits.ts';

/** Seções "Vistas (todas)", "Tabelas/Quantidades (todas)" e "Pranchas (todas)" do navegador, no padrão Revit. */

const say = (status: string): void => useUi.setState({ status });

/** Torna o nó arrastável para a prancha aberta (Revit: arrastar a vista do navegador para o *Sheet*). */
const dragView = (view: SheetViewSource, label: string): DragData => ({
  type: SHEET_VIEW_MIME,
  value: JSON.stringify(view),
  label,
  onStart: () => beginSheetDrag({ view, label }),
  onEnd: endSheetDrag,
});

/** Corte ou elevação: duplo clique abre; botão direito oferece abrir, renomear e excluir. */
function SectionNode({ view }: { view: SectionView }): ReactElement {
  const { t } = useT();
  const active = useUi((s) => s.view === 'section' && s.sectionId === view.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(view.name);
  // Enter, Esc e a perda de foco podem disparar em sequência; só o primeiro encerra a edição.
  const editingRef = useRef(false);
  const open = (): void => activateView({ kind: 'section', viewId: view.id });
  const start = (): void => {
    editingRef.current = true;
    setDraft(view.name);
    setEditing(true);
  };
  const finish = (save: boolean): void => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (save && draft.trim() !== view.name) editor.renameView(view.id, draft);
  };
  const label = editing ? (
    <input
      className="input view-rename"
      aria-label={t('cvn_br_rename_aria', { name: view.name })}
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  ) : view.name;
  const menu: MenuItem[] = [
    { label: t('btn_open'), run: open },
    { label: t('cvn_br_rename'), run: start },
    { label: t('cvn_br_delete'), run: () => editor.deleteView(view.id), danger: true, sep: true },
  ];
  const dragLabel = view.kind === 'elevation' ? t('cvn_br_drag_elevation', { name: view.name }) : t('cvn_br_drag_section', { name: view.name });
  return <Node id={`view:${view.id}`} label={label} icon={view.kind === 'section' ? 'section' : 'elevation'} bold={active} title={t('cvn_br_view_title')} onOpen={open} menu={menu} drag={dragView({ kind: 'section', sectionId: view.id }, dragLabel)} />;
}

/** Mostra na barra de status o resultado (ou a recusa) de uma ação de ponto de vista 3D. */
function ponto3DAction(run: () => string | null, ok: string): void {
  const erro = run();
  say(erro ?? ok);
}

/**
 * Ponto de vista 3D salvo (catálogo de câmeras): duplo clique leva o 3D à câmera do ponto; arraste para a prancha;
 * botão direito atualiza com a câmera atual, renomeia (no lugar, como os cortes) ou exclui.
 * Exportado para o teste de marcação (não usa o projeto global: recebe o ponto por propriedade).
 */
export function View3DPointNode({ point, pranchas }: { point: View3DPoint; pranchas: number }): ReactElement {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(point.name);
  // Enter, Esc e a perda de foco podem disparar em sequência; só o primeiro encerra a edição.
  const editingRef = useRef(false);
  const irPara = (): void => ponto3DAction(() => irParaPonto3DAction(point.id), t('cvn_br_status_go3d', { name: point.name }));
  const start = (): void => {
    editingRef.current = true;
    setDraft(point.name);
    setEditing(true);
  };
  const finish = (save: boolean): void => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (save && draft.trim() !== point.name) ponto3DAction(() => renomearPonto3DAction(editor.store, point.id, draft), t('cvn_br_status_renamed', { name: draft.trim() }));
  };
  const label = editing ? (
    <input
      className="input view-rename"
      aria-label={t('cvn_br_rename_aria', { name: point.name })}
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  ) : point.name;
  const menu: MenuItem[] = [
    { label: t('cvn_br_go_3d'), run: irPara, hint: t('cvn_br_go_3d_hint') },
    { label: t('cvn_br_update_camera'), run: () => ponto3DAction(() => atualizarPonto3DAction(editor.store, point.id), t('cvn_br_status_camera', { name: point.name })), hint: t('cvn_br_update_camera_hint') },
    { label: t('cvn_br_rename_viewpoint'), run: start },
    {
      label: t('cvn_br_delete'),
      run: () => ponto3DAction(() => excluirPonto3DAction(editor.store, point.id), t('cvn_br_status_deleted')),
      danger: true,
      sep: true,
      hint: pranchas
        ? pranchas === 1
          ? t('cvn_br_used_in_sheets_one', { n: fmtNum(pranchas, 0, lang) })
          : t('cvn_br_used_in_sheets_many', { n: fmtNum(pranchas, 0, lang) })
        : t('cvn_br_not_used'),
    },
  ];
  return (
    <Node
      id={`v3d:${point.id}`}
      label={label}
      icon="cube"
      title={t('cvn_br_point_title')}
      onOpen={irPara}
      menu={menu}
      drag={dragView({ kind: '3d', pointId: point.id }, t('cvn_br_drag_3d', { name: point.name }))}
    />
  );
}

export function ViewsTree(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const units = useUnits();
  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  const planKind = useUi((s) => s.planKind);
  const areaPlanId = useUi((s) => s.areaPlanId);
  const areaPlans = areaPlansOf(p);
  const sections = p.views.filter((v) => v.kind === 'section');
  const elevations = p.views.filter((v) => v.kind === 'elevation');
  const pontos3D = projectView3DPoints(p);
  const genMenu: MenuItem[] = [{ label: t('cvn_br_generate_elevations'), run: () => editor.generateElevations(), hint: t('cvn_br_generate_elevations_hint') }];
  /** Salva a câmera da vista 3D viva como ponto novo; o nome padrão (Vista 3D, Vista 3D 2…) renomeia-se no menu do ponto. */
  const salvarVista3D = (): void => {
    const r = salvarPonto3DAction(editor.store);
    if ('erro' in r) return say(r.erro);
    say(t('cvn_br_status_saved', { name: view3DPointOf(editor.project, r.id)?.name ?? t('cvn_br_default_3d_name') }));
  };
  return (
    <Node id="g:views" label={t('views_all')} icon="levels" group open>
      <Node id="g:plans" label={t('cvn_br_floor_plans_node')} group open menu={[{ label: t('cvn_br_levels'), run: () => useUi.setState({ dialog: 'levels' }) }]}>
        {p.levels.map((l) => (
          <Node
            key={l.id}
            id={`plan:${l.id}`}
            label={l.name}
            icon="plan"
            bold={view === 'plan' && planKind === 'floor' && levelId === l.id}
            title={t('cvn_br_plan_level_title', { value: formatQuantity(units, 'length', l.elevation) })}
            onOpen={() => activateView({ kind: 'plan', levelId: l.id })}
            drag={dragView({ kind: 'plan', levelId: l.id }, t('cvn_br_drag_plan', { name: l.name }))}
            menu={[{ label: t('btn_open'), run: () => activateView({ kind: 'plan', levelId: l.id }) }, { label: t('cvn_br_levels'), run: () => useUi.setState({ dialog: 'levels' }), sep: true }]}
          />
        ))}
      </Node>
      {/* Cobertura: a planta do nível com o telhado completo e opaco (ver `roofPlanMode`); mesmos níveis do projeto. */}
      <Node id="g:roofs" label={t('cvn_br_roof_plans_node')} group open menu={[{ label: t('cvn_br_levels'), run: () => useUi.setState({ dialog: 'levels' }) }]}>
        {p.levels.map((l) => (
          <Node
            key={`roof:${l.id}`}
            id={`roof:${l.id}`}
            label={l.name}
            icon="roof"
            bold={view === 'plan' && planKind === 'roof' && levelId === l.id}
            title={t('cvn_br_roof_plan_title', { level: l.name })}
            onOpen={() => activateView({ kind: 'plan', levelId: l.id, planKind: 'roof' })}
            menu={[{ label: t('btn_open'), run: () => activateView({ kind: 'plan', levelId: l.id, planKind: 'roof' }) }, { label: t('cvn_br_levels'), run: () => useUi.setState({ dialog: 'levels' }), sep: true }]}
          />
        ))}
      </Node>
      <Node id="g:ceilings" label={t('cvn_br_ceiling_plans_node')} group empty={t('cvn_br_ceiling_empty')} />
      <Node
        id="g:area"
        label={t('cvn_br_area_plans_node')}
        icon="plan"
        group
        open
        menu={[
          {
            label: t('cvn_br_create_all_levels'),
            run: () => {
              const ids = createAreaPlansForLevels(editor.store, p.levels.map((l) => l.id), { scale: 50 });
              if (ids[0]) openAreaPlan(editor.store, ids[0]);
              say(ids.length
                ? ids.length === 1
                  ? t('cvn_br_status_area_created_one', { n: fmtNum(ids.length, 0, lang) })
                  : t('cvn_br_status_area_created_many', { n: fmtNum(ids.length, 0, lang) })
                : t('cvn_br_status_area_all'));
            },
          },
        ]}
        empty={t('cvn_br_area_empty')}
      >
        {areaPlans.map((ap) => (
          <Node
            key={ap.id}
            id={`area:${ap.id}`}
            label={ap.name}
            icon="plan"
            bold={view === 'plan' && planKind === 'area' && areaPlanId === ap.id}
            title={t('cvn_br_area_plan_title')}
            onOpen={() => activateView({ kind: 'plan', levelId: ap.levelId, planKind: 'area', areaPlanId: ap.id })}
            drag={dragView({ kind: 'areaPlan', planId: ap.id }, t('cvn_br_drag_area', { name: ap.name }))}
            menu={[
              { label: t('btn_open'), run: () => activateView({ kind: 'plan', levelId: ap.levelId, planKind: 'area', areaPlanId: ap.id }) },
              { label: t('cvn_br_delete'), run: () => editor.store.exec({ type: 'removeAreaPlan', id: ap.id }, t('cvn_br_undo_delete_area')), danger: true, sep: true },
            ]}
          />
        ))}
      </Node>
      <Node id="g:3d" label={t('cvn_br_3d_views_node')} group open menu={[{ label: t('cvn_br_save_view'), run: salvarVista3D, hint: t('cvn_br_save_view_hint') }]}>
        <Node id="v:3d" label={t('cvn_br_3d_model')} icon="cube" bold={view === '3d'} onOpen={() => activateView({ kind: '3d' })} menu={[{ label: t('btn_open'), run: () => activateView({ kind: '3d' }) }, { label: t('cvn_br_save_view'), run: salvarVista3D, sep: true, hint: t('cvn_br_save_view_hint') }]} drag={dragView({ kind: '3d' }, t('cvn_br_3d_model'))} />
        {pontos3D.map((pt) => <View3DPointNode key={pt.id} point={pt} pranchas={view3DPointsUsage(p, pt.id).length} />)}
      </Node>
      <Node id="g:elev" label={t('cvn_br_elevations_node')} group menu={genMenu} empty={t('cvn_br_elevations_empty')}>
        {elevations.length ? elevations.map((v) => <SectionNode key={v.id} view={v} />) : undefined}
      </Node>
      <Node id="g:sections" label={t('cvn_br_sections_node')} group empty={t('cvn_br_sections_empty')}>
        {sections.length ? sections.map((v) => <SectionNode key={v.id} view={v} />) : undefined}
      </Node>
      <Node id="g:draft" label={t('cvn_br_drafting_node')} group empty={t('cvn_br_not_available')} />
      <Node id="g:legends" label={t('cvn_br_legends_node')} group empty={t('cvn_br_not_available')} />
    </Node>
  );
}

/** Tabelas do projeto: o duplo clique abre o diálogo (as colunas e a exportação CSV ficam nele). */
export function SchedulesTree(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const count = (...kinds: Array<Element['kind']>): number => Object.values(p.elements).filter((e) => kinds.includes(e.kind)).length;
  const rows: Array<{ label: string; dialog: DialogKind; n: number }> = [
    { label: t('cvn_br_sched_rooms'), dialog: 'roomSchedule', n: count('room') },
    { label: t('cvn_br_sched_stairs'), dialog: 'stairSchedule', n: count('stair') },
    { label: t('cvn_br_sched_ramps'), dialog: 'rampSchedule', n: count('ramp') },
    { label: t('cvn_br_sched_ceilings'), dialog: 'ceilingSchedule', n: count('ceiling') },
    { label: t('cvn_br_sched_slabs'), dialog: 'slabSchedule', n: count('slab') },
    { label: t('cvn_br_sched_walls'), dialog: 'schedule', n: count('wall') },
    { label: t('cvn_br_sched_floors'), dialog: 'floorSchedule', n: count('floor') },
    { label: t('cvn_br_sched_openings'), dialog: 'openingSchedule', n: count('door', 'window') },
    { label: t('cvn_br_sched_roofs'), dialog: 'roofSchedule', n: count('roof') },
  ];
  return (
    <Node id="g:schedules" label={t('cvn_br_schedules_node')} icon="schedule" group>
      {rows.map((r) => {
        const open = (): void => useUi.setState({ dialog: r.dialog, dialogArg: null });
        const title = r.n === 1
          ? t('cvn_br_sched_count_one', { n: fmtNum(r.n, 0, lang) })
          : t('cvn_br_sched_count_many', { n: fmtNum(r.n, 0, lang) });
        return <Node key={r.dialog} id={`sch:${r.dialog}`} label={r.label} icon="schedule" title={title} onOpen={open} menu={[{ label: t('btn_open'), run: open }]} />;
      })}
    </Node>
  );
}

const openSheet = (id: string): void => activateView({ kind: 'sheet', sheetId: id });

/** Executa uma ação de prancha e mostra o resultado (ou o motivo da recusa) na barra de status. */
function sheetAction(run: () => void, ok: string): void {
  try {
    run();
    say(ok);
  } catch (e) {
    say(e instanceof Error ? e.message : t(useI18n.getState().lang, 'cvn_vp_operation_refused'));
  }
}

export function SheetsTree(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const view = useUi((s) => s.view);
  const sheetId = useUi((s) => s.sheetId);
  const sheets = projectSheets(p);
  /** Troca a prancha com a vizinha; no limite, avisa na barra de status. */
  const move = (id: string, delta: -1 | 1): void => {
    const cmd = moveSheetCommand(p, id, delta);
    if (!cmd) return say(delta < 0 ? t('cvn_br_sheet_first') : t('cvn_br_sheet_last'));
    sheetAction(() => editor.store.exec(cmd, delta < 0 ? t('cvn_br_undo_sheet_up') : t('cvn_br_undo_sheet_down')), delta < 0 ? t('cvn_br_sheet_moved_up') : t('cvn_br_sheet_moved_down'));
  };
  return (
    <Node
      id="g:sheets"
      label={t('cvn_br_sheets_node')}
      icon="sheet"
      group
      open
      empty={t('cvn_br_sheets_empty')}
      menu={[
        { label: t('cvn_br_new_sheet'), run: () => sheetAction(() => openSheet(addSheetAction(editor.store)), t('cvn_br_sheet_created')) },
        { label: t('cvn_br_renumber_sheets'), disabled: sheets.length === 0, run: () => useUi.setState({ dialog: 'renumberSheets', dialogArg: null }) },
      ]}
    >
      {sheets.length
        ? sheets.map((sh, i) => (
            <Node
              key={sh.id}
              id={`sheet:${sh.id}`}
              label={`${sh.number} - ${sh.name}`}
              icon="sheet"
              bold={view === 'sheet' && sheetId === sh.id}
              title={t('cvn_br_sheet_title', { size: sh.size, disc: sh.discipline ? ` · ${sh.discipline}` : '' })}
              onOpen={() => openSheet(sh.id)}
              menu={[
                { label: t('btn_open'), run: () => openSheet(sh.id) },
                { label: t('cvn_br_sheet_props'), run: () => useUi.setState({ dialog: 'sheet', dialogArg: sh.id }) },
                { label: t('cvn_br_move_up'), disabled: i === 0, run: () => move(sh.id, -1), sep: true },
                { label: t('cvn_br_move_down'), disabled: i === sheets.length - 1, run: () => move(sh.id, 1) },
                { label: t('cvn_br_issue_revision'), run: () => useUi.setState({ dialog: 'revision', dialogArg: sh.id }) },
                { label: t('cvn_br_duplicate'), sep: true, run: () => sheetAction(() => { const c = duplicateSheetCommand(p, sh.id); if (c) editor.store.exec(c, t('cvn_br_undo_duplicate_sheet')); }, t('cvn_br_sheet_duplicated')) },
                { label: t('cvn_br_delete'), danger: true, run: () => sheetAction(() => editor.store.exec({ type: 'removeSheet', id: sh.id }, t('cvn_br_undo_delete_sheet')), t('cvn_br_sheet_deleted')) },
              ]}
            />
          ))
        : undefined}
    </Node>
  );
}
