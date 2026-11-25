import { CONEXOES_POR_DOMINIO, type RegrasConexao } from './conexoesAutomaticas.ts';

/*
 * Tipos de tubulação (fase 2, ficha L1; equivalente às preferências de roteamento do Revit): cada tipo declara a família do trecho
 * de tubo, as conexões preferidas por ângulo (joelho 90° e 45°, tê, junção, luva, tampão) e as bitolas (DN, mm) permitidas. A
 * ferramenta Tubo acha o tipo pela família do trecho; família sem tipo cai nas regras fixas do domínio (`CONEXOES_POR_DOMINIO`).
 * Conexão que o tipo não oferece fica com id vazio: o encontro vira aviso, nunca uma peça inventada.
 */

export interface TipoTubulacao {
  id: string;
  rotulo: string;
  dominio: 'esgoto' | 'agua_fria' | 'eletroduto';
  regras: RegrasConexao;
  /** DN (mm) permitidos para o trecho; `null` = qualquer. */
  bitolas: readonly number[] | null;
  /** Nome curto da linha de produto para os avisos. */
  linha: string;
}

export const TIPOS_TUBULACAO: readonly TipoTubulacao[] = [
  {
    id: 'krona_esgoto',
    rotulo: 'Esgoto PVC — Krona',
    dominio: 'esgoto',
    linha: 'esgoto da Krona',
    bitolas: [40, 50, 75, 100, 150, 200, 250],
    regras: {
      tubo: 'fam_krona_esgoto_tubo_corte',
      curva90: 'fam_krona_esgoto_joelho90',
      curva45: 'fam_krona_esgoto_joelho45',
      te: 'fam_krona_esgoto_te',
      juncao45: 'fam_krona_esgoto_juncao45',
      luva: 'fam_krona_esgoto_luva',
      reducao: 'fam_krona_esgoto_reducao_excentrica',
      tampao: 'fam_krona_esgoto_tampao',
    },
  },
  {
    id: 'krona_soldavel',
    rotulo: 'Água fria soldável — Krona',
    dominio: 'agua_fria',
    linha: 'água fria soldável da Krona',
    bitolas: [20, 25, 32, 40, 50, 60, 75, 85, 110],
    regras: {
      tubo: 'fam_krona_soldavel_tubo_corte',
      curva90: 'fam_krona_soldavel_joelho90',
      curva45: 'fam_krona_soldavel_joelho45',
      te: 'fam_krona_soldavel_te',
      juncao45: '',
      luva: 'fam_krona_soldavel_luva',
      reducao: 'fam_krona_soldavel_luva_reducao',
      tampao: 'fam_krona_soldavel_tampao',
    },
  },
  {
    // Eletroduto rígido soldável da Krona (ficha C3). SÓ as peças que o catálogo transcrito tem: curva 90° (DN 20, 25, 32) e luva
    // (DN 20 e 25; DN 32 não tem luva no catálogo). Curva 45°, tê, junção, redução e tampão NÃO existem: a regra fica vazia e o
    // encontro vira aviso, sem peça inventada. Bitolas = as do tubo do catálogo (CONFERIR).
    id: 'krona_eletroduto_pvc',
    rotulo: 'Eletroduto PVC rígido soldável — Krona',
    dominio: 'eletroduto',
    linha: 'eletroduto rígido soldável da Krona',
    bitolas: [20, 25, 32],
    regras: {
      tubo: 'fam_krona_eletrica_tubo_corte',
      curva90: 'fam_krona_eletrica_curva90',
      curva45: '',
      te: '',
      juncao45: '',
      luva: 'fam_krona_eletrica_luva',
      reducao: '',
      tampao: '',
    },
  },
];

/** Tipo cujo trecho de tubo é a família `tuboId`. */
export function tipoDaFamiliaDeTubo(tuboId: string): TipoTubulacao | undefined {
  return TIPOS_TUBULACAO.find((t) => t.regras.tubo === tuboId);
}

/** Regras de conexão para o trecho de tubo `tuboId`: as do tipo, senão as fixas do domínio (esgoto genérico), senão `null`. */
export function regrasDoTubo(tuboId: string, dominio: string): RegrasConexao | null {
  return tipoDaFamiliaDeTubo(tuboId)?.regras ?? CONEXOES_POR_DOMINIO[dominio] ?? null;
}

export type ResultadoBitola = { ok: true } | { ok: false; motivo: string };

/** O DN está na lista do tipo? Fora da lista é recusado com o motivo (e as bitolas que valem). */
export function bitolaPermitida(tuboId: string, dn: number): ResultadoBitola {
  const tipo = tipoDaFamiliaDeTubo(tuboId);
  if (!tipo?.bitolas || tipo.bitolas.includes(dn)) return { ok: true };
  return { ok: false, motivo: `DN ${dn} não existe na linha ${tipo.linha}. Bitolas: ${tipo.bitolas.join(', ')}.` };
}

/** Bitolas (mm) que o tipo do trecho oferece, ou `null` quando vale qualquer. */
export function bitolasDoTubo(tuboId: string): readonly number[] | null {
  return tipoDaFamiliaDeTubo(tuboId)?.bitolas ?? null;
}
