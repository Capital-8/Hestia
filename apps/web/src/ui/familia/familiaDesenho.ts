import type { PecaResolvida } from '@hestia/engine';
import type { DetalheFamilia } from './familiaStore.ts';

/*
 * Apoio de desenho das vistas do editor: as peças resolvidas vêm do motor em METROS (converter para mm só nos rótulos).
 * O 3D é um SVG oblíquo provisório; a vista 3D real troca este componente por three.js sem mudar o contrato de props.
 */

export type Pt = [number, number];

/** Paleta da família por papel da peça (as cores de chapa vêm do CSS). */
export function corDaPeca(p: PecaResolvida): string {
  if (p.papel === 'porta' || p.papel === 'frente_gaveta') return 'var(--fam-porta)';
  if (p.papel === 'tampo') return 'var(--fam-tampo)';
  if (p.papel === 'fundo') return 'var(--fam-fundo)';
  return 'var(--fam-corpo)';
}

/** Afasta cada peça do centro para ver a caixaria "explodida". `ex` em metros. */
export function afastar(p: PecaResolvida, ex: number): PecaResolvida {
  if (!ex) return p;
  const dx = p.papel === 'lateral' ? (p.origem[0] < 0.5 ? -ex : ex) : 0;
  const dy = p.papel === 'porta' ? -ex * 1.2 : p.papel === 'fundo' ? ex : 0;
  const dz = p.papel === 'tampo' ? ex : p.papel === 'rodape' ? -ex : 0;
  return { ...p, origem: [p.origem[0] + dx, p.origem[1] + dy, p.origem[2] + dz] };
}

/** Nível de detalhe: grosso mostra só o volume principal, médio tira travessas e rodapé. */
export function visiveis(pecas: readonly PecaResolvida[], detalhe: DetalheFamilia, portas: boolean, ex: number): PecaResolvida[] {
  let ps = pecas.map((p) => afastar(p, ex)).filter((p) => portas || p.papel !== 'porta');
  if (detalhe === 'grosso') ps = ps.filter((p) => ['lateral', 'base', 'tampo', 'porta'].includes(p.papel));
  else if (detalhe === 'medio') ps = ps.filter((p) => p.papel !== 'travessa' && p.papel !== 'rodape');
  return ps;
}

// units-ok: conversão metros → milímetros para os rótulos de cota do protótipo
export const mm = (m: number): number => Math.round(m * 1e6) / 1e3;
