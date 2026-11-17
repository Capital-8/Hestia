import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeTerrain, makeTerrainRegion } from '@hestia/model';
import { adicionarFixtureTerreno, idRegiaoFixture, idTerrenoFixture, projetoTerreno } from './fixtureTerreno.ts';
import { ID_AUSENTE_TN, PASSO_ID_REGIAO, PASSO_ID_TERRENO, assinaturaDeTexto, diferencaTN, montarCenaTerreno, referenciaDaRegiao, verticesDoTerreno } from './kernelTerreno.ts';

const linhasDe = (d: ReturnType<typeof diferencaTN>, secao: string): number => d.find((x) => x.secao === secao)?.nUpsert ?? 0;

describe('montarCenaTerreno: seções 160 a 164 na ordem canônica de A.4', () => {
  it('T2: um terreno, quatro pontos soltos com id_num posicional e linha_num ausente', () => {
    const c = montarCenaTerreno(projetoTerreno('T2'));
    expect(c.nLinhas).toEqual({ terrenos: 1, terreno_linhas: 0, terreno_vertices: 4, terreno_regioes: 0, terreno_regiao_pontos: 0 });
    expect(c.secoes.terrenos).toEqual({ id_num: [1], nivel_num: [0], espessura_base: [3], intervalo: [0.5], mestra_cada: [5] });
    const t = c.secoes.terreno_vertices;
    expect(t['id_num']).toEqual([0, 1, 2, 3].map((k) => PASSO_ID_TERRENO + k));
    expect(t['linha_num']).toEqual([ID_AUSENTE_TN, ID_AUSENTE_TN, ID_AUSENTE_TN, ID_AUSENTE_TN]);
    expect(t['ordem']).toEqual([0, 1, 2, 3]);
    expect(t['z']).toEqual([10.25, 12.25, 12.25, 10.25]);
  });

  it('ordem canônica: pontos soltos, depois curvas, depois quebras, e a borda por último como linha tipo 2', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'a', levelId: 'lv_0', espessuraBase: 4, mestraCada: 3 }) });
    s.exec({
      type: 'editTerrainFontes',
      terrenoId: 'a',
      ops: [
        { op: 'setBorda', xy: [0, 0, 9, 0, 9, 9, 0, 9] },
        { op: 'addQuebra', xyz: [1, 1, 5, 2, 2, 6] },
        { op: 'addCurva', z: 7, xy: [3, 3, 4, 4, 5, 3], fechada: true },
        { op: 'addPonto', x: 8, y: 8, z: 1 },
      ],
    });
    const c = montarCenaTerreno(s.project);
    const v = c.secoes.terreno_vertices;
    const base = PASSO_ID_TERRENO;
    expect(v['id_num']).toEqual(Array.from({ length: 10 }, (_, k) => base + k));
    // ponto solto, 3 da curva, 2 da quebra, 4 da borda
    expect(v['x']).toEqual([8, 3, 4, 5, 1, 2, 0, 9, 9, 0]);
    expect(v['z']).toEqual([1, 7, 7, 7, 5, 6, 0, 0, 0, 0]);
    expect(v['linha_num']).toEqual([ID_AUSENTE_TN, base, base, base, base + 1, base + 1, base + 2, base + 2, base + 2, base + 2]);
    expect(c.secoes.terreno_linhas).toEqual({ id_num: [base, base + 1, base + 2], terreno_num: [1, 1, 1], tipo: [0, 1, 2], fechada: [1, 0, 1] });
    expect(c.secoes.terrenos).toMatchObject({ espessura_base: [4], mestra_cada: [3] });
    expect(verticesDoTerreno(s.project.elements['a'] as never)).toBe(10);
  });

  it('T5: a região leva ref_x, ref_y = média dos vértices do contorno e os pontos com id_num posicional', () => {
    const p = projetoTerreno('T5');
    const c = montarCenaTerreno(p);
    const r = c.secoes.terreno_regioes;
    expect(r['id_num']).toEqual([1]);
    expect(r['terreno_num']).toEqual([1]);
    expect(r['papel']).toEqual([1]);
    expect(r['cota']).toEqual([8]);
    expect([r['ref_x']![0], r['ref_y']![0]]).toEqual([10, 10]);
    expect(c.secoes.terreno_regiao_pontos['id_num']).toEqual([0, 1, 2, 3].map((k) => PASSO_ID_REGIAO + k));
    expect(c.regiaoDe.get(idRegiaoFixture('T5'))).toBe(1);
    expect(c.terrenoDe.get(idTerrenoFixture('T5'))).toBe(1);
    expect(referenciaDaRegiao({ contorno: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 3 }] })).toEqual({ x: 2, y: 1 });
  });

  it('terreno com nível inexistente e região sem terreno ficam de fora (ignorados)', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    const p = s.project;
    const quebrado = { ...p, elements: { ...p.elements, [idTerrenoFixture('T5')]: { ...p.elements[idTerrenoFixture('T5')]!, levelId: 'nao_existe' } } } as typeof p;
    const c = montarCenaTerreno(quebrado);
    expect(c.nLinhas.terrenos).toBe(0);
    expect(c.ignorados.sort()).toEqual([idRegiaoFixture('T5'), idTerrenoFixture('T5')].sort());
  });

  it('a numeração se mantém com a cena anterior e terreno novo ganha o próximo número', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T2');
    const a = montarCenaTerreno(s.project);
    adicionarFixtureTerreno(s, 'T1');
    const b = montarCenaTerreno(s.project, { anterior: a });
    expect(b.terrenoDe.get(idTerrenoFixture('T2'))).toBe(1);
    expect(b.terrenoDe.get(idTerrenoFixture('T1'))).toBe(2);
  });
});

