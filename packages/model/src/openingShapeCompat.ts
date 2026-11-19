/**
 * Matriz de compatibilidade operação (família da esquadria) x forma do vão (docs/estudo-esquadrias/39).
 *
 * Regra de DADOS: cada linha é uma família do catálogo (`OpeningFamilyId`) e cada coluna uma forma (`OPENING_SHAPE_KINDS`). O
 * veredito é `ok` (a operação funciona no contorno), `adaptado` (funciona com a ressalva do motivo: a parte móvel só usa o
 * trecho reto, a folha é sobreposta, o arco fica como bandeira fixa) ou `incompatível` (não é construtivo: o motor gera a
 * esquadria FIXA dentro do contorno, aro + vidro, e a validação avisa `forma-incompatível-com-operação`).
 *
 * Justificativa (marcas: [V] fonte lida em docs/estudo-esquadrias, [G] derivado por geometria, [I] prática construtiva sem fonte):
 * - G0 fixa/vão livre: sem mecanismo, qualquer contorno serve. [G]
 * - G1 giro de eixo vertical na borda (porta de giro, dupla, vai-e-vem, janela de abrir): a dobradiça é um eixo reto vertical e a
 *   folha gira em torno dele; a aresta do lado da dobradiça precisa ser vertical. Arcos e empena têm laterais verticais (a coroa
 *   é chanfrada junto à dobradiça, [I]); trapézio e polígono têm aresta inclinada, e o círculo só toca o eixo num ponto
 *   (folha sobreposta ao aro, [I]); na ferradura o arco passa para fora das ombreiras, a folha bate na ombreira ao girar. [G]
 *   Duas ou mais folhas num círculo: a junta teria de ser um diâmetro e as dobradiças ficam no arco. [I]
 * - G2 pivô vertical (porta e janela pivotante): o eixo passa DENTRO da folha e cada ponto se move ao longo da horizontal para
 *   o eixo, sempre dentro do contorno na mesma cota; vale para qualquer forma simétrica (óculo pivotante é comum em escotilhas). [G]
 * - G3 eixo horizontal no topo (maxim-ar): a dobradiça é uma reta horizontal; num arco ou telhado ela só existe na linha de
 *   arranque, e o que fica acima é bandeira fixa (Lapin: "grade embaixo, bandeira fixa em arco em cima", doc 02 §5.1). [V]
 *   Sem laterais retas (ferradura) a folha bate no arco ao subir. [G]
 * - G4 eixo horizontal central (basculante): cada ponto se aproxima do eixo, então a largura do contorno nessa cota tem de ser
 *   a maior da folha: vale para o círculo (eixo no centro) e para arcos com o eixo abaixo da linha de arranque; trapézio e
 *   polígono dependem do desenho; a ferradura estreita abaixo do arco e a folha bate no pescoço. [G]
 * - G5 correr em plano (janela e porta de correr, de embutir): a folha anda em trilho reto horizontal por duas pistas; só a parte
 *   retangular (abaixo do arranque) corre, o arco fica como bandeira fixa (doc 02 §5.1 [V], "correr só retângulo central").
 *   Em círculo e ferradura não há faixa retangular útil: as folhas sairiam do contorno nas duas pontas do curso. [G]
 * - G6 guilhotina: guias verticais paralelas; só contorno de lados verticais e retos (a folha de cima fica fixa sob o arco). [G]
 * - G7 dobrar (bifold): painéis em trilho superior reto e dobradiças verticais; arcos viram trecho fixo acima. [I]
 * - G8 sanfonada/camarão (PVC, doc 20 linha 243 "folding (sem sanfonada)", doc 04 linha 204 "termo ambíguo" [P]): tira de largura fixa,
 *   recolhida contra uma ombreira em trilho superior reto; não acompanha curva nem telhado. [I]
 * - G9 portão de garagem (seccionado, basculante): painéis em trilhos laterais verticais e curso sob o teto; só vão retangular
 *   (portão arqueado do Lapin é só topo, doc 20 linha 153 [V]); arco vira cabeça fixa. [I]
 * - G10 veneziana: lâminas horizontais, cada uma uma faixa reta na largura do contorno naquela cota; junto à curva elas ficam
 *   curtas e o giro delas é limitado. [I]
 *
 * O que o motor faz com `adaptado`: nada diferente do que fazia (a folha segue o contorno recuado; ver docs 28 e 37). Só `incompatível`
 * muda o modelo: aro + vidro fixos (`openingModel.ts`, `openingModelFixa.ts`).
 */
