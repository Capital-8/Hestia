import { FURNITURE_LIMITS, furnitureAssetBytes } from './asset.ts';
import type { Project } from '../types.ts';

/**
 * Persistencia: os arrays ja vivem no projeto como base64 little-endian, entao `JSON.stringify(project)` e
 * `migrateProject(JSON.parse(...))` fazem a ida e volta exata, sem gancho. Aqui ficam so as conferencias.
 */
export interface FurniturePersistReport {
  totalBytes: number;
  warnings: string[];
  /** Caminhos absolutos achados nos nomes (deve ser sempre vazio). */
  absolutePaths: string[];
}

const ABS = /^[A-Za-z]:|[/\\]/;

export function furniturePersistReport(p: Project): FurniturePersistReport {
  const r: FurniturePersistReport = { totalBytes: 0, warnings: [], absolutePaths: [] };
  for (const a of Object.values(p.furniture?.assets ?? {})) {
    const n = furnitureAssetBytes(a);
    r.totalBytes += n;
    if (n > FURNITURE_LIMITS.warnAssetBytes) r.warnings.push(`${a.name}: ${(n / 1048576).toFixed(1)} MB (acima de 40 MB)`); // units-ok: tamanho em MB, nao e medida de projeto
    if (ABS.test(a.sourceFileName)) r.absolutePaths.push(a.sourceFileName);
    for (const t of a.textures) if (ABS.test(t.fileName)) r.absolutePaths.push(t.fileName);
  }
  return r;
}
