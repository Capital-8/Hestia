import {
  FAMILIAS_QUADRO,
  isComponent,
  listarQuadros,
  posicoesDoQuadro,
  ROTULO_TIPO_CIRCUITO,
  totalDoCircuito,
  type CircuitoEletrico,
  type Component,
  type Id,
  type Project,
  type TipoCircuito,
} from '@hestia/model';
import { resolverComponente } from '../componentes/instancia.ts';
import { tipoSemConexoes } from '../componentes/curvaturaFlexivel.ts';
import { pecasDoCircuito } from './comprimentoCircuito.ts';

/*
 * Quantitativos elétricos (ficha C6): TRAÇADO, não dimensionamento. Conta eletrodutos por bitola (com o comprimento de cada peça
 * cortada, `L`, uma vez por peça), curvas e luvas por bitola, caixas por tipo, quadros, pontos por tipo e total de VA por circuito.
 * Por circuito, as peças são as do caminho quadro → ponto (união, sem repetir). Peça sem família reconhecida entra como `outros`.
 * Puro e determinístico. Não lê corpos nem fórmulas além do que `resolverComponente` já dá. Nenhum valor de norma aqui.
 */

/** Medidas do texto da família vêm em mm; o resolvido em m. */
const MM_PARA_M = 1e-3;

/** Classe elétrica de uma peça; `null` = peça de outra disciplina (fica fora do quantitativo). */
export type ClasseEletrica = 'eletroduto' | 'corrugado' | 'curva' | 'luva' | 'caixa' | 'quadro' | 'tomada' | 'interruptor' | 'luminaria' | 'outros';

export interface LinhaEletrodutoBitola {
  /** Bitola (DN ou `bitola`) da peça; `null` quando a família não tem medida de bitola. */
  bitola: number | null;
  /** Número de trechos. */
  trechos: number;
  /** Soma do comprimento (m) das peças cortadas, pelo parâmetro `L` de cada uma. */
  comprimentoM: number;
}

/** Eletroduto corrugado (ficha F2): por família (amarelo, reforçado) e bitola, com o comprimento do trecho reto (`L`). Sem curvas nem luvas. */
export interface LinhaCorrugado extends LinhaEletrodutoBitola {
  familiaId: Id;
  nome: string;
}

export interface LinhaPecaBitola {
  bitola: number | null;
  quantidade: number;
}

export interface LinhaTipo {
  familiaId: Id;
  nome: string;
  quantidade: number;
}

export interface ContagemPontos {
  tomadas: number;
  interruptores: number;
  luminarias: number;
  /** Dispositivos elétricos que não são tomada, interruptor nem luminária (ex.: caixa usada como ponto). */
  outros: number;
}

export interface QuadroQuantitativo {
  id: Id;
  nome: string;
  /** Posições de disjuntor, quando a família tem o parâmetro `posicoes`. */
  posicoes: number | null;
}

export interface QuantitativosCircuito {
  circuitoId: Id;
  nome: string;
  tipo: TipoCircuito;
  rotuloTipo: string;
  /** Nome do quadro que alimenta o circuito; `null` = sem quadro (ou quadro que não existe mais). */
  quadroNome: string | null;
  /** Total (VA) dos pontos válidos (potência × fator). */
  totalVA: number;
  /** Pontos válidos do circuito (componente existe). */
  pontos: ContagemPontos;
  /** Pontos que a rede de eletrodutos não liga ao quadro. */
  semCaminho: number;
  /** Eletrodutos do caminho quadro → pontos, por bitola (cada peça uma vez). */
  eletrodutos: LinhaEletrodutoBitola[];
  curvas: LinhaPecaBitola[];
  luvas: LinhaPecaBitola[];
  caixas: LinhaTipo[];
  /** Eletroduto corrugado do caminho (ficha F2); ausente = nenhum. */
  corrugados?: LinhaCorrugado[];
}

export interface QuantitativosEletricos {
  /** Eletrodutos do projeto inteiro, por bitola. */
  eletrodutos: LinhaEletrodutoBitola[];
  /** Eletroduto corrugado do projeto inteiro, por família e bitola (ficha F2); a chave só existe quando há corrugado (o resultado dos projetos sem ele não muda). */
  corrugados?: LinhaCorrugado[];
  curvas: LinhaPecaBitola[];
  luvas: LinhaPecaBitola[];
  caixas: LinhaTipo[];
  quadros: QuadroQuantitativo[];
  /** Pontos do projeto inteiro (com ou sem circuito). */
  pontos: ContagemPontos;
  /** Peças sem família reconhecida. */
  outros: LinhaTipo[];
  circuitos: QuantitativosCircuito[];
}

const VAZIO_PONTOS = (): ContagemPontos => ({ tomadas: 0, interruptores: 0, luminarias: 0, outros: 0 });

