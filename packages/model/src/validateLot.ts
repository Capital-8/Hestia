import { t, type Lang } from './i18n.ts';
import { LOTE_LIMITES, type Lot } from './lotTypes.ts';
import { TERRENO_LIMITES } from './terrainTypes.ts';
import { anelTerrenoSimples, areaAnelComSinal, finito } from './validateTerrain.ts';

const PAPEIS = ['frente', 'lateral', 'fundo'];

/** Valida os limites urbanísticos (quando presentes, > 0; coeficiente ≤ 100, frações ≤ 1). */
function limitesIssue(l: Lot['limites'], lang: Lang): string | null {
  const faixa = (campo: string, v: unknown, max: number): string | null => {
    if (v === undefined) return null;
    return finito(v) && v > 0 && v <= max ? null : t(lang, 'md_lt_limite', { campo, max });
  };
  const gabarito = l?.gabaritoMax;
  return (
    faixa('taxaOcupacaoMax', l?.taxaOcupacaoMax, 1) ??
    faixa('coefAproveitamentoMax', l?.coefAproveitamentoMax, 100) ??
    faixa('permeabilidadeMin', l?.permeabilidadeMin, 1) ??
    // Sem teto escrito no plano: só finito e positivo (altura em metros).
    (gabarito === undefined || (finito(gabarito) && gabarito > 0) ? null : t(lang, 'md_lt_gabarito'))
  );
}

/**
 * Problema do lote, ou null se estiver válido (A.3 item 6). O contorno precisa vir anti-horário: os comandos
 * normalizam o sentido (e `lados` junto) antes de validar.
 */
export function lotIssue(lote: Lot, lang: Lang = 'pt'): string | null {
  const c = lote.contorno;
  if (!Array.isArray(c) || c.length < 3 || c.length > LOTE_LIMITES.pontos) return t(lang, 'md_lt_pontos', { max: LOTE_LIMITES.pontos });
  for (const q of c) {
    if (!finito(q?.x) || !finito(q?.y)) return t(lang, 'md_lt_numero');
    if (Math.abs(q.x) > TERRENO_LIMITES.coordMax || Math.abs(q.y) > TERRENO_LIMITES.coordMax) return t(lang, 'md_lt_coord', { max: TERRENO_LIMITES.coordMax });
  }
  if (!anelTerrenoSimples(c)) return t(lang, 'md_lt_simples');
  if (areaAnelComSinal(c) <= 0) return t(lang, 'md_lt_horario');
  if (!Array.isArray(lote.lados) || lote.lados.length !== c.length) return t(lang, 'md_lt_lados');
  for (let i = 0; i < lote.lados.length; i++) {
    const lado = lote.lados[i];
    if (!lado || !PAPEIS.includes(lado.papel)) return t(lang, 'md_lt_papel', { i: i + 1 });
    if (!finito(lado.recuo) || lado.recuo < 0 || lado.recuo > LOTE_LIMITES.recuoMax) return t(lang, 'md_lt_recuo', { i: i + 1, max: LOTE_LIMITES.recuoMax });
  }
  return limitesIssue(lote.limites, lang);
}
