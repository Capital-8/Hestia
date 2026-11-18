import {
  aplicarFuracao,
  gerarCavilhas,
  type LinhaLista,
  type PecaResolvida,
  type PlanoCorte,
  type VeioNaLista,
} from '@hestia/engine';
import { chapaPorId, defaultUnits, formatQuantity, type Catalogo, type Chapa, type Valor } from '@hestia/model';

/*
 * Apoio puro do diálogo "Lista de peças": peças efetivas (com ou sem as cavilhas automáticas), recorte por chapa,
 * geometria pronta para o SVG e nomes de arquivo. Tudo o que é número fica em milímetros, como a lista do marceneiro.
 */

const UNIDADES = defaultUnits();

/** Peças da lista com a furação automática de cavilhas quando a opção está ligada. */
export function pecasEfetivas(pecas: readonly PecaResolvida[], cavilhas: boolean): readonly PecaResolvida[] {
  return cavilhas ? aplicarFuracao(pecas, gerarCavilhas(pecas)) : pecas;
}

/** Linhas da lista que usam a chapa informada, na ordem original. */
export function linhasDaChapa(linhas: readonly LinhaLista[], chapaId: string): LinhaLista[] {
  return linhas.filter((linha) => linha.chapa === chapaId);
}

/** Chapas do catálogo cujo id aparece em alguma linha, na ordem do catálogo. */
export function chapasPresentes(linhas: readonly LinhaLista[], catalogo: Catalogo): Chapa[] {
  const usadas = new Set<string>();
  for (const linha of linhas) {
    if (linha.chapa !== null) usadas.add(linha.chapa);
  }
  const resultado: Chapa[] = [];
  for (const chapa of catalogo.chapas) {
    if (!usadas.has(chapa.id)) continue;
    const doCatalogo = chapaPorId(catalogo, chapa.id);
    if (doCatalogo !== undefined) resultado.push(doCatalogo);
  }
  return resultado;
}

/** Retângulo no sistema do SVG (Y para baixo), em milímetros. */
export interface RetanguloSvg {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Peça posicionada em uma chapa, pronta para o SVG. */
export interface PecaSvg extends RetanguloSvg {
  /** Índice na lista entregue a `planoDeCorte`. */
  peca: number;
  girada: boolean;
}

/** Uma chapa do plano com a área útil tracejada e as peças posicionadas. */
export interface ChapaSvg {
  largura: number;
  altura: number;
  util: RetanguloSvg;
  pecas: PecaSvg[];
  areaUsada: number;
}

/** Geometria do plano inteiro, em milímetros e no sistema do SVG. */
export interface GeometriaDoPlano {
  chapas: ChapaSvg[];
  aproveitamento: number;
  naoCouberam: number[];
}

/** Converte as posições do plano (origem embaixo, Y para cima) para retângulos do SVG (origem em cima, Y para baixo). */
export function geometriaDaChapa(plano: PlanoCorte, chapa: Chapa): GeometriaDoPlano {
  return {
    chapas: plano.chapas.map((cortada) => ({
      largura: chapa.largura,
      altura: chapa.altura,
      util: {
        x: chapa.refilo,
        y: chapa.refilo,
        w: chapa.largura - 2 * chapa.refilo,
        h: chapa.altura - 2 * chapa.refilo,
      },
      pecas: cortada.posicoes.map((posicao) => ({
        peca: posicao.peca,
        x: posicao.x,
        y: chapa.altura - posicao.y - posicao.h,
        w: posicao.w,
        h: posicao.h,
        girada: posicao.girada,
      })),
      areaUsada: cortada.areaUsada,
    })),
    aproveitamento: plano.aproveitamento,
    naoCouberam: [...plano.naoCouberam],
  };
}

/** Deixa só `[a-z0-9_-]`, sem acentos, espaços nem barras. */
function limparNome(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Nome de arquivo `<família>-<tipo>.<ext>`, só com `[a-z0-9_-]` nas partes. */
export function nomeDoArquivo(familiaId: string, tipoId: string, ext: string): string {
  const familia = limparNome(familiaId) || 'familia';
  const tipo = limparNome(tipoId) || 'tipo';
  const extensao = limparNome(ext) || 'arquivo';
  return `${familia}-${tipo}.${extensao}`;
}

/** Medida em milímetros, sem unidade, até 3 casas e vírgula decimal. */
export function textoMm(valorMm: number): string {
  return formatQuantity(UNIDADES, 'smallLength', valorMm / 1000, {
    unit: 'mm',
    decimals: 3,
    trim: true,
    withUnit: false,
  });
}

/** Área em metros quadrados, com 4 casas por padrão. */
export function textoArea(areaM2: number, casas = 4): string {
  return formatQuantity(UNIDADES, 'area', areaM2, { decimals: casas });
}

/** Comprimento em metros, com 2 casas. */
export function textoMetros(metros: number): string {
  return formatQuantity(UNIDADES, 'length', metros, { decimals: 2 });
}

/** Valor em reais, com 2 casas. */
export function textoMoeda(reais: number): string {
  return formatQuantity(UNIDADES, 'currency', reais, { decimals: 2 });
}

/** Fração (0..1) em porcentagem, com 1 casa. */
export function textoPercentual(fracao: number): string {
  return formatQuantity(UNIDADES, 'slope', fracao, { decimals: 1 });
}

/** Símbolo do veio na tabela: ↔ comprimento, ↕ largura, ◌ livre e vazio quando não há veio. */
export function simboloVeio(veio: VeioNaLista): string {
  if (veio === 'comprimento') return '↔';
  if (veio === 'largura') return '↕';
  if (veio === 'livre') return '◌';
  return '';
}

/** `L × A × P` do env (mm), com `—` para valor ausente. */
export function textoDimensoesEnv(env: Readonly<Record<string, Valor>>): string {
  const medida = (id: string): string => {
    const valor = env[id];
    return typeof valor === 'number' && Number.isFinite(valor) ? textoMm(valor) : '—';
  };
  return `${medida('L')} × ${medida('A')} × ${medida('P')}`;
}
