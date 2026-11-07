import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { editor } from './editor/controller.ts';
import { transfer } from './editor/transfer.ts';
import { useProjetoDerivado } from './editor/projetoDerivado.ts';
import { useUi } from './editor/state.ts';
import { useI18n } from './editor/i18n.ts';
import { atalhoAtual } from './editor/shortcutConfig.ts';
import { guardarSessao, lerSessao, limparSessao } from './editor/sessao.ts';
import { tabOf } from './editor/viewTabActions.ts';
import type { OpenView, PlanKind } from './editor/openViews.ts';
import { dockWidths } from './editor/dockLayout.ts';
import { Dock } from './ui/Dock.tsx';
import { FileMenu } from './ui/FileMenu.tsx';
import { IconDefs } from './ui/Icon.tsx';
import { IfcImportOverlay } from './ui/IfcImportOverlay.tsx';
import { HomeScreen } from './ui/home/HomeScreen.tsx';
import { TelaDeAbertura } from './ui/home/TelaDeAbertura.tsx';
import { EmptyViews } from './ui/EmptyViews.tsx';
import { OptionsBar } from './ui/OptionsBar.tsx';
import { Ribbon } from './ui/Ribbon.tsx';
import { StatusBar } from './ui/StatusBar.tsx';
import { TitleBar } from './ui/TitleBar.tsx';
import { Tutorial } from './ui/Tutorial.tsx';
import { ViewControlBar } from './ui/ViewControlBar.tsx';
import { ViewTabs } from './ui/ViewTabs.tsx';
import { ViewportCanvas } from './ui/ViewportCanvas.tsx';
import { useNarrow } from './ui/useNarrow.ts';
import { SheetView } from './ui/SheetView.tsx';
import { SheetDialog } from './ui/dialogs/SheetDialog.tsx';
import { AddViewDialog } from './ui/dialogs/AddViewDialog.tsx';
import { RenumberSheetsDialog } from './ui/dialogs/RenumberSheetsDialog.tsx';
import { RevisionDialog } from './ui/dialogs/RevisionDialog.tsx';
import { PublishDialog } from './ui/dialogs/PublishDialog.tsx';
import { AutoCotaDialog } from './ui/dialogs/AutoCotaDialog.tsx';
import { MaterialsDialog } from './ui/dialogs/MaterialsDialog.tsx';
import { LevelsDialog, OpeningTypeDialog, ShortcutsDialog, StartDialog } from './ui/dialogs/OtherDialogs.tsx';
import { UnitsDialog } from './ui/dialogs/UnitsDialog.tsx';
import { HostedLossDialog } from './ui/dialogs/HostedLossDialog.tsx';
import { AlertaDialog } from './ui/dialogs/AlertaDialog.tsx';
import { AreaMergeDialog } from './ui/dialogs/AreaMergeDialog.tsx';
import { DimensionSettingsDialog } from './ui/dialogs/DimensionSettingsDialog.tsx';
import { DimensionFamiliesDialog } from './ui/dialogs/DimensionFamiliesDialog.tsx';
import { ShortcutsConfigDialog } from './ui/dialogs/ShortcutsConfigDialog.tsx';
import { WallScheduleDialog } from './ui/dialogs/WallScheduleDialog.tsx';
import { FloorTypeDialog } from './ui/dialogs/FloorTypeDialog.tsx';
import { FloorScheduleDialog } from './ui/dialogs/FloorScheduleDialog.tsx';
import { RoomScheduleDialog } from './ui/dialogs/RoomScheduleDialog.tsx';
import { RoomCategoriesDialog } from './ui/dialogs/RoomCategoriesDialog.tsx';
import { SlabTypeDialog } from './ui/dialogs/SlabTypeDialog.tsx';
import { SlabScheduleDialog } from './ui/dialogs/SlabScheduleDialog.tsx';
import { CeilingScheduleDialog } from './ui/dialogs/CeilingScheduleDialog.tsx';
import { CeilingTypeDialog } from './ui/dialogs/CeilingTypeDialog.tsx';
import { RoofTypeDialog } from './ui/dialogs/RoofTypeDialog.tsx';
import { RoofScheduleDialog } from './ui/dialogs/RoofScheduleDialog.tsx';
import { WallTypeDialog } from './ui/dialogs/WallTypeDialog.tsx';
import { StairTypeDialog } from './ui/dialogs/StairTypeDialog.tsx';
import { StairScheduleDialog } from './ui/dialogs/StairScheduleDialog.tsx';
import { RampTypeDialog } from './ui/dialogs/RampTypeDialog.tsx';
import { RampScheduleDialog } from './ui/dialogs/RampScheduleDialog.tsx';
import { OpeningScheduleDialog } from './ui/dialogs/OpeningScheduleDialog.tsx';
import { GraphicsVisibilityDialog } from './ui/dialogs/GraphicsVisibilityDialog.tsx';
import { LineWeightsDialog } from './ui/dialogs/LineWeightsDialog.tsx';
import { DxfExportDialog } from './ui/dialogs/DxfExportDialog.tsx';
import { ImportCadDialog } from './ui/dialogs/ImportCadDialog.tsx';
import { ManageCadDialog } from './ui/dialogs/ManageCadDialog.tsx';
import { ExperimentosDialog } from './ui/dialogs/ExperimentosDialog.tsx';
import { SobreDialog } from './ui/dialogs/SobreDialog.tsx';
import { pluginHost } from './plugins/appPorts.ts';
import { ExternalToolsDialog } from './ui/dialogs/ExternalToolsDialog.tsx';
import { AvisoAtualizacaoDialog } from './ui/dialogs/AvisoAtualizacaoDialog.tsx';
import { verificarAvisoAoAbrir } from './editor/atualizacao/auto.ts';
import { definirAtualizacaoPendente } from './editor/atualizacao/ponte.ts';
import { MoveLevelDialog } from './ui/MoveLevel.tsx';
import { LevelMoveConflictDialog } from './ui/LevelMoveConflictDialog.tsx';
import { GridTypeDialog } from './ui/dialogs/GridTypeDialog.tsx';
import { TextDialog, useCaixaDeTextoAberta } from './ui/dialogs/TextDialog.tsx';
import { SelectLevelsDialog } from './ui/dialogs/SelectLevelsDialog.tsx';
import { SalvarSemPastaDialog } from './ui/dialogs/SalvarSemPastaDialog.tsx';

