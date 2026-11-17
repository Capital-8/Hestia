/**
 * Massa conceitual, frente massa-paredes-torcidas (M2): paredes inclinadas por passo sobre o kernel REAL (fatias em cotas arbitrárias por projeto
 * sintético). Torre torcida M3 (quadrado de lado 8, 30 m, giro de 90°, 11 níveis de 3 em 3 m): tilt e desvio medidos com 1 passo por andar e com a
 * tolerância padrão. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, makeMass, type Project, type SecaoMassa } from '../packages/model/src/index.ts';
import { ServicoMassa, derivarParedesInclinadasDaMassa } from '../packages/engine/src/index.ts';
import { projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
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

const projeto = (): { p: Project; ids: string[] } => {
  const p = projetoComMassas();
  return { p, ids: [...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => l.id) };
};

describe('massa M2: paredes inclinadas sobre o kernel real', () => {
  it.skipIf(!bytes)('M1 caixa (extrusão reta) em 3 níveis: 12 paredes verticais, um passo por nível, desvio 0', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm1', ids.slice(0, 3), {}, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.nInclinadas]).toEqual([12, 3, 0]);
    expect(r.desvioMax).toBeCloseTo(0, 9);
  });

  it.skipIf(!bytes)('M2 cilindro (extrusão curva) em 4 níveis: 128 paredes (32 por nível), nenhuma inclinada, desvio só da corda (< 5 cm)', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm2', ids.slice(0, 4), {}, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.nInclinadas]).toEqual([128, 4, 0]);
    expect(r.desvioMax).toBeGreaterThan(0.02);
    expect(r.desvioMax).toBeLessThan(0.05);
    expect(r.desvioAproximacao).toBeCloseTo(0, 9);
  });

  it.skipIf(!bytes)('M3 torre torcida, 1 passo por andar (10 níveis): 40 paredes, tilt 0,9522° e desvio 4·sen 9° = 0,6257 m', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm3', ids.slice(0, 10), { modo: 'porNivel' }, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.nInclinadas]).toEqual([40, 10, 40]);
    // Giro de 9° por andar, apótema 4: d = 4(1/cos9° − 1) = 0,04986 m em 3 m de altura: atan(0,01662) = 0,9522°.
    for (const t of r.porNivel[0]!.passos[0]!.cadeias[0]!.tilts) expect(t).toBeCloseTo(0.9522, 3);
    expect(r.desvioMax).toBeCloseTo(0.6257, 3);
  });

  it.skipIf(!bytes)('M3 com a tolerância padrão (5 cm): 16 passos por andar, 640 paredes e desvio 4·sen 0,5625° = 0,0393 m, sem aviso de limite', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm3', ids.slice(0, 10), {}, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.nInclinadas]).toEqual([640, 160, 640]);
    expect(r.desvioMax).toBeCloseTo(0.0393, 3);
    expect(r.avisos.limiteDePassos).toBe(0);
    // Os passos de um nível se emendam e o último termina no nível de cima.
    const n0 = r.porNivel[0]!;
    expect(n0.passos).toHaveLength(16);
    expect(n0.passos[0]!.altura).toBeCloseTo(0.1875, 9);
    expect(n0.passos[15]!.topoNivelId).toBe(ids[1]);
  });

  it.skipIf(!bytes)('M3 com tolerância de 2 cm: bate no limite de 16 passos por andar (160 avisos) e o desvio fica em 0,0393 m', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm3', ids.slice(0, 10), { desvioMax: 0.02 }, srv(), srv())!;
    expect([r.nParedes, r.nPassos]).toEqual([640, 160]);
    expect(r.avisos.limiteDePassos).toBe(160);
    expect(r.desvioMax).toBeCloseTo(0.0393, 3);
  });

  it.skipIf(!bytes)('M4 bulbo em 5 níveis: 480 paredes em 15 passos, todas inclinadas, desvio 6,5 cm; com 1 passo por andar 160 paredes e 26,6 cm', () => {
    const { p, ids } = projeto();
    const r = derivarParedesInclinadasDaMassa(p, 'm4', ids.slice(0, 5), {}, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.nInclinadas]).toEqual([480, 15, 480]);
    expect(r.desvioMax).toBeCloseTo(0.0647, 3);
    const um = derivarParedesInclinadasDaMassa(p, 'm4', ids.slice(0, 5), { modo: 'porNivel' }, srv(), srv())!;
    expect(um.nParedes).toBe(160);
    expect(um.desvioMax).toBeCloseTo(0.2665, 3);
  });

  it.skipIf(!bytes)('loft de quadrado (raio 4√2) para círculo (raio 4) em 6 m: 432 paredes, 26 passos e o aviso de limite em 4 passos', () => {
    const base = projetoComMassas();
    const s = new ProjectStore(base);
    const sec = (z: number, perfil: SecaoMassa['perfil']): SecaoMassa => ({ z, perfil, rotacao: 0, escala: 1, dx: 0, dy: 0 });
    s.exec({ type: 'addMass', mass: makeMass({ id: 'ml', levelId: base.levels.find((l) => l.elevation === 0)!.id, name: 'loft', secoes: [sec(0, { forma: 'poligono', lados: 4, raio: 4 * Math.SQRT2 }), sec(6, { forma: 'circulo', raio: 4 })] }) });
    const ids = [...s.project.levels].sort((a, b) => a.elevation - b.elevation).map((l) => l.id);
    const r = derivarParedesInclinadasDaMassa(s.project, 'ml', ids.slice(0, 2), {}, srv(), srv())!;
    expect([r.nParedes, r.nPassos, r.avisos.limiteDePassos]).toEqual([432, 26, 4]);
    expect(r.desvioMax).toBeCloseTo(0.0819, 3);
  });
});
