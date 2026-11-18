import type { PecaResolvida } from '@hestia/engine';
import {
  definirTampoCaixaria,
  definirTamponamentosCaixaria,
  dividirVao,
  dividirVaoEmIguais,
  preencherVao,
  resolverVaosCaixaria,
  type Familia,
} from '@hestia/model';
import { VisualizadorFamilia, type CliqueFace3D, type CliqueVao3D, type ModoInteracao3DFamilia } from '@hestia/render';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Familia3DControles } from './Familia3DControles.tsx';
import { indiceDaPeca, limitesDaFamilia, limitarPosicao, type Vista3D } from './familia3d.ts';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia, type Corte, type DetalheFamilia } from './familiaStore.ts';
import './familia3d.css';
import './familiaCaixaria.css';

/*
 * Vista 3D real da família: envolve o `VisualizadorFamilia` de `@hestia/render` (three.js) e o mantém vivo entre
 * renders; o React só repassa as mudanças do editor. Sem WebGL, mostra um aviso e as vistas 2D continuam funcionando.
 */

const ROTULO_MODO_3D: Record<ModoInteracao3DFamilia, string> = {
  selecionar: 'Selecionar',
  prateleira: 'Prateleira',
  divisoria: 'Divisória',
  porta: 'Porta',
  gavetas: 'Gavetas',
  cabideiro: 'Cabideiro',
  ripado: 'Ripado',
  sapateira: 'Sapateira',
  tampo: 'Tampo',
  tamponamento: 'Tamponamento',
  recorte: 'Recorte',
};

function tratarCliqueVao(clique: CliqueVao3D): void {
  const s = useFamilia.getState();
  const fam = s.familia();

  if (s.modo3d === 'selecionar') {
    if (fam.caixaria) s.set({ vaoSel: clique.vaoId });
    return;
  }

  if (s.modo3d === 'prateleira' || s.modo3d === 'divisoria') {
    const eixo = s.modo3d === 'divisoria' ? 'x' : 'z';
    if (s.partesDivisao >= 2) {
      executarPeca(`Dividir vão em ${s.partesDivisao} partes`, (f) =>
        dividirVaoEmIguais(f, clique.vaoId, eixo, s.partesDivisao),
      );
    } else {
      const rotulo = s.modo3d === 'divisoria' ? 'Inserir divisória' : 'Inserir prateleira';
      executarPeca(rotulo, (f) => dividirVao(f, clique.vaoId, eixo, 'proporcional', clique.posicaoNormalizada));
    }
    return;
  }

  if (s.modo3d === 'porta') {
    const erro = executarPeca('Inserir porta no vão', (f) =>
      preencherVao(f, clique.vaoId, {
        tipo: 'porta',
        estilo: s.estiloPorta,
        montagem: s.montagemFrente,
        dobradicaLado: clique.ladoHorizontal,
      }),
    );
    if (erro === null) s.set({ vaoSel: clique.vaoId });
    return;
  }

  if (s.modo3d === 'gavetas') {
    const erro = executarPeca('Inserir gavetas no vão', (f) =>
      preencherVao(f, clique.vaoId, {
        tipo: 'gavetas',
        quantidade: s.qtdGavetas,
        montagem: s.montagemFrente,
      }),
    );
    if (erro === null) s.set({ vaoSel: clique.vaoId });
    return;
  }

  if (s.modo3d === 'cabideiro') {
    const erro = executarPeca('Inserir cabideiro no vão', (f) =>
      preencherVao(f, clique.vaoId, { tipo: 'cabideiro' }),
    );
    if (erro === null) s.set({ vaoSel: clique.vaoId });
    return;
  }

  if (s.modo3d === 'ripado') {
    const erro = executarPeca('Inserir ripado no vão', (f) =>
      preencherVao(f, clique.vaoId, {
        tipo: 'ripado',
        direcao: 'vertical',
        larguraRipa: 30,
        espacamento: 20,
      }),
    );
    if (erro === null) s.set({ vaoSel: clique.vaoId });
    return;
  }

  if (s.modo3d === 'sapateira') {
    const erro = executarPeca('Inserir sapateira no vão', (f) =>
      preencherVao(f, clique.vaoId, { tipo: 'sapateira', quantidade: 3 }),
    );
    if (erro === null) s.set({ vaoSel: clique.vaoId });
  }
}

