import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, isComponent, makeLevel, type Command, type Component, type Familia, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { listaPecasCsv } from './listaPecas.ts';
import { resolverComponente } from './instancia.ts';
import { orcamentoDoProjeto } from './orcamento.ts';

const aplicarCopia = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicar(q, c); return q; };

const FAMILIA_ALTA: Familia = (() => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.id = 'fam_armario_alto';
  f.nome = 'Armário alto';
  f.tipos = f.tipos.map((t) => ({ ...t, nome: `${t.nome} alto` }));
  return f;
})();

const projetoBase = (): Project => {
  let p = createEmptyProject('t');
  p = aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ALTA) });
};

const add = (p: Project, id: string, extra: Partial<Component> = {}): Project =>
  aplicarCopia(p, {
    type: 'addComponent',
    component: {
      id, kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id,
      x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: 'M', ...extra,
    },
  });

/** Componente do projeto pelo id. */
const comp = (p: Project, id: string): Component => {
  const e = p.elements[id];
  if (e === undefined || !isComponent(e)) throw new Error(`componente ${id} não existe`);
  return e;
};

/** Peças não vazias de um móvel isolado (a "unidade" dos grupos). */
const pecasDeUm = (p: Project, id: string): number => resolverComponente(p, comp(p, id)).pecas.filter((q) => !q.vazio).length;

const copiaPura = (p: Project): Project => structuredClone(JSON.parse(JSON.stringify(p)));

