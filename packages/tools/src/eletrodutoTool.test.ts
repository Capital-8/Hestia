import { beforeEach, describe, expect, it } from 'vitest';
import { familiaDaBiblioteca, isComponent, KRONA_ELETRICA, type Component } from '@hestia/model';
import { diagnosticarRede, LIMITE_CURVAS_ENTRE_CAIXAS, ligacaoNoMundo, resolverComponente, tipoDaFamiliaDeTubo, trechosAcimaDoLimite, trechosEntreCaixas } from '@hestia/engine';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Ferramenta Eletroduto (ficha C3): o motor do Tubo com o tipo `krona_eletroduto_pvc`. Os valores esperados de recuo saem do CATÁLOGO
 * (`KRONA_ELETRICA`, estado CONFERIR), nunca de número escrito aqui. O que o catálogo transcrito NÃO tem (curva 45°, tê, junção,
 * redução, tampão; luva DN 32) aparece como aviso, sem peça inventada: os testes abaixo registram o resultado real.
 */

const TUBO = FAMILIA_ELETRODUTO;
const CURVA = 'fam_krona_eletrica_curva90';
const LUVA = 'fam_krona_eletrica_luva';
const CAIXA = 'fam_krona_eletrica_caixa_4x4';
type Ctx = ReturnType<typeof makeEnv>;
const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: Ctx, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
const Ls = (ctx: Ctx, id: string): number[] => porFamilia(ctx, id).map((c) => Number(c.values?.L ?? 0)).sort((a, b) => a - b);
const problemas = (ctx: Ctx) => diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'conexao_afastada' || d.codigo === 'incompativel' || d.codigo === 'conexao_invalida');
const linha = (itemId: string, bitola: string): Record<string, number> => {
  const l = KRONA_ELETRICA.itens.find((i) => i.id === itemId)?.linhas.find((x) => x.bitola === bitola);
  if (!l) throw new Error(`linha ausente no catálogo: ${itemId} ${bitola}`);
  return l.valores;
};

/** Ambiente limpo; recolhe as mensagens da ferramenta. */
function ambiente() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => { msgs.push(m); };
  return { ctx, msgs, t: tool('eletroduto', ctx.env) };
}

