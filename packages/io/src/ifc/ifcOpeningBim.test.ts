import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningType, type Project } from '@hestia/model';
import { importIfc } from '../ifcImport/index.ts';
import { exportIfc } from './ifcExport.ts';
import type { IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';

/** Parede de 4 m com uma janela (`ot_ja120`, id `v`) e uma porta (`ot_p90`, id `d`), geometria mínima das caixas. */
function casa(janela: Partial<OpeningType> = {}, porta: Partial<OpeningType> = {}): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  store.exec({ type: 'addOpening', opening: { id: 'v', kind: 'window', typeId: 'ot_ja120', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: 'J-1' } satisfies Opening });
  store.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p90', hostId: 'w', offset: 0.9, flipHand: false, flipFacing: false, sillOverride: null, mark: 'P-1' } satisfies Opening });
  const p = store.project;
  return {
    ...p,
    openingTypes: {
      ...p.openingTypes,
      ot_ja120: { ...p.openingTypes.ot_ja120!, ...janela },
      ot_p90: { ...p.openingTypes.ot_p90!, ...porta },
    },
  };
}

/** Geometria das caixas da parede e dos dois vãos (mesma convenção dos testes de operação). */
function geometria(): IfcGeometry {
  const th = 0.184;
  return {
    walls: [{ wallId: 'w', footprints: [[[{ x: 0, y: -th / 2 }, { x: 4, y: -th / 2 }, { x: 4, y: th / 2 }, { x: 0, y: th / 2 }]]], baseZ: 0, height: 2.8 }],
    openings: [
      { openingId: 'v', center: { x: 2, y: 0 }, u: { x: 1, y: 0 }, width: 1.2, height: 1.2, roughWidth: 1.2, roughHeight: 1.2, roughBottomZ: 1.1, sillZ: 1.1, thickness: th },
      { openingId: 'd', center: { x: 0.9, y: 0 }, u: { x: 1, y: 0 }, width: 0.9, height: 2.1, roughWidth: 0.9, roughHeight: 2.1, roughBottomZ: 0, sillZ: 0, thickness: th },
    ],
    floors: [],
    slabs: [],
    roofs: [],
    stairs: [],
  };
}

const exportar = (p: Project): string => exportIfc(p, geometria(), { timestamp: TS });

/**
 * Tira a extensão privada do Hestia do texto (renomeia o pset): o importador cai na leitura IFC comum, como faria com
 * um arquivo de outro programa, e o fabricante e o fator solar têm de voltar pelos psets padrão.
 */
const semExtensaoHestia = (texto: string): string => texto.replaceAll('Pset_Hestia', 'Pset_Outra');

describe('fabricante e fator solar no IFC: exportação', () => {
  it('fabricante sai no IFCWINDOWTYPE e na porta, em Pset_ManufacturerTypeInformation', () => {
    const texto = exportar(casa({ manufacturer: 'Acme Esquadrias' }, { manufacturer: 'Portas SA' }));
    expect(texto).toContain("'Pset_ManufacturerTypeInformation'");
    expect(texto).toContain("IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Acme Esquadrias'),$)");
    expect(texto).toContain("IFCPROPERTYSINGLEVALUE('Manufacturer',$,IFCLABEL('Portas SA'),$)");
    // O conjunto é do tipo (HasPropertySets), então não há IFCRELDEFINESBYPROPERTIES para ele.
    const tipos = texto.split('\n').filter((l) => /=IFC(WINDOW|DOOR)TYPE\(/.test(l));
    expect(tipos).toHaveLength(2);
    for (const l of tipos) expect(l).toMatch(/,\(#\d+/);
  });

  it('fator solar sai em Pset_DoorWindowGlazingType da janela, com IfcNormalisedRatioMeasure, e não em Pset_WindowCommon', () => {
    const texto = exportar(casa({ solarFactor: 0.35 }));
    expect(texto).toContain("IFCPROPERTYSINGLEVALUE('SolarHeatGainTransmittance',$,IFCNORMALISEDRATIOMEASURE(0.350000),$)");
    expect(texto).toContain("'Pset_DoorWindowGlazingType'");
    const comum = texto.split('\n').filter((l) => l.includes("'Pset_WindowCommon'"));
    expect(comum.join('\n')).not.toContain('SolarHeatGainTransmittance');
  });

  it('porta não recebe fator solar, mesmo informado no tipo', () => {
    const texto = exportar(casa({}, { solarFactor: 0.5 }));
    expect(texto).not.toContain("'SolarHeatGainTransmittance'");
    expect(texto).not.toContain('IFCREAL(0.500000)');
  });

  it('valor vazio ou ilegível não gera propriedade', () => {
    const texto = exportar(casa({ manufacturer: '   ', solarFactor: Number.NaN }, { manufacturer: '' }));
    expect(texto).not.toContain("'Pset_ManufacturerTypeInformation'");
    expect(texto).not.toContain("'Manufacturer'");
    expect(texto).not.toContain("'SolarHeatGainTransmittance'");
  });
});

describe('fabricante e fator solar no IFC: ida e volta', () => {
  it('exporta e reimporta mantendo fabricante da janela e da porta e o fator solar da janela', () => {
    const texto = exportar(casa({ manufacturer: 'Acme Esquadrias', solarFactor: 0.35 }, { manufacturer: 'Portas SA' }));
    const { project, report } = importIfc(semExtensaoHestia(texto));
    // Sem o registro do Hestia, as aberturas voltam pela leitura comum (ids novos), não pelo registro nativo.
    expect(project.elements.v).toBeUndefined();
    expect(report.imported.janelas).toBe(1);
    expect(report.imported.portas).toBe(1);
    // Os tipos padrão do projeto ficam no mapa: o teste olha o tipo que a abertura importada realmente usa.
    const tipoDe = (kind: 'door' | 'window'): OpeningType | undefined => {
      const vao = Object.values(project.elements).find((e): e is Opening => e.kind === kind && 'typeId' in e);
      return vao ? project.openingTypes[vao.typeId] : undefined;
    };
    const janela = tipoDe('window');
    const porta = tipoDe('door');
    expect(janela?.manufacturer).toBe('Acme Esquadrias');
    expect(janela?.solarFactor).toBe(0.35);
    expect(porta?.manufacturer).toBe('Portas SA');
    expect(porta?.solarFactor).toBeUndefined();
  });

  it('arquivo sem os psets não inventa fabricante nem fator solar', () => {
    const texto = exportar(casa());
    const { project } = importIfc(semExtensaoHestia(texto));
    for (const t of Object.values(project.openingTypes)) {
      expect(t.manufacturer).toBeUndefined();
      expect(t.solarFactor).toBeUndefined();
    }
  });
});
