import {
  criarFamiliaCaixaria,
  criarLigacaoPadrao,
  DISCIPLINA_DA_CATEGORIA,
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  type CategoriaFamilia,
  type Corpo,
  type Familia,
  type Ligacao,
  type Parametro,
  type Simbolo2D,
  type Tipo,
  type Valor,
} from '@hestia/model';
import type { PT_MODELOS } from '../../editor/i18n/areas/familiasModelos.ts';

/*
 * Modelos-base (ficha G1): famílias vazias já com os campos certos (L, A e P de instância, corpos e ligações) para o usuário
 * partir delas. Cada um vira uma cópia na galeria "Novo módulo", como qualquer família da biblioteca. Medidas em mm e graus.
 * Os nomes e as descrições vêm do dicionário (`familiasModelos.ts`); os nomes dos parâmetros ficam em português, como nas
 * famílias de tubulação da biblioteca.
 */

/** Chaves de texto dos modelos (`modelo_*`). */
export type ChaveModelo = keyof typeof PT_MODELOS;
/** Tradução de uma chave para o idioma ativo (o `t` do editor serve). */
export type Traduzir = (chave: ChaveModelo) => string;

/** Diâmetros nominais do modelo de tubo e da curva (mm). */
export const DNS_MODELO = [20, 25, 32, 40, 50, 75, 100] as const;

/** Comprimento de instância (escopo `instancia`, tipo `comprimento`): obrigatório para L, A e P. */
function comprimento(id: string, nome: string, padrao: number, min: number, max: number, passo = 10): Parametro {
  return { id, nome, tipo: 'comprimento', escopo: 'instancia', padrao, min, max, passo, grupo: 'Dimensões' };
}

/** Parâmetros L, A e P (comprimento, altura e profundidade) com os padrões dados. */
function medidas(l: number, a: number, p: number, maxAP = 3000): Parametro[] {
  return [
    comprimento('L', 'Comprimento', l, 1, 6000),
    comprimento('A', 'Altura', a, 1, maxAP),
    comprimento('P', 'Profundidade', p, 1, maxAP),
  ];
}

/** Um único tipo com os valores dados (o `padrao` dos parâmetros cobre o resto). */
function tipoUnico(valores: Record<string, Valor>): Tipo[] {
  return [{ id: 'padrao', nome: 'Padrão', valores }];
}

/** Tipos por diâmetro nominal: `DN` e as medidas dependentes do DN (`extra`). */
function tiposPorDn(extra: (dn: number) => Record<string, Valor>): Tipo[] {
  return DNS_MODELO.map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, ...extra(dn) } }));
}

interface DadosModelo {
  id: string;
  categoria: CategoriaFamilia;
  nome: string;
  descricao: string;
  parametros: Parametro[];
  tipos: Tipo[];
  tipoPadrao: string;
  corpos: Corpo[];
  ligacoes?: Ligacao[];
  simbolos?: Simbolo2D[];
}

/** Família de modelo: cabeçalho fixo em mm, disciplina da categoria e sem peças de marcenaria nem conectores de móvel. */
function modelo(d: DadosModelo): Familia {
  return {
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: DISCIPLINA_DA_CATEGORIA[d.categoria],
    descricao: d.descricao,
    unidade: 'mm',
    hospedagem: 'nivel',
    origem: 'canto',
    parametros: d.parametros,
    planos: [],
    pecas: [],
    aninhados: [],
    ferragens: [],
    conectores: [],
    corpos: d.corpos,
    ligacoes: d.ligacoes ?? [],
    ...(d.simbolos ? { simbolos: d.simbolos } : {}),
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  };
}

