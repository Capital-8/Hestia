import type { Familia, Tipo } from '../tipos.ts';
import { corpoCaixa, familiaCaixa, ligacoesLaterais, paredeRetangular, simboloPlanta, type DadosCaixa } from './caixasHidroApoio.ts';
import {
  acima,
  corposCilindro,
  detalheCorte,
  PI,
  parametrosConstrucao,
  parametrosNorma,
  tabelaFossa,
  tipoDe,
  valoresTipo,
  verificacaoVolume,
  verificacoesFossa,
  volumeExigido,
  volumeExigidoFiltro,
} from './fossasSepticaApoio.ts';
import { derivado, inteiro } from './novosApoio.ts';
import { parametroNumero } from './caixasHidroApoio.ts';

/*
 * Fossa séptica cilíndrica e retangular e filtro anaeróbio (ficha F4). Todo valor de norma é parâmetro editável (CONFERIR:
 * NBR 7229 e NBR 13969, normas vigentes): a família NÃO afirma atender à norma. Os tipos são dimensionados por número de
 * contribuintes com os padrões; a altura de cada tipo sai da conta (arredondada para cima a 50 mm), por isso o volume útil cobre o exigido.
 */

const ESP = { e: 100, ef: 100, et: 80, hLivre: 300 } as const;
const UTIL = 'A - ef - et - hLivre';

/** Família de fossa/filtro com o corte longitudinal (D4) e a categoria de reservatório. */
function familiaFossa(d: DadosCaixa): Familia {
  return { ...familiaCaixa(d), detalhes: [detalheCorte()] };
}

/** Altura total (mm) para o volume útil `litros` numa área interna `areaMm2`: soma fundo, tampa e espaço livre. */
const alturaPara = (litros: number, areaMm2: number): number => acima((litros * 1e6) / areaMm2 + ESP.ef + ESP.et + ESP.hLivre);

// Tamanhos por contribuintes: [N, DN, diâmetro externo] (cilíndrica) e [N, DN, L, P] (retangular). CONFERIR.
const TAMANHOS_CILINDRICA: ReadonlyArray<readonly [number, number, number]> = [[5, 100, 1500], [10, 100, 1800], [20, 100, 2200], [40, 150, 2800]];
const TAMANHOS_RETANGULAR: ReadonlyArray<readonly [number, number, number, number]> = [[5, 100, 1800, 1000], [10, 100, 2200, 1200], [20, 100, 3000, 1600], [40, 150, 4000, 2200]];

/** Volume útil da fossa cilíndrica (litros): π/4 · (L − 2e)² · altura útil. */
export const VOLUME_CILINDRICA = `${PI} / 4 * (L - 2 * e) * (L - 2 * e) * hUtil / 1000000`;
/** Volume útil da fossa retangular (litros): (L − 2e)(P − 2e) · altura útil. */
export const VOLUME_RETANGULAR = '(L - 2 * e) * (P - 2 * e) * hUtil / 1000000';

export function tiposCilindrica(): Tipo[] {
  return TAMANHOS_CILINDRICA.map(([n, dn, d]) => {
    const di = d - 2 * ESP.e;
    const a = alturaPara(volumeExigido(n), (PI / 4) * di * di);
    return tipoDe(`n${n}`, `${n} contribuintes`, valoresTipo(n, dn, { L: d, P: d, A: a }));
  });
}

export function tiposRetangular(): Tipo[] {
  return TAMANHOS_RETANGULAR.map(([n, dn, l, p]) => {
    const a = alturaPara(volumeExigido(n), (l - 2 * ESP.e) * (p - 2 * ESP.e));
    return tipoDe(`n${n}`, `${n} contribuintes`, valoresTipo(n, dn, { L: l, P: p, A: a }));
  });
}

const septoCilindro = corpoCaixa('septo', 'Septo entre câmaras', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'es', altura: 'L - 2 * e' }, comprimento: 'A - ef - et' }, { origem: ['0', '0', 'ef'] });
const septoRetangular = corpoCaixa('septo', 'Septo entre câmaras', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'es', altura: 'P - 2 * e' }, comprimento: 'A - ef - et' }, { origem: ['0', '0', 'ef'] });

/** Câmaras (1 ou 2) e espessura do septo: o septo aparece só com 2 câmaras (a passagem baixa do septo não é modelada). CONFERIR. */
const parametrosCamaras = () => [inteiro('camaras', 'Número de câmaras', 2, 1, 2, 'tipo'), parametroNumero('es', 'Espessura do septo', 60, 20, 200, 'tipo')];

