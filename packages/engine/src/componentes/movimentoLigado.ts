import { isComponent, type Command, type Id, type Project } from '@hestia/model';
import { chaveLigacao, vizinhanca, vizinhoDe, type V3 } from './movimentoLigadoRede.ts';
import { rodada } from './movimentoLigadoRodada.ts';
import { nomeDoComponente } from './movimentoLigadoValida.ts';
import type { AlertaMovimento, LigacaoDesfeita, PlanoMovimento } from './movimentoLigadoTipos.ts';

export type { AlertaMovimento, LigacaoDesfeita, PlanoMovimento, TrechoEsticado } from './movimentoLigadoTipos.ts';

/*
 * Mover com as peças ligadas acompanhando (fase 4, ficha F4; no Revit os tubos ligados esticam junto). `planejarMovimentoLigado` é PURO
 * e determinístico: lê o projeto, não grava nada e devolve o plano (`comandos`, `alertas`, `desfeitas`, `bloqueado?`). As regras estão no
 * cabeçalho de `movimentoLigadoRodada.ts`. O plano nunca grava peça colada ou afastada em silêncio: a ligação que não tem como acompanhar é
 * DESFEITA (`disconnectComponents`) e vira alerta. Quem aplica roda todos os comandos numa única transação (um passo de desfazer).
 *
 * Escolha para a cota (z): o trecho esticado fica UM segmento reto entre as âncoras (inclinado quando o desnível muda). Tubo reto
 * HORIZONTAL de declividade 0 (rígido, elétrico ou hidráulico) não vira inclinado quando o desnível passa de 1 mm: a ligação é desfeita com
 * alerta e a sugestão de desenhar a prumada com a ferramenta Tubo (que já tem joelhos, recuos e viabilidade da B4). Tubo vertical,
 * tubo já inclinado (declividade livre) e corrugado esticam inclinados. O Mover não cria peça nem tubo novo.
 */

/** Profundidade (ligações) da vizinhança lida: peça movida, tubo, conexão do outro lado, tubo seguinte. */
const PROFUNDIDADE = 6;
/** Teto de rodadas (cada uma desfaz pelo menos uma ligação; uma rede real tem poucas). */
const MAX_RODADAS = 60;

const vazio = (extra: Partial<PlanoMovimento> = {}): PlanoMovimento => ({ comandos: [], alertas: [], desfeitas: [], esticados: [], movidos: [], ...extra });

/**
 * Plano de mover os componentes `ids` pelo vetor `d` (m: x, y, z). Componentes sem ligação só andam; os ligados arrastam as conexões e
 * esticam os tubos. Conjunto fechado (todo o ligado selecionado) anda sem esticar nada.
 */
export function planejarMovimentoLigado(p: Project, ids: readonly Id[], d: V3): PlanoMovimento {
  const pedidos = [...new Set(ids)].filter((id) => isComponent(p.elements[id]));
  if (pedidos.length === 0 || Math.hypot(d[0], d[1], d[2]) < 1e-9) return vazio();
  const rede = vizinhanca(p, pedidos, PROFUNDIDADE);
  const cortes = new Set<string>();
  const desfeitas: LigacaoDesfeita[] = [];
  for (let i = 0; i < MAX_RODADAS; i++) {
    const r = rodada(p, pedidos, d, rede, cortes);
    if (r.tipo === 'bloqueio') return vazio({ bloqueado: r.motivo, trechoBloqueado: { a: r.a, b: r.b } });
    if (r.tipo === 'ok') {
      const comandos: Command[] = [
        ...desfeitas.map((f): Command => ({ type: 'disconnectComponents', a: f.elementId, ligacaoA: f.ligacaoId })),
        ...[...r.patches].map(([id, patch]): Command => ({ type: 'updateComponent', id, patch })),
      ];
      const alertas: AlertaMovimento[] = [...desfeitas.map((f): AlertaMovimento => ({ codigo: 'ligacao_desfeita', motivo: f.motivo, elementId: f.elementId })), ...r.avisos];
      return { comandos, alertas, desfeitas, esticados: r.esticados, movidos: [...r.movidos] };
    }
    const novos = r.cortar.filter((c) => !cortes.has(chaveLigacao(c.a, c.la)));
    if (novos.length === 0) return vazio({ bloqueado: `Não foi possível mover acompanhando as ligações: ${r.motivo}` });
    for (const c of novos) {
      const dono = p.elements[c.a];
      const v = isComponent(dono) ? vizinhoDe(p, dono, c.la) : undefined;
      if (!isComponent(dono) || !v) continue;
      cortes.add(chaveLigacao(c.a, c.la));
      cortes.add(chaveLigacao(v.comp.id, v.ligacaoId));
      desfeitas.push({ elementId: c.a, ligacaoId: c.la, outroId: v.comp.id, outraLigacaoId: v.ligacaoId, motivo: `Ligação entre ${nomeDoComponente(p, dono)} e ${nomeDoComponente(p, v.comp)} desfeita: ${r.motivo}` });
    }
  }
  return vazio({ bloqueado: 'Não foi possível mover acompanhando as ligações: a rede tem ligações demais a desfazer.' });
}
