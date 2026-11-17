import { describe, expect, it } from 'vitest';
import { frameOfWall, openingPreviewStrokes } from '@hestia/engine';
import { openingsOfWall, openingTypeById, type Opening, type Wall } from '@hestia/model';
import type { ToolEnv } from './types.ts';
import { drawWall, makeEnv, P, tool, walls } from './testEnv.ts';

type Ctx = ReturnType<typeof makeEnv>;

const wallOf = (ctx: Ctx, pred: (w: Wall) => boolean): Wall => walls(ctx.store).find(pred)!;
const hostOf = (ctx: Ctx): Wall => wallOf(ctx, (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 3.9);
const openings = (ctx: Ctx, wallId = hostOf(ctx).id): Opening[] => openingsOfWall(ctx.store.project, wallId);

function withSnapOff(ctx: Ctx): void {
  ctx.options.snap = { ...(ctx.options.snap ?? {}), enabled: false } as never;
}

function moveAndClick(ctx: Ctx, x: number, y: number): Opening {
  const t = tool('door', ctx.env);
  t.move!(P(x, y));
  t.click!(P(x, y));
  return openings(ctx)[0]!;
}

function makeWall(ctx: Ctx, a: [number, number], b: [number, number]): void {
  drawWall(ctx.env as ToolEnv, a, b);
}

describe('colocação da abertura: sentido pelo cursor (estilo Revit)', () => {
  it('acima do eixo abre para o lado do cursor; abaixo, para o oposto', () => {
    const acima = makeEnv();
    makeWall(acima, [0, 0], [4, 0]);
    expect(moveAndClick(acima, 2, 0.1).flipFacing).toBe(false);

    const abaixo = makeEnv();
    makeWall(abaixo, [0, 0], [4, 0]);
    expect(moveAndClick(abaixo, 2, -0.1).flipFacing).toBe(true);
  });

  it('openingToward away inverte o sentido calculado pelo cursor', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    ctx.options.openingToward = 'away';
    expect(moveAndClick(ctx, 2, 0.1).flipFacing).toBe(true);
  });

  it('openingFacingMode fixed ignora o cursor e usa openingFlipFacing', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    ctx.options.openingFacingMode = 'fixed';
    ctx.options.openingFlipFacing = false;
    expect(moveAndClick(ctx, 2, -0.1).flipFacing).toBe(false);
    ctx.options.openingFlipFacing = true;
    const outro = makeEnv();
    makeWall(outro, [0, 0], [4, 0]);
    outro.options.openingFacingMode = 'fixed';
    outro.options.openingFlipFacing = true;
    expect(moveAndClick(outro, 2, 0.1).flipFacing).toBe(true);
  });

  it('histerese de 3 px mantém o lado anterior perto do eixo e muda a 4 px', () => {
    const perto = makeEnv();
    makeWall(perto, [0, 0], [4, 0]);
    const t1 = tool('door', perto.env);
    t1.move!(P(2, 0.1));
    t1.move!(P(2, -0.01));
    t1.click!(P(2, -0.01));
    expect(openings(perto)[0]!.flipFacing).toBe(false);

    const longe = makeEnv();
    makeWall(longe, [0, 0], [4, 0]);
    const t2 = tool('door', longe.env);
    t2.move!(P(2, 0.1));
    t2.move!(P(2, -0.04));
    t2.click!(P(2, -0.04));
    expect(openings(longe)[0]!.flipFacing).toBe(true);
  });

  it('Tab inverte o sentido e Espaço inverte a dobradiça na abertura criada', () => {
    const tab = makeEnv();
    makeWall(tab, [0, 0], [4, 0]);
    const t = tool('door', tab.env);
    t.move!(P(2, 0.1));
    t.tab();
    t.click!(P(2, 0.1));
    expect(openings(tab)[0]!.flipFacing).toBe(true);

    const espaco = makeEnv();
    makeWall(espaco, [0, 0], [4, 0]);
    const s = tool('door', espaco.env);
    s.move!(P(2, 0.1));
    s.space?.();
    s.click!(P(2, 0.1));
    expect(openings(espaco)[0]!.flipHand).toBe(true);
    expect(openings(espaco)[0]!.flipFacing).toBe(false);
  });
});