import type { OpeningFamilyId } from './opening.ts';
import { openingFamilyOf } from './opening.ts';
import type { OpeningShape } from './openingShape.ts';
import { OPENING_SHAPE_KINDS, type OpeningShapeKind } from './openingShapeKinds.ts';
import type { OpeningType } from './openingTypes.ts';

export type ShapeVerdict = 'ok' | 'adaptado' | 'incompatível';

export interface ShapeCompat {
  verdict: ShapeVerdict;
  /** Grupo de regra (G0..G10 do cabeçalho). */
  rule: string;
  /** Motivo em português, uma frase. */
  reason: string;
}

type Grupo = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10';
const o = 'ok';
const a = 'adaptado';
const x = 'incompatível';
type V = typeof o | typeof a | typeof x;

/** Colunas na ordem de `OPENING_SHAPE_KINDS`: rect, round, segmental, pointed, circle, horseshoe, gable, trapezoid, polygon. */
type Linha = readonly [V, V, V, V, V, V, V, V, V];

/** Veredito por família (linha) e grupo de regra. */
const FAMILIAS: Readonly<Record<OpeningFamilyId, { grupo: Grupo; linha: Linha }>> = {
  door_swing: { grupo: 'G1', linha: [o, o, o, o, a, x, o, a, a] },
  door_double: { grupo: 'G1', linha: [o, o, o, o, x, x, o, a, a] },
  door_dblact: { grupo: 'G1', linha: [o, o, o, o, a, x, o, a, a] },
  window_hinged: { grupo: 'G1', linha: [o, o, o, o, a, x, o, a, a] },
  door_pivot: { grupo: 'G2', linha: [o, o, o, o, o, o, o, o, a] },
  window_pivot: { grupo: 'G2', linha: [o, o, o, o, o, o, o, o, a] },
  window_casement: { grupo: 'G3', linha: [o, a, a, a, a, x, a, a, a] },
  window_tilt: { grupo: 'G4', linha: [o, a, a, a, o, x, a, a, a] },
  window_sliding: { grupo: 'G5', linha: [o, a, a, a, x, x, a, a, a] },
  door_sliding: { grupo: 'G5', linha: [o, a, a, a, x, x, a, a, a] },
  door_pocket: { grupo: 'G5', linha: [o, a, a, a, x, x, a, a, a] },
  window_hung: { grupo: 'G6', linha: [o, a, a, a, x, x, a, x, x] },
  door_bifold: { grupo: 'G7', linha: [o, a, a, a, x, x, a, a, x] },
  door_accordion: { grupo: 'G8', linha: [o, x, x, x, x, x, x, x, x] },
  door_garage: { grupo: 'G9', linha: [o, a, a, a, x, x, a, x, x] },
  window_louver: { grupo: 'G10', linha: [o, o, o, o, a, a, o, a, a] },
  window_fixed: { grupo: 'G0', linha: [o, o, o, o, o, o, o, o, o] },
  window_void: { grupo: 'G0', linha: [o, o, o, o, o, o, o, o, o] },
  door_void: { grupo: 'G0', linha: [o, o, o, o, o, o, o, o, o] },
};

