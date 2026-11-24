/**
 * Info de renderização para o diálogo "Sobre" (WP-A0): backend de GPU, renderer WebGL e versão do
 * WebKit. Serve para diagnosticar o 3D no desktop Linux (Tauri/WebKitGTK) sem console: o parser de
 * UA é puro e o resto degrada para `null` (o diálogo mostra "indisponível") quando a API falta.
 */
import { contadores } from '@hestia/render';

export interface InfoRender {
  /** Backend escolhido pelo `gpu/contexto.ts` ('webgl2', 'webgpu' ou 'cpu'); null antes do primeiro boot da vista 3D. */
  backend: string | null;
  /** String `UNMASKED_RENDERER_WEBGL` (ou `RENDERER` mascarado) de um canvas WebGL temporário. */
  renderer: string | null;
  /** Versão do WebKit lida do userAgent (WebKitGTK → Version/ → AppleWebKit/). */
  webkit: string | null;
}

/**
 * Puro: extrai a versão do WebKit do userAgent. Ordem: `WebKitGTK/x.y.z` (MiniBrowser/Tauri em
 * Linux), depois `Version/x.y` (Safari-style), depois o build `AppleWebKit/x.y.z`. Sem nada, null.
 */
export function versaoDoWebKit(ua: string): string | null {
  for (const re of [/webkitgtk\/([\d][\d.]*)/i, /\bversion\/([\d][\d.]*)/i, /applewebkit\/([\d][\d.]*)/i]) {
    const m = re.exec(ua);
    if (m?.[1]) return m[1];
  }
  return null;
}

interface GlComo {
  getExtension(nome: string): { UNMASKED_RENDERER_WEBGL?: number } | null;
  getParameter(p: number): unknown;
  readonly RENDERER: number;
}

/** Cria um canvas WebGL2 (ou WebGL1) descartável e lê o nome do renderer; null se não houver WebGL. */
export function rendererWebglPara(documento: Pick<Document, 'createElement'>): string | null {
  try {
    const canvas = documento.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as GlComo | null;
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const destapado = ext?.UNMASKED_RENDERER_WEBGL !== undefined ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    const bruto = typeof destapado === 'string' && destapado.trim() ? destapado : gl.getParameter(gl.RENDERER);
    return typeof bruto === 'string' && bruto.trim() ? bruto.trim() : null;
  } catch {
    return null;
  }
}

/** Junta as três leituras; chama só no abrir o diálogo (o canvas WebGL temporário é descartável). */
export function infoRender(): InfoRender {
  return {
    backend: contadores.snapshot().backend,
    renderer: typeof document === 'undefined' ? null : rendererWebglPara(document),
    webkit: typeof navigator === 'undefined' ? null : versaoDoWebKit(navigator.userAgent),
  };
}
