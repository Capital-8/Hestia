import type { ItemCatalogo } from '../catalogoMep.ts';
import { TIGRE_TIGREFLEX_AMARELO, TIGRE_TIGREFLEX_REFORCADO } from '../catalogosMep/tigreEletrica.ts';
import type { Familia } from '../tipos.ts';
import { comMaterial, ELETRICA, familiaKrona, oco } from './kronaEsgotoApoio.ts';
import { tuboCortado } from './kronaReceitas.ts';

/*
 * Eletroduto CORRUGADO Tigreflex (fase 4, ficha F2): o trecho flexível que a ferramenta Eletroduto usa no modo corrugado. Montado do
 * catálogo da Tigre já transcrito (`catalogosMep/tigreEletrica.ts`, itens `eletroduto_corrugado_amarelo` e `..._reforcado`, bitolas
 * 20, 25 e 32, colunas DE, Di e e; estado CONFERIR). Nenhuma medida é escrita aqui: o diâmetro externo, o interno e a espessura vêm
 * por `busca(DN, ...)` do catálogo, e a bitola sem as três cotas ficaria de fora (as três têm).
 *
 * É o 'conduit sem conexões' do Revit: corpo reto (extrusão circular oca), sem curva nem luva; as duas pontas são `flexivel: true`
 * (aceitam qualquer direção de chegada, sujeitas ao raio mínimo de curvatura do tipo de tubulação) e encaixe `ponta` que aceita
 * qualquer outra ponta ou caixa, como o tubo cortado. O raio mínimo NÃO consta do catálogo: vive em `tiposTubulacao.ts` (CONFERIR).
 * COR: o catálogo não traz a cor. Amarelo para o Tigreflex amarelo e laranja para o reforçado são aparência PROVISÓRIA (CONFERIR).
 */

export const FAMILIA_TIGREFLEX_AMARELO = 'fam_tigre_tigreflex_amarelo';
export const FAMILIA_TIGREFLEX_REFORCADO = 'fam_tigre_tigreflex_reforcado';

const IFC_TUBO = { classe: 'IFCCABLECARRIERSEGMENT', tipoPredefinido: 'CONDUITSEGMENT' } as const;

interface SpecTigreflex {
  id: string;
  nome: string;
  descricao: string;
  itemId: string;
  catalogo: typeof TIGRE_TIGREFLEX_AMARELO;
  material: string;
}

/** Item do catálogo Tigre com as colunas renomeadas para ids de parâmetro (DE → De; Di e e ficam). Linha sem as três cotas sai. */
function itemDoTigreflex(s: SpecTigreflex): ItemCatalogo {
  const it = s.catalogo.itens.find((i) => i.id === s.itemId);
  if (!it) throw new Error(`Catálogo da Tigre: item “${s.itemId}” não existe`);
  const renomear: Record<string, string> = { DE: 'De', Di: 'Di', e: 'e' };
  const colunas: Record<string, string> = {};
  for (const [col, alvo] of Object.entries(renomear)) colunas[alvo] = it.colunas[col] ?? col;
  const linhas = it.linhas
    .filter((l) => Object.keys(renomear).every((c) => typeof l.valores[c] === 'number'))
    .map((l) => ({ ...l, valores: Object.fromEntries(Object.entries(renomear).map(([c, alvo]) => [alvo, l.valores[c] as number])) }));
  return { ...it, id: s.id, nome: s.nome, colunas, linhas };
}

function montar(s: SpecTigreflex): Familia {
  const base = tuboCortado(ELETRICA);
  const familia = familiaKrona({
    id: s.id,
    nome: s.nome,
    categoria: 'tubulacao', // familiaKrona só aceita categorias de tubulação; a real é sobrescrita abaixo
    descricao: s.descricao,
    item: itemDoTigreflex(s),
    corpos: comMaterial([oco('tubo', 'Tubo', 'tubo', 'De', 'Di', 'L', ['0', '0', '0'])], s.material),
    ligacoes: base.ligacoes.map((l) => ({ ...l, flexivel: true })),
    ifc: IFC_TUBO,
    caixa: base.caixa,
    fonte: `catálogo da Tigre (${itemDoTigreflex(s).serie}, página ${itemDoTigreflex(s).pagina ?? '?'})`,
    disciplina: 'eletrico',
  });
  return { ...familia, categoria: 'eletroduto' };
}

const SPECS: SpecTigreflex[] = [
  {
    id: FAMILIA_TIGREFLEX_AMARELO,
    nome: 'Eletroduto corrugado Tigreflex amarelo (Tigre)',
    descricao: 'Trecho de eletroduto corrugado flexível, reto, sem conexões: muda de direção e de cota livremente, respeitando o raio mínimo de curvatura do tipo (CONFERIR). Comprimento L livre.',
    itemId: 'eletroduto_corrugado_amarelo',
    catalogo: TIGRE_TIGREFLEX_AMARELO,
    material: 'mat_pvc_amarelo',
  },
  {
    id: FAMILIA_TIGREFLEX_REFORCADO,
    nome: 'Eletroduto corrugado Tigreflex reforçado (Tigre)',
    descricao: 'Trecho de eletroduto corrugado flexível reforçado, reto, sem conexões: muda de direção e de cota livremente, respeitando o raio mínimo de curvatura do tipo (CONFERIR). Comprimento L livre.',
    itemId: 'eletroduto_corrugado_reforcado',
    catalogo: TIGRE_TIGREFLEX_REFORCADO,
    material: 'mat_pvc_laranja',
  },
];

/** Famílias do eletroduto corrugado Tigreflex (amarelo e reforçado), montadas do catálogo da Tigre. */
export const TIGREFLEX_ELETRICA_FAMILIAS: Familia[] = SPECS.map(montar);
