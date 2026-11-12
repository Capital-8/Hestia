/**
 * Parede cortina, fase 5: a esquadria da célula como `Opening` VIRTUAL (decisão 0056 §7.6) sobre o Rust REAL. A consulta 107 devolve o vão; o TS monta a abertura
 * em memória com o tipo e as inversões do override e a desenha com o modelo das esquadrias comuns. Roda só em `npm run test:wasm`.
 *
 * Conta à mão (cortina `ct1` de 6 m x 3 m em y = 0, 4 x 2 células de 1,5 m; montantes de 50 mm; porta na célula (1, 0) com a fusão da célula de cima):
 * faces dos montantes em 1,525 e 2,975, vão de 1,529 a 2,971 (largura 1,442, centro em 2,25) e de z = 0 (a soleira some) a 3 - 0,05 = 2,95.
 * Modo "grade": o vão é o nominal do tipo, centrado na célula (centro em 2,25, largura = `width` do tipo).
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, openingTypeById, view3dOf } from '@hestia/model';
import { FLAGS_ESQUADRIA, ServicoCortina, definirGerenciadorDaCortina, esquadriaDaCelula, esquadriasDaCortina, idEsquadriaCortina, lerIdEsquadriaCortina, modeloDaEsquadriaCortina } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
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
  definirGerenciadorDaCortina(() => ger);
});

afterAll(() => definirGerenciadorDaCortina(() => null));

function projeto(opcoes: { fit?: 'cell' | 'grid'; flipHand?: boolean; flipFacing?: boolean; fundir?: boolean; janela?: boolean; mark?: string } = {}) {
  const s = new ProjectStore(projetoComCortina());
  const tipo = Object.values(s.project.openingTypes).find((t) => t.kind === (opcoes.janela ? 'window' : 'door'))!;
  s.exec({
    type: 'setCellOpening',
    wallId: 'ct1',
    i: 1,
    j: 0,
    openingTypeId: tipo.id,
    flipHand: opcoes.flipHand ?? false,
    flipFacing: opcoes.flipFacing ?? false,
    mark: opcoes.mark ?? 'P1',
    fit: opcoes.fit ?? 'cell',
    fundir: opcoes.fundir ?? true,
  });
  return { s, tipo };
}

describe('parede cortina: consulta 107 e esquadria virtual no Rust real', () => {
  it.skipIf(!bytes)('o leitor da 107 devolve o vão conferido à mão, a soleira derivada e a região de mais de uma célula', () => {
    const srv = new ServicoCortina(() => ger);
    const { s, tipo } = projeto();
    const r = srv.portas(s.project)!;
    expect(r.portas).toHaveLength(1);
    const q = r.portas[0]!;
    expect(q.wallId).toBe('ct1');
    expect(q.openingTypeId).toBe(tipo.id);
    expect([q.i, q.j]).toEqual([1, 0]);
    expect(q.grade).toBe(false);
    expect(q.janela).toBe(false);
    expect(q.s0).toBeCloseTo(1.529, 6);
    expect(q.s1).toBeCloseTo(2.971, 6);
    expect(q.z0).toBeCloseTo(0, 6);
    expect(q.z1).toBeCloseTo(2.95, 6);
    expect(q.profundidade).toBeCloseTo(0.1, 6);
    expect(q.larguraLivre).toBeCloseTo(1.442, 6);
    // Soleira derivada (bit 0) e região de mais de uma célula (bit 4); montantes à esquerda, à direita e em cima, e sem montante na base (a soleira some).
    expect(q.flags & FLAGS_ESQUADRIA.soleiraDerivada).toBeTruthy();
    expect(q.flags & FLAGS_ESQUADRIA.regiaoMultipla).toBeTruthy();
    expect(q.lados).toEqual({ esquerda: true, direita: true, base: false, topo: true });
    expect(r.linhas).toHaveLength(0);
    srv.encerrar();
  });

  it.skipIf(!bytes)('sem esquadria, a 107 vem vazia', () => {
    const srv = new ServicoCortina(() => ger);
    const r = srv.portas(projetoComCortina())!;
    expect(r.portas).toHaveLength(0);
    expect(r.linhas).toHaveLength(0);
    srv.encerrar();
  });

  it.skipIf(!bytes)('modo preencher: a Opening virtual tem o tipo, a marca e as inversões do override, no vão do kernel', () => {
    const { s, tipo } = projeto({ flipHand: true, flipFacing: true, mark: 'P7' });
    const [e, ...resto] = esquadriasDaCortina(s.project);
    expect(resto).toHaveLength(0);
    expect(e!.id).toBe(idEsquadriaCortina('ct1', 1, 0));
    expect(lerIdEsquadriaCortina(e!.id)).toEqual({ wallId: 'ct1', i: 1, j: 0 });
    expect(e!.opening).toMatchObject({ kind: 'door', typeId: tipo.id, hostId: 'ct1', flipHand: true, flipFacing: true, mark: 'P7', sillOverride: null });
    expect(e!.opening.offset).toBeCloseTo(2.25, 6);
    expect(e!.geometria.width).toBeCloseTo(1.442, 6);
    expect(e!.geometria.height).toBeCloseTo(2.95, 6);
    expect(e!.geometria.sill).toBeCloseTo(0, 6);
    expect(e!.geometria.thickness).toBeCloseTo(0.1, 9);
    expect(e!.baseZ).toBeCloseTo(0, 9);
    // A parede cortina vai de x = 0 a 6 em y = 0: o centro do vão fica em x = 2,25, no plano central do sistema (sMid do quadro).
    expect(e!.geometria.center.x).toBeCloseTo(2.25, 6);
    expect(e!.geometria.center.y).toBeCloseTo(e!.quadro.sMid, 9);
    expect(e!.celula).toMatchObject({ i: 1, j: 0 });
    expect(esquadriaDaCelula(s.project, 'ct1', { i: 1, j: 1 })?.id).toBe(e!.id); // a célula fundida de cima é a mesma região
    expect(esquadriaDaCelula(s.project, 'ct1', { i: 0, j: 0 })).toBeUndefined();
    // O tipo é o do projeto, sem cópia.
    expect(openingTypeById(s.project, e!.opening.typeId)).toBeDefined();
  });

  it.skipIf(!bytes)('o modelo de peças é o das esquadrias comuns e cabe no vão (folha, batente e vidro dentro de largura e altura)', () => {
    const { s } = projeto();
    const e = esquadriasDaCortina(s.project)[0]!;
    const m = modeloDaEsquadriaCortina(s.project, e);
    expect(m.kind).toBe('door');
    expect(m.void).toBe(false);
    expect(m.width).toBeCloseTo(1.442, 6);
    expect(m.parts.length).toBeGreaterThan(0);
    expect(m.parts.some((p) => p.role === 'leaf')).toBe(true);
    for (const p of m.parts) {
      expect(p.box.t0).toBeGreaterThanOrEqual(-1.442 / 2 - 1e-6);
      expect(p.box.t1).toBeLessThanOrEqual(1.442 / 2 + 1e-6);
      expect(p.box.z0).toBeGreaterThanOrEqual(-1e-6);
      expect(p.box.z1).toBeLessThanOrEqual(2.95 + 1e-6);
    }
    expect(modeloDaEsquadriaCortina(s.project, e)).toBe(m); // memorizado
  });

  it.skipIf(!bytes)('modo grade: o vão é o nominal do tipo entre as linhas presas (menos as faces dos montantes e as folgas), centrado na célula', () => {
    const srv = new ServicoCortina(() => ger);
    const { s, tipo } = projeto({ fit: 'grid' });
    const nominal = openingTypeById(s.project, tipo.id)!;
    const r = srv.portas(s.project)!;
    expect(r.portas[0]!.grade).toBe(true);
    const e = esquadriasDaCortina(s.project)[0]!;
    // Linhas presas em 2,25 +- 0,35 (a porta de 0,70 centrada na célula de 1,5 m); o vão perde meia largura de montante (25 mm) e 4 mm de cada lado.
    expect(nominal.width).toBeCloseTo(0.7, 9);
    expect(e.porta.grade).toBe(true);
    expect(e.porta.s0).toBeCloseTo(1.9 + 0.025 + 0.004, 6);
    expect(e.porta.s1).toBeCloseTo(2.6 - 0.025 - 0.004, 6);
    expect(e.geometria.width).toBeCloseTo(0.642, 6);
    expect(e.geometria.height).toBeCloseTo(2.1 - 0.025, 6);
    expect(e.opening.offset).toBeCloseTo(2.25, 6);
    expect(e.geometria.center.x).toBeCloseTo(2.25, 6);
    // A célula do override é a da grade nova (2, 0): a chave gravada no projeto, não a do kernel antes do ajuste.
    expect(e.celula).toMatchObject({ i: 2, j: 0 });
    srv.encerrar();
  });

  it.skipIf(!bytes)('janela: o peitoril é a soleira do vão e a abertura é janela', () => {
    const { s } = projeto({ janela: true, fundir: false });
    const e = esquadriasDaCortina(s.project)[0];
    expect(e).toBeDefined();
    expect(e!.opening.kind).toBe('window');
    expect(e!.geometria.kind).toBe('window');
    expect(e!.geometria.sill).toBeCloseTo(e!.porta.z0, 9);
  });

  it.skipIf(!bytes)('as inversões mudam o lado da dobradiça e o sentido de abertura do modelo', () => {
    const base = projeto();
    const mao = projeto({ flipHand: true });
    const face = projeto({ flipFacing: true });
    const m0 = modeloDaEsquadriaCortina(base.s.project, esquadriasDaCortina(base.s.project)[0]!);
    const mM = modeloDaEsquadriaCortina(mao.s.project, esquadriasDaCortina(mao.s.project)[0]!);
    const mF = modeloDaEsquadriaCortina(face.s.project, esquadriasDaCortina(face.s.project)[0]!);
    expect(m0.openings[0]!.hingeT).toBeCloseTo(-mM.openings[0]!.hingeT, 9);
    expect(m0.openings[0]!.side).toBe(-mF.openings[0]!.side);
    expect(m0.openings[0]!.hingeT).toBeCloseTo(mF.openings[0]!.hingeT, 9);
  });

  it.skipIf(!bytes)('apagar a esquadria apaga a virtual; a vista com "abrir vãos" não muda o vão', () => {
    const { s } = projeto();
    expect(view3dOf(s.project).openOpenings).toBeFalsy();
    s.exec({ type: 'removeCellOpening', wallId: 'ct1', i: 1, j: 0 });
    expect(esquadriasDaCortina(s.project)).toHaveLength(0);
  });
});
