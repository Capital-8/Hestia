import { VERSAO_INDICE, type IndiceBiblioteca, type ProjetoDaBiblioteca } from './tipos.ts';

/**
 * `biblioteca.json`: índice leve da pasta raiz.
 *
 * Ele existe só para a tela inicial abrir sem ler o documento de cada projeto (que tem a miniatura dentro e pode ter
 * alguns MB). Não é fonte da verdade: se sumir, ficar corrompido ou atrasado, a biblioteca se reconstrói lendo as
 * pastas — por isso todo campo vindo do disco aqui passa por validação antes de virar estado do app.
 */

/** Tamanho máximo aceito para uma miniatura no índice (protege a tela de um arquivo adulterado). */
export const MAX_MINIATURA = 400_000;
/** Miniatura aceita: só `data:` de imagem raster, que o `<img>` desenha sem buscar nada na rede. */
const MINIATURA_OK = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Miniatura válida (data URL de imagem) ou `null`. */
export function miniaturaValida(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  if (valor.length > MAX_MINIATURA) return null;
  return MINIATURA_OK.test(valor) ? valor : null;
}

/** Índice vazio para uma raiz recém-escolhida. */
export function indiceVazio(raiz: string): IndiceBiblioteca {
  return { versao: VERSAO_INDICE, raiz, projetos: [] };
}

/** Projetos na ordem de exibição: mais recente primeiro, empate pelo nome. */
export function ordenarProjetos(projetos: readonly ProjetoDaBiblioteca[]): ProjetoDaBiblioteca[] {
  return [...projetos].sort((a, b) => {
    const porData = (b.modificadoEm || '').localeCompare(a.modificadoEm || '');
    return porData !== 0 ? porData : a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' });
  });
}

/** Um item vindo do disco só entra no índice se tiver o mínimo para ser exibido e aberto. */
function projetoValido(valor: unknown): ProjetoDaBiblioteca | null {
  if (!valor || typeof valor !== 'object') return null;
  const o = valor as Record<string, unknown>;
  const pasta = typeof o.pasta === 'string' ? o.pasta.trim() : '';
  if (!pasta || pasta.includes('/') || pasta.includes('\\') || pasta === '.' || pasta === '..') return null;
  const nome = typeof o.nome === 'string' && o.nome.trim() ? o.nome.trim() : pasta;
  const modificadoEm = typeof o.modificadoEm === 'string' && !Number.isNaN(Date.parse(o.modificadoEm)) ? o.modificadoEm : '';
  const bytes = typeof o.bytes === 'number' && Number.isFinite(o.bytes) && o.bytes >= 0 ? o.bytes : undefined;
  return { pasta, nome, modificadoEm, miniatura: miniaturaValida(o.miniatura), ...(bytes === undefined ? {} : { bytes }) };
}

/**
 * Lê o índice do disco. Arquivo ausente, vazio, corrompido ou com itens estranhos não derrubam nada: o que não serve é
 * descartado e o índice é devolvido vazio (a camada de arquivos então reconstrói lendo as pastas).
 */
export function lerIndice(texto: string, raiz: string): IndiceBiblioteca {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return indiceVazio(raiz);
  }
  if (!bruto || typeof bruto !== 'object') return indiceVazio(raiz);
  const o = bruto as Record<string, unknown>;
  const lista = Array.isArray(o.projetos) ? o.projetos : [];
  const projetos: ProjetoDaBiblioteca[] = [];
  const vistos = new Set<string>();
  for (const item of lista) {
    const projeto = projetoValido(item);
    // Pasta repetida: vale o primeiro (o índice é escrito já sem repetição; isto protege contra edição manual).
    if (!projeto || vistos.has(projeto.pasta.toLocaleLowerCase())) continue;
    vistos.add(projeto.pasta.toLocaleLowerCase());
    projetos.push(projeto);
  }
  return { versao: VERSAO_INDICE, raiz, projetos: ordenarProjetos(projetos) };
}

/** Texto do índice: legível (1 espaço de recuo) e estável, para o diff do controle de versão do usuário não assustar. */
export function serializarIndice(indice: IndiceBiblioteca): string {
  const projetos = ordenarProjetos(indice.projetos).map((p) => ({
    pasta: p.pasta,
    nome: p.nome,
    modificadoEm: p.modificadoEm,
    miniatura: p.miniatura,
    ...(p.bytes === undefined ? {} : { bytes: p.bytes }),
  }));
  return `${JSON.stringify({ versao: VERSAO_INDICE, raiz: indice.raiz, projetos }, null, 1)}\n`;
}

/** Índice com a entrada do projeto substituída (ou incluída). */
export function comProjeto(indice: IndiceBiblioteca, projeto: ProjetoDaBiblioteca): IndiceBiblioteca {
  const outros = indice.projetos.filter((p) => p.pasta.toLocaleLowerCase() !== projeto.pasta.toLocaleLowerCase());
  return { ...indice, projetos: ordenarProjetos([...outros, projeto]) };
}

/** Índice sem um projeto (pasta apagada ou renomeada fora do app). */
export function semProjeto(indice: IndiceBiblioteca, pasta: string): IndiceBiblioteca {
  return { ...indice, projetos: indice.projetos.filter((p) => p.pasta.toLocaleLowerCase() !== pasta.toLocaleLowerCase()) };
}

/**
 * Junta o que foi descoberto varrendo as pastas ao índice guardado: o que existe entra/atualiza, o que sumiu sai. Para
 * cada pasta, vale a entrada mais recente (a varredura pode trazer uma miniatura nova e o índice a antiga).
 */
export function mesclarDescobertos(indice: IndiceBiblioteca, descobertos: readonly ProjetoDaBiblioteca[]): IndiceBiblioteca {
  const porPasta = new Map<string, ProjetoDaBiblioteca>();
  for (const p of indice.projetos) porPasta.set(p.pasta.toLocaleLowerCase(), p);
  const vistos = new Set<string>();
  for (const achado of descobertos) {
    const chave = achado.pasta.toLocaleLowerCase();
    vistos.add(chave);
    const guardado = porPasta.get(chave);
    const maisNovo = !guardado || (achado.modificadoEm || '') >= (guardado.modificadoEm || '') ? achado : guardado;
    porPasta.set(chave, { ...maisNovo, miniatura: maisNovo.miniatura ?? guardado?.miniatura ?? null });
  }
  // Pasta que não foi encontrada na varredura não existe mais no disco.
  for (const chave of [...porPasta.keys()]) if (!vistos.has(chave)) porPasta.delete(chave);
  return { ...indice, projetos: ordenarProjetos([...porPasta.values()]) };
}