/**
 * Host do diálogo "Selecionar níveis": lê o projeto e o buffer da área de transferência fora do switch de diálogos
 * (o switch não pode chamar hook) e liga os dois caminhos: prévia no 3D ou colar direto.
 */
function SelectLevelsHost(): ReactElement | null {
  const clip = transfer.clipBuffer();
  if (!clip) return null;
  const p = editor.project;
  return (
    <SelectLevelsDialog
      levels={p.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation }))}
      originLevelIds={transfer.originLevelIds(clip)}
      elementCount={transfer.elementCount(clip)}
      initialSelected={useUi.getState().pastePreview?.levelIds ?? []}
      initialLink={false}
      onCancel={() => editor.cancelPasteLevelsDialog()}
      onPreview={(levelIds, link) => {
        if (editor.previewPasteLevels(levelIds, link)) useUi.setState({ dialog: null });
      }}
      onPaste={(levelIds, link) => {
        if (editor.pasteLevelsDirect(levelIds, link)) useUi.setState({ dialog: null });
      }}
    />
  );
}

function Dialogs(): ReactElement | null {
  const d = useUi((s) => s.dialog);
  const arg = useUi((s) => s.dialogArg);
  switch (d) {
    case 'wallType':
      return arg ? <WallTypeDialog typeId={arg} /> : null;
    case 'floorType':
      return arg ? <FloorTypeDialog typeId={arg} /> : null;
    case 'floorSchedule':
      return <FloorScheduleDialog />;
    case 'roomSchedule':
      return <RoomScheduleDialog />;
    case 'roomCategories':
      return <RoomCategoriesDialog />;
    case 'slabType':
      return arg ? <SlabTypeDialog typeId={arg} /> : null;
    case 'slabSchedule':
      return <SlabScheduleDialog />;
    case 'ceilingType':
      return arg ? <CeilingTypeDialog typeId={arg} /> : null;
    case 'ceilingSchedule':
      return <CeilingScheduleDialog />;
    case 'roofType':
      return arg ? <RoofTypeDialog typeId={arg} /> : null;
    case 'roofSchedule':
      return <RoofScheduleDialog />;
    case 'gridType':
      return arg ? <GridTypeDialog typeId={arg} /> : null;
    case 'stairType':
      return arg ? <StairTypeDialog typeId={arg} /> : null;
    case 'stairSchedule':
      return <StairScheduleDialog />;
    case 'rampType':
      return arg ? <RampTypeDialog typeId={arg} /> : null;
    case 'rampSchedule':
      return <RampScheduleDialog />;
    case 'openingSchedule':
      return <OpeningScheduleDialog />;
    case 'openingType':
      return arg ? <OpeningTypeDialog typeId={arg} /> : null;
    case 'materials':
      return <MaterialsDialog />;
    case 'levels':
      return <LevelsDialog />;
    case 'units':
      return <UnitsDialog />;
    case 'hostedLoss':
      return <HostedLossDialog />;
    case 'alerta':
      return <AlertaDialog />;
    case 'areaMerge':
      return <AreaMergeDialog />;
    case 'dimensions':
      return <DimensionSettingsDialog onApplyStyle={(patch) => editor.store.exec({ type: 'setDimensionStyle', patch }, 'Estilo de cotas')} />;
    case 'dimensionFamilies':
      return <DimensionFamiliesDialog />;
    case 'start':
      return <StartDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'shortcutsConfig':
      return <ShortcutsConfigDialog />;
    case 'schedule':
      return <WallScheduleDialog />;
    case 'sheet':
      return arg ? <SheetDialog sheetId={arg} /> : null;
    case 'addView':
      return arg ? <AddViewDialog sheetId={arg} /> : null;
    case 'renumberSheets':
      return <RenumberSheetsDialog />;
    case 'publish':
      return <PublishDialog />;
    case 'revision':
      return arg ? <RevisionDialog sheetId={arg} /> : null;
    case 'graphicsVisibility':
      return arg ? <GraphicsVisibilityDialog target={arg} /> : null;
    case 'lineWeights':
      return <LineWeightsDialog />;
    case 'dxfLayers':
      return <DxfExportDialog />;
    case 'importCad':
      return <ImportCadDialog />;
    case 'manageCad':
      return <ManageCadDialog />;
    case 'experimentos':
      return <ExperimentosDialog />;
    case 'about':
      return <SobreDialog />;
    case 'externalTools':
      return <ExternalToolsDialog />;
    case 'updatePrompt':
      return <AvisoAtualizacaoDialog />;
    case 'moveLevel':
      return <MoveLevelDialog onClose={() => useUi.setState({ dialog: null })} />;
    case 'levelMoveConflict':
      return <LevelMoveConflictDialog onClose={() => useUi.setState({ dialog: null, dialogArg: null })} />;
    case 'cotasAuto':
      return <AutoCotaDialog />;
    case 'selectLevels':
      return <SelectLevelsHost />;
    case 'salvarSemPasta':
      return <SalvarSemPastaDialog />;
    default:
      return null;
  }
}

