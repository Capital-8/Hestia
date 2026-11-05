import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { SheetView3DCamera } from '@hestia/model';
import { frameCount } from '@hestia/render';
import { useAnimationStore } from '../../editor/animationStore.ts';
import { closeAnimationStudio, renameAnimationStudio } from '../../editor/animationActions.ts';
import { startVideoJob } from '../../editor/render/startVideoJob.ts';
import { useUi } from '../../editor/state.ts';
import { Icon } from '../Icon.tsx';
import { AnimationPreview, type AnimationPreviewHandle } from './AnimationPreview.tsx';
import { StudioInspector } from './StudioInspector.tsx';
import { Timeline } from './Timeline.tsx';
import './studio.css';

const tempo = (s: number): string => {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const seg = total - m * 60;
  // units-ok: tempo de reprodução em segundos, não é medida do modelo.
  return `${String(m).padStart(2, '0')}:${seg.toFixed(1).padStart(4, '0')}`;
};

/**
 * Estúdio de animação (aba de vista). A prévia é o 3D em tempo real; a timeline edita keyframes;
 * o inspetor configura a sequência. O render final é disparado em segundo plano.
 */
export function AnimationStudio(): ReactElement {
  const preview = useRef<AnimationPreviewHandle>(null);
  const seq = useAnimationStore((s) => (s.activeId ? s.sequences[s.activeId] : undefined));
  const playhead = useAnimationStore((s) => s.playhead);
  const playing = useAnimationStore((s) => s.playing);
  const setPlayhead = useAnimationStore((s) => s.setPlayhead);
  const setPlaying = useAnimationStore((s) => s.setPlaying);
  const selected = useAnimationStore((s) => s.selectedKeyframe);
  const addKeyframe = useAnimationStore((s) => s.addKeyframe);
  const removeKeyframe = useAnimationStore((s) => s.removeKeyframe);
  const [nome, setNome] = useState(seq?.name ?? '');

  useEffect(() => {
    setNome(seq?.name ?? '');
  }, [seq?.id, seq?.name]);

  const cameraAtual = (): SheetView3DCamera | null => preview.current?.cameraAtual() ?? null;

  /** Play no fim da timeline recomeça do zero; senão o efeito de reprodução para no primeiro quadro. */
  const alternarPlay = useCallback((): void => {
    if (!seq) return;
    if (!playing && playhead >= seq.duration - 1e-3) setPlayhead(0);
    setPlaying(!playing);
  }, [playing, playhead, seq, setPlaying, setPlayhead]);

  const capturar = useCallback((): void => {
    const cam = preview.current?.cameraAtual() ?? null;
    if (!cam || !seq) return;
    addKeyframe({
      id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      t: playhead,
      camera: { ...cam, target: { ...cam.target } },
      easing: 'smooth',
    });
  }, [addKeyframe, playhead, seq]);

  const renderizar = async (): Promise<void> => {
    if (!seq) return;
    const canvas = preview.current?.canvas();
    if (!canvas) {
      useUi.setState({ status: 'A prévia 3D ainda não está pronta.' });
      return;
    }
    setPlaying(false);
    setPlayhead(0);
    await startVideoJob(seq, { canvas });
  };

  // Teclado do estúdio (o App ignora `editor.key` quando a vista é animation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')) return;
      if (!seq) return;
      if (e.code === 'Space') {
        e.preventDefault();
        alternarPlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = (e.shiftKey ? 1 : 1 / Math.max(1, seq.fps)) * (e.key === 'ArrowLeft' ? -1 : 1);
        setPlaying(false);
        setPlayhead(playhead + step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setPlaying(false);
        setPlayhead(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setPlaying(false);
        setPlayhead(seq.duration);
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        capturar();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeKeyframe(selected);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [seq, playing, playhead, selected, setPlaying, setPlayhead, capturar, removeKeyframe, alternarPlay]);

  if (!seq) {
    return (
      <div className="anim-studio anim-empty">
        <p>Nenhuma sequência aberta.</p>
        <button className="btn" onClick={() => closeAnimationStudio()}>Voltar ao 3D</button>
      </div>
    );
  }

  return (
    <div className="anim-studio">
      <header className="anim-head">
        <div className="anim-title">
          <Icon name="cube" size={16} />
          <b>Estúdio de animação</b>
          <input
            className="anim-name"
            value={nome}
            aria-label="Nome da sequência"
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => {
              if (nome.trim()) renameAnimationStudio(nome);
              else setNome(seq.name);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <span className="anim-meta">{frameCount(seq)} quadros · {seq.fps} fps · {seq.resolution.w}×{seq.resolution.h}</span>
        </div>
        <div className="anim-transport" role="group" aria-label="Reprodução">
          <button className="btn small" title="Início (Home)" onClick={() => { setPlaying(false); setPlayhead(0); }}>⏮</button>
          <button className="btn small" title="Quadro anterior (←)" onClick={() => { setPlaying(false); setPlayhead(playhead - 1 / seq.fps); }}>◀</button>
          <button className="btn small primary" title="Reproduzir (Espaço)" onClick={alternarPlay}>{playing ? '⏸' : '▶'}</button>
          <button className="btn small" title="Próximo quadro (→)" onClick={() => { setPlaying(false); setPlayhead(playhead + 1 / seq.fps); }}>▶</button>
          <button className="btn small" title="Fim (End)" onClick={() => { setPlaying(false); setPlayhead(seq.duration); }}>⏭</button>
          <span className="anim-time">{tempo(playhead)} / {tempo(seq.duration)}</span>
        </div>
        <div className="anim-actions">
          <button className="btn small" onClick={capturar} title="Capturar câmera atual (K)">Capturar câmera</button>
          <button className="btn small primary" onClick={() => void renderizar()} disabled={!seq}>Renderizar vídeo</button>
          <button className="btn small" onClick={() => closeAnimationStudio()}>Fechar</button>
        </div>
      </header>

      <div className="anim-body">
        <div className="anim-main">
          <AnimationPreview ref={preview} resolucao={seq.resolution} />
          <Timeline />
        </div>
        <StudioInspector cameraAtual={cameraAtual} />
      </div>
    </div>
  );
}