/** Tubo reto: varredura circular de DN ao longo de L, com uma ligação em cada ponta. */
function tubo(t: Traduzir): Familia {
  const ligacao = (id: string, nome: string, posicao: [string, string, string], direcao: [string, string, string]): Ligacao => ({
    ...criarLigacaoPadrao('agua_fria', 'redonda', id),
    nome,
    diametro: 'DN',
    posicao,
    direcao,
  });
  return modelo({
    id: 'fam_modelo_tubo',
    categoria: 'tubulacao',
    nome: t('modelo_tubo_nome'),
    descricao: t('modelo_tubo_desc'),
    parametros: [
      { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao: 50, grupo: 'Bitola', opcoes: DNS_MODELO.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) },
      ...medidas(1000, 50, 50, 6000),
    ],
    tipos: tiposPorDn((dn) => ({ L: 1000, A: dn, P: dn })),
    tipoPadrao: 'dn50',
    corpos: [{
      id: 'tubo',
      nome: 'Tubo',
      papel: 'tubo',
      quadro: { origem: ['0', '0', '0'] },
      forma: { tipo: 'varredura', perfil: { tipo: 'circulo', diametro: 'DN' }, caminho: { pontos: [['0', '0', '0'], ['0', '0', 'L']] } },
    }],
    ligacoes: [ligacao('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1']), ligacao('b', 'Ponta B', ['0', '0', 'L'], ['0', '0', '1'])],
  });
}

/** Cotovelo de 90 graus: caminho de dois trechos de L com curva de raio R no vértice, e uma ligação em cada ponta. */
function curva(t: Traduzir): Familia {
  return modelo({
    id: 'fam_modelo_curva',
    categoria: 'conexao_tubo',
    nome: t('modelo_curva_nome'),
    descricao: t('modelo_curva_desc'),
    parametros: [
      { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao: 50, grupo: 'Bitola', opcoes: DNS_MODELO.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) },
      ...medidas(200, 50, 50, 1000),
      comprimento('R', 'Raio da curva', 100, 1, 1000),
    ],
    tipos: tiposPorDn((dn) => ({ L: 200, A: dn, P: dn, R: 100 })),
    tipoPadrao: 'dn50',
    corpos: [{
      id: 'curva',
      nome: 'Curva',
      papel: 'conexao',
      quadro: { origem: ['0', '0', '0'] },
      forma: {
        tipo: 'varredura',
        perfil: { tipo: 'circulo', diametro: 'DN' },
        caminho: { pontos: [['0', '0', '0'], ['L', '0', '0'], ['L', 'L', '0']], raios: ['R'] },
      },
    }],
    ligacoes: [
      { ...criarLigacaoPadrao('agua_fria', 'redonda', 'a'), nome: 'Ponta A', diametro: 'DN', posicao: ['0', '0', '0'], direcao: ['-1', '0', '0'] },
      { ...criarLigacaoPadrao('agua_fria', 'redonda', 'b'), nome: 'Ponta B', diametro: 'DN', posicao: ['L', 'L', '0'], direcao: ['0', '1', '0'] },
    ],
  });
}

/** Caixa com paredes de espessura E (perfil oco) e tampa de E sobre a altura A. */
function caixa(t: Traduzir): Familia {
  return modelo({
    id: 'fam_modelo_caixa',
    categoria: 'reservatorio',
    nome: t('modelo_caixa_nome'),
    descricao: t('modelo_caixa_desc'),
    parametros: [...medidas(600, 400, 400), comprimento('E', 'Espessura da parede', 10, 2, 50, 1)],
    tipos: tipoUnico({ L: 600, A: 400, P: 400 }),
    tipoPadrao: 'padrao',
    corpos: [
      {
        id: 'paredes',
        nome: 'Paredes',
        papel: 'corpo',
        quadro: { origem: ['0', '0', '0'] },
        forma: { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'P', espessura: 'E' }, comprimento: 'A' },
      },
      {
        id: 'tampa',
        nome: 'Tampa',
        papel: 'tampa',
        quadro: { origem: ['0', '0', 'A'] },
        forma: { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'P' }, comprimento: 'E' },
      },
    ],
  });
}