/** Classe elétrica da peça pela categoria da família e pelo id (regra estável, sem lista de nomes de catálogo). */
export function classeEletrica(p: Project, c: Component): ClasseEletrica | null {
  if (FAMILIAS_QUADRO.includes(c.familyId)) return 'quadro';
  const familia = p.componentFamilies?.[c.familyId];
  const categoria = familia?.categoria;
  if (familia !== undefined && categoria !== 'eletroduto' && categoria !== 'dispositivo_eletrico' && categoria !== 'luminaria') return null;
  const id = c.familyId;
  if (categoria === 'eletroduto') {
    if (tipoSemConexoes(id) !== undefined) return 'corrugado';
    if (/curva/.test(id)) return 'curva';
    if (/luva/.test(id)) return 'luva';
    if (/eletroduto|tubo/.test(id) && !/calha/.test(id)) return 'eletroduto';
    return 'outros';
  }
  if (categoria === 'dispositivo_eletrico' || categoria === 'luminaria') {
    if (/caixa_(4x2|4x4|octogonal|passagem)/.test(id)) return 'caixa';
    if (/tomada/.test(id)) return 'tomada';
    if (/interruptor/.test(id)) return 'interruptor';
    if (categoria === 'luminaria' || /lumin/.test(id)) return 'luminaria';
    return 'outros';
  }
  // Família ausente da biblioteca do projeto ou sem classe conhecida: entra como outros.
  return 'outros';
}

