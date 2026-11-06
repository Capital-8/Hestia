/**
 * Seção de texturas do `HSTR` v3 (ver `codificarCena` em `wasmClient.ts`): tamanho e validação das texturas e os
 * índices de textura de cada material. Também o carregamento das texturas PENDENTES do snapshot
 * (`carregarTexturasDoSnapshot`, no navegador). A geometria da cadeia de mips fica em `texturaRender.ts`.
 */
import type { RenderMaterialMapas, RenderSceneSnapshot, RenderTextura } from '@hestia/render';
import { CODIGO_RENDER, ErroRenderWasm } from './erroRender.ts';
import {
  carregarTexturaRgba,
  dimensoesDoNivelMip,
  gerarMips,
  LADO_MAXIMO_TEXTURA,
  niveisDeMip,
  urlDaTextura,
} from './texturaRender.ts';

/** Índice de textura de um canal sem textura (`0xFFFFFFFF` no HSTR). */
export const SEM_TEXTURA = 0xffffffff;
export const MAX_TEXTURAS = 64;
export const MAX_LADO_TEXTURA = 8192;
const MAX_SECAO_TEXTURAS = 1024 * 1024 * 1024;

/**
 * Confere as texturas antes de reservar memória e devolve o tamanho da seção (quantidade + texturas).
 * Limites: 1..64 texturas; largura e altura 1..8192; cada nível com RGBA8 do tamanho exato; seção até 1 GB.
 */
export function tamanhoDasTexturas(texturas: RenderTextura[]): number {
  if (texturas.length > MAX_TEXTURAS) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `a cena tem ${texturas.length} texturas; o máximo é ${MAX_TEXTURAS}`);
  }
  let tamanho = 4;
  texturas.forEach((textura, i) => {
    const { largura, altura, mips } = textura;
    if (mips.length === 0) {
      const arquivo = textura.caminho ? ` (${textura.caminho})` : '';
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `textura ${i}${arquivo} não foi carregada; carregue os pixels com carregarTexturasDoSnapshot antes de codificar`,
      );
    }
    if (
      !Number.isInteger(largura) || !Number.isInteger(altura) ||
      largura < 1 || largura > MAX_LADO_TEXTURA || altura < 1 || altura > MAX_LADO_TEXTURA
    ) {
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `textura ${i} tem ${largura}×${altura}; largura e altura devem ficar entre 1 e ${MAX_LADO_TEXTURA}`,
      );
    }
    const maximo = niveisDeMip(largura, altura);
    if (mips.length < 1 || mips.length > maximo) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `textura ${i} tem ${mips.length} níveis de mip; esperado entre 1 e ${maximo}`);
    }
    tamanho += 12;
    for (let nivel = 0; nivel < mips.length; nivel++) {
      const [l, a] = dimensoesDoNivelMip(largura, altura, nivel);
      const esperado = l * a * 4;
      const pixels = mips[nivel];
      if (!(pixels instanceof Uint8Array) || pixels.length !== esperado) {
        throw new ErroRenderWasm(
          CODIGO_RENDER.cenaInvalida,
          `textura ${i}, nível ${nivel}: esperados ${esperado} bytes RGBA8 (${l}×${a})`,
        );
      }
      tamanho += esperado;
    }
  });
  if (tamanho > MAX_SECAO_TEXTURAS) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'a seção de texturas passa de 1 GB');
  }
  return tamanho;
}

/** Quatro índices (albedo, normal, rugosidade, metálico) de um material; `SEM_TEXTURA` quando o canal não tem textura. */
export function indicesDeTextura(mapas: RenderMaterialMapas | undefined, nTexturas: number, material: number): number[] {
  const canais: (keyof RenderMaterialMapas)[] = ['albedo', 'normal', 'roughness', 'metallic'];
  return canais.map((canal) => {
    const indice = mapas?.[canal];
    if (indice === undefined) return SEM_TEXTURA;
    if (!Number.isInteger(indice) || indice < 0 || indice >= nTexturas) {
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `material ${material}: ${canal} aponta para a textura ${indice}, fora de 0..${nTexturas - 1}`,
      );
    }
    return indice;
  });
}

/** Quantas texturas são buscadas ao mesmo tempo (ver `comLimite`). */
export const LIMITE_BUSCA_TEXTURAS = 4;

/** Opções do carregamento: `lado` (padrão 1024 = render final; a prévia pede `LADO_PREVIA_TEXTURA`) e `progresso`. */
export interface OpcoesTexturas {
  lado?: number;
  /** Chamado com (feitas, total): de (0, total) no início e a cada textura pronta. */
  progresso?: (feitas: number, total: number) => void;
}

/**
 * Imagens já baixadas, decodificadas e com mips, por lado e caminho (`${lado}|${caminho}`). Guarda a PROMESSA: duas
 * buscas simultâneas da mesma textura dividem uma só. Falha sai do cache (a próxima chamada tenta de novo). Os
 * arquivos da biblioteca não mudam durante a sessão; recarregar a página limpa o cache.
 */
const cacheImagens = new Map<string, Promise<RenderTextura>>();