function tratarCliqueFace(clique: CliqueFace3D): void {
  const s = useFamilia.getState();

  if (s.modo3d === 'tampo') {
    executarPeca('Alternar tampo da caixaria', (f) => {
      if (f.caixaria?.tampo) return definirTampoCaixaria(f, null);
      return definirTampoCaixaria(f, {
        espessura: 25,
        avancoFrente: 20,
        avancoEsq: 0,
        avancoDir: 0,
        avancoFundo: 0,
      });
    });
    return;
  }

  if (s.modo3d === 'recorte') {
    executarPeca('Alternar recorte do tampo', (f) => {
      const tampo = f.caixaria?.tampo;
      if (!tampo) return 'Ative um tampo antes de inserir recorte';
      const proximo = { ...tampo };
      if (proximo.recorte) delete proximo.recorte;
      else proximo.recorte = { largura: 500, profundidade: 400 };
      return definirTampoCaixaria(f, proximo);
    });
    return;
  }

  if (s.modo3d === 'tamponamento') {
    const face = clique.face;
    if (face !== 'esquerda' && face !== 'direita' && face !== 'topo' && face !== 'base') return;
    executarPeca(`Alternar tamponamento (${face})`, (f) => {
      const atual = f.caixaria?.tamponamentos ?? {};
      const proximo = { ...atual, [face]: !atual[face] };
      const algum = Boolean(proximo.esquerda || proximo.direita || proximo.topo || proximo.base);
      return definirTamponamentosCaixaria(f, algum ? proximo : null);
    });
  }
}

export interface Familia3DProps {
  familia: Familia;
  env: Record<string, unknown>;
  pecas: readonly PecaResolvida[];
  sel: string | null;
  onSel: (id: string | null) => void;
  /** 0..1: quanto a caixaria aparece explodida. */
  explodir: number;
  /** 0,1..1: opacidade das peças sólidas. */
  opacidade: number;
  corte: Corte;
  portas: boolean;
  detalhe: DetalheFamilia;
}

