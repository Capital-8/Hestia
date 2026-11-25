import { juntarItens, type ItemCatalogo } from '../catalogoMep.ts';
import { KRONA_ELETRICA } from '../catalogosMep/kronaEletrica.ts';
import type { Familia, Parametro } from '../tipos.ts';
import type { Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { corpoEletrico } from './eletricaApoio.ts';
import { comMaterial, ELETRICA, familiaKrona } from './kronaEsgotoApoio.ts';
import { curva, luva, tubo, tuboCortado, type Receita } from './kronaReceitas.ts';

/*
 * Linha elétrica da Krona (PVC) montada DIRETO do catálogo (ficha C2), no padrão da água fria soldável. Cada família lê as cotas
 * por `busca(chave, ...)` do catálogo `catalogosMep/kronaEletrica.ts`. Bitola sem todas as cotas fica de fora.
 *
 * ESPESSURA (`e`): o catálogo NÃO traz a espessura da parede. O significado de D e d não está confirmado (ver README dos catálogos),
 * então não se deriva `e` deles. `e` é parâmetro de TIPO com valor fixo provisório (ESPESSURA_ELETRICA), CONFERIR, não é norma.
 * Material: PVC cinza (`mat_pvc_cinza`) em tubos, conexões e caixas (o catálogo não indica material das caixas).
 * IFC das caixas: IFCJUNCTIONBOX não existe em `ClasseIfc`; usa-se IFCCABLECARRIERFITTING/OTHER, como as caixas de eletricaCaixas.ts.
 * Geometria simplificada. CONFERIR tudo; não afirma conformidade com norma.
 */

export const MATERIAL_ELETRICA = 'mat_pvc_cinza';
/** Espessura provisória (mm) da parede de eletroduto e caixa. NÃO consta do catálogo nem é valor de norma: CONFERIR. */
export const ESPESSURA_ELETRICA = 2;

const PARAM_E: Parametro = { id: 'e', nome: 'Espessura da parede, CONFERIR (não consta do catálogo)', tipo: 'numero', escopo: 'tipo', padrao: ESPESSURA_ELETRICA, min: 0.5, max: 10, passo: 0.1, grupo: 'Parede' };

/** Rótulos das colunas que não são as do conector da receita (caixas: faces e profundidade, CONFERIR). */
const ELE_NOMES: Readonly<Record<string, string>> = {
  Fa: 'Face A, CONFERIR (letra A do catálogo)',
  Fb: 'Face B, CONFERIR (letra B do catálogo)',
  Pc: 'Profundidade, CONFERIR (letra C do catálogo)',
  Z: 'Centro até a bolsa (C − B, CONFERIR)',
};

const IFC_TUBO = { classe: 'IFCCABLECARRIERSEGMENT', tipoPredefinido: 'CONDUITSEGMENT' } as const;
const IFC_CURVA = { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'BEND' } as const;
const IFC_LUVA = { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' } as const;
const IFC_CAIXA = { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' } as const;

/** Especificação de uma família elétrica: itens do catálogo, mapa coluna → id, cópias, colunas calculadas e a receita de geometria. */
interface Spec {
  id: string;
  nome: string;
  categoria: 'eletroduto' | 'dispositivo_eletrico';
  descricao: string;
  ifc: NonNullable<Familia['ifc']>;
  itens: string[];
  /** Coluna do catálogo → id de parâmetro (só as usadas). */
  mapa: Record<string, string>;
  /** Id de parâmetro copiado de outro (ex.: Db = De, quando o catálogo traz uma cota só). */
  copias?: Record<string, string>;
  /** Colunas calculadas por linha a partir das já mapeadas (Z = C − B nas curvas). */
  calculadas?: Record<string, { nome: string; de: (v: Record<string, number>) => number }>;
  receita: Receita;
  hospedagem?: 'nivel' | 'parede';
}

function itemEletrica(id: string): ItemCatalogo {
  const it = KRONA_ELETRICA.itens.find((i) => i.id === id);
  if (!it) throw new Error(`Catálogo da Krona (elétrica): item “${id}” não existe`);
  return it;
}

/** Junta os itens do catálogo com ids de parâmetro, cópias e colunas calculadas. Linhas sem as cotas pedidas saem. */
function itemDoSpec(s: Spec): ItemCatalogo {
  const junto = juntarItens(s.id, s.nome, s.itens.map(itemEletrica), Object.keys(s.mapa));
  const colunas: Record<string, string> = {};
  for (const [col, alvo] of Object.entries(s.mapa)) colunas[alvo] = junto.colunas[col] ?? col;
  for (const [novo, de] of Object.entries(s.copias ?? {})) colunas[novo] = colunas[de] ?? novo;
  for (const [id, c] of Object.entries(s.calculadas ?? {})) colunas[id] = c.nome;
  const linhas = junto.linhas.map((l) => {
    const v: Record<string, number> = { e: ESPESSURA_ELETRICA };
    for (const [col, alvo] of Object.entries(s.mapa)) v[alvo] = l.valores[col] as number;
    for (const [novo, de] of Object.entries(s.copias ?? {})) v[novo] = v[de] as number;
    for (const [id, c] of Object.entries(s.calculadas ?? {})) v[id] = c.de(v);
    return { ...l, valores: v };
  });
  return { ...junto, id: s.id, nome: s.nome, colunas, linhas };
}

/** Família elétrica: categoria e IFC da especificação, espessura de tipo e rótulos próprios. */
function montar(s: Spec): Familia {
  const base = familiaKrona({
    id: s.id,
    nome: s.nome,
    categoria: 'conexao_tubo', // familiaKrona só aceita categorias de tubulação; a real é sobrescrita abaixo
    descricao: s.descricao,
    item: itemDoSpec(s),
    corpos: comMaterial(s.receita.corpos, MATERIAL_ELETRICA),
    ligacoes: s.receita.ligacoes,
    ifc: s.ifc,
    caixa: s.receita.caixa,
    fonte: 'catálogo da Krona (elétrica)',
    disciplina: 'eletrico',
  });
  return {
    ...base,
    categoria: s.categoria,
    descricao: `${s.descricao} Medidas do catálogo da Krona (elétrica), estado CONFERIR. Espessura da parede NÃO consta do catálogo: valor fixo provisório de ${ESPESSURA_ELETRICA} mm (CONFERIR). Geometria simplificada. Não afirma conformidade com norma.`,
    hospedagem: s.hospedagem ?? base.hospedagem,
    parametros: [...base.parametros.map((p) => (ELE_NOMES[p.id] ? { ...p, nome: ELE_NOMES[p.id] as string } : p)), PARAM_E],
    tipos: base.tipos.map((t) => ({ ...t, valores: { ...t.valores, e: ESPESSURA_ELETRICA } })),
  };
}

/**
 * Caixa retangular oca (4×2, 4×4 e a octogonal lida como retangular): face em y = 0 e caixa cresce para +Y, como as caixas da F5.
 * Parede (anel retangular) e fundo; quatro entradas, uma por face (o catálogo não diz quantas nem onde: CONFERIR). O diâmetro de
 * entrada (20 mm) é suposição, não consta do catálogo.
 */
function caixaOca(): Receita {
  const FACE: Ponto3 = ['-90', '0', '0'];
  const entrada = (id: string, nome: string, posicao: Ponto3, direcao: Ponto3): Ligacao => ({
    id, nome, dominio: ELETRICA.dominio, sistema: ELETRICA.sistema, secao: 'redonda', posicao, direcao, diametro: '20', fluxo: 'ambos',
  });
  return {
    usa: ['Fa', 'Fb', 'Pc', 'e'],
    corpos: [
      corpoEletrico('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, comprimento: 'P - e' }, { origem: ['L / 2', '0', 'A / 2'], rotacao: FACE }),
      corpoEletrico('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'A' }, comprimento: 'e' }, { origem: ['L / 2', 'P - e', 'A / 2'], rotacao: FACE }),
    ],
    ligacoes: [
      entrada('a', 'Entrada superior (CONFERIR)', ['L / 2', 'P / 2', 'A'], ['0', '0', '1']),
      entrada('b', 'Entrada inferior (CONFERIR)', ['L / 2', 'P / 2', '0'], ['0', '0', '-1']),
      entrada('c', 'Entrada esquerda (CONFERIR)', ['0', 'P / 2', 'A / 2'], ['-1', '0', '0']),
      entrada('d', 'Entrada direita (CONFERIR)', ['L', 'P / 2', 'A / 2'], ['1', '0', '0']),
    ],
    caixa: (v) => ({ L: Math.max(v.Fa ?? 0, v.Fb ?? 0), A: Math.min(v.Fa ?? 0, v.Fb ?? 0), P: v.Pc ?? 0 }),
  };
}

const SOLDAVEL_TUBO = ['tubo_eletroduto_de_pvc_rigido_soldavel_3m'];
const LUVA_MAPA = { B: 'B', C: 'C', D: 'De' };
const LUVA_COPIAS = { Db: 'De', B2: 'B' };
const CAIXA_MAPA = { A: 'Fa', B: 'Fb', C: 'Pc' };

const SPECS: Spec[] = [
  { id: 'fam_krona_eletrica_tubo', nome: 'Eletroduto rígido soldável com bolsa (Krona)', categoria: 'eletroduto', descricao: 'Eletroduto rígido de PVC soldável, bolsa na ponta A e ponta lisa na B; comprimento L livre.', ifc: IFC_TUBO, itens: SOLDAVEL_TUBO, mapa: { B: 'B', D: 'De' }, copias: { Db: 'De' }, receita: tubo(ELETRICA) },
  { id: 'fam_krona_eletrica_tubo_corte', nome: 'Eletroduto rígido soldável cortado (Krona)', categoria: 'eletroduto', descricao: 'Trecho de eletroduto rígido soldável cortado, ponta lisa nas duas pontas; comprimento L livre.', ifc: IFC_TUBO, itens: SOLDAVEL_TUBO, mapa: { D: 'De' }, receita: tuboCortado(ELETRICA) },
  { id: 'fam_krona_eletrica_curva90', nome: 'Curva 90° para eletroduto soldável (Krona)', categoria: 'eletroduto', descricao: 'Curva de 90° soldável: ponta lisa em baixo e bolsa para +X, varredura com tangente Z = C − B.', ifc: IFC_CURVA, itens: ['curva_90_para_eletroduto_soldavel'], mapa: { B: 'B', C: 'C', D: 'De' }, copias: { Db: 'De' }, calculadas: { Z: { nome: 'Centro até a bolsa (C − B, CONFERIR)', de: (v) => (v.C ?? 0) - (v.B ?? 0) } }, receita: curva(90, ELETRICA) },
  { id: 'fam_krona_eletrica_luva', nome: 'Luva para eletroduto soldável (Krona)', categoria: 'eletroduto', descricao: 'Luva de duas bolsas com batente central, para unir dois trechos de eletroduto soldável.', ifc: IFC_LUVA, itens: ['luva_para_eletroduto_soldavel'], mapa: LUVA_MAPA, copias: LUVA_COPIAS, receita: luva(ELETRICA) },
  { id: 'fam_krona_eletrica_luva_pressao', nome: 'Luva de pressão para eletroduto corrugado flexível (Krona)', categoria: 'eletroduto', descricao: 'Luva de pressão de duas bolsas para eletroduto corrugado flexível.', ifc: IFC_LUVA, itens: ['luva_de_pressao_para_eletroduto_corrugado_flexivel'], mapa: LUVA_MAPA, copias: LUVA_COPIAS, receita: luva(ELETRICA) },
  { id: 'fam_krona_eletrica_caixa_4x2', nome: 'Caixa de luz 4×2 empilhável (Krona)', categoria: 'dispositivo_eletrico', descricao: 'Caixa de luz 4×2 para eletroduto corrugado flexível: parede e fundo, face aberta em y = 0.', ifc: IFC_CAIXA, hospedagem: 'parede', itens: ['caixa_de_luz_empilhavel_para_eletroduto_corrugado_flexivel'], mapa: CAIXA_MAPA, receita: caixaOca() },
  { id: 'fam_krona_eletrica_caixa_4x4_flexivel', nome: 'Caixa de luz 4×4 para eletroduto flexível (Krona)', categoria: 'dispositivo_eletrico', descricao: 'Caixa de luz 4×4 para eletroduto corrugado flexível: parede e fundo, face aberta em y = 0.', ifc: IFC_CAIXA, hospedagem: 'parede', itens: ['caixa_de_luz_para_eletroduto_corrugado_flexivel'], mapa: CAIXA_MAPA, receita: caixaOca() },
  { id: 'fam_krona_eletrica_caixa_4x4', nome: 'Caixa de luz 4×4 para eletroduto flexível, série 2 (Krona)', categoria: 'dispositivo_eletrico', descricao: 'Caixa de luz 4×4 para eletroduto corrugado flexível (código 1266): parede e fundo, face aberta em y = 0.', ifc: IFC_CAIXA, hospedagem: 'parede', itens: ['caixa_de_luz_para_eletroduto_corrugado_flexivel_2'], mapa: CAIXA_MAPA, receita: caixaOca() },
  { id: 'fam_krona_eletrica_caixa_octogonal', nome: 'Caixa de luz octogonal com fundo móvel (Krona)', categoria: 'dispositivo_eletrico', descricao: 'Caixa de luz octogonal 4×4 com fundo móvel, geometria retangular simplificada: parede e fundo, face aberta em y = 0.', ifc: IFC_CAIXA, hospedagem: 'parede', itens: ['caixa_de_luz_octogonal_com_fundo_movel_para_eletroduto_corrugado_flexivel'], mapa: CAIXA_MAPA, receita: caixaOca() },
];

/** Famílias elétricas da Krona montadas do catálogo (eletroduto, conexões e caixas de luz). */
export const KRONA_ELETRICA_FAMILIAS: Familia[] = SPECS.map(montar);
