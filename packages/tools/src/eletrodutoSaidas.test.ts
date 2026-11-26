import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component } from '@hestia/model';
import { diagnosticarRede, ligacaoNoMundo, resolverComponente } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { extremosDoTubo } from './tuboGeometria.ts';
import { ligacoesAbertas, pontasDoTubo, semOrigem } from './tuboApoio.ts';
import { portasAoAlcance } from './tuboPortas.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Ficha F3: (a) as portas livres de TODA peça elétrica aparecem como porta no snap e ficam marcadas (halo) quando o cursor chega perto,
 * com as ferramentas Eletroduto e Tubo; (b) o traçado que SAI de uma porta de tomada, interruptor, luminária ou caixa muda de cota no
 * meio (o painel muda `z` entre dois cliques) e chega a outra porta respeitando a direção das duas, no rígido e no corrugado.
 */

const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const TUBO = FAMILIA_ELETRODUTO;
const CORRUGADO = 'fam_tigre_tigreflex_amarelo';
type Ctx = ReturnType<typeof makeEnv>;
type Xyz = { x: number; y: number; z: number };
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const de = (ctx: Ctx, fam: string): Component[] => comps(ctx).filter((c) => c.familyId === fam);

function ambiente(ferramenta: 'eletroduto' | 'tubo' = 'eletroduto') {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs, t: tool(ferramenta, ctx.env) };
}

function colocar(ctx: Ctx, familia: string, id: string, x: number, y: number, tipo?: string, rot = 0): void {
  const f = familiaDaBiblioteca(familia);
  if (!f) throw new Error(`família ausente: ${familia}`);
  if (!ctx.store.project.componentFamilies?.[familia]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  ctx.store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: familia, typeId: tipo ?? f.tipoPadrao ?? f.tipos[0]?.id ?? null, levelId: 'lv_0', x, y, z: 0, rotation: (rot * Math.PI) / 180, mirrored: false, values: {}, mark: '' } as unknown as Component });
}

function porta(ctx: Ctx, id: string, lig: string): Xyz & { dir: [number, number, number] } {
  const c = ctx.store.project.elements[id] as Component;
  const l = resolverComponente(ctx.store.project, c).ligacoes?.find((q) => q.id === lig);
  if (!l) throw new Error(`porta ausente: ${id}.${lig}`);
  const m = ligacaoNoMundo(l, c);
  return { x: m.posicaoMundo[0], y: m.posicaoMundo[1], z: m.posicaoMundo[2], dir: [m.direcaoMundo[0], m.direcaoMundo[1], m.direcaoMundo[2]] };
}

const problemas = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => ['incompativel', 'conexao_afastada', 'conexoes_coladas', 'conexao_invalida', 'curvatura_fechada'].includes(d.codigo));

/** Traça como o usuário: cada ponto é um clique; `z` do ponto é a cota digitada no painel antes do clique (porta usa a dela). */
function tracar(a: ReturnType<typeof ambiente>, pontos: Array<{ x: number; y: number; z?: number }>): void {
  pontos.forEach((p) => {
    if (p.z !== undefined) opcoesEletroduto.z = p.z;
    clickAt(a.t, p.x, p.y);
  });
}

beforeEach(() => {
  opcoesEletroduto.dn = 20;
  opcoesEletroduto.z = 0;
  opcoesEletroduto.declividade = 0;
  opcoesEletroduto.modoCota = 'subir_primeiro';
  opcoesEletroduto.familiaId = TUBO;
});

const PECAS: Array<[string, string, string]> = [
  ['tomada', 'fam_tomada_2p_t', 'eletroduto_esq'],
  ['interruptor', 'fam_interruptor_simples', 'eletroduto_dir'],
  ['luminária', 'fam_luminaria_plafon_redondo', 'eletroduto_dir'],
  ['caixa', CAIXA, 'd'],
];

describe('toda peça elétrica aparece como porta no snap', () => {
  it.each([
    ['fam_tomada_2p_t', 5], ['fam_interruptor_simples', 5], ['fam_luminaria_plafon_redondo', 4], ['fam_luminaria_arandela', 5], ['fam_luminaria_pendente', 1], ['fam_luminaria_linear', 3],
    [CAIXA, 4], ['fam_quadro_distribuicao_eletrico', 4], ['fam_tomada', 1], ['fam_interruptor', 1], ['fam_luminaria_teto', 3], ['fam_quadro_distribuicao', 1],
  ] as const)('%s: as %i ligações de eletroduto saem em ligacoesAbertas', (fam, n) => {
    const { ctx } = ambiente();
    colocar(ctx, fam, 'p', 0, 0);
    const abertas = ligacoesAbertas(ctx.store.project).filter((a) => a.componentId === 'p' && a.lig.dominio === 'eletroduto');
    expect(abertas).toHaveLength(n);
  });
});

