import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { HOME_VIEW, type ModelScene } from '@hestia/render';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import {
  CUBE_FACES,
  CUBE_HALF_PX,
  FACE_TRANSFORM,
  cubeMatrix,
  faceCells,
  turnAzimuth,
  viewForZone,
  zoneAtPoint,
  zoneById,
  type CubeZone,
} from './viewcube.ts';
import { COMPASS, compassLetter, compassName, ringGeometry, ringHit, type CompassKey, type CompassLetter } from './viewcube-ring.ts';
import { ViewCubeRing } from './ViewCubeRing.tsx';

/** Distância (px) a partir da qual um toque no cubo vira arrasto (órbita) e não clique. */
const DRAG_PX = 4;

/** Só o botão esquerdo pertence aos controles; meio (pan) e direito (menu) seguem para o canvas. */
const conterSeEsquerdo = (e: RPointerEvent<HTMLElement>): void => {
  if (e.button === 0) e.stopPropagation();
};

/** Contorno das letras da bússola (o mesmo halo de `.vc-letter` no SVG, agora em texto HTML). */
const HALO_LETRA = '2.4px color-mix(in srgb, var(--sheet) 85%, transparent)';

interface ViewCubeProps {
  model: ModelScene;
}

/**
 * ViewCube: cubo em CSS 3D sobre a vista 3D, com as 26 zonas (6 faces, 12 arestas, 8 cantos) e um anel de bússola
 * (N, L, S, O em pt-BR; N, E, S, W em EN) no chão. Gira com a câmera. O palco resolve o ponteiro pela geometria
 * (`zoneAtPoint` para o cubo, `ringHit` para o anel), e não pelo teste de acerto do navegador, que falha em costuras de
 * faces giradas. Arrastar sobre o cubo orbita; sobre o anel, gira só o azimute. Clicar numa zona anima até a vista dela;
 * clicar numa letra leva ao azimute dela. As células são botões para o teclado (Tab e Enter). Não cria renderizador WebGL.
 *
 * A rotação NÃO passa por re-render: `previewTick` é lido numa assinatura (`useUi.subscribe`) que escreve a matriz do
 * cubo e a geometria dos anéis direto no DOM — a órbita de 60 fps não reconcilia os 54 botões (WP-A1). As letras da
 * bússola são `<div>`s posicionadas por CSS, e não `<text>` do SVG: no WebKitGTK, reescrever o `transform` de quatro
 * `<text>` a cada quadro custava ~20 ms (medido), enquanto o cubo em CSS 3D — os mesmos 54 botões — é barato.
 */
