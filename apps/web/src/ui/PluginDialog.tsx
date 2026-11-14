import { useMemo, useState, type ReactElement } from 'react';
import { initialFieldValue, type PluginText, type RegisteredDialog } from '@hestia/plugin-api';
import { unitsOf } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { checkForm, type FormErrors } from '../plugins/fieldForm.ts';
import { pluginRegistry, runPluginAction, usePluginRegistryVersion } from '../plugins/registry.ts';
import { Dialog } from './dialogs/Dialog.tsx';
import { PluginField } from './PluginField.tsx';
import { txt } from './ribbon/model.ts';

/**
 * Diálogo declarativo de suplemento (`DialogKind` 'pluginDialog'; `dialogArg` = `<pluginId>:<dialogId>`), fase H. Desenha
 * os campos do manifesto (número, texto, seleção, caixa de marcação, comprimento e ângulo), mostra comprimento e ângulo
 * nas unidades do projeto, valida tudo e só então entrega os valores (metro e radiano) à ação. Sem HTML nem script do
 * suplemento: só texto e controles nativos.
 */
type Valores = Record<string, number | string | boolean | undefined>;

function PluginDialogBody({ d }: { d: RegisteredDialog }): ReactElement {
  const { t, lang } = useT();
  const units = useMemo(() => unitsOf(editor.project, lang), [lang]);
  const [valores, setValores] = useState<Valores>(() => Object.fromEntries(d.fields.map((f) => [f.key, initialFieldValue(f)])));
  const [erros, setErros] = useState<FormErrors>({});
  const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const rodar = (run: RegisteredDialog['actions'][number]['run']): void => {
    const r = checkForm(d.fields, valores);
    if (!r.ok) { setErros(r.errors); return; }
    fechar();
    runPluginAction(d.pluginId, run, r.values);
  };
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
            <button key={a.id} className={i === 0 ? 'btn primary' : 'btn'} onClick={() => rodar(a.run)}>{txt(a.label as PluginText, lang)}</button>
          ))}
        </>
      )}
    >
      {Object.keys(erros).length > 0 && <p className="plugin-field-error" role="alert">{t('supui_dialog_fix')}</p>}
      {d.fields.map((f) => (
        <PluginField
          key={f.key} f={f} units={units} lang={lang} value={valores[f.key] ?? initialFieldValue(f)} error={erros[f.key]}
          onChange={(v) => { setValores((o) => ({ ...o, [f.key]: v })); setErros((o) => { const { [f.key]: _, ...resto } = o; return resto; }); }}
        />
      ))}
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
