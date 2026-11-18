/**
 * Terreno, ficha E1 (PLANO do terreno A.5 e A.10): o adaptador e o serviço do motor (`kernelTerreno*.ts`, `terreno*.ts`) sobre o Rust REAL, com T1 a T9
 * pelas fixtures de `fixtureTerreno.ts` e por todas as funções do serviço. O serviço só serializa o `Project` e decodifica as saídas: nenhuma geometria
 * é calculada em TS (o teste soma áreas de triângulos e perímetros só para MEDIR o que o kernel devolveu).
 * Roda só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ProjectStore, createEmptyProject, type Project } from '@hestia/model';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { NOMES_FIXTURE_TERRENO, adicionarFixtureTerreno, idRegiaoFixture, idTerrenoFixture, projetoTerreno, projetoTerrenos, type NomeFixtureTerreno } from '../packages/engine/src/fixtureTerreno.ts';
import { ServicoTerreno } from '../packages/engine/src/kernelTerrenoServico.ts';
import type { MalhaTerreno } from '../packages/engine/src/terrenoVista.ts';

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

const servico = (): ServicoTerreno => new ServicoTerreno(() => ger);
const perto = (a: number, b: number, tol: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const alvo = { x: 10, y: 10 };

/** Área 3D somada dos triângulos de um papel da malha (só mede o que o kernel devolveu). */
function areaDaMalha(m: MalhaTerreno, papel: 'superficie' | 'saia' | 'base'): number {
  let s = 0;
  for (const parte of m.partes.filter((x) => x.papel === papel)) {
    const p = parte.positions;
    for (let i = 0; i < parte.indices.length; i += 3) {
      const [a, b, c] = [parte.indices[i]!, parte.indices[i + 1]!, parte.indices[i + 2]!].map((k) => [p[3 * k]!, p[3 * k + 1]!, p[3 * k + 2]!]) as [number[], number[], number[]];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      s += 0.5 * Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!);
    }
  }
  return s;
}

const perimetro = (pts: Array<{ x: number; y: number }>, fechada: boolean): number => {
  let s = 0;
  for (let k = 0; k < (fechada ? pts.length : pts.length - 1); k++) s += Math.hypot(pts[(k + 1) % pts.length]!.x - pts[k]!.x, pts[(k + 1) % pts.length]!.y - pts[k]!.y);
  return s;
};

const areaAssinada = (pts: Array<{ x: number; y: number }>): number => pts.reduce((s, a, k) => s + (a.x * pts[(k + 1) % pts.length]!.y - pts[(k + 1) % pts.length]!.x * a.y) / 2, 0);

function todasAsFuncoes(srv: ServicoTerreno, p: Project) {
  return {
    malhaE: srv.malha(p, 0),
    malhaP: srv.malha(p, 1),
    curvas: srv.curvas(p, 1),
    curvasE: srv.curvas(p, 0),
    planta: srv.planta(p, 1),
    corte: srv.corte(p, { x: 0, y: 10 }, { x: 1, y: 0 }, 0),
    q: srv.quantidades(p),
    qr: srv.quantidadesRegioes(p),
    mapa: srv.mapaCorteAterro(p),
    avisos: srv.avisos(p),
    cota: srv.cotaDoTerreno(p, [alvo]),
  };
}