describe('colocação da abertura: âncora', () => {
  it('hinge com dobradiça à esquerda põe o centro a +W/2 do cursor; latch, ao contrário', () => {
    const hinge = makeEnv();
    makeWall(hinge, [0, 0], [4, 0]);
    hinge.options.openingAnchor = 'hinge';
    expect(moveAndClick(hinge, 2, 0.1).offset).toBeCloseTo(2.4, 6);

    const latch = makeEnv();
    makeWall(latch, [0, 0], [4, 0]);
    latch.options.openingAnchor = 'latch';
    expect(moveAndClick(latch, 2, 0.1).offset).toBeCloseTo(1.6, 6);
  });
});

describe('colocação da abertura: capturas novas', () => {
  it('centro do trecho entre perpendiculares (parede de 5 m, trecho livre de 3 m)', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [5, 0]);
    makeWall(ctx, [2, -1], [2, 1]);
    makeWall(ctx, [5, -1], [5, 1]);
    const t = tool('door', ctx.env);
    t.move!(P(3.5, 0.1));
    t.click!(P(3.5, 0.1));
    expect(openings(ctx)[0]!.offset).toBeCloseTo(3.5, 6);
  });

  it('folga da quina deixa a borda a openingClear da face da perpendicular', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [5, 0]);
    makeWall(ctx, [2, -1], [2, 1]);
    const perp = wallOf(ctx, (w) => Math.abs(w.a.x - 2) < 1e-9 && Math.abs(w.b.x - 2) < 1e-9);
    const face = frameOfWall(ctx.store.project, perp.id)!.sHi;
    const t = tool('door', ctx.env);
    t.move!(P(2.6, 0.1));
    t.click!(P(2.6, 0.1));
    const o = openings(ctx)[0]!;
    expect(o.offset - 0.4 - (2 + face)).toBeCloseTo(0.1, 6);
  });
});

