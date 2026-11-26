import { centroDaPeca, classeDe, diagnosticarRede, planejarMovimentoLigado, portasNoMundo, trechoDeTubo, type AlertaMovimento, type OpcoesMovimento, type PlanoMovimento, type TrechoEsticado } from '@hestia/engine';
import { isComponent, ProjectStore, type Command, type Component, type Id, type Project } from '@hestia/model';
import { itensDoBloqueio } from './tuboBloqueio.ts';
import { fantasmaDoTrecho } from './tuboApoio.ts';
import type { PreviewItem, ToolEnv } from './types.ts';
import { ferramentaDeRota, regrasDoTrecho, trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';
import { garantirFamilias } from './tuboDerivacao.ts';
import { pontasDoTubo } from './tuboApoio.ts';
import type { PontoTubo } from './tuboGeometria.ts';

/*
 * Plano de uma edição de trecho de tubo ou eletroduto (fase 4, ficha F6a): o resultado comum dos pegadores, de Aparar/Estender e de
 * Dividir. É PURO até `aplicarPlanoTrecho`: lê o projeto e devolve comandos, rotas a gravar, alertas, a prévia e, se inviável, o
 * bloqueio com motivo e sugestão. Quem aplica ensaia tudo num projeto descartável e só então grava, num único passo de desfazer.
 */

export type V3 = [number, number, number];

/** Rota entre duas portas a gravar depois dos `comandos` (prumada, joelhos e tubos curtos pelo motor do Tubo: `TuboTool.gravarRota`). */
export interface RotaDoPlano {
  /** Trecho cuja família, DN e tipo a rota usa. */
  trechoId: Id;
  de: PontoTubo;
  para: PontoTubo;
  /** Pontos da rota que a prévia desenha (inclui `de` e `para`). */
  pts: PontoTubo[];
  dns: number[];
}

/** Passo de gravação feito com o ambiente (usa as funções de conexão do Tubo); devolve `false` se não deu (o plano inteiro é recusado). */
export type PassoDoPlano = (env: ToolEnv, avisos: string[]) => boolean;

export interface PlanoTrecho {
  comandos: Command[];
  /** Passos feitos depois dos `comandos` e antes das `rotas`. */
  passos?: PassoDoPlano[];
  rotas: RotaDoPlano[];
  alertas: AlertaMovimento[];
  esticados: TrechoEsticado[];
  /** Trechos novos que a prévia mostra em fantasma além dos esticados. */
  fantasmas: Array<{ a: V3; b: V3; dn: number }>;
  bloqueado?: string;
  sugestao?: string | null;
  trechoBloqueado?: { a: V3; b: V3 };
  /** Ligações que o plano desfaz sem mover nada (texto para a fala). */
  nota?: string;
}

export const planoVazio = (extra: Partial<PlanoTrecho> = {}): PlanoTrecho => ({ comandos: [], rotas: [], alertas: [], esticados: [], fantasmas: [], ...extra });

export const bloqueio = (motivo: string, sugestao: string | null, a: V3, b: V3): PlanoTrecho => planoVazio({ bloqueado: motivo, sugestao, trechoBloqueado: { a, b } });

/** Sugestão padrão por tipo de motivo (nada de valor de norma: só o caminho para resolver). */
export function sugestaoDoMotivo(motivo: string): string | null {
  if (/comprimento máximo/.test(motivo)) return 'Sugestão: divida o trecho com a ferramenta Dividir (a emenda automática por barra é a ficha F6b).';
  if (/abaixo do mínimo|mesmo ponto|comprimento nulo/.test(motivo)) return 'Sugestão: mantenha o trecho mais longo ou apague-o.';
  if (/raio mínimo/.test(motivo)) return 'Sugestão: abra o ângulo do canto ou alongue o trecho.';
  return null;
}

/** Projeto descartável com os comandos aplicados; `null` e o motivo se algum falha. */
export function projetoCom(p: Project, cmds: readonly Command[]): { p: Project; erro: null } | { p: null; erro: string } {
  const rascunho = new ProjectStore(p);
  try {
    for (const c of cmds) rascunho.exec(c);
    return { p: rascunho.project, erro: null };
  } catch (e) {
    return { p: null, erro: e instanceof Error ? e.message : String(e) };
  }
}

const CODIGOS_DE_REDE = new Set(['conexao_afastada', 'incompativel', 'conexoes_coladas', 'ligacao_incompativel', 'conexao_invalida', 'curvatura_fechada']);

const NOME_DO_PROBLEMA: Readonly<Record<string, string>> = {
  conexao_afastada: 'ligação afastada',
  incompativel: 'ligação incompatível',
  ligacao_incompativel: 'ligação incompatível',
  conexao_invalida: 'conexão inválida',
  conexoes_coladas: 'conexões coladas (falta o tubo curto entre elas)',
  curvatura_fechada: 'curvatura mais fechada que o raio mínimo',
};

const chaveDeProblema = (d: { codigo: string; elementId?: Id; ligacaoId?: string }): string => `${d.codigo}|${d.elementId ?? ''}|${d.ligacaoId ?? ''}`;

/** Problemas de rede que `depois` tem e `antes` não tinha (afastada, incompatível, colada, curvatura): o que a edição causou. */
export function problemasNovos(antes: Project, depois: Project): string[] {
  const velhos = new Set(diagnosticarRede(antes).filter((d) => CODIGOS_DE_REDE.has(d.codigo)).map(chaveDeProblema));
  return diagnosticarRede(depois).filter((d) => CODIGOS_DE_REDE.has(d.codigo) && !velhos.has(chaveDeProblema(d))).map((d) => NOME_DO_PROBLEMA[d.codigo] ?? d.codigo);
}

/** Ambiente que grava num projeto descartável (para ensaiar). */
function ambienteDeEnsaio(env: ToolEnv, rascunho: ProjectStore, falas: string[]): ToolEnv {
  return { ...env, project: () => rascunho.project, exec: (c) => rascunho.exec(c), transaction: (l, fn) => rascunho.transaction(l, fn), say: (m: string) => { falas.push(m); }, abrirTracado: () => {}, ...(env.alert ? { alert: () => {} } : {}) };
}

export type ResultadoAplicacao = { ok: true; avisos: string[] } | { ok: false; motivo: string };

/** Grava os `comandos`, os passos e as rotas (retorno `false` = recusada) numa transação do ambiente `env`; os avisos dos passos vão em `avisos`. */
function gravar(env: ToolEnv, plano: PlanoTrecho, rotulo: string, avisos: string[]): boolean {
  let ok = true;
  env.transaction(rotulo, () => {
    for (const c of plano.comandos) env.exec(c);
    for (const passo of plano.passos ?? []) {
      if (!passo(env, avisos)) { ok = false; return; }
    }
    for (const r of plano.rotas) {
      const t = trechoDoProjeto(env.project(), r.trechoId);
      const c = env.project().elements[r.trechoId];
      if (!t || !isComponent(c)) { ok = false; return; }
      // O projeto pode ter o tubo sem as conexões do tipo (projeto de exemplo): elas entram junto com a rota, como no Tubo.
      const familia = env.project().componentFamilies?.[c.familyId];
      const pontas = familia ? pontasDoTubo(familia, t.tubo.dn) : null;
      if (familia && pontas) garantirFamilias(env, { familia, pontas }, regrasDoTrecho(t.tubo), true);
      if (!ferramentaDeRota(env, c, t.tubo).gravarRota(r.de, r.para)) { ok = false; return; }
    }
  });
  return ok;
}

/**
 * Ensaia o plano num projeto descartável (comandos, rotas e a conferência da rede: nada de ligação afastada, incompatível ou colada a
 * mais), sem gravar nada no projeto de verdade. Plano bloqueado devolve o próprio motivo.
 */
export function ensaiarPlano(env: ToolEnv, plano: PlanoTrecho, rotulo: string): ResultadoAplicacao {
  if (plano.bloqueado !== undefined) return { ok: false, motivo: plano.bloqueado + (plano.sugestao ? ' ' + plano.sugestao : '') };
  const antes = env.project();
  const rascunho = new ProjectStore(antes);
  const falas: string[] = [];
  const ee = ambienteDeEnsaio(env, rascunho, falas);
  let ok = false;
  const avisosDosPassos: string[] = [];
  try {
    ok = gravar(ee, plano, rotulo, avisosDosPassos);
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
  if (!ok) return { ok: false, motivo: (falas.filter((f) => f.startsWith('Bloqueado')).pop() ?? avisosDosPassos.pop() ?? falas.pop() ?? 'Não foi possível gravar a rota.').replace(/^Bloqueado: /, '') };
  const novos = problemasNovos(antes, rascunho.project);
  if (novos.length > 0) return { ok: false, motivo: `A rede ficaria com problema: ${novos[0]}` };
  return { ok: true, avisos: [...plano.alertas.map((a) => a.motivo), ...avisosDosPassos] };
}

/** Aplica o plano (depois de ensaiá-lo) num único passo de desfazer. Plano bloqueado ou ensaio que falha não grava nada. */
export function aplicarPlanoTrecho(env: ToolEnv, plano: PlanoTrecho, rotulo: string): ResultadoAplicacao {
  const ensaio = ensaiarPlano(env, plano, rotulo);
  if (!ensaio.ok) return ensaio;
  if (!gravar(env, plano, rotulo, [])) return { ok: false, motivo: 'Não foi possível gravar a edição.' };
  return ensaio;
}

/** Prévia: bloqueado, o trecho em vermelho com o motivo e a sugestão; senão os tubos esticados e os trechos novos em fantasma. */
export function itensDoPlanoTrecho(p: Project, plano: PlanoTrecho | null): PreviewItem[] {
  if (!plano) return [];
  if (plano.bloqueado !== undefined) {
    const t = plano.trechoBloqueado;
    return t ? itensDoBloqueio({ a: { x: t.a[0], y: t.a[1] }, b: { x: t.b[0], y: t.b[1] }, motivo: plano.bloqueado, sugestao: plano.sugestao ?? null }, true) : [];
  }
  return [...plano.esticados.flatMap((e) => fantasmaDoTrecho(p, e.dn, e.a, e.b)), ...plano.fantasmas.flatMap((f) => fantasmaDoTrecho(p, f.dn, f.a, f.b))];
}

/** Texto da fala/alerta do plano: uma frase por ligação desfeita ou aviso; vazio se não há nada a dizer. */
export function textoDoPlanoTrecho(plano: PlanoTrecho | null): string {
  return plano ? [...plano.alertas.map((a) => a.motivo), ...(plano.nota ? [plano.nota] : [])].join(' ') : '';
}

// ---- ponta do trecho ---------------------------------------------------------------------------------------------------------

/** Vizinho ligado à ponta `ligacaoId` de `c`, ou `undefined` se está aberta. */
export function vizinhoDaPonta(p: Project, c: Component, ligacaoId: string): { comp: Component; ligacaoId: string } | undefined {
  const cx = c.ligacoes?.[ligacaoId];
  const o = cx ? p.elements[cx.componenteId] : undefined;
  return cx && isComponent(o) ? { comp: o, ligacaoId: cx.ligacaoId } : undefined;
}

const NIVEL = 0.001;
const subV = (u: readonly number[], v: readonly number[]): V3 => [(u[0] ?? 0) - (v[0] ?? 0), (u[1] ?? 0) - (v[1] ?? 0), (u[2] ?? 0) - (v[2] ?? 0)];

/** Converte a recusa do planejador em bloqueio quando o motivo é de comprimento mínimo ou de raio de curvatura (não faz sentido desfazer a ligação por isso). */
export function bloqueiaSeInviavel(plano: PlanoMovimento, ref: { a: V3; b: V3 }): PlanoTrecho | null {
  if (plano.bloqueado !== undefined) {
    const t = plano.trechoBloqueado ?? ref;
    return bloqueio(plano.bloqueado[0]?.toUpperCase() + plano.bloqueado.slice(1), sugestaoDoMotivo(plano.bloqueado), t.a, t.b);
  }
  const duro = plano.alertas.find((a) => a.codigo === 'ligacao_desfeita' && /abaixo do mínimo|raio mínimo|mesmo ponto|comprimento nulo/.test(a.motivo));
  if (duro) {
    const motivo = duro.motivo.replace(/^Ligação entre .*? desfeita: /, '');
    return bloqueio(motivo[0]?.toUpperCase() + motivo.slice(1), sugestaoDoMotivo(motivo), ref.a, ref.b);
  }
  return null;
}

/** Cota do destino de uma ponta: a da `cota` (campo Cota com a tecla de cota), a que mantém a declividade do trecho inclinado, ou a da própria ponta. */
export function cotaDoDestino(E: V3, O: V3, xy: { x: number; y: number }, cota: number | undefined): number {
  if (cota !== undefined) return cota;
  const hVelho = Math.hypot(E[0] - O[0], E[1] - O[1]);
  const dz = E[2] - O[2];
  if (hVelho > NIVEL && Math.abs(dz) > NIVEL) return O[2] + (dz / hVelho) * Math.hypot(xy.x - O[0], xy.y - O[1]);
  return E[2];
}

/** Tubos presos à conexão `j` (fora `t`) cuja outra ponta é livre e que o deslocamento `d` empurra de lado: andam inteiros com ela. */
function tubosLivresDaPeca(p: Project, j: Component, t: TrechoAlvo, d: V3): Id[] {
  const out: Id[] = [];
  for (const porta of portasNoMundo(p, j)) {
    const v = vizinhoDaPonta(p, j, porta.id);
    if (!v || v.comp.id === t.id || classeDe(p, v.comp) !== 'tubo') continue;
    const outro = trechoDoProjeto(p, v.comp.id);
    if (!outro) continue;
    const idLonge = v.ligacaoId === outro.tubo.idA ? outro.tubo.idB : outro.tubo.idA;
    if (v.comp.ligacoes?.[idLonge]) continue;
    const eixo = subV(outro.b, outro.a);
    const n = Math.hypot(eixo[0], eixo[1], eixo[2]);
    if (n < 1e-9) continue;
    const u = [eixo[0] / n, eixo[1] / n, eixo[2] / n];
    const along = d[0] * u[0]! + d[1] * u[1]! + d[2] * u[2]!;
    const perp = Math.hypot(d[0] - along * u[0]!, d[1] - along * u[1]!, d[2] - along * u[2]!);
    if (perp > NIVEL) out.push(v.comp.id);
  }
  return out;
}

export interface OpcoesPonta {
  /** Cota (m) do destino (campo Cota com a tecla de cota); sem ela a ponta fica na cota que mantém a declividade. */
  cota?: number;
  /** Alt: solta as ligações (a ponta anda sozinha, só esticando o trecho). */
  solta?: boolean;
}

/**
 * Plano de levar a ponta `fim` do trecho `id` ao ponto `destino` (m, plano). Ponta livre só estica (`pontaLivre` do planejador); ponta
 * ligada a uma CONEXÃO leva a conexão junto (o nó vai ao destino), re-resolvida pelo planejador (joelho para o ângulo novo, tubo
 * curto da F1, DN); tubo livre preso à conexão que o gesto empurra de lado anda inteiro, para o canto continuar a 90°. Ponta ligada a
 * caixa, dispositivo ou outro tubo solta a ligação (com alerta). Corrugado e declividade seguem as regras do planejador.
 */
export function planejarPonta(p: Project, id: Id, fim: 'a' | 'b', destino: { x: number; y: number }, opc: OpcoesPonta = {}): PlanoTrecho {
  const t = trechoDoProjeto(p, id);
  if (!t) return planoVazio();
  const E = fim === 'a' ? t.a : t.b;
  const ligId = fim === 'a' ? t.tubo.idA : t.tubo.idB;
  const viz = vizinhoDaPonta(p, t.tubo.c, ligId);
  const peca = !opc.solta && viz && classeDe(p, viz.comp) === 'peca' ? viz.comp : null;
  const ref: V3 = peca ? centroDaPeca(p, peca) : E;
  const z = cotaDoDestino(ref, fim === 'a' ? t.b : t.a, destino, opc.cota);
  const dest: V3 = [destino.x, destino.y, z];
  const d: V3 = [dest[0] - ref[0], dest[1] - ref[1], dest[2] - ref[2]];
  if (Math.hypot(...d) < 1e-6) return planoVazio();
  const vermelho = { a: (fim === 'a' ? dest : t.a) as V3, b: (fim === 'b' ? dest : t.b) as V3 };
  let pr = p;
  const solta: Command[] = [];
  const alertas: AlertaMovimento[] = [];
  let opcoes: OpcoesMovimento = {};
  let pedidos: Id[] = [];
  if (peca) {
    pedidos = [peca.id, ...tubosLivresDaPeca(p, peca, t, d)];
  } else {
    if (viz) {
      solta.push({ type: 'disconnectComponents', a: id, ligacaoA: ligId });
      alertas.push({ codigo: 'ligacao_desfeita', elementId: id, motivo: `A ligação do trecho com ${viz.comp.mark.trim() !== '' ? viz.comp.mark : (p.componentFamilies?.[viz.comp.familyId]?.nome ?? viz.comp.familyId)} foi desfeita: a ponta saiu de lá.` });
      const feito = projetoCom(p, solta);
      if (feito.p === null) return bloqueio(feito.erro, null, vermelho.a, vermelho.b);
      pr = feito.p;
    }
    opcoes = { pontaLivre: { tuboId: id, fim, pt: dest } };
  }
  const plano = planejarMovimentoLigado(pr, pedidos, peca ? d : [0, 0, 0], opcoes);
  const recusa = bloqueiaSeInviavel(plano, vermelho);
  if (recusa) return recusa;
  return planoVazio({ comandos: [...solta, ...plano.comandos], alertas: [...alertas, ...plano.alertas], esticados: plano.esticados });
}

/** Comando que põe o trecho `t` nas pontas `a` e `b` (m) mantendo instância, família e DN; `null` se o segmento degenera. */
export function comandoDePose(p: Project, t: TrechoAlvo, a: V3, b: V3): Command | null {
  const c = p.elements[t.id];
  const novo = isComponent(c) ? trechoDeTubo(a, b, { id: c.familyId }, t.tubo.dn, { id: t.id, levelId: c.levelId }) : null;
  if (!isComponent(c) || !novo) return null;
  return { type: 'updateComponent', id: t.id, patch: { x: novo.x, y: novo.y, z: novo.z, rotation: novo.rotation, inclinacao: novo.inclinacao, values: { ...c.values, L: novo.values?.L ?? 0 } } };
}
