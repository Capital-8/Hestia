import type { Command, Component, Familia, Id, Project } from '@hestia/model';
import type { RegrasConexao } from './posicaoConexao.ts';
import type { TipoParaNo } from './resolvedorNo.ts';

/*
 * Tipos da troca de bitola de um tubo já traçado (fase 3, ficha B3). O planejador (`trocaBitola.ts`) é PURO: lê o projeto e devolve um
 * plano com os comandos; quem grava é a camada de ferramentas (`aplicarTrocaDeBitola`). Unidades: DN em mm, pontos e recuos em metros.
 */

/** Comando do modelo (o plano é uma lista deles, aplicada numa única transação). */
export type Comando = Command;

export type V3 = [number, number, number];

/** Motivo de o plano nem começar: nada é alterado. `bitolas` lista os DN que valem quando a recusa é de bitola. */
export interface RecusaTroca {
  codigo: 'bitola_fora_da_lista' | 'tubo_inexistente';
  motivo: string;
  bitolas?: readonly number[];
}

/** Peça que continua no nó, trocada para a nova bitola (mesma família) ou substituída por outra (ex.: luva por redução). */
export interface ConexaoTrocada {
  /** Peça antiga (em troca de família, é a que saiu). */
  elementId: Id;
  familiaAntes: string;
  familiaDepois: string;
  dnAntes: number;
  dnDepois: number;
}

/** Ligação desfeita: `elementId` é o TUBO que ficou com a ponta aberta e `ligacaoId` a ligação dele que soltou. */
export interface ConexaoRemovida {
  elementId: Id;
  ligacaoId: string;
  motivo: string;
}

/** Redução que o plano insere. `elementId` é o id da peça nova. */
export interface ReducaoInserida {
  elementId: Id;
  familiaId: string;
  dnMaior: number;
  dnMenor: number;
}

/** Tubo curto que o plano insere entre duas conexões vizinhas para elas não ficarem coladas (ficha F1). `entre` são as duas peças (ids). */
export interface TuboInserido {
  elementId: Id;
  familiaId: string;
  dn: number;
  /** Comprimento do tubo (mm). */
  comprimento: number;
  entre: [Id, Id];
}

export type CodigoAlertaTroca = 'conexao_removida' | 'bitolas_diferentes' | 'declividade_fora_do_limite';

/** Alerta para o usuário; `elementId` é o tubo trocado. */
export interface AlertaTroca {
  codigo: CodigoAlertaTroca;
  motivo: string;
  elementId: Id;
}

/**
 * Plano da troca. `ok: false` só com `recusa` (e então `comandos` vazio). Conexão incompatível que o plano remove NÃO é recusa: o plano é
 * `ok`, tem a remoção em `comandos` e `conexoesRemovidas`/`alertas` explicam.
 */
export interface PlanoTrocaBitola {
  ok: boolean;
  recusa?: RecusaTroca;
  comandos: Comando[];
  conexoesTrocadas: ConexaoTrocada[];
  conexoesRemovidas: ConexaoRemovida[];
  reducoesInseridas: ReducaoInserida[];
  /** Tubos curtos inseridos entre conexões vizinhas (ficha F1). */
  tubosInseridos: TuboInserido[];
  alertas: AlertaTroca[];
}

/** Tubo do projeto lido no mundo: extremos (m), ids das ligações do início (`idA`) e do fim (`idB`) e DN (mm). */
export interface Tubo {
  comp: Component;
  familia: Familia;
  a: V3;
  b: V3;
  idA: string;
  idB: string;
  dn: number;
}

/** Posição do tubo durante o plano: centros dos nós (m) e recuo (m) de cada ponta; `tocado` = vira `updateComponent`. */
export interface EstadoTubo {
  tubo: Tubo;
  cen: { a: V3; b: V3 };
  rec: { a: number; b: number };
  tocado: boolean;
}

/** Nó em que um tubo recua por causa de uma peça: serve de candidato à remoção quando a viabilidade bloqueia. */
export interface RegistroNo {
  chave: string;
  tuboId: Id;
  recuo: number;
  /** Nome da peça do nó ('Redução', 'Joelho 90°'...), para o motivo de conexões coladas. */
  rotulo?: string;
}

/** Contexto mutável de uma montagem do plano (`montar`): entradas fixas e acumuladores de comandos e relatórios. */
export interface Ctx {
  p: Project;
  tubo: Tubo;
  novoDn: number;
  tipo: TipoParaNo;
  regras: RegrasConexao;
  /** Nós a remover por bloqueio de viabilidade: chave do nó → motivo. */
  forcados: ReadonlyMap<string, string>;
  geo: Map<Id, EstadoTubo>;
  upserts: Map<string, Familia>;
  desconectar: Array<{ a: Id; lig: string }>;
  desfeitas: Set<string>;
  apagar: Id[];
  adicionar: Array<Omit<Component, 'order'>>;
  atualizar: Array<{ id: Id; patch: Partial<Omit<Component, 'id' | 'kind' | 'order'>> }>;
  conectar: Array<{ a: Id; la: string; b: Id; lb: string }>;
  usados: Set<string>;
  trocadas: ConexaoTrocada[];
  removidas: ConexaoRemovida[];
  reducoes: ReducaoInserida[];
  tubosCurtos: TuboInserido[];
  alertas: AlertaTroca[];
  nos: RegistroNo[];
}