describe('colocação da abertura: prévia e cotas', () => {
  it('mostra o símbolo real e expõe duas cotas dinâmicas', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [4.5, 0]);
    makeWall(ctx, [0, -1], [0, 1]);
    makeWall(ctx, [4.5, -1], [4.5, 1]);
    const t = tool('door', ctx.env);
    t.move!(P(2.26, 0.05));
    const items = t.preview();
    const temp: Opening = {
      id: 'preview',
      kind: 'door',
      typeId: 'ot_p80',
      hostId: hostOf(ctx).id,
      offset: 2.26,
      flipHand: false,
      flipFacing: false,
      sillOverride: null,
      mark: '',
    };
    const symbolLines = openingPreviewStrokes(
      ctx.store.project,
      temp,
      frameOfWall(ctx.store.project, temp.hostId)!,
      ctx.store.project.settings.detail,
    ).reduce((n, s) => n + (s.closed ? s.pts.length : s.pts.length - 1), 0);
    // As cotas saem pelo sistema único (`tempDims`): a prévia tem só o símbolo, sem linhas nem rótulos de cota.
    expect(items.filter((i) => i.kind === 'line')).toHaveLength(symbolLines);
    expect(items.filter((i) => i.kind === 'label')).toEqual([]);
    expect(t.tempDims!()).toHaveLength(2);
  });

  it('prévia da porta de duas folhas com bandeira tem mais traços e mostra o batente em volta do vão', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [5, 0]);
    const simples = tool('door', ctx.env);
    simples.move!(P(2.5, 0.05));
    const linhasSimples = simples.preview().filter((i) => i.kind === 'line').length;

    ctx.options.doorTypeId = 'ot_pbalcao_band120';
    const composta = tool('door', ctx.env);
    composta.move!(P(2.5, 0.05));
    const linhas = composta.preview().filter((i) => i.kind === 'line');
    expect(linhas.length).toBeGreaterThan(linhasSimples);

    const largura = openingTypeById(ctx.store.project, 'ot_pbalcao_band120')!.width;
    const ombreiras = linhas.filter((l) => {
      if (l.kind !== 'line') return false;
      const dy = Math.abs(l.b.y - l.a.y);
      return dy > 0.1 && Math.abs(l.a.x - (2.5 - largura / 2)) < 0.02 && Math.abs(l.b.x - (2.5 - largura / 2)) < 0.02;
    });
    expect(ombreiras.length).toBeGreaterThan(0);
  });

  it('Espaço e Tab redesenham a prévia sem novo movimento do mouse', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [5, 0]);
    const t = tool('door', ctx.env);
    t.move!(P(2.5, 0.05));
    const inicial = JSON.stringify(t.preview());
    expect(t.preview().length).toBeGreaterThan(0);

    t.tab!();
    const aposTab = JSON.stringify(t.preview());
    expect(aposTab).not.toBe(inicial);
    expect(t.preview().length).toBeGreaterThan(0);

    t.space!();
    expect(JSON.stringify(t.preview())).not.toBe(aposTab);
    expect(t.preview().filter((i) => i.kind === 'line').length).toBeGreaterThan(0);
  });

  it('sem ponteiro, Espaço e Tab não quebram e não desenham nada', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [5, 0]);
    const t = tool('door', ctx.env);
    expect(() => {
      t.tab!();
      t.space!();
    }).not.toThrow();
    expect(t.preview()).toEqual([]);
  });

  it('tempDims: duas cotas de leitura da prévia, pelo provedor e com as referências da sessão', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [4.5, 0]);
    makeWall(ctx, [0, -1], [0, 1]);
    makeWall(ctx, [4.5, -1], [4.5, 1]);
    const t = tool('door', ctx.env);
    expect(t.tempDims!()).toEqual([]);
    t.move!(P(2.26, 0.05));
    const dims = t.tempDims!();
    expect(dims).toHaveLength(2);
    expect(dims.every((d) => d.edit === undefined && d.key.startsWith('opening:preview:'))).toBe(true);
    // A prévia não desenha mais cotas em itens: só o sistema único de cotas as mostra.
    expect(t.preview().filter((i) => i.kind === 'label')).toEqual([]);
    const eixo = t.tempDims!({ 'opening:wall': 'axis', 'opening:opening': 'center' });
    expect(eixo[0]!.value + eixo[1]!.value).toBeCloseTo(4.5, 6);
    expect(dims[0]!.value + dims[1]!.value).toBeLessThan(eixo[0]!.value + eixo[1]!.value);
    t.move!(P(2.26, 5));
    expect(t.tempDims!()).toEqual([]);
  });

  it('posição inválida (sobre outra abertura) fica vermelha e não insere ao clicar', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    const first = tool('door', ctx.env);
    first.click!(P(2, 0.1));
    expect(openings(ctx)).toHaveLength(1);

    const second = tool('door', ctx.env);
    second.move!(P(2, 0.1));
    const invalid = second.preview().some((i) => (i.kind === 'line' || i.kind === 'polygon') && i.tone === 'invalid');
    expect(invalid).toBe(true);
    second.click!(P(2, 0.1));
    expect(openings(ctx)).toHaveLength(1);
  });

  it('a posição digitada é exata e passa pelas validações', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    const t = tool('door', ctx.env);
    t.move!(P(2, 0.1));
    expect(t.type!('2.7')).toBe(true);
    expect(openings(ctx)[0]!.offset).toBeCloseTo(2.7, 6);
    expect(t.type!('2.75')).toBe(false);
    expect(openings(ctx)).toHaveLength(1);
  });

  it('a distância digitada respeita a unidade de comprimento do projeto', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    makeWall(ctx, [0, 0], [6, 0]);
    const t = tool('door', ctx.env);
    t.move!(P(3, 0.1));
    expect(t.type!('100')).toBe(true);
    expect(openings(ctx)[0]!.offset).toBeCloseTo(1, 6);
  });

  it('o sufixo explícito vale mesmo com o projeto em metros', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [6, 0]);
    const t = tool('door', ctx.env);
    t.move!(P(3, 0.1));
    expect(t.type!('150cm')).toBe(true);
    expect(openings(ctx)[0]!.offset).toBeCloseTo(1.5, 6);
  });
});

