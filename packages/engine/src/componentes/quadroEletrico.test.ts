import { applyCommand, createEmptyProject, destinoDaFamilia, familiaDaBiblioteca, ID_QUADRO_ELETRICO, type Command, type Component, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { resolverComponente } from './instancia.ts';
import { ligacaoNoMundo, ligacoesCompativeis } from './ligacoesEncaixe.ts';
import { resolverFamilia } from './resolver.ts';
import { malhaDosCorpos } from './corposMalha.ts';

/*
 * Quadro de distribuição elétrico (ficha C4) no motor: monta nos três tipos, tem quatro entradas de eletroduto com diâmetro = DN
 * do tipo, cai no painel Elétrico e LIGA no eletroduto cortado da Krona elétrica (DN 20, 25 e 32), como as caixas de luz.
 */
const quadro = familiaDaBiblioteca(ID_QUADRO_ELETRICO)!;
const TUBO = 'fam_krona_eletrica_tubo_corte';

const aplicar = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  applyCommand(q, c);
  return q;
};
const comp = (id: string, familyId: string, typeId: string | null, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });

describe('família do quadro elétrico no motor', () => {
  it('existe na biblioteca MEP e cai no painel Elétrico da aba Sistemas', () => {
    expect(quadro).toBeDefined();
    expect(quadro.categoria).toBe('dispositivo_eletrico');
    expect(quadro.disciplina).toBe('eletrico');
    expect(destinoDaFamilia(quadro.categoria)).toEqual({ aba: 'sistemas', painel: 'eletrico' });
  });
  it('monta nos três tipos, sem erro, com malha de volume e 4 ligações no DN do tipo', () => {
    expect(quadro.tipos.map((t) => t.id)).toEqual(['dn20', 'dn25', 'dn32']);
    for (const t of quadro.tipos) {
      const r = resolverFamilia(quadro, { tipoId: t.id });
      expect(r.erros).toEqual([]);
      expect(malhaDosCorpos(r.corpos ?? []).solidas.indices.length).toBeGreaterThan(0);
      expect(r.ligacoes ?? []).toHaveLength(4);
      for (const l of r.ligacoes ?? []) {
        expect(l.dominio).toBe('eletroduto');
        expect(l.diametro! * 1000).toBeCloseTo(t.valores.DN as number, 6);
      }
    }
  });
  it('dimensões e posições são parâmetros editáveis e a descrição marca CONFERIR sem citar fabricante', () => {
    const ids = quadro.parametros.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['L', 'A', 'P', 'posicoes', 'DN']));
    expect(quadro.parametros.find((p) => p.id === 'posicoes')!.tipo).toBe('inteiro');
    expect(quadro.descricao).toMatch(/CONFERIR/);
    expect(quadro.descricao).not.toMatch(/Krona|Schneider|Siemens|Eletromar/i);
    const r = resolverFamilia(quadro, { tipoId: 'dn25', valores: { L: 600, A: 800, P: 150, posicoes: 24 } });
    expect(r.erros).toEqual([]);
    expect(r.env.posicoes).toBe(24);
    expect(r.env.L).toBe(600);
  });
  for (const dn of [20, 25, 32]) {
    it(`as entradas do tipo DN ${dn} são compatíveis com o eletroduto cortado da Krona elétrica de DN ${dn}`, () => {
      const tuboFam = familiaDaBiblioteca(TUBO)!;
      const tipoTubo = tuboFam.tipos.find((t) => t.valores.DN === dn)!;
      let p = createEmptyProject('t');
      p = aplicar(p, { type: 'upsertFamily', family: structuredClone(quadro) });
      p = aplicar(p, { type: 'upsertFamily', family: structuredClone(tuboFam) });
      p = aplicar(p, { type: 'addComponent', component: comp('q', ID_QUADRO_ELETRICO, `dn${dn}`) });
      const qc = p.elements.q as Component;
      const lq = resolverComponente(p, qc).ligacoes!.find((l) => l.id === 'a')!;
      const wq = ligacaoNoMundo(lq, qc);
      // Eletroduto de pé sobre a entrada superior: a ponta A (direção −Z) fica na entrada do quadro (direção +Z).
      p = aplicar(p, { type: 'addComponent', component: comp('t', TUBO, tipoTubo.id, { x: wq.posicaoMundo[0], y: wq.posicaoMundo[1], z: wq.posicaoMundo[2], values: { L: 500 } }) });
      const tc = p.elements.t as Component;
      const lt = resolverComponente(p, tc).ligacoes!.find((l) => l.id === 'a')!;
      expect(ligacoesCompativeis(wq, ligacaoNoMundo(lt, tc))).toEqual({ ok: true });
    });
  }
  it('o eletroduto liga no quadro pelo comando de conexão e a rede não acusa incompatibilidade', () => {
    const tuboFam = familiaDaBiblioteca(TUBO)!;
    let p = createEmptyProject('t');
    p = aplicar(p, { type: 'upsertFamily', family: structuredClone(quadro) });
    p = aplicar(p, { type: 'upsertFamily', family: structuredClone(tuboFam) });
    p = aplicar(p, { type: 'addComponent', component: comp('q', ID_QUADRO_ELETRICO, 'dn25') });
    const qc = p.elements.q as Component;
    const wq = ligacaoNoMundo(resolverComponente(p, qc).ligacoes!.find((l) => l.id === 'a')!, qc);
    p = aplicar(p, { type: 'addComponent', component: comp('t', TUBO, tuboFam.tipos.find((t) => t.valores.DN === 25)!.id, { x: wq.posicaoMundo[0], y: wq.posicaoMundo[1], z: wq.posicaoMundo[2], values: { L: 500 } }) });
    p = aplicar(p, { type: 'connectComponents', a: 't', ligacaoA: 'a', b: 'q', ligacaoB: 'a' });
    expect((p.elements.q as Component).ligacoes?.a?.componenteId).toBe('t');
    const dx = diagnosticarRede(p);
    expect(dx.filter((d) => d.codigo === 'incompativel' || d.codigo === 'conexao_invalida' || d.codigo === 'conexao_afastada')).toEqual([]);
  });
  it('eletroduto de outro DN não é compatível com o quadro (bitolas diferentes)', () => {
    const tuboFam = familiaDaBiblioteca(TUBO)!;
    let p = createEmptyProject('t');
    p = aplicar(p, { type: 'upsertFamily', family: structuredClone(quadro) });
    p = aplicar(p, { type: 'upsertFamily', family: structuredClone(tuboFam) });
    p = aplicar(p, { type: 'addComponent', component: comp('q', ID_QUADRO_ELETRICO, 'dn20') });
    p = aplicar(p, { type: 'addComponent', component: comp('t', TUBO, tuboFam.tipos.find((t) => t.valores.DN === 32)!.id, { values: { L: 500 } }) });
    const qc = p.elements.q as Component;
    const tc = p.elements.t as Component;
    const r = ligacoesCompativeis(ligacaoNoMundo(resolverComponente(p, qc).ligacoes!.find((l) => l.id === 'a')!, qc), ligacaoNoMundo(resolverComponente(p, tc).ligacoes!.find((l) => l.id === 'a')!, tc));
    expect(r.ok).toBe(false);
  });
});
