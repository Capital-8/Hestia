import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, type Component } from '@hestia/model';
import { diagnosticarRede, FATOR_RAIO_MINIMO_PROVISORIO, ligacaoNoMundo, resolverComponente, tangenteDoCanto } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { extremosDoTubo } from './tuboGeometria.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Ferramenta Eletroduto no modo CORRUGADO (ficha F2): cada clique cria um trecho reto ligado ao anterior por ligação flexível, sem peça
 * no canto; direção e cota livres; raio mínimo de curvatura conferido (fator provisório do tipo, CONFERIR).
 */

const CORRUGADO = 'fam_tigre_tigreflex_amarelo';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
const R20 = FATOR_RAIO_MINIMO_PROVISORIO * 20; // mm; o DE da bitola 20 do catálogo é 20 mm
type Ctx = ReturnType<typeof makeEnv>;
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const trechos = (ctx: Ctx): Component[] => comps(ctx).filter((c) => c.familyId === CORRUGADO);
const avisosDeRede = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexoes_coladas', 'conexao_invalida', 'curvatura_fechada'].includes(d.codigo));

function ambiente() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs, t: tool('eletroduto', ctx.env) };
}

function caixa(ctx: Ctx, id: string, x: number, y: number, rot = 0): Component {
  const f = familiaDaBiblioteca(CAIXA);
  if (!f) throw new Error('caixa ausente');
  if (!ctx.store.project.componentFamilies?.[CAIXA]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  const c = { id, kind: 'component', familyId: CAIXA, typeId: f.tipos[0]?.id ?? null, levelId: 'lv_0', x, y, z: 0.5, rotation: (rot * Math.PI) / 180, mirrored: false, values: { L: 100, A: 100, P: 50 }, mark: '' } as unknown as Component;
  ctx.store.exec({ type: 'addComponent', component: c });
  return ctx.store.project.elements[id] as Component;
}
function entrada(ctx: Ctx, c: Component, lig: string): { x: number; y: number; z: number } {
  const l = resolverComponente(ctx.store.project, c).ligacoes?.find((q) => q.id === lig);
  if (!l) throw new Error(`ligação ausente: ${lig}`);
  const [x, y, z] = ligacaoNoMundo(l, c).posicaoMundo;
  return { x, y, z };
}

beforeEach(() => {
  opcoesEletroduto.dn = 20;
  opcoesEletroduto.z = 0.5;
  opcoesEletroduto.declividade = 0;
  opcoesEletroduto.modoCota = 'subir_primeiro';
  opcoesEletroduto.familiaId = CORRUGADO;
});

describe('Eletroduto corrugado: traçado livre', () => {
  it('4 cantos livres de 90°: 5 trechos ligados em cadeia, nenhuma peça (curva, luva, tê) criada', () => {
    const { ctx, t } = ambiente();
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2]] as const) clickAt(t, x, y);
    const ts = trechos(ctx);
    expect(ts).toHaveLength(5);
    expect(comps(ctx)).toHaveLength(5);
    const ordem = [...ts].sort((a, b) => a.id.localeCompare(b.id));
    const ligados = ts.filter((c) => c.ligacoes?.b !== undefined).length;
    expect(ligados).toBe(4);
    for (const c of ordem) for (const cx of Object.values(c.ligacoes ?? {})) expect(trechos(ctx).some((o) => o.id === cx.componenteId)).toBe(true);
  });
  it('só a família do corrugado entra no projeto (sem curva, luva nem tê da Krona por trás)', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(Object.keys(ctx.store.project.componentFamilies ?? {})).toEqual([CORRUGADO]);
  });
  it('mudança de cota entre cliques (painel muda o z): o trecho fica inclinado, sem prumada nem peça', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    opcoesEletroduto.z = 1.4;
    clickAt(t, 2, 0);
    const ts = trechos(ctx);
    expect(ts).toHaveLength(2);
    expect(comps(ctx)).toHaveLength(2);
    const ext = ts.map((c) => extremosDoTubo(ctx.store.project, c)!).sort((a, b) => a.a[0] - b.a[0]);
    expect(ext[0]!.b[2] - ext[0]!.a[2]).toBeCloseTo(0, 6);
    expect(ext[1]!.a[2]).toBeCloseTo(0.5, 6);
    expect(ext[1]!.b[2]).toBeCloseTo(1.4, 6);
    expect(ts.filter((c) => Math.abs((c.inclinacao?.[0] ?? Math.PI / 2) - Math.PI / 2) > 1e-6)).toHaveLength(1);
    expect(avisosDeRede(ctx)).toEqual([]);
  });
  it('a rede fica sem avisos de afastada, incompatível, coladas ou curvatura nos cantos válidos', () => {
    const { ctx, t } = ambiente();
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0.2, 1.4]] as const) clickAt(t, x, y);
    expect(avisosDeRede(ctx)).toEqual([]);
    // As únicas pontas abertas são as duas do começo e do fim da cadeia.
    expect(diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'ligacao_aberta')).toHaveLength(2);
  });
  it('clicar no meio de um trecho corrugado BLOQUEIA (sem tê): nada além do trecho novo, nada gravado', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel?.();
    const t2 = tool('eletroduto', ctx.env);
    clickAt(t2, 1, 0);
    clickAt(t2, 1, 1);
    expect(comps(ctx).filter((c) => c.familyId !== CORRUGADO)).toEqual([]);
    expect(trechos(ctx)).toHaveLength(1);
  });
});

