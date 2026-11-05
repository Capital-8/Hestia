import { entregarArquivo } from './entregarArquivo.ts';
import { safeFilename } from './nomeArquivo.ts';
import { t, useI18n } from './i18n.ts';

/**
 * Salva um PDF (bytes) pela mesma entrega dos demais arquivos (`entregarArquivo`: capacidade `downloads` ou âncora).
 * Devolve a frase de status no idioma ativo.
 */
export async function savePdf(filename: string, bytes: Uint8Array): Promise<string> {
  const lang = useI18n.getState().lang;
  const name = safeFilename(filename);
  const entrega = await entregarArquivo({ nome: name, conteudo: bytes });
  if (entrega === 'salvo' || entrega === 'baixado') return t(lang, 'io_saved_as', { name });
  if (entrega === 'cancelado') return t(lang, 'io_export_cancelled');
  return t(lang, 'io_pdf_failed');
}
