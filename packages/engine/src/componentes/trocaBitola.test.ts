import { createEmptyProject, familiaDaBiblioteca, isComponent, ProjectStore, type Component, type Id, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { avaliarEncontro, posicionarConexao, type ConexaoEncontro } from './conexoesAutomaticas.ts';
import { lacunaMinima } from './conformidadeConexoes.ts';
import { trechoDeTubo, type PontoSegmento } from './orientarSegmento.ts';
import { resolverNo, type EntradaNo } from './resolvedorNo.ts';
import { regrasDoTubo, tipoDaFamiliaDeTubo } from './tiposTubulacao.ts';
import { planejarTrocaDeBitola } from './trocaBitola.ts';

/*
 * Troca de bitola (ficha B3): resolvedor `ajustada` e planejador, sobre redes montadas aqui à mão (mesma lógica da ferramenta Tubo:
 * decisão do nó, `posicionarConexao`, recuo das pontas), sem passar pela viabilidade do desenho para poder montar casos extremos.
 */

const KRONA = 'fam_krona_esgoto_tubo_corte';
const GENERICO = 'fam_tubo_esgoto';
type V3 = [number, number, number];

interface Rede {
  store: ProjectStore;
  tubos: Id[];
  pecas: Id[];
}

const porId = (p: Project, id: Id): Component => {
  const c = p.elements[id];
  if (!isComponent(c)) throw new Error('sem ' + id);
  return c;
};

/** Projeto com a família do tubo e as das conexões do domínio, vindas da biblioteca. */
function projetoCom(tuboId: string): ProjectStore {
  const store = new ProjectStore(createEmptyProject('t'));
  const regras = regrasDoTubo(tuboId, 'esgoto');
  for (const id of new Set([tuboId, ...Object.values(regras ?? {})])) {
    const f = id === '' ? null : familiaDaBiblioteca(id);
    if (f) store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  }
  return store;
}

/**
 * Cadeia de tubos DN `dn` pelos pontos `pts` (m), com a peça que a ferramenta Tubo poria em cada vértice (joelho, luva ou ligação
 * direta) e cada trecho recuado pela bolsa. Ids: tubos `t0`, `t1`..., peças `p1`, `p2`...
 */
function cadeia(tuboId: string, pts: V3[], dn: number, direto = false): Rede {
  const store = projetoCom(tuboId);
  const p = store.project;
  const nivel = p.levels[0]?.id ?? 'lv_0';
  const regras = regrasDoTubo(tuboId, 'esgoto');
  if (!regras) throw new Error('sem regras');
  const ini = pts.slice(0, -1).map((q) => [...q] as V3);
  const fim = pts.slice(1).map((q) => [...q] as V3);
  const nos: Array<{ i: number; conexao: ConexaoEncontro }> = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = { a: pts[i - 1] as PontoSegmento, b: pts[i] as PontoSegmento, dn };
    const B = { a: pts[i] as PontoSegmento, b: pts[i + 1] as PontoSegmento, dn };
    const r = avaliarEncontro(A, 'b', B, 'a', regras);
    if (r.conexao && r.conexao.tipo !== 'luva') nos.push({ i, conexao: r.conexao });
  }
  const pecas: Id[] = [];
  const posicoes = new Map<number, ReturnType<typeof posicionarConexao>>();
  for (const { i, conexao } of nos) {
    const pos = posicionarConexao(store.project.componentFamilies![conexao.familiaId]!, pts[i] as PontoSegmento, conexao);
    if (!pos) throw new Error('sem posição');
    posicoes.set(i, pos);
    const dir = (q: V3, r: V3): V3 => { const d: V3 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]]; const n = Math.hypot(...d); return [d[0] / n, d[1] / n, d[2] / n]; };
    fim[i - 1] = [pts[i]![0] - dir(pts[i - 1]!, pts[i]!)[0] * (pos.recuos[0] ?? 0), pts[i]![1] - dir(pts[i - 1]!, pts[i]!)[1] * (pos.recuos[0] ?? 0), pts[i]![2] - dir(pts[i - 1]!, pts[i]!)[2] * (pos.recuos[0] ?? 0)];
    ini[i] = [pts[i]![0] + dir(pts[i]!, pts[i + 1]!)[0] * (pos.recuos[1] ?? 0), pts[i]![1] + dir(pts[i]!, pts[i + 1]!)[1] * (pos.recuos[1] ?? 0), pts[i]![2] + dir(pts[i]!, pts[i + 1]!)[2] * (pos.recuos[1] ?? 0)];
  }
  const tubos = ini.map((_, i) => `t${i}`);
  tubos.forEach((id, i) => {
    const c = trechoDeTubo(ini[i]!, fim[i]!, { id: tuboId }, dn, { id, levelId: nivel });
    if (!c) throw new Error('trecho nulo');
    store.exec({ type: 'addComponent', component: c });
  });
  for (let i = 1; i < pts.length - 1; i++) {
    const pos = posicoes.get(i);
    const conexao = nos.find((n) => n.i === i)?.conexao;
    if (pos && conexao) {
      const id = `p${i}`;
      pecas.push(id);
      store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: conexao.familiaId, typeId: null, levelId: nivel, x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' } });
      store.exec({ type: 'connectComponents', a: id, ligacaoA: pos.ligacoes[0] ?? '', b: `t${i - 1}`, ligacaoB: 'b' });
      store.exec({ type: 'connectComponents', a: id, ligacaoA: pos.ligacoes[1] ?? '', b: `t${i}`, ligacaoB: 'a' });
    } else if (direto || !regras.luva) {
      store.exec({ type: 'connectComponents', a: `t${i - 1}`, ligacaoA: 'b', b: `t${i}`, ligacaoB: 'a' });
    }
  }
  return { store, tubos, pecas };
}

