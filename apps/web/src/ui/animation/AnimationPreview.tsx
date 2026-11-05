import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { view3dOf, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene, aplicarCameraNaOrbita, cameraDaOrbita, pickModelPoint, sampleCamera, sampleSun } from '@hestia/render';
import { useProject } from '../../editor/controller.ts';
import { useAnimationStore } from '../../editor/animationStore.ts';
import { limparCanvasAtivo, registrarCanvasAtivo } from '../../editor/render/captureRegistry.ts';
import { registrarCameraPreview } from '../../editor/render/previewCamera.ts';
import { useDark } from '../useDark.ts';
import {
  classificarGestoPonteiro,
  deltaZoom,
  deslocamentoDoPontoMedio,
  deveAproximarNoCursor,
  fatorAproximacaoCursor,
  moverAlvoParaPonto,
  ndcDoCursor,
  zoomDoPinch,
} from '../navegacao3d.ts';

interface PontoTela { x: number; y: number }

/** Distância e ponto médio entre os dois primeiros ponteiros (pinch de dois dedos, como no 3D). */
function medirPinca(pontos: Map<number, PontoTela>): { dist: number; mid: PontoTela } {
  const [a, b] = [...pontos.values()] as [PontoTela, PontoTela];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

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
  // Ponteiros ativos sobre o canvas (toque): dois dedos fazem pinch (zoom + deslocamento) e cancelam a órbita em curso.
  const pontos = useRef(new Map<number, PontoTela>()).current;
  const pinca = useRef<ReturnType<typeof medirPinca> | null>(null);
  // Espaço segura o pan com o botão esquerdo (como no 3D). Só é rastreado com o ponteiro sobre o preview ou com foco nele.
  const espacoPressionado = useRef(false);
  const sobPreview = useRef(false);
  const comFoco = useRef(false);
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

  // O observer (criado uma vez por montagem) chama sempre a `desenhar` mais recente, não a da montagem.
  const desenharRef = useRef(desenhar);
  desenharRef.current = desenhar;

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
      desenharRef.current(useAnimationStore.getState().playhead);
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

  // Rastreia Espaço só enquanto o ponteiro está sobre o preview ou o preview tem foco. Sem isso, a tecla pode ficar presa.
  useEffect(() => {
    const ehEspaco = (e: KeyboardEvent): boolean => e.key === ' ' || e.code === 'Space';
    const ehEditavel = (alvo: EventTarget | null): boolean => {
      if (!(alvo instanceof HTMLElement)) return false;
      return alvo.isContentEditable || alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT';
    };
    const aoTeclaBaixo = (e: KeyboardEvent): void => {
      if (!ehEspaco(e) || ehEditavel(e.target)) return;
      if (!sobPreview.current && !comFoco.current) return;
      espacoPressionado.current = true;
      if (comFoco.current) e.preventDefault();
    };
    // Soltar a tecla zera sempre, mesmo fora do preview: evita tecla presa.
    const aoTeclaCima = (e: KeyboardEvent): void => {
      if (ehEspaco(e)) espacoPressionado.current = false;
    };
    const aoPerderJanela = (): void => {
      espacoPressionado.current = false;
    };
    window.addEventListener('keydown', aoTeclaBaixo);
    window.addEventListener('keyup', aoTeclaCima);
    window.addEventListener('blur', aoPerderJanela);
    return () => {
      window.removeEventListener('keydown', aoTeclaBaixo);
      window.removeEventListener('keyup', aoTeclaCima);
      window.removeEventListener('blur', aoPerderJanela);
    };
  }, []);

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
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Com dois ou mais dedos, o gesto é pinch: qualquer órbita em curso é cancelada (como no 3D).
    gesto.current = null;
    pinca.current = pontos.size === 2 ? medirPinca(pontos) : null;
    if (pontos.size >= 2) return;
    // Mesmo mapeamento do 3D (navegacao3d.ts), com o estado da tecla Espaço.
    const gesto3d = classificarGestoPonteiro({ botao: e.button, shift: e.shiftKey, alt: e.altKey, espaco: espacoPressionado.current });
    gesto.current = { modo: gesto3d === 'pan' ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const m = modelo.current;
    if (pontos.has(e.pointerId)) pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (m && pontos.size === 2) {
      // Sem linha de base (ex.: depois de um terceiro dedo), o primeiro quadro só marca a posição: sem salto.
      if (!pinca.current) { pinca.current = medirPinca(pontos); return; }
      const atual = medirPinca(pontos);
      m.orbit.zoom(zoomDoPinch(pinca.current.dist, atual.dist));
      const desl = deslocamentoDoPontoMedio(pinca.current.mid, atual.mid);
      m.orbit.pan(desl.dx, desl.dy);
      pinca.current = atual;
      desenhar(useAnimationStore.getState().playhead, false);
      return;
    }
    const g = gesto.current;
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
    pontos.delete(e.pointerId);
    if (pontos.size < 2) pinca.current = null;
    gesto.current = null;
    espacoPressionado.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
  };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    e.preventDefault();
    if (playing) setPlaying(false);
    const m = modelo.current;
    if (!m) return;
    // Zoom para o ponto sob o cursor, como no 3D: ao aproximar, o alvo deriva em direção ao ponto 3D sob o cursor.
    if (deveAproximarNoCursor(e.deltaY)) {
      const ndc = ndcDoCursor(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
      const hit = ndc ? pickModelPoint(m.scene, m.orbit.camera, ndc) : null;
      if (hit) {
        const orb = m.orbit;
        const fator = fatorAproximacaoCursor(e.deltaY);
        const alvoX = moverAlvoParaPonto(orb.target, hit, fator);
        orb.target.x = alvoX.x;
        orb.target.y = alvoX.y;
      }
    }
    m.orbit.zoom(deltaZoom(e.deltaY));
    desenhar(useAnimationStore.getState().playhead, false);
  };

  return (
    <div
      ref={host}
      className="anim-preview"
      onPointerEnter={() => { sobPreview.current = true; }}
      onPointerLeave={() => { sobPreview.current = false; }}
      onFocus={() => { comFoco.current = true; }}
      onBlur={() => { comFoco.current = false; espacoPressionado.current = false; }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={-1}
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
