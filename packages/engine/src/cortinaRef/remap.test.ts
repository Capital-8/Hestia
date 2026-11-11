/**
 * Testes de intenção do remapeamento (ADR 0056 §4.4, regras 1 a 6), das linhas extras e travadas (§4.3) e das
 * sobrescritas de linha. Cada regra tem um caso com o resultado esperado escrito à mão.
 */
import { describe, expect, it } from 'vitest';
import { MONTANTES, PAINEIS } from './casos.ts';
import { resolverCortina } from './consulta.ts';
import { resolverGrade } from './grade.ts';
import { normalizarSobrescritas } from './normalizar.ts';
import { ESTADO, chaveDaCelula, remapearCelulas, celulaDoPonto } from './remap.ts';
import { AVISO_ORFA_CELULA, AVISO_POSICAO_FORA } from './avisos.ts';
import type { CellKey, CortinaEntrada, CurtainInstanceRef, GridAxisSpec, LineOverride } from './tipos.ts';

const MUL = { interiorVertical: 'mul_ret_50x100', interiorHorizontal: 'mul_ret_50x100', borderStart: 'mul_ret_50x100', borderEnd: 'mul_ret_50x100', borderBottom: 'mul_ret_50x100', borderTop: 'mul_ret_50x100', corner: null, joinPriority: 'vertical' as const };

function ent(L: number, H: number, u: GridAxisSpec, v: GridAxisSpec, instancia?: CurtainInstanceRef): CortinaEntrada {
  return {
    L, H,
    tipo: { depth: 0.1, u, v, mullions: MUL, defaultPanelTypeId: 'pnl_vidro_10' },
    montantes: MONTANTES, paineis: PAINEIS,
    ...(instancia ? { instancia } : {}),
  };
}

/** Chave da célula (i, j) gravada numa grade. */
function gravada(e: CortinaEntrada, i: number, j: number): CellKey {
  return chaveDaCelula(resolverGrade(e), i, j);
}

const F = (count: number): GridAxisSpec => ({ mode: 'fixedNumber', count });
const UM = F(1);

describe('remap: regra 1 (mesma topologia, vale o índice)', () => {
  it('a parede esticou e as células esticaram: a célula (1, 0) continua (1, 0), com o centro novo', () => {
    const k = gravada(ent(4, 3, F(4), F(3)), 1, 0);
    const g = resolverGrade(ent(8, 3, F(4), F(3)));
    const [r] = remapearCelulas([k], g);
    expect(r).toMatchObject({ estado: ESTADO.adotada, regra: 1, a: 1, b: 0 });
    expect(r?.s).toBeCloseTo(0.375, 9);
  });

  it('a regra 1 vale mesmo com o centro deslocado de até 0,5 (a grade mudou pouco)', () => {
    const k: CellKey = { i: 0, j: 0, s: 0.1, z: 0.5, nu: 2, nv: 2 };
    const g = resolverGrade(ent(4, 2, F(2), F(2)));
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.adotada, regra: 1, a: 0, b: 0 });
  });
});

describe('remap: regra 2 (topologia diferente, vale a posição)', () => {
  it('a grade ganhou linha: a posição 1,0 m cai na fronteira e vai à célula de menor índice', () => {
    const k = gravada(ent(4, 3, F(2), UM), 0, 0); // centro 1,0 m de 4 m: s = 0,25
    const g = resolverGrade(ent(4, 3, F(4), UM));
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.adotada, regra: 2, a: 0, b: 0 });
  });

  it('a grade perdeu linha: a célula da ponta vai para a célula que contém o ponto', () => {
    const k = gravada(ent(4, 3, F(4), UM), 3, 0); // centro 3,5 m: s = 0,875
    const g = resolverGrade(ent(4, 3, F(2), UM));
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.adotada, regra: 2, a: 1, b: 0 });
  });

  it('o eixo V também troca de topologia (altura)', () => {
    const k = gravada(ent(4, 3, UM, F(3)), 0, 2); // centro 2,5 m de 3 m: z = 0,8333
    const g = resolverGrade(ent(4, 3, UM, F(2)));
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.adotada, regra: 2, a: 0, b: 1 });
  });

  it('a parede encurtou com outra quantidade de células: a célula proporcional', () => {
    const k = gravada(ent(6, 3, F(4), UM), 3, 0); // centro 5,25 m de 6: s = 0,875
    const g = resolverGrade(ent(4, 3, F(3), UM)); // 4 m, três células de 1,333 m: ponto 3,5 m cai na terceira
    expect(remapearCelulas([k], g)[0]).toMatchObject({ regra: 2, a: 2, estado: ESTADO.adotada });
  });

  it('celulaDoPonto: exatamente sobre uma linha vale a célula de menor índice; fora da grade é null', () => {
    expect(celulaDoPonto([0, 1, 2, 3, 4], 2)).toBe(1);
    expect(celulaDoPonto([0, 1, 2, 3, 4], 0)).toBe(0);
    expect(celulaDoPonto([0, 1, 2, 3, 4], 4)).toBe(3);
    expect(celulaDoPonto([0, 1, 2, 3, 4], 4.5)).toBeNull();
  });

  it('a regra 1 só é trocada pela regra 2 se o centro se afastou mais de 0,5 (grade reordenada)', () => {
    const k: CellKey = { i: 0, j: 0, s: 0.9, z: 0.5, nu: 2, nv: 2 }; // centro gravado longe do centro novo (0,25)
    const g = resolverGrade(ent(4, 2, F(2), F(2)));
    expect(remapearCelulas([k], g)[0]).toMatchObject({ regra: 2, a: 1, b: 0, estado: ESTADO.adotada });
  });
});