describe('Eletroduto corrugado: raio mínimo de curvatura', () => {
  // A grade do teste é de 0,1 m e o raio mínimo do DN 20 é de 120 mm (6 × DE 20 mm): trecho de 0,1 m não cabe o canto de 90°, de 0,2 m cabe.
  it('aceita o canto de 90° quando os dois trechos cabem a tangente (R)', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 0.2, 0);
    clickAt(t, 0.2, 0.2);
    expect(trechos(ctx)).toHaveLength(2);
  });
  it('bloqueia o trecho curto demais para o canto, com o motivo e "aumentar o trecho para N mm" pela geometria', () => {
    const { ctx, msgs, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 0.1);
    expect(trechos(ctx)).toHaveLength(1);
    const fala = msgs[msgs.length - 1] ?? '';
    expect(fala).toContain('Bloqueado');
    expect(fala).toContain('raio mínimo de curvatura');
    expect(fala).toContain(`aumentar o trecho para ${Math.ceil(tangenteDoCanto(R20, 90))} mm`);
  });
  it('a sugestão serve: com o comprimento sugerido (digitado) o mesmo canto passa', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 0.1);
    expect(trechos(ctx)).toHaveLength(1);
    expect(t.type(String(Math.ceil(tangenteDoCanto(R20, 90)) / 1000).replace('.', ','))).toBe(true);
    expect(trechos(ctx)).toHaveLength(2);
  });
  it('bloqueia quando o trecho ANTERIOR é curto demais para o canto (já gravado)', () => {
    const { ctx, msgs, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 0.1, 0);
    clickAt(t, 0.1, 1);
    expect(trechos(ctx)).toHaveLength(1);
    expect(msgs[msgs.length - 1]).toContain('trecho anterior');
  });
  it('canto de 45° pede menos trecho que o de 90°: com o trecho anterior de 0,1 m o 45° passa e o 90° não', () => {
    expect(tangenteDoCanto(R20, 45)).toBeLessThan(tangenteDoCanto(R20, 90));
    const a45 = ambiente();
    clickAt(a45.t, 0, 0);
    clickAt(a45.t, 0.1, 0);
    clickAt(a45.t, 1.1, 1);
    expect(trechos(a45.ctx)).toHaveLength(2);
    const a90 = ambiente();
    clickAt(a90.t, 0, 0);
    clickAt(a90.t, 0.1, 0);
    clickAt(a90.t, 0.1, 1);
    expect(trechos(a90.ctx)).toHaveLength(1);
  });
  it('comprimento mínimo do trecho (B2): 5 mm digitados são bloqueados', () => {
    const { ctx, msgs, t } = ambiente();
    clickAt(t, 0, 0);
    t.move(P(1, 0));
    expect(t.type('0,005')).toBe(true);
    expect(trechos(ctx)).toHaveLength(0);
    expect(msgs[msgs.length - 1]).toContain('trecho curto demais');
  });
  it('a prévia do trecho bloqueado fica vermelha e mostra o motivo', () => {
    const { t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    t.move(P(1, 0.1));
    const itens = t.preview();
    expect(itens.some((i) => 'tone' in i && i.tone === 'invalid')).toBe(true);
    expect(itens.some((i) => i.kind === 'label' && i.text.includes('Bloqueado'))).toBe(true);
  });
});

