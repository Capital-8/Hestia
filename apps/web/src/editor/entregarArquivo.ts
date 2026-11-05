/**
 * Ponto único de entrega de arquivos gerados (projeto, CSV, DXF, IFC, PDF).
 *
 * Ordem: capacidade `downloads` do artefato do claude.ai (o viewer confirma; bytes ou texto, sem base64);
 * se ela não existir (fora do artefato, `use` nulo ou falha), download pelo `<a download>`.
 * Recusa explícita (`declined`) não cai no download: o viewer disse não.
 */

/** Parte da capacidade `downloads` usada aqui (tipos completos em `artifact-capabilities/0.2.89/downloads.d.ts`). */
export type DownloadsApi = {
  save(r: { filename: string; data: string | Uint8Array }): Promise<unknown>;
};

/** Parte do objeto `window.claude` usada aqui: só `use` é garantido pelo contrato. */
export type HostClaude = { use?: (name: string) => Promise<DownloadsApi | null> };

/** Arquivo a entregar. `conteudo` é texto (UTF-8) ou bytes (PDF). */
export type Arquivo = { nome: string; conteudo: string | Uint8Array };

/**
 * `salvo`: o viewer aceitou pela capacidade. `cancelado`: o viewer recusou. `baixado`: download pela âncora.
 * `falhou`: nenhum caminho funcionou.
 */
export type Entrega = 'salvo' | 'cancelado' | 'baixado' | 'falhou';

/** Injeção para teste: `host` substitui `window.claude`; `ancora` substitui o download pelo `<a download>`. */
export type OpcoesEntrega = {
  host?: HostClaude;
  ancora?: (arquivo: Arquivo) => boolean;
};

/** Tipo MIME pela extensão. Usado só no download pela âncora (a capacidade define o tipo sozinha). */
export function tipoDoArquivo(nome: string): string {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'text/csv;charset=utf-8';
  if (ext === 'json') return 'application/json';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'zip') return 'application/zip';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp4') return 'video/mp4';
  return 'text/plain;charset=utf-8';
}

/** Baixa pelo `<a download>`. Devolve false se o navegador não permitir (por exemplo, dentro de um iframe sem permissão). */
export function baixarPorAncora(arquivo: Arquivo): boolean {
  try {
    const blob = new Blob([arquivo.conteudo as BlobPart], { type: tipoDoArquivo(arquivo.nome) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = arquivo.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

/** Obtém a capacidade `downloads`; `null` quando não há artefato, a capacidade não foi concedida ou `use` falhou. */
async function obterDownloads(host: HostClaude | undefined): Promise<DownloadsApi | null> {
  if (!host || typeof host.use !== 'function') return null;
  try {
    return await host.use('downloads');
  } catch {
    return null;
  }
}

const codigoDoErro = (e: unknown): string | undefined =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;

/** Entrega um arquivo pelo melhor caminho disponível. Nunca lança. */
export async function entregarArquivo(arquivo: Arquivo, opcoes: OpcoesEntrega = {}): Promise<Entrega> {
  const host = opcoes.host ?? hostDoArtefato();
  const downloads = await obterDownloads(host);
  if (downloads) {
    try {
      await downloads.save({ filename: arquivo.nome, data: arquivo.conteudo });
      return 'salvo';
    } catch (e) {
      if (codigoDoErro(e) === 'declined') return 'cancelado';
      // Outras recusas (extensão fora da lista, indisponível, etc.) seguem para o download pela âncora.
    }
  }
  return (opcoes.ancora ?? baixarPorAncora)(arquivo) ? 'baixado' : 'falhou';
}

function hostDoArtefato(): HostClaude | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { claude?: HostClaude }).claude;
}