/** Caixa 4×4 da Krona (família e instância); `rot` em graus. Devolve a instância. */
function caixa(ctx: Ctx, id: string, x: number, y: number, rot = 0): Component {
  const f = familiaDaBiblioteca(CAIXA);
  if (!f) throw new Error('caixa ausente');
  if (!ctx.store.project.componentFamilies?.[CAIXA]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  const c = { id, kind: 'component', familyId: CAIXA, typeId: f.tipos[0]?.id ?? null, levelId: 'lv_0', x, y, z: 0.5, rotation: (rot * Math.PI) / 180, mirrored: false, values: { L: 100, A: 100, P: 50 }, mark: '' } as unknown as Component;
  ctx.store.exec({ type: 'addComponent', component: c });
  return ctx.store.project.elements[id] as Component;
}

/** Ponto (m) e direção da ligação `lig` da instância `c`. */
function entrada(ctx: Ctx, c: Component, lig: string): { x: number; y: number; z: number } {
  const l = resolverComponente(ctx.store.project, c).ligacoes?.find((q) => q.id === lig);
  if (!l) throw new Error(`ligação ausente: ${lig}`);
  const [x, y, z] = ligacaoNoMundo(l, c).posicaoMundo;
  return { x, y, z };
}

/** Duas caixas e o L entre elas: da entrada `d` da primeira (+X) até a `c` da segunda (girada 90°, de frente para −Y). */
function lEntreCaixas() {
  const a = ambiente();
  const cx1 = caixa(a.ctx, 'cx1', 0, 0);
  const cx2 = caixa(a.ctx, 'cx2', 2.025, 1, 90);
  const p1 = entrada(a.ctx, cx1, 'd');
  const p2 = entrada(a.ctx, cx2, 'c');
  opcoesEletroduto.z = p1.z;
  clickAt(a.t, p1.x, p1.y);
  clickAt(a.t, p2.x, p1.y);
  clickAt(a.t, p2.x, p2.y);
  return { ...a, cx1, cx2, p1, p2 };
}

beforeEach(() => {
  opcoesEletroduto.dn = 20;
  opcoesEletroduto.z = 0.5;
  opcoesEletroduto.declividade = 0;
  opcoesEletroduto.modoCota = 'subir_primeiro';
  opcoesEletroduto.familiaId = FAMILIA_ELETRODUTO;
});

describe('tipo krona_eletroduto_pvc', () => {
  it('a família do trecho acha o tipo elétrico, com as bitolas do catálogo (20, 25, 32)', () => {
    const tipo = tipoDaFamiliaDeTubo(TUBO);
    expect(tipo?.dominio).toBe('eletroduto');
    const doCatalogo = KRONA_ELETRICA.itens.find((i) => i.id === 'tubo_eletroduto_de_pvc_rigido_soldavel_3m')?.linhas.map((l) => Number(l.bitola)).sort((a, b) => a - b);
    expect(tipo?.bitolas).toEqual(doCatalogo);
  });

  it('as regras apontam para famílias reais; onde o catálogo não tem a peça a regra fica vazia', () => {
    const r = tipoDaFamiliaDeTubo(TUBO)?.regras;
    expect(r).toBeDefined();
    for (const id of [r?.tubo, r?.curva90, r?.luva]) expect(familiaDaBiblioteca(id ?? ''), id).toBeTruthy();
    // Resultado real do catálogo transcrito (ficha C1): sem curva 45°, tê, junção 45°, redução e tampão elétricos.
    expect([r?.curva45, r?.te, r?.juncao45, r?.reducao, r?.tampao]).toEqual(['', '', '', '', '']);
  });

  it('bitola fora do catálogo (DN 40) é recusada com o motivo e nada é criado', () => {
    const { ctx, msgs, t } = ambiente();
    opcoesEletroduto.dn = 40;
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(comps(ctx)).toHaveLength(0);
    expect(msgs.at(-1)).toMatch(/^Eletroduto: DN 40 não existe na linha eletroduto rígido soldável da Krona\. Bitolas: 20, 25, 32\./);
  });

  it('a ferramenta Tubo não perde nada: opções separadas e id próprio', () => {
    expect(opcoesEletroduto).not.toBe(opcoesTubo);
    const { t } = ambiente();
    expect(t.id).toBe('eletroduto');
    expect(t.label).toBe('Eletroduto');
  });
});

describe('traço', () => {
  it('traço reto: um eletroduto cortado com o comprimento clicado; a família entra no projeto com a curva e a luva', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(Ls(ctx, TUBO)).toEqual([2000]);
    expect(comps(ctx)[0]?.values?.DN).toBe(20);
    expect(ctx.store.project.componentFamilies?.[CURVA]).toBeDefined();
    expect(ctx.store.project.componentFamilies?.[LUVA]).toBeDefined();
  });

  it('bitolas 25 e 32 do catálogo servem', () => {
    for (const dn of [25, 32]) {
      const { ctx, t } = ambiente();
      opcoesEletroduto.dn = dn;
      clickAt(t, 0, 0);
      clickAt(t, 1, 0);
      expect(comps(ctx).filter((c) => c.familyId === TUBO).map((c) => c.values?.DN)).toEqual([dn]);
    }
  });

  it('curva 90° no canto: a curva da Krona elétrica entra e cada trecho recua o que o catálogo manda', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    const curvas = porFamilia(ctx, CURVA);
    expect(curvas).toHaveLength(1);
    expect([curvas[0]?.x, curvas[0]?.y]).toEqual([1, 0]);
    const c = linha('curva_90_para_eletroduto_soldavel', '20');
    // Ponta lisa a C do cruzamento; bolsa a Z + B = C. O recuo da ponta é C inteiro; o da bolsa é C − B (a ponta entra B na bolsa).
    const esperado = [1000 - (c.C ?? 0), 1000 - ((c.C ?? 0) - (c.B ?? 0))].sort((a, b) => a - b);
    const L = Ls(ctx, TUBO);
    expect(L[0]).toBeCloseTo(esperado[0] ?? 0, 6);
    expect(L[1]).toBeCloseTo(esperado[1] ?? 0, 6);
    expect(problemas(ctx)).toEqual([]);
  });

  it('luva em linha: dois trechos colineares ganham a luva e cada um recua do centro até a ponta ficar dentro da bolsa', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 2, 0);
    const luvas = porFamilia(ctx, LUVA);
    expect(luvas).toHaveLength(1);
    const c = linha('luva_para_eletroduto_soldavel', '20');
    const recuo = (c.C ?? 0) / 2 - (c.B ?? 0);
    expect(Ls(ctx, TUBO)).toEqual([1000 - recuo, 1000 - recuo].map((v) => expect.closeTo(v, 6)));
    expect(problemas(ctx)).toEqual([]);
  });

  it('luva ausente (DN 32 não tem luva no catálogo): trechos ligados direto e aviso; resultado real do catálogo', () => {
    const { ctx, msgs, t } = ambiente();
    opcoesEletroduto.dn = 32;
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 2, 0);
    expect(porFamilia(ctx, LUVA)).toHaveLength(0);
    expect(Ls(ctx, TUBO)).toEqual([1000, 1000]);
    expect(msgs.at(-1)).toMatch(/não tem as ligações esperadas: trechos ligados direto/);
    expect(problemas(ctx)).toEqual([]);
  });

  it('curva do DN 32 existe no catálogo e entra', () => {
    const { ctx, t } = ambiente();
    opcoesEletroduto.dn = 32;
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 1, 1);
    expect(porFamilia(ctx, CURVA)).toHaveLength(1);
    expect(problemas(ctx)).toEqual([]);
  });

  it('peça ausente: curva de 45° não existe no catálogo, o encontro fica sem conexão e avisa (sem peça inventada)', () => {
    const { ctx, msgs, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    clickAt(t, 2, 1);
    expect(porFamilia(ctx, TUBO)).toHaveLength(2);
    expect(comps(ctx).filter((c) => c.familyId !== TUBO)).toHaveLength(0);
    expect(msgs.at(-1)).toMatch(/não tem joelho ou curva de 45°/);
  });

  it('peça ausente: tê não existe no catálogo; derivação no meio do eletroduto BLOQUEIA com motivo e sugestão de caixa, nada gravado', () => {
    const { ctx, msgs, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    clickAt(t, 1, 1);
    clickAt(t, 1, 0);
    expect(porFamilia(ctx, TUBO)).toHaveLength(1);
    expect(Ls(ctx, TUBO)).toContain(2000);
    expect(comps(ctx).filter((c) => c.familyId !== TUBO)).toHaveLength(0);
    expect(msgs.at(-1)).toMatch(/não tem tê/);
  });
});