describe('Eletroduto corrugado: caixa e dispositivo', () => {
  it('caixa nas duas pontas: liga nas entradas e a rede fica sem avisos nem pontas abertas do trecho', () => {
    const { ctx, t } = ambiente();
    const cx1 = caixa(ctx, 'cx1', 0, 0);
    const cx2 = caixa(ctx, 'cx2', 2.025, 1, 90);
    const p1 = entrada(ctx, cx1, 'd');
    const p2 = entrada(ctx, cx2, 'c');
    opcoesEletroduto.z = p1.z;
    clickAt(t, p1.x, p1.y);
    clickAt(t, p2.x, p1.y);
    clickAt(t, p2.x, p2.y);
    const ts = trechos(ctx).sort((a, b) => a.id.localeCompare(b.id));
    expect(ts).toHaveLength(2);
    const caixas = comps(ctx).filter((c) => c.familyId === CAIXA);
    expect(caixas.find((c) => c.id === 'cx1')?.ligacoes?.d?.componenteId).toBeDefined();
    expect(caixas.find((c) => c.id === 'cx2')?.ligacoes?.c?.componenteId).toBeDefined();
    expect(avisosDeRede(ctx)).toEqual([]);
    expect(diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'ligacao_aberta' && ts.some((c) => c.id === d.elementId))).toEqual([]);
  });
  it('de uma caixa a outra em linha oblíqua: a ligação flexível aceita a direção livre (sem "incompatível")', () => {
    const { ctx, t } = ambiente();
    const cx1 = caixa(ctx, 'cx1', 0, 0);
    const cx2 = caixa(ctx, 'cx2', 2.025, 1, 90);
    const p1 = entrada(ctx, cx1, 'd');
    const p2 = entrada(ctx, cx2, 'c');
    opcoesEletroduto.z = p1.z;
    clickAt(t, p1.x, p1.y);
    clickAt(t, p2.x, p2.y);
    expect(trechos(ctx)).toHaveLength(1);
    expect(diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'incompativel')).toEqual([]);
  });
});

describe('Eletroduto corrugado: desfazer e rígido', () => {
  it('desfazer em um passo remove o último clique inteiro (trecho, ligação e, no primeiro, a família)', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(trechos(ctx)).toHaveLength(2);
    ctx.store.undo();
    expect(trechos(ctx)).toHaveLength(1);
    expect(trechos(ctx)[0]?.ligacoes?.b).toBeUndefined();
    ctx.store.undo();
    expect(trechos(ctx)).toHaveLength(0);
    expect(ctx.store.project.componentFamilies?.[CORRUGADO]).toBeUndefined();
  });
  it('rígido inalterado: com o tipo rígido o canto continua levando a curva 90° da Krona', () => {
    opcoesEletroduto.familiaId = FAMILIA_ELETRODUTO;
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(comps(ctx).filter((c) => c.familyId === 'fam_krona_eletrica_curva90')).toHaveLength(1);
    expect(comps(ctx).filter((c) => c.familyId === CORRUGADO)).toHaveLength(0);
  });
  it('alternar rígido e corrugado na mesma sessão: cada um segue o seu motor', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    t.cancel?.();
    opcoesEletroduto.familiaId = FAMILIA_ELETRODUTO;
    const t2 = tool('eletroduto', ctx.env);
    clickAt(t2, 3, 0);
    clickAt(t2, 4, 0);
    clickAt(t2, 4, 1);
    expect(trechos(ctx)).toHaveLength(2);
    expect(comps(ctx).filter((c) => c.familyId === 'fam_krona_eletrica_curva90')).toHaveLength(1);
  });
});
