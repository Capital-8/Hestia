import { useRef, useState, type ReactElement } from 'react';
import { areaPlansOf, formatQuantity, projectRenderCameras, projectSheets, projectView3DPoints, view3DPointOf, view3DPointsUsage, type Element, type RenderCamera, type SectionView, type SheetViewSource, type View3DPoint } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { excluirCameraRenderAction, iniciarCapturaRenderAction, renomearCameraRenderAction, selecionarCameraRenderAction, useRenderCameraUi } from '../../editor/renderCameraActions.ts';
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
      aria-label={`Novo nome de ${view.name}`}
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
    { label: 'Abrir', run: open },
    { label: 'Renomear', run: start },
    { label: 'Excluir', run: () => editor.deleteView(view.id), danger: true, sep: true },
  ];
  return <Node id={`view:${view.id}`} label={label} icon={view.kind === 'section' ? 'section' : 'elevation'} bold={active} title="Duplo clique abre a vista; arraste para a prancha; botão direito: renomear, excluir." onOpen={open} menu={menu} drag={dragView({ kind: 'section', sectionId: view.id }, `${view.kind === 'elevation' ? 'Elevação' : 'Corte'} · ${view.name}`)} />;
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(point.name);
  // Enter, Esc e a perda de foco podem disparar em sequência; só o primeiro encerra a edição.
  const editingRef = useRef(false);
  const irPara = (): void => ponto3DAction(() => irParaPonto3DAction(point.id), `Vista 3D: ${point.name}.`);
  const start = (): void => {
    editingRef.current = true;
    setDraft(point.name);
    setEditing(true);
  };
  const finish = (save: boolean): void => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (save && draft.trim() !== point.name) ponto3DAction(() => renomearPonto3DAction(editor.store, point.id, draft), `Ponto de vista renomeado para "${draft.trim()}".`);
  };
  const label = editing ? (
    <input
      className="input view-rename"
      aria-label={`Novo nome de ${point.name}`}
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
    { label: 'Ir para o 3D', run: irPara, hint: 'Abre o Modelo 3D com a câmera salva neste ponto.' },
    { label: 'Atualizar com a câmera atual', run: () => ponto3DAction(() => atualizarPonto3DAction(editor.store, point.id), `Ponto "${point.name}" atualizado com a câmera atual.`), hint: 'Grava a órbita da vista 3D no ponto; as pranchas que o usam acompanham.' },
    { label: 'Renomear…', run: start },
    {
      label: 'Excluir',
      run: () => ponto3DAction(() => excluirPonto3DAction(editor.store, point.id), 'Ponto de vista 3D excluído; as pranchas que o usavam mantêm a câmera.'),
      danger: true,
      sep: true,
      hint: pranchas ? `Usado em ${pranchas} vista${pranchas === 1 ? '' : 's'} de prancha; elas mantêm a câmera.` : 'Nenhuma prancha usa este ponto.',
    },
  ];
  return (
    <Node
      id={`v3d:${point.id}`}
      label={label}
      icon="cube"
      title="Duplo clique leva o 3D a este ponto; arraste para a prancha; botão direito: atualizar, renomear, excluir."
      onOpen={irPara}
      menu={menu}
      drag={dragView({ kind: '3d', pointId: point.id }, `3D · ${point.name}`)}
    />
  );
}

