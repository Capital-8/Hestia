import { describe, expect, it } from 'vitest';
import { CURTAIN_PRESET_ID, createEmptyProject, makeWall, type Element, type Project } from '@hestia/model';
import { buildCurtainSchedule, buildWallSchedule, entradaCortinaDoProjeto, somar } from './index.ts';
import { montarCenaCortina } from './kernelCortina.ts';

/** Projeto de partida com uma parede cortina (tipo de fábrica "fachada") e uma parede básica, no primeiro nível. */
function projetoComCortina(): Project {
  const p = createEmptyProject();
  const levelId = p.levels[0]!.id;
  const cortina = { ...makeWall({ id: 'w_ct', typeId: CURTAIN_PRESET_ID.fachada, levelId, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }), order: 1 } as Element;
  const basica = { ...makeWall({ id: 'w_bas', typeId: 'wt_alv14', levelId, a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }), order: 2 } as Element;
  p.elements[cortina.id] = cortina;
  p.elements[basica.id] = basica;
  return p;
}

describe('tabela de quantitativos da parede cortina (decisão 0056, §5.7)', () => {
  it('sem paredes cortina, a tabela fica pronta e vazia, sem chamar o kernel', () => {
    const p = createEmptyProject();
    const s = buildCurtainSchedule(p);
    expect(s.rows).toEqual([]);
    expect(s.pronto).toBe(true);
    expect(s.motivo).toBeNull();
  });

  it('kernel desligado: a linha existe com nome e nível, e os números são vazios (nunca zero)', () => {
    const s = buildCurtainSchedule(projetoComCortina());
    expect(s.pronto).toBe(false);
    expect(s.motivo).toBe('sem-kernel');
    expect(s.rows).toHaveLength(1);
    const [r] = s.rows;
    expect(r!.wallId).toBe('w_ct');
    expect(r!.typeName.length).toBeGreaterThan(0);
    expect(r!.levelName.length).toBeGreaterThan(0);
    expect(r!.pronto).toBe(false);
    for (const v of [r!.comprimento, r!.areaBruta, r!.vidroBruta, r!.metrosMontante, r!.quantidadePaineis, r!.custo]) expect(v).toBeNull();
  });

  it('somar ignora linhas sem números (não soma null como zero nem conta a linha)', () => {
    const t = somar([
      { wallId: 'a', pronto: false, comprimento: null, areaBruta: null } as never,
    ]);
    expect(t.count).toBe(0);
    expect(t.areaBruta).toBe(0);
  });

  it('a parede cortina sai da tabela de paredes de camadas (a camada-sombra não entra como parede)', () => {
    const s = buildWallSchedule(projetoComCortina(), 'pt');
    expect(s.rows.map((r) => r.wallId)).toEqual(['w_bas']);
  });
});

describe('entrada do kernel a partir do projeto (adaptador da fase 1)', () => {
  it('leva cada parede cortina, com o tipo, a grade e o nível, e o adaptador a monta sem erro', () => {
    const p = projetoComCortina();
    const e = entradaCortinaDoProjeto(p).entrada;
    expect(e.cortinas.map((c) => c.id)).toEqual(['w_ct']);
    expect(e.cortinas[0]!.levelNum).toBe(0);
    expect(e.cortinas[0]!.typeId).toBe(CURTAIN_PRESET_ID.fachada);
    expect(e.tipos).toHaveLength(1);
    expect(e.tipos[0]!.u).toMatchObject({ mode: 'fixedDistance', distance: 1.5, justify: 'start' });
    expect(e.tipos[0]!.v).toMatchObject({ mode: 'fixedDistance', distance: 3.6 });
    const cena = montarCenaCortina(e);
    expect(cena.cortinaDe.has('w_ct')).toBe(true);
    expect(cena.nLinhas.cortinas).toBe(1);
  });

  it('material nulo vira ID ausente; os demais ganham número estável', () => {
    const e = entradaCortinaDoProjeto(projetoComCortina()).entrada;
    const desconhecido = e.materialNum!('material_que_nao_existe');
    expect(desconhecido).toBeGreaterThan(0);
    expect(e.materialNum!('material_que_nao_existe')).toBe(desconhecido);
    expect(e.materialNum!(null)).toBe(0xffffffff);
    expect(e.materialNum!('mat_vidro')).toBeGreaterThan(0);
  });

  it('projeto sem cortina gera entrada vazia', () => {
    const e = entradaCortinaDoProjeto(createEmptyProject()).entrada;
    expect(e.cortinas).toEqual([]);
    expect(e.tipos).toEqual([]);
  });
});
