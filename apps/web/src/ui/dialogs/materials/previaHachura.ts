/**
 * Padrões novos ainda usam provisoriamente o desenho de um padrão antigo na prévia de seção
 * (o shader próprio cuida do desenho definitivo). Mapa compartilhado pelas quatro prévias.
 */
export const PREVIA: Record<string, 'diagonal' | 'cross' | 'dots'> = {
  diagonal: 'diagonal', cross: 'cross', dots: 'dots',
  brick: 'diagonal', concrete: 'diagonal', timber: 'diagonal', insulation: 'diagonal', earth: 'dots',
  cmu: 'cross', exposedBrick: 'cross', rcConcrete: 'diagonal', stone: 'diagonal', gravel: 'dots', sand: 'dots',
  eps: 'dots', woolZigzag: 'diagonal', gypsum: 'diagonal', timberEnd: 'cross', steel: 'diagonal',
};
