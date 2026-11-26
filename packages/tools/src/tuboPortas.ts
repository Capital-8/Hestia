import type { Vec2 } from '@hestia/geom';
import { encaixarLigacoes, type LigacaoNoMundo, type LigacaoResolvida } from '@hestia/engine';
import type { LigacaoAberta } from './tuboApoio.ts';
import type { PreviewItem } from './types.ts';

/*
 * Marcadores das portas livres ao alcance do cursor (ficha F3), para as ferramentas Tubo e Eletroduto: halo em volta de cada ligação
 * aberta que casa com a ponta do trecho (domínio, seção, bitola e fluxo, a mesma regra do encaixe do clique), e o halo forte, seta de
 * direção e nome na porta que o clique vai pegar. Vale para qualquer família com ligações livres (tomada, interruptor, luminária,
 * caixa, quadro, ponta de tubo, peça hidráulica): nada é específico de um domínio. Só usa itens de prévia que a planta já desenha.
 */

/** Alcance (px) do cursor em que as portas livres compatíveis ficam marcadas, e raios (px) do halo comum e do halo da porta que o clique pega. */
const ALCANCE_PX = 90;
const RAIO_PX = 6;
const RAIO_ATIVO_PX = 10;
const SETA_PX = 26;
const MAXIMO_MARCADAS = 14;
const LADOS_DO_CIRCULO = 20;

/** Anel poligonal de `n` lados em volta de `c`. */
function anel(c: Vec2, r: number): Vec2[] {
  return Array.from({ length: LADOS_DO_CIRCULO }, (_, k) => ({ x: c.x + r * Math.cos((2 * Math.PI * k) / LADOS_DO_CIRCULO), y: c.y + r * Math.sin((2 * Math.PI * k) / LADOS_DO_CIRCULO) }));
}

/** A porta `c` casaria com a ponta `ponta` do trecho (mesma regra do clique: ponta posta de frente para a porta, no ponto dela)? */
export function portaCompativel(ponta: LigacaoResolvida, c: LigacaoAberta, bitolaLivre: boolean): boolean {
  const alvo: LigacaoNoMundo = { ...ponta, ...(bitolaLivre ? { diametro: c.lig.diametro } : {}), posicaoMundo: c.lig.posicaoMundo, direcaoMundo: [-c.lig.direcaoMundo[0], -c.lig.direcaoMundo[1], -c.lig.direcaoMundo[2]] };
  return encaixarLigacoes(alvo, [c.lig], 1e-6) !== null;
}

/** Portas livres compatíveis a até `raio` (m) do cursor em planta, da mais perto para a mais longe (no máximo `MAXIMO_MARCADAS`). */
export function portasAoAlcance(cursor: Vec2, ponta: LigacaoResolvida, abertas: LigacaoAberta[], raio: number, bitolaLivre: boolean): LigacaoAberta[] {
  const distancia = (c: LigacaoAberta): number => Math.hypot(c.lig.posicaoMundo[0] - cursor.x, c.lig.posicaoMundo[1] - cursor.y);
  return abertas
    .filter((c) => distancia(c) <= raio && portaCompativel(ponta, c, bitolaLivre))
    .sort((a, b) => distancia(a) - distancia(b))
    .slice(0, MAXIMO_MARCADAS);
}

/**
 * Itens de prévia dos halos. `pega` é a porta que o clique escolhe (a de `ligacaoProxima`), ou null; `mpp` = metros por pixel.
 * Porta vertical (topo ou base) não tem seta em planta: o nome da porta diz o sentido.
 */
export function itensDePortas(cursor: Vec2, ponta: LigacaoResolvida, abertas: LigacaoAberta[], pega: LigacaoAberta | null, mpp: number, bitolaLivre: boolean): PreviewItem[] {
  const itens: PreviewItem[] = [];
  const marcadas = portasAoAlcance(cursor, ponta, abertas, ALCANCE_PX * mpp, bitolaLivre);
  if (pega && !marcadas.includes(pega)) marcadas.push(pega);
  for (const c of marcadas) {
    if (c === pega) continue;
    itens.push({ kind: 'polygon', ring: anel({ x: c.lig.posicaoMundo[0], y: c.lig.posicaoMundo[1] }, RAIO_PX * mpp) });
  }
  if (pega) {
    const [x, y] = pega.lig.posicaoMundo;
    const [dx, dy] = pega.lig.direcaoMundo;
    const centro = { x, y };
    itens.push({ kind: 'polygon', ring: anel(centro, RAIO_ATIVO_PX * mpp) }, { kind: 'polygon', ring: anel(centro, RAIO_ATIVO_PX * 0.5 * mpp) });
    const h = Math.hypot(dx, dy);
    if (h > 0.5) itens.push({ kind: 'line', a: centro, b: { x: x + (dx / h) * SETA_PX * mpp, y: y + (dy / h) * SETA_PX * mpp }, halo: true });
    itens.push({ kind: 'label', at: centro, text: `Porta: ${pega.lig.nome}${h <= 0.5 ? (pega.lig.direcaoMundo[2] > 0 ? ' (sobe)' : ' (desce)') : ''}` });
  }
  return itens;
}
