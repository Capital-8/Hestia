import { entregarArquivo } from './entregarArquivo.ts';
import { t, useI18n } from './i18n.ts';
import { safeFilename } from './nomeArquivo.ts';

/**
 * Entrega um arquivo de texto ao usuário e devolve uma frase de status no idioma ativo.
 * Ordem (em `entregarArquivo`): capacidade `downloads` do artefato, download direto; por último, área de transferência.
 */
export async function saveText(nomeOriginal: string, text: string): Promise<string> {
  const lang = useI18n.getState().lang;
  const filename = safeFilename(nomeOriginal);
  const entrega = await entregarArquivo({ nome: filename, conteudo: text });
  if (entrega === 'salvo') return t(lang, 'edc_saved_as', { file: filename });
  if (entrega === 'cancelado') return t(lang, 'edc_export_cancelled');
  if (entrega === 'baixado') return t(lang, 'edc_file_generated', { file: filename });
  try {
    await navigator.clipboard.writeText(text);
    return t(lang, 'edc_download_unavailable');
  } catch {
    return t(lang, 'edc_export_failed');
  }
}
