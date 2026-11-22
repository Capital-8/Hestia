import { type ReactElement } from 'react';
import { worldToScreen } from '@hestia/render';
import type { CollabPeer, CollabPresence, Project } from '@hestia/model';
import { collabManager, useCollab } from '../../collab/session.ts';
import { editor } from '../../editor/controller.ts';
import { useT, type Lang } from '../../editor/i18n.ts';
import { rotuloDaDisciplina } from '../../editor/planViewActions.ts';
import { useUi } from '../../editor/state.ts';

/**
 * Texto do rótulo de um cursor remoto: o nome do peer e, quando ele publicou sua disciplina de trabalho, o rótulo
 * dessa disciplina ("Ana · Estrutura"). Presença sem disciplina continua exibindo só o nome.
 */
export function rotuloDoCursor(
  peer: Pick<CollabPeer, 'name' | 'presence'>,
  p: Pick<Project, 'disciplines'>,
  lang: Lang,
): string {
  const discipline = peer.presence?.discipline;
  return discipline ? `${peer.name} · ${rotuloDaDisciplina(p, lang, discipline)}` : peer.name;
}

function matchesActiveView(
  p: CollabPresence,
  view: string,
  levelId: string,
  sectionId: string | null,
  sheetId: string | null,
): boolean {
  if (p.view !== view) return false;
  if (view === 'plan') return p.levelId === levelId;
  if (view === 'section') return p.sectionId === sectionId;
  if (view === 'sheet') return p.sheetId === sheetId;
  return true;
}

/**
 * Sobreposição de colaboração sobre a área de desenho:
 * - Sala de espera bloqueante enquanto o convidado aguarda aprovação do anfitrião;
 * - Camada SVG não intrusiva (`pointer-events: none`) de cursores 2D remotos quando autorizado.
 */
export function CollabPresenceOverlay(): ReactElement | null {
  const { t, lang } = useT();
  const mode = useCollab((s) => s.mode);
  const approvalStatus = useCollab((s) => s.approvalStatus);
  const myPeerId = useCollab((s) => s.myPeerId);
  const peers = useCollab((s) => s.peers);

  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  const sectionId = useUi((s) => s.sectionId);
  const sheetId = useUi((s) => s.sheetId);
  useUi((s) => s.previewTick);

  if (mode === 'off') return null;

  if (mode === 'guest' && approvalStatus === 'waiting') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 30,
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            padding: '24px 28px',
            background: 'var(--panel)',
            border: '1px solid var(--line-strong)',
            borderRadius: 6,
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            textAlign: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{t('collab_waiting_title')}</h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-soft)' }}>{t('collab_waiting_desc')}</p>
          <button type="button" className="btn danger" onClick={() => collabManager.stopSession()}>
            {t('collab_waiting_cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (mode !== 'host' && approvalStatus !== 'approved') return null;

  const vp = view === 'plan' || view === 'section' ? editor.viewport() : null;
  const cursors = vp
    ? peers
        .filter((p) => p.id !== myPeerId && p.presence?.cursor && matchesActiveView(p.presence, view, levelId, sectionId, sheetId))
        .map((p) => ({ peer: p, screen: worldToScreen(vp, p.presence!.cursor!) }))
        .filter((c) => Number.isFinite(c.screen.x) && Number.isFinite(c.screen.y))
    : [];

  if (cursors.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15, overflow: 'hidden' }}
    >
      {cursors.map(({ peer, screen }) => {
        const rotulo = rotuloDoCursor(peer, editor.project, lang);
        return (
          <g key={peer.id} transform={`translate(${screen.x}, ${screen.y})`}>
            <path
              d="M0 0 L0 14 L3.5 10.5 L6.5 16 L8.5 15 L5.5 9.5 L10 9.5 Z"
              fill={peer.color}
              stroke="#ffffff"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <g transform="translate(12, 12)">
              <rect x={0} y={0} width={Math.max(44, rotulo.length * 6.5 + 12)} height={18} rx={9} fill={peer.color} />
              <text x={7} y={12.5} fill="#ffffff" fontSize={10.5} fontWeight={600} fontFamily="var(--font-ui)">
                {rotulo}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
