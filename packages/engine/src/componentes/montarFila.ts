import type { Vec2 } from '@hestia/geom';
import type { Component, ComponentGroup, Id, Project } from '@hestia/model';
import { ajustarLarguras, posicoesDaFila } from './encaixeFila.ts';
import type { FaceDeParede } from './encaixeTipos.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Fila de módulos contra a face de uma parede (PLANO-MODELAGEM-FLUIDA, F5): dado o pedido (face, trecho, módulos e
 * se as larguras podem ser redistribuídas), devolve os componentes e o conjunto prontos para entrar no projeto.
 * Função pura e determinística; nunca altera `p` e nunca lança para pedidos degenerados.
 */

/** Um módulo pedido para a fila. `largura` (m) ausente = largura do tipo (valor de `L` resolvido). */
export interface ModuloDeFila {
  familyId: Id;
  typeId: Id | null;
  largura?: number;
}

/** Pedido de uma fila: `inicio` e `comprimento` (m) medidos de `face.a` na direção `face.a → face.b`. */
export interface PedidoDeFila {
  levelId: Id;
  face: FaceDeParede;
  inicio: number;
  comprimento: number;
  modulos: ModuloDeFila[];
  preencher: boolean;
  nome?: string;
  idBase: string;
}

/** Resultado de `montarFila`: componentes sem `order` (para `addComponent`), o conjunto e as contas de fechamento. */
export interface ResultadoDeFila {
  componentes: Array<Omit<Component, 'order'>>;
  grupo: ComponentGroup;
  larguras: number[];
  painel: number;
  sobra: number;
  avisos: string[];
}

/** Medidas (m) de um módulo: largura do tipo, faixa do parâmetro `L` e profundidade `P`. */
interface MedidasDoModulo {
  largura: number;
  min: number;
  max: number;
  profundidade: number;
}

/** Diferença (m) abaixo da qual o valor é ruído de ponto flutuante. */
const EPS = 1e-9;
/** Faixa (m) em que a sobra do vão vira painel de enchimento. */
const PAINEL_MIN = 0.02;
const PAINEL_MAX = 0.15;

/** Resolve a família para o tipo e devolve largura, faixa de `L` e profundidade, em metros; `null` sem largura. */
function resolverMedidas(p: Project, familyId: Id, typeId: Id | null): MedidasDoModulo | null {
  const familia = p.componentFamilies?.[familyId];
  if (!familia) return null;
  const biblioteca = p.componentFamilies ?? {};
  const resolucao = resolverFamilia(familia, {
    tipoId: typeId ?? undefined,
    biblioteca: (id) => biblioteca[id],
  });
  const larguraMm = resolucao.env['L'];
  if (typeof larguraMm !== 'number' || !Number.isFinite(larguraMm) || larguraMm <= 0) return null;
  const parametro = familia.parametros.find((q) => q.id === 'L');
  const largura = larguraMm / 1000;
  const min = parametro?.min !== undefined ? parametro.min / 1000 : largura;
  const max = parametro?.max !== undefined ? parametro.max / 1000 : largura;
  const profundidadeMm = resolucao.env['P'];
  const profundidade = typeof profundidadeMm === 'number' && Number.isFinite(profundidadeMm) && profundidadeMm > 0 ? profundidadeMm / 1000 : 0;
  return { largura, min, max, profundidade };
}

/**
 * Largura (m) do módulo do tipo, com a faixa `[min, max]` do parâmetro `L` em metros (sem faixa, a própria largura);
 * `null` quando a família não está no projeto ou não tem largura `L` resolvida.
 */
export function larguraDoModulo(p: Project, familyId: Id, typeId: Id | null): { largura: number; min: number; max: number } | null {
  const medidas = resolverMedidas(p, familyId, typeId);
  return medidas ? { largura: medidas.largura, min: medidas.min, max: medidas.max } : null;
}

/** Ponto a `distancia` (m) de `a` na direção unitária `direcao`. */
function pontoNaFace(a: Vec2, direcao: Vec2, distancia: number): Vec2 {
  return { x: a.x + direcao.x * distancia, y: a.y + direcao.y * distancia };
}

/** Resultado sem componentes, com o aviso pedido (mais os avisos já acumulados). */
function resultadoVazio(
  pedido: PedidoDeFila,
  aviso: string,
  anteriores: readonly string[] = [],
  linha: { a: Vec2; b: Vec2 } = { a: pedido.face.a, b: pedido.face.b },
): ResultadoDeFila {
  return {
    componentes: [],
    grupo: {
      id: pedido.idBase,
      nome: pedido.nome ?? 'Fila',
      levelId: pedido.levelId,
      membros: [],
      linha: { a: { ...linha.a }, b: { ...linha.b } },
      regras: ['alinhar-frente'],
    },
    larguras: [],
    painel: 0,
    sobra: 0,
    avisos: [...anteriores, aviso],
  };
}

