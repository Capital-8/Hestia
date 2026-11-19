/**
 * Terreno no IFC (ficha X1): a casa do template com um terreno (T5, plataforma) e `localizacao`. Com a malha da superfície proposta (simulada aqui no
 * formato de `servicoTerreno().malha`, como o kernel a devolve; o teste com o Rust real está em tests/kernel-terreno-x1.wasm.test.ts) sai um
 * `IFCGEOGRAPHICELEMENT` `TERRAIN` sob o `IFCSITE`, sem saia nem base, e o `RefElevation` do sítio é a `cotaZero`. Sem a malha (kernel não pronto) o
 * terreno fica de fora, com aviso, e o resto do arquivo é o mesmo. O arquivo reimporta sem erro.
 */
import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, type MalhaTerreno } from '@hestia/engine';
import { ProjectStore, buildTemplate } from '@hestia/model';
import { importIfc } from '@hestia/io';
import { ifcGeometryOf } from '../../apps/web/src/editor/ifcExport.ts';
import { terrenosOf } from '../../apps/web/src/editor/ifcExportTerreno.ts';
import { exportIfc } from '../../packages/io/src/ifc/ifcExport.ts';

const TS = '2026-10-29T00:00:00';
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;

function casaComTerreno() {
  const s = new ProjectStore(buildTemplate('house2'));
  adicionarFixtureTerreno(s, 'T5');
  s.exec({ type: 'setLocalizacao', localizacao: { origemE: 500000, origemN: 7000000, cotaZero: 812.4, norteVerdadeiro: 0 } });
  return s.project;
}

const malha = (): MalhaTerreno[] => [
  {
    terrenoId: 'tn_t5',
    partes: [
      { regiaoId: null, papel: 'superficie', positions: [0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10], indices: [0, 1, 2, 0, 2, 3] },
      { regiaoId: null, papel: 'saia', positions: [0, 0, 10, 0, 0, 7, 20, 0, 7], indices: [0, 1, 2] },
      { regiaoId: null, papel: 'base', positions: [0, 0, 7, 20, 0, 7, 20, 20, 7], indices: [0, 1, 2] },
    ],
  },
];

describe('IFC com terreno (fixture da casa)', () => {
  const p = casaComTerreno();
  const geo = { ...ifcGeometryOf(p), terrenos: terrenosOf(p, { malha: malha })! };
  const avisos: string[] = [];
  const texto = exportIfc(p, geo, { timestamp: TS, avisos });

  it('IFCGEOGRAPHICELEMENT TERRAIN com a malha da superfície, sem saia nem base, e nenhum aviso', () => {
    expect(avisos).toEqual([]);
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(1);
    const linha = texto.split('\n').find((l) => l.includes('=IFCGEOGRAPHICELEMENT('))!;
    expect(linha).toContain('.TERRAIN.');
    // Só a superfície: 4 vértices e 2 triângulos (a saia e a base somariam mais).
    const lista = texto.split('\n').filter((l) => l.includes('IFCCARTESIANPOINTLIST3D') && l.includes('(20.000000,20.000000,10.000000)'));
    expect(lista).toHaveLength(1);
    expect(lista[0]!.match(/\),\(/g)).toHaveLength(3);
    const faces = texto.split('\n').filter((l) => l.includes('IFCTRIANGULATEDFACESET') && l.includes('(1,2,3),(1,3,4)'));
    expect(faces).toHaveLength(1);
  });

  it('o terreno está contido no IFCSITE e o RefElevation é a cotaZero', () => {
    const idSite = /^#(\d+)=IFCSITE\(/m.exec(texto)![1]!;
    const idTerreno = /^#(\d+)=IFCGEOGRAPHICELEMENT\(/m.exec(texto)![1]!;
    const rel = texto.split('\n').find((l) => l.includes('IFCRELCONTAINEDINSPATIALSTRUCTURE') && l.includes(`#${idTerreno}`))!;
    expect(rel).toMatch(new RegExp(`#${idSite}\\);$`));
    expect(texto.split('\n').find((l) => l.includes('=IFCSITE('))).toMatch(/\.ELEMENT\.,\$,\$,812\.4\d*,\$,\$\);$/);
  });

  it('sem a malha do kernel: terreno fora, um aviso, e as paredes continuam', () => {
    const aviso: string[] = [];
    const sem = exportIfc(p, ifcGeometryOf(p), { timestamp: TS, avisos: aviso });
    expect(count(sem, 'IFCGEOGRAPHICELEMENT')).toBe(0);
    expect(aviso).toHaveLength(1);
    expect(count(sem, 'IFCWALL') + count(sem, 'IFCWALLSTANDARDCASE')).toBeGreaterThan(0);
    expect(count(sem, 'IFCSITE')).toBe(1);
  });

  it('o arquivo com terreno reimporta sem erro e sem inventar terreno', () => {
    const r = importIfc(texto);
    expect(Object.values(r.project.elements).some((e) => e.kind === 'terrain')).toBe(false);
  });

  it('é determinístico', () => {
    expect(exportIfc(p, geo, { timestamp: TS })).toBe(texto);
  });
});
