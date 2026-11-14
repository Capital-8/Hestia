import { useMemo, useState, type ReactElement } from 'react';
import { initialFieldValue, parseView, readFieldPath, viewInputs, type PluginAction, type PluginText, type RegisteredPanel, type ViewNode } from '@hestia/plugin-api';
import { unitsOf, type ResolvedUnits } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useT, type Lang } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { checkForm, type FormErrors } from '../plugins/fieldForm.ts';
import { displayValue } from '../plugins/fieldUnits.ts';
import { pluginRegistry, runPluginAction, usePluginRegistryVersion } from '../plugins/registry.ts';
import { PluginField } from './PluginField.tsx';
import { txt } from './ribbon/model.ts';
import './PluginPanel.css';

/**
 * Painel lateral persistente de suplementos (spec 08 §4 `panels`, fase H). Fica ao lado direito da área de desenho
 * enquanto houver suplemento ativo com painel (e a seleção atender ao `when` dele); o usuário recolhe ou reabre. Desenha
 * a visão declarativa (`parseView`): `text`, `value`, `row`, `table`, `button` e `input`. Os dados dos elementos são lidos
 * da cópia do projeto, em unidades do projeto; os campos de entrada são validados antes de ir ao handler.
 */
const MAX_ROWS = 50;
type Elementos = Array<Record<string, unknown>>;

const LS_KEY = 'hestia.sup.painel.recolhido';
function lerRecolhido(): boolean {
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}
function gravarRecolhido(v: boolean): void {
  try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch { /* armazenamento indisponível: vale só nesta sessão */ }
}

/** O painel deve aparecer com esta seleção? Sem `when`, sempre (painel persistente). */
export function panelMatches(p: Pick<RegisteredPanel, 'when'>, elements: Elementos): boolean {
  if (!p.when) return true;
  const n = elements.filter((e) => e.kind === p.when!.kind).length;
  return n >= Math.max(1, p.when.minSelected ?? 1);
}

function ViewBlock({ n, els, units, lang, form }: { n: ViewNode; els: Elementos; units: ResolvedUnits; lang: Lang; form: FormApi }): ReactElement | null {
  const { t } = useT();
  switch (n.type) {
    case 'text': return <p className="pp-text">{txt(n.text as PluginText, lang)}</p>;
    case 'value': {
      const v = els[0] ? readFieldPath(els[0], n.field) : undefined;
      return <div className="pp-value">{n.label && <span className="pp-label">{txt(n.label as PluginText, lang)}</span>}<span>{v === undefined ? t('supui_panel_no_value') : displayValue(v, n.unit, units)}</span></div>;
    }
    case 'row': return <div className="pp-row">{n.children.map((c, i) => <ViewBlock key={i} n={c} els={els} units={units} lang={lang} form={form} />)}</div>;
    case 'table':
      if (els.length === 0) return <p className="pp-text">{t('supui_panel_no_selection')}</p>;
      return (
        <table className="pp-table">
          <thead><tr>{n.columns.map((c, i) => <th key={i}>{txt(c.title as PluginText, lang)}</th>)}</tr></thead>
          <tbody>{els.slice(0, MAX_ROWS).map((e, r) => <tr key={r}>{n.columns.map((c, i) => <td key={i}>{displayValue(readFieldPath(e, c.field), c.unit, units) || t('supui_panel_no_value')}</td>)}</tr>)}</tbody>
        </table>
      );
    case 'button': return <button className="btn" onClick={() => form.run(n.run)}>{txt(n.label as PluginText, lang)}</button>;
    case 'input': return <PluginField f={n.field} units={units} lang={lang} value={form.values[n.field.key] ?? initialFieldValue(n.field)} error={form.errors[n.field.key]} onChange={(v) => form.set(n.field.key, v)} />;
  }
}

interface FormApi {
  values: Record<string, number | string | boolean | undefined>;
  errors: FormErrors;
  set: (key: string, v: number | string | boolean | undefined) => void;
  run: (a: PluginAction) => void;
}

function PanelCard({ p, els, units, lang, ids }: { p: RegisteredPanel; els: Elementos; units: ResolvedUnits; lang: Lang; ids: string[] }): ReactElement {
  const parsed = useMemo(() => parseView(p.view), [p.view]);
  const view = parsed.ok ? parsed.view : [];
  const campos = useMemo(() => viewInputs(view), [view]);
  const [values, setValues] = useState<FormApi['values']>(() => Object.fromEntries(campos.map((f) => [f.key, initialFieldValue(f)])));
  const [errors, setErrors] = useState<FormErrors>({});
  const form: FormApi = {
    values, errors,
    set: (k, v) => { setValues((o) => ({ ...o, [k]: v })); setErrors((o) => { const { [k]: _, ...resto } = o; return resto; }); },
    run: (action) => {
      const r = checkForm(campos, values);
      if (!r.ok) { setErrors(r.errors); return; }
      runPluginAction(p.pluginId, action, { ...r.values, $selection: ids });
    },
  };
  return (
    <section className="pp-card" data-plugin-panel={p.qid}>
      <h3>{txt(p.title as PluginText, lang)}<small>{p.pluginName}</small></h3>
      {view.map((n, i) => <ViewBlock key={i} n={n} els={els} units={units} lang={lang} form={form} />)}
    </section>
  );
}

export function PluginPanels(): ReactElement | null {
  const { t, lang } = useT();
  usePluginRegistryVersion();
  const selection = useUi((s) => s.selection);
  useUi((s) => s.previewTick); // o projeto mudou: os valores mostrados acompanham
  const [recolhido, setRecolhido] = useState(lerRecolhido);
  const paineis = pluginRegistry.panels();
  if (paineis.length === 0) return null;
  const project = editor.project;
  const els: Elementos = selection.map((id) => (project.elements as Record<string, unknown>)[id]).filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null);
  const visiveis = paineis.filter((p) => panelMatches(p, els)).sort((a, b) => (a.dock === b.dock ? 0 : a.dock === 'properties' ? -1 : 1));
  if (visiveis.length === 0) return null;
  const units = unitsOf(project, lang);
  const alternar = (): void => { setRecolhido(!recolhido); gravarRecolhido(!recolhido); };
  if (recolhido) return <button className="pp-tab" aria-label={t('supui_panels')} title={t('supui_panels')} onClick={alternar}>⟨</button>;
  return (
    <aside className="pp-host" aria-label={t('supui_panels')}>
      <button className="pp-close" aria-label={t('supui_panels_close')} title={t('supui_panels_close')} onClick={alternar}>×</button>
      {visiveis.map((p) => <PanelCard key={p.qid} p={p} els={els.filter((e) => !p.when || e.kind === p.when.kind)} units={units} lang={lang} ids={selection} />)}
    </aside>
  );
}
