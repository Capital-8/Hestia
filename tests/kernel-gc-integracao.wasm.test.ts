/**
 * Guarda-corpo, integração de ponta a ponta (decisão 0055, §21): uma escada em L com guarda-corpo dos dois lados, sobre o Rust REAL.
 * Confere a malha (3D), as linhas de planta e de corte, a seleção nas vistas, o isolar pela categoria, as quantidades (mesmas peças da malha),
 * os avisos e o IFC com IFCRAILING. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { projetoGuardaCorpo } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { CODIGOS_GEOMETRIA_GC, CODIGO_AVISO_GC, guardaCorpoAvisosDeGeometria } from '../packages/engine/src/guardaCorpoIssues.ts';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeLevel, makeStair, type GuardaCorpo, type Project, type StairLanding, type StairRun } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateLShape } from '../packages/engine/src/stairGenerators.ts';
import { guardaCorpoNoPonto, linhasVisiveisGC } from '../packages/engine/src/guardaCorpoVista.ts';
import { ServicoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { definirGerenciadorDoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { buildGuardaCorpoSolids } from '../packages/render/src/model3d/guardaCorpo3d.ts';
import { projectIfc } from '../apps/web/src/editor/ifcExport.ts';
import { categoryIdsOf } from '../apps/web/src/editor/viewVisibility.ts';
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

/** Escada em L (9 + 9 espelhos, patamar) com um guarda-corpo em cada lado (lance e patamar). */
function projetoEscadaL(): Project {
  const sk = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
  const comps = sk.map((x, k) => (x.kind === 'run' ? ({ id: `c${k}`, kind: 'run', ...x.run } as StairRun) : ({ id: `c${k}`, kind: 'landing', ...x.landing } as StairLanding)));
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 3.06 }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_top', components: comps }) });
  const lado = { lance: true, patamar: true };
  s.exec({
    type: 'addGuardaCorpo',
    guardaCorpo: makeGuardaCorpo({ id: 'gc_L', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }),
  });
  return s.project;
}

describe('guarda-corpo: integração de ponta a ponta (escada em L, dois lados)', () => {
  it.skipIf(!bytes)('malha, planta, corte, seleção, isolar, quantidades, avisos e IFC', () => {
    expect(ger).not.toBeNull();
    definirGerenciadorDoGuardaCorpo(() => ger);
    const p = projetoEscadaL();
    const srv = new ServicoGuardaCorpo(() => ger);

    // 3D: malha não vazia, com postes, balaústres, trilhos e corrimão.
    const malhas = srv.malhas(p)!;
    expect(malhas).toHaveLength(1);
    const partes = malhas[0]!.partes;
    const papeis = new Set(partes.map((x) => x.papel));
    for (const papel of ['poste', 'balaustre'] as const) expect(papeis.has(papel), papel).toBe(true);
    // Varredura de perfil (3b): o tipo traz trilho, corrimao ou travessa.
    expect(papeis.has('trilho') || papeis.has('corrimao') || papeis.has('travessa'), [...papeis].join(',')).toBe(true);
    expect(partes.every((x) => x.indices.length > 0 && x.indices.length % 3 === 0 && x.positions.length % 3 === 0)).toBe(true);
    const lotes = buildGuardaCorpoSolids(malhas);
    expect(lotes.length).toBeGreaterThan(0);
    expect(lotes.every((b) => b.category === 'railing' && b.ids.every((r) => r.id === 'gc_L'))).toBe(true);

    // Planta: eixo e contornos; a seleção acha o guarda-corpo sobre o eixo.
    const nivel = p.levels.find((l) => l.id === 'lv_0')!;
    const planta = srv.planta(p, 'lv_0', nivel.elevation + 1.2, 1)!;
    expect(planta.some((l) => l.papel === 255)).toBe(true);
    expect(planta.some((l) => l.papel < 255)).toBe(true);
    const eixo = planta.find((l) => l.papel === 255)!;
    const no = eixo.pontos[0]!;
    expect(guardaCorpoNoPonto(planta, new Set(), no, 0.05)).toBe('gc_L');

    // Corte: plano atravessando o 1º lance (perpendicular ao seu eixo).
    const corte = srv.corte(p, null, 1.0, -2, 0, 1, 6)!;
    expect(corte.linhas.length).toBeGreaterThan(0);
    expect(corte.linhas.every((l) => l.guardaId === 'gc_L')).toBe(true);

    // Isolar/ocultar pela categoria: tudo some das linhas e dos sólidos.
    const ocultos = new Set(categoryIdsOf(p, ['railing']));
    expect(ocultos.has('gc_L')).toBe(true);
    expect(linhasVisiveisGC(planta, ocultos)).toHaveLength(0);
    expect(guardaCorpoNoPonto(planta, ocultos, no, 0.05)).toBeNull();
    expect(buildGuardaCorpoSolids(malhas, (id) => !ocultos.has(id))).toHaveLength(0);

    // Quantidades: contam as mesmas peças da malha (fonte única).
    const q = srv.quantidades(p)!;
    expect(q).toHaveLength(1);
    const pecas = (papel: string): number => partes.filter((x) => x.papel === papel).reduce((s, x) => s + x.pecas, 0);
    expect(q[0]!.postes).toBe(pecas('poste'));
    expect(q[0]!.balaustres).toBe(pecas('balaustre'));
    expect(q[0]!.comprimentoDesenvolvido).toBeGreaterThan(q[0]!.comprimentoEixo - 1e-9);

    // Avisos: formato válido (pode ou não haver).
    const avisos = srv.avisos(p)!;
    expect(Array.isArray(avisos)).toBe(true);

    // IFC: IFCRAILING pai e partes agregadas.
    const ifc = projectIfc(p, new Date('2026-01-01T00:00:00Z'), 'pt');
    expect(ifc).toContain('IFCRAILING(');
    expect(ifc).toContain('IFCRELAGGREGATES(');
    srv.encerrar();
  });

  it.skipIf(!bytes)('sem guarda-corpo, nada é montado', () => {
    const srv = new ServicoGuardaCorpo(() => ger);
    const p = createEmptyProject();
    expect(ServicoGuardaCorpo.temGuardaCorpo(p)).toBe(false);
    expect(srv.malhas(p)).toEqual([]);
    srv.encerrar();
  });
});