export function ViewsTree(): ReactElement {
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
  const rcams = projectRenderCameras(p);
  const genMenu: MenuItem[] = [{ label: 'Gerar elevações (Norte, Sul, Leste, Oeste)', run: () => editor.generateElevations(), hint: 'Cria as quatro em volta das paredes do nível ativo; substitui as de mesmo nome.' }];
  /** Salva a câmera da vista 3D viva como ponto novo; o nome padrão (Vista 3D, Vista 3D 2…) renomeia-se no menu do ponto. */
  const salvarVista3D = (): void => {
    const r = salvarPonto3DAction(editor.store);
    if ('erro' in r) return say(r.erro);
    say(`Ponto de vista 3D "${view3DPointOf(editor.project, r.id)?.name ?? 'Vista 3D'}" salvo. Botão direito no ponto: renomear.`);
  };
  return (
    <Node id="g:views" label="Vistas (todas)" icon="levels" group open>
      <Node id="g:plans" label="Plantas de piso (Planta de piso)" group open menu={[{ label: 'Níveis…', run: () => useUi.setState({ dialog: 'levels' }) }]}>
        {p.levels.map((l) => (
          <Node
            key={l.id}
            id={`plan:${l.id}`}
            label={l.name}
            icon="plan"
            bold={view === 'plan' && planKind === 'floor' && levelId === l.id}
            title={`Elevação ${formatQuantity(units, 'length', l.elevation)}. Duplo clique abre; arraste para a prancha.`}
            onOpen={() => activateView({ kind: 'plan', levelId: l.id })}
            drag={dragView({ kind: 'plan', levelId: l.id }, `Planta · ${l.name}`)}
            menu={[{ label: 'Abrir', run: () => activateView({ kind: 'plan', levelId: l.id }) }, { label: 'Níveis…', run: () => useUi.setState({ dialog: 'levels' }), sep: true }]}
          />
        ))}
      </Node>
      {/* Cobertura: a planta do nível com o telhado completo e opaco (ver `roofPlanMode`); mesmos níveis do projeto. */}
      <Node id="g:roofs" label="Plantas de cobertura (Planta de cobertura)" group open menu={[{ label: 'Níveis…', run: () => useUi.setState({ dialog: 'levels' }) }]}>
        {p.levels.map((l) => (
          <Node
            key={`roof:${l.id}`}
            id={`roof:${l.id}`}
            label={l.name}
            icon="roof"
            bold={view === 'plan' && planKind === 'roof' && levelId === l.id}
            title={`Planta de cobertura do nível ${l.name}. Duplo clique abre.`}
            onOpen={() => activateView({ kind: 'plan', levelId: l.id, planKind: 'roof' })}
            menu={[{ label: 'Abrir', run: () => activateView({ kind: 'plan', levelId: l.id, planKind: 'roof' }) }, { label: 'Níveis…', run: () => useUi.setState({ dialog: 'levels' }), sep: true }]}
          />
        ))}
      </Node>
      <Node id="g:ceilings" label="Plantas de forro (Planta de forro)" group empty="Ainda não disponível: o forro aparece na planta de piso." />
      <Node
        id="g:area"
        label="Plantas de área (Área)"
        icon="plan"
        group
        open
        menu={[
          { label: 'Criar para todos os níveis', run: () => { const ids = createAreaPlansForLevels(editor.store, p.levels.map((l) => l.id), { scale: 50 }); if (ids[0]) openAreaPlan(editor.store, ids[0]); say(ids.length ? `${ids.length} planta(s) de área criada(s).` : 'Todos os níveis já têm planta de área.'); } },
        ]}
        empty="Nenhuma planta de área. Botão direito: criar para todos os níveis."
      >
        {areaPlans.map((ap) => (
          <Node
            key={ap.id}
            id={`area:${ap.id}`}
            label={ap.name}
            icon="plan"
            bold={view === 'plan' && planKind === 'area' && areaPlanId === ap.id}
            title="Planta de área: linhas de referência, etiquetas e quadro. Duplo clique abre; arraste para a prancha."
            onOpen={() => activateView({ kind: 'plan', levelId: ap.levelId, planKind: 'area', areaPlanId: ap.id })}
            drag={dragView({ kind: 'areaPlan', planId: ap.id }, `Área · ${ap.name}`)}
            menu={[
              { label: 'Abrir', run: () => activateView({ kind: 'plan', levelId: ap.levelId, planKind: 'area', areaPlanId: ap.id }) },
              { label: 'Excluir', run: () => editor.store.exec({ type: 'removeAreaPlan', id: ap.id }, 'Excluir planta de área'), danger: true, sep: true },
            ]}
          />
        ))}
      </Node>
      <Node id="g:3d" label="Vistas 3D (3D View)" group open menu={[{ label: 'Salvar vista atual…', run: salvarVista3D, hint: 'Guarda a câmera da vista 3D aberta como um ponto do catálogo.' }]}>
        <Node id="v:3d" label="Modelo 3D" icon="cube" bold={view === '3d'} onOpen={() => activateView({ kind: '3d' })} menu={[{ label: 'Abrir', run: () => activateView({ kind: '3d' }) }, { label: 'Salvar vista atual…', run: salvarVista3D, sep: true, hint: 'Guarda a câmera da vista 3D aberta como um ponto do catálogo.' }]} drag={dragView({ kind: '3d' }, 'Modelo 3D')} />
        {pontos3D.map((pt) => <View3DPointNode key={pt.id} point={pt} pranchas={view3DPointsUsage(p, pt.id).length} />)}
      </Node>
      <Node
        id="g:rcam"
        label="Câmeras de render"
        icon="cube"
        group
        open
        menu={[{ label: 'Capturar câmera…', run: () => iniciarCapturaRenderAction(editor.store), hint: 'Captura a câmera 3D atual para o render; a moldura mostra a área.' }]}
        empty="Nenhuma câmera de render. Botão direito: Capturar câmera."
      >
        {rcams.length ? rcams.map((c) => <RenderCameraNode key={c.id} camera={c} />) : undefined}
      </Node>
      <Node id="g:elev" label="Elevações (Elevação de edifício)" group menu={genMenu} empty="Nenhuma elevação. Botão direito: Gerar elevações.">
        {elevations.length ? elevations.map((v) => <SectionNode key={v.id} view={v} />) : undefined}
      </Node>
      <Node id="g:sections" label="Cortes (Corte de edifício)" group empty="Nenhum corte. Use a ferramenta Corte na planta.">
        {sections.length ? sections.map((v) => <SectionNode key={v.id} view={v} />) : undefined}
      </Node>
      <Node id="g:draft" label="Vistas de desenho (Detalhe)" group empty="Ainda não disponível." />
      <Node id="g:legends" label="Legendas" group empty="Ainda não disponível." />
    </Node>
  );
}

