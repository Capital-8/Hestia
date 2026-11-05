import { useEffect, useRef, useState, type ReactElement } from 'react';
import { editor, useProject } from '../editor/controller.ts';
import { exportIfc, exportPdf, nextTheme } from '../editor/fileActions.ts';
import { useI18n, useT } from '../editor/i18n.ts';
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
  const { t, lang } = useT();
  const setLang = useI18n((s) => s.setLang);
  const project = useProject();
  const [section, setSection] = useState<Section>('export');
  const ifcRef = useRef<HTMLInputElement>(null);
  const [resumo, setResumo] = useState<(ResumoImportacao & { nome: string }) | null>(null);
  const [erroIfc, setErroIfc] = useState<string | null>(null);
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
  const themeName = theme === 'system' ? t('tip_theme_system') : theme === 'light' ? t('tip_theme_light') : t('tip_theme_dark');
  const engine = gpu === 'pending' ? t('tip_starting') : gpu === 'cpu' ? 'CPU' : gpu === 'webgpu' ? 'GPU · WebGPU' : 'GPU · WebGL2';
  // Importar IFC: o arquivo vira um projeto aberto e o menu continua aberto para mostrar o resumo da leitura.
  const importarIfc = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    setResumo(null);
    setErroIfc(null);
    const inicio = performance.now();
    // units-ok: tamanho de arquivo em MB só para o texto da barra de status, não é medida do modelo.
    const mb = f.size / 1048576;
    useUi.setState({
      status: { key: 'shc_ifc_importing_size', args: { size: mb < 1 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${Math.round(mb)} MB` } },
      ifcImport: { fase: 'read', fracao: 0, feito: 0, total: f.size },
    });
    try {
      const { name, report } = await importIfcFile(f, {
        onProgress: (p) => useUi.setState({ ifcImport: p }),
      });
      const r = resumoImportacao(report, lang);
      // units-ok: tempo decorrido em segundos só para a mensagem de status, não é medida do modelo.
      const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
      console.info(`IFC importado em ${segundos}s: ${name}`, report);
      useUi.setState({ ifcImport: null, status: { key: 'shc_ifc_imported', args: { s: segundos, name, summary: r.texto } } });
      setResumo({ nome: name, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('shc_file_err_unknown');
      console.info('Falha ao importar o IFC', e);
      setErroIfc(msg);
      useUi.setState({ ifcImport: null, status: { key: 'shc_file_import_failed', args: { msg } } });
    }
  };

  return (
    <div className="fm-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="fm" role="dialog" aria-label={t('shc_file_menu')}>
        <input ref={ifcRef} id="file-ifc" type="file" accept=".ifc" hidden onChange={(e) => { void importarIfc(e.target.files?.[0]); e.target.value = ''; }} />
        <nav className="fm-list">
          {item(t('btn_new'), () => go(() => useUi.setState({ dialog: 'start' })))}
          {item(t('btn_open'), () => go(() => document.getElementById('file-open')?.click()))}
          {item(t('shc_file_import_ifc'), () => ifcRef.current?.click(), { title: t('shc_file_import_ifc_tip') })}
          {item(t('shc_file_import_cad'), () => go(() => useUi.setState({ dialog: 'importCad' })), { title: t('shc_file_import_cad_tip') })}
          {item(t('btn_save'), () => go(() => void editor.save()), { title: 'Ctrl+S' })}
          <hr />
          {item(t('shc_file_export'), () => setSection('export'), { on: section === 'export', arrow: true })}
          {item(t('shc_file_project_info'), () => setSection('info'), { on: section === 'info', arrow: true })}
          <hr />
          {item(t('shc_file_options'), () => setSection('options'), { on: section === 'options', arrow: true })}
          {item(t('shc_file_close_menu'), close)}
        </nav>
        <div className="fm-pane">
          {resumo && (
            <div className="fm-hint" role="status">
              <p><b>{resumo.nome}</b> — {resumo.texto}</p>
              {resumo.ignorados.length > 0 && <p>{t('shc_file_skipped')}: {resumo.ignorados.join(' · ')}</p>}
              {resumo.avisos.slice(0, 3).map((a, i) => <p key={i}>{a}</p>)}
              {resumo.avisos.length > 3 && <p>{t('shc_file_more_warnings', { n: resumo.avisos.length - 3 })}</p>}
            </div>
          )}
          {erroIfc && <p className="fm-hint" role="status">{t('shc_file_import_failed', { msg: erroIfc })}</p>}
          {section === 'export' && (
            <>
              <h3>{t('shc_file_export')}</h3>
              <div className="fm-cards">
                {card('DXF', t('shc_file_export_hint_dxf'), async () => useUi.setState({ dialog: 'dxfLayers' }))}
                {card('PDF', t('shc_file_export_hint_pdf'), exportPdf)}
                {card(t('shc_file_publish'), t('shc_file_publish_hint'), async () => openPublish())}
                {card('IFC', t('shc_file_export_hint_ifc'), exportIfc)}
              </div>
            </>
          )}
          {section === 'info' && (
            <>
              <h3>{t('shc_file_project_info')}</h3>
              <label className="fm-field">
                {t('shc_file_project_name')}
                <input
                  id="project-name"
                  className="input"
                  value={project.name}
                  onKeyDown={(e) => e.stopPropagation()}
                  onChange={(e) => editor.store.exec({ type: 'setProjectName', name: e.target.value }, t('shc_undo_rename_project'))}
                />
              </label>
              <p className="fm-hint">{t('shc_file_summary_levels', { n: project.levels.length })} · {t('shc_file_summary_elements', { n: Object.keys(project.elements).length })}</p>
            </>
          )}
          {section === 'options' && (
            <>
              <h3>{t('shc_file_options')}</h3>
              <div className="fm-row">
                <span>{t('shc_file_language')}</span>
                <span className="seg">
                  <button className={lang === 'pt' ? 'on' : ''} onClick={() => setLang('pt')}>Português</button>
                  <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
                </span>
              </div>
              <div className="fm-row">
                <span>{t('tip_theme')}</span>
                <button className="btn" title={`${t('tip_theme')}: ${themeName}`} onClick={() => useUi.setState({ theme: nextTheme(theme) })}>{themeName}</button>
              </div>
              <div className="fm-row">
                <span>{t('shc_file_graphics_engine')}</span>
                <span className="badge">{engine}</span>
              </div>
              <div className="fm-row">
                <span>{t('shc_file_experiments')}</span>
                <button className="btn" onClick={() => go(() => useUi.setState({ dialog: 'experimentos', dialogArg: null }))}>
                  {t('shc_file_geometry_kernel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
