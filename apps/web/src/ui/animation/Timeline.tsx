import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { sampleCamera, type CameraKeyframe } from '@hestia/render';
import { useAnimationStore } from '../../editor/animationStore.ts';
import {
  chooseTickStep,
  clampKeyframeTime,
  formatHour,
  formatSolarHour,
  formatTime,
  frameAt,
  frameTicks,
  snapTargets,
  snapTime,
  solarHourTicks,
  ticksBetween,
  timeToX,
  visibleRange,
  xToTime,
  zoomRange,
  type TimelineView,
} from './timelineModel.ts';
import './timeline.css';

/** Raio (px) em que o playhead e os outros keyframes puxam o tempo durante o arraste. */
const RAIO_IMA_PX = 7;
/** Distância mínima entre rótulos da régua. */
const MIN_LABEL_PX = 84;
/** Folga lateral para o losango/playhead em t=0 e t=duration não saírem cortados. */
const MARGEM = 8;

let sequenciaKf = 0;
const novoIdKeyframe = (): string => `kf_${Date.now().toString(36)}_${(sequenciaKf++).toString(36)}`;

/**
 * Linha do tempo do Estúdio de animação: régua, faixa da câmera, faixa do sol (no modo solar),
 * playhead arrastável e keyframes em losango. Toda a decisão de estado fica no `animationStore`;
 * as contas de pixel/tempo ficam em `timelineModel.ts`. A componente não conhece o `AnimationStudio`
 * e pode ser montada sozinha (o estúdio só a posiciona no layout).
 */