const L: V3[] = [[0, 0, 0.5], [1, 0, 0.5], [1, 1, 0.5]];
const ids = (cs: Array<{ type: string }>): string[] => cs.map((c) => c.type);

describe('resolverNo: ajustada (curva entre bitolas diferentes com redução no tipo)', () => {
  const com = { regras: { tubo: 't', curva90: 'c90', curva45: 'c45', te: 'te', juncao45: 'j', luva: 'lu', reducao: 'red', tampao: 'tp' } };
  const encontro = (tipo: EntradaNo['tipo'], graus: number, dnA: number, dnB: number): EntradaNo => {
    const r = ((180 - graus) * Math.PI) / 180;
    return { tipo, no: { tipo: 'encontro', trechos: [{ direcao: [1, 0, 0], dn: dnA }, { direcao: [Math.cos(Math.PI - r), Math.sin(Math.PI - r), 0], dn: dnB }] } };
  };
  it('90°: curva na bitola do primeiro trecho e redução no segundo, com o motivo', () => {
    const s = resolverNo(encontro(com, 90, 100, 75));
    expect(s.status).toBe('ajustada');
    if (s.status !== 'ajustada') return;
    expect(s.pecas).toEqual([{ tipo: 'curva90', familiaId: 'c90', diametros: [100, 100] }, { tipo: 'reducao', familiaId: 'red', diametros: [100, 75] }]);
    expect(s.motivo).toContain('DN 100 e DN 75');
  });
  it('45° (desvio): curva 45° mais redução', () => {
    const s = resolverNo(encontro(com, 135, 75, 50));
    expect(s.status === 'ajustada' && s.pecas.map((q) => q.tipo)).toEqual(['curva45', 'reducao']);
  });
  it('sem redução no tipo continua sem solução; sem a curva do ângulo também', () => {
    expect(resolverNo(encontro({ regras: { ...com.regras, reducao: '' } }, 90, 100, 75))).toMatchObject({ status: 'sem_solucao', codigo: 'bitolas_diferentes_em_curva' });
    expect(resolverNo(encontro({ regras: { ...com.regras, curva90: '' } }, 90, 100, 75))).toMatchObject({ status: 'sem_solucao', codigo: 'bitolas_diferentes_em_curva' });
  });
  it('mesma bitola em curva segue `ok`; coluna reta com DN diferente segue redução', () => {
    expect(resolverNo(encontro(com, 90, 100, 100)).status).toBe('ok');
    expect(resolverNo(encontro(com, 180, 100, 75))).toMatchObject({ status: 'ok', conexao: { tipo: 'reducao' } });
  });
});

