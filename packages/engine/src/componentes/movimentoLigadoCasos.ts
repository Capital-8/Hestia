import { createEmptyProject, familiaDaBiblioteca, isComponent, ProjectStore, type Component, type Id, type Project } from '@hestia/model';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { ligacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverComponente } from './instancia.ts';
import { planejarMovimentoLigado, type PlanoMovimento } from './movimentoLigado.ts';
import { trechoDeTubo, type PontoSegmento } from './orientarSegmento.ts';
import { posicionarConexao, type ConexaoEncontro } from './posicaoConexao.ts';

/*
 * Redes de teste da ficha F4 (mover com as peças ligadas): montadas à mão (mesma lógica da ferramenta
 * Tubo: `posicionarConexao`, recuo das pontas, ligação pelas portas). Cada caso aplica o plano num store e confere a rede com o MESMO
 * `diagnosticarRede` que o botão Verificar rede usa.
 */

export type V3 = [number, number, number];
export const ELETRODUTO = 'fam_krona_eletrica_tubo_corte';
export const CAIXA = 'fam_krona_eletrica_caixa_4x4';
export const CURVA = 'fam_krona_eletrica_curva90';
export const CORRUGADO = 'fam_tigre_tigreflex_amarelo';
export const ESGOTO = 'fam_krona_esgoto_tubo_corte';
export const JOELHO = 'fam_krona_esgoto_joelho90';
export const TE = 'fam_krona_esgoto_te';

export const comp = (p: Project, id: Id): Component => {
  const c = p.elements[id];
  if (!isComponent(c)) throw new Error('sem ' + id);
  return c;
};

export function novo(...familias: string[]): ProjectStore {
  const store = new ProjectStore(createEmptyProject('t'));
  for (const id of familias) store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(id)!) });
  return store;
}
export const nivel = (s: ProjectStore): Id => s.project.levels[0]!.id;

export function caixa(s: ProjectStore, id: string, x: number, y: number, z: number, rotation = 0): void {
  s.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: CAIXA, typeId: null, levelId: nivel(s), x, y, z, rotation, mirrored: false, mark: id } as Component });
}

/** Porta `lig` de `id` no mundo. */
export function porta(p: Project, id: Id, lig: string) {
  const c = comp(p, id);
  const l = resolverComponente(p, c).ligacoes?.find((q) => q.id === lig);
  if (!l) throw new Error(`sem porta ${id}.${lig}`);
  return ligacaoNoMundo(l, c);
}

/** Trecho de tubo `id` entre dois pontos (m), sem ligar nada. */
export function tubo(s: ProjectStore, id: string, fam: string, dn: number, a: V3, b: V3): void {
  const c = trechoDeTubo(a as PontoSegmento, b as PontoSegmento, { id: fam }, dn, { id, levelId: nivel(s) });
  if (!c) throw new Error('trecho nulo');
  s.exec({ type: 'addComponent', component: c });
}
export const liga = (s: ProjectStore, a: Id, la: string, b: Id, lb: string): void => s.exec({ type: 'connectComponents', a, ligacaoA: la, b, ligacaoB: lb });

/** Caixa—eletroduto—caixa em linha reta (eixo x, z = 0,3555 nas portas). Devolve o store. */
export function caixaTuboCaixa(fam = ELETRODUTO, x2 = 2): ProjectStore {
  const s = novo(fam, CAIXA);
  caixa(s, 'c1', 0, 0, 0.3);
  caixa(s, 'c2', x2, 0, 0.3);
  const a = porta(s.project, 'c1', 'd').posicaoMundo;
  const b = porta(s.project, 'c2', 'c').posicaoMundo;
  tubo(s, 't1', fam, 20, a, b);
  liga(s, 'c1', 'd', 't1', 'a');
  liga(s, 'c2', 'c', 't1', 'b');
  return s;
}

/** Caixa c1—tubo t1—curva—tubo t2—caixa c2 (c2 girada 90°): um L elétrico com peça. */
export function eletricoEmL(): ProjectStore {
  const s = novo(ELETRODUTO, CAIXA, CURVA);
  const N: V3 = [1, 0.0235, 0.3555];
  caixa(s, 'c1', 0, 0, 0.3);
  caixa(s, 'c2', 1.0235, 1.5, 0.3, Math.PI / 2);
  const conexao: ConexaoEncontro = { tipo: 'curva90', familiaId: CURVA, direcoes: [[-1, 0, 0], [0, 1, 0]], diametros: [20, 20] };
  const pos = posicionarConexao(s.project.componentFamilies![CURVA]!, N, conexao)!;
  s.exec({ type: 'addComponent', component: { id: 'p1', kind: 'component', familyId: CURVA, typeId: null, levelId: nivel(s), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: 'p1' } as Component });
  const q = porta(s.project, 'c2', 'c').posicaoMundo;
  tubo(s, 't1', ELETRODUTO, 20, porta(s.project, 'c1', 'd').posicaoMundo as V3, [N[0] - (pos.recuos[0] ?? 0), N[1], N[2]]);
  tubo(s, 't2', ELETRODUTO, 20, [N[0], N[1] + (pos.recuos[1] ?? 0), N[2]], q as V3);
  liga(s, 'c1', 'd', 't1', 'a');
  liga(s, 'p1', pos.ligacoes[0]!, 't1', 'b');
  liga(s, 'p1', pos.ligacoes[1]!, 't2', 'a');
  liga(s, 'c2', 'c', 't2', 'b');
  return s;
}

