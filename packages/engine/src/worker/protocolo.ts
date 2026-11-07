import type { Id, Project } from '@hestia/model';
import type { ConfigDespacho, DiagnosticoDespacho } from '../kernelDespacho.ts';

/**
 * Protocolo entre a thread principal e o worker de resolução de níveis.
 *
 * Mensagens (cliente → worker): um pedido `{id, tipo, nivel, projeto}` ou um cancelamento `{id, tipo: 'cancelar'}`.
 * Resposta (worker → cliente): `{id, resultado, erro}`; `erro` é `null` quando deu certo.
 *
 * O projeto viaja como estrutura clonável (`structuredClone`): classes e funções não atravessam. Quem chama confere
 * isso com `caminhoNaoSerializavel` antes de pedir ao worker; o que não for clonável é resolvido na thread principal.
 */

/** Tipos de resolução que podem rodar no worker (cada um tem uma chamada em `executor.ts`). `corte` usa o id da vista de corte no lugar do nível. */
export const TIPOS_RESOLUCAO = ['nivel', 'patchNivel', 'pisos', 'lajes', 'telhados', 'ambientes', 'juncoes', 'corte'] as const;
export type TipoResolucao = (typeof TIPOS_RESOLUCAO)[number];

/**
 * Projeto como viaja para o worker. `versao` é o contador que quem chama incrementa a cada edição (o worker não o
 * interpreta; serve para diagnóstico e para o cliente saber de qual edição veio cada resposta). `estrutura` é o dado puro.
 * Ausente: é o mesmo projeto (mesma `versao`) do último pedido que a trouxe, e o worker o reaproveita. Assim cada versão
 * do projeto atravessa o `postMessage` uma vez só, por mais pedidos (nível, junções) que ela gere.
 */
export interface ProjetoEnviado {
  versao: number;
  estrutura?: Project;
}

/** Erro devolvido quando o pedido omite a `estrutura` e o worker não tem o projeto dessa `versao` (o cliente reenvia completo). */
export const ERRO_PROJETO_AUSENTE = 'projeto-ausente';

/**
 * Pedido de resolução de um tipo, de um nível, de um projeto. `base` só vale para `patchNivel`: a versão do resultado de
 * nível que quem pede já tem aplicado (`null`/ausente: não tem nenhum). Com ela o worker responde só a diferença
 * (ver `gerarPatchNivel` em `fluxoPatch.ts`); sem ela, o patch completo.
 */
export interface PedidoResolucao {
  id: number;
  tipo: TipoResolucao;
  nivel: Id;
  projeto: ProjetoEnviado;
  base?: number | null;
  /**
   * Despacho das fatias A e B do kernel v2 (decisões 0047 §12 e 0050): a URL e o `localStorage` não chegam ao worker, então a configuração viaja no
   * pedido. Ausente: o worker não instala nada e o caminho é o de sempre.
   */
  kernelV2?: ConfigDespacho;
}

/** Cancelamento de um pedido pelo id (vale se o pedido ainda não começou no worker). */
export interface CancelamentoResolucao {
  id: number;
  tipo: 'cancelar';
}

export type MensagemResolucao = PedidoResolucao | CancelamentoResolucao;

/** Resposta de um pedido: `erro` é `null` quando o `resultado` é válido. */
export interface RespostaResolucao {
  id: number;
  resultado: unknown;
  erro: string | null;
  /** Diagnóstico do despacho do kernel v2 neste worker (só quando instalado): a interface soma ao da thread principal. */
  kernelDiag?: DiagnosticoDespacho;
}

/** Motivo pelo qual um pedido foi encerrado sem resultado: cancelado pelo chamador, ou substituído por um mais recente. */
export type MotivoCancelamento = 'cancelado' | 'substituido';

/** Erro de um pedido que não teve resultado (o `await` de quem pediu lança este erro). */
export class ResolucaoCancelada extends Error {
  readonly motivo: MotivoCancelamento;

  constructor(motivo: MotivoCancelamento) {
    super(`Resolução ${motivo === 'cancelado' ? 'cancelada' : 'substituída por um pedido mais recente'}`);
    this.name = 'ResolucaoCancelada';
    this.motivo = motivo;
  }
}

/** A mensagem é um cancelamento (e não um pedido de resolução). */
export function ehCancelamento(m: MensagemResolucao): m is CancelamentoResolucao {
  return m.tipo === 'cancelar';
}

/** Chave de "pedido mais recente": um tipo de resolução de um nível. Pedidos com a mesma chave se substituem. */
export const chaveDoPedido = (tipo: TipoResolucao, nivel: Id): string => `${tipo}:${nivel}`;

/**
 * Lista os buffers binários (`ArrayBuffer` e os de `ArrayBufferView`, como `Float32Array`) de um valor, sem repetir.
 * O resultado é o que vai na lista de transferência do `postMessage`: o buffer muda de dono em vez de ser copiado.
 */
export function colherBuffers(valor: unknown): ArrayBuffer[] {
  const achados = new Set<ArrayBuffer>();
  const vistos = new Set<object>();
  const pilha: unknown[] = [valor];
  while (pilha.length > 0) {
    const v = pilha.pop();
    if (v === null || typeof v !== 'object' || vistos.has(v)) continue;
    vistos.add(v);
    if (v instanceof ArrayBuffer) {
      achados.add(v);
    } else if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) achados.add(v.buffer);
    } else if (Array.isArray(v)) {
      for (const x of v) pilha.push(x);
    } else {
      for (const x of Object.values(v)) pilha.push(x);
    }
  }
  return [...achados];
}

/** Tipos embutidos que o `structuredClone` copia sem reclamar (e que o motor pode usar em dados). */
const CLONAVEIS_EMBUTIDOS = [Map, Set, Date, RegExp, ArrayBuffer];

/**
 * Caminho do primeiro valor que não atravessa o `structuredClone` (função, símbolo, instância de classe), ou `null` se
 * o valor inteiro é clonável. Serve para decidir, antes de postar, se o pedido vai ao worker ou fica na thread principal.
 */
export function caminhoNaoSerializavel(valor: unknown, caminho = 'projeto'): string | null {
  if (valor === null || valor === undefined) return null;
  const tipo = typeof valor;
  if (tipo === 'function' || tipo === 'symbol') return caminho;
  if (tipo !== 'object') return null;
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i++) {
      const achado = caminhoNaoSerializavel(valor[i], `${caminho}[${i}]`);
      if (achado !== null) return achado;
    }
    return null;
  }
  if (ArrayBuffer.isView(valor) || CLONAVEIS_EMBUTIDOS.some((c) => valor instanceof c)) return null;
  const proto = Object.getPrototypeOf(valor);
  if (proto !== Object.prototype && proto !== null) return caminho;
  for (const [chave, filho] of Object.entries(valor)) {
    const achado = caminhoNaoSerializavel(filho, `${caminho}.${chave}`);
    if (achado !== null) return achado;
  }
  return null;
}