describe('planejarTrocaDeBitola: recusas e casos sem mudança', () => {
  it('DN fora da lista do tipo: recusa com as bitolas que valem, sem comandos', () => {
    const { store, tubos } = cadeia(KRONA, L, 100);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 63);
    expect(plano.ok).toBe(false);
    expect(plano.recusa?.codigo).toBe('bitola_fora_da_lista');
    expect(plano.recusa?.motivo).toBe('DN 63 não existe na linha esgoto da Krona. Bitolas: 40, 50, 75, 100, 150, 200, 250.');
    expect(plano.recusa?.bitolas).toEqual([40, 50, 75, 100, 150, 200, 250]);
    expect(plano.comandos).toEqual([]);
  });
  it('DN que a lista aceita mas a família não tem: recusa', () => {
    const { store, tubos } = cadeia(GENERICO, L, 100);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 200);
    expect(plano.ok).toBe(false);
    expect(plano.recusa?.motivo).toContain('DN 200 não existe na família');
    expect(plano.recusa?.bitolas).toEqual([40, 50, 75, 100, 150]);
  });
  it('tubo inexistente e elemento que não é tubo: recusa', () => {
    const { store, pecas } = cadeia(KRONA, L, 100);
    expect(planejarTrocaDeBitola(store.project, 'nada', 75).recusa?.codigo).toBe('tubo_inexistente');
    expect(planejarTrocaDeBitola(store.project, pecas[0]!, 75).recusa?.codigo).toBe('tubo_inexistente');
  });
  it('mesmo DN: ok e nenhum comando', () => {
    const { store, tubos } = cadeia(KRONA, L, 100);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 100);
    expect(plano).toMatchObject({ ok: true, comandos: [], alertas: [], conexoesRemovidas: [], reducoesInseridas: [] });
  });
  it('é puro: não altera o projeto e dá o mesmo plano duas vezes', () => {
    const { store, tubos } = cadeia(KRONA, L, 100);
    const antes = JSON.stringify(store.project);
    const a = planejarTrocaDeBitola(store.project, tubos[0]!, 75);
    const b = planejarTrocaDeBitola(store.project, tubos[0]!, 75);
    expect(JSON.stringify(store.project)).toBe(antes);
    expect(b).toEqual(a);
  });
});

describe('planejarTrocaDeBitola: conexão incompatível vira redução na Krona', () => {
  it('Krona, joelho 100 entre dois tubos: troca um para 75, o joelho fica, entra o tubo curto e a redução, sem remover nem alertar', () => {
    const { store, tubos, pecas } = cadeia(KRONA, L, 100);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 75);
    expect(plano.ok).toBe(true);
    expect(ids(plano.comandos)).toEqual(['disconnectComponents', 'addComponent', 'addComponent', 'updateComponent', 'connectComponents', 'connectComponents', 'connectComponents']);
    expect(plano.conexoesRemovidas).toEqual([]);
    expect(plano.alertas).toEqual([]);
    expect(plano.reducoesInseridas).toEqual([{ elementId: 't0_red_b', familiaId: 'fam_krona_esgoto_reducao_excentrica', dnMaior: 100, dnMenor: 75 }]);
    expect(plano.tubosInseridos).toEqual([{ elementId: 't0_tubo_b', familiaId: KRONA, dn: 100, comprimento: lacunaMinima(tipoDaFamiliaDeTubo(KRONA), 'curva90', 'reducao'), entre: [pecas[0]!, 't0_red_b'] }]);
    expect(plano.comandos.find((c) => c.type === 'deleteElements')).toBeUndefined();
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    expect(porId(prox.project, pecas[0]!).values?.DN).toBe(100);
    expect(porId(prox.project, 't0_tubo_b').ligacoes?.a?.componenteId).toBe(pecas[0]);
    expect(porId(prox.project, 't0_tubo_b').ligacoes?.b?.componenteId).toBe('t0_red_b');
    expect(porId(prox.project, 't0').ligacoes?.b?.componenteId).toBe('t0_red_b');
    expect(diagnosticarRede(prox.project).filter((d) => d.codigo === 'incompativel' || d.codigo === 'conexao_invalida')).toEqual([]);
  });
  it('Krona: tubos ligados direto com DN diferente: entra a redução entre eles, sem alerta', () => {
    const { store, tubos } = cadeia(KRONA, [[0, 0, 0.5], [1, 0, 0.5], [2, 0, 0.5]], 100, true);
    expect(porId(store.project, tubos[0]!).ligacoes).toBeDefined();
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 50);
    expect(plano.reducoesInseridas).toEqual([{ elementId: 't0_red_b', familiaId: 'fam_krona_esgoto_reducao_excentrica', dnMaior: 100, dnMenor: 50 }]);
    expect(plano.alertas).toEqual([]);
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    expect(porId(prox.project, 't1').ligacoes?.a?.componenteId).toBe('t0_red_b');
  });
});

