import { planejarTrocaDeBitola, type PlanoTrocaBitola } from '@hestia/engine';
import { ProjectStore, type Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/*
 * Aplicação da troca de bitola (fase 3, ficha B3). O planejador (`planejarTrocaDeBitola`, engine) não grava nada; aqui os comandos do
 * plano rodam TODOS numa única transação (um passo de desfazer). Nada lança dentro da transação: `ProjectStore.transaction` grava os
 * patches no `finally` mesmo se a função lançar, deixando o projeto pela metade. Por isso o plano é ensaiado antes num store
 * descartável (o projeto é imutável: o ensaio não toca o real) e só vai para o projeto de verdade se passar inteiro.
 */

/** O que a aplicação precisa do ambiente: o projeto, os comandos e a transação (um `ToolEnv` serve; a interface monta o seu). */
export type AmbienteTroca = Pick<ToolEnv, 'project' | 'exec' | 'transaction'>;

export interface ResultadoTroca {
  /** `true` = o DN trocou (com ou sem alertas). `false` = recusado ou impossível; nada mudou. */
  ok: boolean;
  /** Motivo da recusa (bitola fora da lista, tubo inexistente ou plano que não passou no ensaio). */
  recusa?: string;
  /** Mensagens dos alertas, em português, uma por conexão removida ou aviso. */
  mensagens: string[];
}

/** Texto único para a barra de status: a recusa, ou os alertas separados por espaço; vazio se nada a dizer. */
export function textoDaTroca(r: ResultadoTroca): string {
  return r.recusa ?? r.mensagens.join(' ');
}

/** Roda os comandos do plano num store descartável; devolve a mensagem do primeiro erro, ou `null` se tudo passou. */
function ensaiar(env: AmbienteTroca, plano: PlanoTrocaBitola): string | null {
  const rascunho = new ProjectStore(env.project());
  try {
    for (const c of plano.comandos) rascunho.exec(c);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Aplica o plano: valida, e só então executa todos os comandos numa transação. Plano recusado ou que falha no ensaio não altera nada
 * (`ok: false`). Plano sem comandos (mesmo DN) é `ok` e não cria passo de desfazer.
 */
export function aplicarTrocaDeBitola(env: AmbienteTroca, plano: PlanoTrocaBitola): ResultadoTroca {
  if (!plano.ok) return { ok: false, recusa: plano.recusa?.motivo ?? 'Troca de bitola recusada.', mensagens: [] };
  const mensagens = plano.alertas.map((a) => a.motivo);
  if (plano.comandos.length === 0) return { ok: true, mensagens };
  const erro = ensaiar(env, plano);
  if (erro !== null) return { ok: false, recusa: `Não foi possível trocar a bitola: ${erro}`, mensagens: [] };
  env.transaction('Trocar bitola do tubo', () => {
    for (const c of plano.comandos) env.exec(c);
  });
  return { ok: true, mensagens };
}

/** Planeja e aplica a troca do DN do tubo `tuboId` para `novoDn` (mm). */
export function trocarBitolaDoTubo(env: AmbienteTroca, tuboId: Id, novoDn: number): ResultadoTroca {
  return aplicarTrocaDeBitola(env, planejarTrocaDeBitola(env.project(), tuboId, novoDn));
}