export function ViewCube({ model }: ViewCubeProps): ReactElement {
  const { t, lang } = useT();
  const orbit = model.orbit;
  /** Células de cada face no idioma ativo (as 54 entradas são triviais de recalcular na troca). */
  const faces = useMemo(() => CUBE_FACES.map((face) => ({ face, cells: faceCells(face, lang) })), [lang]);
  // Hover, idioma e Ortho ainda são React; a câmera, não. O contador local força o redesenho desses controles.
  const [hover, setHover] = useState<CubeZone | null>(null);
  const [ringHover, setRingHover] = useState<CompassLetter | null>(null);
  const [, forcar] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  /** Letras da bússola (HTML): posição e transparência escritas direto no estilo, sem re-render. */
  const letrasRef = useRef<Array<HTMLDivElement | null>>([]);
  /** Nós do anel para a escrita imperativa; refeitos se o React substituir os elementos (`isConnected`). */
  const anelRef = useRef<{ shadow: SVGPathElement | null; back: SVGPathElement | null; front: SVGPathElement | null }>({ shadow: null, back: null, front: null });
  /** Última orientação escrita, para não refazer a geometria do anel em `previewTick` de outro motivo. */
  const ultima = useRef<{ az: number; el: number } | null>(null);

  /**
   * Escreve a rotação do cubo, a geometria dos anéis e a posição das letras no DOM (sem React). As letras do SVG ficam
   * ocultas (o HTML as desenha): a ordem de `COMPASS` (N, L, S, O) é a mesma de `g.letters`, então o casamento é por índice.
   */
  const sincronizar = (): void => {
    const az = orbit.azimuth;
    const el = orbit.elevation;
    const cube = cubeRef.current;
    if (cube) cube.style.transform = cubeMatrix(az, el);
    const stage = stageRef.current;
    if (!stage) return;
    const a = anelRef.current;
    if (!a.shadow?.isConnected || !a.back?.isConnected || !a.front?.isConnected) {
      anelRef.current = {
        shadow: stage.querySelector<SVGPathElement>('.vc-ring--back .vc-shadow'),
        back: stage.querySelector<SVGPathElement>('.vc-ring--back .vc-band'),
        front: stage.querySelector<SVGPathElement>('.vc-ring--front .vc-band--front'),
      };
      // O SVG continua dono da estrutura do anel, mas as letras de texto ficam a cargo do HTML (ver o topo).
      for (const n of stage.querySelectorAll<SVGTextElement>('.vc-ring--front .vc-letter')) n.style.display = 'none';
    }
    const u = ultima.current;
    if (u && Math.abs(u.az - az) < 1e-6 && Math.abs(u.el - el) < 1e-6) return;
    ultima.current = { az, el };
    const g = ringGeometry(az, el);
    const r = anelRef.current;
    r.shadow?.setAttribute('d', g.shadow);
    r.back?.setAttribute('d', g.back);
    r.front?.setAttribute('d', g.front);
    g.letters.forEach((l, i) => {
      const node = letrasRef.current[i];
      if (!node) return;
      // `matrix(a b c d e f)` do SVG → `matrix(a,b,c,d,e,f)` do CSS; o translate centra o glifo no ponto do anel.
      node.style.transform = `${l.transform.replace(/ /g, ',')} translate(-50%, -50%)`;
      node.style.opacity = l.front ? '1' : '0.6';
    });
  };
  const sincronizarRef = useRef(sincronizar);
  sincronizarRef.current = sincronizar;
  // Um `previewTick` por quadro da órbita chega aqui como escrita de DOM, sem passar pela reconciliação do React.
  useLayoutEffect(() => {
    sincronizarRef.current();
    const off = useUi.subscribe((s, antes) => {
      if (s.previewTick !== antes.previewTick) sincronizarRef.current();
    });
    return off;
  }, []);
  // Qualquer render do React (hover, idioma, Ortho) pode reescrever o anel: reaplica a câmera de agora antes da pintura.
  useLayoutEffect(() => { sincronizar(); });

  /** Pede um quadro da vista (o WebGL redesenha); não re-renderiza este componente. */
  const pedirDesenho = (): void => { useUi.setState((s) => ({ previewTick: s.previewTick + 1 })); };
  const redraw = (): void => {
    // Comando (Início, giro de 90°, Ortho): pede o quadro da vista e redesenha os controles locais.
    pedirDesenho();
    forcar((x) => x + 1);
  };
  const go = (v: { azimuth: number; elevation: number }): void => {
    orbit.animateTo(v);
    redraw();
  };

  /** Ponto do ponteiro no sistema do palco: o centro do palco é o centro do cubo. */
  const local = (stage: HTMLElement, ev: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = stage.getBoundingClientRect();
    return { x: ev.clientX - (r.left + r.width / 2), y: ev.clientY - (r.top + r.height / 2) };
  };
  /** Zona do cubo sob o ponteiro. */
  const zoneAt = (stage: HTMLElement, ev: { clientX: number; clientY: number }): CubeZone | null => {
    const p = local(stage, ev);
    return zoneAtPoint(orbit.azimuth, orbit.elevation, p.x, p.y, CUBE_HALF_PX);
  };
  /** Ponto da faixa do anel sob o ponteiro (só vale fora do cubo, que tem prioridade). */
  const ringAt = (stage: HTMLElement, ev: { clientX: number; clientY: number }) => {
    const p = local(stage, ev);
    return ringHit(orbit.azimuth, orbit.elevation, p.x, p.y, CUBE_HALF_PX);
  };

  const onStagePointerDown = (e: RPointerEvent<HTMLDivElement>): void => {
    // Meio e direito não são do palco: deixam o evento subir para o canvas (pan e menu de contexto).
    if (e.button !== 0) return;
    // O arrasto da vista nasce no palco; o canvas não pode iniciar outro por baixo.
    e.stopPropagation();
    const stage = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let last = start;
    let moved = false;
    // Sobre o anel (e fora do cubo), o arrasto gira só o azimute.
    const onRing = !zoneAt(stage, e) && ringAt(stage, e) !== null;
    const move = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) <= DRAG_PX) return;
      moved = true;
      orbit.orbit(ev.clientX - last.x, onRing ? 0 : ev.clientY - last.y);
      last = { x: ev.clientX, y: ev.clientY };
      pedirDesenho();
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', finish);
    };
    const onUp = (ev: PointerEvent): void => {
      finish();
      if (moved) return;
      const z = zoneAt(stage, ev);
      if (z) {
        go(viewForZone(z.sign, orbit.azimuth));
        return;
      }
      const ring = ringAt(stage, ev);
      if (ring?.letter) go({ azimuth: ring.letter.angle, elevation: orbit.elevation });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', finish);
  };

  const onStagePointerMove = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.buttons !== 0) return; // com botão apertado é arrasto, tratado pelo listener da janela
    const stage = e.currentTarget;
    const z = zoneAt(stage, e);
    setHover((h) => (h?.id === z?.id ? h : z));
    const letter = z ? null : (ringAt(stage, e)?.letter ?? null);
    setRingHover((h) => (h?.key === letter?.key ? h : letter));
  };

  const turn = (dir: 1 | -1) => (): void => go({ azimuth: turnAzimuth(orbit.azimuth, dir), elevation: orbit.elevation });

  // Início: vista padrão do app e enquadramento do modelo, animados.
  const home = (): void => go({ ...HOME_VIEW, ...orbit.framing(model.bounds()) });

  const toggleOrtho = (): void => {
    orbit.setOrtho(!orbit.ortho);
    redraw();
  };

  /** Cor da letra: a do norte em destaque, a sob o ponteiro em seleção, as demais no texto suave. */
  const corDaLetra = (key: CompassKey): string =>
    ringHover?.key === key ? 'var(--select)' : key === 'N' ? 'var(--accent)' : 'var(--fg-soft)';

  const cubeStyle = { transform: cubeMatrix(orbit.azimuth, orbit.elevation), '--vc-half': `${CUBE_HALF_PX}px` } as CSSProperties;
  const letraStyle = (key: CompassKey): CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    transformOrigin: '0 0',
    fontFamily: 'var(--font-ui)',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    color: corDaLetra(key),
    WebkitTextStroke: HALO_LETRA,
    paintOrder: 'stroke',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });
  const stageTitle = hover
    ? zoneById(hover.id, lang).name
    : ringHover
      ? t('cvn_vc_view_to_dir', { name: compassName(ringHover.key, lang) })
      : t('cvn_vc_hint');

  return (
    // O contêiner não recebe o ponteiro (CSS): só o palco e os botões são interativos. O vão transparente em volta do
    // cubo/anel deixa o clique chegar ao canvas (órbita, seleção e pan), em vez de sumir no contêiner.
    <div className="viewcube" role="group" aria-label={t('cvn_vc_group')}>
      <div
        className="vc-stage"
        ref={stageRef}
        title={stageTitle}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerLeave={() => {
          setHover(null);
          setRingHover(null);
        }}
      >
        <ViewCubeRing azimuth={orbit.azimuth} elevation={orbit.elevation} hover={ringHover?.key ?? null} layer="back" />
        <div className="vc-cube" ref={cubeRef} style={cubeStyle}>
          {faces.map(({ face, cells }) => (
            <div key={face} className={`vc-face vc-face--${face}`} style={{ transform: FACE_TRANSFORM[face] }}>
              {cells.map(({ row, col, zone }) => (
                <button
                  key={`${row}${col}`}
                  type="button"
                  data-testid="viewcube"
                  data-face={zone.id}
                  className={`vc-cell vc-cell--${zone.kind}${hover?.id === zone.id ? ' is-hover' : ''}`}
                  style={{ gridRow: row + 1, gridColumn: col + 1 }}
                  aria-label={zone.name}
                  title={zone.name}
                  onClick={() => go(viewForZone(zone.sign, orbit.azimuth))}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <ViewCubeRing azimuth={orbit.azimuth} elevation={orbit.elevation} hover={ringHover?.key ?? null} layer="front" />
        {/* Letras da bússola em HTML (posicionadas no `sincronizar`): ver o comentário do componente. */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
          {COMPASS.map((c, i) => (
            <div
              key={c.key}
              ref={(el) => { letrasRef.current[i] = el; }}
              style={letraStyle(c.key)}
            >
              {compassLetter(c.key, lang)}
            </div>
          ))}
        </div>
      </div>
      <div className="vc-tools" onPointerDown={conterSeEsquerdo}>
        <button type="button" className="vc-btn" aria-label={t('cvn_vc_rotate_left')} title={t('cvn_vc_rotate_left_title')} onClick={turn(1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="vc-btn vc-btn--home" aria-label={t('cvn_vc_home_aria')} title={t('cvn_vc_home_title')} onClick={home}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5 8 3l5.5 4.5M4 6.8V13h8V6.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="vc-btn vc-btn--wide" aria-pressed={orbit.ortho} aria-label={orbit.ortho ? t('cvn_vc_ortho_on') : t('cvn_vc_persp_on')} title={t('cvn_vc_toggle_ortho')} onClick={toggleOrtho}>
          {orbit.ortho ? t('cvn_vc_ortho') : t('cvn_vc_persp')}
        </button>
        <button type="button" className="vc-btn" aria-label={t('cvn_vc_rotate_right')} title={t('cvn_vc_rotate_right_title')} onClick={turn(-1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
