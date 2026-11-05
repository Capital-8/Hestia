import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  DIM_FAMILY_PADRAO,
  defaultDimensionFamilyIdOf,
  dimensionFamiliesOf,
  dimensionFamilyIssue,
  dimensionStyleOf,
  type DimensionFamily,
  type DimensionStyle,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import { Check, NumField, Row, TextField } from '../fields.tsx';
import {
  DIM_TICK_OPTIONS,
  PRECISION_OPTIONS,
  READ_CONVENTION_OPTIONS,
  STYLE_TEXT_MAX,
  TEXT_FIT_OPTIONS,
  TEXT_PLACEMENT_OPTIONS,
  UNIT_OPTIONS,
  fontOptions,
} from './dimensionStyleModel.ts';
import { DimensionStylePreview } from './dimensionStylePreview.tsx';
import { t as translate, useT, type Dict, type Lang } from '../../editor/i18n.ts';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Unidade de papel das medidas do estilo de cota (marcador, texto, folgas): não é medida do modelo. */
const PAPER_UNIT = 'mm';

/** Família implícita `Padrão` (o estilo global do projeto), para aparecer sempre na lista. */
function padraoFamily(lang: Lang): DimensionFamily {
  return { id: DIM_FAMILY_PADRAO, name: translate(lang, 'dlt_dim_family_default'), ...dimensionStyleOf(editor.project.settings) };
}

const novaFamilia = (base: DimensionFamily | undefined, existentes: readonly DimensionFamily[], lang: Lang): DimensionFamily => {
  const locale = lang === 'en' ? 'en' : 'pt-BR';
  const copia = (n: number): string => translate(lang, n === 1 ? 'dlt_duplicate_suffix' : 'dlt_duplicate_suffix_n', { n });
  const nova = (n: number): string => translate(lang, n === 1 ? 'dlt_dim_family_new' : 'dlt_dim_family_new_n', { n });
  const usados = new Set(existentes.map((f) => f.name.toLocaleLowerCase(locale)));
  let nome = base ? `${base.name} ${copia(1)}` : nova(1);
  let n = 1;
  while (usados.has(nome.toLocaleLowerCase(locale))) { n += 1; nome = base ? `${base.name} ${copia(n)}` : nova(n); }
  return { ...(base ?? { ...dimensionStyleOf(editor.project.settings) }), id: `fam_${Math.random().toString(36).slice(2, 10)}`, name: nome };
};

/**
 * "Famílias de cotas" (Revit: Dimension Types): lista de aparências nomeadas, com prévia ao vivo. Cada família é
 * autocontida (marcador, texto, folgas, leitura, formato); a `Padrão` é o estilo global do projeto, mantido compatível
 * com os projetos antigos. OK grava tudo num único passo de desfazer.
 */
