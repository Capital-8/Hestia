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
import { kernelExperimentalLigado, lerFlagDaUrl, ligarKernelExperimental } from '../../editor/preferenciasKernel.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Operações medidas pelo seam do `geom`, na ordem em que aparecem na tabela. */
const OPERACOES: Array<{ chave: keyof MedicaoOperacoes['porOp']; rotulo: string }> = [
  { chave: 'union', rotulo: 'União' },
  { chave: 'difference', rotulo: 'Diferença' },
  { chave: 'intersection', rotulo: 'Interseção' },
  { chave: 'unionClipper', rotulo: 'União (Clipper)' },
  { chave: 'differenceClipper', rotulo: 'Diferença (Clipper)' },
  { chave: 'offsetMulti', rotulo: 'Offset' },
];

/** Milissegundos com precisão suficiente para comparar as operações sem poluir a tela. */
const ms = (valor: number): string => `${valor.toFixed(1)} ms`;

const AVISO_LIGADO =
  'Preferência salva. O kernel é ativado agora, sem bloquear a interface; recarregar a página garante um estado limpo.';
const AVISO_DESLIGADO = 'Preferência salva. O TypeScript volta a atender as operações; recarregar a página mantém o TypeScript.';

export function ExperimentosDialog(): ReactElement {
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
    setAviso(AVISO_LIGADO);
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
    desativarKernelExperimental('desligado pelo usuário na tela de experimentos');
    setLigado(false);
    setOcupado(false);
    setAviso(AVISO_DESLIGADO);
    atualizar();
  };

  const alternar = (valor: boolean): void => {
    if (valor) ligar();
    else desligar();
  };

  return (
    <Dialog
      title="Experimentais"
      sub="Recursos em teste, desligados por padrão"
      size="mid"
      onClose={fechar}
      footer={
        <>
          <button className="btn" onClick={atualizar}>Atualizar medição</button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={fechar}>Fechar</button>
        </>
      }
    >
      <p className="hint">
        O kernel geométrico em Rust/WASM acelera as operações de união, diferença, interseção e offset. É{' '}
        <strong>experimental</strong>, pode ser desligado a qualquer momento e não altera o arquivo do projeto: a escolha é
        do aplicativo (deste navegador), não do <code>.hestia</code>.
      </p>
      <div className="prow">
        <label htmlFor="kernel-experimental">Kernel geométrico experimental (Rust/WASM)</label>
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
        <button className="btn primary" onClick={ligar} disabled={ocupado}>Ligar</button>
        <button className="btn" onClick={desligar} disabled={ocupado || (!ligado && !estado.ativo)}>Desligar</button>
        {ocupado ? <span style={{ color: 'var(--fg-soft)' }}>ativando o wasm…</span> : null}
      </div>
      {daUrl ? (
        <p className="hint">
          A URL força <code>kernel={daUrl}</code>: a preferência salva não vale nesta sessão (o override é do harness de
          medição).
        </p>
      ) : null}
      {aviso ? <p role="status" style={{ margin: '4px 0 10px', color: 'var(--fg-soft)' }}>{aviso}</p> : null}
      <div className="hint" aria-live="polite">
        <strong>Status agora</strong>
        <ul>
          <li>
            Kernel:{' '}
            {estado.ativo ? `ativo (${estado.nome})` : 'inativo — as operações rodam no TypeScript'}
          </li>
          {estado.motivo ? <li>Motivo: {estado.motivo}</li> : null}
          <li>ABI: {estado.versaoAbi ?? '—'} · falhas: {estado.falhas}</li>
        </ul>
      </div>
      <div className="hint" aria-live="polite">
        <strong>Medição desta sessão</strong>
        <p>
          {medicao.chamadas} chamada(s) · {ms(medicao.ms)} · origem:{' '}
          {medicao.origem === 'rust' ? 'Rust/WASM' : 'TypeScript'}
        </p>
        <table className="layers">
          <thead>
            <tr>
              <th>Operação</th>
              <th>Chamadas</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {OPERACOES.map((o) => {
              const c = medicao.porOp[o.chave];
              return (
                <tr key={o.chave}>
                  <td>{o.rotulo}</td>
                  <td>{c.chamadas}</td>
                  <td>{ms(c.ms)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
