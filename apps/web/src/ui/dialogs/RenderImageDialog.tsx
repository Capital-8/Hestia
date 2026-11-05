/* eslint-disable max-lines -- o diálogo reúne prévia progressiva, resolução e entrega; dividir depois. */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { newId, view3dOf, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene } from '@hestia/render';
import { useProject } from '../../editor/controller.ts';
import { entregarArquivo } from '../../editor/entregarArquivo.ts';
import { canvasAtivo } from '../../editor/render/captureRegistry.ts';
import { renderizarImagemRust } from '../../editor/render/rustStillRenderer.ts';
import { codificarCena, criarClienteWasm, type ClienteRenderWasm } from '../../editor/render/wasmClient.ts';
import {
  cancelarJobNativo,
  criarJobNativo,
  previewJobNativo,
  resultadoJobNativo,
  saudeRenderNativo,
  statusJobNativo,
} from '../../editor/render/nativeClient.ts';
import { renderizarNativo } from '../../editor/render/nativeClient.ts';
import { cameraPreviewAtual } from '../../editor/render/previewCamera.ts';
import { camera3DAtual } from '../../editor/vista3dAoVivo.ts';
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
import { useRenderJob } from '../../editor/renderProgress.ts';
import { useUi } from '../../editor/state.ts';
import { NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
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

/** Snapshot da cena 3D para o path tracer (mesma montagem realista da vista 3D). */
function cenaDoProjeto(p: Project, camera: SheetView3DCamera, aspect: number) {
  const cena = new ModelScene();
  try {
    const projeto = { ...p, view3d: { ...view3dOf(p), style: 'realistic' as const, shadows: true, edges: true } };
    cena.update(projeto, p.levels.map((l) => resolveLevel(projeto, l.id)), { dark: false, edges: true, shadows: true });
    return cena.exportarCenaDeRender({ camera, aspect });
  } finally {
    cena.dispose();
  }
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
  const cameraFinal = camera3DAtual() ?? cameraPreviewAtual();
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

  const alvo = useMemo(
    () => (base ? resolverDimensoes(base, modo, personalizado) : null),
    [base, modo, personalizado],
  );
  const problema = alvo ? validarDimensoes(alvo) : null;
  const arquivo = nomeArquivoPng(nome);
  const snapshotFinal = useMemo(() => {
    if (qualidade === 'rascunho' || !cameraFinal || !alvo) return null;
    try {
      return cenaDoProjeto(p, cameraFinal, alvo.largura / alvo.altura);
    } catch {
      return null;
    }
  }, [qualidade, cameraFinal, alvo, p]);
  const podeSalvar = !!base && !!alvo && !problema && !ocupado && (
    qualidade === 'rascunho'
      ? !!fonte
      : qualidade === 'gpu'
        ? gpuDisponivel === true && !!snapshotFinal
        : !!cameraFinal
  );

  // Prévia: diminui a captura para caber no diálogo. A prévia usa a mesma rota da imagem final
  // (`desenharCaptura`), então o enquadramento é o da vista ativa.
  useEffect(() => {
    const canvas = previaRef.current;
    if (!canvas || !base) return;

    if (qualidade === 'gpu') {
      if (!snapshotFinal || !cameraFinal || !gpuDisponivel) return;
      let cancelado = false;
      const largura = Math.max(1, Math.min(640, Math.round(base.largura)));
      const altura = Math.max(1, Math.round((largura * base.altura) / base.largura));
      const hstr = codificarCena(snapshotFinal);
      void renderizarNativo(hstr, { largura, altura, spp: 1, exposicao })
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
        });
      return () => { cancelado = true; };
    }

    if (qualidade === 'final') {
      if (!snapshotFinal || !cameraFinal) return;
      let cancelado = false;
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
        for (const passo of passos) {
          if (cancelado) return;
          const largura = Math.max(1, passo.largura);
          const altura = Math.max(1, Math.round((largura * base.altura) / base.largura));
          try {
            const render = await renderizarImagemRust({
              cena: snapshotFinal,
              largura,
              altura,
              spp: passo.spp,
              exposicao,
              seed: 1,
              camera: cameraFinal,
              bloco: 128,
              cliente,
              // A cena/BVH já está no cliente da prévia; só o primeiro passe a carrega.
              recarregarCena: passo === passos[0],
            });
            if (cancelado) return;
            canvas.width = largura;
            canvas.height = altura;
            canvas.getContext('2d')?.putImageData(render.imagem, 0, 0);
            setPreviaFalhou(false);
          } catch {
            if (cancelado) return;
            if (passo === passos[0]) {
              // Se o wasm falhar, a prévia ainda mostra a vista atual (sem fingir que é o final).
              if (fonte) {
                const escala = Math.min(1, 640 / base.largura, 360 / base.altura);
                try { desenharCaptura(canvas, fonte, Math.round(base.largura * escala), Math.round(base.altura * escala)); } catch { /* sem canvas */ }
              }
              setPreviaFalhou(true);
            }
            return;
          }
        }
      })();
      return () => { cancelado = true; };
    }

    if (!fonte) return;
    const escala = Math.min(1, 640 / base.largura, 360 / base.altura);
    const largura = Math.max(1, Math.round(base.largura * escala));
    const altura = Math.max(1, Math.round(base.altura * escala));
    try {
      desenharCaptura(canvas, fonte, largura, altura);
      setPreviaFalhou(false);
    } catch {
      setPreviaFalhou(true);
    }
  }, [fonte, base, qualidade, snapshotFinal, cameraFinal, exposicao, gpuDisponivel]);

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

  const salvar = async (): Promise<void> => {
    if (!base || !alvo || problema || ocupado) return;
    if (qualidade === 'rascunho' && !fonte) return;
    if (qualidade === 'final' && !cameraFinal) {
      setErro('Abra a vista 3D (ou o estúdio de animação) para renderizar a imagem final.');
      return;
    }
    if (qualidade === 'gpu' && (!cameraFinal || !snapshotFinal || gpuDisponivel !== true)) {
      setErro('O serviço GPU nativo não está disponível. Inicie o `render-service` e tente de novo.');
      return;
    }
    setOcupado(true);
    setErro('');
    try {
      // Captura na resolução final (v1: up-scale do viewport; o render final Rust entra depois).
      let blob: Blob;
      if (qualidade === 'gpu' && snapshotFinal) {
        // Render final profissional: serviço Rust/wgpu local. O job devolve prévias
        // parciais; a UI acompanha o mesmo arquivo ficando melhor.
        const hstr = codificarCena(snapshotFinal);
        const controlador = new AbortController();
        const jobId = await criarJobNativo(hstr, {
          largura: alvo.largura,
          altura: alvo.altura,
          spp: amostras,
          exposicao,
          sinal: controlador.signal,
        });
        useRenderJob.getState().iniciar({
          kind: 'image',
          phase: 'preparing',
          frame: 0,
          total: 100,
          etaMs: null,
          message: 'Iniciando o render GPU nativo',
        });
        useRenderJob.getState().definirCancelar(() => {
          controlador.abort();
          void cancelarJobNativo(jobId);
        });
        try {
          let ultimoPreview = 0;
          for (;;) {
            if (controlador.signal.aborted) throw new Error('Render cancelado.');
            const status = await statusJobNativo(jobId, controlador.signal);
            if (!status) throw new Error('O serviço de render nativo parou de responder.');
            if (status.erro) throw new Error(status.erro);
            useRenderJob.getState().atualizar({
              phase: status.pronto ? 'saving' : 'rendering',
              frame: Math.round(status.fracao * 100),
              total: 100,
              etaMs: null,
              message: status.fase || 'Renderizando na GPU',
            });
            if (status.pronto) {
              const resultado = await resultadoJobNativo(jobId, controlador.signal);
              if (!resultado) throw new Error('O render GPU terminou sem imagem.');
              blob = resultado;
              break;
            }
            if (Date.now() - ultimoPreview > 250) {
              ultimoPreview = Date.now();
              const parcial = await previewJobNativo(jobId, controlador.signal);
              const canvas = previaRef.current;
              if (parcial && canvas) {
                const bitmap = await createImageBitmap(parcial);
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
                bitmap.close();
              }
            }
            await new Promise((resolver) => setTimeout(resolver, 180));
          }
        } finally {
          useRenderJob.getState().definirCancelar(null);
          useRenderJob.getState().finalizar();
        }
      } else if (qualidade === 'final' && cameraFinal) {
        // Render final: snapshot da mesma cena 3D + path tracer Rust/WASM.
        const snapshot = snapshotFinal ?? cenaDoProjeto(p, cameraFinal, alvo.largura / alvo.altura);
        clienteFinal.current ??= criarClienteWasm();
        const cliente = await clienteFinal.current;
        const controlador = new AbortController();
        useRenderJob.getState().iniciar({
          kind: 'image',
          phase: 'preparing',
          frame: 0,
          total: 100,
          etaMs: null,
          message: 'Preparando o render final',
        });
        useRenderJob.getState().definirCancelar(() => controlador.abort());
        try {
          const render = await renderizarImagemRust({
            cena: snapshot,
            largura: alvo.largura,
            altura: alvo.altura,
            spp: amostras,
            exposicao,
            seed: Date.now() >>> 0,
            camera: cameraFinal,
            cliente,
            sinal: controlador.signal,
            aoProgredir: (p) => {
              useRenderJob.getState().atualizar({
                phase: 'rendering',
                frame: Math.round(p.fracao * 100),
                total: 100,
                etaMs: null,
                message: 'Renderizando a imagem final',
              });
            },
          });
          blob = render.png;
        } catch (e) {
          if (controlador.signal.aborted) throw e;
          if (fonte) {
            // O Rust é opcional: se a cena não passar, entrega o rascunho em vez de uma tela preta.
            blob = await capturarVista({ largura: alvo.largura, altura: alvo.altura });
            setErro(`O render final falhou (${e instanceof Error ? e.message : 'erro desconhecido'}). Gerei o rascunho da vista.`);
          } else {
            throw e;
          }
        } finally {
          useRenderJob.getState().definirCancelar(null);
          useRenderJob.getState().finalizar();
        }
      } else {
        // Rascunho: amplia o canvas da vista ativa (rápido; sem detalhe novo).
        blob = await capturarVista({ largura: alvo.largura, altura: alvo.altura });
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
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

      const entrega = await entregarArquivo({ nome: arquivoFinal, conteudo: bytes });
      if (entrega === 'falhou') {
        setErro('O PNG foi gerado e ficou na galeria, mas não foi possível entregá-lo ao navegador.');
        useUi.setState({ status: 'Não foi possível entregar o PNG.' });
        return;
      }
      useUi.setState({
        status:
          entrega === 'cancelado'
            ? 'Salvamento cancelado. A imagem ficou na galeria.'
            : `Imagem ${arquivoFinal} salva.`,
      });
      close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PNG da vista ativa.');
    } finally {
      setOcupado(false);
    }
  };

  const sub = base
    ? `${rotuloDaVista(vista)} · ${base.largura}×${base.altura} px`
    : 'Captura da vista ativa';

  return (
    <Dialog
      title="Renderizar imagem"
      sub={sub}
      onClose={close}
      size="wide"
      onSubmit={() => {
        if (podeSalvar) void salvar();
      }}
      footer={
        <>
          <button className="btn" onClick={close} disabled={ocupado}>
            Fechar
          </button>
          <button
            className="btn primary"
            disabled={!podeSalvar}
            onClick={() => void salvar()}
          >
            {ocupado ? 'Gerando PNG…' : 'Salvar PNG'}
          </button>
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
          <div className="ri-previa" style={base ? { aspectRatio: `${base.largura} / ${base.altura}` } : undefined}>
            {base ? (
              <canvas ref={previaRef} aria-label="Prévia da captura" />
            ) : (
              <span className="ri-previa-vazio">Sem prévia</span>
            )}
          </div>

          <div className="ri-col">
            <section className="ri-bloco">
              <h3>Qualidade</h3>
              <div className="ri-seg" role="group" aria-label="Qualidade da imagem">
                <button
                  type="button"
                  className={`ri-op${qualidade === 'rascunho' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'rascunho'}
                  onClick={() => { escolhaManual.current = true; setQualidade('rascunho'); }}
                >
                  Rascunho
                </button>
                <button
                  type="button"
                  className={`ri-op${qualidade === 'final' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'final'}
                  disabled={!cameraFinal}
                  title={cameraFinal ? 'Path tracer Rust/WASM no navegador' : 'Abra a vista 3D ou o estúdio de animação para o render final'}
                  onClick={() => { escolhaManual.current = true; setQualidade('final'); }}
                >
                  Final (Rust/WASM)
                </button>
                <button
                  type="button"
                  className={`ri-op${qualidade === 'gpu' ? ' on' : ''}`}
                  aria-pressed={qualidade === 'gpu'}
                  disabled={gpuDisponivel !== true || !cameraFinal}
                  title={gpuDisponivel === true ? 'Render GPU nativo Rust/wgpu com mapa de sombra e PBR' : 'Inicie o render-service local para usar a GPU nativa'}
                  onClick={() => { escolhaManual.current = true; setQualidade('gpu'); }}
                >
                  GPU nativo
                </button>
              </div>
              <p className="ri-dica">
                {qualidade === 'gpu'
                  ? 'Render final na GPU nativa (Rust/wgpu), com prévias parciais no mesmo quadro.'
                  : qualidade === 'final'
                    ? 'Render final em Rust/WASM no navegador; mais lento que a GPU nativa.'
                    : 'Rascunho: amplia o desenho da tela, sem recalcular a luz.'}
              </p>
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
                  : 'A captura rápida amplia o desenho da tela, sem recalcular a luz.'}
              </p>
            </section>
          </div>
        </div>

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