export const FAMILIA_FOSSA_CILINDRICA: Familia = familiaFossa({
  id: 'fam_fossa_septica_cilindrica',
  nome: 'Fossa séptica cilíndrica',
  descricao:
    'Fossa séptica cilíndrica de concreto, uma ou duas câmaras (septo), entrada e saída laterais, tampa. Volume exigido por 1000 + N·(C·T + K·Lf) com todos os valores editáveis (CONFERIR: NBR 7229, norma vigente); não afirma atender à norma.',
  parametros: [...parametrosConstrucao(), ...parametrosCamaras(), ...parametrosNorma('fossa'), derivado('hUtil', 'Altura útil (mm)', UTIL), derivado('volumeUtil', 'Volume útil geométrico (litros)', VOLUME_CILINDRICA)],
  tipos: tiposCilindrica(),
  tipoPadrao: 'n5',
  corpos: [...corposCilindro(), { ...septoCilindro, quando: 'camaras > 1' }],
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('circulo')],
  verificacoes: verificacoesFossa([verificacaoVolume()]),
  tabelas: tabelaFossa({ titulo: 'Volume útil', valor: 'volumeUtil', unidade: 'L' }),
});

export const FAMILIA_FOSSA_RETANGULAR: Familia = familiaFossa({
  id: 'fam_fossa_septica_retangular',
  nome: 'Fossa séptica retangular',
  descricao:
    'Fossa séptica prismática retangular, uma ou duas câmaras (septo), entrada e saída laterais, tampa. Volume exigido por 1000 + N·(C·T + K·Lf) com valores editáveis (CONFERIR: NBR 7229, norma vigente); não afirma atender à norma.',
  parametros: [...parametrosConstrucao(), ...parametrosCamaras(), ...parametrosNorma('fossa'), derivado('hUtil', 'Altura útil (mm)', UTIL), derivado('volumeUtil', 'Volume útil geométrico (litros)', VOLUME_RETANGULAR)],
  tipos: tiposRetangular(),
  tipoPadrao: 'n5',
  corpos: [...paredeRetangular(), { ...septoRetangular, quando: 'camaras > 1' }],
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('quadrado')],
  verificacoes: verificacoesFossa([verificacaoVolume()]),
  tabelas: tabelaFossa({ titulo: 'Volume útil', valor: 'volumeUtil', unidade: 'L' }),
});

// Filtro anaeróbio: altura = fundo + espaço sob o fundo falso + leito + espaço livre + tampa. CONFERIR: NBR 13969 (norma vigente).
const H_SOB = 300;
const H_LEITO = 1200;
const E_FALSO = 50;
/** Volume útil do filtro (litros) = volume do leito filtrante: π/4 · (L − 2e)² · altura do leito. */
export const VOLUME_FILTRO = `${PI} / 4 * (L - 2 * e) * (L - 2 * e) * hLeito / 1000000`;

export function tiposFiltro(): Tipo[] {
  return ([[5, 100], [10, 100], [20, 100], [40, 150]] as const).map(([n, dn]) => {
    const di = Math.sqrt((4 * volumeExigidoFiltro(n) * 1e6) / (PI * H_LEITO));
    const d = acima(di + 2 * ESP.e);
    return tipoDe(`n${n}`, `${n} contribuintes`, valoresTipo(n, dn, { L: d, P: d, A: ESP.ef + H_SOB + H_LEITO + ESP.hLivre + ESP.et }));
  });
}

export const FAMILIA_FILTRO_ANAEROBIO: Familia = familiaFossa({
  id: 'fam_filtro_anaerobio',
  nome: 'Filtro anaeróbio',
  descricao:
    'Filtro anaeróbio cilíndrico com fundo falso e leito filtrante; entrada e saída laterais. Volume exigido = fator · N · C · T com valores editáveis (CONFERIR: NBR 13969, norma vigente); não afirma atender à norma.',
  parametros: [
    ...parametrosConstrucao(),
    parametroNumero('hSob', 'Espaço sob o fundo falso', H_SOB, 100, 1000, 'tipo'),
    parametroNumero('hLeito', 'Altura do leito filtrante', H_LEITO, 300, 2000, 'tipo'),
    parametroNumero('eFalso', 'Espessura do fundo falso', E_FALSO, 20, 200, 'tipo'),
    ...parametrosNorma('filtro'),
    derivado('volumeUtil', 'Volume útil do leito (litros)', VOLUME_FILTRO),
  ],
  tipos: tiposFiltro(),
  tipoPadrao: 'n5',
  corpos: [
    ...corposCilindro(),
    corpoCaixa('fundoFalso', 'Fundo falso', 'generico', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L - 2 * e' }, comprimento: 'eFalso' }, { origem: ['0', '0', 'ef + hSob - eFalso'] }),
    corpoCaixa('leito', 'Leito filtrante (brita)', 'generico', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L - 2 * e' }, comprimento: 'hLeito' }, { origem: ['0', '0', 'ef + hSob'] }),
  ],
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('circulo')],
  verificacoes: verificacoesFossa([
    verificacaoVolume(),
    { id: 'leitoNaoCabe', severidade: 'erro', condicao: 'ef + hSob + hLeito + et > A', mensagem: 'Leito de {hLeito} mm não cabe na altura de {A} mm' },
  ]),
  tabelas: tabelaFossa({ titulo: 'Volume útil', valor: 'volumeUtil', unidade: 'L' }),
});