describe('remap: regra 3 (fusão: vence a de menor distância)', () => {
  it('duas sobrescritas na mesma célula: a mais perto do ponto gravado vence, a outra é órfã por fusão', () => {
    const g = resolverGrade(ent(4, 2, F(2), F(1)));
    const perto: CellKey = { i: 0, j: 0, s: 0.3, z: 0.5, nu: 4, nv: 2 }; // ponto 1,2 m, centro 1,0 m: d = 0,2
    const longe: CellKey = { i: 0, j: 0, s: 0.1, z: 0.5, nu: 4, nv: 2 }; // ponto 0,4 m: d = 0,6
    const [a, b] = remapearCelulas([longe, perto], g);
    expect(b).toMatchObject({ estado: ESTADO.adotada, regra: 2, a: 0, b: 0 });
    expect(a).toMatchObject({ estado: ESTADO.fusao, a: 4294967295 });
  });

  it('empate de distância: vale a primeira na ordem de gravação', () => {
    const g = resolverGrade(ent(4, 2, F(2), F(1)));
    const x: CellKey = { i: 0, j: 0, s: 0.1, z: 0.5, nu: 4, nv: 2 };
    const y: CellKey = { i: 1, j: 0, s: 0.4, z: 0.5, nu: 4, nv: 2 }; // ponto 1,6 m: d = 0,6, o mesmo de x (0,4 m)
    const [rx, ry] = remapearCelulas([x, y], g);
    expect(rx?.estado).toBe(ESTADO.adotada);
    expect(ry?.estado).toBe(ESTADO.fusao);
  });
});

describe('remap: regra 4 (vizinhança) e 5 (órfã)', () => {
  // Uma chave cuja posição sai da grade (s > 1) só existe em dado inválido; a regra 4 existe para ela.
  it('ponto um pouco fora da grade adota a célula da ponta, se estiver livre', () => {
    const g = resolverGrade(ent(4, 1, F(4), UM));
    const k: CellKey = { i: 3, j: 0, s: 1.1, z: 0.5, nu: 2, nv: 1 }; // 4,4 m: 0,4 m fora, a até uma célula (1 m)
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.adotada, regra: 4, a: 3, b: 0 });
  });

  it('a célula vizinha já ocupada: a segunda fica órfã (ocupada)', () => {
    const g = resolverGrade(ent(4, 1, F(4), UM));
    const k1: CellKey = { i: 3, j: 0, s: 1.1, z: 0.5, nu: 2, nv: 1 };
    const k2: CellKey = { i: 3, j: 0, s: 1.2, z: 0.5, nu: 2, nv: 1 };
    const [r1, r2] = remapearCelulas([k1, k2], g);
    expect(r1?.estado).toBe(ESTADO.adotada);
    expect(r2?.estado).toBe(ESTADO.ocupada);
  });

  it('longe demais da grade (mais de uma célula): órfã fora', () => {
    const g = resolverGrade(ent(4, 1, F(4), UM));
    const k: CellKey = { i: 3, j: 0, s: 1.5, z: 0.5, nu: 2, nv: 1 };
    expect(remapearCelulas([k], g)[0]).toMatchObject({ estado: ESTADO.fora });
  });

  it('a órfã sai no aviso cortina-override-orfao e normalizarSobrescritas a descarta', () => {
    const k: CellKey = { i: 3, j: 0, s: 1.5, z: 0.5, nu: 2, nv: 1 };
    const e = ent(4, 1, F(4), UM, { cells: [{ key: k, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }] });
    const r = resolverCortina(e);
    expect(r.avisos.some((x) => x.codigo === AVISO_ORFA_CELULA)).toBe(true);
    expect(normalizarSobrescritas(e)).toEqual({});
  });
});

