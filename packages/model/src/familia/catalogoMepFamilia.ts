import type { ItemCatalogo } from './catalogoMep.ts';
import { AGUA_FRIA, comMaterial, ESGOTO, familiaKrona, type Contexto } from './biblioteca/kronaEsgotoApoio.ts';
import { cap, curva, curvaBolsas, joelho, luva, reducaoExcentrica, te, teBolsas, tubo, type Receita } from './biblioteca/kronaReceitas.ts';
import type { Familia } from './tipos.ts';

/*
 * Cria uma família a partir de um item de catálogo (a pessoa monta o catálogo no editor; ficha P3). As colunas do item JÁ são ids
 * de parâmetro: B (profundidade da bolsa), Db (diâmetro interno da bolsa), De (diâmetro externo da ponta; sem ele vale Db), e (espessura
 * da parede), Z, C, C1, C2, Z2, B2, Db2, conforme a receita. Cada receita diz quais colunas lê (`usa`). Nada é inventado: coluna que
 * falta é erro com o nome dela. A família sai marcada com o estado do item (CONFERIR até alguém conferir) e sem afirmar norma.
 */

export interface ReceitaMep {
  id: string;
  rotulo: string;
  categoria: 'tubulacao' | 'conexao_tubo';
  ifc: NonNullable<Familia['ifc']>;
  receita: (ctx: Contexto) => Receita;
  /** Frase curta sobre o significado das cotas, para a interface. */
  ajuda: string;
}

