import type { ValidationIssue } from '@hestia/model';

/**
 * Avisos normativos de porta (nunca bloqueiam). Os valores vêm de RESUMOS PÚBLICOS de busca, não da norma lida
 * (coleta em docs/estudo-esquadrias/coleta/16-publico-normas-resumos.md). Por isso toda mensagem pede conferir a norma vigente.
 */

/** NBR 9050: vão livre mínimo de porta, com a folha aberta (m). */
export const PORTA_VAO_LIVRE_MIN_LARGURA_M = 0.8;
export const PORTA_VAO_LIVRE_MIN_ALTURA_M = 2.1;
/** NBR 9050 (edição 2020, segundo resumo): desnível máximo de soleira na rota acessível (mm). */
export const PORTA_SOLEIRA_MAX_MM = 5;

/** Tolerância numérica para comparar medidas em metros (1 µm). */
const EPS_M = 1e-6;
const SUFIXO_RESUMO = 'resumo público, conferir a norma vigente';

/** Dados de uma porta, já resolvidos pelo chamador. Não depende do modelo do projeto. */
export interface PortaNormaInput {
  id: string;
  /** Vão livre com a folha aberta (m). */
  vaoLivreLarguraM: number;
  vaoLivreAlturaM: number;
  /** Desnível da soleira (mm). `null` ou ausente = não informado. */
  soleiraMm?: number | null;
  /** Porta situada na rota acessível. */
  rotaAcessivel?: boolean;
  /** Porta com painel de vidro. */
  comVidro?: boolean;
  /** Vidro classificado como seguro. `undefined` ou `null` = não informado (sem aviso). */
  vidroSeguro?: boolean | null;
}

// units-ok: valor de norma em m/mm; texto fixo em pt
const fmt = (v: number): string => String(Math.round(v * 1000) / 1000).replace('.', ',');

/** NBR 9050: porta com vão livre menor que 0,80 m x 2,10 m. */
export function portaVaoLivreIssues(p: PortaNormaInput): ValidationIssue[] {
  const estreita = p.vaoLivreLarguraM < PORTA_VAO_LIVRE_MIN_LARGURA_M - EPS_M;
  const baixa = p.vaoLivreAlturaM < PORTA_VAO_LIVRE_MIN_ALTURA_M - EPS_M;
  if (!estreita && !baixa) return [];
  return [{
    severity: 'warning',
    code: 'porta-vao-livre-menor',
    elementId: p.id,
    message: `Porta ${p.id}: vão livre de ${fmt(p.vaoLivreLarguraM)} x ${fmt(p.vaoLivreAlturaM)} m é menor que 0,80 x 2,10 m (NBR 9050, ${SUFIXO_RESUMO}).`,
  }];
}

/** NBR 9050: soleira acima de 5 mm em porta de rota acessível. */
export function portaSoleiraIssues(p: PortaNormaInput): ValidationIssue[] {
  if (!p.rotaAcessivel || p.soleiraMm == null) return [];
  if (!(p.soleiraMm > PORTA_SOLEIRA_MAX_MM)) return [];
  return [{
    severity: 'warning',
    code: 'porta-soleira-acima-5mm',
    elementId: p.id,
    message: `Porta ${p.id}: soleira de ${fmt(p.soleiraMm)} mm na rota acessível excede 5 mm (NBR 9050, ${SUFIXO_RESUMO}).`,
  }];
}

/** NBR 7199:2025: painel de vidro em porta sem classificação de vidro de segurança. */
export function portaVidroIssues(p: PortaNormaInput): ValidationIssue[] {
  if (!p.comVidro || p.vidroSeguro !== false) return [];
  return [{
    severity: 'warning',
    code: 'porta-vidro-nao-seguro',
    elementId: p.id,
    message: `Porta ${p.id}: painel de vidro não seguro (NBR 7199:2025, ${SUFIXO_RESUMO}).`,
  }];
}

/** Todos os avisos normativos de porta, na ordem: vão livre, soleira, vidro. Lista vazia quando nada se aplica. */
export function openingNormIssues(portas: readonly PortaNormaInput[]): ValidationIssue[] {
  return portas.flatMap((p) => [...portaVaoLivreIssues(p), ...portaSoleiraIssues(p), ...portaVidroIssues(p)]);
}