/** Motivo por grupo e forma. `base` vale para as formas sem texto próprio. */
const MOTIVOS: Readonly<Record<Grupo, { base: string; por?: Partial<Record<OpeningShapeKind, string>> }>> = {
  G0: { base: 'Sem mecanismo: aro e vidro fixos servem a qualquer contorno.' },
  G1: {
    base: 'Folha de giro de eixo vertical: a aresta da dobradiça é vertical e a folha acompanha o contorno recuado.',
    por: {
      rect: 'Folha retangular de giro: caso de referência.',
      round: 'Laterais verticais sustentam a dobradiça; a coroa em arco gira sem bater (chanfro no topo junto à dobradiça [I]).',
      segmental: 'Laterais verticais sustentam a dobradiça; o arco abatido gira sem bater.',
      pointed: 'Laterais verticais sustentam a dobradiça; a folha ogival gira sem bater (chanfro no topo junto à dobradiça [I]).',
      circle: 'Folha circular só toca o eixo da dobradiça num ponto: abre como folha sobreposta ao aro, com dobradiças fixadas no aro. Duas ou mais folhas não cabem (a junta seria um diâmetro).',
      horseshoe: 'O arco passa para fora das ombreiras (pescoço mais estreito que o círculo): a folha bate na ombreira ao girar. Use folha retangular até o pescoço com bandeira fixa em ferradura.',
      gable: 'Laterais verticais sustentam a dobradiça; os planos do telhado giram sem bater.',
      trapezoid: 'A aresta do lado da dobradiça é inclinada: o eixo vertical toca só um ponto da aresta e a folha precisa de chanfro; abertura limitada.',
      polygon: 'Depende do desenho: o eixo vertical fica na aresta mais externa e a aresta da dobradiça nem sempre é vertical; abertura limitada.',
    },
  },
  G2: {
    base: 'Pivô vertical: o eixo atravessa a folha e cada ponto se move na horizontal rumo ao eixo, sempre dentro do contorno na mesma cota; serve a qualquer forma simétrica.',
    por: { polygon: 'Polígono livre pode ser assimétrico ou côncavo: o eixo central nem sempre fica dentro do contorno em todas as cotas.' },
  },
  G3: {
    base: 'Maxim-ar de eixo horizontal no topo: a dobradiça reta só existe na linha de arranque ou na aresta superior reta; o arco ou telhado acima dela fica como bandeira fixa e a folha só abre abaixo dela.',
    por: {
      rect: 'Folha retangular de eixo no topo: caso de referência.',
      circle: 'Eixo tangente no topo do círculo: folha sobreposta ao aro, abre com pouca flecha; é a escotilha projetante.',
      horseshoe: 'O arco passa para fora das ombreiras: ao subir, a folha bate no pescoço da ferradura.',
    },
  },
  G4: {
    base: 'Basculante de eixo horizontal: cada ponto se aproxima do eixo, então a largura do contorno nessa cota tem de ser a maior da folha; vale com o eixo abaixo da linha de arranque.',
    por: {
      rect: 'Folha retangular basculante: caso de referência.',
      circle: 'Eixo no centro do círculo, onde a largura é máxima: a folha gira sem bater (com eixo excêntrico passa a adaptado).',
      horseshoe: 'A ferradura estreita abaixo do arco: a metade de cima bate no pescoço ao descer.',
      trapezoid: 'Só vale com o lado mais largo no eixo; o trapézio de topo mais largo bate ao girar.',
      polygon: 'Depende do desenho: a largura do polígono não é máxima no eixo em geral.',
    },
  },
  G5: {
    base: 'Correr em trilho reto: só o trecho retangular abaixo do arranque desliza e o arco ou telhado fica como bandeira fixa (Lapin, doc 02 §5.1); a folha recortada pelo contorno aberta passa do contorno (doc 37 §5).',
    por: {
      rect: 'Folhas retangulares em duas pistas: caso de referência.',
      circle: 'Sem faixa retangular útil: as folhas sairiam do círculo nas duas pontas do curso e o trilho reto não acompanha o contorno.',
      horseshoe: 'Sem faixa retangular útil acima do pescoço e o arco passa das ombreiras: a folha de correr não fecha o contorno.',
    },
  },
  G6: {
    base: 'Guilhotina em guias verticais paralelas: só a folha de baixo, retangular, sobe; a de cima fica fixa sob o arco ou telhado.',
    por: {
      rect: 'Duas folhas retangulares em guias verticais: caso de referência.',
      circle: 'Guias verticais paralelas não existem no círculo; a folha subiria para fora do contorno.',
      horseshoe: 'Laterais não paralelas acima do pescoço: a folha não desliza nas guias.',
      trapezoid: 'Laterais inclinadas travam a folha nas guias verticais.',
      polygon: 'Arestas laterais não paralelas ou não verticais travam a folha nas guias.',
    },
  },
  G7: {
    base: 'Dobrar (bifold): painéis retos pendurados em trilho superior reto, com dobradiças verticais; o arco ou telhado acima fica como trecho fixo.',
    por: {
      rect: 'Painéis retangulares articulados: caso de referência.',
      circle: 'Trilho superior reto e painéis de largura fixa não acompanham o círculo.',
      horseshoe: 'O arco passa das ombreiras: os painéis dobrados batem no pescoço.',
      polygon: 'Trilho superior reto não acompanha um polígono livre.',
    },
  },
  G8: {
    base: 'Sanfonada (camarão, PVC): tira de altura constante recolhida em trilho superior reto, sem forma; não acompanha curva nem telhado (doc 04 linha 204 [P]).',
    por: { rect: 'Tira retangular em trilho reto: caso de referência.' },
  },
  G9: {
    base: 'Portão (seccionado ou basculante): painéis retos em trilhos laterais verticais e curso sob o teto; só o trecho retangular opera e a cabeça em arco ou telhado fica fixa.',
    por: {
      rect: 'Portão retangular: caso de referência.',
      circle: 'Painéis retos em trilhos verticais não existem no círculo.',
      horseshoe: 'Trilhos laterais paralelos não existem na ferradura.',
      trapezoid: 'Laterais inclinadas travam o portão nos trilhos.',
      polygon: 'Trilhos laterais verticais não existem num polígono livre.',
    },
  },
  G10: {
    base: 'Veneziana: lâminas horizontais, cada uma uma faixa reta na largura do contorno naquela cota; junto à curva as lâminas ficam curtas e o giro delas é limitado.',
    por: {
      rect: 'Lâminas retangulares: caso de referência.',
      round: 'Lâminas encurtam sob o arco, giro livre.',
      segmental: 'Lâminas encurtam sob o arco abatido, giro livre.',
      pointed: 'Lâminas encurtam sob o arco ogival, giro livre.',
      gable: 'Lâminas encurtam sob o telhado, giro livre.',
    },
  },
};

