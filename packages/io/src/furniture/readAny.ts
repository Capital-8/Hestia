/**
 * Ponto de entrada dos leitores de mobiliario: escolhe o leitor pela extensao do arquivo.
 * .skp nao e lido aqui (tem leitor proprio); extensao desconhecida devolve erro em portugues.
 */
import { importDae } from './dae.ts';
import { importFbx } from './fbx.ts';
import { checkAbort, extensionOf, ImportError, progress } from './fmtCommon.ts';
import { importGltf } from './gltf.ts';
import { importObj } from './obj.ts';
import { readZip, ZIP_MAX_BYTES } from './zip.ts';
import type { ImportedModel, ImportOptions } from './types.ts';

export const FURNITURE_EXTENSIONS = ['glb', 'gltf', 'obj', 'dae', 'fbx', 'zip'] as const;

/** Importa um arquivo de mobiliario pelo nome (extensao). Erros saem como `ImportError` em portugues. */
export async function importFurnitureFile(file: { name: string; bytes: Uint8Array }, opts?: ImportOptions): Promise<ImportedModel> {
  checkAbort(opts);
  if (file.bytes.length > ZIP_MAX_BYTES) throw new ImportError('Arquivo acima de 50 MB: recusado por limite de memória.');
  const ext = extensionOf(file.name);
  progress(opts, 0, 'Iniciando importação');
  let model: ImportedModel;
  switch (ext) {
    case 'glb':
    case 'gltf':
      model = await importGltf(file, opts);
      break;
    case 'obj':
      model = await importObj(file, opts);
      break;
    case 'dae':
      model = await importDae(file, opts);
      break;
    case 'fbx':
      model = await importFbx(file, opts);
      break;
    case 'zip':
      model = await readZip(file, opts);
      break;
    default:
      throw new ImportError(`Formato não suportado: ".${ext || '?'}". Use .glb, .gltf, .obj, .dae, .fbx ou .zip (com o modelo e as texturas juntos).`);
  }
  progress(opts, 1, 'Concluído');
  return model;
}

