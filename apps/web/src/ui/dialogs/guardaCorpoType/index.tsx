import { useState, type ReactElement } from 'react';
import {
  newId,
  normaDe,
  perfisNormaDo,
  tipoGuardaCorpoIssue,
  type CorrimaoGC,
  type ExtensaoGC,
  type ExtremidadeEstiloGC,
  type FamiliaPainelGC,
  type JustificacaoGC,
  type LayoutSuporteGC,
  type SuportesGC,
  type PainelGC,
  type PreenchimentoGC,
  type TipoGuardaCorpo,
  type TrilhoGC,
} from '@hestia/model';
import { editor, useProject } from '../../../editor/controller.ts';
import { useI18n, useT } from '../../../editor/i18n.ts';
import { useUi } from '../../../editor/state.ts';
import { Check, NumField, TextField } from '../../fields.tsx';
import { FamilyPair, FamilyRow, FamilySection, FamilyTabs, FamilyTypeDialog } from '../familia/index.ts';
import { novoBalaustre, novoCorrimao, novoPainel, novoTrilho } from './novos.ts';
import { GuardaCorpoPreview } from './preview.tsx';

const LIMITE = { trilhos: 12, corrimaos: 4, preenchimentos: 8 };
const ABAS = ['geral', 'trilhos', 'corrimaos', 'postes', 'preenchimento', 'juncoes', 'norma'] as const;
type Aba = (typeof ABAS)[number];
const ABA_KEY: Record<Aba, 'gc6c_tab_general' | 'gc6c_tab_rails' | 'gc6c_tab_handrails' | 'gc6c_tab_posts' | 'gc6c_tab_infill' | 'gc6c_tab_joins' | 'gc6c_tab_norm'> = {
  geral: 'gc6c_tab_general',
  trilhos: 'gc6c_tab_rails',
  corrimaos: 'gc6c_tab_handrails',
  postes: 'gc6c_tab_posts',
  preenchimento: 'gc6c_tab_infill',
  juncoes: 'gc6c_tab_joins',
  norma: 'gc6c_tab_norm',
};
const FAMILIAS: FamiliaPainelGC[] = ['vidro', 'chapa', 'chapa-perfurada', 'tela', 'cabo-aco'];
const FAMILIA_KEY: Record<FamiliaPainelGC, 'gc6c_fam_glass' | 'gc6c_fam_sheet' | 'gc6c_fam_perf' | 'gc6c_fam_mesh' | 'gc6c_fam_cable'> = {
  vidro: 'gc6c_fam_glass',
  chapa: 'gc6c_fam_sheet',
  'chapa-perfurada': 'gc6c_fam_perf',
  tela: 'gc6c_fam_mesh',
  'cabo-aco': 'gc6c_fam_cable',
};

/**
 * Editor de tipo de guarda-corpo (decisão 0055, Fase 6c): geral, trilhos, corrimãos, postes, preenchimento (balaústres
 * e painéis), junções e norma. A validação fica em `tipoGuardaCorpoIssue`; o botão OK só grava se ela passar.
 */
