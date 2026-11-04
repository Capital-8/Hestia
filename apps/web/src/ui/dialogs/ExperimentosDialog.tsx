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
  fatiasLigadas,
  FATIAS,
  medicaoOperacoes,
  type EstadoKernel,
  type Fatia,
  type MedicaoOperacoes,
} from '@hestia/geom';
import {
  FATIAS_HABILITADAS,
  forcaDaUrl,
  gravarFatiasSalvas,
  gravarModoSombra,
  kernelExperimentalLigado,
  lerFatiasSalvas,
  lerFlagDaUrl,
  lerModoSombra,
  ligarKernelExperimental,
} from '../../editor/preferenciasKernel.ts';
import { useI18n } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Textos novos deste diálogo, no mesmo par `pt`/`en` do resto da interface. */
const TEXTOS = {
  pt: {
    fatiasTitulo: 'Fatias do kernel v2 (Rust/WASM)',
    fatiasDica:
      'Cada fatia troca uma parte das operações geométricas pelo Rust. O padrão continua TypeScript; nenhuma fatia liga sem a sua validação.',
    fatia: 'Fatia',
    indisponivel: 'ainda não disponível',
    definidoUrl: 'definido pela URL',
    reiniciar: 'Preferência salva. Requer recarregar a página para valer.',
    sombra: 'Modo sombra (Rust e TypeScript na mesma chamada)',
    sombraDica: 'só vale com a fatia A ou B ligada',
    despachoTitulo: 'Fatias A e B: despacho e modo sombra',
    despachoInativo: 'Despacho inativo (fatias A e B desligadas ou wasm ainda não carregado).',
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
    fatiasTitulo: 'Kernel v2 slices (Rust/WASM)',
    fatiasDica:
      'Each slice moves part of the geometry operations to Rust. The default stays TypeScript; no slice turns on without your validation.',
    fatia: 'Slice',
    indisponivel: 'not available yet',
    definidoUrl: 'set by the URL',
    reiniciar: 'Preference saved. Requires reloading the page to take effect.',
    sombra: 'Shadow mode (Rust and TypeScript in the same call)',
    sombraDica: 'only applies with slice A or B on',
    despachoTitulo: 'Slices A and B: dispatch and shadow mode',
    despachoInativo: 'Dispatch inactive (slices A and B off or wasm not loaded yet).',
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
const OPERACOES: Array<{ chave: keyof MedicaoOperacoes['porOp']; rotulo: string }> = [
  { chave: 'union', rotulo: 'União' },
  { chave: 'difference', rotulo: 'Diferença' },
  { chave: 'intersection', rotulo: 'Interseção' },
  { chave: 'unionClipper', rotulo: 'União (Clipper)' },
  { chave: 'differenceClipper', rotulo: 'Diferença (Clipper)' },
  { chave: 'offsetMulti', rotulo: 'Offset' },
];

/** Milissegundos com precisão suficiente para comparar as operações sem poluir a tela. */
  // units-ok: milissegundos de medição de desempenho, unidade fixa de diagnóstico
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
  const tf = TEXTOS[useI18n((s) => s.lang)];
  const [salvas, setSalvas] = useState<Set<Fatia>>(lerFatiasSalvas);
  const [avisoFatias, setAvisoFatias] = useState('');
  const forcadaPelaUrl = forcaDaUrl() !== null;
  // Estado efetivo (URL > localStorage das fatias > preferência geral), lido a cada desenho.
  const efetivas = fatiasLigadas();
  const [sombraSalva, setSombraSalva] = useState(lerModoSombra);
  const [diag, setDiag] = useState<DiagnosticoDespacho | null>(diagnosticoDespacho);
  // O modo sombra só vale com a fatia A ou B efetiva (a mesma regra do despacho em `configDoDespacho`).
  const fatiaAEfetiva = efetivas.has('A') || efetivas.has('B');
  const sombra = sombraSalva && fatiaAEfetiva;

  const alternarSombra = (valor: boolean): void => {
    gravarModoSombra(valor);
    setSombraSalva(valor);
    setAvisoFatias(tf.reiniciar);
  };

  const alternarFatia = (fatia: Fatia, valor: boolean): void => {
    const proxima = new Set(salvas);
    if (valor) proxima.add(fatia);
    else proxima.delete(fatia);
    gravarFatiasSalvas(proxima);
    setSalvas(proxima);
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
      <div className="hint" style={{ marginBottom: 10 }}>
        <strong>{tf.fatiasTitulo}</strong>
        <p>{tf.fatiasDica}</p>
        {FATIAS.map((fatia) => {
          const habilitada = FATIAS_HABILITADAS.includes(fatia);
          const travada = forcadaPelaUrl;
          const desabilitada = travada || !habilitada;
          const motivo = travada ? tf.definidoUrl : habilitada ? null : tf.indisponivel;
          return (
            <div className="prow" key={fatia}>
              <label htmlFor={`kernel-fatia-${fatia}`}>
                {tf.fatia} {fatia}
                {motivo ? ` — ${motivo}` : ''}
              </label>
              <div>
                <input
                  id={`kernel-fatia-${fatia}`}
                  type="checkbox"
                  checked={efetivas.has(fatia)}
                  disabled={desabilitada}
                  onChange={(e) => alternarFatia(fatia, e.target.checked)}
                />
              </div>
            </div>
          );
        })}
        <div className="prow">
          <label htmlFor="kernel-sombra">
            {tf.sombra} — {tf.sombraDica}
          </label>
          <div>
            <input id="kernel-sombra" type="checkbox" checked={sombra} disabled={!fatiaAEfetiva} onChange={(e) => alternarSombra(e.target.checked)} />
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