export function Timeline(): ReactElement {
  const seq = useAnimationStore((s) => (s.activeId ? s.sequences[s.activeId] : undefined));
  const playhead = useAnimationStore((s) => s.playhead);
  const playing = useAnimationStore((s) => s.playing);
  const selectedId = useAnimationStore((s) => s.selectedKeyframe);
  const setPlayhead = useAnimationStore((s) => s.setPlayhead);
  const setPlaying = useAnimationStore((s) => s.setPlaying);
  const update = useAnimationStore((s) => s.update);
  const selectKeyframe = useAnimationStore((s) => s.selectKeyframe);
  const addKeyframe = useAnimationStore((s) => s.addKeyframe);
  const updateKeyframe = useAnimationStore((s) => s.updateKeyframe);
  const removeKeyframe = useAnimationStore((s) => s.removeKeyframe);

  const duracao = seq && Number.isFinite(seq.duration) && seq.duration > 0 ? seq.duration : 1;
  const fps = seq && Number.isFinite(seq.fps) && seq.fps > 0 ? seq.fps : 30;

  const raiz = useRef<HTMLElement>(null);
  const trilhas = useRef<HTMLDivElement>(null);
  const arrastoKf = useRef<{ id: string; x0: number; t0: number } | null>(null);
  const scrubbing = useRef(false);

  const [largura, setLargura] = useState(0);
  const [trecho, setTrecho] = useState(() => ({ start: 0, end: duracao }));
  const [encaixe, setEncaixe] = useState(true);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const keyframes = useMemo(
    () => (seq ? [...seq.keyframes].sort((a, b) => a.t - b.t) : []),
    [seq],
  );

  const view: TimelineView = useMemo(
    () => ({ start: trecho.start, end: trecho.end, width: Math.max(1, largura - MARGEM * 2) }),
    [trecho.start, trecho.end, largura],
  );
  const pxPorSegundo = view.width / Math.max(1e-9, view.end - view.start);
  const passo = chooseTickStep(pxPorSegundo, MIN_LABEL_PX);
  const casas = Math.min(3, Math.max(0, Math.ceil(-Math.log10(passo))));

  const ticksMaiores = useMemo(() => ticksBetween(view, passo), [view, passo]);
  const ticksQuadro = useMemo(() => frameTicks(view, fps), [view, fps]);
  const horasSol = useMemo(
    () => (seq?.mode === 'solar' && seq.solar
      ? solarHourTicks(seq.solar.startHour, seq.solar.endHour, duracao, view)
      : []),
    [seq, duracao, view],
  );

  // Largura real da pista (a régua e as faixas compartilham o mesmo espaço).
  useEffect(() => {
    const el = trilhas.current;
    if (!el) return;
    const medir = (): void => setLargura(Math.max(0, el.clientWidth));
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [seq?.id]);

  // Troca de sequência volta ao enquadramento inteiro; mudar a duração só normaliza o trecho.
  const idAnterior = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (idAnterior.current !== seq?.id) {
      idAnterior.current = seq?.id;
      setTrecho({ start: 0, end: duracao });
      return;
    }
    setTrecho((r) => visibleRange(duracao, r.start, r.end));
  }, [seq?.id, duracao]);

  // Durante o play, se o playhead sair do trecho visível, a régua acompanha.
  useEffect(() => {
    if (!playing) return;
    setTrecho((r) => {
      if (playhead >= r.start && playhead <= r.end) return r;
      const span = r.end - r.start;
      const inicio = Math.max(0, Math.min(duracao - span, playhead - span * 0.1));
      return visibleRange(duracao, inicio, inicio + span);
    });
  }, [playing, playhead, duracao]);

  // Contexto síncrono para o listener nativo de roda (que precisa de `preventDefault`).
  const contexto = useRef({ seq, duracao, trecho, largura });
  contexto.current = { seq, duracao, trecho, largura };

  useEffect(() => {
    const el = trilhas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      const ctx = contexto.current;
      if (!ctx.seq) return;
      const rect = el.getBoundingClientRect();
      const visao: TimelineView = {
        start: ctx.trecho.start,
        end: ctx.trecho.end,
        width: Math.max(1, (ctx.largura || rect.width) - MARGEM * 2),
      };
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const ancora = xToTime(e.clientX - rect.left - MARGEM, visao);
        const fator = e.deltaY < 0 ? 1.25 : 0.8;
        setTrecho((r) => zoomRange(r, ctx.duracao, fator, ancora));
        return;
      }
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const px = visao.width / Math.max(1e-9, visao.end - visao.start);
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const dt = -delta / px;
        setTrecho((r) => visibleRange(ctx.duracao, r.start + dt, r.end + dt));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [seq?.id]);

  const tolerancia = RAIO_IMA_PX / Math.max(1e-9, pxPorSegundo);

  const moverPlayhead = (clientX: number): void => {
    const el = trilhas.current;
    if (!el || !seq) return;
    const x = clientX - el.getBoundingClientRect().left - MARGEM;
    let t = clampKeyframeTime(xToTime(x, view), duracao);
    if (encaixe) {
      t = clampKeyframeTime(snapTime(t, { fps, alvos: snapTargets(duracao, playhead, keyframes), tolerancia }), duracao);
    }
    setPlayhead(t);
  };

  const iniciarScrub = (e: ReactPointerEvent, limparSelecao: boolean): void => {
    if (e.button !== 0 || !seq) return;
    e.preventDefault();
    e.stopPropagation();
    raiz.current?.focus();
    if (limparSelecao) selectKeyframe(null);
    setPlaying(false);
    scrubbing.current = true;
    try {
      trilhas.current?.setPointerCapture(e.pointerId);
    } catch {
      // O ponteiro já pode ter sido solto entre o down e a captura.
    }
    moverPlayhead(e.clientX);
  };

  const onTrilhasDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    iniciarScrub(e, true);
  };
  const onTrilhasMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (scrubbing.current) moverPlayhead(e.clientX);
  };
  const onTrilhasUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    try {
      trilhas.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Já solto.
    }
  };

  const iniciarKf = (e: ReactPointerEvent<HTMLButtonElement>, k: CameraKeyframe): void => {
    if (e.button !== 0 || !seq) return;
    e.preventDefault();
    e.stopPropagation();
    raiz.current?.focus();
    selectKeyframe(k.id);
    setPlaying(false);
    arrastoKf.current = { id: k.id, x0: e.clientX, t0: k.t };
    setArrastando(k.id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura o arraste ainda funciona enquanto o ponteiro fica sobre o losango.
    }
  };

  const moverKf = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const d = arrastoKf.current;
    if (!d) return;
    let t = clampKeyframeTime(d.t0 + (e.clientX - d.x0) / pxPorSegundo, duracao);
    if (encaixe) {
      t = clampKeyframeTime(snapTime(t, { fps, alvos: snapTargets(duracao, playhead, keyframes, d.id, true), tolerancia }), duracao);
    }
    updateKeyframe(d.id, { t });
  };

  const soltarKf = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!arrastoKf.current) return;
    arrastoKf.current = null;
    setArrastando(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Já solto.
    }
  };

  const adicionarNoPlayhead = (): void => {
    if (!seq || seq.mode === 'solar') return;
    const camera = sampleCamera(seq, playhead);
    addKeyframe({
      id: novoIdKeyframe(),
      t: clampKeyframeTime(playhead, duracao),
      camera: { ...camera, target: { ...camera.target } },
      easing: 'smooth',
    });
    setPlaying(false);
  };

  const duplicar = (): void => {
    if (!seq || !selectedId) return;
    const original = keyframes.find((k) => k.id === selectedId);
    if (!original) return;
    // Duplicar não troca o modo (o `addKeyframe` força `keyframes`); assim o estudo solar continua
    // solar e o turntable não vira keyframes por acidente.
    const copia: CameraKeyframe = {
      id: novoIdKeyframe(),
      t: clampKeyframeTime(playhead, duracao),
      camera: { ...original.camera, target: { ...original.camera.target } },
      easing: original.easing,
    };
    update(seq.id, { keyframes: [...seq.keyframes, copia].sort((a, b) => a.t - b.t) });
    selectKeyframe(copia.id);
    setPlaying(false);
  };

  const excluir = (): void => {
    if (selectedId) removeKeyframe(selectedId);
  };

  const aplicarZoom = (fator: number): void => {
    const ancora = (trecho.start + trecho.end) / 2;
    setTrecho((r) => zoomRange(r, duracao, fator, ancora));
  };
  const ajustar = (): void => setTrecho(visibleRange(duracao, 0, duracao));

  /**
   * Atalhos locais (a seção recebe foco ao clicar na timeline). O `AnimationStudio` instala um
   * listener global em fase de captura; quando ele já tratou a tecla, a timeline não repete a ação
   * (senão a seta andaria dois quadros e o Delete removeria duas vezes).
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.defaultPrevented || e.nativeEvent.defaultPrevented) return;
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
    if (!seq) return;

    const consumir = (): void => {
      e.preventDefault();
      e.stopPropagation();
    };

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      consumir();
      duplicar();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space') {
      consumir();
      // No fim da sequência, play recomeça do zero em vez de parar no primeiro quadro.
      if (!playing && useAnimationStore.getState().playhead >= duracao - 1e-3) setPlayhead(0);
      setPlaying(!playing);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      consumir();
      const direcao = e.key === 'ArrowLeft' ? -1 : 1;
      const delta = e.shiftKey ? 1 : 1 / fps;
      setPlaying(false);
      setPlayhead(useAnimationStore.getState().playhead + direcao * delta);
    } else if (e.key === 'Home') {
      consumir();
      setPlaying(false);
      setPlayhead(0);
    } else if (e.key === 'End') {
      consumir();
      setPlaying(false);
      setPlayhead(duracao);
    } else if (e.key.toLowerCase() === 'k') {
      consumir();
      adicionarNoPlayhead();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      consumir();
      excluir();
    } else if (e.key === '+' || e.key === '=') {
      consumir();
      aplicarZoom(1.4);
    } else if (e.key === '-' || e.key === '_') {
      consumir();
      aplicarZoom(1 / 1.4);
    }
  };

  if (!seq) {
    return (
      <section className="anim-tl" aria-label="Linha do tempo da animação">
        <div className="anim-tl-vazio">Nenhuma sequência ativa.</div>
      </section>
    );
  }

  const solar = seq.mode === 'solar' ? seq.solar : undefined;
  const hora = solar ? formatSolarHour(solar.startHour, solar.endHour, playhead, duracao) : null;
  const zoomPct = Math.max(1, Math.round((duracao / Math.max(1e-9, trecho.end - trecho.start)) * 100));
  const quadro = frameAt(playhead, fps);
  const totalQuadros = frameAt(duracao, fps);
  const podeKeyframe = seq.mode !== 'solar';

  return (
    <section ref={raiz} className="anim-tl" aria-label="Linha do tempo da animação" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="anim-tl-barra">
        <span className="anim-tl-titulo">Linha do tempo</span>
        <span className="anim-tl-leitura">
          {formatTime(playhead, fps)} / {formatTime(duracao)}
          <span className="anim-tl-quadro"> quadro {quadro}/{totalQuadros}</span>
        </span>
        {hora ? <span className="anim-tl-sol-leitura">Sol {hora}</span> : null}
        <div className="anim-tl-ferramentas">
          <button type="button" className="anim-tl-btn" onClick={adicionarNoPlayhead} disabled={!podeKeyframe}
            title={podeKeyframe ? 'Novo keyframe no playhead (K)' : 'No modo solar a câmera é fixa'}>+ KF</button>
          <button type="button" className="anim-tl-btn" onClick={duplicar} disabled={!selectedId}
            title="Duplicar o keyframe selecionado no playhead (Ctrl+D)">Duplicar</button>
          <button type="button" className="anim-tl-btn" onClick={excluir} disabled={!selectedId}
            title="Excluir o keyframe selecionado (Delete)">Excluir</button>
          <span className="anim-tl-sep" aria-hidden="true" />
          <button type="button" className={`anim-tl-btn${encaixe ? ' on' : ''}`} onClick={() => setEncaixe((v) => !v)}
            aria-pressed={encaixe} title="Encaixar no quadro, no playhead e nos outros keyframes">Ímã</button>
          <span className="anim-tl-sep" aria-hidden="true" />
          <button type="button" className="anim-tl-btn" onClick={() => aplicarZoom(1 / 1.4)}
            title="Diminuir o zoom (Ctrl+roda ou -)">−</button>
          <span className="anim-tl-zoom" aria-label={`Zoom horizontal ${zoomPct}%`}>{zoomPct}%</span>
          <button type="button" className="anim-tl-btn" onClick={() => aplicarZoom(1.4)}
            title="Aumentar o zoom (Ctrl+roda ou +)">+</button>
          <button type="button" className="anim-tl-btn" onClick={ajustar} title="Mostrar a sequência inteira">Ajustar</button>
        </div>
      </div>

      <div className="anim-tl-corpo">
        <div className="anim-tl-rotulos">
          <div className="anim-tl-rotulo regua">Tempo</div>
          <div className="anim-tl-rotulo faixa" title="Keyframes da câmera">Câmera</div>
          {seq.mode === 'solar' ? <div className="anim-tl-rotulo faixa" title="Sol ao longo do dia">Sol</div> : null}
        </div>

        <div ref={trilhas} className="anim-tl-trilhas" onPointerDown={onTrilhasDown} onPointerMove={onTrilhasMove}
          onPointerUp={onTrilhasUp} onPointerCancel={onTrilhasUp}>
          <div className="anim-tl-regua" aria-hidden="true">
            {ticksMaiores.map((t, i) => (
              <span key={`m${i}`} className="anim-tl-tick" style={{ left: `${timeToX(t, view)}px` }}>
                <span className="anim-tl-tick-label">{formatTime(t, 0, casas)}</span>
                {ticksQuadro.length > 0 ? <span className="anim-tl-tick-quadro">{frameAt(t, fps)}f</span> : null}
              </span>
            ))}
            {ticksQuadro.map((t, i) => (
              <span key={`q${i}`} className="anim-tl-tick menor" style={{ left: `${timeToX(t, view)}px` }} />
            ))}
          </div>

          <div className="anim-tl-faixa camera" role="group" aria-label="Faixa da câmera">
            <span className="anim-tl-nota">
              {seq.mode === 'turntable' ? 'Turntable' : seq.mode === 'solar' ? 'Câmera fixa' : `${keyframes.length} keyframe(s)`}
            </span>
            {keyframes.map((k, i) => (
              <button key={k.id} type="button" aria-pressed={selectedId === k.id}
                className={`anim-tl-kf${selectedId === k.id ? ' sel' : ''}${arrastando === k.id ? ' arrastando' : ''}`}
                style={{ left: `${timeToX(k.t, view)}px` }}
                title={`Keyframe ${i + 1} em ${formatTime(k.t, fps)} — arraste para mover; duplo clique leva o playhead`}
                aria-label={`Keyframe ${i + 1} em ${formatTime(k.t, fps)}`}
                onPointerDown={(e) => iniciarKf(e, k)} onPointerMove={moverKf} onPointerUp={soltarKf}
                onPointerCancel={soltarKf} onDoubleClick={(e) => { e.stopPropagation(); setPlayhead(k.t); }}
                onClick={(e) => { e.stopPropagation(); selectKeyframe(k.id); }}>
                <span className="anim-tl-kf-marca" aria-hidden="true" />
              </button>
            ))}
            {keyframes.length === 0
              ? <span className="anim-tl-vazio-faixa">Sem keyframes — use “+ KF” ou capture a câmera.</span>
              : null}
          </div>

          {seq.mode === 'solar' ? (
            <div className="anim-tl-faixa sol" role="group" aria-label="Faixa do sol">
              <span className="anim-tl-nota">
                {solar ? `${formatHour(solar.startHour)}–${formatHour(solar.endHour)}` : 'Sem data/local'}
              </span>
              {horasSol.map((h) => (
                <span key={h.hora} className="anim-tl-sol-marca" style={{ left: `${timeToX(h.t, view)}px` }}>
                  <span className="anim-tl-sol-hora">{formatHour(h.hora)}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="anim-tl-grade" aria-hidden="true">
            {ticksMaiores.map((t, i) => (
              <span key={`g${i}`} className="anim-tl-grade-linha" style={{ left: `${timeToX(t, view)}px` }} />
            ))}
          </div>

          <div className="anim-tl-playhead" style={{ left: `${MARGEM + timeToX(playhead, view)}px` }}>
            <button type="button" className="anim-tl-playhead-alca"
              aria-label={`Playhead em ${formatTime(playhead, fps)}`} title="Arraste para mover o playhead"
              onPointerDown={(e) => iniciarScrub(e, false)} />
          </div>
        </div>
      </div>
    </section>
  );
}
