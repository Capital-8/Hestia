import type { Familia, Parametro, Tipo } from '../tipos.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import type { FluxoLigacao, Ligacao } from '../tiposLigacao.ts';
import type { Primitivo2D, Simbolo2D, TabelaFamilia, Verificacao } from '../tiposRepresentacao.ts';
import { derivado, enumerado, nova } from './novosApoio.ts';
import { buscaDn, DNS_ESGOTO, dimensao, MATERIAL_ESGOTO, parametroDe, parametroDn, SISTEMA_ESGOTO } from './tuboEsgotoApoio.ts';

/*
 * Apoio das caixas e ralos hidrossanitários (ficha F3, ADR 0061). Dimensões em mm; o volume útil sai em litros (milímetros cúbicos divididos por 10^6).
 * Todas as dimensões de catálogo são RAZOÁVEIS, não confirmadas em norma nem em fabricante: cada tabela tem CONFERIR.
 * Eixos da família: X largura (L), Y profundidade (P), Z altura (A), com o fundo em z = 0.
 * Decisão D9: a parede é corpo; a entrada e a saída são só ligações (sem subtração de furo). Sem corpo fantasma.
 */

type Tabela = ReadonlyArray<readonly [number, number]>;

// CONFERIR: dimensão interna nominal (mm) das caixas, por DN.
export const TABELA_DI_CAIXA: Tabela = [[40, 300], [50, 300], [75, 400], [100, 400], [150, 600]];
// CONFERIR: espessura de parede (mm) das caixas, por DN.
export const TABELA_E_CAIXA: Tabela = [[40, 50], [50, 50], [75, 60], [100, 60], [150, 75]];
// CONFERIR: diâmetro externo (mm) do ralo, por DN.
export const TABELA_DIAM_RALO: Tabela = [[40, 100], [50, 100], [75, 150], [100, 150]];
// CONFERIR: espessura de parede (mm) do ralo, por DN.
export const TABELA_E_RALO: Tabela = [[40, 3], [50, 3], [75, 4], [100, 4]];

/** DNs dos ralos (grelha pequena): 40 a 100. */
export const DNS_RALO = [40, 50, 75, 100] as const;
/** Altura padrão da caixa (profundidade total, mm). CONFERIR. */
export const ALTURA_CAIXA = 600;
/** Altura padrão do ralo (mm). CONFERIR. */
export const ALTURA_RALO = 300;
/** Material das caixas e ralos: o mesmo PVC do esgoto (ficha F1). CONFERIR: caixas de concreto ficam para outra ficha. */
export const MATERIAL_CAIXA = MATERIAL_ESGOTO;

const valorDn = (tabela: Tabela, dn: number): number => tabela.find(([d]) => d === dn)?.[1] ?? 0;

/** Parâmetro numérico (tipo `numero`) com mínimo, máximo e passo de 10 mm. */
export function parametroNumero(id: string, nome: string, padrao: number, min: number, max: number, escopo: 'tipo' | 'instancia', grupo = 'Construção'): Parametro {
  return { id, nome, tipo: 'numero', escopo, padrao, min, max, passo: 10, grupo };
}

/** DN dos ralos: enum de 40 a 100 (o padrão do tubo de esgoto vai até 150; o ralo não passa de 100). */
export function parametroDnRalo(): Parametro {
  return { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao: 50, grupo: 'Bitola', opcoes: DNS_RALO.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };
}

/** Parâmetros comuns das caixas: DN, dimensão interna e espessura por tabela, espessuras do fundo e da tampa, L, P, A, cotas e face. */
export function parametrosCaixa(): Parametro[] {
  return [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    derivado('Di', 'Dimensão interna nominal', buscaDn('DN', TABELA_DI_CAIXA)),
    derivado('e', 'Espessura da parede', buscaDn('DN', TABELA_E_CAIXA)),
    parametroNumero('ef', 'Espessura do fundo', 100, 50, 400, 'tipo'),
    parametroNumero('et', 'Espessura da tampa', 50, 20, 200, 'tipo'),
    dimensao('L', 'Largura'),
    dimensao('P', 'Profundidade'),
    dimensao('A', 'Altura (profundidade total)'),
    parametroNumero('cotaEntrada', 'Cota de fundo da entrada', 300, 0, 6000, 'instancia', 'Tubulações'),
    parametroNumero('cotaSaida', 'Cota de fundo da saída', 250, 0, 6000, 'instancia', 'Tubulações'),
    enumerado('faceEntrada', 'Face da entrada', 'esquerda', [['esquerda', 'Esquerda (−X)'], ['direita', 'Direita (+X)']], 'instancia'),
  ];
}