describe('planejarTrocaDeBitola: peça com tipo para o novo DN e redução', () => {
  it('Krona: tampão na ponta troca de DN, o tubo é reencurtado e a peça fica com DN 75', () => {
    const store = projetoCom(KRONA);
    store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca('fam_krona_esgoto_tampao')!) });
    const t = trechoDeTubo([0, 0, 0.5], [1, 0, 0.5], { id: KRONA }, 100, { id: 't0', levelId: 'lv_0' })!;
    store.exec({ type: 'addComponent', component: t });
    const cap = posicionarConexao(store.project.componentFamilies!.fam_krona_esgoto_tampao!, [1, 0, 0.5], { tipo: 'luva', familiaId: 'fam_krona_esgoto_tampao', direcoes: [[-1, 0, 0]], diametros: [100] })!;
    store.exec({ type: 'addComponent', component: { id: 'cap', kind: 'component', familyId: 'fam_krona_esgoto_tampao', typeId: null, levelId: 'lv_0', x: cap.x, y: cap.y, z: cap.z, rotation: cap.rotation, inclinacao: cap.inclinacao, mirrored: false, values: cap.values, mark: '' } });
    store.exec({ type: 'connectComponents', a: 'cap', ligacaoA: cap.ligacoes[0] ?? '', b: 't0', ligacaoB: 'b' });
    const plano = planejarTrocaDeBitola(store.project, 't0', 75);
    expect(plano.conexoesTrocadas).toEqual([{ elementId: 'cap', familiaAntes: 'fam_krona_esgoto_tampao', familiaDepois: 'fam_krona_esgoto_tampao', dnAntes: 100, dnDepois: 75 }]);
    expect(plano.alertas).toEqual([]);
    const up = plano.comandos.find((c) => c.type === 'updateComponent' && c.id === 'cap');
    expect(up).toMatchObject({ patch: { typeId: 'dn75', values: { DN: 75 } } });
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    expect(porId(prox.project, 'cap').values?.DN).toBe(75);
    expect(porId(prox.project, 't0').values?.DN).toBe(75);
  });
  it('genérico F1 (tem redução): joelho 100 com tubo trocado para 75 ganha um tubo curto e uma redução 100 → 75, sem remover nada', () => {
    const { store, tubos, pecas } = cadeia(GENERICO, L, 100);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 75);
    expect(plano.ok).toBe(true);
    expect(plano.conexoesRemovidas).toEqual([]);
    expect(plano.alertas).toEqual([]);
    expect(plano.reducoesInseridas).toEqual([{ elementId: 't0_red_b', familiaId: 'fam_esgoto_reducao', dnMaior: 100, dnMenor: 75 }]);
    expect(plano.tubosInseridos).toEqual([{ elementId: 't0_tubo_b', familiaId: GENERICO, dn: 100, comprimento: lacunaMinima(tipoDaFamiliaDeTubo(GENERICO), 'curva90', 'reducao'), entre: [pecas[0]!, 't0_red_b'] }]);
    expect(ids(plano.comandos)).toEqual(['disconnectComponents', 'addComponent', 'addComponent', 'updateComponent', 'connectComponents', 'connectComponents', 'connectComponents']);
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    const red = porId(prox.project, 't0_red_b');
    expect(red.values).toMatchObject({ DN: 100, DN2: 75 });
    expect(porId(prox.project, 't0_tubo_b').ligacoes?.a?.componenteId).toBe(pecas[0]);
    expect(porId(prox.project, 't0_tubo_b').ligacoes?.b?.componenteId).toBe('t0_red_b');
    expect(porId(prox.project, 't0').ligacoes?.b?.componenteId).toBe('t0_red_b');
    expect(porId(prox.project, pecas[0]!).values?.DN).toBe(100);
    expect(diagnosticarRede(prox.project).filter((d) => d.codigo === 'incompativel' || d.codigo === 'conexao_invalida')).toEqual([]);
  });
  it('genérico F1: dois tubos ligados direto (colunares) com DN diferente ganham a redução entre eles', () => {
    const { store, tubos } = cadeia(GENERICO, [[0, 0, 0.5], [1, 0, 0.5], [2, 0, 0.5]], 100, true);
    const plano = planejarTrocaDeBitola(store.project, tubos[0]!, 50);
    expect(plano.reducoesInseridas).toEqual([{ elementId: 't0_red_b', familiaId: 'fam_esgoto_reducao', dnMaior: 100, dnMenor: 50 }]);
    expect(plano.alertas).toEqual([]);
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    expect(porId(prox.project, 't1').ligacoes?.a?.componenteId).toBe('t0_red_b');
  });
});

