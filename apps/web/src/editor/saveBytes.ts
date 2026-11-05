import { entregarArquivo } from './entregarArquivo.ts';
import { safeFilename } from './nomeArquivo.ts';
import { t, useI18n } from './i18n.ts';

/**
 * Entrega um arquivo binário (o ZIP do lote de DXF) e devolve a frase de status, como `saveText`.
 * Ordem (em `entregarArquivo`): capacidade `downloads` do artefato, download direto; bytes não vão para a área de
 * transferência.
 */
export async function saveBytes(nomeOriginal: string, bytes: Uint8Array): Promise<string> {
  const lang = useI18n.getState().lang;
  const filename = safeFilename(nomeOriginal);
  const entrega = await entregarArquivo({ nome: filename, conteudo: bytes });
  if (entrega === 'salvo') return t(lang, 'io_saved_as', { name: filename });
  if (entrega === 'cancelado') return t(lang, 'io_export_cancelled');
  if (entrega === 'baixado') return t(lang, 'io_file_generated', { name: filename });
  return t(lang, 'io_export_failed');
}