/**
 * Área de desenho: escolhe entre o estado vazio, a prancha e o canvas. Fica num componente próprio para o `App` não
 * assinar o projeto inteiro só para saber se sobrou alguma aba válida (ver `useProjetoDerivado`).
 */
function Palco(): ReactElement {
  const openViews = useUi((s) => s.openViews);
  const view = useUi((s) => s.view);
  const sheetId = useUi((s) => s.sheetId);
  // Sem nenhuma aba válida, a área de desenho mostra o estado vazio (o navegador continua acessível).
  const semVistas = useProjetoDerivado((p) => !openViews.some((v) => tabOf(p, v) !== null));
  return (
    <main className="stage">
      <ViewTabs />
      {/* O tutorial fica numa faixa própria acima da área de desenho (não cobre a planta nem recebe o clique). */}
      <div style={{ position: 'relative', minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Tutorial />
        <div style={{ position: 'relative', minHeight: 0, flex: 1, display: 'grid' }}>
          {semVistas ? <EmptyViews /> : view === 'sheet' && sheetId ? <SheetView sheetId={sheetId} /> : <ViewportCanvas />}
        </div>
      </div>
      {!semVistas && <ViewControlBar />}
    </main>
  );
}

export function App(): ReactElement {
  const propsOpen = useUi((s) => s.propsOpen);
  const browserOpen = useUi((s) => s.browserOpen);
  const dock = useUi((s) => s.dock);
  const widths = dockWidths(propsOpen, browserOpen, dock);
  const theme = useUi((s) => s.theme);
  const dialog = useUi((s) => s.dialog);
  const tela = useUi((s) => s.tela);
  // Estado da vista: é o que a sessão da aba devolve depois de um F5 (projeto + vista + aba + nível).
  const vista = useUi((s) => s.view);
  const nivelAtivo = useUi((s) => s.levelId);
  const planKind = useUi((s) => s.planKind);
  const areaPlanId = useUi((s) => s.areaPlanId);
  const sectionId = useUi((s) => s.sectionId);
  const abas = useUi((s) => s.openViews);
  const lang = useI18n((s) => s.lang);
  const narrow = useNarrow();
  // A restauração do projeto só acontece na montagem; a dica de status acompanha o idioma.
  const initialized = useRef(false);
  // Sessão da aba (F5): enquanto a retomada não termina, fica na tela neutra — nunca na Home.
  const [restaurando, setRestaurando] = useState(() => lerSessao() !== null);
  // A caixa de texto não entra em `dialog` (DialogKind); as teclas ficam presas a ela enquanto estiver aberta.
  const caixaTextoAberta = useCaixaDeTextoAberta();

  // O host (artefato) pode ter definido data-theme: guardamos o valor original e o devolvemos em "sistema".
  const hostTheme = useRef<string | null>(document.documentElement.getAttribute('data-theme') === 'light' ? null : document.documentElement.getAttribute('data-theme'));
  // Antes da pintura: o `index.html` já entra com `data-theme="light"`; o efeito de layout troca para a escolha
  // manual (ou devolve o tema do host em "sistema") sem o flash escuro do `prefers-color-scheme`.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      if (hostTheme.current) root.setAttribute('data-theme', hostTheme.current);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', theme);
  }, [theme]);

  // Plugins que o usuário deixou habilitados reconectam ao abrir o app (nada é iniciado: só se conecta a porta local).
  useEffect(() => { pluginHost().start(); }, []);

  // Retomada: só existe sessão quando a página foi recarregada (F5). Abrir a aba ou o programa de novo cai na tela de
  // projetos, que é onde o usuário escolhe o que abrir.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const sessao = lerSessao();
    if (!sessao) {
      setRestaurando(false);
      return;
    }
    void (async () => {
      try {
        const abriu = sessao.pasta ? (await editor.abrirDaBiblioteca(sessao.pasta)).ok : editor.restoreAutosave();
        if (!abriu) {
          // Projeto sumiu ou subiu no autosave: a tela de projetos resolve (com o card de recuperar, se houver).
          limparSessao();
          return;
        }
        useUi.setState({
          tela: 'editor',
          view: sessao.view,
          levelId: sessao.levelId,
          planKind: sessao.planKind as PlanKind,
          areaPlanId: sessao.areaPlanId,
          sectionId: sessao.sectionId,
          ...(sessao.openViews.length ? { openViews: sessao.openViews as OpenView[] } : {}),
        });
      } finally {
        // Sucesso ou falha: a tela neutra sai; quem manda daqui em diante é o estado (`editor` ou `home`).
        setRestaurando(false);
      }
    })();
  }, []);

  // Guarda a sessão a cada mudança de vista/projeto: é o que o F5 reabre.
  useEffect(() => {
    if (tela !== 'editor') return;
    guardarSessao({ pasta: editor.pastaNaBiblioteca, view: vista, levelId: nivelAtivo, planKind, areaPlanId, sectionId, openViews: abas });
  }, [tela, vista, nivelAtivo, planKind, areaPlanId, sectionId, abas]);

  // Voltar de propósito para a tela de projetos encerra a sessão da aba: F5 ali continua na tela de projetos. Durante
  // a retomada o estado ainda é `home`, mas a sessão está sendo usada — não pode ser apagada agora.
  useEffect(() => {
    if (tela === 'home' && !restaurando) limparSessao();
  }, [tela, restaurando]);

  useEffect(() => {
    // A tela inicial de projetos é quem decide o que abrir (continuar o não salvo, um projeto da pasta ou um modelo).
    // Antes, o programa abria direto no último projeto do autosave.
    // A dica usa a sequência atual da parede (depende do perfil e da personalização); sem tecla, não cita letra.
    // Ao trocar o idioma a mensagem é montada de novo no idioma ativo, sem reabrir o projeto.
    const parede = atalhoAtual('wall');
    const status = lang === 'en'
      ? parede ? `Ready. Press ${parede} to draw walls, or select to edit.` : 'Ready. Pick a tool, or select to edit.'
      : parede ? `Pronto. Pressione ${parede} para desenhar paredes, ou selecione para editar.` : 'Pronto. Escolha uma ferramenta, ou selecione para editar.';
    useUi.setState({ status });
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      // Na tela de projetos não há documento aberto: nenhum atalho do editor vale ali.
      if (useUi.getState().tela === 'home' || dialog || caixaTextoAberta || typing) return;
      if (editor.key(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, caixaTextoAberta]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent): void => {
      if (editor.store.dirty && editor.project.nextOrder > 1) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Aviso automático de versão nova (só desktop). A verificação manual do "Sobre" não depende disto.
  useEffect(() => {
    void verificarAvisoAoAbrir()
      .then((info) => {
        if (!info || useUi.getState().dialog !== null) return;
        definirAtualizacaoPendente(info);
        useUi.setState({ dialog: 'updatePrompt', dialogArg: null });
      })
      .catch(() => undefined);
  }, []);

  // Retomada em curso (F5 com projeto aberto): tela neutra, nunca a Home "piscando" antes do editor.
  if (restaurando) return <TelaDeAbertura />;

  // Tela inicial de projetos: o editor (faixa, palco, docks) só monta depois que um projeto é aberto ou criado.
  if (tela === 'home') return <HomeScreen />;

  return (
    <div className="app">
      <IconDefs />
      <TitleBar />
      <Ribbon />
      <OptionsBar />
      <div className="workspace" style={{ gridTemplateColumns: `${widths.left}px minmax(0, 1fr) ${widths.right}px` }}>
        <Dock side="left" />
        <Palco />
        <Dock side="right" />
        {narrow && (propsOpen || browserOpen) && (
          <div className="dock-scrim" aria-hidden="true" onPointerDown={() => useUi.setState({ propsOpen: false, browserOpen: false })} />
        )}
      </div>
      <StatusBar />
      <Dialogs />
      {/* A caixa de texto tem store próprio (não entra no DialogKind): aberta pela aba Anotar/painel do Texto. */}
      <TextDialog />
      <FileMenu />
      <IfcImportOverlay />
    </div>
  );
}
