/**
 * Leitor de ZIP com modelo de mobiliario (leitura com `fflate`, ja no repo).
 *
 * - Recusa: ZIP acima de 50 MB, mais de 500 entradas, caminhos com `..` ou absolutos (zip-slip), ZIP dentro de ZIP e
 *   descompactacao total acima de 200 MB (bomba de descompactacao).
 * - Escolhe o modelo principal: glb > gltf > dae > obj > fbx; entre iguais, o de caminho mais raso e depois o maior.
 * - Arquivos vizinhos (.bin, .mtl, imagens) sao resolvidos a partir da pasta do modelo principal.
 * - O resultado sai com `sourceFormat: 'zip'`; o formato interno aparece em um aviso.
 */
import { unzipSync } from 'fflate';
import { readFbx } from './fbx.ts';
import { readDae } from './dae.ts';
import { readGltf } from './gltf.ts';
import { readObj } from './obj.ts';
import { baseName, buildModel, checkAbort, extensionOf, ImportError, normalizeRelPath, progress, type FileMap, type ReaderContext } from './fmtCommon.ts';
import type { ImportedModel, ImportOptions } from './types.ts';

export const ZIP_MAX_BYTES = 50 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 500;
export const ZIP_MAX_UNPACKED_BYTES = 200 * 1024 * 1024;

const PRIORITY = ['glb', 'gltf', 'dae', 'obj', 'fbx'];

/** Le um ZIP e devolve o modelo principal. Lanca ImportError para entradas inseguras ou limites excedidos. */
export async function readZip(file: { name: string; bytes: Uint8Array }, opts: ImportOptions | undefined): Promise<ImportedModel> {
  const startedAt = Date.now();
  checkAbort(opts);
  if (file.bytes.length > ZIP_MAX_BYTES) throw new ImportError('ZIP acima de 50 MB: recusado por limite de memória. Separe o modelo.');
  progress(opts, 0.05, 'Abrindo ZIP');

  let entryCount = 0;
  let unpacked = 0;
  const entries: Record<string, Uint8Array> = unzipSync(file.bytes, {
    filter: (info) => {
      if (info.name.endsWith('/')) return false;
      entryCount += 1;
      if (entryCount > ZIP_MAX_ENTRIES) throw new ImportError(`ZIP com mais de ${ZIP_MAX_ENTRIES} arquivos: recusado.`);
      if (normalizeRelPath(info.name) === null) {
        throw new ImportError(`ZIP recusado: caminho inseguro "${info.name}" (absoluto ou com "..").`);
      }
      unpacked += info.originalSize ?? 0;
      if (unpacked > ZIP_MAX_UNPACKED_BYTES) throw new ImportError('ZIP descompacta para mais de 200 MB: recusado.');
      return true;
    },
  });

  const files: FileMap = new Map();
  for (const [name, data] of Object.entries(entries)) {
    const norm = normalizeRelPath(name);
    if (norm === null) throw new ImportError(`ZIP recusado: caminho inseguro "${name}".`);
    if (norm) files.set(norm, data);
  }
  progress(opts, 0.2, 'Procurando o modelo principal');

  if (Array.from(files.keys()).some((k) => extensionOf(k) === 'zip')) throw new ImportError('ZIP dentro de ZIP não é suportado.');
  const candidates = Array.from(files.keys()).filter((k) => PRIORITY.includes(extensionOf(k)));
  if (candidates.length === 0) throw new ImportError('O ZIP não contém modelo (.glb, .gltf, .obj, .dae ou .fbx).');
  candidates.sort((a, b) => {
    const pa = PRIORITY.indexOf(extensionOf(a)), pb = PRIORITY.indexOf(extensionOf(b));
    if (pa !== pb) return pa - pb;
    const da = a.split('/').length, db = b.split('/').length;
    if (da !== db) return da - db;
    return (files.get(b)?.length ?? 0) - (files.get(a)?.length ?? 0);
  });
  const main = candidates[0]!;
  const ext = extensionOf(main);
  const slash = main.lastIndexOf('/');
  const ctx: ReaderContext = { files, baseDir: slash >= 0 ? main.slice(0, slash + 1) : '' };
  const inner = { name: baseName(main), bytes: files.get(main)! };

  let model: ImportedModel;
  const sub: ImportOptions = { ...opts, onProgress: (f, l) => progress(opts, 0.3 + f * 0.65, l) };
  if (ext === 'glb' || ext === 'gltf') model = await readGltf(inner, sub, ctx);
  else if (ext === 'dae') model = await readDae(inner, sub, ctx);
  else if (ext === 'obj') model = await readObj(inner, sub, ctx);
  else model = await readFbx(inner, sub, ctx);

  const warnings = [...model.warnings];
  if (candidates.length > 1) warnings.push(`ZIP com ${candidates.length} modelos; usado "${main}" (o mais raso e maior).`);
  warnings.unshift(`Modelo principal dentro do ZIP: ${main}.`);
  return buildModel({
    name: baseName(file.name).replace(/\.zip$/i, ''),
    sourceFileName: file.name,
    sourceFormat: 'zip',
    defs: model.defs,
    instances: model.instances,
    materials: model.materials,
    textures: model.textures,
    warnings,
    startedAt,
    sourceBytes: file.bytes.length,
  });
}