describe('orcamentoDoProjeto', () => {
  it('projeto sem componentes: tudo vazio e avisos vazio', () => {
    const orc = orcamentoDoProjeto(projetoBase());
    expect(orc.moveis).toEqual([]);
    expect(orc.linhas).toEqual([]);
    expect(orc.resumo.totalPecas).toBe(0);
    expect(orc.resumo.areaM2).toBe(0);
    expect(orc.custo).toEqual({ chapas: 0, fitas: 0, ferragens: 0, total: 0 });
    expect(orc.ferragens).toEqual([]);
    expect(orc.avisos).toEqual([]);
  });

  it('três armários iguais viram um móvel com quantidade 3 e peças 3× as de um', () => {
    let p = projetoBase();
    p = add(p, 'c1');
    p = add(p, 'c2', { x: 2 });
    p = add(p, 'c3', { x: 3 });
    const orc = orcamentoDoProjeto(p);
    expect(orc.moveis).toHaveLength(1);
    const movel = orc.moveis[0]!;
    expect(movel.familiaId).toBe(FAMILIA_ARMARIO.id);
    expect(movel.tipoId).toBe('A80');
    expect(movel.nome).toBe('Armário 80 (2 portas)');
    expect(movel.quantidade).toBe(3);
    expect(movel.ids).toEqual(['c1', 'c2', 'c3']);
    expect(movel.pecas).toBe(3 * pecasDeUm(p, 'c1'));
  });

  it('valores de instância diferentes separam o grupo', () => {
    let p = projetoBase();
    p = add(p, 'c1');
    p = add(p, 'c2', { values: { L: 700 } });
    const orc = orcamentoDoProjeto(p);
    expect(orc.moveis).toHaveLength(2);
    expect(orc.moveis.every((m) => m.quantidade === 1)).toBe(true);
  });

  it('as linhas consolidadas somam as quantidades de cada móvel', () => {
    const um = orcamentoDoProjeto(add(projetoBase(), 'c1'));
    let pTres = projetoBase();
    pTres = add(pTres, 'c1');
    pTres = add(pTres, 'c2');
    pTres = add(pTres, 'c3');
    const tres = orcamentoDoProjeto(pTres);
    expect(tres.linhas).toHaveLength(um.linhas.length);
    for (let i = 0; i < um.linhas.length; i++) {
      expect(tres.linhas[i]!.quantidade).toBe(3 * um.linhas[i]!.quantidade);
    }
    expect(tres.resumo.totalPecas).toBe(3 * um.resumo.totalPecas);
    expect(tres.resumo.areaM2).toBeCloseTo(3 * um.resumo.areaM2, 6);
    expect(tres.moveis[0]!.pecas).toBe(um.moveis[0]!.pecas * 3);
  });

  it('duas famílias diferentes geram dois móveis ordenados por nome', () => {
    let p = projetoBase();
    p = add(p, 'cBaixo');
    p = add(p, 'cAlto', { familyId: FAMILIA_ALTA.id, typeId: 'A60' });
    const orc = orcamentoDoProjeto(p);
    expect(orc.moveis).toHaveLength(2);
    const nomes = orc.moveis.map((m) => m.nome);
    expect([...nomes].sort((a, b) => a.localeCompare(b))).toEqual(nomes);
    expect(nomes).toContain('Armário 60 (1 porta) alto');
    expect(orc.moveis.reduce((s, m) => s + m.quantidade, 0)).toBe(2);
  });

  it('componente com família ausente vira aviso e os outros continuam', () => {
    let p = projetoBase();
    p = add(p, 'c1');
    // `addComponent` recusa família inexistente: o caso surge ao APAGAR a família com instâncias no projeto.
    const q = structuredClone(p);
    q.elements['cQuebrado'] = { ...comp(q, 'c1'), id: 'cQuebrado', familyId: 'nao_existe', x: 4 };
    const orc = orcamentoDoProjeto(q);
    expect(orc.avisos).toHaveLength(1);
    expect(orc.avisos[0]).toContain('cQuebrado');
    expect(orc.avisos[0]).toContain('Família do componente não existe no projeto.');
    expect(orc.moveis).toHaveLength(1);
    expect(orc.moveis[0]!.ids).toEqual(['c1']);
    const limpo = orcamentoDoProjeto(add(projetoBase(), 'c1'));
    expect(orc.linhas).toEqual(limpo.linhas);
    expect(Math.abs(orc.custo.total - limpo.custo.total)).toBeLessThan(1e-6);
  });

  it('filtro por nível conta só os componentes do nível', () => {
    let p = projetoBase();
    p = aplicarCopia(p, { type: 'upsertLevel', level: makeLevel({ id: 'n2', name: 'Nível 2', elevation: 3 }) });
    p = add(p, 'cTerreo');
    p = add(p, 'cAlto', { levelId: 'n2', x: 5 });
    const tudo = orcamentoDoProjeto(p);
    expect(tudo.moveis[0]!.quantidade).toBe(2);
    const soN2 = orcamentoDoProjeto(p, { nivel: 'n2' });
    expect(soN2.moveis).toHaveLength(1);
    expect(soN2.moveis[0]!.ids).toEqual(['cAlto']);
    expect(soN2.avisos).toEqual([]);
    const sem = orcamentoDoProjeto(p, { nivel: 'nao_existe' });
    expect(sem.moveis).toEqual([]);
    expect(sem.linhas).toEqual([]);
    expect(sem.avisos).toEqual([]);
  });

  it('o custo total é a soma dos custos dos móveis (tolerância 1e-6)', () => {
    let p = projetoBase();
    for (let i = 1; i <= 3; i++) p = add(p, `c${i}`, { x: i });
    p = add(p, 'alto', { familyId: FAMILIA_ALTA.id, typeId: 'A100', x: 9 });
    const orc = orcamentoDoProjeto(p);
    const soma = orc.moveis.reduce((s, m) => s + m.custo, 0);
    expect(Math.abs(orc.custo.total - soma)).toBeLessThan(1e-6);
    expect(orc.custo.total).toBeGreaterThan(0);
    expect(Math.abs(orc.custo.chapas + orc.custo.fitas + orc.custo.ferragens - orc.custo.total)).toBeLessThan(1e-6);
  });

  it('ferragens somam por id e ordenam por nome', () => {
    let p = projetoBase();
    p = add(p, 'c1');
    p = add(p, 'c2');
    const orc = orcamentoDoProjeto(p);
    const unit = resolverComponente(p, comp(p, 'c1'));
    const dobradica = orc.ferragens.find((f) => f.id === 'dobradica');
    const unitDobradica = unit.ferragens.find((f) => f.id === 'dobradica')!;
    expect(dobradica).toBeDefined();
    expect(dobradica!.quantidade).toBe(2 * unitDobradica.quantidade);
    const nomes = orc.ferragens.map((f) => f.nome);
    expect([...nomes].sort((a, b) => a.localeCompare(b))).toEqual(nomes);
  });

  it('determinístico: duas leituras do mesmo projeto dão saída idêntica', () => {
    let p = projetoBase();
    p = add(p, 'z9', { typeId: 'A60' });
    p = add(p, 'a1');
    p = add(p, 'm5', { familyId: FAMILIA_ALTA.id, values: { L: 700 } });
    const primeiro = JSON.stringify(orcamentoDoProjeto(copiaPura(p)));
    const segundo = JSON.stringify(orcamentoDoProjeto(copiaPura(p)));
    expect(segundo).toBe(primeiro);
    expect(JSON.stringify(orcamentoDoProjeto(p))).toBe(primeiro);
  });

  it('CSV das linhas consolidadas tem o cabeçalho da lista de peças', () => {
    let p = projetoBase();
    p = add(p, 'c1');
    p = add(p, 'c2');
    const orc = orcamentoDoProjeto(p);
    const csv = listaPecasCsv(orc.linhas);
    const linhas = csv.split('\n');
    expect(linhas[0]).toBe('Qtd;Peça;Papel;Chapa;Material;Comprimento;Largura;Espessura;Veio;Fita C1;Fita C2;Fita L1;Fita L2;Furos;Rasgos;Recortes;Área');
    expect(linhas).toHaveLength(orc.linhas.length + 1);
  });
});
