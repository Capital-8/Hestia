import type { CategoriaFamilia, Familia, Parametro, Peca, Tipo, Valor } from '../tipos.ts';
import type { ClasseIfc } from '../tiposRepresentacao.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import { comprimento, nova } from './novosApoio.ts';

/*
 * Apoio da estrutura metálica (ficha F7, ADR 0061): perfis laminados, tubos, chapa de base e parafuso. Todas as medidas de
 * catálogo são GENÉRICAS e editáveis (marcadas CONFERIR): não copiam tabela de fabricante nem norma. Em mm; o resolvedor
 * devolve metros.
 * Parâmetros L, A e P são obrigatórios de escopo instância (comprimento; nunca fórmula). Os demais (espessuras, furos,
 * cabeça) são de escopo tipo, com o valor de cada série.
 */

export const SISTEMA_ESTRUTURAL = 'Estrutura metálica';

/** Uma série comercial: id do tipo, rótulo e valores (mm). */
export interface SerieEstrutural {
  id: string;
  nome: string;
  valores: Record<string, Valor>;
}

export function tiposDaSerie(series: readonly SerieEstrutural[], extras: Record<string, Valor> = {}): Tipo[] {
  return series.map((s) => ({ id: s.id, nome: s.nome, valores: { ...extras, ...s.valores } }));
}

/** Dimensão de caixa do perfil (L, A ou P): comprimento de INSTÂNCIA, obrigatório (nunca fórmula). */
export function dimensaoPerfil(id: 'L' | 'A' | 'P', nome: string): Parametro {
  return comprimento(id, nome, id === 'L' ? 1000 : 100, 1, 12000, 1);
}

/** Medida de seção de tipo (espessura, cabeça, furo): escopo `tipo`, valor da série. */
export function medidaDeTipo(id: string, nome: string, padrao: number, grupo = 'Seção'): Parametro {
  return { id, nome, tipo: 'comprimento', escopo: 'tipo', padrao, min: 0.5, max: 500, passo: 0.5, grupo };
}

/** Ligação estrutural redonda (diâmetro em mm). */
export function ligacaoRedonda(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string): Ligacao {
  return { id, nome, dominio: 'estrutural', sistema: SISTEMA_ESTRUTURAL, secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos' };
}

/** Ligação estrutural retangular (largura e altura do perfil, mm). */
export function ligacaoRetangular(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, largura: string, altura: string): Ligacao {
  return { id, nome, dominio: 'estrutural', sistema: SISTEMA_ESTRUTURAL, secao: 'retangular', posicao, direcao, largura, altura, fluxo: 'ambos' };
}

/** Corpo estrutural com quadro na origem dada. */
export function corpoEstrutural(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, origem: Ponto3 = ['0', '0', '0']): Corpo {
  const quadro: QuadroCorpo = { origem };
  return { id, nome, papel, forma, quadro };
}

export interface DadosEstrutural {
  id: string;
  nome: string;
  categoria: CategoriaFamilia;
  descricao: string;
  parametros: Parametro[];
  corpos?: Corpo[];
  pecas?: Peca[];
  ligacoes: Ligacao[];
  tipos: Tipo[];
  tipoPadrao: string;
  ifc?: { classe: ClasseIfc };
}

/** Família estrutural: disciplina `estrutura`, sem conectores de móvel. A classe IFC vem da categoria, salvo `ifc`. */
export function familiaEstrutural(d: DadosEstrutural): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: 'estrutura',
    descricao: d.descricao,
    parametros: d.parametros,
    pecas: d.pecas ?? [],
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
  return { ...base, corpos: d.corpos ?? [], ligacoes: d.ligacoes, ...(d.ifc ? { ifc: d.ifc } : {}) };
}
