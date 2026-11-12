import { describe, expect, it } from 'vitest';
import type { CenaV2 } from '@hestia/geom';
import { ProjectStore, type GuardaCorpo } from '@hestia/model';
import { projetoGuardaCorpo as projeto } from './fixtureGuardaCorpo.ts';
import { NOMES_SECOES_GC, aplicarDiferencaGC, diferencaGC, enviarCenaGC, montarCenaGC, profundidadeDoDegrau, sincronizarCenaGC, type CenaGC } from './kernelGuardaCorpo.ts';
import { resolveStairOne } from './stairs.ts';

const linhas = (c: CenaGC, nome: (typeof NOMES_SECOES_GC)[number]): Array<Record<string, number>> =>
  Array.from({ length: c.nLinhas[nome] }, (_, i) => Object.fromEntries(Object.entries(c.secoes[nome]).map(([k, col]) => [k, col[i]!])));

describe('montarCenaGC', () => {
  const { p } = projeto();
  const c = montarCenaGC(p);

  it('envia só o que os guarda-corpos usam e numera os guarda-corpos', () => {
    expect(c.ignorados).toEqual([]);
    expect([...c.guardaDe.keys()].sort()).toEqual(['gc_e', 'gc_m', 'gc_r']);
    expect(c.nLinhas.escadas_gc).toBe(1);
    expect(c.nLinhas.rampas_gc).toBe(1);
    expect(c.nLinhas.guardas_corpo).toBe(3);
    expect(c.nLinhas.guarda_caminhos_manuais).toBe(3);
    expect(c.nLinhas.tipos_guarda).toBe(3);
    expect(c.nLinhas.trilhos_guarda + c.nLinhas.corrimaos_guarda).toBeGreaterThan(0);
    expect(c.nLinhas.postes_guarda).toBe(12); // 4 papéis por tipo
    // Toda coluna de toda seção tem o mesmo comprimento.
    for (const nome of NOMES_SECOES_GC) for (const col of Object.values(c.secoes[nome])) expect(col.length).toBe(c.nLinhas[nome]);
  });

  it('escada: componentes, bordas, espelhos e profundidade do degrau', () => {
    expect(c.nLinhas.escada_componentes_gc).toBe(1);
    expect(c.nLinhas.escada_curvas_gc).toBe(2);
    expect(c.nLinhas.escada_espelhos_gc).toBe(17);
    const e = linhas(c, 'escadas_gc')[0]!;
    expect(e['nivel_num']).toBe(0);
    const rs = resolveStairOne(p, p.elements['st1'] as never)!;
    expect(e['z_topo']! - e['z_base']!).toBeCloseTo(rs.topZ - rs.baseZ, 6);
    expect(e['profundidade_piso']).toBeCloseTo(0.28, 6);
    expect(e['altura_espelho']).toBeCloseTo(rs.riserHeight, 6);
    const esp = linhas(c, 'escada_espelhos_gc');
    expect(esp[16]!['z1']).toBeCloseTo(e['z_topo']!, 6);
    expect(profundidadeDoDegrau(resolveStairOne(p, p.elements['st1'] as never)!)).toBeCloseTo(0.28, 6);
  });

  it('rampa: lances e patamares com o índice do componente', () => {
    expect(c.nLinhas.rampa_lances_gc).toBeGreaterThan(0);
    const r = linhas(c, 'rampas_gc')[0]!;
    expect(r['z_topo']! - r['z_base']!).toBeCloseTo(1.2, 6);
    const lances = linhas(c, 'rampa_lances_gc');
    expect(lances[0]!['z0']).toBeCloseTo(r['z_base']!, 6);
    expect(lances.at(-1)!['z1']).toBeCloseTo(r['z_topo']!, 6);
  });

  it('guarda-corpo: lados em bits, posição de base, altura NaN = do tipo e flags', () => {
    const por = (id: string) => linhas(c, 'guardas_corpo').find((l) => l['id_num'] === c.guardaDe.get(id))!;
    const e = por('gc_e');
    expect(e['hosp']).toBe(1);
    expect(e['hosp_num']).toBe(c.escadaDe.get('st1'));
    expect(e['lados']).toBe(1 | 2 | 4); // esquerdo lance e patamar, direito só lance
    expect(e['pos_base']).toBe(0);
    expect(Number.isNaN(e['altura'])).toBe(true);
    expect(e['flags']).toBe(7);
    const r = por('gc_r');
    expect(r['hosp']).toBe(2);
    expect(r['lados']).toBe(15);
    expect(r['pos_base']).toBe(1);
    const m = por('gc_m');
    expect(m['hosp']).toBe(0);
    expect(m['hosp_num']).toBe(0xffffffff);
    expect(m['cota_base']).toBe(3);
    expect(m['altura']).toBe(1.2);
    expect(m['lado_desloc']).toBe(0);
    const pontos = linhas(c, 'guarda_caminhos_manuais').filter((l) => l['guarda_num'] === m['id_num']);
    expect(pontos.map((q) => q['dz'])).toEqual([0, 0, 0.5]);
  });

  it('tipos: perfis iguais são internados uma vez e a norma do projeto tem número', () => {
    const chaves = linhas(c, 'perfis_guarda').map((l) => `${l['forma']}:${l['largura']}:${l['altura']}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const t of linhas(c, 'trilhos_guarda')) expect(linhas(c, 'perfis_guarda').some((pf) => pf['id_num'] === t['perfil_num'])).toBe(true);
    for (const circ of linhas(c, 'perfis_guarda').filter((pf) => pf['forma'] === 0)) expect(circ['lados']).toBe(circ['largura']! > 0.08 ? 24 : 16);
    const norma = linhas(c, 'normas_guarda').find((l) => l['id_num'] === c.normaProjetoNum)!;
    expect(norma).toBeDefined();
    const flags = norma['n_flags']!;
    expect(flags & (1 << 1)).not.toBe(0); // altura_minima definida no Brasil
    expect(norma['altura_minima']).toBeGreaterThan(1);
    expect(flags >>> 26).toBe(0);
    // Os dois campos do par alturaMinimaAlta ligam juntos.
    expect((flags >> 3) & 1).toBe((flags >> 4) & 1);
  });

  it('ignora guarda-corpo sem hospedeiro ou sem tipo', () => {
    const q = structuredClone(p);
    delete q.elements['st1'];
    (q.elements['gc_m'] as GuardaCorpo).typeId = 'inexistente';
    const c2 = montarCenaGC(q);
    expect(c2.ignorados.sort()).toEqual(['gc_e', 'gc_m']);
    expect(c2.nLinhas.guardas_corpo).toBe(1);
    expect(c2.nLinhas.escadas_gc).toBe(0);
  });

  it('é determinístico', () => {
    const outra = montarCenaGC(p);
    for (const nome of NOMES_SECOES_GC) expect(JSON.stringify(outra.secoes[nome])).toBe(JSON.stringify(c.secoes[nome]));
  });
});

/** Cena falsa que só registra as chamadas, na mesma forma de `CenaV2`. */
function gravador() {
  const chamadas: Array<{ op: 'definir' | 'upsert' | 'remover'; secao: string; n: number }> = [];
  const cena = {
    definirSecao: (secao: string, _c: unknown, n: number) => chamadas.push({ op: 'definir', secao, n }),
    upsert: (secao: string, _c: unknown, n: number) => chamadas.push({ op: 'upsert', secao, n }),
    remover: (secao: string, ids: ArrayLike<number>) => chamadas.push({ op: 'remover', secao, n: ids.length }),
  } as unknown as CenaV2;
  return { cena, chamadas };
}

describe('envio e diferença', () => {
  it('enviarCenaGC manda as 20 seções', () => {
    const { p } = projeto();
    const { cena, chamadas } = gravador();
    enviarCenaGC(cena, montarCenaGC(p));
    expect(chamadas.map((x) => x.secao)).toEqual([...NOMES_SECOES_GC]);
    expect(chamadas.every((x) => x.op === 'definir')).toBe(true);
  });

  it('cena igual não gera diferença', () => {
    const { p } = projeto();
    const a = montarCenaGC(p);
    expect(diferencaGC(a, montarCenaGC(p, { anterior: a }))).toEqual([]);
    expect(diferencaGC(a, a)).toEqual([]);
  });

  it('editar a escada reenvia só as linhas dela', () => {
    const { p } = projeto();
    const a = montarCenaGC(p);
    // Topo da escada 10 cm mais alto (croqui fixo): muda a escada e os espelhos; rampa, tipos e guarda-corpos ficam.
    const s = new ProjectStore(structuredClone(p));
    s.exec({ type: 'updateElements', ids: ['st1'], patch: { topOffset: -0.1, riserMode: 'fixed' } });
    const b = montarCenaGC(s.project, { anterior: a });
    const d = diferencaGC(a, b);
    const secoes = d.map((x) => x.secao);
    expect(secoes).toContain('escadas_gc');
    expect(secoes).toContain('escada_espelhos_gc');
    for (const nome of ['rampas_gc', 'rampa_lances_gc', 'tipos_guarda', 'guardas_corpo', 'guarda_caminhos_manuais', 'perfis_guarda', 'normas_guarda'] as const) expect(secoes).not.toContain(nome);
    const esp = d.find((x) => x.secao === 'escada_espelhos_gc')!;
    expect(esp.nUpsert).toBeGreaterThanOrEqual(1);
    expect(esp.nUpsert).toBeLessThanOrEqual(17);
    expect(esp.remover).toEqual([]);
    // Os números dos hospedeiros não mudam.
    expect(b.escadaDe.get('st1')).toBe(a.escadaDe.get('st1'));
    expect(b.rampaDe.get('rp1')).toBe(a.rampaDe.get('rp1'));
  });

  it('apagar um guarda-corpo remove as linhas dele, e o hospedeiro sem uso sai da cena', () => {
    const { p } = projeto();
    const a = montarCenaGC(p);
    const s = new ProjectStore(structuredClone(p));
    s.exec({ type: 'deleteGuardaCorpo', id: 'gc_r' });
    const b = montarCenaGC(s.project, { anterior: a });
    const d = diferencaGC(a, b);
    const g = d.find((x) => x.secao === 'guardas_corpo')!;
    expect(g.remover).toEqual([a.guardaDe.get('gc_r')]);
    expect(g.nUpsert).toBe(0);
    expect(d.find((x) => x.secao === 'rampas_gc')!.remover).toEqual([a.rampaDe.get('rp1')]);
    expect(d.find((x) => x.secao === 'rampa_lances_gc')!.remover.length).toBeGreaterThan(0);
    // O vidro deixa de ser usado: o tipo e os perfis dele saem.
    expect(d.find((x) => x.secao === 'tipos_guarda')!.remover).toEqual([a.tipoDe.get('gct_vidro')]);
    const { cena, chamadas } = gravador();
    aplicarDiferencaGC(cena, d);
    expect(chamadas.filter((x) => x.op === 'remover').length).toBe(d.filter((x) => x.remover.length > 0).length);
    expect(chamadas.every((x) => x.op !== 'definir')).toBe(true);
  });

  it('sincronizarCenaGC sem cena anterior envia tudo e com anterior só a diferença', () => {
    const { p } = projeto();
    const a = montarCenaGC(p);
    const g1 = gravador();
    expect(sincronizarCenaGC(g1.cena, null, a)).toHaveLength(NOMES_SECOES_GC.length);
    expect(g1.chamadas).toHaveLength(NOMES_SECOES_GC.length);
    const g2 = gravador();
    sincronizarCenaGC(g2.cena, a, montarCenaGC(p, { anterior: a }));
    expect(g2.chamadas).toEqual([]);
    // Mudar só a altura de um guarda-corpo toca só `guardas_corpo`.
    const s = new ProjectStore(structuredClone(p));
    s.exec({ type: 'updateGuardaCorpo', id: 'gc_e', patch: { altura: 1.05 } });
    const g3 = gravador();
    sincronizarCenaGC(g3.cena, a, montarCenaGC(s.project, { anterior: a }));
    expect(g3.chamadas).toEqual([{ op: 'upsert', secao: 'guardas_corpo', n: 1 }]);
  });
});