/**
 * Câmera de render: duplo clique ou "Selecionar" escolhe a câmera para o render (seleção de tela, não do projeto);
 * renomear é no lugar, como os cortes; excluir passa pelo modelo. A linha mostra nome, nível e campo de visão.
 */
function RenderCameraNode({ camera }: { camera: RenderCamera }): ReactElement {
  const selecionada = useRenderCameraUi((s) => s.selecionada === camera.id);
  const nivel = useProject().levels.find((l) => l.id === camera.levelId)?.name ?? 'nível removido';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(camera.name);
  // Enter, Esc e a perda de foco podem disparar em sequência; só o primeiro encerra a edição.
  const editingRef = useRef(false);
  const selecionar = (): void => {
    selecionarCameraRenderAction(editor.store, camera.id);
    say(`Câmera de render "${camera.name}" selecionada para o render.`);
  };
  const start = (): void => {
    editingRef.current = true;
    setDraft(camera.name);
    setEditing(true);
  };
  const finish = (save: boolean): void => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (!save || draft.trim() === camera.name) return;
    const recusa = renomearCameraRenderAction(editor.store, camera.id, draft);
    say(recusa ?? `Câmera de render renomeada para "${draft.trim()}".`);
  };
  const label = editing ? (
    <input
      className="input view-rename"
      aria-label={`Novo nome de ${camera.name}`}
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
  ) : (
    <>
      {selecionada ? '● ' : ''}
      {`${camera.name} · ${nivel} · ${Math.round(camera.fovDeg)}°`}
    </>
  );
  const menu: MenuItem[] = [
    { label: 'Selecionar para o render', run: selecionar, disabled: selecionada },
    { label: 'Renomear…', run: start },
    {
      label: 'Excluir',
      run: () => say(excluirCameraRenderAction(editor.store, camera.id) ?? `Câmera de render "${camera.name}" excluída.`),
      danger: true,
      sep: true,
    },
  ];
  return (
    <Node
      id={`rcam:${camera.id}`}
      label={label}
      icon="cube"
      bold={selecionada}
      title={`Proporção ${camera.aspect.w}:${camera.aspect.h} · campo de visão ${camera.fovDeg.toFixed(1)}° na horizontal. Duplo clique seleciona para o render.`}
      onOpen={selecionar}
      menu={menu}
    />
  );
}

