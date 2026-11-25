import type { Vec2 } from '@hestia/geom';
import { sugerirMudancaDeCota, type RegrasConexao } from '@hestia/engine';
import type { PreviewItem } from './types.ts';
import type { PontoTubo } from './tuboGeometria.ts';

/*
 * Alertas da ferramenta Tubo (ficha B5). Um trecho bloqueado fica guardado (`BloqueioTubo`) até o próximo clique válido ou Esc: a
 * prévia desenha o segmento tentado em VERMELHO (tom `invalid`, o da abertura sem espaço) com a sugestão de cota, e a fala mostra o
 * motivo. A viabilidade continua em `tuboViabilidade.ts`; aqui só a sugestão de mudança de cota (`sugerirMudancaDeCota`).
 */

/** Código do bloqueio que pede sugestão: `angulo` = ângulo sem conexão (`planejarPrumada`); os demais vêm da viabilidade. */
export type CodigoSugestao = 'angulo' | 'cota_insuficiente' | 'trecho_curto' | 'conexoes_se_tocam' | null;

/** Último trecho bloqueado: segmento tentado (plano, m), motivo e sugestão em texto (null se não há uma que resolva). */
export interface BloqueioTubo {
  a: Vec2;
  b: Vec2;
  motivo: string;
  sugestao: string | null;
}

/** Texto da sugestão, no padrão pedido pelo dono. */
export function textoSugestao(angulo: 45 | 90, mudancaMm: number): string {
  return `Sugestão: mudar a cota em ${Math.round(mudancaMm)} mm para permitir ${angulo}°.`;
}

/**
 * Sugestão para o segmento `a`→`b` bloqueado. Só o ponto FINAL muda de cota, e só se ele é livre (encaixado numa conexão ou derivação
 * a cota vem da rede: sem sugestão). `cota_insuficiente`: a prumada de 90° recebe `faltamMm`. `trecho_curto` e `angulo`: a de 45°, e
 * em `trecho_curto` só se `verifica` aprovar o trecho com a cota nova (senão a sugestão seria falsa).
 */
export function sugestaoDeBloqueio(regras: Pick<RegrasConexao, 'curva45' | 'curva90'> | null, codigo: CodigoSugestao, a: PontoTubo, b: PontoTubo, faltamMm: number | undefined, verifica: (candidato: PontoTubo) => boolean): string | null {
  if (!regras || codigo === null || codigo === 'conexoes_se_tocam' || b.alvo || b.derivacao) return null;
  const dPlanta = Math.hypot(b.xyz[0] - a.xyz[0], b.xyz[1] - a.xyz[1]) * 1000;
  const dz = (b.xyz[2] - a.xyz[2]) * 1000;
  if (codigo === 'cota_insuficiente') {
    const mudanca = sugerirMudancaDeCota(regras, 90, dPlanta, dz, Math.abs(dz) + (faltamMm ?? 0));
    return mudanca !== null && Math.round(mudanca) >= 1 ? textoSugestao(90, mudanca) : null;
  }
  const mudanca = sugerirMudancaDeCota(regras, 45, dPlanta, dz);
  if (mudanca === null || Math.round(mudanca) < 1) return null;
  if (codigo === 'trecho_curto') {
    const sinal = dz < 0 ? -1 : 1;
    if (!verifica({ xyz: [b.xyz[0], b.xyz[1], a.xyz[2] + (sinal * dPlanta) / 1000], alvo: null })) return null;
  }
  return textoSugestao(45, mudanca);
}

/** Prévia do bloqueio: o segmento tentado em vermelho e um rótulo com a sugestão (ou só "Bloqueado"). */
export function itensDoBloqueio(bloqueio: BloqueioTubo): PreviewItem[] {
  const meio: Vec2 = { x: (bloqueio.a.x + bloqueio.b.x) / 2, y: (bloqueio.a.y + bloqueio.b.y) / 2 };
  return [
    { kind: 'line', a: bloqueio.a, b: bloqueio.b, tone: 'invalid', halo: true },
    { kind: 'label', at: meio, text: bloqueio.sugestao ? `Bloqueado · ${bloqueio.sugestao}` : 'Bloqueado' },
  ];
}