describe('guarda-corpo: kernel que carrega depois da primeira montagem', () => {
  it.skipIf(!bytes)('o serviço refaz o cálculo quando o kernel fica pronto (sem esperar a cena mudar)', () => {
    let atual: GerenciadorKernelV2 | null = null;
    const srv = new ServicoGuardaCorpo(() => atual);
    const p = projetoEscadaL();
    expect(srv.malhas(p)).toBeNull();
    expect(srv.planta(p, 'lv_0', 1.2)).toBeNull();
    let avisos = 0;
    srv.aoMudarPronto(() => avisos++);
    atual = ger;
    srv.verificarPronto();
    expect(avisos).toBe(1);
    // Mesmo projeto (mesma identidade): agora há malha e linhas.
    expect(srv.malhas(p)![0]!.partes.length).toBeGreaterThan(0);
    expect(srv.planta(p, 'lv_0', 1.2)!.length).toBeGreaterThan(0);
  });
});

describe('guarda-corpo: avisos de geometria degenerada sobre o Rust real (ADR 0055, §23)', () => {
  it.skipIf(!bytes)('caminho manual degenerado vira aviso na lista do projeto, nunca silêncio', () => {
    const p = projetoGuardaCorpo().p;
    const q = structuredClone(p);
    const g = q.elements['gc_m'] as GuardaCorpo;
    if (g.hospedeiro.tipo !== 'manual') throw new Error('fixture');
    // Vértices repetidos e uma curva apertada (segmento de 1 cm entre dois cantos de 90 graus).
    g.hospedeiro.caminho = [{ x: 0, y: 8, dz: 0 }, { x: 0, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 8.01, dz: 0 }, { x: 0, y: 8.01, dz: 0 }];
    g.deslocamento = 0;
    const srv = new ServicoGuardaCorpo(() => ger);
    const medidas = srv.avisos(q)!;
    const codigos = medidas.filter((m) => m.guardaId === 'gc_m').map((m) => CODIGO_AVISO_GC[m.codigo]);
    expect(codigos).toContain('gc-caminho-repetido');
    expect(codigos).toContain('gc-perfil-auto-intersecta');
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      const lista = guardaCorpoAvisosDeGeometria(q, medidas, lang).filter((i) => i.elementId === 'gc_m');
      expect(lista.length, lang).toBeGreaterThanOrEqual(2);
      expect(lista.every((i) => i.message.length > 10 && !/\{\w+\}/.test(i.message))).toBe(true);
    }
    // O projeto sem degeneração continua sem avisos de geometria (os de norma, como altura do corrimão, também vão para a lista do projeto).
    expect(guardaCorpoAvisosDeGeometria(p, srv.avisos(p)).filter((i) => (CODIGOS_GEOMETRIA_GC as readonly string[]).includes(i.code))).toEqual([]);
    // Todo guarda-corpo (inclusive o degenerado) gera malha de peças válidas.
    expect(srv.malhas(q)!.every((m) => m.partes.every((x) => x.positions.length > 0 && x.indices.length % 3 === 0))).toBe(true);
    srv.encerrar();
  });
});