describe('halo do snap nas portas livres (Eletroduto e Tubo)', () => {
  const polys = (items: ReturnType<ReturnType<typeof tool>['preview']>) => items.filter((i) => i.kind === 'polygon');

  it.each(PECAS)('Eletroduto ativo, cursor perto de uma porta de %s: halo na porta, seta e nome', (_n, fam, lig) => {
    const a = ambiente();
    colocar(a.ctx, fam, 'p', 3, 3);
    const alvo = porta(a.ctx, 'p', lig);
    opcoesEletroduto.z = alvo.z;
    a.t.move(P(alvo.x + 0.03, alvo.y + 0.02));
    const it = a.t.preview();
    expect(polys(it).length).toBeGreaterThanOrEqual(2);
    expect(it.some((i) => i.kind === 'label' && i.text.startsWith('Porta: '))).toBe(true);
  });

  it('a porta lateral mostra a seta na direção dela; a de topo/base mostra "sobe" ou "desce" no lugar da seta', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    opcoesEletroduto.z = e.z;
    a.t.move(P(e.x, e.y));
    const seta = a.t.preview().find((i) => i.kind === 'line');
    expect(seta && seta.kind === 'line' && seta.b.x < seta.a.x).toBe(true);
    const topo = porta(a.ctx, 'p', 'eletroduto_topo');
    opcoesEletroduto.z = topo.z;
    a.t.move(P(topo.x, topo.y));
    const rotulo = a.t.preview().find((i) => i.kind === 'label' && i.text.startsWith('Porta: '));
    expect(rotulo && rotulo.kind === 'label' && /sobe/.test(rotulo.text)).toBe(true);
  });

  it('cursor longe (acima do alcance): nenhum halo', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    a.t.move(P(10, 10));
    expect(polys(a.t.preview())).toHaveLength(0);
  });

  it('ao alcance mas fora da captura: halos pequenos nas portas livres, sem o halo forte nem o nome', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    opcoesEletroduto.z = e.z;
    a.t.move(P(e.x - 0.5, e.y));
    const it = a.t.preview();
    expect(polys(it).length).toBeGreaterThanOrEqual(1);
    expect(it.some((i) => i.kind === 'label')).toBe(false);
  });

  it('só marca portas compatíveis: com DN 25 a tomada DN 20 não é marcada (a bitola não encaixa)', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    opcoesEletroduto.dn = 25;
    a.t.move(P(e.x, e.y));
    expect(polys(a.t.preview())).toHaveLength(0);
  });

  it('Tubo (hidráulico): o halo aparece nas pontas livres de um tubo de esgoto', () => {
    const a = ambiente('tubo');
    const f = familiaDaBiblioteca('fam_tubo_esgoto');
    if (!f) throw new Error('tubo ausente');
    a.ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
    clickAt(a.t, 0, 0);
    clickAt(a.t, 2, 0);
    a.t.cancel();
    a.t.move(P(2.02, 0.01));
    expect(polys(a.t.preview()).length).toBeGreaterThanOrEqual(1);
  });

  it('no meio do traçado a porta de onde se saiu não é marcada de novo; as outras da mesma peça sim', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    opcoesEletroduto.z = e.z;
    clickAt(a.t, e.x, e.y);
    const abertas = ligacoesAbertas(a.ctx.store.project);
    a.t.move(P(e.x - 0.3, e.y));
    const aneis = polys(a.t.preview());
    // Nenhum anel centrado na porta de origem (a seta e o halo forte só existem quando o cursor pega uma porta).
    const centros = aneis.map((p) => (p.kind === 'polygon' ? p.ring.reduce((s, q) => s + q.x, 0) / p.ring.length : 0));
    expect(centros.some((cx) => Math.abs(cx - e.x) < 1e-6)).toBe(false);
    expect(abertas.length).toBeGreaterThan(1);
  });

  it('portasAoAlcance ordena da mais perto para a mais longe e respeita o raio', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 3, 3);
    const abertas = ligacoesAbertas(a.ctx.store.project);
    const ponta = pontasDoTubo(familiaDaBiblioteca(TUBO)!, 20)!.inicio;
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    const r = portasAoAlcance({ x: e.x, y: e.y }, ponta, abertas, 0.5, true);
    expect(r[0]?.lig.id).toBe('eletroduto_esq');
    expect(portasAoAlcance({ x: 50, y: 50 }, ponta, abertas, 0.5, true)).toHaveLength(0);
  });
});

