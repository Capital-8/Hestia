/**
 * Parede cortina, fase 5 (decisão 0056, §7): do MODELO ao Rust REAL. A cortina de 6 m x 3 m do `projetoComCortina` (4 x 2 células de 1,5 m; montantes de 50 mm)
 * recebe, por comando do modelo, uma porta na célula (1, 0) no modo "preencher célula", com a fusão da célula de cima (a porta de 2,1 m não cabe nos 1,5 m).
 * Confere a soleira derivada, o vão, os grupos de folha e vidro da esquadria, a planta e o quantitativo com o vidro da porta fora do vidro de fachada. Roda só
 * em `npm run test:wasm`.
 *
 * Conta à mão: linhas U em 0, 1,5, 3, 4,5 e 6 (faces dos montantes da célula em 1,525 e 2,975); o vão tem 4 mm de folga de cada lado: 1,529 a 2,971
 * (1,442 m), de z = 0 (a soleira some) à face do montante de cima (3 - 0,05 = 2,95). Painéis de fachada: 8 - 2 (a região fundida) = 6. Montantes: 10
 * verticais e 12 - 2 (a base e a linha de cima sob a região) = 10 horizontais.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { PAPEL_MALHA_CORTINA, PAPEL_PLANTA_CORTINA, PAPEL_QUANT_CORTINA, ServicoCortina } from '../packages/engine/src/index.ts';
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
});

function projetoComPorta() {
  const s = new ProjectStore(projetoComCortina());
  const porta = Object.values(s.project.openingTypes).find((t) => t.kind === 'door')!;
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: porta.id, flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
  return s;
}

describe('parede cortina, fase 5: esquadria na célula no Rust real', () => {
  it.skipIf(!bytes)('a porta substitui o painel, a soleira some, e folha e vidro da esquadria saem em grupos à parte', () => {
    const srv = new ServicoCortina(() => ger);
    const s = projetoComPorta();
    const m = srv.malha(s.project)!;
    const porPapel = (papel: number) => m.instancias.filter((g) => g.papel === papel).reduce((t, g) => t + g.n, 0);
    expect(porPapel(PAPEL_MALHA_CORTINA.vidro)).toBe(6);
    expect(porPapel(PAPEL_MALHA_CORTINA.montante)).toBe(10 + 10);
    const folha = m.grupos.filter((g) => g.papel === PAPEL_MALHA_CORTINA.esquadria);
    const vidro = m.grupos.filter((g) => g.papel === PAPEL_MALHA_CORTINA.vidroEsquadria);
    expect(folha.length).toBeGreaterThan(0);
    expect(vidro.length).toBeGreaterThan(0);
    expect(folha.every((g) => !g.transparente)).toBe(true);
    expect(vidro.every((g) => g.transparente)).toBe(true);
    // Tudo da esquadria cabe no vão: x de 1,529 a 2,971 e z de 0 a 2,95 (a cortina vai de x = 0 a 6 em y = 0).
    for (const g of [...folha, ...vidro]) {
      for (let k = 0; k < g.vertices.length; k += 3) {
        expect(g.vertices[k]!).toBeGreaterThanOrEqual(1.529 - 1e-6);
        expect(g.vertices[k]!).toBeLessThanOrEqual(2.971 + 1e-6);
        expect(g.vertices[k + 2]!).toBeGreaterThanOrEqual(-1e-6);
        expect(g.vertices[k + 2]!).toBeLessThanOrEqual(2.95 + 1e-6);
      }
    }
    srv.encerrar();
  });

  it.skipIf(!bytes)('o quantitativo separa a esquadria do vidro de fachada', () => {
    const srv = new ServicoCortina(() => ger);
    const q = srv.quantidades(projetoComPorta().project)!;
    const soma = (papel: number, campo: 'area' | 'areaLiquida' | 'n' | 'volume') => q.filter((l) => l.papel === papel).reduce((t, l) => t + l[campo], 0);
    expect(soma(PAPEL_QUANT_CORTINA.painelVidro, 'n')).toBe(6);
    expect(soma(PAPEL_QUANT_CORTINA.esquadria, 'n')).toBe(1);
    expect(soma(PAPEL_QUANT_CORTINA.esquadria, 'area')).toBeCloseTo(1.442 * 2.95, 5);
    expect(soma(PAPEL_QUANT_CORTINA.esquadriaVidro, 'area')).toBeGreaterThan(0);
    expect(soma(PAPEL_QUANT_CORTINA.esquadriaVidro, 'area')).toBeLessThan(1.442 * 2.95);
    expect(soma(PAPEL_QUANT_CORTINA.esquadriaFolha, 'volume')).toBeGreaterThan(0);
    srv.encerrar();
  });

  it.skipIf(!bytes)('a planta ganha o contorno do vão (papel 4); sem a porta, nada disso e o montante da base volta', () => {
    const srv = new ServicoCortina(() => ger);
    const s = projetoComPorta();
    const com = srv.planta(s.project, null, 1.0, 1)!;
    expect(com.filter((l) => l.papel === PAPEL_PLANTA_CORTINA.esquadria).length).toBeGreaterThan(0);
    // Removida a esquadria (a fusão das células fica, como no comando do modelo): painel e soleira voltam; a região fundida vira 1 painel.
    s.exec({ type: 'removeCellOpening', wallId: 'ct1', i: 1, j: 0 });
    const sem = srv.planta(s.project, null, 1.0, 1)!;
    expect(sem.filter((l) => l.papel === PAPEL_PLANTA_CORTINA.esquadria)).toHaveLength(0);
    const m = srv.malha(s.project)!;
    const porPapel = (papel: number) => m.instancias.filter((g) => g.papel === papel).reduce((t, g) => t + g.n, 0);
    expect(porPapel(PAPEL_MALHA_CORTINA.vidro)).toBe(7);
    expect(porPapel(PAPEL_MALHA_CORTINA.montante)).toBe(10 + 11);
    expect(m.grupos.filter((g) => g.papel >= PAPEL_MALHA_CORTINA.esquadria)).toHaveLength(0);
    srv.encerrar();
  });
});
