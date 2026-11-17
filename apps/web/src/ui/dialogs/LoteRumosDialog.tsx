import { useState, type ReactElement } from 'react';
import { LotTool } from '@hestia/tools';
import { TOLERANCIA_FECHAMENTO } from '@hestia/engine';
import { formatQuantity, isLot, unitsOf } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { fmtNum, useT } from '../../editor/i18n.ts';
import { NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { avaliarRumos, aplicarRumos, formRumosVazio, norteEmGraus, type FormRumos, type LinhaRumoForm } from './loteRumosForm.ts';
import { escolherPontoNaPlanta, fecharLoteRumos, useEstadoLoteRumos, voltarDaEscolha } from './loteRumosAberto.ts';

/**
 * Diálogo "Por tabela…" das linhas de propriedade (painel Lote da aba Massa e terreno): linhas de azimute (graus) e distância, ponto inicial
 * (clique na planta ou coordenada digitada), erro de fechamento ao vivo e a regra de aceite de A.4 regra 19. A lógica está em `loteRumosForm.ts`.
 */
export function LoteRumosDialog(): ReactElement | null {
  return useEstadoLoteRumos() === 'fechado' ? null : <LoteRumosCorpo />;
}

function LoteRumosCorpo(): ReactElement | null {
  const { t, lang } = useT();
  // O projeto lido direto do editor (o diálogo é modal: não precisa reagir a mudanças; assim também renderiza nos testes).
  const p = editor.project;
  const escondido = useEstadoLoteRumos() === 'escolhendo';
  const [f, setF] = useState<FormRumos>(formRumosVazio);
  const [erro, setErro] = useState<string | null>(null);
  const a = avaliarRumos(f, p, lang);
  const u = unitsOf(p);
  const mude = (patch: Partial<FormRumos>): void => {
    setF((x) => ({ ...x, ...patch }));
    setErro(null);
  };
  const linha = (i: number, patch: Partial<LinhaRumoForm>): void => mude({ linhas: f.linhas.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const escolher = (): void => {
    editor.setTool('lot');
    const ativa = editor.activeTool;
    if (!(ativa instanceof LotTool)) return;
    escolherPontoNaPlanta();
    ativa.escolherPonto((q) => {
      mude({ inicio: { x: q.x, y: q.y } });
      voltarDaEscolha();
    }, voltarDaEscolha);
  };
  const criar = (): void => {
    const n = Object.values(p.elements).filter(isLot).length + 1;
    const r = aplicarRumos(editor.store, f, useUi.getState().levelId, `${t('ui_lt_rumos_nome')} ${n}`, t('ui_lt_rumos_rotulo_undo'), lang);
    if ('problema' in r) {
      setErro(r.problema);
      return;
    }
    fecharLoteRumos();
    useUi.setState({ selection: [r.id], status: { key: 'ui_lt_rumos_status' } });
  };
  if (escondido) return null;
  const problema = a.problema ?? erro;
  const tol = formatQuantity(u, 'length', TOLERANCIA_FECHAMENTO);
  return (
    <Dialog
      title={t('ui_lt_rumos_titulo')}
      sub={t('ui_lt_rumos_sub')}
      size="mid"
      onClose={fecharLoteRumos}
      onSubmit={criar}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={fecharLoteRumos}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={criar} disabled={a.problema !== null}>{t('ui_lt_rumos_criar')}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto auto', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
        <span>{t('ui_lt_rumos_inicio')}</span>
        <label htmlFor="rumo-x">X</label>
        <NumField id="rumo-x" quantity="length" value={f.inicio.x} onCommit={(v) => mude({ inicio: { ...f.inicio, x: v } })} />
        <label htmlFor="rumo-y">Y</label>
        <NumField id="rumo-y" quantity="length" value={f.inicio.y} onCommit={(v) => mude({ inicio: { ...f.inicio, y: v } })} />
      </div>
      <button type="button" className="btn small" onClick={escolher} style={{ marginBottom: 10 }}>{t('ui_lt_rumos_escolher')}</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr>
            <th>{t('ui_lt_rumos_col_lado')}</th>
            <th>{t('ui_lt_rumos_col_azimute')}</th>
            <th>{t('ui_lt_rumos_col_distancia')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {f.linhas.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><NumField id={`rumo-az-${i}`} suffix="°" decimals={4} value={l.azimute} onCommit={(v) => linha(i, { azimute: v })} /></td>
              <td><NumField id={`rumo-d-${i}`} quantity="length" value={l.distancia} onCommit={(v) => linha(i, { distancia: v })} /></td>
              <td>
                <button type="button" className="btn small" aria-label={t('ui_lt_rumos_remover', { n: i + 1 })} disabled={f.linhas.length <= 1} onClick={() => mude({ linhas: f.linhas.filter((_, k) => k !== i) })}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn small" onClick={() => mude({ linhas: [...f.linhas, { azimute: 0, distancia: 0 }] })}>{t('ui_lt_rumos_add')}</button>
      <p style={{ margin: '10px 0 4px', opacity: 0.8 }}>{t('ui_lt_rumos_norte', { graus: `${fmtNum(norteEmGraus(p), 4, lang)}°` })}</p>
      <p style={{ margin: '4px 0' }} aria-live="polite"><strong>{t('ui_lt_rumos_fechamento', { erro: formatQuantity(u, 'length', a.erroFechamento) })}</strong></p>
      <label htmlFor="rumo-fechar" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input id="rumo-fechar" type="checkbox" checked={f.fecharNoPrimeiro} onChange={(e) => mude({ fecharNoPrimeiro: e.target.checked })} />
        {t('ui_lt_rumos_fechar_primeiro')}
      </label>
      <p style={{ margin: '4px 0 0', opacity: 0.8 }}>{t('ui_lt_rumos_fechar_ajuda', { max: tol })}</p>
      {problema ? <p role="alert" style={{ color: '#b91c1c', margin: '6px 0 0' }}>{problema}</p> : null}
    </Dialog>
  );
}
