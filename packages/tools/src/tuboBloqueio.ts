import type { Vec2 } from '@hestia/geom';
import { avaliarEncontro, sugerirMudancaDeCota, type RegrasConexao } from '@hestia/engine';
import { isComponent, type Project } from '@hestia/model';
import type { PreviewItem } from './types.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';

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

/** Aviso de ângulo sem peça com a sugestão de cota (ficha B9): o de `avaliarEncontro` mais "Sugestão: mudar a cota em N mm para permitir 45°." quando cabe. */
export function avisoComSugestao(aviso: string, regras: Pick<RegrasConexao, 'curva45' | 'curva90'> | null, a: PontoTubo, b: PontoTubo): string {
  const sugestao = sugestaoDeBloqueio(regras, 'angulo', a, b, undefined, () => true);
  return sugestao ? `${aviso} ${sugestao}` : aviso;
}

/**
 * Alerta do canto em `inicio` (fim do trecho anterior da cadeia) para o trecho `inicio`→`fim`: o aviso de ângulo sem peça (ex. 60°)
 * com a sugestão de cota, ou null se o canto tem peça ou não há tubo anterior da mesma família. Mesma conta de `TuboTool.ligarPonta`.
 */
export function alertaDeAngulo(p: Project, familiaId: string, dn: number, regras: RegrasConexao | null, inicio: PontoTubo, fim: PontoTubo): string | null {
  const alvo = inicio.alvo;
  const outro = alvo ? p.elements[alvo.componentId] : undefined;
  const ext = alvo && regras && isComponent(outro) && outro.familyId === familiaId ? extremosDoTubo(p, outro) : null;
  if (!alvo || !regras || !ext) return null;
  const r = avaliarEncontro({ a: ext.a, b: ext.b, dn: ext.dn }, alvo.ligacaoId === ext.idA ? 'a' : 'b', { a: inicio.xyz, b: fim.xyz, dn }, 'a', regras, p.componentFamilies);
  return r.codigo === 'angulo_sem_peca' && r.aviso ? avisoComSugestao(r.aviso, regras, inicio, fim) : null;
}

/** Prévia do bloqueio: o segmento tentado em vermelho e um rótulo com a sugestão (ou só "Bloqueado"); `comMotivo` (hover) põe o motivo no rótulo. */
export function itensDoBloqueio(bloqueio: BloqueioTubo, comMotivo = false): PreviewItem[] {
  const meio: Vec2 = { x: (bloqueio.a.x + bloqueio.b.x) / 2, y: (bloqueio.a.y + bloqueio.b.y) / 2 };
  // No hover só o começo do motivo (até os dois-pontos) cabe na tela; o motivo inteiro vai na fala do clique.
  const texto = ['Bloqueado' + (comMotivo ? `: ${bloqueio.motivo.split(':')[0]}` : ''), bloqueio.sugestao].filter((t) => t).join(' · ');
  return [
    { kind: 'line', a: bloqueio.a, b: bloqueio.b, tone: 'invalid', halo: true },
    { kind: 'label', at: meio, text: texto },
  ];
}
