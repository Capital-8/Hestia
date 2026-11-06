/**
 * Diálogo "Experimentais": liga e desliga o kernel geométrico experimental (Rust/WASM) e mostra o
 * diagnóstico do contrato (`estadoKernel`) e a medição das operações (`medicaoOperacoes`).
 *
 * O flag é uma preferência de APLICAÇÃO (ver `editor/preferenciasKernel.ts`): não entra no projeto nem
 * no arquivo `.hestia`. Este diálogo só grava a preferência e chama a ativação/desativação; a leitura
 * do estado é feita na abertura e a cada alternância — nada de polling.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { diagnosticoDespacho, type DiagnosticoDespacho } from '@hestia/engine';
import {
  ativarKernelExperimental,
  desativarKernelExperimental,
  estadoKernel,
  medicaoOperacoes,
  type EstadoKernel,
  type MedicaoOperacoes,
} from '@hestia/geom';
import {
  gravarModoSombra,
  kernelExperimentalLigado,
  lerFlagDaUrl,
  lerModoSombra,
  ligarKernelExperimental,
} from '../../editor/preferenciasKernel.ts';
import { fmtNum, useT, type Dict, type Lang } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Textos novos deste diálogo, no mesmo par `pt`/`en` do resto da interface. */
const TEXTOS = {
  pt: {
    fatiasTitulo: 'Kernel v2 (Rust/WASM)',
    fatiasDica:
      'As fatias A e B e as quantidades são calculadas pelo Rust, sempre. O que resta aqui é comparar com o TypeScript (modo sombra) e ver o diagnóstico.',
    reiniciar: 'Preferência salva. Requer recarregar a página para valer.',
    sombra: 'Modo sombra (Rust e TypeScript na mesma chamada)',
    despachoTitulo: 'Fatias A e B: despacho e modo sombra',
    despachoInativo: 'Despacho inativo (wasm ainda não carregado).',
    despachoEstado: 'Kernel v2',
    pronto: 'pronto',
    emFalta: 'indisponível',
    entregues: 'Níveis entregues pelo Rust',
    entreguesB: 'Consultas da fatia B entregues (pisos e lajes; a junção segue no TypeScript)',
    elemento: 'elemento',
    voltas: 'Voltas ao TypeScript (leves / graves)',
    recriacoes: 'Recriações da instância',
    comparacoes: 'Comparações do modo sombra',
    divergencias: 'Divergências',
    ultima: 'Última divergência',
    nenhuma: 'nenhuma',
    nivel: 'nível',
    parede: 'parede',
    campo: 'campo',
    ultimoErro: 'Último erro',
  },
  en: {
    fatiasTitulo: 'Kernel v2 (Rust/WASM)',
    fatiasDica:
      'Slices A and B and the quantities are always computed by Rust. What is left here is comparing with TypeScript (shadow mode) and the diagnostics.',
    reiniciar: 'Preference saved. Requires reloading the page to take effect.',
    sombra: 'Shadow mode (Rust and TypeScript in the same call)',
    despachoTitulo: 'Slices A and B: dispatch and shadow mode',
    despachoInativo: 'Dispatch inactive (wasm not loaded yet).',
    despachoEstado: 'Kernel v2',
    pronto: 'ready',
    emFalta: 'unavailable',
    entregues: 'Levels delivered by Rust',
    entreguesB: 'Slice B queries delivered (floors and slabs; junction stays in TypeScript)',
    elemento: 'element',
    voltas: 'Fallbacks to TypeScript (light / severe)',
    recriacoes: 'Instance recreations',
    comparacoes: 'Shadow mode comparisons',
    divergencias: 'Divergences',
    ultima: 'Last divergence',
    nenhuma: 'none',
    nivel: 'level',
    parede: 'wall',
    campo: 'field',
    ultimoErro: 'Last error',
  },
} as const;

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
  // Textos locais só têm pt/en; os demais idiomas caem no inglês até ganharem entrada própria.
  const tf = TEXTOS[lang === 'pt' ? 'pt' : 'en'];
  const [avisoFatias, setAvisoFatias] = useState('');
  const [sombraSalva, setSombraSalva] = useState(lerModoSombra);
  const [diag, setDiag] = useState<DiagnosticoDespacho | null>(diagnosticoDespacho);
  // As fatias A e B estão sempre ligadas em produção (`configDoDespacho`): o modo sombra vale sempre que o usuário o liga.
  const sombra = sombraSalva;

  const alternarSombra = (valor: boolean): void => {
    gravarModoSombra(valor);
    setSombraSalva(valor);
    setAvisoFatias(tf.reiniciar);
  };

  const atualizar = (): void => {
    setEstado(estadoKernel());
    setMedicao(medicaoOperacoes());
    setDiag(diagnosticoDespacho());
  };

  // Abriu o diálogo: lê o estado uma vez. Daqui em diante só atualiza em alternância ou no botão.
  useEffect(() => {
    setEstado(estadoKernel());
    setMedicao(medicaoOperacoes());
    setDiag(diagnosticoDespacho());
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
      <div className="hint" style={{ marginBottom: 10 }}>
        <strong>{tf.fatiasTitulo}</strong>
        <p>{tf.fatiasDica}</p>
        <div className="prow">
          <label htmlFor="kernel-sombra">
            {tf.sombra}
          </label>
          <div>
            <input id="kernel-sombra" type="checkbox" checked={sombra} onChange={(e) => alternarSombra(e.target.checked)} />
          </div>
        </div>
        {avisoFatias ? <p role="status" style={{ margin: '4px 0 10px', color: 'var(--fg-soft)' }}>{avisoFatias}</p> : null}
        <div id="kernel-despacho" aria-live="polite">
          <strong>{tf.despachoTitulo}</strong>
          {diag ? (
            <ul>
              <li>
                {tf.despachoEstado}: {diag.pronto ? tf.pronto : `${tf.emFalta}${diag.indisponivel ? ` (${diag.indisponivel})` : ''}`}
              </li>
              <li>
                {tf.entregues}: {diag.entreguesPeloRust} · {tf.entreguesB}: {diag.entreguesB} · {tf.voltas}: {diag.voltasLeves} / {diag.voltasGraves} · {tf.recriacoes}: {diag.recriacoes}
              </li>
              <li>
                {tf.comparacoes}: {diag.comparacoes} · {tf.divergencias}: {diag.divergencias}
              </li>
              <li>
                {tf.ultima}:{' '}
                {diag.ultimaDivergencia
                  ? `${tf.nivel} ${diag.ultimaDivergencia.nivel}, ${diag.ultimaDivergencia.fatia === 'B' && diag.ultimaDivergencia.elemento ? `${tf.elemento} ${diag.ultimaDivergencia.elemento}` : `${tf.parede} ${diag.ultimaDivergencia.parede ?? '—'}`}, ${tf.campo} ${diag.ultimaDivergencia.campo} — ${diag.ultimaDivergencia.mensagem}`
                  : tf.nenhuma}
              </li>
              {diag.ultimoErro ? (
                <li>
                  {tf.ultimoErro}: {diag.ultimoErro}
                </li>
              ) : null}
            </ul>
          ) : (
            <p>{tf.despachoInativo}</p>
          )}
        </div>
      </div>
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