/**
 * Última lista carregada (uma entrada só: cada lista pode passar de 100 MB). A chave é o lado + os caminhos na ordem;
 * quando a chave muda, a entrada é trocada, e a lista antiga sai do cache.
 */
let ultimaListaCarregada: { chave: string; carregando: Promise<RenderTextura[]> } | null = null;

/** Limpa os dois caches (imagens e lista). Usado pelos testes; o app não precisa chamar. */
export function limparCacheDeTexturas(): void {
  cacheImagens.clear();
  ultimaListaCarregada = null;
}

/** Chave da lista pendente: lado + caminhos na ordem. Muda quando a lista ou a resolução mudam. */
export function chaveDasTexturas(texturas: readonly RenderTextura[], lado: number): string {
  return JSON.stringify([lado, texturas.map((t) => t.caminho ?? null)]);
}

/** Textura da biblioteca pronta (pixels no lado pedido e mips), do cache quando já foi buscada. */
function carregarTexturaDaBiblioteca(caminho: string, lado: number): Promise<RenderTextura> {
  const chave = `${lado}|${caminho}`;
  const emCache = cacheImagens.get(chave);
  if (emCache) return emCache;
  const carregando = carregarTexturaRgba(urlDaTextura(caminho), lado)
    .then(({ largura, altura, rgba }) => ({ caminho, largura, altura, mips: gerarMips(rgba, largura, altura) }))
    .catch((e: unknown) => {
      cacheImagens.delete(chave);
      const motivo = e instanceof Error ? e.message : 'falha desconhecida';
      throw new Error(`não foi possível carregar a textura ${caminho}: ${motivo}`);
    });
  cacheImagens.set(chave, carregando);
  return carregando;
}

/**
 * Roda `fazer` sobre cada item com no máximo `limite` em andamento; devolve os resultados na ordem dos itens. Na
 * primeira falha nenhum item novo começa e a promessa rejeita com aquela falha (os que já estavam em andamento terminam).
 */
export async function comLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fazer: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  let falhou = false;
  const trabalhador = async (): Promise<void> => {
    while (!falhou && proximo < itens.length) {
      const indice = proximo++;
      try {
        resultados[indice] = await fazer(itens[indice] as T, indice);
      } catch (e) {
        falhou = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(limite)), itens.length) }, trabalhador));
  return resultados;
}

/**
 * Carrega os pixels de cada textura PENDENTE da lista do snapshot (`caminho` da biblioteca), na ordem dos índices: cada
 * arquivo vira RGBA8 com o lado maior em `opcoes.lado` (padrão 1024) e a cadeia de mips. Até `LIMITE_BUSCA_TEXTURAS`
 * buscas ao mesmo tempo; o cache (`cacheImagens`) evita buscar de novo. Só roda no navegador (`fetch`,
 * `createImageBitmap`). Falha de uma textura lança erro com o caminho: nunca troca por branco em silêncio.
 * Devolve a lista na mesma ordem, pronta para `codificarCena` (ver `comTexturasCarregadas`).
 */
export async function carregarTexturasDoSnapshot(snapshot: RenderSceneSnapshot, opcoes: OpcoesTexturas = {}): Promise<RenderTextura[]> {
  const lado = opcoes.lado ?? LADO_MAXIMO_TEXTURA;
  const lista = snapshot.texturas ?? [];
  let feitas = 0;
  opcoes.progresso?.(0, lista.length);
  return comLimite(lista, LIMITE_BUSCA_TEXTURAS, async (textura, i) => {
    const caminho = textura.caminho;
    if (!caminho) throw new Error(`textura ${i} da cena não tem caminho na biblioteca de texturas`);
    const pronta = await carregarTexturaDaBiblioteca(caminho, lado);
    feitas++;
    opcoes.progresso?.(feitas, lista.length);
    return pronta;
  });
}

/**
 * Cópia do snapshot com os pixels das texturas carregados (ver `carregarTexturasDoSnapshot`). Sem texturas, a mesma cena.
 * Enquanto a chave (lado + caminhos) não muda, devolve a MESMA lista de texturas: `codificarCena` reaproveita a seção
 * já codificada (ver `codificarSecaoTexturas` em `wasmClient.ts`). Mudou a lista ou o lado: a entrada anterior sai.
 */
export async function comTexturasCarregadas(snapshot: RenderSceneSnapshot, opcoes: OpcoesTexturas = {}): Promise<RenderSceneSnapshot> {
  if (!snapshot.texturas || snapshot.texturas.length === 0) return snapshot;
  const lado = opcoes.lado ?? LADO_MAXIMO_TEXTURA;
  const chave = chaveDasTexturas(snapshot.texturas, lado);
  let entrada = ultimaListaCarregada;
  if (!entrada || entrada.chave !== chave) {
    const nova = { chave, carregando: carregarTexturasDoSnapshot(snapshot, { ...opcoes, lado }) };
    nova.carregando.catch(() => {
      if (ultimaListaCarregada === nova) ultimaListaCarregada = null;
    });
    ultimaListaCarregada = nova;
    entrada = nova;
  }
  return { ...snapshot, texturas: await entrada.carregando };
}
