import { safeFilename } from '../nomeArquivo.ts';
import { canvasAtivo } from './captureRegistry.ts';

/**
 * Captura da vista ativa para PNG (T5).
 *
 * v1: copia o canvas que já está na tela (`canvasAtivo()`) para um canvas novo, no tamanho pedido.
 * O up-scale é feito por `drawImage` com suavização — é rápido e serve para apresentação imediata.
 * O render final em alta qualidade (Rust/path tracer) virá depois e não passa por aqui: esta função
 * continua sendo o caminho “Rascunho (viewport)” da imagem parada.
 */

/** Lado máximo de uma imagem, em pixels (limite defensivo de canvas do navegador). */
export const LIMITE_LADO_IMAGEM = 8192;

/** Total máximo de pixels da imagem. Evita alocar centenas de MB por engano em 8192×8192. */
export const LIMITE_PIXELS_IMAGEM = 36_000_000;

export interface DimensoesImagem {
  largura: number;
  altura: number;
}

/** Presets do diálogo: 1×/2× o canvas da tela ou largura/altura digitadas. */
export type ModoResolucaoImagem = '1x' | '2x' | 'personalizado';

export interface OpcoesCaptura extends DimensoesImagem {
  /** Cor de fundo `#rrggbb`; `null` mantém transparência (o canvas 3D normalmente já é opaco). */
  fundo?: string | null;
  /**
   * Fábrica do canvas de saída. Existe para teste em Node; no navegador o padrão é
   * `document.createElement('canvas')`.
   */
  criarCanvas?: () => HTMLCanvasElement;
}

/** Fator de escala do preset; `null` em “personalizado”. */
export function fatorDoModo(modo: ModoResolucaoImagem): 1 | 2 | null {
  if (modo === '1x') return 1;
  if (modo === '2x') return 2;
  return null;
}

/** Resolve o tamanho final da captura a partir do tamanho-base da vista. */
export function resolverDimensoes(
  base: DimensoesImagem,
  modo: ModoResolucaoImagem,
  personalizado?: DimensoesImagem,
): DimensoesImagem {
  if (modo === 'personalizado') {
    return {
      largura: Math.round(personalizado?.largura ?? base.largura),
      altura: Math.round(personalizado?.altura ?? base.altura),
    };
  }
  const fator = fatorDoModo(modo) ?? 1;
  return {
    largura: Math.round(base.largura * fator),
    altura: Math.round(base.altura * fator),
  };
}

/**
 * Valida o tamanho pedido. Devolve a mensagem para a interface, ou `null` quando está tudo certo.
 * A checagem fica aqui (e não no diálogo) para ser testável sem DOM.
 */
export function validarDimensoes(dim: DimensoesImagem): string | null {
  if (!Number.isFinite(dim.largura) || !Number.isFinite(dim.altura) || dim.largura <= 0 || dim.altura <= 0) {
    return 'A resolução precisa ter largura e altura maiores que zero.';
  }
  if (dim.largura > LIMITE_LADO_IMAGEM || dim.altura > LIMITE_LADO_IMAGEM) {
    return `O lado máximo desta versão é ${LIMITE_LADO_IMAGEM} px.`;
  }
  if (dim.largura * dim.altura > LIMITE_PIXELS_IMAGEM) {
    return 'A resolução escolhida é grande demais para a captura rápida. Reduza a largura ou a altura.';
  }
  return null;
}

/** Nome de download seguro, sempre com a extensão `.png` (sem duplicar a extensão digitada). */
export function nomeArquivoPng(nome: string): string {
  const semExtensao = nome.trim().replace(/\.(png|jpe?g|webp|bmp)$/i, '');
  // `safeFilename` também remove acentos e caracteres que o navegador recusaria no atributo download.
  return `${safeFilename(semExtensao || 'vista').replace(/\.png$/i, '')}.png`;
}

/**
 * Desenha a fonte no canvas de destino, no tamanho pedido.
 *
 * Em v1 o destino é sempre um canvas novo; `destino.width/height` são redefinidos aqui (isso limpa
 * o canvas) e o desenho é um único `drawImage` com interpolação de alta qualidade.
 */