/** Parâmetros comuns dos ralos: DN do ralo, espessura, espessura da grelha, L (diâmetro), P e A. */
export function parametrosRalo(): Parametro[] {
  return [
    parametroDnRalo(),
    derivado('e', 'Espessura da parede', buscaDn('DN', TABELA_E_RALO)),
    parametroNumero('et', 'Espessura da grelha', 10, 5, 50, 'tipo'),
    dimensao('L', 'Diâmetro do ralo'),
    dimensao('P', 'Profundidade'),
    dimensao('A', 'Altura'),
  ];
}

/** Parâmetros do sifão curvo do ralo sifonado: diâmetro externo do tubo e as cotas da curva de 90° (raio De, trechos 2 De e 3 De). */
export function parametrosSifao(): Parametro[] {
  return [parametroDe('DN', 'De', 'Diâmetro externo do sifão'), derivado('Rc', 'Raio da curva do sifão', 'De'), derivado('Hc', 'Trecho vertical do sifão', 'De * 2'), derivado('Lc', 'Trecho horizontal do sifão', 'De * 3')];
}

/** Tipos das caixas: um por DN, com a dimensão interna + 2 espessuras de parede como L e P (caixa quadrada ou circular). */
export function tiposCaixa(): Tipo[] {
  return DNS_ESGOTO.map((dn) => {
    const lado = valorDn(TABELA_DI_CAIXA, dn) + 2 * valorDn(TABELA_E_CAIXA, dn);
    return { id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, L: lado, P: lado, A: ALTURA_CAIXA } };
  });
}

/** Tipos dos ralos: um por DN, com o diâmetro do ralo como L e P. */
export function tiposRalo(): Tipo[] {
  return DNS_RALO.map((dn) => {
    const diametro = valorDn(TABELA_DIAM_RALO, dn);
    return { id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, L: diametro, P: diametro, A: ALTURA_RALO } };
  });
}

/** Corpo de caixa de PVC com o material do projeto. */
export function corpoCaixa(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, quadro: QuadroCorpo): Corpo {
  return { id, nome, papel, forma, quadro, material: MATERIAL_CAIXA };
}

