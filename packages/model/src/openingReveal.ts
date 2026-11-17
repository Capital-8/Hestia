import type { OpeningType } from './openingTypes.ts';

/*
 * Recuo do batente (`OpeningType.reveal`, ArchiCAD "Reveal"): o batente e tudo o que fica na profundidade dele (folha,
 * caixilho, vidro, ferragens, soleira) deslocam-se para DENTRO da parede, a partir da face externa, por esta distância (m),
 * em relação ao posicionamento padrão do `frameDepthMode`. 0 (ou ausente) mantém o posicionamento atual, sem nenhuma conta.
 * O deslocamento é limitado ao espaço que sobra entre a face interna do batente e a face interna da parede: o batente nunca
 * sai da parede (com `frameDepthMode: 'wall'` ele ocupa a espessura toda e o recuo vale 0).
 */

/** Recuo pedido pelo tipo (m): número finito e positivo; qualquer outra coisa vale 0. */
export function openingRevealDepth(t: Pick<OpeningType, 'reveal'>): number {
  const d = t.reveal?.depth;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * Folga (m) entre a face interna do batente e a face interna da parede, medida para o lado interno: é o recuo máximo.
 * `centerToInterior` é o centro do batente em relação ao plano médio da parede, positivo para o lado interno.
 */
export function openingRevealRoom(wallThickness: number, centerToInterior: number, frameDepth: number): number {
  const room = wallThickness / 2 - centerToInterior - frameDepth / 2;
  return room > 1e-9 ? room : 0;
}

/** Recuo efetivo (m): o pedido limitado à folga. Menor que o pedido = parede fina demais (o painel de verificações avisa). */
export function openingRevealApplied(t: Pick<OpeningType, 'reveal'>, wallThickness: number, centerToInterior: number, frameDepth: number): number {
  const asked = openingRevealDepth(t);
  return asked > 0 ? Math.min(asked, openingRevealRoom(wallThickness, centerToInterior, frameDepth)) : 0;
}
