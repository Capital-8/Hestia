/**
 * Guarda-corpo, Fase 2 (decisão 0055): o adaptador TS monta as seções 60 a 81 e o Rust REAL as decodifica e confere as referências entre elas.
 * Roda só em `npm run test:wasm`. A consulta `guarda_caminhos` valida e devolve as cadeias (Fase 3a); a paridade com a referência TS está em `kernel-gc3a.wasm.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ProjectStore, type GuardaCorpo } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { NOMES_SECOES_GC, ID_AUSENTE_GC, enviarCenaGC, montarCenaGC, sincronizarCenaGC, type CenaGC } from '../packages/engine/src/kernelGuardaCorpo.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { CODIGOS } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

/** Cria a cena com as seções do guarda-corpo (a fonte reenvia a última cena montada). */
function criar(c: CenaGC): { cena: CenaV2; atual: { c: CenaGC } } {
  const atual = { c };
  return { cena: CenaV2.criar(ger!, (cena) => enviarCenaGC(cena, atual.c)), atual };
}

const consultar = (cena: CenaV2) => cena.consultar('guarda_caminhos', [0, 1e-6]);
const codigoDe = (f: () => unknown): number | null => {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ErroKernelLeve) return e.codigo;
    throw e;
  }
};

describe('guarda-corpo, Fase 2: seções no Rust real', () => {
  it.skipIf(!bytes)('as 20 seções montadas pelo TS entram e as referências fecham', () => {
    const { p } = projetoGuardaCorpo();
    const c = montarCenaGC(p);
    expect(c.ignorados).toEqual([]);
    const { cena } = criar(c);
    const saidas = consultar(cena);
    expect(Object.keys(saidas)).toEqual(['trechos', 'nos', 'avisos', 'valores']);
    expect(saidas['trechos']!.length).toBeGreaterThan(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('as outras consultas do guarda-corpo seguem como NAO_IMPLEMENTADO', () => {
    const { cena } = criar(montarCenaGC(projetoGuardaCorpo().p));
    expect(codigoDe(() => cena.consultar('guarda_malha', [0, 1]))).toBe(CODIGOS.NAO_IMPLEMENTADO);
    cena.destruir();
  });

  it.skipIf(!bytes)('upsert e remover incrementais: o hospedeiro editado reenvia só as linhas dele', () => {
    const { p } = projetoGuardaCorpo();
    const a = montarCenaGC(p);
    const { cena, atual } = criar(a);
    const s = new ProjectStore(structuredClone(p));
    s.exec({ type: 'updateElements', ids: ['st1'], patch: { topOffset: -0.1, riserMode: 'fixed' } });
    const b = montarCenaGC(s.project, { anterior: a });
    const d = sincronizarCenaGC(cena, a, b);
    atual.c = b;
    expect(d.map((x) => x.secao).sort()).toEqual(['escada_espelhos_gc', 'escadas_gc']);
    expect(consultar(cena)['trechos']!.length).toBeGreaterThan(0);
    // Apagar o guarda-corpo da rampa e depois a rampa inteira da cena também fecha as referências.
    s.exec({ type: 'deleteGuardaCorpo', id: 'gc_r' });
    const c2 = montarCenaGC(s.project, { anterior: b });
    sincronizarCenaGC(cena, b, c2);
    atual.c = c2;
    expect(c2.nLinhas.rampas_gc).toBe(0);
    expect(consultar(cena)['trechos']!.length).toBeGreaterThan(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('referência quebrada dá ENTRADA na consulta (o dado entra, a conferência recusa)', () => {
    const { p } = projetoGuardaCorpo();
    const c = montarCenaGC(p);
    const { cena } = criar(c);
    cena.remover('escadas_gc', [c.escadaDe.get('st1')!]);
    expect(codigoDe(() => consultar(cena))).toBe(CODIGOS.ENTRADA);
    cena.destruir();
  });

  it.skipIf(!bytes)('dado fora do domínio dá ENTRADA ao definir', () => {
    const { p } = projetoGuardaCorpo();
    const c = montarCenaGC(p);
    const { cena } = criar(c);
    const g = { ...c.secoes.guardas_corpo };
    g['lados'] = g['lados']!.map(() => 16);
    expect(codigoDe(() => cena.definirSecao('guardas_corpo', g, c.nLinhas.guardas_corpo))).toBe(CODIGOS.ENTRADA);
    const t = { ...c.secoes.tipos_guarda };
    t['tol_corda'] = t['tol_corda']!.map(() => 0.1);
    expect(codigoDe(() => cena.definirSecao('tipos_guarda', t, c.nLinhas.tipos_guarda))).toBe(CODIGOS.ENTRADA);
    const n = { ...c.secoes.normas_guarda };
    n['n_flags'] = n['n_flags']!.map((f) => f | (1 << 26));
    expect(codigoDe(() => cena.definirSecao('normas_guarda', n, c.nLinhas.normas_guarda))).toBe(CODIGOS.ENTRADA);
    // A cena continua válida depois das recusas.
    expect(consultar(cena)['trechos']!.length).toBeGreaterThan(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('mais de 512 vértices no caminho manual dá LIMITE', () => {
    const p = structuredClone(projetoGuardaCorpo().p);
    const g = p.elements['gc_m'] as GuardaCorpo;
    if (g.hospedeiro.tipo !== 'manual') throw new Error('fixture');
    g.hospedeiro.caminho = Array.from({ length: 513 }, (_, i) => ({ x: i * 0.1, y: 8, dz: 0 }));
    const { cena } = criar(montarCenaGC(p));
    expect(codigoDe(() => consultar(cena))).toBe(CODIGOS.LIMITE);
    g.hospedeiro.caminho = g.hospedeiro.caminho.slice(0, 512);
    cena.destruir();
    const ok = criar(montarCenaGC(p));
    expect(consultar(ok.cena)['trechos']!.length).toBeGreaterThan(0);
    ok.cena.destruir();
  });

  it.skipIf(!bytes)('reenviar a cena inteira (como na recriação da instância) não muda a conferência', () => {
    const { p } = projetoGuardaCorpo();
    const c = montarCenaGC(p);
    expect(NOMES_SECOES_GC).toHaveLength(20);
    expect(ID_AUSENTE_GC).toBe(0xffffffff);
    const { cena } = criar(c);
    enviarCenaGC(cena, c);
    expect(consultar(cena)['trechos']!.length).toBeGreaterThan(0);
    cena.destruir();
  });
});
