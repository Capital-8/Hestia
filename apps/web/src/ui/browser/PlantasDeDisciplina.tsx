import { useRef, useState, type ReactElement } from 'react';
import { disciplineLabel, DISCIPLINES, formatQuantity, type Discipline, type Id, type Level, type PlanView } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { pedirConfirmacao } from '../../editor/confirmacaoPrompt.ts';
import { t, useT, type Lang } from '../../editor/i18n.ts';
import { criarPlantaDeDisciplina, duplicarPlanta, excluirPlanta, renomearPlanta } from '../../editor/planViewActions.ts';
import { beginSheetDrag, endSheetDrag, SHEET_VIEW_MIME } from '../../editor/sheetDrag.ts';
import { useUi } from '../../editor/state.ts';
import { activateView } from '../../editor/viewTabActions.ts';
import { planKey, viewKey } from '../../editor/viewIdentity.ts';
import { useUnits } from '../useUnits.ts';
import { Node, type DragData, type MenuItem } from './Tree.tsx';

/**
 * Plantas de disciplina sob cada nível no navegador (decisão 0060, etapa 4.1): listagem, destaque e os menus de
 * criar/duplicar/renomear/excluir. Toda escrita passa por `planViewActions` (um passo de desfazer cada).
 */

/** Tornar a planta arrastável para a prancha; a planta de disciplina vai com o `planId` da prancha. */
const arrastarVista = (view: { kind: 'plan'; levelId: Id; planId?: Id }, label: string): DragData => ({
  type: SHEET_VIEW_MIME,
  value: JSON.stringify(view),
  label,
  onStart: () => beginSheetDrag({ view, label }),
  onEnd: endSheetDrag,
});

/** Campos da vista ativa que decidem o destaque no navegador. */
export interface CamposDaVistaAtiva {
  view: string;
  planKind?: string;
  levelId: Id;
  planViewId?: Id | null;
}

/** A planta padrão do nível está ativa? Cobertura e área são outras vistas e não contam como a padrão. */
export function plantaPadraoAtiva(v: CamposDaVistaAtiva, levelId: Id): boolean {
  return v.view === 'plan' && (v.planKind ?? 'floor') === 'floor' && v.levelId === levelId && (v.planViewId ?? null) === null;
}

/** A planta de disciplina está ativa? Só na planta de piso do próprio nível. */
export function plantaDeDisciplinaAtiva(v: CamposDaVistaAtiva, plan: PlanView): boolean {
  return v.view === 'plan' && (v.planKind ?? 'floor') === 'floor' && v.levelId === plan.levelId && v.planViewId === plan.id;
}

/** Ícone de cada disciplina no navegador (o rótulo vem de `disciplineLabel`, traduzido nos sete idiomas). */
const ICONE_DA_DISCIPLINA: Record<Discipline, string> = {
  arquitetura: 'plan',
  estrutura: 'column',
  hidrossanitario: 'componentRun',
  eletrico: 'connection',
  hvac: 'shaft',
};

/**
 * Menu de um nível no navegador: abrir a planta padrão, "Nova planta de disciplina" (submenu das cinco disciplinas)
 * e os níveis. A criação passa por `planViewActions`, que grava um passo de desfazer e abre a planta nova.
 */
export function menuDoNivel(levelId: Id, lang: Lang): MenuItem[] {
  return [
    { label: t(lang, 'btn_open'), run: () => activateView({ kind: 'plan', levelId }) },
    {
      label: t(lang, 'cvn_br_new_discipline_plan'),
      submenu: DISCIPLINES.map((discipline) => ({
        label: disciplineLabel(lang, discipline),
        run: () => criarPlantaDeDisciplina(editor.store, levelId, discipline),
      })),
    },
    { label: t(lang, 'cvn_br_levels'), run: () => useUi.setState({ dialog: 'levels' }), sep: true },
    { label: t(lang, 'dsc_title'), run: () => useUi.setState({ dialog: 'disciplineConfig' }) },
  ];
}

/**
 * Exclui a planta só depois da confirmação do app (o mesmo diálogo de `pedirConfirmacao`). Devolve true quando
 * excluiu; cancelar não muda nada.
 */
export function excluirPlantaComConfirmacao(planId: Id, name: string, lang: Lang): Promise<boolean> {
  return pedirConfirmacao(t(lang, 'cvn_br_confirm_delete_discipline_plan', { name })).then((ok) => (ok ? excluirPlanta(editor.store, planId) : false));
}

/**
 * Menu de uma planta de disciplina: abrir, duplicar (com e sem as anotações), renomear (o pai liga a edição no lugar)
 * e excluir com confirmação. Tudo pelas ações de `planViewActions`.
 */
export function menuDaPlantaDeDisciplina(plan: PlanView, lang: Lang, onRename: () => void): MenuItem[] {
  return [
    { label: t(lang, 'btn_open'), run: () => activateView({ kind: 'plan', levelId: plan.levelId, planViewId: plan.id }) },
    { label: t(lang, 'cvn_br_duplicate'), run: () => { duplicarPlanta(editor.store, plan.id); } },
    { label: t(lang, 'cvn_br_duplicate_with_annotations'), run: () => { duplicarPlanta(editor.store, plan.id, { withAnnotations: true }); } },
    { label: t(lang, 'cvn_br_rename'), run: onRename },
    { label: t(lang, 'cvn_br_delete'), run: () => { void excluirPlantaComConfirmacao(plan.id, plan.name, lang); }, danger: true, sep: true },
    { label: t(lang, 'dsc_title'), run: () => useUi.setState({ dialog: 'disciplineConfig' }) },
  ];
}

