import type { Familia, Parametro, Peca, Tipo } from '../tipos.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import type { DominioLigacao, FluxoLigacao, Ligacao } from '../tiposLigacao.ts';
import type { ClasseIfc, Simbolo2D, Verificacao } from '../tiposRepresentacao.ts';
import { nova } from './novosApoio.ts';

/*
 * Apoio do HVAC (ficha F8, ADR 0061): construtor próprio para dutos, terminais e o split. As medidas são em mm; L, A e P são as
 * dimensões obrigatórias de instância (a validação exige as três). Em peças redondas, a seção usa só L (o diâmetro): A repete
 * L e uma verificação de erro impede valores diferentes. Chapas e espessuras são valores TÍPICOS, não confirmados em norma:
 * cada tabela tem o comentário CONFERIR.
 */

/** Material da chapa de duto, aro e grelha (metal do projeto). CONFERIR: acabamento de catálogo. */
export const MATERIAL_CHAPA = 'mat_metal';
/** Material da unidade interna do split (branco de eletrodoméstico). CONFERIR. */
export const MATERIAL_SPLIT = 'mat_eletro';

/** Espessura `e` (mm) da chapa ou do aro, comprimento de instância. CONFERIR: espessura de chapa por bitola. */
export function parametroEspessura(padrao: number, min = 0.5, max = 30): Parametro {
  return { id: 'e', nome: 'Espessura da chapa', tipo: 'comprimento', escopo: 'instancia', padrao, min, max, passo: 0.1, grupo: 'Dimensões' };
}

/** Capacidade térmica (BTU/h) do split: escolhida no tipo. CONFERIR: série do fabricante. */
export function parametroCapacidade(padrao: number): Parametro {
  return { id: 'capacidade', nome: 'Capacidade (BTU/h)', tipo: 'numero', escopo: 'tipo', padrao, min: 5000, max: 60000, passo: 1000, grupo: 'Desempenho' };
}

/** Ligação retangular de ar (largura e altura em mm, fórmulas ou números). */
export function ligacaoAr(id: string, nome: string, dominio: DominioLigacao, fluxo: FluxoLigacao, posicao: Ponto3, direcao: Ponto3, largura: string, altura: string): Ligacao {
  return { id, nome, dominio, secao: 'retangular', posicao, direcao, largura, altura, fluxo };
}

/** Ligação redonda de ar (diâmetro em mm). */
export function ligacaoArRedonda(id: string, nome: string, dominio: DominioLigacao, fluxo: FluxoLigacao, posicao: Ponto3, direcao: Ponto3, diametro: string): Ligacao {
  return { id, nome, dominio, secao: 'redonda', posicao, direcao, diametro, fluxo };
}

/** Ligação de tubo frigorífico (linha de líquido ou de gás), redonda, fluxo nos dois sentidos. */
export function ligacaoRefrigerante(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string): Ligacao {
  return { id, nome, dominio: 'refrigerante', secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos' };
}

/** Corpo de HVAC com o material do projeto (chapa, por padrão). */
export function corpoHvac(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, quadro: QuadroCorpo, material = MATERIAL_CHAPA): Corpo {
  return { id, nome, papel, forma, quadro, material };
}

/** Quadrilátero fechado de planta, dos cantos (x0, y0) a (x1, y1). */
export function retanguloPlanta(x0: string, y0: string, x1: string, y1: string): Simbolo2D['primitivos'][number] {
  return { tipo: 'polilinha', pontos: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fechada: true };
}

export interface DadosHvac {
  id: string;
  nome: string;
  categoria: 'duto' | 'terminal_ar' | 'equipamento';
  descricao: string;
  hospedagem?: 'nivel' | 'parede';
  parametros: Parametro[];
  corpos?: Corpo[];
  pecas?: Peca[];
  ligacoes: Ligacao[];
  simbolos?: Simbolo2D[];
  verificacoes?: Verificacao[];
  tipos: Tipo[];
  tipoPadrao: string;
  ifc?: ClasseIfc;
}

/** Família de HVAC: disciplina `hvac`, sem conectores de móvel. Campos opcionais só entram quando preenchidos. */
export function familiaHvac(d: DadosHvac): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: 'hvac',
    descricao: d.descricao,
    hospedagem: d.hospedagem,
    parametros: d.parametros,
    pecas: d.pecas ?? [],
    conectores: [],
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
  return {
    ...base,
    ligacoes: d.ligacoes,
    ...(d.corpos ? { corpos: d.corpos } : {}),
    ...(d.simbolos ? { simbolos: d.simbolos } : {}),
    ...(d.verificacoes ? { verificacoes: d.verificacoes } : {}),
    ...(d.ifc ? { ifc: { classe: d.ifc } } : {}),
  };
}