export function Familia3D({
  familia,
  env,
  pecas,
  sel,
  onSel,
  explodir,
  opacidade,
  corte,
  portas,
  detalhe,
}: Familia3DProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualizadorRef = useRef<VisualizadorFamilia | null>(null);
  const pecasRef = useRef(pecas);
  const onSelRef = useRef(onSel);
  const [indisponivel, setIndisponivel] = useState(false);

  const modo3d = useFamilia((s) => s.modo3d);
  const vaoSel = useFamilia((s) => s.vaoSel);
  const hoverVao = useFamilia((s) => s.hoverVao);

  const limites = useMemo(() => limitesDaFamilia(pecas), [pecas]);
  const indiceSel = useMemo(() => indiceDaPeca(pecas, sel), [pecas, sel]);
  const corteEfetivo = useMemo(
    () => ({ ...corte, posicao: limitarPosicao(corte.posicao, limites[corte.eixo]) }),
    [corte, limites],
  );
  const vaos = useMemo(
    () => (familia.caixaria ? resolverVaosCaixaria(familia, env) : []),
    [familia, env],
  );
  const espessuraPadrao = useMemo(() => {
    const bruto = env['esp'];
    return typeof bruto === 'number' && Number.isFinite(bruto) && bruto > 0 ? bruto : 18;
  }, [env]);

  useEffect(() => {
    pecasRef.current = pecas;
  }, [pecas]);

  useEffect(() => {
    onSelRef.current = onSel;
  }, [onSel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas === null || container === null) return;
    let visualizador: VisualizadorFamilia;
    try {
      visualizador = new VisualizadorFamilia(canvas, { materiais: {} });
    } catch {
      setIndisponivel(true);
      return;
    }
    visualizadorRef.current = visualizador;
    const cancelarSelecao = visualizador.aoSelecionar((indice) => {
      const peca = indice === null ? undefined : pecasRef.current[indice];
      onSelRef.current(peca?.id ?? null);
      if (peca !== undefined) useFamilia.getState().set({ vaoSel: null });
    });
    const cancelarHoverVao = visualizador.aoPassarVao((hover) => {
      useFamilia.getState().set({ hoverVao: hover });
    });
    const cancelarCliqueVao = visualizador.aoClicarVao(tratarCliqueVao);
    const cancelarCliqueFace = visualizador.aoClicarFaceExterna(tratarCliqueFace);
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (entrada === undefined) return;
      visualizador.redimensionar(entrada.contentRect.width, entrada.contentRect.height);
    });
    observador.observe(container);
    return () => {
      cancelarSelecao();
      cancelarHoverVao();
      cancelarCliqueVao();
      cancelarCliqueFace();
      observador.disconnect();
      visualizador.destruir();
      visualizadorRef.current = null;
      useFamilia.getState().set({ hoverVao: null });
    };
  }, []);

  useEffect(() => {
    visualizadorRef.current?.definirPecas(pecas);
  }, [pecas]);

  useEffect(() => {
    visualizadorRef.current?.definirVaos(vaos);
  }, [vaos]);

  useEffect(() => {
    visualizadorRef.current?.definirModoInteracao(modo3d, espessuraPadrao);
  }, [modo3d, espessuraPadrao]);

  useEffect(() => {
    visualizadorRef.current?.selecionarVao(vaoSel);
  }, [vaoSel]);

  useEffect(() => {
    visualizadorRef.current?.selecionar(indiceSel);
  }, [indiceSel]);

  useEffect(() => {
    visualizadorRef.current?.definirExplodir(explodir);
  }, [explodir]);

  useEffect(() => {
    visualizadorRef.current?.definirOpacidade(opacidade);
  }, [opacidade]);

  useEffect(() => {
    visualizadorRef.current?.definirDetalhe(detalhe, portas);
  }, [detalhe, portas]);

  useEffect(() => {
    visualizadorRef.current?.definirCorte(corteEfetivo);
  }, [corteEfetivo]);

  const aoVista = (nome: Vista3D): void => {
    visualizadorRef.current?.vista(nome);
  };

  return (
    <div ref={containerRef} className="fam3d-root">
      {indisponivel ? (
        <p className="fam3d-aviso" role="alert">3D indisponível neste navegador (WebGL)</p>
      ) : (
        <>
          <canvas ref={canvasRef} className="fam3d-canvas" aria-label="Família, vista 3D" />
          <Familia3DControles
            aoVista={aoVista}
            explodir={explodir}
            aoExplodir={(valor) => useFamilia.getState().set({ explodir: valor })}
            opacidade={opacidade}
            aoOpacidade={(valor) => useFamilia.getState().set({ opacidade: valor })}
            corte={corte}
            aoCorte={(patch) => useFamilia.setState((s) => ({ corte: { ...s.corte, ...patch } }))}
            limites={limites}
          />
          {hoverVao !== null && (
            <div className="fam3d-badge" role="status" aria-live="polite">
              <span className="fam3d-badge-modo">{ROTULO_MODO_3D[modo3d]}</span>
              <span className="fam3d-badge-medida">
                {Math.round(hoverVao.medidaInicioMm)} mm | {Math.round(hoverVao.medidaFimMm)} mm
              </span>
              {modo3d !== 'selecionar' && (
                <button
                  type="button"
                  className="fam3d-badge-voltar"
                  onClick={() => useFamilia.getState().set({ modo3d: 'selecionar' })}
                >
                  Selecionar
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