describe('planejarTrocaDeBitola: viabilidade e declividade', () => {
  it('tubo curto entre dois joelhos que, no DN maior, não cabem: a conexão de maior recuo sai com alerta, nunca em silêncio', () => {
    const store = projetoCom(KRONA);
    const j = store.project.componentFamilies!.fam_krona_esgoto_joelho90!;
    const tubo = trechoDeTubo([0, 0, 0.5], [0.09, 0, 0.5], { id: KRONA }, 50, { id: 't0', levelId: 'lv_0' })!;
    store.exec({ type: 'addComponent', component: tubo });
    const nivel = tubo.levelId;
    const poe = (id: string, x: number, dir: V3): void => {
      const pos = posicionarConexao(j, [x, 0, 0.5], { tipo: 'curva90', familiaId: j.id, direcoes: [dir, [0, -1, 0]], diametros: [50, 50] })!;
      store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: j.id, typeId: null, levelId: nivel, x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' } });
      store.exec({ type: 'connectComponents', a: id, ligacaoA: pos.ligacoes[0] ?? '', b: 't0', ligacaoB: id === 'j0' ? 'a' : 'b' });
    };
    poe('j0', 0, [1, 0, 0]);
    poe('j1', 0.09, [-1, 0, 0]);
    const plano = planejarTrocaDeBitola(store.project, 't0', 100);
    expect(plano.ok).toBe(true);
    expect(plano.conexoesRemovidas.length).toBeGreaterThanOrEqual(1);
    expect(plano.alertas.some((a) => a.codigo === 'conexao_removida' && /Trecho curto|sobrepõem/.test(a.motivo))).toBe(true);
    const prox = new ProjectStore(store.project);
    for (const c of plano.comandos) prox.exec(c);
    expect(porId(prox.project, 't0').values?.DN).toBe(100);
  });
  it('esgoto de DN 150 em 0,25 % trocado para DN 100: avisa a declividade fora da faixa, sem bloquear', () => {
    const store = projetoCom(GENERICO);
    const t = trechoDeTubo([0, 0, 0.5], [2, 0, 0.505], { id: GENERICO }, 150, { id: 't0', levelId: 'lv_0' })!;
    store.exec({ type: 'addComponent', component: t });
    const plano = planejarTrocaDeBitola(store.project, 't0', 100);
    expect(plano.ok).toBe(true);
    expect(plano.alertas).toHaveLength(1);
    expect(plano.alertas[0]).toMatchObject({ codigo: 'declividade_fora_do_limite', elementId: 't0' });
    expect(ids(plano.comandos)).toEqual(['updateComponent']);
  });
});
