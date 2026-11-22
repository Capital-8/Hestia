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
  criarDisciplina,
  definirOrigemDaCategoria,
  definirTomDaCategoria,
  excluirDisciplina,
  linhasDaMatriz,
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

/**
 * Configurador de disciplinas (decisão 0060, adendo 3): à esquerda, as disciplinas do projeto (as cinco embutidas e as
 * criadas); à direita, a matriz categoria × tom da disciplina escolhida, agrupada pela origem efetiva. Cada alteração
 * grava um comando (um passo de desfazer) e a recusa aparece em `role="alert"`. É um diálogo do PROJETO, não da vista:
 * o mesmo perfil vale para plantas, 3D e cortes.
 */
export function DisciplineConfigDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const arg = useUi((s) => s.dialogArg);
  const disciplinas = disciplinasDoProjeto(p);
  const [selecionadaId, setSelecionadaId] = useState<Discipline>(arg ?? 'arquitetura');
  const selecionada = disciplinas.find((d) => d.id === selecionadaId) ?? disciplinas[0]!;
  const builtin = isBuiltinDiscipline(selecionada.id);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<'novo' | 'editar' | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('#808080');
  const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const linhas = linhasDaMatriz(p, selecionada.id);
  const grupos = gruposDeLinhas(linhas);
  const perfilVazio = Object.keys(perfilDaDisciplina(p, selecionada.id)).length === 0;

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
          <table className="layers" aria-label={t('dsc_title')}>
            <thead>
              <tr>
                <th>{t('dlt_col_category')}</th>
                <th>{t('dlt_ton_col_tone')}</th>
                <th>{t('dsc_origin')}</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <Fragment key={grupo.origem}>
                  <tr className="cat-group" data-origin={grupo.origem}>
                    <th colSpan={3} scope="colgroup" style={{ textAlign: 'left', fontWeight: 600 }}>
                      {rotuloDaDisciplina(p, lang, grupo.origem)}
                    </th>
                  </tr>
                  {grupo.linhas.map((linha) => {
                    const override = p.categoryDiscipline?.[linha.categoria];
                    const origem = override && disciplinas.some((d) => d.id === override) ? override : '';
                    return (
                      <tr key={linha.categoria} data-category={linha.categoria}>
                        <td>{categoryLabel(linha.categoria, lang)}</td>
                        <td>
                          <select
                            className="select"
                            aria-label={`${t('dlt_ton_col_tone')}: ${categoryLabel(linha.categoria, lang)}`}
                            value={linha.tom}
                            disabled={linha.origem === 'geral'}
                            onChange={(e) => run(() => definirTomDaCategoria(editor.store, selecionada.id, linha.categoria, e.target.value as Tone))}
                          >
                            {TONE_ORDER.map((tone) => <option key={tone} value={tone}>{toneLabel(lang, tone)}</option>)}
                          </select>
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
          {erro && <div className="vr-error" role="alert">{erro}</div>}
          <p className="hint">{t('dsc_help')}</p>
        </section>
      </div>
    </Dialog>
  );
}
