import type { ReactElement } from 'react';
import type { TipoGuardaCorpo } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';

const W = 320;
const H = 200;
const BASE = 185;
/** Vão mostrado na prévia (m): dois metros de guarda, desenhados em escala. */
const VAO_M = 2.4;
const X0 = 30;

/**
 * Prévia da família (decisão 0055, Fase 6c): elevação esquemática de um vão de 2,4 m, feita só com os parâmetros do tipo
 * (altura, postes, trilhos, corrimãos e preenchimento). Não usa a malha do kernel: é o desenho de conferência que a
 * Fase 5 substitui pelo 3D real quando o kernel tiver a geometria.
 */
export function GuardaCorpoPreview({ tipo }: { tipo: TipoGuardaCorpo }): ReactElement {
  const { t } = useT();
  const topoCorrimao = Math.max(0, ...tipo.corrimaos.map((c) => c.altura));
  const topoPostes = tipo.altura + Math.max(0, tipo.postes.inicio.alturaAcima, tipo.postes.fim.alturaAcima);
  const max = Math.max(tipo.altura, topoCorrimao, topoPostes, 0.3) * 1.15;
  const s = (BASE - 12) / max; // pixels por metro, na vertical
  const sx = (W - 2 * X0) / VAO_M; // pixels por metro, na horizontal
  const y = (h: number): number => BASE - h * s;
  const xi = X0;
  const xf = W - X0;
  const largura = (d: number, min: number, max2: number): number => Math.min(max2, Math.max(min, d * sx));

  const postes = (['inicio', 'fim'] as const)
    .map((k) => ({ k, poste: tipo.postes[k], x: k === 'inicio' ? xi : xf }))
    .filter((p) => p.poste.ativo)
    .map((p) => (
      <line key={`poste-${p.k}`} x1={p.x} y1={BASE} x2={p.x} y2={y(tipo.altura + p.poste.alturaAcima)} stroke="currentColor" strokeWidth={largura(p.poste.perfil.largura, 2, 8)} />
    ));

  const trilhos = tipo.trilhos.map((tr, i) => (
    <line key={`trilho-${i}`} x1={xi} y1={y(tr.altura)} x2={xf} y2={y(tr.altura)} stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3">
      <title>{t('gc6c_pv_rail')}</title>
    </line>
  ));

  const corrimaos = tipo.corrimaos.map((c, i) => (
    <line key={`corrimao-${i}`} x1={xi} y1={y(c.altura)} x2={xf} y2={y(c.altura)} stroke="currentColor" strokeWidth={largura(c.perfil.largura, 2, 6)} strokeLinecap="round" />
  ));

  const preenchimento = tipo.preenchimentos.flatMap((pr, i) => {
    if (pr.tipo === 'painel') {
      return [<rect key={`painel-${i}`} x={xi} y={y(tipo.altura)} width={xf - xi} height={BASE - y(tipo.altura)} fill="currentColor" opacity={0.12} stroke="currentColor" strokeOpacity={0.4} />];
    }
    const passo = Math.max(3, pr.periodo * sx);
    const linhas: ReactElement[] = [];
    for (let x = xi + passo, n = 0; x < xf && n < 80; x += passo, n++) {
      linhas.push(<line key={`bal-${i}-${n}`} x1={x} y1={BASE} x2={x} y2={y(tipo.altura)} stroke="currentColor" strokeWidth={1.2} />);
    }
    return linhas;
  });

  return (
    <figure className="gc-preview">
      <h3>{t('gc6c_preview')}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('gc6c_preview')}>
        <line x1={0} y1={BASE} x2={W} y2={BASE} stroke="currentColor" strokeOpacity={0.5} />
        {preenchimento}
        {trilhos}
        {postes}
        {corrimaos}
      </svg>
      <figcaption className="fam-hint">{t('gc6c_preview_note')}</figcaption>
    </figure>
  );
}