describe('remap: regra 6 (reescrita da chave) e espelho', () => {
  it('normalizarSobrescritas regrava índice e posição da chave adotada', () => {
    const k = gravada(ent(4, 3, F(2), UM), 1, 0); // centro 3,0 m: s = 0,75
    const e = ent(8, 3, F(4), UM, { cells: [{ key: k, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }] });
    const n = normalizarSobrescritas(e);
    // 0,75·8 = 6,0 m, na fronteira entre a célula 2 ([4,6]) e a 3 ([6,8]): menor índice, a 2; centro 5 m = 0,625
    expect(n.cells?.[0]?.key).toMatchObject({ i: 2, j: 0, nu: 4, nv: 1 });
    expect(n.cells?.[0]?.key.s).toBeCloseTo(0.625, 9);
  });

  it('espelho: chave espelhada (i → nu−1−i, s → 1−s) cai na célula espelhada, pela regra 1', () => {
    const k = gravada(ent(4, 3, F(4), UM), 0, 0); // s = 0,125
    const espelho: CellKey = { ...k, i: 3, s: 1 - k.s };
    expect(remapearCelulas([espelho], resolverGrade(ent(4, 3, F(4), UM)))[0]).toMatchObject({ regra: 1, a: 3, b: 0 });
  });
});

describe('linhas extras (addedLines) e travadas', () => {
  const extra = (pos: number, locked?: boolean) => ({ id: 'x1', axis: 'u' as const, pos, ...(locked !== undefined ? { locked } : {}), comprimentoGravado: 4 });

  it('linha extra sem trava acompanha a fração do eixo ao esticar a parede', () => {
    const g = resolverGrade(ent(8, 3, UM, UM, { addedLines: [extra(1.5)] }));
    expect(g.u.linhas).toEqual([3]);
    expect(g.u.origens[0]).toMatchObject({ origem: 'extra', id: 'x1', travada: false });
  });

  it('linha extra travada mantém a posição absoluta', () => {
    const g = resolverGrade(ent(8, 3, UM, UM, { addedLines: [extra(1.5, true)] }));
    expect(g.u.linhas).toEqual([1.5]);
    expect(g.u.origens[0]?.travada).toBe(true);
  });

  it('linha extra a menos de 1e-6 de uma gerada: vale a extra (a gerada some)', () => {
    const e = ent(4, 3, F(2), UM, { addedLines: [extra(2 + 1e-7)] });
    const g = resolverGrade(e);
    expect(g.u.linhas).toEqual([2 + 1e-7]);
    expect(g.u.origens[0]?.origem).toBe('extra');
  });

  it('linha extra fora do vão some com o aviso posicao-fora', () => {
    const r = resolverCortina(ent(4, 3, UM, UM, { addedLines: [extra(5)] }));
    expect(r.grade.u.linhas).toEqual([]);
    expect(r.avisos.some((x) => x.codigo === AVISO_POSICAO_FORA)).toBe(true);
  });
});

describe('sobrescrita de linha gerada (lineOverrides)', () => {
  it('posição nova e travada: a linha gerada fica no lugar gravado', () => {
    const lo: LineOverride = { line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, pos: 1.2, locked: true, comprimentoGravado: 4 };
    const g = resolverGrade(ent(8, 3, F(2), UM, { lineOverrides: [lo] }));
    expect(g.u.linhas).toEqual([1.2]);
  });

  it('linha de grade que mudou de topologia: a linha mais próxima da posição gravada', () => {
    const lo: LineOverride = { line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, mullionTypeId: null };
    const g = resolverGrade(ent(4, 3, F(4), UM, { lineOverrides: [lo] }));
    // a linha gerada mais próxima de 2,0 m é a de 2,0 m (índice 2); o montante dela foi removido
    expect(g.remap.linhas[0]).toMatchObject({ estado: ESTADO.adotada, regra: 2, a: 2, b: 0 });
    expect(g.u.origens[1]).toMatchObject({ origem: 'gerada', mullionTypeId: null });
  });

  it('a linha sobrescrita que some por fusão com uma extra fica órfã por fusão', () => {
    const lo: LineOverride = { line: { axis: 'u', index: 1, pos: 0.5, n: 2 }, pos: 2, comprimentoGravado: 4 };
    const e = ent(4, 3, F(2), UM, { lineOverrides: [lo], addedLines: [{ id: 'x', axis: 'u', pos: 2 }] });
    const g = resolverGrade(e);
    expect(g.remap.linhas[0]?.estado).toBe(ESTADO.fusao);
    expect(g.u.origens.map((o) => o.origem)).toEqual(['extra']);
  });
});
