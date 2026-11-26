import type { Command, Component, Id } from '@hestia/model';
import type { V3 } from './movimentoLigadoRede.ts';

/* Tipos do planejamento do movimento com as peças ligadas (fase 4, ficha F4). Unidades: metros e radianos nas geometrias, mm nos motivos. */

/** Alerta para o usuário: `ligacao_desfeita` (uma ligação não tinha como acompanhar) ou `declividade_fora_do_limite` (aviso, nada é desfeito). */
export interface AlertaMovimento {
  codigo: 'ligacao_desfeita' | 'declividade_fora_do_limite';
  motivo: string;
  elementId: Id;
}

/** Ligação que o plano desfaz: a ponta `ligacaoId` de `elementId` estava ligada à `outraLigacaoId` de `outroId`. */
export interface LigacaoDesfeita {
  elementId: Id;
  ligacaoId: string;
  outroId: Id;
  outraLigacaoId: string;
  motivo: string;
}

/** Trecho de tubo com as pontas NOVAS (m), para a prévia (fantasma) e para o relatório. */
export interface TrechoEsticado {
  id: Id;
  a: V3;
  b: V3;
  dn: number;
}

/**
 * Plano do movimento. `comandos` rodam todos numa única transação (um passo de desfazer). `bloqueado` (motivo) = o gesto inteiro é
 * recusado e `comandos` vem vazio; `trechoBloqueado` é o segmento que causou o bloqueio (pontas em m), para a prévia vermelha.
 */
export interface PlanoMovimento {
  comandos: Command[];
  alertas: AlertaMovimento[];
  desfeitas: LigacaoDesfeita[];
  bloqueado?: string;
  trechoBloqueado?: { a: V3; b: V3 };
  /** Tubos que esticam, encurtam ou giram (as pontas novas). */
  esticados: TrechoEsticado[];
  /** Todos os componentes que andam o vetor inteiro: os pedidos mais as conexões arrastadas. */
  movidos: Id[];
}

export type PatchComponente = Partial<Omit<Component, 'id' | 'kind' | 'order'>>;

/** Uma ligação a desfazer porque não tem como acompanhar (a ponta `la` de `a`), com o motivo. */
export interface Falha {
  tipo: 'falha';
  motivo: string;
  cortar: Array<{ a: Id; la: string }>;
}

export interface Bloqueio {
  tipo: 'bloqueio';
  motivo: string;
  a: V3;
  b: V3;
}

export interface Rodada {
  tipo: 'ok';
  patches: Map<Id, PatchComponente>;
  esticados: TrechoEsticado[];
  movidos: Set<Id>;
  avisos: AlertaMovimento[];
}