describe('prumada, viabilidade e bloqueio', () => {
  it('prumada: pontos de cotas diferentes viram vertical + horizontal ligados pela curva 90° (subir primeiro)', () => {
    const { ctx, t } = ambiente();
    opcoesEletroduto.z = 0;
    clickAt(t, 0, 0);
    opcoesEletroduto.z = 2;
    clickAt(t, 3, 0);
    expect(porFamilia(ctx, TUBO)).toHaveLength(2);
    expect(porFamilia(ctx, CURVA)).toHaveLength(1);
    const c = linha('curva_90_para_eletroduto_soldavel', '20');
    expect(Ls(ctx, TUBO).reduce((s, v) => s + v, 0)).toBeCloseTo(5000 - ((c.C ?? 0) + (c.C ?? 0) - (c.B ?? 0)), 6);
    expect(porFamilia(ctx, CURVA)[0]?.z).toBe(2);
    expect(problemas(ctx)).toEqual([]);
  });

  it('bloqueio com mensagem: trecho curto demais para a curva (DN 32: C do catálogo > 100 mm) não cria nada e a fala traz o motivo', () => {
    const { ctx, msgs, t } = ambiente();
    opcoesEletroduto.dn = 32;
    clickAt(t, 0, 0);
    clickAt(t, 0.1, 0);
    const antes = comps(ctx).length;
    clickAt(t, 0.1, 0.1);
    expect(comps(ctx)).toHaveLength(antes);
    expect(msgs.at(-1)).toMatch(/^Bloqueado: /);
  });
});

