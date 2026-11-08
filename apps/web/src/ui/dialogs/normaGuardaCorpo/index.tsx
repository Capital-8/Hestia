import { useState, type ReactElement, type ReactNode } from 'react';
import {
  NORMA_GC_PADRAO_ID,
  newId,
  perfilNormaIssue,
  perfisNormaDo,
  perfisNormaPadrao,
  type FonteNormaGC,
  type LimitesNormaGC,
  type PerfilNorma,
} from '@hestia/model';
import { editor, useProject } from '../../../editor/controller.ts';
import { useI18n, useT, type Dict } from '../../../editor/i18n.ts';
import { useUi } from '../../../editor/state.ts';
import { Check, NumField, Row, TextField } from '../../fields.tsx';
import { Dialog } from '../Dialog.tsx';

type Chave = keyof Dict;

/** Limites numéricos editáveis, com o rótulo de cada um (o valor vem em metros, newtons ou kPa, como no rótulo). */
const NUMERICOS: ReadonlyArray<readonly [keyof LimitesNormaGC, Chave]> = [
  ['desnivelExigeGuarda', 'gc6c_lim_desnivel'],
  ['alturaMinima', 'gc6c_lim_altura_min'],
  ['alturaMinimaEscadaInterna', 'gc6c_lim_altura_escada'],
  ['esferaMaxima', 'gc6c_lim_esfera'],
  ['esferaMaximaTriangulo', 'gc6c_lim_esfera_tri'],
  ['folgaInferiorMaxima', 'gc6c_lim_folga'],
  ['cargaLinearHorizontal', 'gc6c_lim_carga_lin'],
  ['cargaAreaHorizontal', 'gc6c_lim_carga_area'],
  ['cargaPontualGuarda', 'gc6c_lim_carga_pontual'],
  ['corrimaoAlturaMin', 'gc6c_lim_cor_alt_min'],
  ['corrimaoAlturaMax', 'gc6c_lim_cor_alt_max'],
  ['corrimaoDiametroMin', 'gc6c_lim_cor_dmin'],
  ['corrimaoDiametroMax', 'gc6c_lim_cor_dmax'],
  ['corrimaoAfastamentoMin', 'gc6c_lim_cor_afast'],
  ['corrimaoExtensaoMin', 'gc6c_lim_cor_ext'],
  ['corrimaoIntermediarioLargura', 'gc6c_lim_cor_int_larg'],
  ['corrimaoIntermediarioEspacamento', 'gc6c_lim_cor_int_esp'],
  ['cargaCorrimao', 'gc6c_lim_cor_carga'],
];

/** Fonte de um limite em uma linha curta: norma, item e o selo "a conferir" quando não verificada. */
function fonteTexto(f: FonteNormaGC | undefined, pendente: string): string {
  if (!f) return '';
  return `${f.norma} ${f.item}${f.verificado ? '' : ` · ${pendente}`}`;
}

/**
 * Editor de perfis de norma do guarda-corpo (decisão 0055, Fase 6c): escolhe o perfil do projeto, edita os limites com a
 * fonte de cada um, duplica e restaura as predefinições. Os valores só geram avisos; a validação fica em `perfilNormaIssue`.
 */