describe('cache por assinatura e envio por diferença (A.8 item 4)', () => {
  const dois = (): ProjectStore => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T1');
    adicionarFixtureTerreno(s, 'T2');
    return s;
  };

  it('editar T1 não reenvia T2; mover um ponto reenvia só a linha dele na seção 162', () => {
    const s = dois();
    const a = montarCenaTerreno(s.project);
    s.exec({ type: 'editTerrainFontes', terrenoId: idTerrenoFixture('T1'), ops: [{ op: 'movePonto', i: 2, x: 21, y: 20, z: 10 }] });
    const b = montarCenaTerreno(s.project, { anterior: a });
    const d = diferencaTN(a, b);
    expect(d.map((x) => x.secao)).toEqual(['terreno_vertices']);
    expect(linhasDe(d, 'terreno_vertices')).toBe(1);
    expect(d[0]!.upsert['x']).toEqual([21]);
    expect(d[0]!.upsert['terreno_num']).toEqual([1]);
    expect(d[0]!.remover).toEqual([]);
    expect(b.assinaturas.get(idTerrenoFixture('T2'))).toEqual(a.assinaturas.get(idTerrenoFixture('T2')));
    expect(b.assinaturas.get(idTerrenoFixture('T1'))!.existente).not.toBe(a.assinaturas.get(idTerrenoFixture('T1'))!.existente);
  });

  it('mudar cor, nome, linhasRotulo, pontosCotados e mostrarExistente não muda assinatura nem envia linha nenhuma', () => {
    const s = dois();
    const a = montarCenaTerreno(s.project);
    const id = idTerrenoFixture('T1');
    s.exec({ type: 'updateTerrain', id, patch: { color: '#ff0000', name: 'Outro nome', mostrarExistente: true } });
    s.exec({ type: 'editTerrainFontes', terrenoId: id, ops: [{ op: 'setLinhasRotulo', v: [0, 0, 5, 5] }, { op: 'setPontosCotados', v: [3, 3] }] });
    const b = montarCenaTerreno(s.project, { anterior: a });
    expect(b.assinaturas.get(id)).toEqual(a.assinaturas.get(id));
    expect(diferencaTN(a, b)).toEqual([]);
  });

  it('mudar o intervalo das curvas muda a assinatura (vai na seção 160); a região só muda a assinatura da proposta', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    const id = idTerrenoFixture('T5');
    const a = montarCenaTerreno(s.project);
    s.exec({ type: 'updateTerrainRegion', id: idRegiaoFixture('T5'), patch: { cota: 7 } });
    const b = montarCenaTerreno(s.project, { anterior: a });
    expect(b.assinaturas.get(id)!.existente).toBe(a.assinaturas.get(id)!.existente);
    expect(b.assinaturas.get(id)!.proposta).not.toBe(a.assinaturas.get(id)!.proposta);
    expect(diferencaTN(a, b).map((x) => [x.secao, x.nUpsert])).toEqual([['terreno_regioes', 1]]);
    s.exec({ type: 'updateTerrain', id, patch: { intervaloCurvas: 2 } });
    const c = montarCenaTerreno(s.project, { anterior: b });
    expect(c.assinaturas.get(id)!.existente).not.toBe(b.assinaturas.get(id)!.existente);
    expect(diferencaTN(b, c).map((x) => x.secao)).toEqual(['terrenos']);
  });

  it('apagar um terreno remove as linhas dele e das suas regiões, e nada mais', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    adicionarFixtureTerreno(s, 'T1');
    const a = montarCenaTerreno(s.project);
    s.exec({ type: 'deleteElements', ids: [idTerrenoFixture('T5')] });
    const d = diferencaTN(a, montarCenaTerreno(s.project, { anterior: a }));
    expect(d.every((x) => x.nUpsert === 0)).toBe(true);
    expect(d.map((x) => [x.secao, x.remover.length])).toEqual([
      ['terrenos', 1],
      ['terreno_vertices', 4],
      ['terreno_regioes', 1],
      ['terreno_regiao_pontos', 4],
    ]);
  });

  it('sem cena anterior tudo é novo', () => {
    const d = diferencaTN(null, montarCenaTerreno(projetoTerreno('T5')));
    expect(d.map((x) => [x.secao, x.nUpsert])).toEqual([
      ['terrenos', 1],
      ['terreno_vertices', 4],
      ['terreno_regioes', 1],
      ['terreno_regiao_pontos', 4],
    ]);
  });

  it('assinaturaDeTexto é estável e distingue textos', () => {
    expect(assinaturaDeTexto('abc')).toBe(assinaturaDeTexto('abc'));
    expect(assinaturaDeTexto('abc')).not.toBe(assinaturaDeTexto('abd'));
  });
});

describe('regiões do projeto', () => {
  it('região com terrenoId inexistente é recusada pelo modelo (nunca chega ao kernel)', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'r', levelId: 'lv_0', terrenoId: 'nada', contorno: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }) })).toThrow();
  });
});
