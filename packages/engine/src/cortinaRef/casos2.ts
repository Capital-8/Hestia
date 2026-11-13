/**
 * Casos canônicos da fase 2 (ADR 0056 §4.4, §5.2 e §6.1): remapeamento das sobrescritas (regras 1 a 6), linhas extras e
 * travadas, sobrescrita de linha, e região retangular × não retangular. `casos2.json` é gerado daqui
 * (`GERAR_CASOS2=1 npx vitest run packages/engine/src/cortinaRef/casos2.test.ts`). Cada caso guarda a ENTRADA, a
 * saída `esperado` da referência (formato de consulta, 1 µm) e, quando a instância tem sobrescritas, a instância
 * `normalizado` (regra 6: o que a próxima edição grava).
 */
import { MONTANTES, PAINEIS } from './casos.ts';
import { chaveDaCelula } from './remap.ts';
import { resolverGrade } from './grade.ts';
import { normalizarSobrescritas } from './normalizar.ts';
import type { CellKey, CellOverrideEntry, CortinaEntrada, CurtainInstanceRef, GridAxisSpec, LineOverride, SegmentRef } from './tipos.ts';

export interface CasoFase2 {
  nome: string;
  /** Regra do ADR que o caso exercita: "regra1" … "regra6", "linha", "regiao". */
  regra: string;
  entrada: CortinaEntrada;
  normalizado?: CurtainInstanceRef;
}

const MUL = { interiorVertical: 'mul_ret_50x100', interiorHorizontal: 'mul_ret_50x100', borderStart: 'mul_ret_50x100', borderEnd: 'mul_ret_50x100', borderBottom: 'mul_ret_50x100', borderTop: 'mul_ret_50x100', corner: null, joinPriority: 'vertical' as const };
const F = (count: number): GridAxisSpec => ({ mode: 'fixedNumber', count });
const M = (positions: number[]): GridAxisSpec => ({ mode: 'manual', positions });
const UM = F(1);

function ent(L: number, H: number, u: GridAxisSpec, v: GridAxisSpec, instancia?: CurtainInstanceRef): CortinaEntrada {
  return { L, H, tipo: { depth: 0.1, u, v, mullions: MUL, defaultPanelTypeId: 'pnl_vidro_10' }, montantes: MONTANTES, paineis: PAINEIS, ...(instancia ? { instancia } : {}) };
}

/** Chave de célula (i, j) gravada numa grade. */
function chave(e: CortinaEntrada, i: number, j: number): CellKey {
  return chaveDaCelula(resolverGrade(e), i, j);
}

const painel = (key: CellKey, panelTypeId = 'pnl_solido_alu_4'): CellOverrideEntry => ({ key, override: { kind: 'panel', panelTypeId } });

/** Segmento de uma linha gerada uniforme (n células): índice da linha, n, segmento k de nk, meio no centro. */
const segU = (index: number, n: number, k: number, nk: number): SegmentRef => ({ line: { axis: 'u', index, pos: index / n, n }, k, nk, mid: (k + 0.5) / nk });
const segV = (index: number, n: number, k: number, nk: number): SegmentRef => ({ line: { axis: 'v', index, pos: index / n, n }, k, nk, mid: (k + 0.5) / nk });

const lineOv = (axis: 'u' | 'v', index: number, n: number, extra: Partial<LineOverride> = {}): LineOverride => ({ line: { axis, index, pos: index / n, n }, ...extra });