export function NormaGuardaCorpoDialog(): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const lang = useI18n((s) => s.lang);
  const perfis = perfisNormaDo(p);
  const projetoId = p.settings.normaGuardaCorpoId ?? NORMA_GC_PADRAO_ID;
  const [sel, setSel] = useState<string>(projetoId);
  const [draft, setDraft] = useState<PerfilNorma | null>(perfis[sel] ? structuredClone(perfis[sel]!) : null);
  const [current, setCurrent] = useState(sel);
  const [erro, setErro] = useState<string | null>(null);
  if (current !== sel) {
    setCurrent(sel);
    setDraft(perfis[sel] ? structuredClone(perfis[sel]!) : null);
    setErro(null);
  }
  if (!draft) return null;
  const issue = perfilNormaIssue(draft, lang);
  const salvo = perfis[draft.id];
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<PerfilNorma>): void => setDraft({ ...draft, ...patch });
  /** Define um limite; `undefined` tira o campo (não verificar). */
  const setLim = (k: keyof LimitesNormaGC, v: unknown): void => {
    const lim: Record<string, unknown> = { ...draft.limites };
    if (v === undefined) delete lim[k];
    else lim[k] = v;
    set({ limites: lim as LimitesNormaGC });
  };
  const preset = perfisNormaPadrao(lang)[draft.id];
  const limites = draft.limites;

  const run = (fn: () => void): void => {
    try {
      fn();
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }

  };

  const save = (): void => {
    if (issue) return;
    run(() => editor.store.exec({ type: 'upsertPerfilNorma', perfil: draft }, t('gc6c_norm_title')));
  };

  const duplicate = (): void => {
    const id = newId('norma');
    const copia: PerfilNorma = { ...structuredClone(draft), id, name: `${draft.name} ${t('dlt_duplicate_suffix')}` };
    run(() => {
      editor.store.exec({ type: 'upsertPerfilNorma', perfil: copia }, t('gc6c_norm_new'));
      setSel(id);
    });
  };

  const remove = (): void => {
    run(() => {
      editor.store.exec({ type: 'deletePerfilNorma', id: draft.id }, t('gc6c_delete_type'));
      setSel(projetoId);
    });
  };

  const useInProject = (): void => {
    run(() => editor.store.exec({ type: 'setNormaGuardaCorpo', id: draft.id }, t('gc6c_norm_use_project')));
  };

  const footer: ReactNode = (
    <>
      {draft.id !== projetoId && salvo && <button type="button" className="link" onClick={remove}>{t('gc6c_delete_type')}</button>}
      <button type="button" className="link" onClick={duplicate}>{t('gc6c_duplicate')}</button>
      {preset && <button type="button" className="link" onClick={() => setDraft(structuredClone(preset))}>{t('gc6c_norm_restore')}</button>}
      <span style={{ flex: 1 }} />
      <button type="button" onClick={close}>{t('gc6c_cancel')}</button>
      <button type="button" onClick={save} disabled={!!issue}>{t('gc6c_save')}</button>
      <button type="button" className="apply" disabled={!salvo || draft.id === projetoId} onClick={useInProject}>{t('gc6c_norm_use_project')}</button>
    </>
  );

  return (
    <Dialog title={t('gc6c_norm_title')} sub={t('gc6c_norm_in_project')} onClose={close} footer={footer} size="wide">
      <Row label={t('gc6c_norm_profile')} htmlFor="gc-norm-sel">
        <select id="gc-norm-sel" className="select" value={sel} onChange={(e) => setSel(e.target.value)}>
          {Object.values(perfis).map((pf) => (
            <option key={pf.id} value={pf.id}>{pf.name}{pf.id === projetoId ? ` (${t('gc6c_norm_in_project')})` : ''}</option>
          ))}
        </select>
      </Row>
      <p className="hint">{t('gc6c_norm_hint')}</p>
      {(issue || erro) && <p className="hint" role="alert">{erro ?? issue}</p>}
      <Row label={t('gc6c_norm_name')} htmlFor="gc-norm-name"><TextField id="gc-norm-name" value={draft.name} onCommit={(v) => set({ name: v })} /></Row>
      <Row label={t('gc6c_norm_country')} htmlFor="gc-norm-pais"><TextField id="gc-norm-pais" value={draft.pais} onCommit={(v) => set({ pais: v.toUpperCase().slice(0, 2) })} /></Row>
      <Row label={t('gc6c_norm_use')} htmlFor="gc-norm-uso">
        <select id="gc-norm-uso" className="select" value={draft.uso} onChange={(e) => set({ uso: e.target.value as PerfilNorma['uso'] })}>
          <option value="geral">{t('gc6c_nu_general')}</option>
          <option value="residencial">{t('gc6c_nu_residential')}</option>
          <option value="publico">{t('gc6c_nu_public')}</option>
          <option value="saida-emergencia">{t('gc6c_nu_exit')}</option>
        </select>
      </Row>
      <Check id="gc-norm-verif" checked={draft.verificado} onChange={(v) => set({ verificado: v })}>{t('gc6c_norm_verified')}</Check>
      <h3>{t('gc6c_norm_limits')}</h3>
      {NUMERICOS.map(([k, label]) => (
        <Row key={k} label={t(label)} htmlFor={`gc-lim-${k}`}>
          <span>
            <NumField id={`gc-lim-${k}`} value={(limites[k] as number | undefined) ?? null} decimals={3} min={0} onCommit={(v) => setLim(k, v)} onClear={() => setLim(k, undefined)} />
            <small className="hint"> {fonteTexto(draft.fontes[k], t('gc6c_norm_pending'))}</small>
          </span>
        </Row>
      ))}
      <Row label={t('gc6c_lim_alta_acima')} htmlFor="gc-lim-alta-acima">
        <NumField id="gc-lim-alta-acima" value={limites.alturaMinimaAlta?.acimaDe ?? null} decimals={3} min={0} onCommit={(v) => setLim('alturaMinimaAlta', { acimaDe: v, altura: limites.alturaMinimaAlta?.altura ?? v })} onClear={() => setLim('alturaMinimaAlta', undefined)} />
      </Row>
      <Row label={t('gc6c_lim_alta_altura')} htmlFor="gc-lim-alta-altura">
        <NumField id="gc-lim-alta-altura" value={limites.alturaMinimaAlta?.altura ?? null} decimals={3} min={0} onCommit={(v) => setLim('alturaMinimaAlta', { acimaDe: limites.alturaMinimaAlta?.acimaDe ?? v, altura: v })} onClear={() => setLim('alturaMinimaAlta', undefined)} />
      </Row>
      <Row label={t('gc6c_lim_cor_extra')} htmlFor="gc-lim-extra">
        <TextField
          id="gc-lim-extra"
          value={(limites.corrimaoAlturasAdicionais ?? []).join('; ')}
          onCommit={(v) => {
            const lista = v.split(';').map((x) => Number(x.trim().replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0);
            setLim('corrimaoAlturasAdicionais', lista.length > 0 ? lista : undefined);
          }}
        />
      </Row>
      <Check id="gc-lim-dois" checked={limites.corrimaoDoisLados === true} onChange={(v) => setLim('corrimaoDoisLados', v)}>{t('gc6c_lim_cor_dois')}</Check>
      <Check id="gc-lim-cont" checked={limites.corrimaoContinuo === true} onChange={(v) => setLim('corrimaoContinuo', v)}>{t('gc6c_lim_cor_cont')}</Check>
    </Dialog>
  );
}