describe('clique na porta inicia o traçado a partir dela, com a direção da porta', () => {
  it.each(PECAS)('%s: o primeiro trecho sai no sentido da porta (a luminária também)', (_n, fam, lig) => {
    const a = ambiente();
    colocar(a.ctx, fam, 'p', 3, 3);
    const e = porta(a.ctx, 'p', lig);
    tracar(a, [{ x: e.x, y: e.y, z: e.z }, { x: e.x + e.dir[0] * 1.5 + 0, y: e.y + e.dir[1] * 1.5 + (e.dir[1] === 0 ? 1 : 0), z: e.z }]);
    const t0 = de(a.ctx, TUBO).find((c) => c.ligacoes?.a?.componenteId === 'p' || c.ligacoes?.b?.componenteId === 'p');
    expect(t0, 'primeiro trecho ligado à porta').toBeTruthy();
    const ext = extremosDoTubo(a.ctx.store.project, t0!)!;
    const perto = Math.hypot(ext.a[0] - e.x, ext.a[1] - e.y) < Math.hypot(ext.b[0] - e.x, ext.b[1] - e.y) ? ext.a : ext.b;
    const longe = perto === ext.a ? ext.b : ext.a;
    const v: [number, number, number] = [longe[0] - perto[0], longe[1] - perto[1], longe[2] - perto[2]];
    expect(v[0] * e.dir[0] + v[1] * e.dir[1] + v[2] * e.dir[2]).toBeGreaterThan(0);
  });
});

