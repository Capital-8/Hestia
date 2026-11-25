import { avaliarEncontro, posicionarConexao, tipoDaFamiliaDeTubo, type PontoSegmento, type RegrasConexao } from '@hestia/engine';
import { familiaDaBiblioteca, type Familia, type Project } from '@hestia/model';

/*
 * Mudança de cota do trecho da ferramenta Tubo (ficha B4): quando os dois pontos do trecho têm cotas diferentes e a declividade é 0,
 * o desnível é uma prumada. `modoCota` escolhe como: sobe na vertical e depois anda (padrão), anda e depois sobe, ou um tubo
 * diagonal (só se o tipo de tubulação tem peça para o ângulo). Com declividade diferente de 0 o desnível é intencional: nada muda.
 */

/** Como o trecho de cotas diferentes é desenhado. */
export type ModoCota = 'subir_primeiro' | 'andar_primeiro' | 'diagonal';

/** Desnível (m) acima do qual o trecho é uma mudança de cota; e distância em planta (m) abaixo da qual só há o trecho vertical. */
const DESNIVEL_MINIMO = 0.001;
const HORIZONTAL_NULA = 0.001;
/** Ângulo (graus) da diagonal que tem curva de 45°, e a tolerância (a mesma do resolvedor de nó). */
const ANGULO_DIAGONAL = 45;
const TOLERANCIA_DIAGONAL = 2.5;

/** Plano do trecho: pontos intermediários (cada um vira um joelho) ou o motivo do bloqueio. */
export type PlanoPrumada = { bloqueio: string; intermediarios?: undefined } | { bloqueio: null; intermediarios: PontoSegmento[] };

/** Número com vírgula decimal e uma casa no máximo. */
// units-ok: ângulo em graus na mensagem de bloqueio, não é quantidade do projeto
const graus = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',');

/**
 * Planeja o trecho `a`→`b` (m). `intermediarios` vazio = um tubo só (como sempre). `familiaId` decide o modo diagonal: família sem tipo
 * de tubulação (F1 genérica) mantém o tubo inclinado de antes.
 */
export function planejarPrumada(a: PontoSegmento, b: PontoSegmento, modo: ModoCota, declividade: number, familiaId: string): PlanoPrumada {
  const dz = Math.abs(b[2] - a[2]);
  const horizontal = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (declividade !== 0 || dz <= DESNIVEL_MINIMO || horizontal < HORIZONTAL_NULA) return { bloqueio: null, intermediarios: [] };
  if (modo === 'subir_primeiro') return { bloqueio: null, intermediarios: [[a[0], a[1], b[2]]] };
  if (modo === 'andar_primeiro') return { bloqueio: null, intermediarios: [[b[0], b[1], a[2]]] };
  const tipo = tipoDaFamiliaDeTubo(familiaId);
  if (!tipo) return { bloqueio: null, intermediarios: [] };
  const angulo = (Math.atan2(dz, horizontal) * 180) / Math.PI;
  if (Math.abs(angulo - ANGULO_DIAGONAL) <= TOLERANCIA_DIAGONAL && tipo.regras.curva45 !== '') return { bloqueio: null, intermediarios: [] };
  return { bloqueio: `não existe conexão para este ângulo (${graus(angulo)}°). Use "Subir primeiro", "Andar primeiro" ou mude a cota para um desnível que dê 45° ou 90°.` };
}

/**
 * Recuos (m) de cada trecho no joelho `p1` entre `p0`→`p1` e `p1`→`p2`, com a família da peça do projeto ou da biblioteca.
 * Sem regras, sem peça ou sem família: zero (o tubo liga direto).
 */
export function recuosDoJoelho(projeto: Project, regras: RegrasConexao | null, dn: number, p0: PontoSegmento, p1: PontoSegmento, p2: PontoSegmento): [number, number] {
  if (!regras) return [0, 0];
  const r = avaliarEncontro({ a: p0, b: p1, dn }, 'b', { a: p1, b: p2, dn }, 'a', regras);
  if (!r.conexao || r.conexao.tipo === 'luva') return [0, 0];
  const fam: Familia | undefined = projeto.componentFamilies?.[r.conexao.familiaId] ?? familiaDaBiblioteca(r.conexao.familiaId) ?? undefined;
  const pos = fam ? posicionarConexao(fam, p1, r.conexao) : null;
  return [pos?.recuos[0] ?? 0, pos?.recuos[1] ?? 0];
}
