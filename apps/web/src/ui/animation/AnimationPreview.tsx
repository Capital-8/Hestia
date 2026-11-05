import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { view3dOf, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, aplicarCameraNaOrbita, cameraDaOrbita, sampleCamera, sampleSun } from '@hestia/render';
import { useProject } from '../../editor/controller.ts';
import { useAnimationStore } from '../../editor/animationStore.ts';
import { limparCanvasAtivo, registrarCanvasAtivo } from '../../editor/render/captureRegistry.ts';
import { registrarCameraPreview } from '../../editor/render/previewCamera.ts';
import { useDark } from '../useDark.ts';

export interface AnimationPreviewHandle {
  /** Canvas interno, na resolução de rascunho. */
  canvas(): HTMLCanvasElement | null;
  /** Câmera atual da órbita (para “Capturar câmera atual”). */
  cameraAtual(): SheetView3DCamera | null;
  /** Redesenha no tempo atual. */
  render(): void;
}

interface Props {
  /** Resolução de saída desejada; o preview usa no máximo 1280×720. */
  resolucao?: { w: number; h: number };
}

const LARGURA_PREVIEW = 1280;
const ALTURA_PREVIEW = 720;

/**
 * Preview 3D do Estúdio de animação. Usa o mesmo `ModelScene` do editor, mas com uma órbita própria:
 * órbitar/zoom aqui não muda a vista 3D do projeto. O play aplica `sampleCamera` na órbita.
 */
export const AnimationPreview = forwardRef<AnimationPreviewHandle, Props>(function AnimationPreview({ resolucao }, ref) {
  const p = useProject();
  const dark = useDark();
  const host = useRef<HTMLDivElement>(null);
  const canvasOwner = useRef({}).current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelo = useRef<ModelScene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raf = useRef<number | null>(null);
  const inicio = useRef(0);
  const gesto = useRef<{ modo: 'orbit' | 'pan'; x: number; y: number } | null>(null);
  const activeId = useAnimationStore((s) => s.activeId);
  const seq = useAnimationStore((s) => (s.activeId ? s.sequences[s.activeId] : undefined));
  const playhead = useAnimationStore((s) => s.playhead);
  const playing = useAnimationStore((s) => s.playing);
  const setPlayhead = useAnimationStore((s) => s.setPlayhead);
  const setPlaying = useAnimationStore((s) => s.setPlaying);

  const largura = Math.min(resolucao?.w ?? LARGURA_PREVIEW, LARGURA_PREVIEW);
  const altura = Math.max(1, Math.round(largura * ((resolucao?.h ?? ALTURA_PREVIEW) / Math.max(1, resolucao?.w ?? LARGURA_PREVIEW))));

  const desenhar = useCallback((t: number, aplicarSequencia = true) => {
    const m = modelo.current;
    const r = rendererRef.current;
    if (!m || !r || !seq) return;
    // Ao orbitar/pan/zoom, a câmera livre do usuário manda: não sobrescrever com a câmera
    // amostrada da sequência. Só play, scrub e resize reaplicam a sequência.
    if (aplicarSequencia) aplicarCameraNaOrbita(m.orbit, sampleCamera(seq, t));
    const sol = sampleSun(seq, t);
    if (sol) m.aplicarSol(sol.azimuth, sol.elevation);
    m.orbit.setAspect(largura, altura);
    m.orbit.apply();
    r.render(m.scene, m.orbit.camera);
  }, [seq, largura, altura]);

  useImperativeHandle(ref, () => ({
    canvas: () => canvasRef.current,
    cameraAtual: () => (modelo.current ? cameraDaOrbita(modelo.current.orbit) : null),
    render: () => desenhar(useAnimationStore.getState().playhead),
  }), [desenhar]);

  // Renderer e cena: uma vez por montagem.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    registrarCanvasAtivo(canvasOwner, () => canvasRef.current);
    registrarCameraPreview(() => (modelo.current ? cameraDaOrbita(modelo.current.orbit) : null));
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    const m = new ModelScene();
    modelo.current = m;
    const ro = new ResizeObserver(() => {
      // O canvas mantém a resolução de rascunho; só redesenha quando o host muda de tamanho.
      desenhar(useAnimationStore.getState().playhead);
    });
    if (host.current) ro.observe(host.current);
    return () => {
      ro.disconnect();
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      renderer.dispose();
      rendererRef.current = null;
      m.dispose();
      modelo.current = null;
      limparCanvasAtivo(canvasOwner);
      registrarCameraPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monta a geometria quando o projeto ou o tema mudam.
  useEffect(() => {
    const m = modelo.current;
    const r = rendererRef.current;
    if (!m || !r) return;
    try {
      const vista = view3dOf(p);
      const projeto = { ...p, view3d: { ...vista, style: 'realistic' as const, shadows: true, edges: true } };
      const niveis = p.levels.map((l) => resolveLevel(projeto, l.id));
      m.update(projeto, niveis, { dark, edges: true, shadows: true });
      m.modoApresentacao(true);
      r.setSize(largura, altura, false);
      m.orbit.setAspect(largura, altura);
      m.orbit.apply();
      desenhar(useAnimationStore.getState().playhead);
    } catch (e) {
      console.warn('Estúdio: não foi possível montar a cena 3D', e);
    }
  }, [p, dark, largura, altura, desenhar]);

  // Fora do play, qualquer mudança de tempo/sequência redesenha um quadro.
  useEffect(() => {
    if (!playing) desenhar(playhead);
  }, [playhead, playing, desenhar]);

  // Play: o relógio é a duração da sequência, não o framerate da tela.
  useEffect(() => {
    if (!playing || !seq) return;
    inicio.current = performance.now() - useAnimationStore.getState().playhead * 1000;
    const passo = (agora: number): void => {
      const s = useAnimationStore.getState();
      const ativa = s.activeId ? s.sequences[s.activeId] : undefined;
      if (!ativa) return;
      const t = Math.min(ativa.duration, Math.max(0, (agora - inicio.current) / 1000));
      setPlayhead(t);
      desenhar(t);
      if (t >= ativa.duration) {
        setPlaying(false);
        return;
      }
      raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [playing, seq, setPlayhead, setPlaying, desenhar]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (playing) setPlaying(false);
    gesto.current = { modo: e.shiftKey || e.button === 1 ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const g = gesto.current;
    const m = modelo.current;
    if (!g || !m) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    g.x = e.clientX;
    g.y = e.clientY;
    if (g.modo === 'orbit') m.orbit.orbit(dx, dy);
    else m.orbit.pan(dx, dy);
    desenhar(useAnimationStore.getState().playhead, false);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    gesto.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    e.preventDefault();
    if (playing) setPlaying(false);
    modelo.current?.orbit.zoom(-e.deltaY);
    desenhar(useAnimationStore.getState().playhead, false);
  };

  return (
    <div ref={host} className="anim-preview">
      <canvas
        ref={canvasRef}
        className="anim-preview-canvas"
        width={largura}
        height={altura}
        aria-label={activeId ? 'Prévia da animação' : 'Prévia 3D'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="anim-preview-hint">Arraste para orbitar · Shift/meio para deslocar · roda para zoom</div>
      <div className="anim-preview-badge">{largura}×{altura} · rascunho</div>
    </div>
  );
});