describe('terreno, ficha E1: serviço sobre o WASM real, T1 a T9 por todas as funções', () => {
  it.skipIf(!bytes)('todas as funções respondem sem erro e sem NaN para T1 a T9 (um serviço só, projetos em sequência)', () => {
    const srv = servico();
    for (const nome of NOMES_FIXTURE_TERRENO) {
      const p = projetoTerreno(nome);
      const r = todasAsFuncoes(srv, p);
      for (const [k, v] of Object.entries(r)) expect(v, `${nome}.${k}`).not.toBeNull();
      expect(srv.falhou(p)).toBeNull();
      expect(JSON.stringify(r)).not.toContain('NaN');
      expect(r.q).toHaveLength(1);
      expect(r.q![0]!.terrenoId).toBe(idTerrenoFixture(nome));
      expect(r.malhaP).toHaveLength(1);
    }
    srv.encerrar();
  });

  it.skipIf(!bytes)('T1 plano: áreas 400 e cota 10, nenhuma curva de nível', () => {
    const srv = servico();
    const p = projetoTerreno('T1');
    const q = srv.quantidades(p)![0]!;
    perto(q.areaPlanta, 400, 1e-9);
    perto(q.areaSuperficieExistente, 400, 1e-9);
    perto(q.areaSuperficieProposta, 400, 1e-9);
    perto(q.zMin, 10, 1e-9);
    perto(q.zMax, 10, 1e-9);
    expect(q.volumeCorte).toBeLessThan(1e-9);
    expect(q.volumeAterro).toBeLessThan(1e-9);
    expect(srv.curvas(p)).toEqual([]);
    expect(srv.cotaDoTerreno(p, [{ x: 5, y: 5 }])![0]).toMatchObject({ terrenoId: idTerrenoFixture('T1'), declividade: 0 });
    perto(srv.cotaDoTerreno(p, [{ x: 5, y: 5 }])![0]!.z, 10, 1e-9);
    perto(areaDaMalha(srv.malha(p, 1)![0]!, 'superficie'), 400, 1e-9);
    // a saia e a base existem (espessura 3)
    expect(areaDaMalha(srv.malha(p, 1)![0]!, 'saia')).toBeGreaterThan(0);
    perto(areaDaMalha(srv.malha(p, 1)![0]!, 'base'), 400, 1e-9);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T2 rampa: área, cota em (10,10) = 11,25 com declividade 0,1, 4 curvas retas, perfil de 10,25 a 12,25', () => {
    const srv = servico();
    const p = projetoTerreno('T2');
    perto(srv.quantidades(p)![0]!.areaSuperficieProposta, 400 * Math.sqrt(1.01), 1e-6);
    perto(areaDaMalha(srv.malha(p, 0)![0]!, 'superficie'), 400 * Math.sqrt(1.01), 1e-6);
    const c = srv.cotaDoTerreno(p, [alvo])![0]!;
    perto(c.z, 11.25, 1e-9);
    perto(c.declividade, 0.1, 1e-9);
    const curvas = srv.curvas(p, 0)!;
    expect(curvas.map((x) => x.z)).toEqual([10.5, 11, 11.5, 12]);
    // mestra a cada 5 curvas (k mod 5 == 0, k = z / 0,5 = 21 a 24): nenhuma destas é mestra
    expect(curvas.map((x) => x.mestra)).toEqual([false, false, false, false]);
    curvas.forEach((x, k) => {
      for (const q of x.pontos) perto(q.x, [2.5, 7.5, 12.5, 17.5][k]!, 1e-9);
      perto(perimetro(x.pontos, x.fechada), 20, 1e-9);
      expect(x.fechada).toBe(false);
    });
    const corte = srv.corte(p, { x: 0, y: 10 }, { x: 1, y: 0 }, 0)!;
    const cortado = corte.find((x) => x.papel === 'cortado')!;
    expect(cortado.pontos[0]).toEqual({ s: 0, z: 10.25 });
    const topo = cortado.pontos.filter((q) => q.z > 7.5);
    for (const q of topo) perto(q.z, 10.25 + 0.1 * q.s, 1e-9);
    expect(topo.at(-1)).toEqual({ s: 20, z: 12.25 });
    expect(corte.some((x) => x.papel === 'perfilExistente')).toBe(false);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T3 pirâmide: 4 triângulos, área 447,2136, 4 curvas fechadas de perímetros 64, 48, 32 e 16', () => {
    const srv = servico();
    const p = projetoTerreno('T3');
    const m = srv.malha(p, 1)![0]!;
    expect(m.partes.filter((x) => x.papel === 'superficie').reduce((s, x) => s + x.indices.length / 3, 0)).toBe(4);
    perto(areaDaMalha(m, 'superficie'), 447.2136, 1e-5);
    perto(srv.quantidades(p)![0]!.areaSuperficieProposta, 447.2136, 1e-5);
    const curvas = srv.curvas(p)!;
    expect(curvas.map((x) => x.z)).toEqual([1, 2, 3, 4]);
    expect(curvas.every((x) => x.fechada)).toBe(true);
    curvas.forEach((x, k) => perto(perimetro(x.pontos, true), [64, 48, 32, 16][k]!, 1e-9));
    const silhueta = srv.corte(p, { x: -5, y: 10 }, { x: 1, y: 0 }, 100)!.filter((x) => x.papel === 'silhueta');
    expect(silhueta).toHaveLength(1);
    perto(Math.max(...silhueta[0]!.pontos.map((q) => q.z)), 5, 1e-9);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T4 vale: cota 0 em (10,10), 1 em (5,7), área 407,92156', () => {
    const srv = servico();
    const p = projetoTerreno('T4');
    const c = srv.cotaDoTerreno(p, [alvo, { x: 5, y: 7 }]);
    perto(c![0]!.z, 0, 1e-9);
    perto(c![1]!.z, 1, 1e-9);
    perto(srv.quantidades(p)![0]!.areaSuperficieProposta, 400 * Math.sqrt(1.04), 1e-5);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T5 plataforma: corte entre 200 e 200,6, aterro 0, cota proposta 8 no centro e 10 em (2,2); região traduzida para o id do projeto', () => {
    const srv = servico();
    const p = projetoTerreno('T5');
    const q = srv.quantidades(p)![0]!;
    expect(q.volumeCorte).toBeGreaterThanOrEqual(200);
    expect(q.volumeCorte).toBeLessThanOrEqual(200.6);
    expect(q.volumeAterro).toBeLessThan(1e-9);
    const c = srv.cotaDoTerreno(p, [alvo, { x: 2, y: 2 }], 1)!;
    perto(c[0]!.z, 8, 1e-9);
    perto(c[1]!.z, 10, 1e-9);
    perto(srv.cotaDoTerreno(p, [alvo], 0)![0]!.z, 10, 1e-9);
    const qr = srv.quantidadesRegioes(p)!;
    expect(qr.map((x) => [x.regiaoId, x.terrenoId])).toEqual([[idRegiaoFixture('T5'), idTerrenoFixture('T5')]]);
    perto(qr[0]!.areaPlanta, 100, 1e-9);
    perto(qr[0]!.volumeCorte, q.volumeCorte, 1e-9);
    const mapa = srv.mapaCorteAterro(p)!;
    expect(mapa.length).toBeGreaterThan(0);
    expect(mapa.every((x) => x.tipo === 'corte' && x.terrenoId === idTerrenoFixture('T5'))).toBe(true);
    const malha = srv.malha(p, 1)![0]!;
    expect(malha.partes.some((x) => x.regiaoId === idRegiaoFixture('T5') && x.papel === 'superficie')).toBe(true);
    // com plataforma o perfil existente é emitido junto do cortado
    expect(srv.corte(p, { x: -1, y: 10.123 }, { x: 1, y: 0 }, 0)!.map((x) => x.papel).filter((x) => x !== 'silhueta')).toEqual(['cortado', 'perfilExistente']);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T6 talude: corte 288,38 ± 2 % e cota 9 em (4,10)', () => {
    const srv = servico();
    const p = projetoTerreno('T6');
    perto(srv.quantidades(p)![0]!.volumeCorte, 288.38, 0.02 * 288.38);
    perto(srv.cotaDoTerreno(p, [{ x: 4, y: 10 }])![0]!.z, 9, 0.02);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T7 aterro: aterro entre 100 e 100,4 e corte 0', () => {
    const srv = servico();
    const q = srv.quantidades(projetoTerreno('T7'))![0]!;
    expect(q.volumeAterro).toBeGreaterThanOrEqual(100);
    expect(q.volumeAterro).toBeLessThanOrEqual(100.4);
    expect(q.volumeCorte).toBeLessThan(1e-6);
    const mapa = srv.mapaCorteAterro(projetoTerreno('T7'))!;
    expect(mapa.every((x) => x.tipo === 'aterro')).toBe(true);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T8 borda: área em planta 100, cota 5 no centro e borda fechada de área 100 na planta', () => {
    const srv = servico();
    const p = projetoTerreno('T8');
    perto(srv.quantidades(p)![0]!.areaPlanta, 100, 1e-9);
    perto(srv.cotaDoTerreno(p, [alvo])![0]!.z, 5, 1e-9);
    const borda = srv.planta(p, 0)!;
    expect(borda).toHaveLength(1);
    expect(borda[0]!.fechada).toBe(true);
    perto(areaAssinada(borda[0]!.pontos), 100, 1e-9);
    // fora da borda não há terreno
    expect(srv.cotaDoTerreno(p, [{ x: 2, y: 2 }])).toEqual([null]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T9 cruzadas: aviso 2 uma vez, também no painel; malha válida e cota 10 em (5,5)', () => {
    const srv = servico();
    const p = projetoTerreno('T9');
    const m = srv.avisos(p)!;
    expect(m.filter((x) => x.codigo === 2)).toHaveLength(1);
    expect(m.find((x) => x.codigo === 2)!.terrenoId).toBe(idTerrenoFixture('T9'));
    const painel = srv.avisosDoPainel(p, 'pt');
    expect(painel.filter((x) => x.code === 'terreno-linha-cruza')).toHaveLength(1);
    expect(painel[0]!.elementId).toBe(idTerrenoFixture('T9'));
    perto(areaDaMalha(srv.malha(p, 1)![0]!, 'superficie'), 400, 1e-9);
    perto(srv.cotaDoTerreno(p, [{ x: 5, y: 5 }])![0]!.z, 10, 1e-9);
    srv.encerrar();
  });

  it.skipIf(!bytes)('cotaDoTerreno em T2 confere com z = 10,25 + 0,1·x (1e-9) e fora do terreno devolve null', () => {
    const srv = servico();
    const p = projetoTerreno('T2');
    const pts = [0, 1.7, 5, 10, 13.3, 19.99, 20].map((x, k) => ({ x, y: (k * 3.1) % 20 }));
    const r = srv.cotaDoTerreno(p, pts)!;
    r.forEach((c, k) => {
      perto(c!.z, 10.25 + 0.1 * pts[k]!.x, 1e-9);
      perto(c!.declividade, 0.1, 1e-9);
    });
    expect(srv.cotaDoTerreno(p, [{ x: -1, y: 5 }, { x: 5, y: 21 }, { x: 500, y: 500 }, { x: 5, y: 5 }])!.map((c) => c === null)).toEqual([true, true, true, false]);
    expect(srv.cotaDoTerreno(p, [])).toEqual([]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('T1 a T9 juntos: cada terreno com os seus valores; sobrepostos respondem pelo de menor número', () => {
    const srv = servico();
    const p = projetoTerrenos();
    const q = srv.quantidades(p)!;
    expect(q.map((x) => x.terrenoId)).toEqual(NOMES_FIXTURE_TERRENO.map(idTerrenoFixture));
    perto(q[2]!.areaSuperficieProposta, 447.2136, 1e-5);
    perto(q[4]!.volumeCorte, 200.3, 0.3);
    expect(srv.cotaDoTerreno(p, [alvo])![0]!.terrenoId).toBe(idTerrenoFixture('T1'));
    srv.encerrar();
  });
});

describe('terreno, ficha E1: cache e envio por diferença sobre o WASM real', () => {
  const projetos = (): { s: ProjectStore; ids: string[] } => {
    const s = new ProjectStore(createEmptyProject());
    const nomes: NomeFixtureTerreno[] = ['T1', 'T2'];
    nomes.forEach((n) => adicionarFixtureTerreno(s, n));
    return { s, ids: nomes.map(idTerrenoFixture) };
  };

  it.skipIf(!bytes)('editar T1 não reenvia T2; mover um ponto envia só a linha mudada da seção 162', () => {
    const srv = servico();
    const { s, ids } = projetos();
    const antes = s.project;
    const quantAntes = srv.quantidades(antes)!;
    const upsert = vi.spyOn(CenaV2.prototype, 'upsert');
    const remover = vi.spyOn(CenaV2.prototype, 'remover');
    s.exec({ type: 'editTerrainFontes', terrenoId: ids[0]!, ops: [{ op: 'movePonto', i: 2, x: 20, y: 20, z: 14 }] });
    const q = srv.quantidades(s.project)!;
    expect(upsert.mock.calls.map((c) => [c[0], c[2]])).toEqual([['terreno_vertices', 1]]);
    expect(remover).not.toHaveBeenCalled();
    // T1 mudou (cota 14 num canto), T2 ficou idêntico
    expect(q[0]!.zMax).toBeCloseTo(14, 9);
    expect(q[1]).toEqual(quantAntes[1]);
    upsert.mockRestore();
    remover.mockRestore();
    srv.encerrar();
  });

  it.skipIf(!bytes)('mudar cor, nome, linhasRotulo e pontosCotados não reenvia nada nem refaz as consultas (mesmos objetos)', () => {
    const srv = servico();
    const { s, ids } = projetos();
    const antes = s.project;
    const curvas = srv.curvas(antes)!;
    const upsert = vi.spyOn(CenaV2.prototype, 'upsert');
    const definir = vi.spyOn(CenaV2.prototype, 'definirSecao');
    s.exec({ type: 'updateTerrain', id: ids[0]!, patch: { color: '#00ff00', name: 'Outro' } });
    s.exec({ type: 'editTerrainFontes', terrenoId: ids[0]!, ops: [{ op: 'setLinhasRotulo', v: [0, 0, 10, 10] }, { op: 'setPontosCotados', v: [5, 5] }] });
    expect(s.project).not.toBe(antes);
    expect(srv.curvas(s.project)).toBe(curvas);
    expect(upsert).not.toHaveBeenCalled();
    expect(definir).not.toHaveBeenCalled();
    upsert.mockRestore();
    definir.mockRestore();
    srv.encerrar();
  });

  it.skipIf(!bytes)('apagar T1 remove só as linhas dele; T2 segue respondendo', () => {
    const srv = servico();
    const { s, ids } = projetos();
    srv.quantidades(s.project);
    const remover = vi.spyOn(CenaV2.prototype, 'remover');
    s.exec({ type: 'deleteElements', ids: [ids[0]!] });
    const q = srv.quantidades(s.project)!;
    expect(q.map((x) => x.terrenoId)).toEqual([ids[1]]);
    expect(remover.mock.calls.map((c) => [c[0], (c[1] as number[]).length])).toEqual([['terrenos', 1], ['terreno_vertices', 4]]);
    remover.mockRestore();
    srv.encerrar();
  });
});
