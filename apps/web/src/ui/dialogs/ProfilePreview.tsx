import type { ReactElement } from 'react';
import { formatQuantity, profileHeightAt, profileMax, type ProfilePoint } from '@hestia/model';
import { machineNumber } from '@hestia/geom';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

const W = 340;
const H = 170;
const PAD_X = 18;
const PAD_TOP = 22;
const PAD_BOT = 26;

const pt = (n: number): string => machineNumber(n, 1);

/** Contorno de cima dentro de [0, L]: as bordas recebem a altura do perfil nesses pontos. */
function outline(pts: ProfilePoint[], length: number): ProfilePoint[] {
  return [{ t: 0, h: profileHeightAt(pts, 0) }, ...pts.filter((q) => q.t > 0 && q.t < length), { t: length, h: profileHeightAt(pts, length) }];
}

/** Elevação da parede: eixo em metros, topo reto tracejado e o perfil preenchido. Escala adaptada a L e à altura máxima. */
export function ProfilePreview({ pts, length, height }: { pts: ProfilePoint[]; length: number; height: number }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const L = Math.max(length, 1e-3);
  const top = Math.max(profileMax(pts), height, 0.1);
  const k = Math.min((W - PAD_X * 2) / L, (H - PAD_TOP - PAD_BOT) / top);
  const ox = (W - L * k) / 2;
  const base = H - PAD_BOT;
  const x = (t: number): number => ox + t * k;
  const y = (h: number): number => base - h * k;
  const poly = outline(pts, L);
  const shape = [`${pt(x(0))},${pt(base)}`, ...poly.map((q) => `${pt(x(q.t))},${pt(y(q.h))}`), `${pt(x(L))},${pt(base)}`].join(' ');
  const maxH = Math.max(0, profileMax(pts));
  return (
    <svg className="profile-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dlt_a11y_wall_profile', { h: formatQuantity(units, 'length', maxH) })}>
      <rect x={x(0)} y={y(height)} width={L * k} height={Math.max(0, height * k)} className="profile-straight" />
      <polygon points={shape} className="profile-fill" />
      {pts.map((q, i) => (
        <circle key={i} cx={pt(x(Math.min(L, Math.max(0, q.t))))} cy={pt(y(q.h))} r={2.6} className="profile-dot" />
      ))}
      <line x1={pt(x(0) - 8)} x2={pt(x(L) + 8)} y1={pt(base)} y2={pt(base)} className="profile-ground" />
      <text x={pt(x(0))} y={pt(base + 14)} className="profile-tick" textAnchor="start">0</text>
      <text x={pt(x(L / 2))} y={pt(base + 14)} className="profile-tick" textAnchor="middle">{formatQuantity(units, 'length', L / 2)}</text>
      <text x={pt(x(L))} y={pt(base + 14)} className="profile-tick" textAnchor="end">{formatQuantity(units, 'length', L)}</text>
      <text x={pt(PAD_X)} y={12} className="profile-tick">{t('dlt_profile_top_max', { h: formatQuantity(units, 'length', maxH) })}</text>
    </svg>
  );
}