export function gerarCasos2(): CasoFase2[] {
  const casos: CasoFase2[] = [];
  const add = (nome: string, regra: string, entrada: CortinaEntrada): void => {
    const c: CasoFase2 = { nome, regra, entrada };
    if (entrada.instancia && Object.keys(entrada.instancia).length > 0) c.normalizado = normalizarSobrescritas(entrada);
    casos.push(c);
  };

  // ── Regra 1: mesma topologia, vale o índice ──
  add('regra1 parede estica: a célula 1 continua a 1, com o centro novo', 'regra1',
    ent(8, 3, F(4), F(3), { cells: [painel(chave(ent(4, 3, F(4), F(3)), 1, 0))] }));
  add('regra1 altura cresce: a fileira 1 continua na fileira 1', 'regra1',
    ent(4, 6, F(2), F(3), { cells: [painel(chave(ent(4, 3, F(2), F(3)), 0, 1), 'pnl_vazio')] }));
  add('regra1 segmento removido acompanha a linha ao esticar a parede', 'regra1',
    ent(8, 3, F(2), F(2), { removedSegments: [segU(1, 2, 0, 2)] }));
  add('regra1 espelho: a chave espelhada (i → nu−1−i, s → 1−s) cai na célula espelhada', 'regra1', (() => {
    const k = chave(ent(4, 3, F(4), UM), 0, 0);
    return ent(4, 3, F(4), UM, { cells: [painel({ ...k, i: 3, s: 1 - k.s })] });
  })());
  add('regra1 grade manual com mesma quantidade de posições: índice e fração', 'regra1',
    ent(6, 3, M([1, 2, 3, 4, 5]), UM, { cells: [painel(chave(ent(6, 3, M([1, 2, 3, 4, 5]), UM), 2, 0))] }));

  // ── Regra 2: topologia diferente, vale a posição ──
  add('regra2 grade ganhou linha: ponto na fronteira vai à célula de menor índice', 'regra2',
    ent(4, 3, F(4), UM, { cells: [painel(chave(ent(4, 3, F(2), UM), 0, 0))] }));
  add('regra2 grade ganhou linha: célula do meio', 'regra2',
    ent(4, 3, F(3), UM, { cells: [painel(chave(ent(4, 3, F(2), UM), 1, 0))] }));
  add('regra2 grade perdeu linha: a ponta vai para a célula que contém o ponto', 'regra2',
    ent(4, 3, F(2), UM, { cells: [painel(chave(ent(4, 3, F(4), UM), 3, 0))] }));
  add('regra2 altura ganhou linha: a fileira vai pela posição vertical', 'regra2',
    ent(4, 3, UM, F(4), { cells: [painel(chave(ent(4, 3, UM, F(3)), 0, 2))] }));
  add('regra2 parede encurtou com outro número de células: a célula proporcional', 'regra2',
    ent(4, 3, F(3), UM, { cells: [painel(chave(ent(6, 3, F(4), UM), 3, 0))] }));
  add('regra2 grade manual nova: a célula cai na posição gravada', 'regra2',
    ent(4, 3, M([1.5, 3]), UM, { cells: [painel(chave(ent(4, 3, F(2), UM), 0, 0))] }));

  // ── Regra 3: fusão (duas sobrescritas na mesma célula) ──
  add('regra3 fusão: a sobrescrita mais perto do ponto gravado vence', 'regra3', ent(4, 2, F(2), UM, {
    cells: [
      { key: { i: 0, j: 0, s: 0.1, z: 0.5, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } },
      { key: { i: 0, j: 0, s: 0.3, z: 0.5, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
    ],
  }));
  add('regra3 fusão com empate: vale a primeira na ordem de gravação', 'regra3', ent(4, 2, F(2), UM, {
    cells: [
      { key: { i: 0, j: 0, s: 0.1, z: 0.5, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } },
      { key: { i: 1, j: 0, s: 0.4, z: 0.5, nu: 4, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
    ],
  }));
  add('regra3 fusão após perda de linha: duas células antigas numa só', 'regra3', ent(4, 2, F(2), UM, {
    cells: [painel(chave(ent(4, 2, F(4), UM), 0, 0)), painel(chave(ent(4, 2, F(4), UM), 1, 0), 'pnl_vazio')],
  }));

  // ── Regra 4: vizinhança (só para chave com posição fora da grade) ──
  add('regra4 vizinhança: ponta fora da grade adota a célula da ponta, se livre', 'regra4', ent(4, 1, F(4), UM, {
    cells: [{ key: { i: 3, j: 0, s: 1.1, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }],
  }));
  add('regra4 vizinhança ocupada: a segunda chave na mesma ponta fica órfã (ocupada)', 'regra4', ent(4, 1, F(4), UM, {
    cells: [
      { key: { i: 3, j: 0, s: 1.1, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
      { key: { i: 3, j: 0, s: 1.2, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } },
    ],
  }));
  add('regra4 longe demais da grade: órfã fora', 'regra4', ent(4, 1, F(4), UM, {
    cells: [{ key: { i: 3, j: 0, s: 1.5, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }],
  }));

  // ── Regra 5: órfã sai no aviso e a normalização descarta ──
  add('regra5 órfã isolada: aviso cortina-override-orfao e descarte na normalização', 'regra5', ent(4, 1, F(4), UM, {
    cells: [{ key: { i: 3, j: 0, s: 1.5, z: 0.5, nu: 2, nv: 1 }, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } }],
  }));
  add('regra5 mista: uma adotada e uma órfã; a normalização mantém só a adotada', 'regra5', ent(4, 3, F(2), F(2), {
    cells: [painel(chave(ent(4, 3, F(2), F(2)), 1, 1)), { key: { i: 0, j: 0, s: 5, z: 0.5, nu: 2, nv: 2 }, override: { kind: 'panel', panelTypeId: 'pnl_vazio' } }],
  }));

  // ── Regra 6: reescrita da chave e divisão ──
  add('regra6 reescrita: a chave adotada leva o índice e a posição novos', 'regra6', ent(8, 3, F(4), UM, {
    cells: [painel(chave(ent(4, 3, F(2), UM), 1, 0))],
  }));
  add('regra6 reescrita após espelho: chave passa a ser a do lado espelhado', 'regra6', (() => {
    const k = chave(ent(4, 3, F(4), UM), 0, 0);
    return ent(4, 3, F(4), UM, { cells: [painel({ ...k, i: 3, s: 1 - k.s })] });
  })());
  add('regra6 divisão: a parte B (2 m) com a chave do todo (8 m) cai pela posição', 'regra6', ent(4, 3, F(2), UM, {
    cells: [painel(chave(ent(8, 3, F(4), UM), 3, 0))],
  }));

  // ── Linhas extras (addedLines) e travadas ──
  add('linha extra acompanha a parede: fração do eixo, sem trava', 'linha', ent(8, 3, UM, UM, {
    addedLines: [{ id: 'x1', axis: 'u', pos: 1.5, comprimentoGravado: 4 }],
  }));
  add('linha extra travada: posição absoluta ao esticar a parede', 'linha', ent(8, 3, UM, UM, {
    addedLines: [{ id: 'x1', axis: 'u', pos: 1.5, locked: true, comprimentoGravado: 4 }],
  }));
  add('linha extra a 1e-6 de uma gerada: vale a extra (a gerada some)', 'linha', ent(4, 3, F(2), UM, {
    addedLines: [{ id: 'x1', axis: 'u', pos: 2 + 1e-7 }],
  }));
  add('linha extra com montante próprio (tubo redondo)', 'linha', ent(4, 3, F(2), UM, {
    addedLines: [{ id: 'x1', axis: 'u', pos: 1, mullionTypeId: 'mul_red_50' }],
  }));
  add('linha extra fora do vão: some com aviso posicao-fora', 'linha', ent(4, 3, UM, UM, {
    addedLines: [{ id: 'x1', axis: 'v', pos: 5 }],
  }));

  // ── Sobrescrita de linha gerada ──
  add('linha gerada movida e travada: fica no lugar gravado ao esticar', 'linha', ent(8, 3, F(2), UM, {
    lineOverrides: [lineOv('u', 1, 2, { pos: 1.2, locked: true, comprimentoGravado: 4 })],
  }));
  add('linha gerada sem montante (mullionTypeId null) e a outra com tipo próprio', 'linha', ent(4, 3, F(4), UM, {
    lineOverrides: [lineOv('u', 1, 4, { mullionTypeId: null }), lineOv('u', 3, 4, { mullionTypeId: 'mul_red_50' })],
  }));
  add('linha gerada com topologia diferente: linha mais próxima da posição gravada', 'linha', ent(4, 3, F(4), UM, {
    lineOverrides: [lineOv('u', 1, 2, { mullionTypeId: null })],
  }));
  add('linha gerada que sai do vão ao mudar o comprimento: some com aviso', 'linha', ent(3, 3, F(2), UM, {
    lineOverrides: [lineOv('u', 1, 2, { pos: 3.5, locked: true, comprimentoGravado: 4 })],
  }));

  // ── Região retangular e não retangular ──
  add('regiao retangular 1 × 2: um segmento interno funde duas células', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(1, 2, 0, 2)],
  }));
  add('regiao retangular 2 × 2 com três remoções: o interno que sobra não tem montante', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(1, 2, 0, 2), segU(1, 2, 1, 2), segV(1, 2, 0, 2)],
  }));
  add('regiao retangular 3 × 1 com duas remoções em linha', 'regiao', ent(6, 2, F(3), UM, {
    removedSegments: [segU(1, 3, 0, 1), segU(2, 3, 0, 1)],
  }));
  add('regiao não retangular em L: a segunda remoção é ignorada com aviso', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(1, 2, 0, 2), segV(1, 2, 0, 2)],
  }));
  add('regiao não retangular em T: a terceira remoção é ignorada com aviso', 'regiao', ent(6, 2, F(3), F(2), {
    removedSegments: [segU(1, 3, 0, 2), segU(2, 3, 0, 2), segV(1, 2, 1, 3)],
  }));
  add('remoção de segmento de borda: só tira o montante da borda', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(0, 2, 0, 2)],
  }));
  add('painel sobrescrito numa célula da região vale para a região inteira', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(1, 2, 0, 2)],
    cells: [painel(chave(ent(4, 2, F(2), F(2)), 1, 0))],
  }));
  add('duas sobrescritas de painel numa região: as duas adotadas, o painel é o da célula de menor (j, i)', 'regiao', ent(4, 2, F(2), F(2), {
    removedSegments: [segU(1, 2, 0, 2)],
    cells: [painel(chave(ent(4, 2, F(2), F(2)), 0, 0)), painel(chave(ent(4, 2, F(2), F(2)), 1, 0), 'pnl_vazio')],
  }));
  add('remoção sobre linha extra: o segmento é referido pelo id da linha', 'regiao', ent(4, 2, UM, UM, {
    addedLines: [{ id: 'x1', axis: 'u', pos: 2 }],
    removedSegments: [{ line: { added: 'x1' }, k: 0, nk: 1, mid: 0.5 }],
  }));

  return casos;
}