export function DimensionFamiliesDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const salvas = useMemo(() => dimensionFamiliesOf(p.settings, lang), [p.settings, lang]);
  // A `Padrão` aparece sempre; as demais vêm das famílias gravadas (sem repetir a implícita).
  const inicial = useMemo(() => [padraoFamily(lang), ...salvas.filter((f) => f.id !== DIM_FAMILY_PADRAO)], [salvas, lang]);
  const [drafts, setDrafts] = useState<DimensionFamily[]>(() => inicial);
  const [selecionada, setSelecionada] = useState<string>(() => useUi.getState().dimFamilyFocus ?? defaultDimensionFamilyIdOf(p.settings));
  useEffect(() => { useUi.setState({ dimFamilyFocus: null }); }, []);
  const [padrao, setPadrao] = useState<string>(() => defaultDimensionFamilyIdOf(p.settings));
  const [erro, setErro] = useState<string | null>(null);
  const atual = drafts.find((f) => f.id === selecionada) ?? drafts[0]!;

  const trocar = (patch: Partial<DimensionFamily>): void => {
    setDrafts((lista) => lista.map((f) => (f.id === atual.id ? { ...f, ...patch } : f)));
    setErro(null);
  };

  const aplicar = (): void => {
    // Valida todas: nome único, enums e faixas; recusa o conjunto inteiro (nada de gravar família quebrada).
    for (const f of drafts) {
      const issue = dimensionFamilyIssue(f, drafts.filter((o) => o.id !== f.id));
      if (issue) { setSelecionada(f.id); setErro(t('dlt_dim_family_error', { family: f.name || t('dlt_fam_fallback'), error: issue })); return; }
    }
    const originais = dimensionFamiliesOf(editor.project.settings, lang);
    editor.store.transaction(t('dlt_dim_families_title'), () => {
      for (const f of drafts) {
        const antes = originais.find((o) => o.id === f.id);
        // O nome da família implícita é só de exibição: gravar mantém o nome canônico do modelo.
        const paraGravar = f.id === DIM_FAMILY_PADRAO && antes ? { ...f, name: antes.name } : f;
        const mudou = !antes || JSON.stringify(antes) !== JSON.stringify(paraGravar);
        if (!mudou) continue;
        editor.store.exec({ type: 'upsertDimensionFamily', family: paraGravar });
      }
      for (const antes of dimensionFamiliesOf(editor.project.settings, lang)) {
        if (antes.id !== DIM_FAMILY_PADRAO && !drafts.some((f) => f.id === antes.id)) editor.store.exec({ type: 'removeDimensionFamily', id: antes.id });
      }
      if (padrao !== defaultDimensionFamilyIdOf(editor.project.settings)) editor.store.exec({ type: 'setDefaultDimensionFamily', id: padrao });
    });
    close();
  };

  const numRow = (key: 'tickSize' | 'textHeight' | 'extensionGap' | 'extensionOvershoot' | 'textGap' | 'stackSpacing', label: string): ReactElement => (
    <Row label={label} htmlFor={`dfam-${key}`}>
      <NumField
        id={`dfam-${key}`}
        value={atual[key]}
        decimals={1}
        unit={PAPER_UNIT}
        min={0}
        onCommit={(v) => trocar({ [key]: v } as Partial<DimensionFamily>)}
      />
    </Row>
  );

  const selectRow = <K extends keyof DimensionStyle>(key: K, label: string, options: ReadonlyArray<{ value: DimensionStyle[K]; label: keyof Dict }>): ReactElement => (
    <Row label={label} htmlFor={`dfam-${String(key)}`}>
      <select id={`dfam-${String(key)}`} className="select" value={String(atual[key])} onChange={(e) => {
        const escolhido = options.find((o) => String(o.value) === e.target.value);
        if (escolhido) trocar({ [key]: escolhido.value } as Partial<DimensionFamily>);
      }}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{t(o.label)}</option>)}
      </select>
    </Row>
  );

  const ehPadrao = atual.id === DIM_FAMILY_PADRAO;

  return (
    <Dialog
      title={t('dlt_dim_families_title')}
      sub={t('dlt_dim_families_sub')}
      size="wide"
      onClose={close}
      onSubmit={aplicar}
      footer={
        <>
          <button className="btn" onClick={() => { const nova = novaFamilia(atual, drafts, lang); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>{t('dlt_btn_duplicate_plain')}</button>
          <button className="btn" onClick={() => { const nova = novaFamilia(undefined, drafts, lang); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>{t('dlt_btn_new')}</button>
          <button className="btn danger" disabled={ehPadrao} title={ehPadrao ? t('dlt_dim_family_delete_tip_default') : t('dlt_dim_family_delete_tip')} onClick={() => {
            setDrafts((l) => l.filter((f) => f.id !== atual.id));
            setSelecionada(padrao === atual.id ? DIM_FAMILY_PADRAO : padrao);
            if (padrao === atual.id) setPadrao(DIM_FAMILY_PADRAO);
          }}>{t('stt_delete')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('stt_cancel')}</button>
          <button className="btn primary" onClick={aplicar}>{t('stt_ok')}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12 }}>
        <div role="listbox" aria-label={t('dlt_dim_families_title')} style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 380, overflow: 'auto' }}>
          {drafts.map((f) => (
            <button
              key={f.id}
              role="option"
              aria-selected={f.id === atual.id}
              className={`rb-menuitem${f.id === atual.id ? ' on' : ''}`}
              style={{ textAlign: 'left', border: 'none', background: f.id === atual.id ? 'var(--accent-soft)' : 'transparent', padding: '5px 8px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}
              onClick={() => { setSelecionada(f.id); setErro(null); }}
            >
              <span>{f.name || t('dlt_dim_family_unnamed')}</span>
              {f.id === padrao ? <span className="soft" title={t('dlt_tt_project_default_family')}>{t('dlt_dim_family_default_tag')}</span> : null}
            </button>
          ))}
        </div>
        <div>
          {erro ? <div className="error" role="alert" style={{ marginBottom: 8 }}>{erro}</div> : null}
          <DimensionStylePreview style={atual} />
          <div style={{ height: 8 }} />
          <Row label={t('dlt_fld_name')} htmlFor="dfam-name">
            <TextField id="dfam-name" value={atual.name} disabled={ehPadrao} onCommit={(v) => trocar({ name: v })} />
          </Row>
          <Row label={t('dlt_fld_project_default')}>
            <Check id="dfam-default" checked={padrao === atual.id} disabled={ehPadrao} onChange={() => setPadrao(atual.id)}>{t('dlt_fld_use_for_new')}</Check>
          </Row>
          <div className="prow"><span className="soft">{ehPadrao ? t('dlt_dim_family_use_default') : t('dlt_dim_family_use_named')}</span></div>
          {selectRow('tick', t('dlt_fld_tick_mark'), DIM_TICK_OPTIONS)}
          {numRow('tickSize', t('dlt_fld_tick_size'))}
          {selectRow('textPlacement', t('dlt_fld_text_position'), TEXT_PLACEMENT_OPTIONS)}
          {selectRow('readConvention', t('dlt_fld_read_convention'), READ_CONVENTION_OPTIONS)}
          {numRow('textGap', t('dlt_fld_text_gap'))}
          {numRow('textHeight', t('dlt_fld_text_height'))}
          <Row label={t('dlt_fld_font')} htmlFor="dfam-font">
            <select id="dfam-font" className="select" value={atual.font} onChange={(e) => trocar({ font: e.target.value })}>
              {fontOptions(atual.font).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          {numRow('extensionGap', t('dlt_fld_ext_gap'))}
          {numRow('extensionOvershoot', t('dlt_fld_ext_overshoot'))}
          {numRow('stackSpacing', t('dlt_fld_stack_spacing'))}
          {selectRow('textFit', t('dlt_fld_text_fit'), TEXT_FIT_OPTIONS)}
          {selectRow('unit', t('dlt_fld_unit_measure'), UNIT_OPTIONS)}
          {selectRow('precision', t('dlt_fld_precision'), PRECISION_OPTIONS)}
          <Row label={t('dlt_fld_prefix')} htmlFor="dfam-prefix">
            <TextField id="dfam-prefix" value={atual.prefix} onCommit={(v) => trocar({ prefix: v.slice(0, STYLE_TEXT_MAX) })} />
          </Row>
          <Row label={t('dlt_fld_suffix')} htmlFor="dfam-suffix">
            <TextField id="dfam-suffix" value={atual.suffix} onCommit={(v) => trocar({ suffix: v.slice(0, STYLE_TEXT_MAX) })} />
          </Row>
        </div>
      </div>
    </Dialog>
  );
}