describe('caixas como nós', () => {
  it('caixa nas duas pontas: o eletroduto liga na entrada de cada caixa, a curva fecha o L e a rede não acusa afastamento nem incompatibilidade', () => {
    const { ctx, cx1, cx2 } = lEntreCaixas();
    expect(porFamilia(ctx, TUBO)).toHaveLength(2);
    expect(porFamilia(ctx, CURVA)).toHaveLength(1);
    const liga = (id: string): string[] => Object.values((ctx.store.project.elements[id] as Component).ligacoes ?? {}).map((v) => v.componenteId);
    expect(liga(cx1.id)).toHaveLength(1);
    expect(liga(cx2.id)).toHaveLength(1);
    expect(problemas(ctx)).toEqual([]);
    // Só as entradas livres das caixas ficam abertas; nenhum eletroduto, curva ou luva tem ponta aberta.
    const abertas = diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'ligacao_aberta');
    expect(abertas.every((d) => d.elementId === cx1.id || d.elementId === cx2.id)).toBe(true);
    expect(abertas).toHaveLength(6);
  });

  it('o trecho entre as duas caixas tem 1 curva e as duas caixas nas extremidades', () => {
    const { ctx } = lEntreCaixas();
    const trechos = trechosEntreCaixas(ctx.store.project);
    expect(trechos).toHaveLength(1);
    expect(trechos[0]?.curvas).toBe(1);
    expect(trechos[0]?.caixas.sort()).toEqual(['cx1', 'cx2']);
  });

  it('ponta sem caixa fica aberta e "Verificar rede" a lista', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    const abertas = diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'ligacao_aberta');
    expect(abertas).toHaveLength(2);
    expect(abertas.every((d) => d.elementId === comps(ctx)[0]?.id)).toBe(true);
  });

  it('bitola que não casa com a entrada da caixa (DN 25 contra 20) não liga e avisa; resultado real: a entrada da Krona é de DN 20', () => {
    const { ctx, msgs, t } = ambiente();
    const cx1 = caixa(ctx, 'cx1', 0, 0);
    const p = entrada(ctx, cx1, 'd');
    opcoesEletroduto.dn = 25;
    opcoesEletroduto.z = p.z;
    clickAt(t, p.x + 1, p.y);
    clickAt(t, p.x, p.y);
    expect(Object.keys((ctx.store.project.elements['cx1'] as Component).ligacoes ?? {})).toHaveLength(0);
    expect(msgs.at(-1)).toMatch(/ao lado da entrada da caixa, mas não ligou/);
  });
});

describe('limite de curvas entre caixas (valor provisório, CONFERIR)', () => {
  /** Escada com `n` curvas: segue +X e +Y alternando. */
  function escada(n: number) {
    const a = ambiente();
    clickAt(a.t, 0, 0);
    for (let k = 1; k <= n + 1; k++) clickAt(a.t, Math.ceil(k / 2), Math.floor(k / 2));
    return a;
  }

  it('até o limite não alerta; acima, ALERTA sem bloquear e o diagnóstico lista o trecho', () => {
    expect(LIMITE_CURVAS_ENTRE_CAIXAS).toBe(3);
    const ok = escada(LIMITE_CURVAS_ENTRE_CAIXAS);
    expect(porFamilia(ok.ctx, CURVA)).toHaveLength(3);
    expect(ok.msgs.some((m) => /Alerta/.test(m))).toBe(false);
    expect(diagnosticarRede(ok.ctx.store.project).some((d) => d.codigo === 'curvas_entre_caixas')).toBe(false);

    const demais = escada(LIMITE_CURVAS_ENTRE_CAIXAS + 1);
    expect(porFamilia(demais.ctx, CURVA)).toHaveLength(4);
    expect(demais.msgs.at(-1)).toMatch(/Alerta: 4 curvas entre caixas, acima do limite de 3 \(valor provisório, CONFERIR contra a norma vigente\)\. Nada foi bloqueado\./);
    const d = diagnosticarRede(demais.ctx.store.project).filter((x) => x.codigo === 'curvas_entre_caixas');
    expect(d).toHaveLength(1);
    expect(d[0]?.valor).toBe(4);
  });

  it('o limite é dado: outro valor muda o resultado sem mexer na ferramenta', () => {
    const { ctx } = escada(4);
    expect(trechosAcimaDoLimite(ctx.store.project)).toHaveLength(1);
    expect(trechosAcimaDoLimite(ctx.store.project, 4)).toHaveLength(0);
    expect(trechosAcimaDoLimite(ctx.store.project, 1)).toHaveLength(1);
  });
});

describe('desfazer', () => {
  it('um passo de desfazer remove o trecho, a curva e os recuos do último segmento', () => {
    const { ctx, t } = ambiente();
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    const antes = JSON.stringify(Object.keys(ctx.store.project.elements).sort());
    clickAt(t, 1, 1);
    expect(porFamilia(ctx, CURVA)).toHaveLength(1);
    ctx.store.undo();
    expect(porFamilia(ctx, CURVA)).toHaveLength(0);
    expect(JSON.stringify(Object.keys(ctx.store.project.elements).sort())).toBe(antes);
    expect(Ls(ctx, TUBO)).toEqual([1000]);
  });
});

describe('rede', () => {
  it('cadeia com curva, luva e caixas: diagnosticarRede sem conexao_afastada nem incompativel', () => {
    const { ctx } = lEntreCaixas();
    expect(diagnosticarRede(ctx.store.project).filter((d) => d.codigo === 'conexao_afastada' || d.codigo === 'incompativel')).toEqual([]);
  });
});
