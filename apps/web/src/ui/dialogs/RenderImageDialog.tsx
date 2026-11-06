/* eslint-disable max-lines -- o diálogo reúne prévia progressiva, resolução e entrega; dividir depois. */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { newId, projectRenderCameras, renderCameraOf, view3dOf, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, cameraDeRenderParaSnapshot, type CameraDeRenderSnapshot } from '@hestia/render';
import { useProject } from '../../editor/controller.ts';
import { entregarArquivo } from '../../editor/entregarArquivo.ts';
import { canvasAtivo, comModoApresentacao } from '../../editor/render/captureRegistry.ts';
import { renderizarImagemRust } from '../../editor/render/rustStillRenderer.ts';
import { criarClienteWasm, type ClienteRenderWasm } from '../../editor/render/wasmClient.ts';
import { comTexturasCarregadas } from '../../editor/render/texturasCena.ts';
import { LADO_PREVIA_TEXTURA } from '../../editor/render/texturaRender.ts';
import { codificarCenaNoWorker, type ProgressoCodificacao } from '../../editor/render/renderWorkerClient.ts';
import { renderizarNativo, saudeRenderNativo } from '../../editor/render/nativeClient.ts';
import { cameraPreviewAtual } from '../../editor/render/previewCamera.ts';
import { camera3DAtual } from '../../editor/vista3dAoVivo.ts';
import { useRenderCameraUi } from '../../editor/renderCameraSelecao.ts';
import {
  LIMITE_LADO_IMAGEM,
  LIMITE_PIXELS_IMAGEM,
  capturarVista,
  criarMiniaturaDataUrl,
  desenharCaptura,
  nomeArquivoPng,
  resolverDimensoes,
  validarDimensoes,
  type DimensoesImagem,
  type ModoResolucaoImagem,
} from '../../editor/render/captureView.ts';
import { saveRender } from '../../editor/renderGallery.ts';
import { useUi } from '../../editor/state.ts';
import { NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { useRenderSession } from './useRenderSession.ts';
import { RenderTilesGrade } from './RenderTilesGrade.tsx';
import { podeBaixar } from './renderSessao.ts';
import {
  MENSAGEM_RASCUNHO_SO_3D,
  MENSAGEM_SERVICO_GPU_INDISPONIVEL,
  barraProgresso,
  modoVistaDaCaptura,
  linhaDaCameraDeRender,
  motivoGpuIndisponivel,
  nomeArquivoRender,
  podeClicarRenderizar,
  podeRascunhoDaVista,
  rotuloDoBotaoPrincipal,
  podeCairParaRascunho,
  rotuloDoResultado,
  type QualidadeRender,
} from './renderDialogoLogica.ts';
import './renderImage.css';

/** Tamanho inicial do “personalizado”: 2× a vista, sem passar dos limites de lado/pixels. */
function personalizadoInicial(base: DimensoesImagem | null): DimensoesImagem {
  if (!base) return { largura: 1920, altura: 1080 };
  const escala = Math.min(
    2,
    LIMITE_LADO_IMAGEM / base.largura,
    LIMITE_LADO_IMAGEM / base.altura,
    Math.sqrt(LIMITE_PIXELS_IMAGEM / (base.largura * base.altura)),
  );
  return {
    largura: Math.max(1, Math.round(base.largura * escala)),
    altura: Math.max(1, Math.round(base.altura * escala)),
  };
}

/** Rótulo humano da vista ativa, só para o subtítulo do diálogo. */
function rotuloDaVista(view: string): string {
  if (view === '3d') return 'Modelo 3D';
  if (view === 'section') return 'Corte/elevação';
  if (view === 'plan') return 'Planta';
  if (view === 'sheet') return 'Prancha';
  if (view === 'animation') return 'Estúdio de animação';
  return 'Vista ativa';
}

/**
 * Snapshot da cena 3D para o path tracer (mesma montagem realista da vista 3D). Com `explicita` (câmera de render
 * escolhida na aba Vista), a câmera é a dela; senão, a câmera da vista 3D ou o enquadramento automático.
 */
function cenaDoProjeto(p: Project, camera: SheetView3DCamera | null, aspect: number, explicita: CameraDeRenderSnapshot | null = null) {
  const cena = new ModelScene();
  try {
    const projeto = { ...p, view3d: { ...view3dOf(p), style: 'realistic' as const, shadows: true, edges: true } };
    cena.update(projeto, p.levels.map((l) => resolveLevel(projeto, l.id)), { dark: false, edges: true, shadows: true });
    return explicita ? cena.exportarCenaDeRender({ cameraExplicita: explicita }) : cena.exportarCenaDeRender({ camera: camera ?? undefined, aspect });
  } finally {
    cena.dispose();
  }
}

const MENSAGEM_VISTA_3D_NAO_PRONTA = 'A vista 3D ainda não está pronta para o rascunho. Aguarde o modelo aparecer e tente de novo.';

/**
 * Roda `desenhar` sobre o canvas da vista ativa. Na vista 3D, a cena roda em modo apresentação (sem
 * grade, níveis, chão nem realces) e volta ao normal logo depois; sem cena 3D pronta, lança erro.
 */
function naVistaDoRascunho(desenhar: () => void, apresentacao: boolean): void {
  if (!apresentacao) {
    desenhar();
    return;
  }
  if (!comModoApresentacao(desenhar)) throw new Error(MENSAGEM_VISTA_3D_NAO_PRONTA);
}

/**
 * PNG do Rascunho. A cópia do canvas acontece dentro de `naVistaDoRascunho` (síncrona), então sai
 * com a cena em modo apresentação quando a vista é 3D.
 */
function capturarRascunho(dim: DimensoesImagem, apresentacao: boolean): Promise<Blob> {
  const saida: { promessa?: Promise<Blob> } = {};
  try {
    naVistaDoRascunho(() => { saida.promessa = capturarVista(dim); }, apresentacao);
  } catch (e) {
    return Promise.reject(e);
  }
  return saida.promessa ?? Promise.reject(new Error(MENSAGEM_VISTA_3D_NAO_PRONTA));
}

/** Resultado do Rascunho/Final, guardado no modal até "Baixar" ou "Renderizar de novo". */
interface ResultadoLegado {
  /** Qualidade escolhida quando o render começou (o resultado só aparece com ela selecionada). */
  modo: 'rascunho' | 'final';
  /** Qualidade que de fato gerou a imagem (o Final cai para rascunho se o Rust falhar). */
  saida: 'rascunho' | 'final';
  blob: Blob;
  nome: string;
}

/** Progresso do caminho Rascunho/Final, mostrado no próprio modal (não na barra global). */
interface ProgressoLegado {
  titulo: string;
  rodape: string;
  /** Nulo = sem progresso real (barra indeterminada). */
  fracao: number | null;
  /** Só o render final aborta de verdade; a captura do Rascunho é rápida e não tem cancelamento. */
  cancelavel: boolean;
}

/** Bloco de progresso do modal: o mesmo para o GPU nativo e para Rascunho/Final. */
function BlocoProgresso({
  titulo,
  detalhe,
  fracao,
  rodape,
  onCancelar,
  grade,
}: {
  titulo: string;
  detalhe?: string;
  fracao: number | null;
  rodape: string;
  onCancelar?: () => void;
  /** Grade de tiles reais do GPU; ausente quando o serviço não reporta tiles. */
  grade?: ReactNode;
}): ReactElement {
  const barra = barraProgresso(fracao);
  return (
    <div className="ri-progresso" role="status" aria-live="polite">
      <div className="ri-progresso-topo">
        <b>{titulo}</b>
        {detalhe ? <span className="mono">{detalhe}</span> : null}
      </div>
      {grade}
      {barra.indeterminada ? (
        <div className="ri-barra indeterminada" aria-label="Preparando">
          <i />
        </div>
      ) : (
        <div className="ri-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={barra.percentual}>
          <i style={{ width: `${barra.percentual}%` }} />
        </div>
      )}
      <div className="ri-progresso-rodape">
        <span>{rodape}</span>
        {onCancelar ? (
          <button className="btn small" onClick={onCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Diálogo "Renderizar imagem" (T5): mostra a prévia do canvas ativo, deixa escolher o nome e a
 * resolução e salva um PNG. A captura em si fica em `captureView.ts`; aqui só há estado de tela,
 * entrega do arquivo e registro na galeria.
 */
export function RenderImageDialog(): ReactElement {
  const p = useProject();
  const vista = useUi((s) => s.view);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  // A fonte é o canvas da vista ativa no momento em que o diálogo abre. O canvas continua vivo
  // atrás do modal; se a vista mudar, o usuário reabre o diálogo. `revisao` permite tentar de novo
  // quando o canvas existir mas ainda não tiver sido dimensionado.
  const [revisao, setRevisao] = useState(0);
  const fonte = useMemo(() => {
    // `revisao` é a chave da nova leitura do registro: o mesmo canvas pode ganhar tamanho depois.
    if (revisao < 0) return null;
    return canvasAtivo();
  }, [revisao]);
  const larguraFonte = fonte?.width ?? 0;
  const alturaFonte = fonte?.height ?? 0;
  const base = useMemo<DimensoesImagem | null>(() => {
    if (!fonte || larguraFonte <= 0 || alturaFonte <= 0) return null;
    return { largura: larguraFonte, altura: alturaFonte };
  }, [fonte, larguraFonte, alturaFonte]);

  const [modo, setModo] = useState<ModoResolucaoImagem>(() => (base && base.largura >= 1280 ? '1x' : '2x'));
  const [amostras, setAmostras] = useState(() => (base && base.largura >= 1280 ? 16 : 24));
  const [exposicao, setExposicao] = useState(0);
  const [personalizado, setPersonalizado] = useState<DimensoesImagem>(() => personalizadoInicial(base));
  const [manterProporcao, setManterProporcao] = useState(true);
  const [nome, setNome] = useState(() => `${p.name.trim() || 'projeto'}-vista`);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [previaFalhou, setPreviaFalhou] = useState(false);
  // Preparo da cena GPU (texturas N de 22, depois codificação): alimenta o indicador da prévia.
  const [progressoTexturas, setProgressoTexturas] = useState<ProgressoCodificacao | null>(null);
  const [progressoLegado, setProgressoLegado] = useState<ProgressoLegado | null>(null);
  const [legadoCancelado, setLegadoCancelado] = useState(false);
  const [resultadoLegado, setResultadoLegado] = useState<ResultadoLegado | null>(null);
  const controladorLegadoRef = useRef<AbortController | null>(null);
  // Preparo do GPU (mips e HSTR no worker): fechar o diálogo ou iniciar outro render aborta este.
  const controladorGpuRef = useRef<AbortController | null>(null);
  // O rascunho só é limpo na vista 3D (cena em modo apresentação); planta, corte e prancha são recusados.
  const rascunhoPermitido = podeRascunhoDaVista(modoVistaDaCaptura(vista));
  const apresentacao3d = vista === '3d';
  const session = useRenderSession();
  /** Dimensões e nome do último render GPU (usados ao concluir: galeria e "Baixar"). */
  const alvoSaidaRef = useRef<DimensoesImagem | null>(null);
  const nomeSaidaRef = useRef<string>('');
  const cameraFinal = camera3DAtual() ?? cameraPreviewAtual();
  // Câmera de render escolhida na aba Vista (seleção de tela). Só o render GPU nativo a usa: posição, alvo, FOV e proporção.
  const idCameraDeRender = useRenderCameraUi((s) => s.selecionada);
  const cameraDeRender = useMemo(
    () => (idCameraDeRender ? renderCameraOf(p, idCameraDeRender) ?? null : null),
    [idCameraDeRender, p],
  );
  const explicitaDeRender = useMemo(() => (cameraDeRender ? cameraDeRenderParaSnapshot(cameraDeRender) : null), [cameraDeRender]);
  // Com uma câmera 3D disponível, abrir já no render final: a prévia é o path tracer de verdade e
  // não depende do buffer do canvas da tela (que pode vir vazio em alguns navegadores).
  const [qualidade, setQualidade] = useState<'rascunho' | 'final' | 'gpu'>(() => (cameraFinal ? 'final' : 'rascunho'));
  const [gpuDisponivel, setGpuDisponivel] = useState<boolean | null>(null);
  const escolhaManual = useRef(false);
  const autoFinal = useRef(false);
  useEffect(() => {
    if (!cameraFinal || autoFinal.current) return;
    autoFinal.current = true;
    if (gpuDisponivel !== true) setQualidade('final');
  }, [cameraFinal, gpuDisponivel]);

  useEffect(() => {
    let ativo = true;
    void saudeRenderNativo().then((saude) => {
      if (!ativo) return;
      const ok = saude?.ok === true;
      setGpuDisponivel(ok);
      // Se o serviço nativo está no ar, ele é o render final profissional.
      if (ok && !escolhaManual.current) setQualidade('gpu');
    });
    return () => { ativo = false; };
  }, []);
  const previaRef = useRef<HTMLCanvasElement>(null);
  // A prévia e o botão Salvar usam instâncias wasm separadas: uma não prepara trabalho com
  // resolução diferente da outra enquanto a outra renderiza.
  const clientePreview = useRef<Promise<ClienteRenderWasm> | null>(null);
  const clienteFinal = useRef<Promise<ClienteRenderWasm> | null>(null);
  useEffect(() => () => {
    void clientePreview.current?.then((c) => c.dispose()).catch(() => {});
    void clienteFinal.current?.then((c) => c.dispose()).catch(() => {});
  }, []);

  // A câmera de render vale só no GPU nativo; nos outros caminhos a câmera continua a da vista.
  const cameraDeRenderGpu = qualidade === 'gpu' ? explicitaDeRender : null;
  const alvo = useMemo(() => {
    const dim = base ? resolverDimensoes(base, modo, personalizado) : null;
    // Com a câmera de render, a altura segue a proporção dela (a largura escolhida fica).
    if (!dim || !cameraDeRenderGpu) return dim;
    return { largura: dim.largura, altura: Math.max(1, Math.round(dim.largura / cameraDeRenderGpu.aspect)) };
  }, [base, modo, personalizado, cameraDeRenderGpu]);
  const problema = alvo ? validarDimensoes(alvo) : null;
  const arquivo = nomeArquivoPng(nome);
  const snapshotFinal = useMemo(() => {
    if (qualidade === 'rascunho' || !alvo) return null;
    try {
      if (cameraDeRenderGpu) return cenaDoProjeto(p, null, alvo.largura / alvo.altura, cameraDeRenderGpu);
      if (!cameraFinal) return null;
      return cenaDoProjeto(p, cameraFinal, alvo.largura / alvo.altura);
    } catch {
      return null;
    }
  }, [qualidade, cameraFinal, alvo, p, cameraDeRenderGpu]);
  const linhaCamera = linhaDaCameraDeRender({
    gpu: qualidade === 'gpu',
    selecionada: cameraDeRender ? { nome: cameraDeRender.name } : null,
    temCameras: projectRenderCameras(p).length > 0,
  });
  // Proporção da prévia: a da câmera de render no GPU, a da vista de base nos outros caminhos.
  const proporcaoPrevia = cameraDeRenderGpu && alvo ? alvo : base;
  const estadoGpu = session.estado;
  const progressoGpu = estadoGpu.tipo === 'renderizando' ? estadoGpu : null;
  const fracaoGpu = session.fracao;
  // Sem tiles reais (total 0) não há percentual: a barra fica indeterminada, nunca 0% inventado.
  const progressoIndeterminado = progressoGpu !== null && (fracaoGpu === null || progressoGpu.total === 0);
  const travada = ocupado || estadoGpu.tipo === 'renderizando';
  const gpuConcluida = estadoGpu.tipo === 'concluido' && estadoGpu.imagem !== null ? estadoGpu.imagem : null;
  const mostrarResultadoGpu = qualidade === 'gpu' && estadoGpu.tipo === 'concluido';
  const podeRenderizarAgora = podeClicarRenderizar({
    qualidade,
    estado: estadoGpu,
    ocupadoLegado: ocupado,
    alvoValido: !!base && !!alvo && !problema,
    servicoDisponivel: gpuDisponivel === true,
    temCamera: qualidade === 'gpu' ? !!cameraFinal || !!cameraDeRenderGpu : !!cameraFinal,
    temSnapshot: !!snapshotFinal,
    // Rascunho só vale na vista 3D (ver `podeRascunhoDaVista`); fora dela o botão fica parado com o aviso.
    temFonte: !!fonte && rascunhoPermitido,
  });
  const rotuloPrincipal = rotuloDoBotaoPrincipal(estadoGpu, ocupado);

  // Imagem do render GPU para o modal: a URL vive só enquanto o resultado está na tela.
  const urlRender = useMemo(() => (gpuConcluida ? URL.createObjectURL(gpuConcluida) : null), [gpuConcluida]);
  useEffect(() => () => {
    if (urlRender) URL.revokeObjectURL(urlRender);
  }, [urlRender]);
  // Ao concluir, o PNG entra na galeria (o render já foi produzido, com ou sem download).
  useEffect(() => {
    if (!gpuConcluida) return;
    const nome = nomeArquivoRender(new Date());
    nomeSaidaRef.current = nome;
    const dims = alvoSaidaRef.current;
    if (!dims) return;
    void saveRender(
      {
        id: newId('img'),
        projectName: p.name.trim() || 'projeto',
        kind: 'image',
        name: nome.replace(/\.png$/i, ''),
        createdAt: Date.now(),
        width: dims.largura,
        height: dims.altura,
        mime: 'image/png',
      },
      gpuConcluida,
    ).catch((e: unknown) => console.warn('Imagem: não foi possível registrar o PNG na galeria', e));
  }, [gpuConcluida, p.name]);

  // Imagem do Rascunho/Final no modal (mesma regra da GPU: a URL vive só enquanto ela está na tela).
  const urlLegado = useMemo(() => (resultadoLegado ? URL.createObjectURL(resultadoLegado.blob) : null), [resultadoLegado]);
  useEffect(() => () => {
    if (urlLegado) URL.revokeObjectURL(urlLegado);
  }, [urlLegado]);
  const mostrarResultadoLegado = resultadoLegado !== null && resultadoLegado.modo === qualidade && urlLegado !== null;
  const mostrarResultadoGpuOuLegado = mostrarResultadoGpu || mostrarResultadoLegado;
  const urlResultado = mostrarResultadoGpu ? urlRender : mostrarResultadoLegado ? urlLegado : null;
  const saidaExibida: QualidadeRender | null = mostrarResultadoGpu
    ? 'gpu'
    : mostrarResultadoLegado && resultadoLegado
      ? resultadoLegado.saida
      : null;
  const rotuloResultado = saidaExibida ? rotuloDoResultado(saidaExibida, true) : null;
  const rascunhoRecusado = qualidade === 'rascunho' && !rascunhoPermitido;

  // Fechar o diálogo no meio de um render GPU cancela o job no serviço (não fica órfão).
  const { cancelar: cancelarSessao } = session;
  useEffect(() => () => cancelarSessao(), [cancelarSessao]);
  // O GPU espera o carregamento das texturas: se o diálogo fechar nesse intervalo, não inicia um job sem dono.
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);
  // O mesmo vale para o Final (Rust/WASM): fechar o modal no meio do render o aborta.
  useEffect(() => () => {
    controladorLegadoRef.current?.abort();
    controladorGpuRef.current?.abort();
  }, []);

  // Prévia: diminui a captura para caber no diálogo. A prévia usa a mesma rota da imagem final
  // (`desenharCaptura`), então o enquadramento é o da vista ativa.
  useEffect(() => {
    const canvas = previaRef.current;
    if (!canvas || !base) return;

    if (qualidade === 'gpu') {
      if (!snapshotFinal || !gpuDisponivel) return;
      let cancelado = false;
      const largura = Math.max(1, Math.min(640, Math.round(base.largura)));
      const altura = cameraDeRenderGpu
        ? Math.max(1, Math.round(largura / cameraDeRenderGpu.aspect))
        : Math.max(1, Math.round((largura * base.altura) / base.largura));
      // As texturas dos presets são carregadas antes de codificar (falha vira erro da prévia, não cena sem textura).
      // Mips e HSTR saem da thread principal (worker); a prévia usa a resolução de prévia (`LADO_PREVIA_TEXTURA`).
      // Trocar a cena ou fechar o diálogo aborta o preparo (o worker é encerrado).
      const controlador = new AbortController();
      void codificarCenaNoWorker(
        snapshotFinal,
        { lado: LADO_PREVIA_TEXTURA },
        (progresso) => { if (!cancelado) setProgressoTexturas(progresso); },
        controlador.signal,
      )
        .then((hstr) => renderizarNativo(hstr, { largura, altura, exposicao }))
        .then(async (blob) => {
          const bitmap = await createImageBitmap(blob);
          if (cancelado) { bitmap.close(); return; }
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(bitmap, 0, 0, largura, altura);
          bitmap.close();
          setPreviaFalhou(false);
        })
        .catch(() => {
          if (!cancelado) setPreviaFalhou(true);
        })
        .finally(() => {
          if (!cancelado) setProgressoTexturas(null);
        });
      return () => {
        cancelado = true;
        controlador.abort();
      };
    }

    if (qualidade === 'final') {
      if (!snapshotFinal || !cameraFinal) return;
      let cancelado = false;
      // Fechar o diálogo (ou trocar as dependências) aborta a codificação do HSTR no worker.
      const controlador = new AbortController();
      const larguraMax = Math.max(1, Math.min(720, Math.round(base.largura)));
      // Refinamento progressivo: primeiro um quadro pequeno e barato, depois mais resolução e
      // amostras. O PNG salvo é o do botão (resolução final), este laço é só a prévia.
      const passos = [
        { largura: Math.min(240, larguraMax), spp: 1 },
        { largura: Math.min(480, larguraMax), spp: 2 },
        { largura: larguraMax, spp: 4 },
      ].filter((p, i, a) => i === 0 || p.largura !== a[i - 1]!.largura);
      void (async () => {
        let cliente: ClienteRenderWasm;
        try {
          clientePreview.current ??= criarClienteWasm();
          cliente = await clientePreview.current;
        } catch {
          clientePreview.current = null;
          setPreviaFalhou(true);
          return;
        }
        // Uma vez para todos os passos: as texturas dos presets entram na cena antes de ir ao wasm.
        const cenaComTexturas = await comTexturasCarregadas(snapshotFinal, {
          lado: LADO_PREVIA_TEXTURA,
          progresso: (feitas, total) => { if (!cancelado) setProgressoTexturas({ fase: 'texturas', feitas, total }); },
        }).catch(() => null);
        if (!cancelado) setProgressoTexturas(null);
        if (!cenaComTexturas) {
          if (!cancelado) setPreviaFalhou(true);
          return;
        }
        // HSTR da cena (com as texturas da prévia), codificado no worker no primeiro passe; os passes seguintes reaproveitam.
        let hstr: Uint8Array | undefined;
        for (const passo of passos) {
          if (cancelado) return;
          const largura = Math.max(1, passo.largura);
          const altura = Math.max(1, Math.round((largura * base.altura) / base.largura));
          try {
            if (passo === passos[0]) {
              hstr = await codificarCenaNoWorker(cenaComTexturas, { lado: LADO_PREVIA_TEXTURA }, undefined, controlador.signal);
            }
            const render = await renderizarImagemRust({
              cena: cenaComTexturas,
              largura,
              altura,
              spp: passo.spp,
              exposicao,
              seed: 1,
              camera: cameraFinal,
              bloco: 128,
              cliente,
              hstr,
              // A cena/BVH já está no cliente da prévia; só o primeiro passe a carrega.
              recarregarCena: passo === passos[0],
            });
            if (cancelado) return;
            canvas.width = largura;
            canvas.height = altura;
            canvas.getContext('2d')?.putImageData(render.imagem, 0, 0);
            setPreviaFalhou(false);
          } catch (e) {
            if (cancelado) return;
            if (passo === passos[0]) {
              // Se o wasm falhar, a prévia mostra o rascunho da vista 3D (sem grade), nunca a planta com helpers.
              // Cena com textura não ganha rascunho: a prévia diria que é o Final, e não é.
              if (!podeCairParaRascunho(e)) setErro(e instanceof Error ? e.message : 'O render final não pôde ser feito.');
              if (fonte && rascunhoPermitido && podeCairParaRascunho(e)) {
                const escala = Math.min(1, 640 / base.largura, 360 / base.altura);
                const l = Math.round(base.largura * escala);
                const a = Math.round(base.altura * escala);
                try { naVistaDoRascunho(() => desenharCaptura(canvas, fonte, l, a), apresentacao3d); } catch { /* sem canvas */ }
              }
              setPreviaFalhou(true);
            }
            return;
          }
        }
      })();
      return () => {
        cancelado = true;
        controlador.abort();
      };
    }

    // Rascunho recusado (planta, corte, prancha): não há prévia; o aviso explica e o botão fica parado.
    if (!fonte || !rascunhoPermitido) return;
    const escala = Math.min(1, 640 / base.largura, 360 / base.altura);
    const largura = Math.max(1, Math.round(base.largura * escala));
    const altura = Math.max(1, Math.round(base.altura * escala));
    try {
      naVistaDoRascunho(() => desenharCaptura(canvas, fonte, largura, altura), apresentacao3d);
      setPreviaFalhou(false);
    } catch {
      setPreviaFalhou(true);
    }
  }, [fonte, base, qualidade, snapshotFinal, cameraFinal, exposicao, gpuDisponivel, rascunhoPermitido, apresentacao3d, cameraDeRenderGpu]);

  // Em “largura/altura”, o campo que não foi editado acompanha o outro enquanto a proporção estiver travada.
  const mudarLargura = (v: number): void => {
    const largura = Math.max(1, Math.round(v));
    setPersonalizado((atual) => ({
      largura,
      altura:
        manterProporcao && base
          ? Math.max(1, Math.round((largura * base.altura) / base.largura))
          : atual.altura,
    }));
  };
  const mudarAltura = (v: number): void => {
    const altura = Math.max(1, Math.round(v));
    setPersonalizado((atual) => ({
      largura:
        manterProporcao && base
          ? Math.max(1, Math.round((altura * base.largura) / base.altura))
          : atual.largura,
      altura,
    }));
  };

  /** GPU nativo: o job roda na sessão (hook); o resultado aparece no modal e só então "Baixar". */
  const iniciarGpu = async (): Promise<void> => {
    if (!base || !alvo || problema || !snapshotFinal || !(cameraFinal || cameraDeRenderGpu)) return;
    if (gpuDisponivel !== true) {
      setErro(MENSAGEM_SERVICO_GPU_INDISPONIVEL);
      return;
    }
    // Mips e HSTR no worker (renderWorkerClient); o indicador da prévia mostra o progresso. Fechar aborta.
    controladorGpuRef.current?.abort();
    const controlador = new AbortController();
    controladorGpuRef.current = controlador;
    let hstr: Uint8Array;
    try {
      hstr = await codificarCenaNoWorker(
        snapshotFinal,
        {},
        (progresso) => { if (!controlador.signal.aborted) setProgressoTexturas(progresso); },
        controlador.signal,
      );
    } catch (e) {
      if (controlador.signal.aborted) return;
      setErro(e instanceof Error ? e.message : 'Não foi possível preparar a cena para a GPU.');
      return;
    } finally {
      if (controladorGpuRef.current === controlador) controladorGpuRef.current = null;
      if (!controlador.signal.aborted) setProgressoTexturas(null);
    }
    if (!montadoRef.current) return;
    setErro('');
    alvoSaidaRef.current = { ...alvo };
    void session.iniciar({ hstr, largura: alvo.largura, altura: alvo.altura, exposicao });
  };

  /** Rascunho e Final (Rust/WASM): ainda fora da sessão; mantêm a captura e a entrega antigas. */
  const renderizarLegado = async (): Promise<void> => {
    if (!base || !alvo || problema || ocupado) return;
    if (qualidade === 'rascunho' && !fonte) return;
    if (qualidade === 'rascunho' && !rascunhoPermitido) {
      setErro(MENSAGEM_RASCUNHO_SO_3D);
      return;
    }
    if (qualidade === 'final' && !cameraFinal) {
      setErro('Abra a vista 3D (ou o estúdio de animação) para renderizar a imagem final.');
      return;
    }
    setOcupado(true);
    setErro('');
    setLegadoCancelado(false);
    setResultadoLegado(null);
    let cancelado = false;
    // A saída pode cair para rascunho se o Final falhar; o título do resultado acompanha isso.
    let saida: 'rascunho' | 'final' = qualidade === 'final' ? 'final' : 'rascunho';
    try {
      let blob: Blob;
      if (qualidade === 'final' && cameraFinal) {
        // Render final: snapshot da mesma cena 3D + path tracer Rust/WASM.
        const snapshot = await comTexturasCarregadas(snapshotFinal ?? cenaDoProjeto(p, cameraFinal, alvo.largura / alvo.altura));
        clienteFinal.current ??= criarClienteWasm();
        const cliente = await clienteFinal.current;
        const controlador = new AbortController();
        controladorLegadoRef.current = controlador;
        setProgressoLegado({ titulo: 'Renderizando', rodape: 'Preparando o render final', fracao: null, cancelavel: true });
        try {
          // A codificação do HSTR sai da thread principal (worker); fechar o diálogo aborta.
          const hstr = await codificarCenaNoWorker(snapshot, {}, undefined, controlador.signal);
          const render = await renderizarImagemRust({
            cena: snapshot,
            largura: alvo.largura,
            altura: alvo.altura,
            spp: amostras,
            exposicao,
            seed: Date.now() >>> 0,
            camera: cameraFinal,
            cliente,
            hstr,
            sinal: controlador.signal,
            aoProgredir: (p) => {
              setProgressoLegado({ titulo: 'Renderizando', rodape: 'Renderizando a imagem final', fracao: p.fracao, cancelavel: true });
            },
          });
          blob = render.png;
        } catch (e) {
          if (controlador.signal.aborted) {
            cancelado = true;
            throw e;
          }
          // Textura não suportada não cai para o rascunho: o diálogo mostra o motivo (ver `podeCairParaRascunho`).
          // Outras falhas do Rust entregam o rascunho da vista 3D (sem grade), com aviso, em vez de uma tela preta.
          if (fonte && rascunhoPermitido && podeCairParaRascunho(e)) {
            blob = await capturarRascunho({ largura: alvo.largura, altura: alvo.altura }, apresentacao3d);
            saida = 'rascunho';
            setErro(`O render final falhou (${e instanceof Error ? e.message : 'erro desconhecido'}). Mostro o rascunho da vista 3D.`);
          } else {
            throw e;
          }
        } finally {
          controladorLegadoRef.current = null;
          setProgressoLegado(null);
        }
      } else {
        // Rascunho: amplia o canvas da vista 3D em modo apresentação (sem grade, níveis nem chão). Rápido, sem luz nova.
        setProgressoLegado({ titulo: 'Capturando a vista…', rodape: '', fracao: null, cancelavel: false });
        try {
          blob = await capturarRascunho({ largura: alvo.largura, altura: alvo.altura }, apresentacao3d);
        } finally {
          setProgressoLegado(null);
        }
      }
      const arquivoFinal = nomeArquivoPng(nome);
      const thumb = previaRef.current ? criarMiniaturaDataUrl(previaRef.current, 180) : null;

      // Registra na galeria mesmo se o usuário cancelar o download: o render já foi produzido.
      try {
        await saveRender(
          {
            id: newId('img'),
            projectName: p.name.trim() || 'projeto',
            kind: 'image',
            name: arquivoFinal.replace(/\.png$/i, ''),
            createdAt: Date.now(),
            width: alvo.largura,
            height: alvo.altura,
            mime: 'image/png',
            ...(thumb ? { thumbnail: thumb } : {}),
          },
          blob,
        );
      } catch (e) {
        console.warn('Imagem: não foi possível registrar o PNG na galeria', e);
      }

      // A imagem fica no modal, com "Baixar" e "Renderizar de novo". Nada é entregue ao navegador aqui.
      setResultadoLegado({ modo: qualidade === 'final' ? 'final' : 'rascunho', saida, blob, nome: arquivoFinal });
      useUi.setState({ status: `Imagem ${arquivoFinal} pronta (também na galeria).` });
    } catch (e) {
      if (cancelado) {
        setLegadoCancelado(true);
        return;
      }
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PNG da vista ativa.');
    } finally {
      setOcupado(false);
    }
  };
  const cancelarLegado = (): void => controladorLegadoRef.current?.abort();

  /** "Baixar" do Rascunho/Final: só entrega o PNG que já está no modal; nunca começa um render. */
  const baixarLegado = async (): Promise<void> => {
    if (!resultadoLegado) return;
    try {
      const bytes = new Uint8Array(await resultadoLegado.blob.arrayBuffer());
      const entrega = await entregarArquivo({ nome: resultadoLegado.nome, conteudo: bytes });
      if (entrega === 'falhou') {
        setErro('Não foi possível entregar o PNG ao navegador. A imagem continua na galeria.');
        useUi.setState({ status: 'Não foi possível entregar o PNG.' });
        return;
      }
      useUi.setState({
        status:
          entrega === 'cancelado'
            ? 'Salvamento cancelado. A imagem ficou na galeria.'
            : `Imagem ${resultadoLegado.nome} salva.`,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível baixar o PNG.');
    }
  };

  /** Ação "Renderizar": GPU pela sessão; Rascunho e Final pelo caminho antigo. */
  const acaoRenderizar = (): void => {
    if (!podeRenderizarAgora) return;
    if (qualidade === 'gpu') void iniciarGpu();
    else void renderizarLegado();
  };
  const reiniciarGpu = (): void => {
    session.reiniciar();
    void iniciarGpu();
  };

  const sub = base
    ? `${rotuloDaVista(vista)} · ${base.largura}×${base.altura} px`
    : 'Captura da vista ativa';
  const gpuIndisponivelMotivo = qualidade === 'gpu' && gpuDisponivel === false ? motivoGpuIndisponivel(false) : null;

  return (
    <Dialog
      title="Renderizar imagem"
      sub={sub}
      onClose={close}
      size="wide"
      onSubmit={() => {
        if (!mostrarResultadoGpuOuLegado && podeRenderizarAgora) acaoRenderizar();
      }}
      footer={
        <>
          <button className="btn" onClick={close} disabled={travada}>
            Fechar
          </button>
          {mostrarResultadoGpuOuLegado ? (
            <>
              <button
                className="btn"
                disabled={!podeRenderizarAgora}
                onClick={mostrarResultadoLegado ? () => void renderizarLegado() : reiniciarGpu}
              >
                Renderizar de novo
              </button>
              {/* Baixar só com a imagem pronta no modal; nunca inicia um render. */}
              <button
                className="btn primary"
                disabled={mostrarResultadoLegado ? false : !podeBaixar(estadoGpu)}
                onClick={
                  mostrarResultadoLegado
                    ? () => void baixarLegado()
                    : () => session.baixar(nomeSaidaRef.current || nomeArquivoRender(new Date()))
                }
              >
                Baixar
              </button>
            </>
          ) : qualidade === 'gpu' && estadoGpu.tipo === 'erro' ? (
            <button className="btn primary" disabled={!podeRenderizarAgora} onClick={reiniciarGpu}>
              Tentar de novo
            </button>
          ) : (
            <button className="btn primary" disabled={!podeRenderizarAgora} onClick={acaoRenderizar}>
              {rotuloPrincipal}
            </button>
          )}
        </>
      }
    >
      <div className="ri" aria-busy={ocupado}>
        {!fonte ? (
          <div className="ri-aviso" role="alert">
            <b>Nenhuma vista ativa para capturar.</b> Abra a planta, um corte ou o modelo 3D e abra
            este diálogo de novo.
          </div>
        ) : !base ? (
          <div className="ri-aviso" role="alert">
            <b>A vista ativa ainda não foi desenhada.</b> Aguarde o desenho terminar e tente
            novamente.{' '}
            <button className="btn small" onClick={() => setRevisao((n) => n + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {base && vista !== '3d' && vista !== 'animation' ? (
          <p className="ri-dica">
            A captura usa a vista ativa ({rotuloDaVista(vista).toLowerCase()}). Para a imagem de
            apresentação 3D, abra o Modelo 3D antes de renderizar.
          </p>
        ) : null}

        <div className="ri-grid">
          <div className="ri-previa" style={proporcaoPrevia ? { aspectRatio: `${proporcaoPrevia.largura} / ${proporcaoPrevia.altura}` } : undefined}>
            {base ? (
              <canvas ref={previaRef} aria-label="Prévia da captura" hidden={urlResultado !== null || rascunhoRecusado} />
            ) : (
              <span className="ri-previa-vazio">Sem prévia</span>
            )}
            {base && rascunhoRecusado && urlResultado === null ? (
              <span className="ri-previa-vazio">Rascunho indisponível nesta vista</span>
            ) : null}
            {progressoTexturas && urlResultado === null ? (
              <span className="ri-previa-vazio ri-previa-progresso" role="status">
                {progressoTexturas.fase === 'texturas'
                  ? `Carregando texturas ${progressoTexturas.feitas} de ${progressoTexturas.total}`
                  : 'Codificando a cena para a GPU…'}
              </span>
            ) : null}
            {urlResultado !== null ? (
              <img className="ri-resultado" src={urlResultado} alt={rotuloResultado ?? 'Imagem renderizada'} />
            ) : null}
          </div>

          <div className="ri-col">
            <section className="ri-bloco">
              <h3>Qualidade</h3>
              <div className="ri-seg" role="group" aria-label="Qualidade da imagem">
                <button
                  type="button"
                  className={`ri-op${qualidade === 'rascunho' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'rascunho'}
                  disabled={travada}
                  onClick={() => { escolhaManual.current = true; setQualidade('rascunho'); }}
                >
                  Rascunho
                </button>
                <button
                  type="button"
                  className={`ri-op${qualidade === 'final' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'final'}
                  disabled={!cameraFinal || travada}
                  title={cameraFinal ? 'Path tracer Rust/WASM no navegador' : 'Abra a vista 3D ou o estúdio de animação para o render final'}
                  onClick={() => { escolhaManual.current = true; setQualidade('final'); }}
                >
                  Final (Rust/WASM)
                </button>
                <button
                  type="button"
                  className={`ri-op${qualidade === 'gpu' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'gpu'}
                  disabled={gpuDisponivel !== true || !(cameraFinal || explicitaDeRender) || travada}
                  title={gpuDisponivel === true ? 'Render GPU nativo Rust/wgpu com mapa de sombra e PBR' : 'Inicie o render-service local para usar a GPU nativa'}
                  onClick={() => { escolhaManual.current = true; setQualidade('gpu'); }}
                >
                  GPU nativo
                </button>
              </div>
              <p className="ri-dica">
                {qualidade === 'gpu'
                  ? 'Render final na GPU nativa (Rust/wgpu). O progresso aparece aqui, no diálogo.'
                  : qualidade === 'final'
                    ? 'Render final em Rust/WASM no navegador; mais lento que a GPU nativa.'
                    : 'Rascunho: captura a vista 3D em modo apresentação (sem grade nem níveis), sem recalcular a luz.'}
              </p>
              {linhaCamera ? <p className="ri-dica">{linhaCamera}</p> : null}
              {qualidade === 'final' ? (
                <label className="ri-campo">
                  <span>Amostras (WASM)</span>
                  <select className="select" value={amostras} onChange={(e) => setAmostras(Number(e.target.value))}>
                    <option value={8}>8 · rápido</option>
                    <option value={16}>16 · equilibrado</option>
                    <option value={24}>24 · boa qualidade</option>
                    <option value={48}>48 · final lento</option>
                  </select>
                </label>
              ) : null}
              {qualidade === 'final' || qualidade === 'gpu' ? (
                <label className="ri-campo">
                  <span>Exposição (EV)</span>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={exposicao}
                    onChange={(e) => setExposicao(Number(e.target.value))}
                  />
                </label>
              ) : null}
            </section>
            <section className="ri-bloco">
              <h3>Arquivo</h3>
              <label className="ri-campo">
                <span>Nome</span>
                <input
                  id="ri-nome"
                  className="input wide"
                  value={nome}
                  placeholder="projeto-vista"
                  data-autofocus=""
                  onChange={(e) => setNome(e.target.value)}
                />
              </label>
              <p className="ri-dica">
                Será salvo como <code>{arquivo}</code>
              </p>
            </section>

            <section className="ri-bloco">
              <h3>Resolução</h3>
              <div className="ri-seg" role="group" aria-label="Resolução da imagem">
                {(['1x', '2x', 'personalizado'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`ri-op${modo === m ? ' on' : ''}`}
                    aria-pressed={modo === m}
                    onClick={() => {
                      // Entrar em “largura/altura” parte do tamanho que está na tela, não de um valor antigo.
                      if (m === 'personalizado' && modo !== 'personalizado' && alvo) {
                        setPersonalizado({ ...alvo });
                      }
                      setModo(m);
                    }}
                  >
                    {m === 'personalizado' ? 'Largura/altura' : m}
                  </button>
                ))}
              </div>

              <div className="ri-dim">
                <label className="ri-campo">
                  <span>Largura</span>
                  <NumField
                    value={modo === 'personalizado' ? personalizado.largura : (alvo?.largura ?? null)}
                    decimals={0}
                    min={1}
                    max={LIMITE_LADO_IMAGEM}
                    unit="px"
                    disabled={modo !== 'personalizado'}
                    onCommit={mudarLargura}
                  />
                </label>
                <label className="ri-campo">
                  <span>Altura</span>
                  <NumField
                    value={modo === 'personalizado' ? personalizado.altura : (alvo?.altura ?? null)}
                    decimals={0}
                    min={1}
                    max={LIMITE_LADO_IMAGEM}
                    unit="px"
                    disabled={modo !== 'personalizado'}
                    onCommit={mudarAltura}
                  />
                </label>
              </div>

              <label className="ri-check">
                <input
                  type="checkbox"
                  checked={manterProporcao}
                  disabled={modo !== 'personalizado'}
                  onChange={(e) => setManterProporcao(e.target.checked)}
                />
                Manter a proporção da vista
              </label>

              <div className="ri-alvo">
                <span>Saída</span>
                <b>{alvo ? `${alvo.largura}×${alvo.altura} px` : '—'}</b>
              </div>
              <p className="ri-dica">
                {qualidade === 'final'
                  ? 'O render final usa o mesmo path tracer Rust/WASM do estúdio; a prévia refina em etapas.'
                  : 'A captura rápida copia a vista 3D em modo apresentação, sem recalcular a luz.'}
              </p>
            </section>
          </div>
        </div>

        {rotuloResultado ? (
          <div className="ri-aviso" role="status">
            {rotuloResultado}
          </div>
        ) : null}
        {progressoGpu ? (
          <BlocoProgresso
            titulo="Renderizando"
            // Com a grade, a contagem fica sob ela (legenda); sem tiles, a contagem segue no topo.
            detalhe={progressoGpu.total > 0 && !session.tiles ? `${progressoGpu.concluidos} de ${progressoGpu.total} tiles` : undefined}
            fracao={progressoIndeterminado ? null : (fracaoGpu ?? 0)}
            rodape={progressoIndeterminado ? 'Preparando…' : ''}
            onCancelar={() => session.cancelar()}
            grade={
              session.tiles ? (
                <RenderTilesGrade tiles={session.tiles} concluidosServico={progressoGpu.concluidos} />
              ) : undefined
            }
          />
        ) : null}
        {progressoLegado ? (
          <BlocoProgresso
            titulo={progressoLegado.titulo}
            fracao={progressoLegado.fracao}
            rodape={progressoLegado.rodape}
            onCancelar={progressoLegado.cancelavel ? cancelarLegado : undefined}
          />
        ) : null}
        {legadoCancelado ? (
          <div className="ri-aviso" role="status">
            Render cancelado.
          </div>
        ) : null}
        {gpuIndisponivelMotivo ? (
          <div className="ri-aviso ri-erro" role="alert">
            {gpuIndisponivelMotivo}
          </div>
        ) : null}
        {qualidade === 'gpu' && estadoGpu.tipo === 'erro' ? (
          <div className="ri-aviso ri-erro" role="alert">
            {estadoGpu.mensagem}
          </div>
        ) : null}
        {qualidade === 'gpu' && estadoGpu.tipo === 'cancelado' ? (
          <div className="ri-aviso" role="status">
            Render cancelado.
          </div>
        ) : null}
        {rascunhoRecusado && base ? (
          <div className="ri-aviso ri-erro" role="alert">
            {MENSAGEM_RASCUNHO_SO_3D}
          </div>
        ) : null}
        {problema ? (
          <div className="ri-aviso ri-erro" role="alert">
            {problema}
          </div>
        ) : null}
        {previaFalhou ? (
          <div className="ri-aviso ri-erro" role="alert">
            Não foi possível desenhar a prévia. Se o canvas da vista estiver protegido, o PNG também
            não poderá ser lido.
          </div>
        ) : null}
        {erro ? (
          <div className="ri-aviso ri-erro" role="alert">
            {erro}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