describe('cota muda no meio do traçado a partir de dispositivo (rígido)', () => {
  it.each(PECAS)('%s → caixa com a cota mudando em dois cliques: liga nas duas portas e a rede fica limpa', (_n, fam, lig) => {
    const a = ambiente();
    colocar(a.ctx, fam, 'p', 2, 2);
    colocar(a.ctx, CAIXA, 'cx', 5, 4);
    const e = porta(a.ctx, 'p', lig);
    const f = porta(a.ctx, 'cx', 'a');
    tracar(a, [{ x: e.x, y: e.y }, { x: e.x + e.dir[0] * 1.2, y: e.y + e.dir[1] * 1.2 + (e.dir[1] === 0 ? 0 : 0.8), z: e.z + 0.8 }, { x: f.x - 1, y: f.y - 1, z: f.z + 0.3 }, { x: f.x, y: f.y }]);
    expect((a.ctx.store.project.elements['p'] as Component).ligacoes).toBeTruthy();
    expect(Object.keys((a.ctx.store.project.elements['cx'] as Component).ligacoes ?? {})).toEqual(['a']);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('cota muda, rota segue: o trecho de cada cota é horizontal e a troca de cota é vertical (nenhum trecho inclinado no rígido)', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 2, 2);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    tracar(a, [{ x: e.x, y: e.y, z: e.z }, { x: e.x - 2, y: e.y + 1, z: 2.5 }, { x: e.x - 4, y: e.y + 1, z: 1.0 }]);
    for (const c of de(a.ctx, TUBO)) {
      const ext = extremosDoTubo(a.ctx.store.project, c)!;
      const horizontal = Math.hypot(ext.b[0] - ext.a[0], ext.b[1] - ext.a[1]) > 1e-6;
      const vertical = Math.abs(ext.b[2] - ext.a[2]) > 1e-6;
      expect(horizontal && vertical, `trecho ${c.id} inclinado`).toBe(false);
    }
    const zs = de(a.ctx, TUBO).flatMap((c) => { const x = extremosDoTubo(a.ctx.store.project, c)!; return [x.a[2], x.b[2]]; });
    expect(Math.max(...zs)).toBeCloseTo(2.5, 6);
    expect(Math.min(...zs)).toBeCloseTo(e.z, 6);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it('prumada: a cota muda sobre o mesmo ponto em planta (dois cliques no mesmo lugar com z diferente) e a rota continua', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_interruptor_simples', 'p', 2, 2);
    const e = porta(a.ctx, 'p', 'eletroduto_dir');
    tracar(a, [{ x: e.x, y: e.y, z: e.z }, { x: e.x + 1.5, y: e.y + 0.0, z: e.z }, { x: e.x + 1.5, y: e.y + 0.001, z: 2.4 }]);
    expect(de(a.ctx, TUBO).length).toBeGreaterThanOrEqual(2);
    expect(problemas(a.ctx)).toEqual([]);
  });
});

describe('cota muda no meio do traçado a partir de dispositivo (corrugado)', () => {
  beforeEach(() => { opcoesEletroduto.familiaId = CORRUGADO; });

  it.each(PECAS)('%s → caixa: cota muda no meio e o corrugado liga nas duas portas, rede limpa', (_n, fam, lig) => {
    const a = ambiente();
    colocar(a.ctx, fam, 'p', 2, 2);
    colocar(a.ctx, CAIXA, 'cx', 5, 4);
    const e = porta(a.ctx, 'p', lig);
    const f = porta(a.ctx, 'cx', 'a');
    tracar(a, [{ x: e.x, y: e.y, z: e.z }, { x: e.x + e.dir[0] * 2 + 0.2, y: e.y + e.dir[1] * 2 + (e.dir[1] === 0 ? 0 : 1), z: 2.0 }, { x: f.x - 2, y: f.y - 1.5, z: f.z + 0.4 }, { x: f.x, y: f.y }]);
    expect(Object.keys((a.ctx.store.project.elements['cx'] as Component).ligacoes ?? {})).toEqual(['a']);
    expect((a.ctx.store.project.elements['p'] as Component).ligacoes).toBeTruthy();
    expect(de(a.ctx, CORRUGADO).length).toBeGreaterThanOrEqual(3);
    expect(problemas(a.ctx)).toEqual([]);
  });
});

describe('chegada à porta respeita a direção dela (luminária, interruptor, quadro) e trechos longos não são cortados em silêncio', () => {
  it.each([['luminária', 'fam_luminaria_plafon_redondo', 'eletroduto_esq'], ['interruptor', 'fam_interruptor_simples', 'eletroduto_esq'], ['quadro', 'fam_quadro_distribuicao_eletrico', 'c']] as const)('%s: partindo de um ponto livre do lado oposto, o último trecho chega de frente para a porta e a rede fica limpa', (_n, fam, lig) => {
    const a = ambiente();
    colocar(a.ctx, fam, 'p', 5, 5);
    const f = porta(a.ctx, 'p', lig);
    tracar(a, [{ x: f.x + 2.0, y: f.y + 1.5, z: f.z }, { x: f.x, y: f.y }]);
    expect((a.ctx.store.project.elements['p'] as Component).ligacoes).toBeTruthy();
    const ultimo = de(a.ctx, TUBO).find((c) => c.ligacoes?.[Object.keys(c.ligacoes ?? {}).find((k) => c.ligacoes?.[k]?.componenteId === 'p') ?? '']?.componenteId === 'p');
    const ext = extremosDoTubo(a.ctx.store.project, ultimo!)!;
    const naPorta = Math.hypot(ext.a[0] - f.x, ext.a[1] - f.y, ext.a[2] - f.z) < Math.hypot(ext.b[0] - f.x, ext.b[1] - f.y, ext.b[2] - f.z) ? ext.a : ext.b;
    const outra = naPorta === ext.a ? ext.b : ext.a;
    const v: [number, number, number] = [outra[0] - naPorta[0], outra[1] - naPorta[1], outra[2] - naPorta[2]];
    expect(v[0] * f.dir[0] + v[1] * f.dir[1] + v[2] * f.dir[2]).toBeGreaterThan(0);
    expect(problemas(a.ctx)).toEqual([]);
  });

  it.each([[TUBO, 'rígido'], [CORRUGADO, 'corrugado']])('%s (%s): trecho acima do máximo da família é bloqueado com o motivo, não gravado encurtado', (familia) => {
    const a = ambiente();
    opcoesEletroduto.familiaId = familia;
    clickAt(a.t, 0, 0);
    clickAt(a.t, 8, 0);
    expect(a.msgs.at(-1)).toMatch(/Bloqueado: trecho de 8000 mm passa do comprimento máximo/);
    expect(comps(a.ctx).filter((c) => c.familyId === familia)).toHaveLength(0);
    clickAt(a.t, 4, 0);
    expect(comps(a.ctx).filter((c) => c.familyId === familia).length).toBeGreaterThanOrEqual(1);
  });

  it('prumada no mesmo ponto em planta: clicar de novo sobre o fim do trecho com outra cota cria o trecho vertical (antes: "os dois pontos coincidem")', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_interruptor_simples', 'p', 2, 2);
    const e = porta(a.ctx, 'p', 'eletroduto_dir');
    tracar(a, [{ x: e.x, y: e.y, z: e.z }, { x: e.x + 1.5, y: e.y, z: e.z }]);
    const antes = de(a.ctx, TUBO).length;
    tracar(a, [{ x: e.x + 1.5, y: e.y, z: 2.4 }]);
    expect(de(a.ctx, TUBO).length).toBeGreaterThan(antes);
    expect(a.msgs.at(-1)).not.toMatch(/coincidem/);
    const zs = de(a.ctx, TUBO).flatMap((c) => { const x = extremosDoTubo(a.ctx.store.project, c)!; return [x.a[2], x.b[2]]; });
    expect(Math.max(...zs)).toBeCloseTo(2.4, 6);
  });

  it('a porta de origem do traçado não é capturada de volta (semOrigem)', () => {
    const a = ambiente();
    colocar(a.ctx, 'fam_tomada_2p_t', 'p', 2, 2);
    const e = porta(a.ctx, 'p', 'eletroduto_esq');
    const abertas = ligacoesAbertas(a.ctx.store.project);
    expect(semOrigem(abertas, [e.x, e.y, e.z]).length).toBe(abertas.length - 1);
    expect(semOrigem(abertas, undefined)).toBe(abertas);
  });
});
