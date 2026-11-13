import { useState, type ReactElement } from 'react';
import type { DialogField, PluginText } from '@hestia/plugin-api';
import { useUi } from '../editor/state.ts';
import { useT, type Lang } from '../editor/i18n.ts';
import { txt } from '../ui/ribbon/model.ts';
import { Dialog } from '../ui/dialogs/Dialog.tsx';
import { pluginRegistry, runPluginAction, usePluginRegistryVersion } from './registry.ts';
import type { RegisteredDialog } from '@hestia/plugin-api';

/**
 * Diálogo declarativo de suplemento (`DialogKind` 'pluginDialog'; `dialogArg` = `<pluginId>:<dialogId>`). Desenha os
 * campos do manifesto e, ao acionar um botão, entrega os valores ao registro (`runPluginAction`). Sem HTML nem script do
 * suplemento: só texto e controles nativos. Mostra comprimentos em metro e ângulos em radiano (unidades da API); a
 * conversão para as unidades do projeto é da fase H.
 */
type Valor = number | string | boolean;

const UNIDADE: Partial<Record<DialogField['type'], string>> = { length: 'm', angle: 'rad' };

/** Valor inicial de um campo: o `default` do manifesto ou um vazio do tipo certo. */
export function valorInicial(f: DialogField): Valor {
  if (f.default !== undefined) return f.default;
  return f.type === 'bool' ? false : f.type === 'text' ? '' : f.type === 'choice' ? (f.options?.[0] ?? '') : (f.min ?? 0);
}

/** Valores iniciais de todos os campos, por `key`. */
export const valoresIniciais = (fields: DialogField[]): Record<string, Valor> => Object.fromEntries(fields.map((f) => [f.key, valorInicial(f)]));

function Campo({ f, v, set, lang }: { f: DialogField; v: Valor; set: (x: Valor) => void; lang: Lang }): ReactElement {
  const rotulo = txt(f.label as PluginText, lang);
  if (f.type === 'bool') {
    return <label className="field"><input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} /> {rotulo}</label>;
  }
  if (f.type === 'choice') {
    return (
      <label className="field">{rotulo}
        <select value={String(v)} onChange={(e) => set(e.target.value)}>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
      </label>
    );
  }
  if (f.type === 'text') {
    return <label className="field">{rotulo}<input type="text" value={String(v)} onChange={(e) => set(e.target.value)} /></label>;
  }
  const un = UNIDADE[f.type];
  return (
    <label className="field">{rotulo}{un ? ` (${un})` : ''}
      <input type="number" value={Number(v)} min={f.min} max={f.max} step="any" onChange={(e) => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) set(n); }} />
    </label>
  );
}

function PluginDialogBody({ d }: { d: RegisteredDialog }): ReactElement {
  const { t, lang } = useT();
  const [valores, setValores] = useState<Record<string, Valor>>(() => valoresIniciais(d.fields));
  const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
  return (
    <Dialog
      title={txt(d.title as PluginText, lang)}
      sub={d.pluginName}
      size="narrow"
      onClose={fechar}
      footer={(
        <>
          <button className="btn" onClick={fechar}>{t('dlm_btn_close')}</button>
          {d.actions.map((a, i) => (
            <button key={a.id} className={i === 0 ? 'btn primary' : 'btn'} onClick={() => { fechar(); runPluginAction(d.pluginId, a.run, valores); }}>{txt(a.label as PluginText, lang)}</button>
          ))}
        </>
      )}
    >
      {d.fields.map((f) => <Campo key={f.key} f={f} v={valores[f.key] ?? valorInicial(f)} set={(x) => setValores((o) => ({ ...o, [f.key]: x }))} lang={lang} />)}
    </Dialog>
  );
}

export function PluginDialog(): ReactElement | null {
  const arg = useUi((s) => s.dialogArg);
  usePluginRegistryVersion();
  const d = arg ? pluginRegistry.dialog(arg) : undefined;
  // Suplemento desativado com o diálogo aberto: o diálogo some junto, sem erro.
  return d ? <PluginDialogBody key={d.qid} d={d} /> : null;
}