/**
 * Monta uma fila de módulos contra `pedido.face`. A largura de cada módulo vem do pedido ou do tipo (`L`); com
 * `preencher`, `ajustarLarguras` redistribui a diferença para `comprimento` dentro da faixa de `L` e o resto vira
 * painel (0,02 a 0,15 m) ou sobra com aviso. Famílias ausentes são avisadas e ignoradas. Pedido degenerado devolve
 * resultado vazio com aviso. Ids são `idBase_1`, `idBase_2`... na ordem dos módulos criados.
 */
export function montarFila(p: Project, pedido: PedidoDeFila): ResultadoDeFila {
  if (!(pedido.comprimento > 0)) return resultadoVazio(pedido, 'O comprimento da fila precisa ser maior que zero.');
  if (pedido.modulos.length === 0) return resultadoVazio(pedido, 'A fila precisa de ao menos um módulo.');
  const comprimentoFace = Math.hypot(pedido.face.b.x - pedido.face.a.x, pedido.face.b.y - pedido.face.a.y);
  if (!(comprimentoFace > 0)) return resultadoVazio(pedido, 'A face da parede é degenerada (a e b coincidem).');

  const direcao: Vec2 = {
    x: (pedido.face.b.x - pedido.face.a.x) / comprimentoFace,
    y: (pedido.face.b.y - pedido.face.a.y) / comprimentoFace,
  };
  const a = pontoNaFace(pedido.face.a, direcao, pedido.inicio);
  const b = pontoNaFace(a, direcao, pedido.comprimento);

  const avisos: string[] = [];
  const criados: Array<{ modulo: ModuloDeFila; medidas: MedidasDoModulo; largura: number }> = [];
  pedido.modulos.forEach((modulo, indice) => {
    if (!p.componentFamilies?.[modulo.familyId]) {
      avisos.push(`Família "${modulo.familyId}" não existe no projeto; módulo ${indice + 1} ignorado.`);
      return;
    }
    const medidas = resolverMedidas(p, modulo.familyId, modulo.typeId);
    if (!medidas) {
      avisos.push(`Família "${modulo.familyId}" não tem a largura (L) definida; módulo ${indice + 1} ignorado.`);
      return;
    }
    criados.push({ modulo, medidas, largura: modulo.largura ?? medidas.largura });
  });
  if (criados.length === 0) return resultadoVazio(pedido, 'Nenhum módulo válido para montar a fila.', avisos, { a, b });

  let larguras = criados.map((c) => c.largura);
  let painel = 0;
  let sobra = 0;
  if (pedido.preencher) {
    const limites = criados.map((c) => [c.medidas.min, c.medidas.max] as const);
    larguras = ajustarLarguras(larguras, limites, pedido.comprimento);
    const soma = larguras.reduce((total, largura) => total + largura, 0);
    const restante = pedido.comprimento - soma;
    if (restante > EPS) {
      if (restante >= PAINEL_MIN - EPS && restante <= PAINEL_MAX + EPS) painel = restante;
      else {
        sobra = restante;
        avisos.push('A sobra não cabe como painel de enchimento (entre 0,02 e 0,15 m).');
      }
    } else if (restante < -EPS) {
      avisos.push('Os módulos são mais largos que o comprimento da fila, mesmo nos limites mínimos.');
    }
  }

  const profundidade = criados[0]!.medidas.profundidade;
  const posicoes = posicoesDaFila(a, b, larguras, profundidade, 0);
  const componentes: Array<Omit<Component, 'order'>> = [];
  const membros: Id[] = [];
  criados.forEach((criado, indice) => {
    const posicao = posicoes[indice]!;
    const largura = larguras[indice]!;
    const id = `${pedido.idBase}_${indice + 1}`;
    const values = Math.abs(largura - criado.medidas.largura) > EPS ? { L: Math.round(largura * 1e6) / 1000 } : undefined;
    componentes.push({
      id,
      kind: 'component',
      familyId: criado.modulo.familyId,
      typeId: criado.modulo.typeId,
      levelId: pedido.levelId,
      x: posicao.pose.x,
      y: posicao.pose.y,
      z: 0,
      rotation: posicao.pose.rotation,
      mirrored: posicao.pose.mirrored,
      mark: '',
      ...(values ? { values } : {}),
    });
    membros.push(id);
  });

  return {
    componentes,
    grupo: {
      id: pedido.idBase,
      nome: pedido.nome ?? 'Fila',
      levelId: pedido.levelId,
      membros,
      linha: { a, b },
      regras: ['alinhar-frente'],
    },
    larguras,
    painel,
    sobra,
    avisos,
  };
}
