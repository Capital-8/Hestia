/**
 * Instalação do cliente real do furo por contorno no carregador do kernel (docs/estudo-esquadrias/27): `iniciarDespachoKernel` (o
 * ponto que o app e o worker usam para baixar o wasm) instala o cliente com os mesmos bytes, sem quebrar o carregamento do kernel;
 * módulo sem as exportações deixa o furo retangular. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening, type Project } from '@hestia/model';
import { clienteFuroContorno, definirClienteFuroContorno, diagnosticoLocalDoDespacho, instalarClienteFuroReal, iniciarDespachoKernel, resolveLevel, rotaDoVao, openingGeometry, frameOfWall, clienteFuroContornoFalso } from '../packages/engine/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
const temExportacoes = ((): boolean => {
  if (!bytes) return false;
  try {
    return WebAssembly.Module.exports(new WebAssembly.Module(new Uint8Array(bytes))).some((e) => e.name === 'furo_retorno_vao');
  } catch {
    return false;
  }
})();

function projeto(): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', width: 0.9, height: 2.4, leaves: 0, closure: 'none', shape: { kind: 'round', width: 0.9, height: 2.4 } };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const o: Opening = { id: 'o_arco', kind: 'door', typeId: 'ot_arco', hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

afterAll(() => definirClienteFuroContorno(null));

describe('instalação do cliente real do furo', () => {
  it('módulo sem as exportações: nada é instalado e o furo continua retangular', async () => {
    definirClienteFuroContorno(null);
    const vazio = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]); // módulo wasm válido e vazio
    const r = await instalarClienteFuroReal(vazio);
    expect(r.instalado).toBe(false);
    expect(r.motivo).toMatch(/furo_prisma_furar/);
    expect(clienteFuroContorno()).toBeNull();
    const p = projeto();
    const g = openingGeometry(p, p.elements.o_arco as Opening, frameOfWall(p, 'w1')!);
    expect(rotaDoVao(g)).toEqual({ via: 'retangular', motivo: 'sem-cliente' });
    expect(resolveLevel(p, 'lv_0').walls.w1!.furosContorno).toBeUndefined();
  });

  it('bytes que não são wasm: não lança, devolve o motivo e não instala', async () => {
    const r = await instalarClienteFuroReal(new Uint8Array([1, 2, 3]));
    expect(r.instalado).toBe(false);
    expect(r.motivo).toBeTruthy();
    expect(clienteFuroContorno()).toBeNull();
  });

  it('não pisa num cliente já instalado', async () => {
    const outro = clienteFuroContornoFalso();
    definirClienteFuroContorno(outro);
    const r = await instalarClienteFuroReal(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
    expect(r.instalado).toBe(false);
    expect(clienteFuroContorno()).toBe(outro);
    definirClienteFuroContorno(null);
  });

  it.skipIf(!temExportacoes)('iniciarDespachoKernel (carregador do app) carrega o kernel e instala o cliente real, sem quebrar o carregamento', async () => {
    expect(clienteFuroContorno()).toBeNull();
    await iniciarDespachoKernel({ fatiaA: true, fatiaB: false, sombra: false }, async () => bytes as Uint8Array);
    const diag = diagnosticoLocalDoDespacho()!;
    expect(diag.pronto).toBe(true);
    expect(diag.indisponivel).toBeNull();
    const c = clienteFuroContorno();
    expect(c).not.toBeNull();
    expect(c!.furarPrisma).toBeTypeOf('function');
    expect(c!.retornoDoVao).toBeTypeOf('function');
    // e o nível com vão com forma resolve com o contorno (a rota deixou de ser 'sem-cliente')
    expect(resolveLevel(projeto(), 'lv_0').walls.w1!.furosContorno?.length).toBe(1);
  });
});