const CONECTOR = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' } as const;
const CURVA = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' } as const;
const JUNCAO = { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' } as const;

export const RECEITAS_MEP: readonly ReceitaMep[] = [
  { id: 'tubo', rotulo: 'Tubo reto (bolsa e ponta)', categoria: 'tubulacao', ifc: { classe: 'IFCPIPESEGMENT' }, receita: tubo, ajuda: 'B = profundidade da bolsa; Db = diâmetro interno da bolsa; De = diâmetro externo da ponta; e = espessura.' },
  { id: 'joelho90', rotulo: 'Joelho 90° (bolsa nas duas pontas)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => joelho(90, c), ajuda: 'B = bolsa; Z = centro até a entrada da bolsa; Db; e.' },
  { id: 'joelho45', rotulo: 'Joelho 45° (bolsa nas duas pontas)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => joelho(45, c), ajuda: 'B = bolsa; Z = centro até a entrada da bolsa; Db; e.' },
  { id: 'curva90', rotulo: 'Curva 90° (ponta lisa + bolsa)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => curva(90, c), ajuda: 'B; Z (tangente do arco); C = centro até a ponta lisa; Db; De; e.' },
  { id: 'curva45', rotulo: 'Curva 45° (ponta lisa + bolsa)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => curva(45, c), ajuda: 'B; Z (tangente do arco); C = centro até a ponta lisa; Db; De; e.' },
  { id: 'curva90_bolsas', rotulo: 'Curva 90° (bolsa nas duas pontas)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => curvaBolsas(90, c), ajuda: 'B; Z (tangente do arco); Db; e.' },
  { id: 'curva45_bolsas', rotulo: 'Curva 45° (bolsa nas duas pontas)', categoria: 'conexao_tubo', ifc: CURVA, receita: (c) => curvaBolsas(45, c), ajuda: 'B; Z (tangente do arco); Db; e.' },
  { id: 'luva', rotulo: 'Luva (duas bolsas)', categoria: 'conexao_tubo', ifc: CONECTOR, receita: luva, ajuda: 'B e B2 = bolsas; C = comprimento total; Db; e.' },
  { id: 'te90', rotulo: 'Tê 90° (corrida com ponta lisa)', categoria: 'conexao_tubo', ifc: JUNCAO, receita: (c) => te(90, false, c), ajuda: 'B; C = comprimento da corrida; Z e Z2; Db; De; e.' },
  { id: 'juncao45', rotulo: 'Junção 45° (corrida com ponta lisa)', categoria: 'conexao_tubo', ifc: JUNCAO, receita: (c) => te(45, false, c), ajuda: 'B; C = comprimento da corrida; Z e Z2; Db; De; e.' },
  { id: 'te_bolsas', rotulo: 'Tê 90° (bolsa nas três pontas)', categoria: 'conexao_tubo', ifc: JUNCAO, receita: (c) => teBolsas(false, c), ajuda: 'B; C2 = comprimento da corrida; C1 = comprimento do ramal; Db; e.' },
  { id: 'tampao', rotulo: 'Tampão (cap)', categoria: 'conexao_tubo', ifc: CONECTOR, receita: cap, ajuda: 'B = bolsa; C = comprimento total; Db; e.' },
  { id: 'reducao_excentrica', rotulo: 'Redução excêntrica', categoria: 'conexao_tubo', ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'TRANSITION' }, receita: reducaoExcentrica, ajuda: 'B; C = comprimento total; C2 = parte grande; Db = bolsa pequena; De = ponta grande; e.' },
];

export type DominioMep = 'esgoto' | 'agua_fria';
export const CONTEXTOS_MEP: Record<DominioMep, Contexto> = { esgoto: ESGOTO, agua_fria: AGUA_FRIA };

export interface OpcoesFamiliaDoItem {
  receita: string;
  id: string;
  nome: string;
  dominio: DominioMep;
  /** Apelido de material do corpo (`mat_pvc_branco`, `mat_cobre`...); padrão: PVC branco no esgoto e PVC marrom na água fria. */
  material?: string;
}

export type ResultadoFamiliaDoItem = { ok: true; familia: Familia } | { ok: false; erros: string[] };

/** O item só tem `Db` e `De` ausente: a ponta lisa tem o mesmo diâmetro da bolsa. Devolve um item novo com as colunas completas. */
function comPadroes(item: ItemCatalogo): ItemCatalogo {
  if (item.colunas.Db === undefined || item.colunas.De !== undefined) return item;
  return { ...item, colunas: { ...item.colunas, De: 'diâmetro externo da ponta (= Db)' }, linhas: item.linhas.map((l) => ({ ...l, valores: { ...l.valores, De: l.valores.Db as number } })) };
}

/**
 * Monta a família do item com a receita escolhida. Erros: receita desconhecida, coluna que a receita lê e o item não tem, linha
 * sem algum valor, e a validação da família gerada (quem chama valida de novo, mas aqui já evita devolver família quebrada).
 */
export function familiaDoItem(itemBruto: ItemCatalogo, o: OpcoesFamiliaDoItem): ResultadoFamiliaDoItem {
  const def = RECEITAS_MEP.find((r) => r.id === o.receita);
  if (!def) return { ok: false, erros: [`Receita desconhecida: ${o.receita}`] };
  const item = comPadroes(itemBruto);
  const r = def.receita(CONTEXTOS_MEP[o.dominio]);
  const faltam = r.usa.filter((c) => item.colunas[c] === undefined);
  if (faltam.length > 0) return { ok: false, erros: [`Faltam as colunas: ${faltam.join(', ')}. ${def.ajuda}`] };
  const linhasOk = item.linhas.filter((l) => r.usa.every((c) => Number.isFinite(l.valores[c])));
  if (linhasOk.length === 0) return { ok: false, erros: ['Nenhuma linha traz todas as colunas pedidas'] };
  const completo = { ...item, linhas: linhasOk, colunas: Object.fromEntries(r.usa.map((c) => [c, item.colunas[c] ?? c])) };
  try {
    const familia = familiaKrona({ id: o.id, nome: o.nome, categoria: def.categoria, descricao: `${def.rotulo}.`, item: completo, corpos: comMaterial(r.corpos, o.material ?? (o.dominio === 'esgoto' ? 'mat_pvc_branco' : 'mat_pvc_marrom')), ligacoes: r.ligacoes, ifc: def.ifc, caixa: r.caixa, fonte: `catálogo próprio “${item.nome}”`, disciplina: 'hidrossanitario' });
    return { ok: true, familia };
  } catch (e) {
    return { ok: false, erros: [e instanceof Error ? e.message : String(e)] };
  }
}

/** Nomes de coluna do catálogo do fabricante → ids de parâmetro (para copiar um item do fabricante e editá-lo). */
const RENOMEAR: Record<string, string> = { A: 'Aext', D: 'Db', D1: 'Db', d: 'De', D2: 'Db2', B1: 'B', Z1: 'Z' };

/** Copia o item trocando as letras do desenho pelos ids de parâmetro; coluna repetida após a troca mantém a primeira. */
export function paraIdsDeParametro(item: ItemCatalogo, novoId: string, novoNome: string): ItemCatalogo {
  const mapa = (c: string): string => (c === 'Z1' && item.colunas.Z !== undefined ? c : (RENOMEAR[c] ?? c));
  const colunas: Record<string, string> = {};
  for (const [c, sig] of Object.entries(item.colunas)) if (colunas[mapa(c)] === undefined) colunas[mapa(c)] = sig;
  const linhas = item.linhas.map((l) => {
    const valores: Record<string, number> = {};
    for (const [c, v] of Object.entries(l.valores)) if (valores[mapa(c)] === undefined) valores[mapa(c)] = v;
    return { ...l, valores };
  });
  return { ...item, id: novoId, nome: novoNome, colunas, linhas, estado: 'CONFERIR', conferidoPor: undefined, conferidoEm: undefined };
}