/** Esgoto Krona DN 100 em L: t0 (x), joelho p1, t1 (y); pontas livres. `z` é a cota. */
export function esgotoEmL(z = 0.5): ProjectStore {
  const s = novo(ESGOTO, JOELHO);
  const N: V3 = [1, 0, z];
  const pos = posicionarConexao(s.project.componentFamilies![JOELHO]!, N, { tipo: 'curva90', familiaId: JOELHO, direcoes: [[-1, 0, 0], [0, 1, 0]], diametros: [100, 100] })!;
  s.exec({ type: 'addComponent', component: { id: 'p1', kind: 'component', familyId: JOELHO, typeId: null, levelId: nivel(s), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: 'p1' } as Component });
  tubo(s, 't0', ESGOTO, 100, [0, 0, z], [N[0] - (pos.recuos[0] ?? 0), 0, z]);
  tubo(s, 't1', ESGOTO, 100, [1, pos.recuos[1] ?? 0, z], [1, 1, z]);
  liga(s, 'p1', pos.ligacoes[0]!, 't0', 'b');
  liga(s, 'p1', pos.ligacoes[1]!, 't1', 'a');
  return s;
}

/** Esgoto com tê no meio de um trecho em x e ramal em y. */
export function esgotoComTe(): ProjectStore {
  const s = novo(ESGOTO, TE);
  const N: V3 = [1, 0, 0.5];
  const conexao: ConexaoEncontro = { tipo: 'te', familiaId: TE, direcoes: [[-1, 0, 0], [1, 0, 0], [0, 1, 0]], diametros: [100, 100, 100] };
  const pos = posicionarConexao(s.project.componentFamilies![TE]!, N, conexao)!;
  s.exec({ type: 'addComponent', component: { id: 'te', kind: 'component', familyId: TE, typeId: null, levelId: nivel(s), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: 'te' } as Component });
  tubo(s, 'ta', ESGOTO, 100, [0, 0, 0.5], [1 - (pos.recuos[0] ?? 0), 0, 0.5]);
  tubo(s, 'tb', ESGOTO, 100, [1 + (pos.recuos[1] ?? 0), 0, 0.5], [2, 0, 0.5]);
  tubo(s, 'tr', ESGOTO, 100, [1, pos.recuos[2] ?? 0, 0.5], [1, 1, 0.5]);
  liga(s, 'te', pos.ligacoes[0]!, 'ta', 'b');
  liga(s, 'te', pos.ligacoes[1]!, 'tb', 'a');
  liga(s, 'te', pos.ligacoes[2]!, 'tr', 'a');
  return s;
}

/** Dois tubos de esgoto em linha, ligados direto (sem luva). `dz` é o desnível do segundo trecho (declividade). */
export function doisTubosDiretos(dz: number): ProjectStore {
  const s = novo(ESGOTO);
  tubo(s, 't0', ESGOTO, 100, [0, 0, 0.5], [1, 0, 0.5 - dz]);
  tubo(s, 't1', ESGOTO, 100, [1, 0, 0.5 - dz], [2, 0, 0.5 - 2 * dz]);
  liga(s, 't0', 'b', 't1', 'a');
  return s;
}

/** Aplica o plano num store (os mesmos comandos que a ferramenta grava) e devolve o diagnóstico da rede. */
export function aplicar(s: ProjectStore, plano: PlanoMovimento): void {
  for (const c of plano.comandos) s.exec(c);
}
export const redeRuim = (p: Project) => diagnosticarRede(p).filter((d) => ['conexao_afastada', 'incompativel', 'conexoes_coladas', 'curvatura_fechada', 'conexao_invalida'].includes(d.codigo));
export const mover = (s: ProjectStore, ids: string[], d: V3): PlanoMovimento => planejarMovimentoLigado(s.project, ids, d);
export const L = (p: Project, id: Id): number => comp(p, id).values?.L as number;

