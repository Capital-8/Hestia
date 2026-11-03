import type { PecaResolvida } from '@hestia/engine';
import { VisualizadorFamilia } from '@hestia/render';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Familia3DControles } from './Familia3DControles.tsx';
import { indiceDaPeca, limitesDaFamilia, limitarPosicao, type Vista3D } from './familia3d.ts';
import { useFamilia, type Corte, type DetalheFamilia } from './familiaStore.ts';
import './familia3d.css';

/*
 * Vista 3D real da família: envolve o `VisualizadorFamilia` de `@hestia/render` (three.js) e o mantém vivo entre
 * renders; o React só repassa as mudanças do editor. Sem WebGL, mostra um aviso e as vistas 2D continuam funcionando.
 */

export interface Familia3DProps {
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

export function Familia3D({ pecas, sel, onSel, explodir, opacidade, corte, portas, detalhe }: Familia3DProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualizadorRef = useRef<VisualizadorFamilia | null>(null);
  const pecasRef = useRef(pecas);
  const onSelRef = useRef(onSel);
  const [indisponivel, setIndisponivel] = useState(false);
  const limites = useMemo(() => limitesDaFamilia(pecas), [pecas]);
  const indiceSel = useMemo(() => indiceDaPeca(pecas, sel), [pecas, sel]);
  const corteEfetivo = useMemo(
    () => ({ ...corte, posicao: limitarPosicao(corte.posicao, limites[corte.eixo]) }),
    [corte, limites],
  );

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
    });
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (entrada === undefined) return;
      visualizador.redimensionar(entrada.contentRect.width, entrada.contentRect.height);
    });
    observador.observe(container);
    return () => {
      cancelarSelecao();
      observador.disconnect();
      visualizador.destruir();
      visualizadorRef.current = null;
    };
  }, []);

  useEffect(() => {
    visualizadorRef.current?.definirPecas(pecas);
  }, [pecas]);

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
        </>
      )}
    </div>
  );
}
