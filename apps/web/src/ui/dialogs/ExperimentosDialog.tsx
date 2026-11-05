/**
 * Diálogo "Experimentais": liga e desliga o kernel geométrico experimental (Rust/WASM) e mostra o
 * diagnóstico do contrato (`estadoKernel`) e a medição das operações (`medicaoOperacoes`).
 *
 * O flag é uma preferência de APLICAÇÃO (ver `editor/preferenciasKernel.ts`): não entra no projeto nem
 * no arquivo `.hestia`. Este diálogo só grava a preferência e chama a ativação/desativação; a leitura
 * do estado é feita na abertura e a cada alternância — nada de polling.
 */
import { useEffect, useState, type ReactElement } from 'react';
import {
  ativarKernelExperimental,
  desativarKernelExperimental,
  estadoKernel,
  medicaoOperacoes,
  type EstadoKernel,
  type MedicaoOperacoes,
} from '@hestia/geom';
import { fmtNum, useT, type Dict, type Lang } from '../../editor/i18n.ts';
import { kernelExperimentalLigado, lerFlagDaUrl, ligarKernelExperimental } from '../../editor/preferenciasKernel.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Operações medidas pelo seam do `geom`, na ordem em que aparecem na tabela. */
const OPERACOES: Array<{ chave: keyof MedicaoOperacoes['porOp']; rotulo: keyof Dict }> = [
  { chave: 'union', rotulo: 'dlm_op_union' },
  { chave: 'difference', rotulo: 'dlm_op_difference' },
  { chave: 'intersection', rotulo: 'dlm_op_intersection' },
  { chave: 'unionClipper', rotulo: 'dlm_op_union_clipper' },
  { chave: 'differenceClipper', rotulo: 'dlm_op_difference_clipper' },
  { chave: 'offsetMulti', rotulo: 'dlm_op_offset' },
];

/** Milissegundos com precisão suficiente para comparar as operações sem poluir a tela. */
  // units-ok: milissegundos de medição de desempenho, unidade fixa de diagnóstico
const ms = (valor: number, lang: Lang): string => `${fmtNum(valor, 1, lang)} ms`;

export function ExperimentosDialog(): ReactElement {
  const { t, lang } = useT();
  const [ligado, setLigado] = useState(kernelExperimentalLigado);
  const [estado, setEstado] = useState<EstadoKernel>(estadoKernel);
  const [medicao, setMedicao] = useState<MedicaoOperacoes>(medicaoOperacoes);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const daUrl = lerFlagDaUrl();

  const atualizar = (): void => {
    setEstado(estadoKernel());
    setMedicao(medicaoOperacoes());
  };

  // Abriu o diálogo: lê o estado uma vez. Daqui em diante só atualiza em alternância ou no botão.
  useEffect(() => {
    setEstado(estadoKernel());
    setMedicao(medicaoOperacoes());
  }, []);

  const ligar = (): void => {
    ligarKernelExperimental(true);
    setLigado(true);
    setOcupado(true);
    setAviso(t('dlm_msg_kernel_on'));
    // Fire-and-forget: o contrato do carregador nunca rejeita; o `finally` só atualiza o diagnóstico.
    void ativarKernelExperimental()
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        setOcupado(false);
        atualizar();
      });
  };

  const desligar = (): void => {
    ligarKernelExperimental(false);
    desativarKernelExperimental(t('dlm_kernel_reason_user_off'));
    setLigado(false);
    setOcupado(false);
    setAviso(t('dlm_msg_kernel_off'));
    atualizar();
  };

  const alternar = (valor: boolean): void => {
    if (valor) ligar();
    else desligar();
  };

  return (
    <Dialog
      title={t('dlm_experimental')}
      sub={t('dlm_experimental_sub')}
      size="mid"
      onClose={fechar}
      footer={
        <>
          <button className="btn" onClick={atualizar}>{t('dlm_btn_refresh_measure')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>
        </>
      }
    >
      <p className="hint">
        {t('dlm_kernel_hint_before')}{' '}
        <strong>{t('dlm_kernel_hint_emph')}</strong>{t('dlm_kernel_hint_after')}{' '}
        <code>.hestia</code>.
      </p>
      <div className="prow">
        <label htmlFor="kernel-experimental">{t('dlm_kernel_enable')}</label>
        <div>
          <input
            id="kernel-experimental"
            type="checkbox"
            checked={ligado}
            disabled={ocupado}
            onChange={(e) => alternar(e.target.checked)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button className="btn primary" onClick={ligar} disabled={ocupado}>{t('dlm_btn_enable')}</button>
        <button className="btn" onClick={desligar} disabled={ocupado || (!ligado && !estado.ativo)}>{t('dlm_btn_disable')}</button>
        {ocupado ? <span style={{ color: 'var(--fg-soft)' }}>{t('dlm_msg_activating_wasm')}</span> : null}
      </div>
      {daUrl ? (
        <p className="hint">
          {t('dlm_kernel_url_before')} <code>kernel={daUrl}</code>{t('dlm_kernel_url_after')}
        </p>
      ) : null}
      {aviso ? <p role="status" style={{ margin: '4px 0 10px', color: 'var(--fg-soft)' }}>{aviso}</p> : null}
      <div className="hint" aria-live="polite">
        <strong>{t('dlm_kernel_status')}</strong>
        <ul>
          <li>
            {t('dlm_lbl_kernel')}{' '}
            {estado.ativo ? t('dlm_kernel_active', { name: estado.nome }) : t('dlm_kernel_inactive')}
          </li>
          {estado.motivo ? <li>{t('dlm_lbl_reason')} {estado.motivo}</li> : null}
          <li>{t('dlm_lbl_abi', { abi: estado.versaoAbi ?? '—' })} · {t('dlm_lbl_failures', { n: estado.falhas })}</li>
        </ul>
      </div>
      <div className="hint" aria-live="polite">
        <strong>{t('dlm_session_measure')}</strong>
        <p>
          {medicao.chamadas === 1 ? t('dlm_calls_one', { n: medicao.chamadas }) : t('dlm_calls_many', { n: medicao.chamadas })} · {ms(medicao.ms, lang)} · {t('dlm_lbl_source')}{' '}
          {medicao.origem === 'rust' ? 'Rust/WASM' : 'TypeScript'}
        </p>
        <table className="layers">
          <thead>
            <tr>
              <th>{t('dlm_col_operation')}</th>
              <th>{t('dlm_col_calls')}</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {OPERACOES.map((o) => {
              const c = medicao.porOp[o.chave];
              return (
                <tr key={o.chave}>
                  <td>{t(o.rotulo)}</td>
                  <td>{c.chamadas}</td>
                  <td>{ms(c.ms, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
