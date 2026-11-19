import type { Lang } from './i18n.ts';
import { normalizarMaterial } from './materialBlocks.ts';
import type { HatchKind, Material } from './types.ts';

const L = (lang: Lang, pt: string, en: string): string => (lang === 'pt' ? pt : en);

const tx = (imagemId: string, escalaMetros: number, rugosidade: number): Material['aparencia'] => ({
  rugosidade,
  textura: { imagemId, escalaMetros, rotacao: 0, deslocamento: [0, 0], repetir: true },
});

const mk = (
  lang: Lang,
  id: string,
  pt: string,
  en: string,
  classePt: string,
  classeEn: string,
  color: string,
  hatch: HatchKind,
  extra: Partial<Material> = {},
): Material => ({
  id,
  name: L(lang, pt, en),
  color,
  hatch,
  gloss: 0.1,
  opacity: 1,
  cost: 0,
  unit: 'm2',
  ...extra,
  identidade: { classe: L(lang, classePt, classeEn), ...extra.identidade },
});

const p = (lang: Lang, id: string, pt: string, en: string, color: string, gloss = 0.15, rugosidade = 0.85): Material =>
  mk(lang, id, pt, en, 'Tintas e Cores', 'Paints & Colors', color, 'none', { gloss, cost: 42, aparencia: { rugosidade } });

/** Catálogo enxuto de materiais arquitetônicos extras (tintas, vidros, madeiras, tijolos e pedras com texturas locais). */
export function materiaisExtras(lang: Lang = 'pt'): Material[] {
  // `normalizarMaterial` fixa a ordem canônica das chaves dos blocos: salvar → abrir → salvar fica byte a byte estável.
  return materiaisExtrasBrutos(lang).map(normalizarMaterial);
}

function materiaisExtrasBrutos(lang: Lang): Material[] {
  return [
    // Tintas e Cores Sólidas (7)
    p(lang, 'mat_branco_gelo', 'Tinta Branco Gelo', 'Ice White Paint', '#eef2f5'),
    p(lang, 'mat_areia', 'Tinta Areia', 'Sand Paint', '#dfd1b8'),
    p(lang, 'mat_cinza_claro', 'Tinta Cinza Claro', 'Light Gray Paint', '#c8ccd0'),
    p(lang, 'mat_cinza_chumbo', 'Tinta Cinza Chumbo', 'Charcoal Gray Paint', '#4a4f55'),
    p(lang, 'mat_preto_fosco', 'Tinta Preto Fosco', 'Matte Black Paint', '#222426', 0.05, 0.92),
    p(lang, 'mat_terracota', 'Tinta Terracota', 'Terracotta Paint', '#b85c42'),
    p(lang, 'mat_azul_petroleo', 'Tinta Azul Petróleo', 'Petrol Blue Paint', '#285966'),

    // Vidros e Espelhos (4)
    mk(lang, 'mat_vidro_fume', 'Vidro Fumê', 'Smoked Glass', 'Vidros e Espelhos', 'Glass & Mirrors', '#4f565c', 'none', { gloss: 0.92, opacity: 0.45, cost: 290, aparencia: { rugosidade: 0.05, opacidade: 0.45 } }),
    mk(lang, 'mat_vidro_bronze', 'Vidro Bronze', 'Bronze Glass', 'Vidros e Espelhos', 'Glass & Mirrors', '#7a6350', 'none', { gloss: 0.92, opacity: 0.45, cost: 300, aparencia: { rugosidade: 0.05, opacidade: 0.45 } }),
    mk(lang, 'mat_vidro_verde', 'Vidro Verde', 'Green Glass', 'Vidros e Espelhos', 'Glass & Mirrors', '#7eb0a0', 'none', { gloss: 0.92, opacity: 0.4, cost: 260, aparencia: { rugosidade: 0.05, opacidade: 0.4 } }),
    mk(lang, 'mat_espelho_prata', 'Espelho Prata', 'Silver Mirror', 'Vidros e Espelhos', 'Glass & Mirrors', '#d8dde0', 'none', { gloss: 0.98, opacity: 1, cost: 320, aparencia: { metal: 0.95, rugosidade: 0.02 } }),

    // Madeiras com texturas reais (5)
    mk(lang, 'mat_carvalho_claro', 'Madeira Carvalho Claro', 'Light Oak Wood', 'Madeiras', 'Wood', '#ceaa74', 'diagonal', { gloss: 0.3, cost: 290, aparencia: tx('basica:Wood022', 1.2, 0.55) }),
    mk(lang, 'mat_freijo', 'Madeira Freijó', 'Freijo Wood', 'Madeiras', 'Wood', '#b09065', 'diagonal', { gloss: 0.35, cost: 280, aparencia: tx('basica:Wood048', 1.2, 0.55) }),
    mk(lang, 'mat_cumaru', 'Madeira Cumaru', 'Cumaru Wood', 'Madeiras', 'Wood', '#683817', 'diagonal', { gloss: 0.42, cost: 380, aparencia: tx('basica:Wood026', 1.2, 0.48) }),
    mk(lang, 'mat_nogueira', 'Madeira Nogueira', 'Walnut Wood', 'Madeiras', 'Wood', '#41342e', 'diagonal', { gloss: 0.4, cost: 360, aparencia: tx('basica:Wood051', 1.2, 0.5) }),
    mk(lang, 'mat_piso_madeira', 'Piso de Madeira', 'Wood Flooring', 'Madeiras', 'Wood', '#9a7a5d', 'diagonal', { gloss: 0.45, cost: 320, aparencia: tx('basica:WoodFloor051', 1.5, 0.45) }),

    // Tijolos e Pedras com texturas reais (5)
    mk(lang, 'mat_tijolinho_ingles', 'Tijolo Aparente Tradicional', 'Exposed Red Brick', 'Cerâmicas e Tijolos', 'Ceramic & Brick', '#a7705e', 'diagonal', { gloss: 0.1, cost: 160, aparencia: tx('basica:Bricks051', 1.2, 0.85) }),
    mk(lang, 'mat_tijolo_escuro', 'Tijolo Aparente Rústico', 'Rustic Exposed Brick', 'Cerâmicas e Tijolos', 'Ceramic & Brick', '#b49174', 'diagonal', { gloss: 0.1, cost: 170, aparencia: tx('basica:Bricks090', 1.2, 0.85) }),
    mk(lang, 'mat_tijolinho_branco', 'Tijolinho Branco', 'White Brick', 'Cerâmicas e Tijolos', 'Ceramic & Brick', '#dbd6d2', 'diagonal', { gloss: 0.15, cost: 175, aparencia: tx('basica:Bricks060', 1.2, 0.8) }),
    mk(lang, 'mat_marmore_carrara', 'Mármore Branco Carrara', 'Carrara White Marble', 'Pedras e Mármores', 'Stone & Marble', '#dfddd7', 'none', { gloss: 0.82, cost: 680, aparencia: tx('basica:Marble001', 1.6, 0.18) }),
    mk(lang, 'mat_granito_sao_gabriel', 'Granito Cinza', 'Gray Granite', 'Pedras e Mármores', 'Stone & Marble', '#b4b1ac', 'dots', { gloss: 0.72, cost: 340, aparencia: tx('basica:Granite002A', 1.0, 0.25) }),
  ];
}
