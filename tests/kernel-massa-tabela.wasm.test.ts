/**
 * Massa conceitual, ficha U2 (docs/massa/PLANO.md, A.6 "Massas por pavimento" e A.10): a tabela `buildMassSchedule` sobre o kernel Rust REAL.
 * M3 (torre torcida) dá 64 m² em todo pavimento que atravessa; M1 dá volume 540; M5 (flor) soma as 12 cópias da pétala por pavimento e o bulbo
 * entra à parte; M1 em 4 cópias em volta do próprio centro gera o aviso 2, que marca as linhas. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEmptyProject, ProjectStore, type Mass, type Project } from '@hestia/model';
import { buildMassSchedule, ServicoMassa } from '../packages/engine/src/index.ts';
import { massaM1, massaM3, massaM5Bulbo, massaM5Petala, projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
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
});

const srv = (): ServicoMassa => new ServicoMassa(() => ger);

/** Projeto de referência (mesmos níveis de A.10) com só as massas dadas, na ordem dada. */
function projetoCom(massas: Mass[]): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const l of projetoComMassas().levels) s.exec({ type: 'upsertLevel', level: l });
  for (const m of massas) s.exec({ type: 'addMass', mass: m });
  return s.project;
}

describe('tabela "Massas por pavimento" pelo kernel Rust (ficha U2)', () => {
  it('M3 (torre torcida 30 m): 64 m² em todo pavimento entre 0 e 30 m (1e-6)', () => {
    const p = projetoCom([massaM3()]);
    const s = buildMassSchedule(p, srv());
    expect(s).not.toBeNull();
    const niveis = p.levels.filter((l) => l.elevation >= 0 && l.elevation <= 30);
    expect(s!.rows).toHaveLength(niveis.length);
    for (const r of s!.rows) expect(Math.abs(r.area - 64), r.levelName).toBeLessThan(1e-6);
    expect(s!.totals.altura).toBeCloseTo(30, 9);
  });

  it('M1 (caixa 10 × 6 × 9 m): o volume do rodapé é 540', () => {
    const s = buildMassSchedule(projetoCom([massaM1()]), srv());
    expect(s).not.toBeNull();
    expect(Math.abs(s!.totals.volume - 540)).toBeLessThan(1e-6);
  });

  it('M5 (flor de 12 pétalas): a linha da pétala soma as 12 cópias; o bulbo entra à parte', () => {
    const p = projetoCom([massaM5Bulbo(), massaM5Petala()]);
    const fonte = srv();
    const s = buildMassSchedule(p, fonte);
    expect(s).not.toBeNull();
    const bruto = fonte.fatias(p)!;
    const copias = bruto.filter((f) => f.massaId === 'm5p' && f.nivelId === 'lv_2');
    expect(copias).toHaveLength(12);
    const linha = s!.rows.find((r) => r.massaId === 'm5p' && r.levelId === 'lv_2')!;
    expect(linha.copias).toBe(12);
    expect(Math.abs(linha.area - copias.reduce((a, f) => a + f.area, 0))).toBeLessThan(1e-9);
    expect(Math.abs(linha.area - 12 * copias[0]!.area)).toBeLessThan(1e-6);
    const bulbo = s!.rows.find((r) => r.massaId === 'm5' && r.levelId === 'lv_2')!;
    expect(bulbo.copias).toBe(1);
    expect(Math.abs(bulbo.area - bruto.find((f) => f.massaId === 'm5' && f.nivelId === 'lv_2')!.area)).toBeLessThan(1e-9);
  });

  it('M1 em 4 cópias em volta do próprio centro: aviso 2 marca as linhas e a área soma as cópias (4 × 60)', () => {
    const girada: Mass = { ...massaM1(), arranjo: { n: 4, cx: 0, cy: 0, anguloTotal: 2 * Math.PI } };
    const s = buildMassSchedule(projetoCom([girada]), srv());
    expect(s).not.toBeNull();
    expect(s!.rows.length).toBeGreaterThan(0);
    for (const r of s!.rows) {
      expect(r.copias).toBe(4);
      expect(r.sobreposta, r.levelName).toBe(true);
      expect(Math.abs(r.area - 240)).toBeLessThan(1e-6);
    }
  });
});