/** Número do parâmetro resolvido (mm, DN...); `null` se ausente ou não numérico. */
function numeroDoEnv(env: Readonly<Record<string, unknown>>, nome: string): number | null {
  const v = env[nome];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Bitola da peça: `bitola`, depois `DN`; `null` quando nenhum dos dois existe. */
function bitolaDaPeca(p: Project, c: Component): number | null {
  const env = resolverComponente(p, c).env as Readonly<Record<string, unknown>>;
  return numeroDoEnv(env, 'bitola') ?? numeroDoEnv(env, 'DN');
}

/** Comprimento (m) da peça cortada: parâmetro `L` (mm) resolvido; 0 quando ausente. */
function comprimentoDaPeca(p: Project, c: Component): number {
  const env = resolverComponente(p, c).env as Readonly<Record<string, unknown>>;
  return (numeroDoEnv(env, 'L') ?? 0) * MM_PARA_M;
}

const ordemBitola = (a: number | null, b: number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const nomeDaFamilia = (p: Project, familiaId: Id): string => p.componentFamilies?.[familiaId]?.nome ?? familiaId;

/** Acumula as peças de uma lista de componentes nas linhas de eletroduto, curva, luva, caixa e outros. */
interface Acumulador {
  eletrodutos: Map<number | null, LinhaEletrodutoBitola>;
  corrugados: Map<string, LinhaCorrugado>;
  curvas: Map<number | null, LinhaPecaBitola>;
  luvas: Map<number | null, LinhaPecaBitola>;
  caixas: Map<Id, LinhaTipo>;
  outros: Map<Id, LinhaTipo>;
  pontos: ContagemPontos;
}

const novoAcumulador = (): Acumulador => ({ eletrodutos: new Map(), corrugados: new Map(), curvas: new Map(), luvas: new Map(), caixas: new Map(), outros: new Map(), pontos: VAZIO_PONTOS() });

function somaTipo(mapa: Map<Id, LinhaTipo>, p: Project, familiaId: Id): void {
  const linha = mapa.get(familiaId) ?? { familiaId, nome: nomeDaFamilia(p, familiaId), quantidade: 0 };
  linha.quantidade += 1;
  mapa.set(familiaId, linha);
}

function somaBitola(mapa: Map<number | null, LinhaPecaBitola>, bitola: number | null): void {
  const linha = mapa.get(bitola) ?? { bitola, quantidade: 0 };
  linha.quantidade += 1;
  mapa.set(bitola, linha);
}

function acumula(a: Acumulador, p: Project, c: Component, classe: ClasseEletrica): void {
  switch (classe) {
    case 'eletroduto': {
      const bitola = bitolaDaPeca(p, c);
      const linha = a.eletrodutos.get(bitola) ?? { bitola, trechos: 0, comprimentoM: 0 };
      linha.trechos += 1;
      linha.comprimentoM += comprimentoDaPeca(p, c);
      a.eletrodutos.set(bitola, linha);
      return;
    }
    case 'corrugado': {
      const bitola = bitolaDaPeca(p, c);
      const chave = `${c.familyId}|${bitola ?? ''}`;
      const linha = a.corrugados.get(chave) ?? { familiaId: c.familyId, nome: nomeDaFamilia(p, c.familyId), bitola, trechos: 0, comprimentoM: 0 };
      linha.trechos += 1;
      linha.comprimentoM += comprimentoDaPeca(p, c);
      a.corrugados.set(chave, linha);
      return;
    }
    case 'curva':
      return somaBitola(a.curvas, bitolaDaPeca(p, c));
    case 'luva':
      return somaBitola(a.luvas, bitolaDaPeca(p, c));
    case 'caixa':
      return somaTipo(a.caixas, p, c.familyId);
    case 'tomada':
      a.pontos.tomadas += 1;
      return;
    case 'interruptor':
      a.pontos.interruptores += 1;
      return;
    case 'luminaria':
      a.pontos.luminarias += 1;
      return;
    case 'outros':
      return somaTipo(a.outros, p, c.familyId);
    case 'quadro':
      return;
  }
}

const listaCorrugados = (m: Map<string, LinhaCorrugado>): LinhaCorrugado[] => [...m.values()].sort((x, y) => x.nome.localeCompare(y.nome) || ordemBitola(x.bitola, y.bitola));
const listaBitola = (m: Map<number | null, LinhaPecaBitola>): LinhaPecaBitola[] => [...m.values()].sort((x, y) => ordemBitola(x.bitola, y.bitola));
const listaEletrodutos = (m: Map<number | null, LinhaEletrodutoBitola>): LinhaEletrodutoBitola[] => [...m.values()].sort((x, y) => ordemBitola(x.bitola, y.bitola));
const listaTipo = (m: Map<Id, LinhaTipo>): LinhaTipo[] => [...m.values()].sort((x, y) => x.nome.localeCompare(y.nome) || (x.familiaId < y.familiaId ? -1 : x.familiaId > y.familiaId ? 1 : 0));

/** Quantitativos elétricos do projeto: por projeto e por circuito. Nunca lança. Circuito sem quadro ou ponto órfão é contado com o que existe. */
export function quantitativosEletricosDoProjeto(p: Project): QuantitativosEletricos {
  const geral = novoAcumulador();
  const componentes: Component[] = Object.values(p.elements).filter(isComponent).sort((x, y) => x.id.localeCompare(y.id));
  for (const c of componentes) {
    const classe = classeEletrica(p, c);
    if (classe !== null) acumula(geral, p, c, classe);
  }

  const quadros: QuadroQuantitativo[] = listarQuadros(p).map((q) => ({ id: q.id, nome: q.nome, posicoes: posicoesDoQuadro(p, q.componente) ?? null }));

  const circuitos = Object.values(p.circuitosEletricos ?? {})
    .sort((x, y) => x.nome.localeCompare(y.nome) || (x.id < y.id ? -1 : 1))
    .map((c) => quantitativosDoCircuito(p, c, quadros));

  return {
    eletrodutos: listaEletrodutos(geral.eletrodutos),
    ...(geral.corrugados.size > 0 ? { corrugados: listaCorrugados(geral.corrugados) } : {}),
    curvas: listaBitola(geral.curvas),
    luvas: listaBitola(geral.luvas),
    caixas: listaTipo(geral.caixas),
    quadros,
    pontos: geral.pontos,
    outros: listaTipo(geral.outros),
    circuitos,
  };
}

function quantitativosDoCircuito(p: Project, c: CircuitoEletrico, quadros: readonly QuadroQuantitativo[]): QuantitativosCircuito {
  const validos = c.pontos.filter((pt) => isComponent(p.elements[pt.componenteId]));
  const { pecas, semCaminho } = pecasDoCircuito(p, { quadroId: c.quadroId, pontos: validos });
  const acc = novoAcumulador();
  for (const pt of validos) {
    const comp = p.elements[pt.componenteId];
    if (!isComponent(comp)) continue;
    const classe = classeEletrica(p, comp);
    if (classe === 'tomada') acc.pontos.tomadas += 1;
    else if (classe === 'interruptor') acc.pontos.interruptores += 1;
    else if (classe === 'luminaria') acc.pontos.luminarias += 1;
    else acc.pontos.outros += 1;
  }
  for (const id of pecas) {
    const comp = p.elements[id];
    if (!isComponent(comp)) continue;
    const classe = classeEletrica(p, comp);
    if (classe === null || classe === 'quadro' || classe === 'tomada' || classe === 'interruptor' || classe === 'luminaria') continue;
    acumula(acc, p, comp, classe);
  }
  const quadro = quadros.find((q) => q.id === c.quadroId);
  return {
    circuitoId: c.id,
    nome: c.nome,
    tipo: c.tipo,
    rotuloTipo: ROTULO_TIPO_CIRCUITO[c.tipo],
    quadroNome: quadro?.nome ?? null,
    totalVA: totalDoCircuito({ pontos: validos }),
    pontos: acc.pontos,
    semCaminho: semCaminho.length,
    eletrodutos: listaEletrodutos(acc.eletrodutos),
    ...(acc.corrugados.size > 0 ? { corrugados: listaCorrugados(acc.corrugados) } : {}),
    curvas: listaBitola(acc.curvas),
    luvas: listaBitola(acc.luvas),
    caixas: listaTipo(acc.caixas),
  };
}