/** Parede, fundo e tampa de uma caixa retangular (parede de anel retangular, fundo e tampa maciços). */
export function paredeRetangular(): Corpo[] {
  return [
    corpoCaixa('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'P', espessura: 'e' }, comprimento: 'A - ef' }, { origem: ['0', '0', 'ef'] }),
    corpoCaixa('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'P' }, comprimento: 'ef' }, { origem: ['0', '0', '0'] }),
    corpoCaixa('tampa', 'Tampa', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L - 2 * e', altura: 'P - 2 * e' }, comprimento: 'et' }, { origem: ['0', '0', 'A - et'] }),
  ];
}

/** Parede, fundo e tampa de uma caixa circular (L é o diâmetro externo). */
export function paredeCircular(): Corpo[] {
  return [
    corpoCaixa('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, comprimento: 'A - ef' }, { origem: ['0', '0', 'ef'] }),
    corpoCaixa('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L' }, comprimento: 'ef' }, { origem: ['0', '0', '0'] }),
    corpoCaixa('tampa', 'Tampa', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L - 2 * e' }, comprimento: 'et' }, { origem: ['0', '0', 'A - et'] }),
  ];
}

/** Ligação de esgoto da caixa (redonda, DN do tipo, sai para fora). */
export function ligacaoCaixa(id: string, nome: string, fluxo: FluxoLigacao, posicao: Ponto3, direcao: Ponto3): Ligacao {
  return { id, nome, dominio: 'esgoto', sistema: SISTEMA_ESGOTO, secao: 'redonda', posicao, direcao, diametro: 'DN', fluxo };
}

/** Entrada e saída nas faces laterais (X): a entrada na face escolhida, a saída na oposta. Cota = fundo + DN / 2. */
export function ligacoesLaterais(): Ligacao[] {
  // Texto em fórmula vai entre aspas duplas (gramática da família, CONTRATO §4).
  const xEntrada = 'faceEntrada == "direita" ? L / 2 : 0 - L / 2';
  const xSaida = 'faceEntrada == "direita" ? 0 - L / 2 : L / 2';
  return [
    ligacaoCaixa('entrada', 'Entrada', 'entrada', [xEntrada, '0', 'cotaEntrada + DN / 2'], ['faceEntrada == "direita" ? 1 : -1', '0', '0']),
    ligacaoCaixa('saida', 'Saída', 'saida', [xSaida, '0', 'cotaSaida + DN / 2'], ['faceEntrada == "direita" ? -1 : 1', '0', '0']),
  ];
}

/** Símbolo de planta (substitui a projeção): quadrado ou círculo, com as diagonais. CONFERIR: convenção do desenho. */
export function simboloPlanta(forma: 'quadrado' | 'circulo'): Simbolo2D {
  const diagonais: Primitivo2D[] =
    forma === 'quadrado'
      ? [
          { tipo: 'linha', de: ['0 - L / 2', '0 - P / 2'], ate: ['L / 2', 'P / 2'] },
          { tipo: 'linha', de: ['L / 2', '0 - P / 2'], ate: ['0 - L / 2', 'P / 2'] },
        ]
      : [
          { tipo: 'linha', de: ['0 - L / 2 * 0.7071', '0 - L / 2 * 0.7071'], ate: ['L / 2 * 0.7071', 'L / 2 * 0.7071'] },
          { tipo: 'linha', de: ['L / 2 * 0.7071', '0 - L / 2 * 0.7071'], ate: ['0 - L / 2 * 0.7071', 'L / 2 * 0.7071'] },
        ];
  const contorno: Primitivo2D =
    forma === 'quadrado'
      ? { tipo: 'polilinha', pontos: [['0 - L / 2', '0 - P / 2'], ['L / 2', '0 - P / 2'], ['L / 2', 'P / 2'], ['0 - L / 2', 'P / 2']], fechada: true }
      : { tipo: 'circulo', centro: ['0', '0'], raio: 'L / 2' };
  return { id: 'planta', nome: 'Planta da caixa', vistas: ['planta'], plano: 'xy', substituiGeometria: true, primitivos: [contorno, ...diagonais] };
}

/** Tabela de dimensões por tipo (dimensão interna, largura e altura). */
export const TABELAS_CAIXA: TabelaFamilia[] = [
  {
    id: 'dimensoes',
    nome: 'Dimensões',
    porTipo: true,
    colunas: [
      { titulo: 'Dimensão interna', valor: 'Di', unidade: 'mm' },
      { titulo: 'Largura', valor: 'L', unidade: 'mm' },
      { titulo: 'Altura', valor: 'A', unidade: 'mm' },
    ],
  },
];

/** Verificações comuns às caixas: profundidade mínima, DN que cabe na parede e entrada abaixo da tampa, mais as da família. */
export function verificacoesCaixa(extra: Verificacao[] = []): Verificacao[] {
  return [
    { id: 'profundidadeMinima', severidade: 'aviso', condicao: 'A < 600', mensagem: 'Profundidade de {A} mm abaixo de 600 mm (CONFERIR)' },
    { id: 'diametroCabe', severidade: 'erro', condicao: 'DN > L - 2 * e', mensagem: 'Tubulação DN {DN} não cabe na largura interna da caixa' },
    { id: 'entradaAcimaDaTampa', severidade: 'erro', condicao: 'cotaEntrada + DN / 2 > A - et', mensagem: 'Entrada com cota de {cotaEntrada} mm fica acima da tampa' },
    ...extra,
  ];
}

export interface DadosCaixa {
  id: string;
  nome: string;
  descricao: string;
  parametros: Parametro[];
  tipos: Tipo[];
  tipoPadrao: string;
  corpos: Corpo[];
  ligacoes: Ligacao[];
  simbolos: Simbolo2D[];
  verificacoes: Verificacao[];
  tabelas?: TabelaFamilia[];
}

/** Família de caixa ou ralo: categoria `reservatorio`, disciplina hidrossanitária, IFC `IFCTANK`, sem peças de marcenaria. */
export function familiaCaixa(d: DadosCaixa): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: 'reservatorio',
    disciplina: 'hidrossanitario',
    descricao: d.descricao,
    parametros: d.parametros,
    pecas: [],
    conectores: [],
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
  return {
    ...base,
    corpos: d.corpos,
    ligacoes: d.ligacoes,
    simbolos: d.simbolos,
    verificacoes: d.verificacoes,
    ...(d.tabelas ? { tabelas: d.tabelas } : {}),
    ifc: { classe: 'IFCTANK' },
  };
}
