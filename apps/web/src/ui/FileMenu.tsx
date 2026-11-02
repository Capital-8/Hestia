import { useEffect, useRef, useState, type ReactElement } from 'react';
import { editor, useProject } from '../editor/controller.ts';
import { exportIfc, exportPdf, nextTheme } from '../editor/fileActions.ts';
import { useI18n } from '../editor/i18n.ts';
import { importIfcFile, resumoImportacao, type ResumoImportacao } from '../editor/ifcImport.ts';
import { useUi } from '../editor/state.ts';
import { openPublish } from './dialogs/PublishDialog.tsx';

type Section = 'export' | 'info' | 'options';

/**
 * Menu Arquivo (aba azul da faixa e botão "R" da barra de título): Novo, Abrir, Importar IFC, Salvar, Exportar,
 * Informações e Opções. Abre por cima da área de trabalho, do lado esquerdo; Esc, clique fora ou Fechar voltam ao desenho.
 */
export function FileMenu(): ReactElement | null {
  const open = useUi((s) => s.fileMenu);
  const theme = useUi((s) => s.theme);
  const gpu = useUi((s) => s.gpu);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const project = useProject();
  const [section, setSection] = useState<Section>('export');
  const ifcRef = useRef<HTMLInputElement>(null);
  const [resumo, setResumo] = useState<(ResumoImportacao & { nome: string }) | null>(null);
  const [erroIfc, setErroIfc] = useState<string | null>(null);
  const pt = lang === 'pt';
  const close = (): void => useUi.setState({ fileMenu: false });

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        useUi.setState({ fileMenu: false });
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open]);
  if (!open) return null;

  const go = (fn: () => void): void => {
    close();
    fn();
  };
  const item = (label: string, onClick: () => void, o: { on?: boolean; arrow?: boolean; title?: string } = {}): ReactElement => (
    <button className={`fm-item${o.on ? ' on' : ''}`} onClick={onClick} title={o.title}>
      {label}
      {o.arrow ? <span>▸</span> : null}
    </button>
  );
  const card = (label: string, hint: string, fn: () => Promise<void>): ReactElement => (
    <button className="fm-card" onClick={() => go(() => void fn())}>
      <b>{label}</b>
      <span>{hint}</span>
    </button>
  );
  const themeName = theme === 'system' ? (pt ? 'sistema' : 'system') : theme === 'light' ? (pt ? 'claro' : 'light') : pt ? 'escuro' : 'dark';
  const engine = gpu === 'pending' ? (pt ? 'iniciando…' : 'starting…') : gpu === 'cpu' ? 'CPU' : gpu === 'webgpu' ? 'GPU · WebGPU' : 'GPU · WebGL2';
  // Importar IFC: o arquivo vira um projeto aberto e o menu continua aberto para mostrar o resumo da leitura.
  const importarIfc = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setResumo(null);
    setErroIfc(null);
    const inicio = performance.now();
    // units-ok: tamanho de arquivo em MB só para o texto da barra de status, não é medida do modelo.
    const mb = f.size / 1048576;
    useUi.setState({
      status: `${pt ? 'Importando IFC' : 'Importing IFC'} · ${mb < 1 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${Math.round(mb)} MB`}…`,
      ifcImport: { fase: 'read', fracao: 0, feito: 0, total: f.size },
    });
    try {
      const { name, report } = await importIfcFile(f, {
        onProgress: (p) => useUi.setState({ ifcImport: p }),
      });
      const r = resumoImportacao(report, pt ? 'pt' : 'en');
      // units-ok: tempo decorrido em segundos só para a mensagem de status, não é medida do modelo.
      const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
      console.info(`IFC importado em ${segundos}s: ${name}`, report);
      useUi.setState({ ifcImport: null, status: `IFC importado em ${segundos} s: ${name} · ${r.texto}` });
      setResumo({ nome: name, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : pt ? 'falha desconhecida' : 'unknown failure';
      console.info('Falha ao importar o IFC', e);
      setErroIfc(msg);
      useUi.setState({ ifcImport: null, status: `${pt ? 'Não foi possível importar o IFC' : 'Could not import the IFC'}: ${msg}` });
    }
  };

  return (
    <div className="fm-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="fm" role="dialog" aria-label={pt ? 'Menu Arquivo' : 'File menu'}>
        <input ref={ifcRef} id="file-ifc" type="file" accept=".ifc" hidden onChange={(e) => { void importarIfc(e.target.files?.[0]); e.target.value = ''; }} />
        <nav className="fm-list">
          {item(pt ? 'Novo' : 'New', () => go(() => useUi.setState({ dialog: 'start' })))}
          {item(pt ? 'Abrir' : 'Open', () => go(() => document.getElementById('file-open')?.click()))}
          {item(pt ? 'Importar IFC…' : 'Import IFC…', () => ifcRef.current?.click(), { title: pt ? 'Abre um arquivo .ifc do Revit ou de outro programa BIM.' : 'Open a .ifc from Revit or another BIM program.' })}
          {item(pt ? 'Importar CAD (DXF)…' : 'Import CAD…', () => go(() => useUi.setState({ dialog: 'importCad' })), { title: pt ? 'Insere um desenho DXF no nível, como um objeto só, com as camadas do arquivo.' : 'Insert a DXF drawing on the level as a single object.' })}
          {item(pt ? 'Salvar' : 'Save', () => go(() => void editor.save()), { title: 'Ctrl+S' })}
          <hr />
          {item(pt ? 'Exportar' : 'Export', () => setSection('export'), { on: section === 'export', arrow: true })}
          {item(pt ? 'Informações do projeto' : 'Project Information', () => setSection('info'), { on: section === 'info', arrow: true })}
          <hr />
          {item(pt ? 'Opções' : 'Options', () => setSection('options'), { on: section === 'options', arrow: true })}
          {item(pt ? 'Fechar menu' : 'Close menu', close)}
        </nav>
        <div className="fm-pane">
          {resumo && (
            <div className="fm-hint" role="status">
              <p><b>{resumo.nome}</b> — {resumo.texto}</p>
              {resumo.ignorados.length > 0 && <p>{pt ? 'Ignorados' : 'Skipped'}: {resumo.ignorados.join(' · ')}</p>}
              {resumo.avisos.slice(0, 3).map((a, i) => <p key={i}>{a}</p>)}
              {resumo.avisos.length > 3 && <p>+{resumo.avisos.length - 3} {pt ? 'aviso(s)' : 'warning(s)'}</p>}
            </div>
          )}
          {erroIfc && <p className="fm-hint" role="status">{pt ? 'Não foi possível importar o IFC' : 'Could not import the IFC'}: {erroIfc}</p>}
          {section === 'export' && (
            <>
              <h3>{pt ? 'Exportar' : 'Export'}</h3>
              <div className="fm-cards">
                {card('DXF', pt ? 'Planta ou corte ativo, com as camadas editáveis (R2000).' : 'Active plan or section, with editable layers (R2000).', async () => useUi.setState({ dialog: 'dxfLayers' }))}
                {card('PDF', pt ? 'Todas as pranchas em um arquivo (cria uma prancha da planta atual se não houver).' : 'All sheets in one file.', exportPdf)}
                {card(pt ? 'Publicar…' : 'Publish…', pt ? 'Escolhe pranchas, ordem e um arquivo por prancha.' : 'Pick sheets, order and one file per sheet.', async () => openPublish())}
                {card('IFC', pt ? 'Modelo completo para outros programas BIM.' : 'Full model for other BIM software.', exportIfc)}
              </div>
            </>
          )}
          {section === 'info' && (
            <>
              <h3>{pt ? 'Informações do projeto' : 'Project Information'}</h3>
              <label className="fm-field">
                {pt ? 'Nome do projeto' : 'Project name'}
                <input
                  id="project-name"
                  className="input"
                  value={project.name}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => editor.store.exec({ type: 'setProjectName', name: e.target.value }, 'Renomear projeto')}
                />
              </label>
              <p className="fm-hint">{project.levels.length} {pt ? 'níveis' : 'levels'} · {Object.keys(project.elements).length} {pt ? 'elementos' : 'elements'}</p>
            </>
          )}
          {section === 'options' && (
            <>
              <h3>{pt ? 'Opções' : 'Options'}</h3>
              <div className="fm-row">
                <span>{pt ? 'Idioma' : 'Language'}</span>
                <span className="seg">
                  <button className={pt ? 'on' : ''} onClick={() => setLang('pt')}>Português</button>
                  <button className={!pt ? 'on' : ''} onClick={() => setLang('en')}>English</button>
                </span>
              </div>
              <div className="fm-row">
                <span>{pt ? 'Tema' : 'Theme'}</span>
                <button className="btn" title={`${pt ? 'Tema' : 'Theme'}: ${themeName}`} onClick={() => useUi.setState({ theme: nextTheme(theme) })}>{themeName}</button>
              </div>
              <div className="fm-row">
                <span>{pt ? 'Motor gráfico' : 'Graphics engine'}</span>
                <span className="badge">{engine}</span>
              </div>
              <div className="fm-row">
                <span>{pt ? 'Experimentais' : 'Experiments'}</span>
                <button className="btn" onClick={() => go(() => useUi.setState({ dialog: 'experimentos', dialogArg: null }))}>
                  {pt ? 'Kernel geométrico (Rust/WASM)…' : 'Geometry kernel (Rust/WASM)…'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
