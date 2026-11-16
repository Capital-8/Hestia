import { useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { usePluginRegistryVersion, pluginRegistry } from '../plugins/registry.ts';
import { pickFileForImport } from '../plugins/ioPick.ts';
import { supplementRuntime } from '../plugins/supApp.ts';
import { txt } from './ribbon/model.ts';

/**
 * Peças do menu Arquivo para importar e exportar de suplementos (fase F). Texto de suplemento (títulos, relatório) é
 * dado não confiável: só vira texto simples. Nada aqui executa código de suplemento; as ações vão ao `IoBridge`.
 */

/** Cartões de exportação de suplementos (um por exportador registrado e com permissão). */
export function PluginExportCards({ onRun }: { onRun: () => void }): ReactElement | null {
  const { t, lang } = useT();
  usePluginRegistryVersion();
  const list = pluginRegistry.exporters();
  if (list.length === 0) return null;
  return (
    <>
      {list.map((x) => (
        <button key={x.qid} className="fm-card" onClick={() => { onRun(); void supplementRuntime().io.exportWith(x.pluginId, x.id); }}>
          <b>{txt(x.title, lang)}</b>
          <span>{t('supio_export_hint', { name: x.pluginName, ext: x.extension })}</span>
        </button>
      ))}
    </>
  );
}

/** Há importadores de suplementos? (decide se o item "Importar de suplementos" aparece no menu). */
export function useHasPluginImporters(): boolean {
  usePluginRegistryVersion();
  return pluginRegistry.importers().length > 0;
}

/** Seção "Importar de suplementos": um cartão por importador; escolher o arquivo prepara a prévia. */
export function PluginImportSection(): ReactElement {
  const { t, lang } = useT();
  usePluginRegistryVersion();
  const list = pluginRegistry.importers();
  return (
    <>
      <h3>{t('supio_import_title')}</h3>
      {list.length === 0 && <p className="fm-hint">{t('supio_import_none')}</p>}
      <div className="fm-cards">
        {list.map((i) => (
          <button key={i.qid} className="fm-card" onClick={() => void supplementRuntime().io.run(i.pluginId, { type: 'importer', ref: i.id }, pickFileForImport)}>
            <b>{txt(i.title, lang)}</b>
            <span>{t('supio_import_hint', { name: i.pluginName, ext: i.extensions.map((e) => `.${e}`).join(' ') })}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Prévia e confirmação da importação pendente (aparece no topo do painel do menu Arquivo). */
export function PluginImportPreview(): ReactElement | null {
  const { t } = useT();
  const io = supplementRuntime().io;
  const p = useSyncExternalStore(io.subscribe, io.snapshot, () => null);
  if (!p) return null;
  return (
    <div className="fm-hint" role="status">
      <p><b>{t('supio_preview_title')}</b></p>
      <p>{t('supio_preview_body', { name: p.pluginName, file: p.fileName, n: p.preview.created, commands: p.preview.commands })}</p>
      {p.rehearsal && <p>{t('supbp_import_extra', { changed: p.rehearsal.changed, deleted: p.rehearsal.deleted, errors: p.rehearsal.errors.length })}</p>}
      {p.rehearsal && p.rehearsal.errors.length > 0 && <p role="alert">{p.rehearsal.errors[0]!.message}</p>}
      {p.report && <p style={{ whiteSpace: 'pre-wrap' }}>{p.report}</p>}
      <p>
        <button className="btn primary" disabled={!!p.rehearsal && !p.rehearsal.ok} onClick={() => io.confirmImport()}>{t('supio_confirm', { n: p.preview.created })}</button>{' '}
        <button className="btn" onClick={() => io.cancelImport()}>{t('supio_cancel')}</button>
      </p>
    </div>
  );
}