export function GuardaCorpoTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const lang = useI18n((s) => s.lang);
  const src = p.tiposGuardaCorpo?.[typeId];
  const [draft, setDraft] = useState<TipoGuardaCorpo | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [aba, setAba] = useState<Aba>('geral');
  const [erro, setErro] = useState<string | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(p.tiposGuardaCorpo?.[typeId] ? structuredClone(p.tiposGuardaCorpo[typeId]!) : null);
    setErro(null);
  }
  if (!draft) return null;
  const issue = tipoGuardaCorpoIssue(draft, lang);
  const perfis = perfisNormaDo(p);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<TipoGuardaCorpo>): void => setDraft({ ...draft, ...patch });
  const materialId = draft.materialPadraoId;

  /** Grava o tipo: o OK fecha; o Salvar deixa o diálogo aberto com o rascunho. */
  const save = (fechar: boolean): boolean => {
    if (issue) return false;
    try {
      editor.store.exec({ type: 'upsertTipoGuardaCorpo', tipo: draft }, t('gc6c_undo_type'));
      setErro(null);
      if (fechar) close();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const duplicate = (): void => {
    const id = newId('gct');
    const copia: TipoGuardaCorpo = { ...structuredClone(draft), id, name: `${draft.name} ${t('dlt_duplicate_suffix')}` };
    try {
      editor.store.exec({ type: 'upsertTipoGuardaCorpo', tipo: copia }, t('gc6c_undo_type'));
      useUi.setState({ dialog: 'guardaCorpoType', dialogArg: id });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (): void => {
    try {
      editor.store.exec({ type: 'deleteTipoGuardaCorpo', id: draft.id }, t('gc6c_delete_type'));
      close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <FamilyTypeDialog
      title={t('gc6c_dlg_type')}
      sub={draft.name}
      onClose={close}
      size="fam"
      family={t('cvn_cat_railing')}
      types={Object.values(p.tiposGuardaCorpo ?? {})}
      currentId={draft.id}
      onDuplicate={duplicate}
      name={{ id: 'gc-t-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{ onDelete: remove, onApply: () => save(false), onOk: () => save(true), saveDisabled: !!issue, saveTitle: issue ?? undefined }}
    >
      <FamilyTabs tabs={ABAS.map((a) => ({ id: a, label: t(ABA_KEY[a]) }))} value={aba} onChange={setAba} />
      {(issue || erro) && <div className="vr-error" role="alert">{erro ?? issue}</div>}
      <div className="split">
        <div style={{ minWidth: 0 }}>
      {aba === 'geral' && (
        <>
          <FamilyRow label={t('gc6c_code')} htmlFor="gc-t-code"><TextField id="gc-t-code" value={draft.code} onCommit={(v) => set({ code: v })} /></FamilyRow>
          <FamilyRow label={t('gc6c_description')} htmlFor="gc-t-desc"><TextField id="gc-t-desc" value={draft.description} onCommit={(v) => set({ description: v })} /></FamilyRow>
          <FamilyPair>
            <FamilyRow label={t('gc6c_height')} htmlFor="gc-t-h"><NumField id="gc-t-h" value={draft.altura} unit="m" min={0.01} onCommit={(v) => set({ altura: v })} /></FamilyRow>
            <FamilyRow label={t('gc6c_axis_offset')} htmlFor="gc-t-d"><NumField id="gc-t-d" value={draft.deslocamento} unit="m" decimals={3} onCommit={(v) => set({ deslocamento: v })} /></FamilyRow>
          </FamilyPair>
          <FamilyPair>
            <FamilyRow label={t('gc6c_landing_adj')} htmlFor="gc-t-aj"><NumField id="gc-t-aj" value={draft.ajusteAlturaPatamar} unit="m" decimals={3} onCommit={(v) => set({ ajusteAlturaPatamar: v })} /></FamilyRow>
            <FamilyRow label={t('gc6c_bottom_gap')} htmlFor="gc-t-fi"><NumField id="gc-t-fi" value={draft.folgaInferior} unit="m" min={0} decimals={3} onCommit={(v) => set({ folgaInferior: v })} /></FamilyRow>
          </FamilyPair>
          <FamilyRow label={t('gc6c_cost')} htmlFor="gc-t-cost"><NumField id="gc-t-cost" value={draft.cost} min={0} onCommit={(v) => set({ cost: v })} /></FamilyRow>
          <FamilyRow label={t('gc6c_norm_type')} htmlFor="gc-t-norma">
            <select id="gc-t-norma" className="select" value={draft.normaId ?? ''} onChange={(e) => set({ normaId: e.target.value || null })}>
              <option value="">{t('gc6c_norm_project')}</option>
              {Object.values(perfis).map((pf) => <option key={pf.id} value={pf.id}>{pf.name}</option>)}
            </select>
          </FamilyRow>
        </>
      )}

      {aba === 'trilhos' && (
        <>
          {draft.trilhos.map((tr, i) => (
            <FamilySection key={i} title={tr.nome || `${i + 1}`} actions={<button type="button" className="link" onClick={() => set({ trilhos: draft.trilhos.filter((_, j) => j !== i) })}>{t('gc6c_remove')}</button>}>
              <FamilyRow label={t('gc6c_name')}><TextField value={tr.nome} onCommit={(v) => setTrilho(i, { nome: v })} /></FamilyRow>
              <FamilyPair>
                <FamilyRow label={t('gc6c_rail_height')}><NumField value={tr.altura} unit="m" min={0} onCommit={(v) => setTrilho(i, { altura: v })} /></FamilyRow>
                <FamilyRow label={t('gc6c_rail_offset')}><NumField value={tr.deslocamento} unit="m" decimals={3} onCommit={(v) => setTrilho(i, { deslocamento: v })} /></FamilyRow>
              </FamilyPair>
              <FamilyRow label={t('gc6c_diameter')}><NumField value={tr.perfil.largura} unit="m" min={0.001} decimals={3} onCommit={(v) => setTrilho(i, { perfil: { ...tr.perfil, largura: v } })} /></FamilyRow>
            </FamilySection>
          ))}
          <button type="button" disabled={draft.trilhos.length >= LIMITE.trilhos} onClick={() => set({ trilhos: [...draft.trilhos, novoTrilho(draft, materialId)] })}>{t('gc6c_rail_new')}</button>
        </>
      )}

      {aba === 'corrimaos' && (
        <>
          {draft.corrimaos.map((c, i) => (
            <FamilySection key={i} title={c.nome || `${i + 1}`} actions={<button type="button" className="link" onClick={() => set({ corrimaos: draft.corrimaos.filter((_, j) => j !== i) })}>{t('gc6c_remove')}</button>}>
              <FamilyRow label={t('gc6c_name')}><TextField value={c.nome} onCommit={(v) => setCorrimao(i, { nome: v })} /></FamilyRow>
              <FamilyRow label={t('gc6c_hr_func')}>
                <select className="select" value={c.funcao} onChange={(e) => setCorrimao(i, { funcao: e.target.value === 'topo' ? 'topo' : 'corrimao' })}>
                  <option value="topo">{t('gc6c_func_top')}</option>
                  <option value="corrimao">{t('gc6c_func_handrail')}</option>
                </select>
              </FamilyRow>
              <FamilyRow label={t('gc6c_side')}>
                <select className="select" value={c.posicao} onChange={(e) => setCorrimao(i, { posicao: e.target.value as CorrimaoGC['posicao'] })}>
                  <option value="eixo">{t('gc6c_pos_axis')}</option>
                  <option value="esquerda">{t('gc6c_pos_left')}</option>
                  <option value="direita">{t('gc6c_pos_right')}</option>
                  <option value="ambas">{t('gc6c_pos_both')}</option>
                </select>
              </FamilyRow>
              <FamilyPair>
                <FamilyRow label={t('gc6c_hr_height')}><NumField value={c.altura} unit="m" min={0} onCommit={(v) => setCorrimao(i, { altura: v })} /></FamilyRow>
                <FamilyRow label={t('gc6c_hr_clear')}><NumField value={c.afastamento} unit="m" min={0} decimals={3} onCommit={(v) => setCorrimao(i, { afastamento: v })} /></FamilyRow>
              </FamilyPair>
              <FamilyRow label={t('gc6c_diameter')}><NumField value={c.perfil.largura} unit="m" min={0.001} decimals={3} onCommit={(v) => setCorrimao(i, { perfil: { ...c.perfil, largura: v } })} /></FamilyRow>
              <FamilyRow label={t('gc6c_hr_join')}>
                <select className="select" value={c.juncao} onChange={(e) => setCorrimao(i, { juncao: e.target.value === 'filete' ? 'filete' : 'esquadria' })}>
                  <option value="esquadria">{t('gc6c_join_miter')}</option>
                  <option value="filete">{t('gc6c_join_fillet')}</option>
                </select>
              </FamilyRow>
              <FamilyRow label={t('gc6c_hr_transition')}>
                <select className="select" value={c.transicao} onChange={(e) => setCorrimao(i, { transicao: e.target.value as CorrimaoGC['transicao'] })}>
                  <option value="nenhuma">{t('gc6c_tr_none')}</option>
                  <option value="simples">{t('gc6c_tr_simple')}</option>
                  <option value="pescoco-de-ganso">{t('gc6c_tr_gooseneck')}</option>
                </select>
              </FamilyRow>
              <ExtensaoCampos titulo={t('gc6c_ext_start')} ext={c.extensaoInicio} onChange={(e) => setCorrimao(i, { extensaoInicio: e })} />
              <ExtensaoCampos titulo={t('gc6c_ext_end')} ext={c.extensaoFim} onChange={(e) => setCorrimao(i, { extensaoFim: e })} />
              <SuporteCampos suportes={c.suportes} onChange={(s) => setCorrimao(i, { suportes: s })} />
            </FamilySection>
          ))}
          <button type="button" disabled={draft.corrimaos.length >= LIMITE.corrimaos} onClick={() => set({ corrimaos: [...draft.corrimaos, novoCorrimao(draft, materialId)] })}>{t('gc6c_hr_new')}</button>
        </>
      )}

      {aba === 'postes' && (
        <>
          {(['inicio', 'fim', 'canto'] as const).map((k) => (
            <Check key={k} id={`gc-p-${k}`} checked={draft.postes[k].ativo} onChange={(v) => setPoste(k, { ativo: v })}>
              {k === 'inicio' ? t('gc6c_post_start') : k === 'fim' ? t('gc6c_post_end') : t('gc6c_post_corner')}
            </Check>
          ))}
          <Check id="gc-p-inter-ativo" checked={draft.postes.intermediario.ativo} onChange={(v) => setInter({ ativo: v })}>{t('gc6c_post_inter')}</Check>
          <FamilyPair>
            <FamilyRow label={t('gc6c_diameter')}><NumField value={draft.postes.inicio.perfil.largura} unit="m" min={0.001} decimals={3} onCommit={(v) => setTodosPostes(v)} /></FamilyRow>
            <FamilyRow label={t('gc6c_post_above')}><NumField value={draft.postes.inicio.alturaAcima} unit="m" min={0} decimals={3} onCommit={(v) => setTodosPostes(undefined, v)} /></FamilyRow>
          </FamilyPair>
          <FamilyRow label={t('gc6c_post_mode')}>
            <select className="select" value={draft.postes.intermediario.modo} onChange={(e) => setInter({ modo: e.target.value as TipoGuardaCorpo['postes']['intermediario']['modo'] })}>
              <option value="nenhum">{t('gc6c_pm_none')}</option>
              <option value="espacamento-maximo">{t('gc6c_pm_max')}</option>
              <option value="espacamento-fixo">{t('gc6c_pm_fixed')}</option>
              <option value="numero-fixo">{t('gc6c_pm_count')}</option>
            </select>
          </FamilyRow>
          <FamilyPair>
            <FamilyRow label={t('gc6c_post_spacing')}><NumField value={draft.postes.intermediario.espacamento} unit="m" min={0} decimals={3} onCommit={(v) => setInter({ espacamento: v })} /></FamilyRow>
            <FamilyRow label={t('gc6c_post_number')}><NumField value={draft.postes.intermediario.numero} min={0} decimals={0} onCommit={(v) => setInter({ numero: Math.round(v) })} /></FamilyRow>
          </FamilyPair>
          <FamilyRow label={t('gc6c_post_angle')}><NumField value={(draft.postes.anguloCanto * 180) / Math.PI} min={0} decimals={1} onCommit={(v) => set({ postes: { ...draft.postes, anguloCanto: (v * Math.PI) / 180 } })} /></FamilyRow>
        </>
      )}

      {aba === 'preenchimento' && (
        <>
          {draft.preenchimentos.length === 0 && <p className="hint">{t('gc6c_inf_none')}</p>}
          {draft.preenchimentos.map((pr, i) => (
            <FamilySection
              key={i}
              title={pr.nome || `${i + 1}`}
              actions={
                <>
                  <button type="button" className="link" disabled={i === 0} onClick={() => moverPreench(i, -1)}>{t('gc6c_move_up')}</button>
                  <button type="button" className="link" disabled={i === draft.preenchimentos.length - 1} onClick={() => moverPreench(i, 1)}>{t('gc6c_move_down')}</button>
                  <button type="button" className="link" onClick={() => set({ preenchimentos: draft.preenchimentos.filter((_, j) => j !== i) })}>{t('gc6c_remove')}</button>
                </>
              }
            >
              <FamilyRow label={t('gc6c_name')}><TextField value={pr.nome} onCommit={(v) => setPreench(i, { nome: v })} /></FamilyRow>
              {pr.tipo === 'balaustres' ? (
                <>
                  <FamilyPair>
                    <FamilyRow label={t('gc6c_inf_period')}><NumField value={pr.periodo} unit="m" min={0.001} decimals={3} onCommit={(v) => setPreench(i, { periodo: v })} /></FamilyRow>
                    <FamilyRow label={t('gc6c_diameter')}>
                      <NumField value={pr.elementos[0]?.modelo?.perfil.largura ?? null} unit="m" min={0.001} decimals={3} onCommit={(v) => setPreench(i, { elementos: pr.elementos.map((el, j) => (j === 0 && el.modelo ? { ...el, modelo: { ...el.modelo, perfil: { ...el.modelo.perfil, largura: v } } } : el)) })} />
                    </FamilyRow>
                  </FamilyPair>
                  <Check id={`gc-pd-${i}`} checked={pr.porDegrau.ativo} onChange={(v) => setPreench(i, { porDegrau: { ...pr.porDegrau, ativo: v } })}>{t('gc6c_pd_active')}</Check>
                  <Check id={`gc-pd-auto-${i}`} checked={pr.porDegrau.automatico === true} onChange={(v) => setPreench(i, { porDegrau: { ...pr.porDegrau, automatico: v } })}>{t('gc6c_pd_auto')}</Check>
                  {pr.porDegrau.automatico !== true && <>
                  <FamilyRow label={t('gc6c_pd_qty')}><NumField value={pr.porDegrau.quantidade} min={1} decimals={0} onCommit={(v) => setPreench(i, { porDegrau: { ...pr.porDegrau, quantidade: Math.max(1, Math.round(v)) } })} /></FamilyRow>
                  <Check id={`gc-pd-centro-${i}`} checked={pr.porDegrau.distanciaDoBocel === null} onChange={(v) => setPreench(i, { porDegrau: { ...pr.porDegrau, distanciaDoBocel: v ? null : 0.05 } })}>{t('gc6c_pd_center')}</Check>
                  {pr.porDegrau.distanciaDoBocel !== null && (
                    <FamilyRow label={t('gc6c_pd_edge')}><NumField value={pr.porDegrau.distanciaDoBocel} unit="m" min={0} decimals={3} onCommit={(v) => setPreench(i, { porDegrau: { ...pr.porDegrau, distanciaDoBocel: v } })} /></FamilyRow>
                  )}
                  </>}
                </>
              ) : (
                <>
                  <FamilyRow label={t('gc6c_inf_family')}>
                    <select className="select" value={pr.familia} onChange={(e) => setPreench(i, { familia: e.target.value as FamiliaPainelGC })}>
                      {FAMILIAS.map((f) => <option key={f} value={f}>{t(FAMILIA_KEY[f])}</option>)}
                    </select>
                  </FamilyRow>
                  <FamilyPair>
                    <FamilyRow label={t('gc6c_inf_thickness')}><NumField value={pr.espessura} unit="m" min={0.001} decimals={3} onCommit={(v) => setPreench(i, { espessura: v })} /></FamilyRow>
                    <FamilyRow label={t('gc6c_inf_max_width')}><NumField value={pr.larguraMaxima} unit="m" min={0} decimals={3} onCommit={(v) => setPreench(i, { larguraMaxima: v })} /></FamilyRow>
                  </FamilyPair>
                </>
              )}
            </FamilySection>
          ))}
          <button type="button" disabled={draft.preenchimentos.length >= LIMITE.preenchimentos} onClick={() => set({ preenchimentos: [...draft.preenchimentos, novoBalaustre(t('gc6c_inf_balusters'), materialId)] })}>{t('gc6c_inf_balusters')}</button>
          <button type="button" disabled={draft.preenchimentos.length >= LIMITE.preenchimentos} onClick={() => set({ preenchimentos: [...draft.preenchimentos, novoPainel(t('gc6c_inf_panel'), materialId)] })}>{t('gc6c_inf_panel')}</button>
        </>
      )}

      {aba === 'juncoes' && (
        <>
          <FamilyRow label={t('gc6c_join_angular')}>
            <select className="select" value={draft.juncaoAngular} onChange={(e) => set({ juncaoAngular: e.target.value === 'segmento-vertical' ? 'segmento-vertical' : 'nenhum' })}>
              <option value="nenhum">{t('gc6c_tr_none')}</option>
              <option value="segmento-vertical">{t('gc6c_join_segment')}</option>
            </select>
          </FamilyRow>
          <FamilyRow label={t('gc6c_join_tangent')}>
            <select className="select" value={draft.juncaoTangente} onChange={(e) => set({ juncaoTangente: e.target.value as TipoGuardaCorpo['juncaoTangente'] })}>
              <option value="nenhum">{t('gc6c_tr_none')}</option>
              <option value="segmento-vertical">{t('gc6c_join_segment')}</option>
              <option value="estender-trilhos">{t('gc6c_join_extend')}</option>
            </select>
          </FamilyRow>
          <FamilyRow label={t('gc6c_join_conn')}>
            <select className="select" value={draft.conexaoTrilho} onChange={(e) => set({ conexaoTrilho: e.target.value === 'soldar' ? 'soldar' : 'cortar' })}>
              <option value="cortar">{t('gc6c_conn_cut')}</option>
              <option value="soldar">{t('gc6c_conn_weld')}</option>
            </select>
          </FamilyRow>
        </>
      )}

      {aba === 'norma' && (
        <>
          <FamilyRow label={t('gc6c_norm_type')} htmlFor="gc-n-tipo">
            <select id="gc-n-tipo" className="select" value={draft.normaId ?? ''} onChange={(e) => set({ normaId: e.target.value || null })}>
              <option value="">{t('gc6c_norm_project')}</option>
              {Object.values(perfis).map((pf) => <option key={pf.id} value={pf.id}>{pf.name}</option>)}
            </select>
          </FamilyRow>
          <p className="hint">{normaDe(p, draft).name}</p>
          <button type="button" className="link" onClick={() => useUi.setState({ dialog: 'normaGuardaCorpo', dialogArg: null })}>{t('gc6c_norm_title')}</button>
        </>
      )}
        </div>
        <div style={{ alignSelf: 'start', position: 'sticky', top: 0, minWidth: 0 }}>
          <GuardaCorpoPreview tipo={draft} />
        </div>
      </div>
    </FamilyTypeDialog>
  );

  /** Troca um trilho pelo índice. */
  function setTrilho(i: number, patch: Partial<TrilhoGC>): void {
    set({ trilhos: draft!.trilhos.map((tr, j) => (j === i ? { ...tr, ...patch } : tr)) });
  }
  /** Troca um corrimão pelo índice. */
  function setCorrimao(i: number, patch: Partial<CorrimaoGC>): void {
    set({ corrimaos: draft!.corrimaos.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  }
  /** Troca um poste de início, fim ou canto. */
  function setPoste(k: 'inicio' | 'fim' | 'canto', patch: Partial<TipoGuardaCorpo['postes']['inicio']>): void {
    set({ postes: { ...draft!.postes, [k]: { ...draft!.postes[k], ...patch } } });
  }
  /** Troca o poste intermediário. */
  function setInter(patch: Partial<TipoGuardaCorpo['postes']['intermediario']>): void {
    set({ postes: { ...draft!.postes, intermediario: { ...draft!.postes.intermediario, ...patch } } });
  }
  /** Diâmetro e altura acima valem para todos os postes. */
  function setTodosPostes(diametro?: number, acima?: number): void {
    const aplica = (poste: TipoGuardaCorpo['postes']['inicio']): TipoGuardaCorpo['postes']['inicio'] => ({
      ...poste,
      perfil: diametro === undefined ? poste.perfil : { ...poste.perfil, largura: diametro },
      alturaAcima: acima === undefined ? poste.alturaAcima : acima,
    });
    const d = draft!;
    set({ postes: { ...d.postes, inicio: aplica(d.postes.inicio), fim: aplica(d.postes.fim), canto: aplica(d.postes.canto), intermediario: { ...d.postes.intermediario, ...aplica(d.postes.intermediario) } } });
  }
  /** Sobe ou desce um preenchimento na ordem de desenho. */
  function moverPreench(i: number, d: number): void {
    const arr = [...draft!.preenchimentos];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    set({ preenchimentos: arr });
  }
  /** Troca um preenchimento pelo índice (o patch vale para o tipo do item). */
  function setPreench(i: number, patch: Partial<PreenchimentoGC> & Partial<PainelGC>): void {
    set({ preenchimentos: draft!.preenchimentos.map((pr, j) => (j === i ? ({ ...pr, ...patch } as PreenchimentoGC) : pr)) });
  }
}

/** Campos de uma extremidade do corrimão: apoio (parede, piso, poste), comprimento e a profundidade de degrau extra. */
function ExtensaoCampos({ titulo, ext, onChange }: { titulo: string; ext: ExtensaoGC; onChange: (e: ExtensaoGC) => void }): ReactElement {
  const { t } = useT();
  return (
    <FamilySection title={titulo} defaultOpen={false}>
      <FamilyRow label={t('gc6c_ext_style')}>
        <select className="select" value={ext.estilo} onChange={(e) => onChange({ ...ext, estilo: e.target.value as ExtremidadeEstiloGC })}>
          <option value="nenhum">{t('gc6c_ext_none')}</option>
          <option value="parede">{t('gc6c_ext_wall')}</option>
          <option value="piso">{t('gc6c_ext_floor')}</option>
          <option value="poste">{t('gc6c_ext_post')}</option>
        </select>
      </FamilyRow>
      <FamilyRow label={t('gc6c_ext_length')}><NumField value={ext.comprimento} unit="m" min={0} decimals={3} onCommit={(v) => onChange({ ...ext, comprimento: v })} /></FamilyRow>
      <Check checked={ext.maisPiso} onChange={(v) => onChange({ ...ext, maisPiso: v })}>{t('gc6c_ext_plus_tread')}</Check>
    </FamilySection>
  );
}

/** Campos dos suportes do corrimão: layout, espaçamento ou número, justificação e comprimento do suporte. */
function SuporteCampos({ suportes, onChange }: { suportes: SuportesGC; onChange: (s: SuportesGC) => void }): ReactElement {
  const { t } = useT();
  const layouts: LayoutSuporteGC[] = ['nenhum', 'distancia-fixa', 'alinhar-postes', 'numero-fixo', 'espacamento-maximo', 'espacamento-minimo'];
  const layoutKey: Record<LayoutSuporteGC, 'gc6c_sl_none' | 'gc6c_sl_fixed_dist' | 'gc6c_sl_align_posts' | 'gc6c_sl_fixed_count' | 'gc6c_sl_max_spacing' | 'gc6c_sl_min_spacing'> = {
    nenhum: 'gc6c_sl_none',
    'distancia-fixa': 'gc6c_sl_fixed_dist',
    'alinhar-postes': 'gc6c_sl_align_posts',
    'numero-fixo': 'gc6c_sl_fixed_count',
    'espacamento-maximo': 'gc6c_sl_max_spacing',
    'espacamento-minimo': 'gc6c_sl_min_spacing',
  };
  const justificacoes: JustificacaoGC[] = ['inicio', 'centro', 'fim', 'distribuir'];
  const justKey: Record<JustificacaoGC, 'gc6c_just_start' | 'gc6c_just_center' | 'gc6c_just_end' | 'gc6c_just_distribute'> = {
    inicio: 'gc6c_just_start',
    centro: 'gc6c_just_center',
    fim: 'gc6c_just_end',
    distribuir: 'gc6c_just_distribute',
  };
  return (
    <FamilySection title={t('gc6c_sup_layout')} defaultOpen={false}>
      <FamilyRow label={t('gc6c_sup_layout')}>
        <select className="select" value={suportes.layout} onChange={(e) => onChange({ ...suportes, layout: e.target.value as LayoutSuporteGC })}>
          {layouts.map((l) => <option key={l} value={l}>{t(layoutKey[l])}</option>)}
        </select>
      </FamilyRow>
      <FamilyPair>
        <FamilyRow label={t('gc6c_post_spacing')}><NumField value={suportes.espacamento} unit="m" min={0} decimals={3} onCommit={(v) => onChange({ ...suportes, espacamento: v })} /></FamilyRow>
        <FamilyRow label={t('gc6c_sup_number')}><NumField value={suportes.numero} min={0} decimals={0} onCommit={(v) => onChange({ ...suportes, numero: Math.round(v) })} /></FamilyRow>
      </FamilyPair>
      <FamilyRow label={t('gc6c_sup_justify')}>
        <select className="select" value={suportes.justificacao} onChange={(e) => onChange({ ...suportes, justificacao: e.target.value as JustificacaoGC })}>
          {justificacoes.map((j) => <option key={j} value={j}>{t(justKey[j])}</option>)}
        </select>
      </FamilyRow>
      <FamilyRow label={t('gc6c_sup_length')}><NumField value={suportes.comprimento} unit="m" min={0} decimals={3} onCommit={(v) => onChange({ ...suportes, comprimento: v })} /></FamilyRow>
    </FamilySection>
  );
}
