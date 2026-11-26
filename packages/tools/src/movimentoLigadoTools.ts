import { planejarMovimentoLigado, type PlanoMovimento } from '@hestia/engine';
import { isComponent, ProjectStore, type Command, type Id, type Project } from '@hestia/model';
import { fantasmaDoTrecho } from './tuboApoio.ts';
import { itensDoBloqueio } from './tuboBloqueio.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/*
 * Mover e arrastar componentes com as peças ligadas acompanhando (fase 4, ficha F4): a ponte entre o gesto (poses do arrasto, no plano)
 * e o planejador puro `planejarMovimentoLigado` do engine. O arrasto de componentes continua gravando as poses dos selecionados; o plano
 * acrescenta, no MESMO passo de desfazer, as conexões arrastadas, os tubos esticados e as ligações desfeitas.
 */

/** Pose no plano de um membro do arrasto (a mesma forma de `PoseNoPlano`, sem importar o arrasto). */
export interface PoseDoGesto {
  x: number;
  y: number;
  rotation: number;
}

/** O que o gesto precisa do ambiente para gravar o plano. */
export type AmbienteMovimento = Pick<ToolEnv, 'project' | 'exec' | 'transaction' | 'say'> & Partial<Pick<ToolEnv, 'alert'>>;

const TOL = 1e-6;

/**
 * Deslocamento rígido (m) que as poses representam: o mesmo para todos os membros e sem giro. `null` se algum membro girou ou andou
 * diferente dos outros (nesse caso o gesto não tem um vetor único e as ligações não acompanham) ou se não andou nada.
 */
export function deslocamentoRigido(pr: Project, poses: ReadonlyMap<Id, PoseDoGesto>): [number, number, number] | null {
  let d: [number, number, number] | null = null;
  for (const [id, pose] of poses) {
    const c = pr.elements[id];
    if (!isComponent(c) || Math.abs(pose.rotation - c.rotation) > TOL) return null;
    const mine: [number, number, number] = [pose.x - c.x, pose.y - c.y, 0];
    if (d && (Math.abs(mine[0] - d[0]) > TOL || Math.abs(mine[1] - d[1]) > TOL)) return null;
    d ??= mine;
  }
  return d && Math.hypot(d[0], d[1]) > TOL ? d : null;
}

/** Plano do gesto, ou `null` quando as ligações não acompanham (opção desligada, giro ou nada a mover). */
export function planoDoGesto(pr: Project, poses: ReadonlyMap<Id, PoseDoGesto>, acompanhar: boolean): PlanoMovimento | null {
  if (!acompanhar) return null;
  const d = deslocamentoRigido(pr, poses);
  return d ? planejarMovimentoLigado(pr, [...poses.keys()], d) : null;
}

/** Texto das ligações desfeitas e dos avisos (uma frase por item); vazio se não há nada a dizer. */
export function textoDoPlano(plano: PlanoMovimento | null): string {
  return plano ? plano.alertas.map((a) => a.motivo).join(' ') : '';
}

/** Prévia: os tubos esticados em fantasma tracejado (com o comprimento); bloqueado, o trecho em vermelho com o motivo. */
export function itensDoPlano(pr: Project, plano: PlanoMovimento | null): PreviewItem[] {
  if (!plano) return [];
  if (plano.bloqueado !== undefined) {
    const t = plano.trechoBloqueado;
    return t ? itensDoBloqueio({ a: { x: t.a[0], y: t.a[1] }, b: { x: t.b[0], y: t.b[1] }, motivo: plano.bloqueado, sugestao: null }, true) : [];
  }
  return plano.esticados.flatMap((e) => fantasmaDoTrecho(pr, e.dn, e.a, e.b));
}

/** Comandos do plano que o arrasto ainda não gravou: sem o `updateComponent` dos próprios selecionados (as poses deles já vão no arrasto). */
function comandosExtras(plano: PlanoMovimento, ids: ReadonlySet<Id>): Command[] {
  return plano.comandos.filter((c) => !(c.type === 'updateComponent' && ids.has(c.id)));
}

/** Roda os comandos num store descartável (o projeto é imutável): a mensagem do primeiro erro, ou `null` se tudo passou. */
function ensaiar(pr: Project, cmds: readonly Command[]): string | null {
  const rascunho = new ProjectStore(pr);
  try {
    for (const c of cmds) rascunho.exec(c);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Grava o plano dentro da transação aberta pelo chamador (um só passo de desfazer com as poses do arrasto) e avisa. Plano bloqueado ou
 * que não passa no ensaio não grava nada e devolve `false` (o chamador cancela o gesto). `ids` são os selecionados.
 */
export function aplicarPlanoDoGesto(env: AmbienteMovimento, plano: PlanoMovimento, ids: readonly Id[]): boolean {
  if (plano.bloqueado !== undefined) {
    env.say(`Bloqueado: ${plano.bloqueado}`);
    return false;
  }
  const extras = comandosExtras(plano, new Set(ids));
  const erro = ensaiar(env.project(), extras);
  if (erro !== null) {
    env.say(`Não foi possível acompanhar as ligações: ${erro}`);
    return false;
  }
  for (const c of extras) env.exec(c);
  const texto = textoDoPlano(plano);
  if (texto !== '') {
    if (env.alert) env.alert(texto);
    else env.say(texto);
  }
  return true;
}