export function desenharCaptura(
  destino: HTMLCanvasElement,
  fonte: HTMLCanvasElement,
  largura: number,
  altura: number,
  fundo: string | null = null,
): void {
  if (fonte.width <= 0 || fonte.height <= 0) {
    throw new Error('A vista ativa ainda não foi desenhada. Aproxime ou redimensione a janela e tente de novo.');
  }
  const l = Math.max(1, Math.round(largura));
  const a = Math.max(1, Math.round(altura));
  destino.width = l;
  destino.height = a;
  const ctx = destino.getContext('2d');
  if (!ctx) throw new Error('Este navegador não oferece canvas 2D para gerar a imagem.');
  ctx.clearRect(0, 0, l, a);
  if (fundo) {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, l, a);
  }
  // v1: up-scale por drawImage. O render final de alta qualidade virá do backend Rust (T8).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, fonte.width, fonte.height, 0, 0, l, a);
}

/** Converte um erro de canvas protegido em mensagem de produto. */
function mensagemDeCaptura(e: unknown): Error {
  const nome = typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : '';
  if (nome === 'SecurityError') {
    return new Error('A vista ativa não pode ser lida pelo navegador (canvas protegido). Use o botão de download do próprio 3D.');
  }
  if (e instanceof Error) return e;
  return new Error('Não foi possível capturar a vista ativa.');
}

/** Captura um canvas já conhecido e devolve o `Blob` PNG. */
export function capturarCanvas(
  fonte: HTMLCanvasElement,
  opcoes: OpcoesCaptura,
): Promise<Blob> {
  const problema = validarDimensoes(opcoes);
  if (problema) return Promise.reject(new Error(problema));
  if (fonte.width <= 0 || fonte.height <= 0) {
    return Promise.reject(new Error('A vista ativa ainda não foi desenhada.'));
  }

  let canvas: HTMLCanvasElement;
  try {
    if (opcoes.criarCanvas) {
      canvas = opcoes.criarCanvas();
    } else {
      if (typeof document === 'undefined') throw new Error('Sem documento para criar o canvas da imagem.');
      canvas = document.createElement('canvas');
    }
    desenharCaptura(canvas, fonte, opcoes.largura, opcoes.altura, opcoes.fundo ?? null);
  } catch (e) {
    return Promise.reject(mensagemDeCaptura(e));
  }

  return new Promise<Blob>((resolve, reject) => {
    const liberar = (): void => {
      canvas.width = 0;
      canvas.height = 0;
    };
    if (typeof canvas.toBlob !== 'function') {
      liberar();
      reject(new Error('Este navegador não gera PNG por canvas. Atualize o Chrome ou o Edge.'));
      return;
    }
    try {
      canvas.toBlob((blob) => {
        liberar();
        if (!blob) {
          reject(new Error('O navegador não conseguiu gerar o PNG.'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    } catch (e) {
      liberar();
      reject(mensagemDeCaptura(e));
    }
  });
}

/** Captura a vista ativa (`canvasAtivo()`) no tamanho pedido e devolve o PNG. */
export function capturarVista(opcoes: OpcoesCaptura): Promise<Blob> {
  const fonte = canvasAtivo();
  if (!fonte) {
    return Promise.reject(
      new Error('Nenhuma vista ativa para capturar. Abra a planta, um corte ou o modelo 3D e tente de novo.'),
    );
  }
  return capturarCanvas(fonte, opcoes);
}

/**
 * Miniatura pequena em data URL para a galeria. Usa JPEG para o registro não crescer demais no
 * IndexedDB; a imagem original continua sendo o PNG salvo. Falhas (canvas protegido, sem 2D) devolvem
 * `null` e não impedem o salvamento.
 */
export function criarMiniaturaDataUrl(fonte: HTMLCanvasElement, max = 180): string | null {
  if (fonte.width <= 0 || fonte.height <= 0 || typeof document === 'undefined') return null;
  const escala = Math.min(1, max / Math.max(fonte.width, fonte.height));
  const largura = Math.max(1, Math.round(fonte.width * escala));
  const altura = Math.max(1, Math.round(fonte.height * escala));
  try {
    const tmp = document.createElement('canvas');
    tmp.width = largura;
    tmp.height = altura;
    const ctx = tmp.getContext('2d');
    if (!ctx) return null;
    // JPEG não tem canal alfa: preenche de branco para não virar preto em áreas transparentes.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, 0, 0, fonte.width, fonte.height, 0, 0, largura, altura);
    return tmp.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}
