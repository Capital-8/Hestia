/**
 * Seletor de arquivo para o importador de suplemento: abre o diálogo do navegador (ou do desktop) e lê os bytes.
 * Só a interface chama isto; o handler do suplemento nunca vê o `File` nem o sistema de arquivos.
 */
import { PLUGIN_IO_MAX_BYTES } from '@hestia/io';

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/** Abre o seletor restrito às extensões do importador. `null` se o usuário cancelar. */
export function pickFileForImport(extensions: readonly string[]): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = extensions.map((e) => `.${e}`).join(',');
    input.style.display = 'none';
    let done = false;
    const end = (v: PickedFile | null): void => {
      if (done) return;
      done = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener('cancel', () => end(null));
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return end(null);
      // Acima de 64 MiB nem lê o arquivo: o host recusa pelo tamanho (bytes vazios + tamanho real na checagem).
      if (f.size > PLUGIN_IO_MAX_BYTES) return end({ name: f.name, bytes: { byteLength: f.size } as unknown as Uint8Array });
      void f.arrayBuffer().then((b) => end({ name: f.name, bytes: new Uint8Array(b) }), () => end(null));
    });
    document.body.appendChild(input);
    input.click();
  });
}