/** Tabelas do projeto: o duplo clique abre o diálogo (as colunas e a exportação CSV ficam nele). */
export function SchedulesTree(): ReactElement {
  const p = useProject();
  const count = (...kinds: Array<Element['kind']>): number => Object.values(p.elements).filter((e) => kinds.includes(e.kind)).length;
  const rows: Array<{ label: string; dialog: DialogKind; n: number }> = [
    { label: 'Tabela de ambientes', dialog: 'roomSchedule', n: count('room') },
    { label: 'Tabela de escadas', dialog: 'stairSchedule', n: count('stair') },
    { label: 'Tabela de rampas', dialog: 'rampSchedule', n: count('ramp') },
    { label: 'Tabela de forros', dialog: 'ceilingSchedule', n: count('ceiling') },
    { label: 'Tabela de lajes', dialog: 'slabSchedule', n: count('slab') },
    { label: 'Tabela de paredes', dialog: 'schedule', n: count('wall') },
    { label: 'Tabela de pisos', dialog: 'floorSchedule', n: count('floor') },
    { label: 'Tabela de portas e janelas', dialog: 'openingSchedule', n: count('door', 'window') },
    { label: 'Tabela de telhados', dialog: 'roofSchedule', n: count('roof') },
  ];
  return (
    <Node id="g:schedules" label="Tabelas/Quantidades (todas)" icon="schedule" group>
      {rows.map((r) => {
        const open = (): void => useUi.setState({ dialog: r.dialog, dialogArg: null });
        return <Node key={r.dialog} id={`sch:${r.dialog}`} label={r.label} icon="schedule" title={`${r.n} elemento${r.n === 1 ? '' : 's'}. Duplo clique abre.`} onOpen={open} menu={[{ label: 'Abrir', run: open }]} />;
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
    say(e instanceof Error ? e.message : 'Operação recusada.');
  }
}

export function SheetsTree(): ReactElement {
  const p = useProject();
  const view = useUi((s) => s.view);
  const sheetId = useUi((s) => s.sheetId);
  const sheets = projectSheets(p);
  /** Troca a prancha com a vizinha; no limite, avisa na barra de status. */
  const move = (id: string, delta: -1 | 1): void => {
    const cmd = moveSheetCommand(p, id, delta);
    if (!cmd) return say(delta < 0 ? 'A prancha já está no início da lista.' : 'A prancha já está no fim da lista.');
    sheetAction(() => editor.store.exec(cmd, delta < 0 ? 'Mover prancha para cima' : 'Mover prancha para baixo'), delta < 0 ? 'Prancha movida para cima.' : 'Prancha movida para baixo.');
  };
  return (
    <Node
      id="g:sheets"
      label="Pranchas (todas)"
      icon="sheet"
      group
      open
      empty="Nenhuma prancha. Botão direito: Nova prancha."
      menu={[
        { label: 'Nova prancha', run: () => sheetAction(() => openSheet(addSheetAction(editor.store)), 'Prancha criada.') },
        { label: 'Renumerar pranchas…', disabled: sheets.length === 0, run: () => useUi.setState({ dialog: 'renumberSheets', dialogArg: null }) },
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
              title={`Folha ${sh.size}${sh.discipline ? ` · ${sh.discipline}` : ''}. Duplo clique abre.`}
              onOpen={() => openSheet(sh.id)}
              menu={[
                { label: 'Abrir', run: () => openSheet(sh.id) },
                { label: 'Propriedades da prancha…', run: () => useUi.setState({ dialog: 'sheet', dialogArg: sh.id }) },
                { label: 'Mover para cima', disabled: i === 0, run: () => move(sh.id, -1), sep: true },
                { label: 'Mover para baixo', disabled: i === sheets.length - 1, run: () => move(sh.id, 1) },
                { label: 'Emitir revisão…', run: () => useUi.setState({ dialog: 'revision', dialogArg: sh.id }) },
                { label: 'Duplicar', sep: true, run: () => sheetAction(() => { const c = duplicateSheetCommand(p, sh.id); if (c) editor.store.exec(c, 'Duplicar prancha'); }, 'Prancha duplicada.') },
                { label: 'Excluir', danger: true, run: () => sheetAction(() => editor.store.exec({ type: 'removeSheet', id: sh.id }, 'Excluir prancha'), 'Prancha excluída.') },
              ]}
            />
          ))
        : undefined}
    </Node>
  );
}