/** Grava o nome editado da planta; o comando garante o nome único no nível (sufixo numérico quando ocupado). */
export function finalizarRenomeDaPlanta(planId: Id, name: string): string | null {
  return renomearPlanta(editor.store, planId, name);
}

/** Nó de uma planta de disciplina: ativa no duplo clique, renomeia no lugar (como cortes e pontos 3D). */
function PlantaDeDisciplinaNode({ plan }: { plan: PlanView }): ReactElement {
  const { t, lang } = useT();
  const view = useUi((s) => s.view);
  const planKind = useUi((s) => s.planKind);
  const levelId = useUi((s) => s.levelId);
  const planViewId = useUi((s) => s.planViewId);
  const active = plantaDeDisciplinaAtiva({ view, planKind, levelId, planViewId }, plan);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan.name);
  // Enter, Esc e a perda de foco podem disparar em sequência; só o primeiro encerra a edição.
  const editingRef = useRef(false);
  const open = (): void => activateView({ kind: 'plan', levelId: plan.levelId, planViewId: plan.id });
  const start = (): void => {
    editingRef.current = true;
    setDraft(plan.name);
    setEditing(true);
  };
  const finish = (save: boolean): void => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (save && draft.trim() !== plan.name) finalizarRenomeDaPlanta(plan.id, draft);
  };
  const label = editing ? (
    <input
      className="input view-rename"
      aria-label={t('cvn_br_rename_aria', { name: plan.name })}
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
  ) : plan.name;
  return (
    <Node
      id={viewKey({ kind: 'plan', levelId: plan.levelId, planViewId: plan.id })}
      label={label}
      icon={ICONE_DA_DISCIPLINA[plan.discipline]}
      bold={active}
      title={t('cvn_br_discipline_plan_title', { discipline: disciplineLabel(lang, plan.discipline) })}
      onOpen={open}
      drag={arrastarVista({ kind: 'plan', levelId: plan.levelId, planId: plan.id }, t('cvn_br_drag_discipline_plan', { name: plan.name }))}
      menu={menuDaPlantaDeDisciplina(plan, lang, start)}
    />
  );
}

/** Plantas adicionais agrupadas pela disciplina, na ordem em que aparecem no projeto. */
function agruparPorDisciplina(plans: readonly PlanView[]): Array<[Discipline, PlanView[]]> {
  const grupos = new Map<Discipline, PlanView[]>();
  for (const plan of plans) {
    const lista = grupos.get(plan.discipline);
    if (lista) lista.push(plan);
    else grupos.set(plan.discipline, [plan]);
  }
  return [...grupos.entries()];
}

/**
 * Nível na árvore de plantas de piso. Sem plantas de disciplina, é exatamente o nó de sempre (a planta padrão). Com
 * elas, o nível vira um grupo: a planta padrão e as adicionais; havendo mais de uma adicional, elas ficam agrupadas
 * pela disciplina (ícone e rótulo traduzido).
 */
export function NivelDePlantas({ level, plans }: { level: Level; plans: readonly PlanView[] }): ReactElement {
  const { t, lang } = useT();
  const units = useUnits();
  const view = useUi((s) => s.view);
  const planKind = useUi((s) => s.planKind);
  const levelId = useUi((s) => s.levelId);
  const planViewId = useUi((s) => s.planViewId);
  const activeDefault = plantaPadraoAtiva({ view, planKind, levelId, planViewId }, level.id);
  const title = t('cvn_br_plan_level_title', { value: formatQuantity(units, 'length', level.elevation) });
  const openDefault = (): void => activateView({ kind: 'plan', levelId: level.id });
  const padrao = (
    <Node
      id={planKey(level.id)}
      label={plans.length ? t('cvn_br_default_plan') : level.name}
      icon="plan"
      bold={activeDefault}
      title={title}
      onOpen={openDefault}
      drag={arrastarVista({ kind: 'plan', levelId: level.id }, t('cvn_br_drag_plan', { name: level.name }))}
      menu={menuDoNivel(level.id, lang)}
    />
  );
  if (plans.length === 0) return padrao;
  return (
    <Node
      id={`g:nivel:${level.id}`}
      label={level.name}
      icon="plan"
      group
      open
      bold={activeDefault}
      title={title}
      onOpen={openDefault}
      menu={menuDoNivel(level.id, lang)}
    >
      {padrao}
      {plans.length === 1 ? (
        <PlantaDeDisciplinaNode plan={plans[0]!} />
      ) : (
        agruparPorDisciplina(plans).map(([discipline, lista]) => (
          <Node key={discipline} id={`g:disc:${level.id}:${discipline}`} label={disciplineLabel(lang, discipline)} icon={ICONE_DA_DISCIPLINA[discipline]} group open>
            {lista.map((plan) => <PlantaDeDisciplinaNode key={plan.id} plan={plan} />)}
          </Node>
        ))
      )}
    </Node>
  );
}
