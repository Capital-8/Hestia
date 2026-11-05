import { makeLevel, type Id, type Project } from '@hestia/model';
import { slug } from './elementTypes.ts';
import type { IfcFile } from './ifc.ts';
import type { StepEntity } from './step.ts';
import { t, type Lang } from '../i18n.ts';

/** Nível importado: id do Hestia, cota e id da entidade `IfcBuildingStorey` de origem. */
export interface LevelRef {
  id: Id;
  elevation: number;
  storey: number;
}

/** Cota de um pavimento: `Elevation` (atributo 9) ou a origem do placement. */
function storeyElevation(f: IfcFile, e: StepEntity): number {
  const explicit = f.num(e, 9);
  if (explicit != null) return explicit * f.units.length;
  return f.productPlacement(e).o.z;
}

/** Distância mínima entre cotas de piso para virarem níveis distintos (m). */
const LEVEL_GAP = 1.5;

/** Agrupa cotas de piso em níveis: cada salto maior que `LEVEL_GAP` começa um nível novo. */
function clusterLevels(zs: readonly number[]): number[] {
  const sorted = zs.filter((z) => Number.isFinite(z)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const z of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || z - last > LEVEL_GAP) out.push(Math.round(z * 100) / 100);
  }
  return out;
}

/** Níveis do arquivo (do mais baixo para o mais alto); sem `IfcBuildingStorey`, infere pelas cotas dos corpos. */
export function readLevels(f: IfcFile, p: Project, report: { levels: number }, zs: readonly number[] = [], lang: Lang = 'pt'): LevelRef[] {
  const storeys = f.byType('IFCBUILDINGSTOREY').map((e) => ({ e, z: storeyElevation(f, e) }));
  storeys.sort((a, b) => a.z - b.z);
  if (!storeys.length) {
    const clusters = clusterLevels(zs);
    if (clusters.length) {
      p.levels = clusters.map((z, i) => {
        const name = Math.abs(z) < 0.5 ? t(lang, 'io_ifc_level_ground') : t(lang, 'io_ifc_level_n', { n: i + 1 });
        return makeLevel({ id: `lv_${i}_${slug(name) || i}`, name, elevation: z });
      });
      report.levels = p.levels.length;
      return clusters.map((z, i) => ({ id: p.levels[i]!.id, elevation: z, storey: 0 }));
    }
    const level = makeLevel({ id: 'lv_0', name: t(lang, 'io_ifc_level_ground'), elevation: 0 });
    p.levels = [level];
    report.levels = 1;
    return [{ id: level.id, elevation: 0, storey: 0 }];
  }
  p.levels = storeys.map((s, i) => {
    const name = f.text(s.e, 2).trim() || t(lang, 'io_ifc_level_n', { n: i + 1 });
    return makeLevel({ id: `lv_${i}_${slug(name) || i}`, name, elevation: s.z });
  });
  report.levels = p.levels.length;
  return storeys.map((s, i) => ({ id: p.levels[i]!.id, elevation: s.z, storey: s.e.id }));
}