describe('colocação da abertura: etiquetar ao inserir', () => {
  const tagsOf = (ctx: Ctx) => ctx.store.project.levels.flatMap((l) => l.tags ?? []);

  it('inserir uma porta cria uma etiqueta própria (elemento selecionável) com a marca P01, sem ligar o flag antigo', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    const o = moveAndClick(ctx, 2, 0.1);
    const tags = tagsOf(ctx);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.hostId).toBe(o.id);
    expect(tags[0]!.familyId).toBe('tagfam_marca');
    expect((ctx.store.project.elements[o.id] as Opening).mark).toBe('P01');
    expect(ctx.store.project.settings.showOpeningTags).not.toBe(true);
  });

  it('a etiqueta nasce do lado oposto ao arco de abertura, fora da espessura da parede', () => {
    const ctx = makeEnv();
    makeWall(ctx, [0, 0], [4, 0]);
    const o = moveAndClick(ctx, 2, 0.1);
    const tag = tagsOf(ctx)[0]!;
    expect(tag.at.x).toBeCloseTo(o.offset, 3);
    expect(Math.abs(tag.at.y)).toBeGreaterThan(0.1);
  });

  it('a segunda e a terceira porta recebem P02 e P03 (continua a numeração)', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [10, 0]);
    const t = tool('door', ctx.env);
    for (const x of [2, 5, 8]) { t.move!(P(x, 0.05)); t.click!(P(x, 0.05)); }
    expect(openings(ctx).map((o) => o.mark).sort()).toEqual(['P01', 'P02', 'P03']);
  });

  it('autoMarks desligado não numera', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'setSettings', patch: { autoMarks: false } });
    makeWall(ctx, [0, 0], [4, 0]);
    expect(moveAndClick(ctx, 2, 0.1).mark).toBe('');
  });

  it('openingTagOnPlace desligado não cria etiqueta', () => {
    const ctx = makeEnv();
    ctx.options.openingTagOnPlace = false;
    makeWall(ctx, [0, 0], [4, 0]);
    moveAndClick(ctx, 2, 0.1);
    expect(tagsOf(ctx)).toHaveLength(0);
  });

  it('o primeiro Ctrl+Z remove a porta, a marca e a etiqueta no mesmo passo', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [4, 0]);
    const t = tool('door', ctx.env);
    t.move!(P(2, 0.05));
    t.click!(P(2, 0.05));
    expect(openings(ctx)).toHaveLength(1);
    expect(tagsOf(ctx)).toHaveLength(1);
    ctx.store.undo();
    expect(openings(ctx)).toHaveLength(0);
    expect(tagsOf(ctx)).toHaveLength(0);
  });

  it('cinco portas são cinco passos de desfazer: um Ctrl+Z volta a quatro', () => {
    const ctx = makeEnv();
    withSnapOff(ctx);
    makeWall(ctx, [0, 0], [10, 0]);
    const t = tool('door', ctx.env);
    for (const x of [1, 3, 5, 7, 9]) {
      t.move!(P(x, 0.05));
      t.click!(P(x, 0.05));
    }
    expect(openings(ctx)).toHaveLength(5);
    ctx.store.undo();
    expect(openings(ctx)).toHaveLength(4);
    expect(tagsOf(ctx)).toHaveLength(4);
    for (let i = 0; i < 4; i++) ctx.store.undo();
    expect(openings(ctx)).toHaveLength(0);
    expect(walls(ctx.store)).toHaveLength(1);
  });
});

describe('colocação da abertura: zona de captura da parede', () => {
  it('aceita o cursor a até 16 px da face e recusa além disso', () => {
    const dentro = makeEnv();
    makeWall(dentro, [0, 0], [4, 0]);
    const a = tool('door', dentro.env);
    a.move!(P(2, 0.25));
    expect(a.preview().some((i) => i.kind === 'highlight')).toBe(true);
    a.click!(P(2, 0.25));
    expect(openings(dentro)).toHaveLength(1);

    const fora = makeEnv();
    makeWall(fora, [0, 0], [4, 0]);
    const b = tool('door', fora.env);
    b.move!(P(2, 0.26));
    expect(b.preview()).toHaveLength(0);
  });
});
