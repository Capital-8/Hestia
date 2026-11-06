/**
 * Decisões puras do diálogo "Renderizar imagem": rótulo do botão principal, quando ele pode ser
 * clicado e nome do arquivo entregue. Sem React, para serem testáveis isoladamente.
 */
import { ehTexturasNaoSuportadas } from '../../editor/render/erroRender.ts';
import type { EstadoSessao } from './renderSessao.ts';

export type QualidadeRender = 'rascunho' | 'final' | 'gpu';

export const MENSAGEM_SERVICO_GPU_INDISPONIVEL =
  'O serviço GPU nativo não está disponível. Inicie o `render-service` e tente de novo.';

/**
 * Rótulo do botão principal. "Salvar" nunca aparece: o botão sempre é o render.
 * `ocupadoLegado` cobre os caminhos Rascunho/Final, que ainda não passam pela sessão.
 */
export function rotuloDoBotaoPrincipal(estado: EstadoSessao, ocupadoLegado: boolean): string {
  if (ocupadoLegado || estado.tipo === 'renderizando') return 'Renderizando…';
  return 'Renderizar';
}

export interface EntradaPodeRenderizar {
  qualidade: QualidadeRender;
  estado: EstadoSessao;
  /** Caminho Rascunho/Final em andamento. */
  ocupadoLegado: boolean;
  /** Dimensões de saída válidas (há vista base, alvo calculado e sem problema). */
  alvoValido: boolean;
  /** Serviço GPU nativo respondeu ok na checagem de saúde. */
  servicoDisponivel: boolean;
  /** Há câmera 3D (ou do estúdio) para o render final e GPU. */
  temCamera: boolean;
  /** Snapshot da cena foi montado (necessário para a GPU). */
  temSnapshot: boolean;
  /** Há canvas da vista ativa (necessário para o rascunho). */
  temFonte: boolean;
}

/** "Renderizar" habilitado só com dimensões válidas, fora de outro render e com a qualidade pronta. */
export function podeClicarRenderizar(e: EntradaPodeRenderizar): boolean {
  if (e.ocupadoLegado || e.estado.tipo === 'renderizando') return false;
  if (!e.alvoValido) return false;
  if (e.qualidade === 'rascunho') return e.temFonte;
  if (e.qualidade === 'final') return e.temCamera;
  return e.servicoDisponivel && e.temCamera && e.temSnapshot;
}

/**
 * Vista ativa para a captura do rascunho. `vista3d` é a vista 3D e o estúdio de animação (que já
 * desenha o modelo em modo apresentação); `planta`, corte e prancha mostram grade/níveis/helpers.
 */
export type ModoVistaCaptura = 'vista3d' | 'planta' | 'outra';

export function modoVistaDaCaptura(view: string): ModoVistaCaptura {
  if (view === '3d' || view === 'animation') return 'vista3d';
  if (view === 'plan') return 'planta';
  return 'outra';
}

/** Só a vista 3D (em modo apresentação) vira rascunho limpo; o resto é recusado, não capturado com helper. */
export function podeRascunhoDaVista(modo: ModoVistaCaptura): boolean {
  return modo === 'vista3d';
}

export const MENSAGEM_RASCUNHO_SO_3D =
  'O rascunho de imagem só vale para a vista 3D. Na planta, no corte ou na prancha, use o GPU nativo ou o Final (Rust/WASM).';

/**
 * Se uma falha do Final (Rust/WASM) pode cair para o rascunho. Cena com textura não pode: o rascunho é a captura
 * da tela, e entregá-lo no lugar do Final seria imagem fingindo ser o render pedido. As demais falhas mantêm o
 * rascunho, com o aviso no diálogo.
 */
export function podeCairParaRascunho(erro: unknown): boolean {
  return !ehTexturasNaoSuportadas(erro);
}

/** Legenda do resultado no modal. Null enquanto não há imagem pronta. */
export function rotuloDoResultado(qualidade: QualidadeRender, pronto: boolean): string | null {
  if (!pronto) return null;
  if (qualidade === 'rascunho') return 'Rascunho da vista 3D: captura da tela em modo apresentação, sem recalcular a luz.';
  if (qualidade === 'final') return 'Render final em Rust/WASM pronto. A imagem também foi para a galeria.';
  return 'Render final na GPU nativa pronto. A imagem também foi para a galeria.';
}

/** Mensagem exibida quando a GPU é escolhida mas o serviço não está no ar. Null se não há problema. */
export function motivoGpuIndisponivel(servicoDisponivel: boolean | null): string | null {
  return servicoDisponivel === true ? null : MENSAGEM_SERVICO_GPU_INDISPONIVEL;
}

/**
 * Barra do progresso dentro do modal (GPU e Rascunho/Final). `fracao` nula = sem progresso real:
 * a barra fica indeterminada, nunca um percentual inventado.
 */
export function barraProgresso(fracao: number | null): { indeterminada: boolean; percentual: number } {
  if (fracao === null || !Number.isFinite(fracao)) return { indeterminada: true, percentual: 0 };
  return { indeterminada: false, percentual: Math.round(Math.min(1, Math.max(0, fracao)) * 100) };
}

function dois(n: number): string {
  return String(n).padStart(2, '0');
}

/** Nome da imagem entregue pela GPU: `render-AAAAMMDD-HHMMSS.png` (horário local). */
export function nomeArquivoRender(data: Date): string {
  const dia = `${data.getFullYear()}${dois(data.getMonth() + 1)}${dois(data.getDate())}`;
  const hora = `${dois(data.getHours())}${dois(data.getMinutes())}${dois(data.getSeconds())}`;
  return `render-${dia}-${hora}.png`;
}

/** Linha do diálogo sobre a câmera de render: a escolhida na aba Vista (ou o enquadramento automático). */
export const TEXTO_ENQUADRAMENTO_AUTOMATICO = 'Enquadramento automático';
export const TEXTO_SELECIONE_CAMERA = 'Enquadramento automático (selecione uma câmera de render na aba Vista para usá-la)';

export interface EntradaLinhaCameraDeRender {
  /** Qualidade GPU: só o render GPU nativo usa a câmera de render; os outros caminhos não mostram a linha. */
  gpu: boolean;
  /** Câmera de render escolhida e existente no projeto (ausente = nenhuma). */
  selecionada: { nome: string } | null;
  /** O projeto tem câmeras de render (para sugerir a seleção). */
  temCameras: boolean;
}

/**
 * Texto da linha de câmera no diálogo. Null fora do GPU nativo (o Rascunho e o Final seguem a vista ativa, não a câmera
 * de render, então a linha não diria a verdade para eles).
 */
export function linhaDaCameraDeRender(e: EntradaLinhaCameraDeRender): string | null {
  if (!e.gpu) return null;
  if (e.selecionada) return `Câmera: ${e.selecionada.nome}`;
  return e.temCameras ? TEXTO_SELECIONE_CAMERA : TEXTO_ENQUADRAMENTO_AUTOMATICO;
}
