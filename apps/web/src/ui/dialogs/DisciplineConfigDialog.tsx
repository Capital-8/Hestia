import { Fragment, useState, type ReactElement } from 'react';
import {
  disciplinasDoProjeto,
  isBuiltinDiscipline,
  perfilDaDisciplina,
  tDoModelo,
  type ChaveModelo,
  type Discipline,
  type Tone,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { pedirConfirmacao } from '../../editor/confirmacaoPrompt.ts';
import {
  apresentacaoDoEstado,
  copiarPerfilDe,
  criarDisciplina,
  definirApresentacaoDaCategoria,
  definirApresentacaoDaDisciplina,
  definirOpacidadeDasReferencias,
  definirOrigemDaCategoria,
  excluirDisciplina,
  linhasDaMatriz,
  linhasSimples,
  renomearDisciplina,
  restaurarPerfil,
  type DisciplineEdit,
  type LinhaDaMatriz,
} from '../../editor/disciplineConfig.ts';
import { rotuloDaDisciplina } from '../../editor/planViewActions.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type Lang } from '../../editor/i18n.ts';
import { categoryLabel } from '../graphicsLabels.ts';
import { Dialog } from './Dialog.tsx';

/** Ordem dos tons na lista (do normal ao oculto, como na tabela do ADR 0060 §4.2). */
const TONE_ORDER: readonly Tone[] = ['normal', 'halftone', 'hidden'];
const toneLabel = (lang: Lang, tone: Tone): string => tDoModelo(lang, `md_tone_${tone}` as ChaveModelo);

/** Rótulo do estado no modo simples: Normal / Referência / Oculto (o plano de UX usa “Referência” para o meio-tom). */
const stateKey = (tone: Tone): 'dsc_state_normal' | 'dsc_state_reference' | 'dsc_state_hidden' =>
  tone === 'normal' ? 'dsc_state_normal' : tone === 'hidden' ? 'dsc_state_hidden' : 'dsc_state_reference';

/** Linhas já agrupadas pela origem efetiva, na ordem em que `linhasDaMatriz` as devolve. */
function gruposDeLinhas(linhas: LinhaDaMatriz[]): Array<{ origem: LinhaDaMatriz['origem']; linhas: LinhaDaMatriz[] }> {
  const grupos = new Map<LinhaDaMatriz['origem'], LinhaDaMatriz[]>();
  for (const linha of linhas) {
    const lista = grupos.get(linha.origem);
    if (lista) lista.push(linha);
    else grupos.set(linha.origem, [linha]);
  }
  return [...grupos.entries()].map(([origem, lista]) => ({ origem, linhas: lista }));
}

/** Converte a apresentação escolhida no seletor de tom, preservando clareamento/opacidade só quando continua referência. */
function apresentacaoDoTom(linha: LinhaDaMatriz, tone: Tone): { tone: Tone; clareamento: number; opacidade: number } {
  if (tone === 'halftone') {
    return linha.apresentacao.tone === 'halftone'
      ? { tone, clareamento: linha.apresentacao.clareamento ?? 0.5, opacidade: linha.apresentacao.opacidade ?? 1 }
      : { tone, clareamento: 0.5, opacidade: 1 };
  }
  return { tone, clareamento: 0, opacidade: 1 };
}

/**
 * Configurador de disciplinas (decisão 0060, adendo 3; plano de UX de 2026-11-23): à esquerda, as disciplinas do
 * projeto (as cinco embutidas e as criadas). À direita, duas abas: **Simples** (disciplina × disciplina, com o slider
 * global das referências) e **Avançado** (matriz por categoria, com clareamento e opacidade). Cada alteração grava um
 * comando (um passo de desfazer) e a recusa aparece em `role="alert"`. É um diálogo do PROJETO, não da vista.
 */
export function DisciplineConfigDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const arg = useUi((s) => s.dialogArg);
  const disciplinas = disciplinasDoProjeto(p);
  const [selecionadaId, setSelecionadaId] = useState<Discipline>((arg as Discipline | null) ?? 'arquitetura');
  const selecionada = disciplinas.find((d) => d.id === selecionadaId) ?? disciplinas[0]!;
  const builtin = isBuiltinDiscipline(selecionada.id);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'simples' | 'avancado'>('simples');
  const [opacidadeManual, setOpacidadeManual] = useState<number | null>(null);
  const [modo, setModo] = useState<'novo' | 'editar' | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('#808080');
  const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const linhas = linhasDaMatriz(p, selecionada.id);
  const grupos = gruposDeLinhas(linhas);
  const simples = linhasSimples(p, selecionada.id);
  const perfilVazio = Object.keys(perfilDaDisciplina(p, selecionada.id)).length === 0;
  const outras = disciplinas.filter((d) => d.id !== selecionada.id);
  // Opacidade mostrada no slider: a média atual das referências (50% quando não há nenhuma ou antes de mexer).
  const referencias = linhas.filter((l) => l.apresentacao.tone === 'halftone');
  const opacidadeAtual = referencias.length === 0
    ? 50
    : Math.round((referencias.reduce((acc, l) => acc + (l.apresentacao.opacidade ?? 1), 0) / referencias.length) * 100);
  const opacidade = opacidadeManual ?? opacidadeAtual;

  const run = (acao: () => DisciplineEdit): void => {
    const r = acao();
    setErro(r.error);
  };

  const abrirNovo = (): void => {
    setErro(null);
    setModo('novo');
    setNome('');
    setCor('#808080');
  };

  const abrirEditar = (): void => {
    setErro(null);
    setModo('editar');
    setNome(selecionada.name);
    setCor(selecionada.color ?? '#808080');
  };

  const salvar = (): void => {
    const r = modo === 'novo' ? criarDisciplina(editor.store, nome, cor) : renomearDisciplina(editor.store, selecionada.id, nome, cor);
    if (r.error) {
      setErro(r.error);
      return;
    }
    setErro(null);
    setModo(null);
  };

  const excluir = (): void => {
    const id = selecionada.id;
    void pedirConfirmacao(t('dsc_confirm_delete', { name: selecionada.name })).then((ok) => {
      const r = ok ? excluirDisciplina(editor.store, id) : null;
      // A confirmação troca o diálogo aberto; o configurador volta com a mesma disciplina (ou Arquitetura, se excluiu).
      const proxima = r === null || r.error ? id : 'arquitetura';
      useUi.setState({ dialog: 'disciplineConfig', dialogArg: proxima });
    });
  };

  const definirNaCategoria = (categoria: LinhaDaMatriz['categoria'], apresentacao: LinhaDaMatriz['apresentacao']): void =>
    run(() => definirApresentacaoDaCategoria(editor.store, selecionada.id, categoria, apresentacao));

  const mudarEstadoDaDisciplina = (linha: (typeof simples)[number], tone: Tone): void =>
    run(() => definirApresentacaoDaDisciplina(editor.store, linha.disciplina, apresentacaoDoEstado(selecionada.id, linha.disciplina, tone), selecionada.id));

  return (
    <Dialog
      title={t('dsc_title')}
      onClose={fechar}
      size="wide"
      trapFocus
      footer={<button className="btn primary" onClick={fechar}>{t('stt_close')}</button>}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <section style={{ flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 8 }} aria-label={t('dsc_title')}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {disciplinas.map((d) => {
              const ativa = d.id === selecionada.id;
              return (
                <li key={d.id}>
                  <button
                    className={ativa ? 'btn small primary' : 'btn small'}
                    style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                    aria-pressed={ativa}
                    onClick={() => {
                      setErro(null);
                      setModo(null);
                      setOpacidadeManual(null);
                      setSelecionadaId(d.id);
                    }}
                  >
                    {d.color && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: d.color, display: 'inline-block' }} />}
                    {rotuloDaDisciplina(p, lang, d.id)}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn small" onClick={abrirNovo}>{t('dsc_new')}</button>
          <button className="btn small" disabled={builtin} onClick={abrirEditar}>{t('dsc_rename')}</button>
          <button className="btn small" disabled={builtin} onClick={excluir}>{t('dsc_delete')}</button>
          {builtin && <p className="hint">{t('dsc_readonly_builtin')}</p>}
          {modo && (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--line)', borderRadius: 4 }}>
              <label className="lbl" htmlFor="dsc-nome">{t('dsc_name')}</label>
              <input
                id="dsc-nome"
                className="input"
                value={nome}
                autoFocus
                onChange={(e) => { setNome(e.target.value); setErro(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') salvar(); }}
              />
              <label className="lbl" htmlFor="dsc-cor">{t('dsc_color')}</label>
              <input id="dsc-cor" type="color" value={cor} aria-label={t('dsc_color')} onChange={(e) => setCor(e.target.value)} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn small primary" onClick={salvar}>{t('stt_ok')}</button>
                <button className="btn small" onClick={() => { setModo(null); setErro(null); }}>{t('dlc_btn_cancel')}</button>
              </div>
            </div>
          )}
        </section>
        <section style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong style={{ flex: 1 }}>{rotuloDaDisciplina(p, lang, selecionada.id)}</strong>
            <button className="btn small" disabled={perfilVazio} onClick={() => run(() => restaurarPerfil(editor.store, selecionada.id))}>
              {t('dsc_restore')}
            </button>
          </div>
          <div role="tablist" aria-label={t('dsc_title')} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {(['simples', 'avancado'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={aba === id}
                className={aba === id ? 'btn small primary' : 'btn small'}
                onClick={() => { setErro(null); setAba(id); }}
              >
                {id === 'simples' ? t('dsc_tab_simple') : t('dsc_tab_advanced')}
              </button>
            ))}
          </div>
          {aba === 'simples' ? (
            <>
              <table className="layers" aria-label={t('dsc_simple_table')}>
                <thead>
                  <tr>
                    <th>{t('dlt_ton_col_discipline')}</th>
                    {TONE_ORDER.map((tone) => <th key={tone}>{t(stateKey(tone))}</th>)}
                    <th>{t('dsc_ref_opacity_short')}</th>
                  </tr>
                </thead>
                <tbody>
                  {simples.map((linha) => (
                    <tr key={linha.disciplina} data-discipline={linha.disciplina}>
                      <td>{rotuloDaDisciplina(p, lang, linha.disciplina)}</td>
                      {TONE_ORDER.map((tone) => (
                        <td key={tone}>
                          <input
                            type="radio"
                            name={`dsc-estado-${linha.disciplina}`}
                            checked={linha.estado === tone}
                            aria-label={`${t(stateKey(tone))}: ${rotuloDaDisciplina(p, lang, linha.disciplina)}`}
                            onChange={() => mudarEstadoDaDisciplina(linha, tone)}
                          />
                        </td>
                      ))}
                      <td>{Math.round(linha.opacidade * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <label className="lbl" htmlFor="dsc-ref-opacidade" style={{ whiteSpace: 'nowrap' }}>{t('dsc_ref_opacity')}</label>
                <input
                  id="dsc-ref-opacidade"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={opacidade}
                  style={{ flex: 1 }}
                  aria-label={t('dsc_ref_opacity')}
                  onChange={(e) => {
                    const valor = Number(e.target.value);
                    setOpacidadeManual(valor);
                    run(() => definirOpacidadeDasReferencias(editor.store, selecionada.id, valor / 100));
                  }}
                />
                <span>{opacidade}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <label className="lbl" htmlFor="dsc-copiar-de">{t('dsc_copy_from')}</label>
                <select
                  id="dsc-copiar-de"
                  className="select"
                  value=""
                  onChange={(e) => {
                    const origem = e.target.value as Discipline;
                    if (origem) run(() => copiarPerfilDe(editor.store, selecionada.id, origem));
                  }}
                >
                  <option value="">{t('dsc_copy_from')}</option>
                  {outras.map((d) => <option key={d.id} value={d.id}>{rotuloDaDisciplina(p, lang, d.id)}</option>)}
                </select>
              </div>
              <p className="hint">{t('dsc_simple_help')}</p>
            </>
          ) : (
            <>
              <table className="layers" aria-label={t('dsc_advanced_table')}>
                <thead>
                  <tr>
                    <th>{t('dlt_col_category')}</th>
                    <th>{t('dlt_ton_col_tone')}</th>
                    <th>{t('dsc_lighten')}</th>
                    <th>{t('dsc_opacity')}</th>
                    <th>{t('dsc_origin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((grupo) => (
                    <Fragment key={grupo.origem}>
                      <tr className="cat-group" data-origin={grupo.origem}>
                        <th colSpan={5} scope="colgroup" style={{ textAlign: 'left', fontWeight: 600 }}>
                          {rotuloDaDisciplina(p, lang, grupo.origem)}
                        </th>
                      </tr>
                      {grupo.linhas.map((linha) => {
                        const override = p.categoryDiscipline?.[linha.categoria];
                        const origem = override && disciplinas.some((d) => d.id === override) ? override : '';
                        const referencia = linha.apresentacao.tone === 'halftone';
                        return (
                          <tr key={linha.categoria} data-category={linha.categoria}>
                            <td>{categoryLabel(linha.categoria, lang)}</td>
                            <td>
                              <select
                                className="select"
                                aria-label={`${t('dlt_ton_col_tone')}: ${categoryLabel(linha.categoria, lang)}`}
                                value={linha.apresentacao.tone}
                                disabled={linha.origem === 'geral'}
                                onChange={(e) => definirNaCategoria(linha.categoria, apresentacaoDoTom(linha, e.target.value as Tone))}
                              >
                                {TONE_ORDER.map((tone) => <option key={tone} value={tone}>{toneLabel(lang, tone)}</option>)}
                              </select>
                            </td>
                            <td>
                              {referencia ? (
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  style={{ width: 72 }}
                                  aria-label={`${t('dsc_lighten')}: ${categoryLabel(linha.categoria, lang)}`}
                                  value={Math.round((linha.apresentacao.clareamento ?? 0) * 100)}
                                  onChange={(e) => {
                                    if (e.target.value === '') return;
                                    definirNaCategoria(linha.categoria, { ...linha.apresentacao, clareamento: Number(e.target.value) / 100 });
                                  }}
                                />
                              ) : '—'}
                            </td>
                            <td>
                              {referencia ? (
                                <input
                                  className="input"
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  style={{ width: 72 }}
                                  aria-label={`${t('dsc_opacity')}: ${categoryLabel(linha.categoria, lang)}`}
                                  value={Math.round((linha.apresentacao.opacidade ?? 1) * 100)}
                                  onChange={(e) => {
                                    if (e.target.value === '') return;
                                    definirNaCategoria(linha.categoria, { ...linha.apresentacao, opacidade: Number(e.target.value) / 100 });
                                  }}
                                />
                              ) : '—'}
                            </td>
                            <td>
                              <select
                                className="select"
                                aria-label={`${t('dsc_origin')}: ${categoryLabel(linha.categoria, lang)}`}
                                value={origem}
                                onChange={(e) => run(() => definirOrigemDaCategoria(editor.store, linha.categoria, e.target.value === '' ? undefined : e.target.value))}
                              >
                                <option value="">{t('dlt_ton_default')}</option>
                                {disciplinas.map((d) => <option key={d.id} value={d.id}>{rotuloDaDisciplina(p, lang, d.id)}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <p className="hint">{t('dsc_advanced_help')}</p>
            </>
          )}
          {erro && <div className="vr-error" role="alert">{erro}</div>}
        </section>
      </div>
    </Dialog>
  );
}
