import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  TAG_SHAPES,
  TAG_TOKENS,
  defaultTagFamilyIdOf,
  tagFamiliesOf,
  tagFamilyDraft,
  tagFamilyIssue,
  type TagFamily,
  type TagShape,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField, Row, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { TagFamilyPreview } from './TagFamilyPreview.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

const SHAPE_KEY = {
  none: 'tg_shape_none',
  circle: 'tg_shape_circle',
  hexagon: 'tg_shape_hexagon',
  rect: 'tg_shape_rect',
} as const;

/**
 * "Famílias de etiquetas" (Revit: Tag Types): lista de estilos de etiqueta nomeados, com modelo paramétrico de
 * rótulo (`{mark}`, `{width}×{height}`...), contorno, fundo opaco e altura em mm de papel. OK grava tudo em um único
 * passo de desfazer.
 */
export function TagFamiliesDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const inicial = useMemo(() => tagFamiliesOf(p.settings, lang), [p.settings, lang]);
  const [drafts, setDrafts] = useState<TagFamily[]>(() => inicial);
  const [selecionada, setSelecionada] = useState<string>(() => useUi.getState().tagFamilyFocus ?? defaultTagFamilyIdOf(p.settings));
  useEffect(() => { useUi.setState({ tagFamilyFocus: null }); }, []);
  const [padrao, setPadrao] = useState<string>(() => defaultTagFamilyIdOf(p.settings));
  const [erro, setErro] = useState<string | null>(null);
  const atual = drafts.find((f) => f.id === selecionada) ?? drafts[0]!;

  const trocar = (patch: Partial<TagFamily>): void => {
    setDrafts((lista) => lista.map((f) => (f.id === atual.id ? { ...f, ...patch } : f)));
    setErro(null);
  };

  const aplicar = (): void => {
    for (const f of drafts) {
      const issue = tagFamilyIssue(f, drafts.filter((o) => o.id !== f.id), lang);
      if (issue) {
        setSelecionada(f.id);
        setErro(t('tg_error', { family: f.name || t('tg_unnamed'), error: issue }));
        return;
      }
    }
    const originais = tagFamiliesOf(editor.project.settings, lang);
    editor.store.transaction(t('tg_undo_title'), () => {
      for (const f of drafts) {
        const antes = originais.find((o) => o.id === f.id);
        if (!antes || JSON.stringify(antes) !== JSON.stringify(f)) {
          editor.store.exec({ type: 'upsertTagFamily', family: f });
        }
      }
      for (const antes of originais) {
        if (!drafts.some((f) => f.id === antes.id)) {
          editor.store.exec({ type: 'removeTagFamily', id: antes.id });
        }
      }
      if (padrao !== defaultTagFamilyIdOf(editor.project.settings) && drafts.some((f) => f.id === padrao)) {
        editor.store.exec({ type: 'setDefaultTagFamily', id: padrao });
      }
    });
    useUi.setState((s) => ({ options: { ...s.options, tagFamilyId: padrao } }));
    close();
  };

  return (
    <Dialog
      title={t('tg_families_title')}
      sub={t('tg_families_sub')}
      size="wide"
      onClose={close}
      onSubmit={aplicar}
      footer={
        <>
          <button className="btn" onClick={() => { const nova = tagFamilyDraft(p.settings, atual, lang); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>{t('tg_btn_duplicate')}</button>
          <button className="btn" onClick={() => { const nova = tagFamilyDraft(p.settings, undefined, lang); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>{t('tg_btn_new')}</button>
          <button
            className="btn danger"
            disabled={drafts.length <= 1}
            onClick={() => {
              const rest = drafts.filter((f) => f.id !== atual.id);
              setDrafts(rest);
              const nextId = rest[0]!.id;
              setSelecionada(nextId);
              if (padrao === atual.id) setPadrao(nextId);
            }}
          >
            {t('tg_btn_delete')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('stt_cancel')}</button>
          <button className="btn primary" onClick={aplicar}>{t('stt_ok')}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12 }}>
        <div role="listbox" aria-label={t('tg_families_title')} style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflow: 'auto' }}>
          {drafts.map((f) => (
            <button
              key={f.id}
              role="option"
              aria-selected={f.id === atual.id}
              className={`rb-menuitem${f.id === atual.id ? ' on' : ''}`}
              style={{ textAlign: 'left', border: 'none', background: f.id === atual.id ? 'var(--accent-soft)' : 'transparent', padding: '5px 8px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}
              onClick={() => { setSelecionada(f.id); setErro(null); }}
            >
              <span>{f.name || t('tg_unnamed')}</span>
              {f.id === padrao ? <span className="soft">{t('tg_default_tag')}</span> : null}
            </button>
          ))}
        </div>
        <div>
          {erro ? <div className="error" role="alert" style={{ marginBottom: 8 }}>{erro}</div> : null}
          <TagFamilyPreview family={atual} />
          <div style={{ height: 8 }} />
          <Row label={t('tg_fld_name')} htmlFor="tfam-name">
            <TextField id="tfam-name" value={atual.name} onCommit={(v) => trocar({ name: v })} />
          </Row>
          <Row label={t('tg_fld_default')}>
            <Check id="tfam-default" checked={padrao === atual.id} onChange={() => setPadrao(atual.id)}>{t('tg_use_for_new')}</Check>
          </Row>
          <Row label={t('tg_fld_format')} htmlFor="tfam-format">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
              <textarea
                id="tfam-format"
                className="input wide"
                rows={2}
                value={atual.format}
                style={{ resize: 'vertical', minHeight: 42, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
                onChange={(e) => trocar({ format: e.target.value })}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TAG_TOKENS.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    className="btn small"
                    onClick={() => trocar({ format: `${atual.format}{${tok}}` })}
                  >
                    {`{${tok}}`}
                  </button>
                ))}
              </div>
              <span className="soft" style={{ fontSize: 11 }}>{t('tg_tokens_hint')}</span>
            </div>
          </Row>
          <Row label={t('tg_fld_shape')} htmlFor="tfam-shape">
            <select id="tfam-shape" className="select" value={atual.shape} onChange={(e) => trocar({ shape: e.target.value as TagShape })}>
              {TAG_SHAPES.map((s) => <option key={s} value={s}>{t(SHAPE_KEY[s])}</option>)}
            </select>
          </Row>
          <Row label={t('tg_fld_text_size')} htmlFor="tfam-mm">
            <NumField id="tfam-mm" value={atual.textMm} decimals={1} unit="mm" min={1} max={6} onCommit={(v) => trocar({ textMm: v })} />
          </Row>
          <Row label={t('tg_fld_fill')} htmlFor="tfam-fill">
            <Check id="tfam-fill" checked={atual.fill === true} onChange={(v) => trocar({ fill: v })}>{t('tg_fld_fill_hint')}</Check>
          </Row>
        </div>
      </div>
    </Dialog>
  );
}