/** Luminária: corpo retangular de altura A, símbolo circular em planta e ligação elétrica no topo. */
function luminaria(t: Traduzir): Familia {
  return modelo({
    id: 'fam_modelo_luminaria',
    categoria: 'luminaria',
    nome: t('modelo_luminaria_nome'),
    descricao: t('modelo_luminaria_desc'),
    parametros: medidas(600, 50, 600, 1000),
    tipos: tipoUnico({ L: 600, A: 50, P: 600 }),
    tipoPadrao: 'padrao',
    corpos: [{
      id: 'corpo',
      nome: 'Corpo',
      papel: 'corpo',
      quadro: { origem: ['0', '0', '0'] },
      forma: { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'P' }, comprimento: 'A' },
    }],
    simbolos: [{
      id: 'planta',
      nome: 'Símbolo em planta',
      vistas: ['planta'],
      plano: 'xy',
      primitivos: [{ tipo: 'circulo', centro: ['L / 2', 'P / 2'], raio: 'L / 4' }],
    }],
    ligacoes: [{
      ...criarLigacaoPadrao('eletrica_forca', 'redonda', 'eletrica'),
      nome: 'Alimentação elétrica',
      diametro: '20',
      posicao: ['L / 2', 'P / 2', 'A'],
      direcao: ['0', '0', '1'],
      fluxo: 'entrada',
    }],
  });
}

/** Perfil I: extrusão do perfil I (altura A, largura P, alma tw, mesa tf) ao longo do comprimento L. */
function perfil(t: Traduzir): Familia {
  return modelo({
    id: 'fam_modelo_perfil',
    categoria: 'perfil_estrutural',
    nome: t('modelo_perfil_nome'),
    descricao: t('modelo_perfil_desc'),
    parametros: [...medidas(3000, 200, 100, 1000), comprimento('tw', 'Espessura da alma', 6, 2, 50, 1), comprimento('tf', 'Espessura da mesa', 9, 2, 50, 1)],
    tipos: tipoUnico({ L: 3000, A: 200, P: 100 }),
    tipoPadrao: 'padrao',
    corpos: [{
      id: 'perfil',
      nome: 'Perfil I',
      papel: 'perfil',
      quadro: { origem: ['0', '0', '0'] },
      forma: {
        tipo: 'extrusao',
        perfil: { tipo: 'perfilI', altura: 'A', largura: 'P', almaEsp: 'tw', mesaEsp: 'tf' },
        comprimento: 'L',
      },
    }],
  });
}

/** Equipamento sem detalhe: um sólido retangular de L × P × A. */
function equipamento(t: Traduzir): Familia {
  return modelo({
    id: 'fam_modelo_equipamento',
    categoria: 'equipamento',
    nome: t('modelo_equipamento_nome'),
    descricao: t('modelo_equipamento_desc'),
    parametros: medidas(800, 600, 500),
    tipos: tipoUnico({ L: 800, A: 600, P: 500 }),
    tipoPadrao: 'padrao',
    corpos: [{
      id: 'corpo',
      nome: 'Corpo',
      papel: 'corpo',
      quadro: { origem: ['0', '0', '0'] },
      forma: { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'P' }, comprimento: 'A' },
    }],
  });
}

/** Móvel: a caixaria paramétrica de sempre (`criarFamiliaCaixaria`), com a categoria de mobiliário. */
function movel(t: Traduzir): Familia {
  return {
    ...criarFamiliaCaixaria({ nome: t('modelo_movel_nome') }),
    id: 'fam_modelo_movel',
    categoria: 'mobiliario',
    disciplina: DISCIPLINA_DA_CATEGORIA.mobiliario,
    descricao: t('modelo_movel_desc'),
  };
}

/** Os sete modelos-base, na ordem da galeria. Cada chamada devolve objetos novos (nada é compartilhado entre cópias). */
export function modelosBase(t: Traduzir): Familia[] {
  return [tubo(t), curva(t), caixa(t), luminaria(t), perfil(t), equipamento(t), movel(t)];
}