const FORMA_INDEX: Readonly<Record<OpeningShapeKind, number>> = Object.fromEntries(OPENING_SHAPE_KINDS.map((k, i) => [k, i])) as Record<OpeningShapeKind, number>;

/** Tipo só com o que a matriz lê (família, folhas e eixo do basculante). */
export type ShapeCompatType = Pick<OpeningType, 'kind' | 'plan' | 'leaves'> & Partial<Pick<OpeningType, 'tiltAxis'>>;

/** Veredito de uma família e forma, sem olhar o tipo (número de folhas, eixo). */
export function familyShapeCompat(family: OpeningFamilyId, shape: OpeningShapeKind): ShapeCompat {
  const f = FAMILIAS[family];
  const m = MOTIVOS[f.grupo];
  return { verdict: f.linha[FORMA_INDEX[shape]]!, rule: f.grupo, reason: m.por?.[shape] ?? m.base };
}

/** A matriz inteira: família -> forma -> veredito (para documentação, interface e testes). */
export function shapeCompatMatrix(): Record<OpeningFamilyId, Record<OpeningShapeKind, ShapeCompat>> {
  const out = {} as Record<OpeningFamilyId, Record<OpeningShapeKind, ShapeCompat>>;
  for (const id of Object.keys(FAMILIAS) as OpeningFamilyId[]) {
    out[id] = Object.fromEntries(OPENING_SHAPE_KINDS.map((k) => [k, familyShapeCompat(id, k)])) as Record<OpeningShapeKind, ShapeCompat>;
  }
  return out;
}

/**
 * Compatibilidade do TIPO com a forma. Parte da família (`kind`, `plan`, `leaves`) e aplica as duas regras que dependem do tipo:
 * duas ou mais folhas em círculo/elipse são incompatíveis (a junta seria um diâmetro e as dobradiças ficam no arco), e o
 * basculante de eixo excêntrico (fora de 0,4..0,6) no círculo é só adaptado. Forma ausente ou `rect`: `ok`. Tipo sem família
 * (combinação inexistente): `ok` (quem recusa isso é `openingTypeIssue`).
 */
export function shapeCompat(t: ShapeCompatType, shape: OpeningShape | OpeningShapeKind | undefined): ShapeCompat {
  const kind: OpeningShapeKind = shape === undefined ? 'rect' : typeof shape === 'string' ? shape : shape.kind;
  const fam = openingFamilyOf(t)?.id;
  if (!fam) return { verdict: 'ok', rule: 'G0', reason: 'Tipo sem família: nada a conferir.' };
  const r = familyShapeCompat(fam, kind);
  if (kind === 'circle' && t.leaves >= 2 && r.verdict !== 'incompatível') {
    return { verdict: 'incompatível', rule: r.rule, reason: 'Duas ou mais folhas num círculo: a junta seria um diâmetro e as dobradiças ficam no arco; use uma folha ou fixa.' };
  }
  if (kind === 'circle' && fam === 'window_tilt' && t.tiltAxis !== undefined && Math.abs(t.tiltAxis - 0.5) > 0.1) {
    return { verdict: 'adaptado', rule: r.rule, reason: 'Eixo fora do centro do círculo: a metade longa da folha se aproxima do eixo onde o contorno é mais estreito e bate no aro.' };
  }
  return r;
}

/** Formas que o tipo aceita (`ok` ou `adaptado`), na ordem de `OPENING_SHAPE_KINDS`; `rect` sempre entra. Para filtrar a lista da interface. */
export function compatibleShapes(t: ShapeCompatType): OpeningShapeKind[] {
  return OPENING_SHAPE_KINDS.filter((k) => shapeCompat(t, k).verdict !== 'incompatível');
}

/** O tipo é incompatível com a forma (o motor gera a esquadria fixa)? */
export const shapeIncompatible = (t: ShapeCompatType, shape: OpeningShape | OpeningShapeKind | undefined): boolean => shapeCompat(t, shape).verdict === 'incompatível';
