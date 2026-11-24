import { pontoNoMundo, type Component, type PontoXYZ } from '@hestia/model';
import type { LigacaoResolvida } from './corposTipos.ts';

/*
 * Compatibilidade e encaixe de LIGAÇÕES (CONTRATO §3, ficha C4). Funções puras e determinísticas: sem estado, sem relógio,
 * sem aleatoriedade. Entram ligações já no mundo (`LigacaoNoMundo`): posição em metros e direção unitária já girada pela
 * matriz do componente (`matrizDoComponente`, ordem de coluna; a translação vai nos índices 12, 13 e 14).
 * Os motivos são textos fixos (N8): os testes e a interface dependem deles.
 */

/** Ligação resolvida com a posição (m) e a direção (unitária, para fora) já no mundo. */
export type LigacaoNoMundo = LigacaoResolvida & {
  posicaoMundo: [number, number, number];
  direcaoMundo: [number, number, number];
};

/** Resultado de `ligacoesCompativeis`: `ok` ou o motivo fixo da primeira regra que recusa (ordem do CONTRATO §3). */
export type ResultadoCompatibilidade = { ok: true } | { ok: false; motivo: string };

/** Tolerância (m) das medidas de seção: 0,5 mm (CONTRATO §3, regra 3). */
const TOLERANCIA_MEDIDA = 0.0005;
/** Folga (m) para o erro de ponto flutuante na comparação com a tolerância de medidas; 1 nm, não muda a regra. */
const FOLGA_NUMERICA = 1e-9;
/** Produto escalar mínimo de direções opostas: −0,999 ≈ 2,56° de desvio (CONTRATO §3, regra 4). */
const OPOSTO_MINIMO = -0.999;

/** Verdadeiro se a ligação `b` está entre as que `a` aceita. */
function aceitaDominio(a: LigacaoNoMundo, b: LigacaoNoMundo): boolean {
  return a.aceita.includes(b.dominio);
}

/** Verdadeiro se as duas medidas diferem no máximo a tolerância de 0,5 mm. */
function mesmaMedida(x: number, y: number): boolean {
  return Math.abs(x - y) <= TOLERANCIA_MEDIDA + FOLGA_NUMERICA;
}

/** Verdadeiro se as medidas de seção coincidem (diâmetro, ou largura e altura). */
function mesmasBitolas(a: LigacaoNoMundo, b: LigacaoNoMundo): boolean {
  if (a.secao === 'redonda') return mesmaMedida(a.diametro, b.diametro);
  return mesmaMedida(a.largura, b.largura) && mesmaMedida(a.altura, b.altura);
}

/** Produto escalar das direções no mundo (unitárias: −1 = uma de frente para a outra). */
function produtoDirecoes(a: LigacaoNoMundo, b: LigacaoNoMundo): number {
  return a.direcaoMundo[0] * b.direcaoMundo[0] + a.direcaoMundo[1] * b.direcaoMundo[1] + a.direcaoMundo[2] * b.direcaoMundo[2];
}

/** Verdadeiro se o fluxo das duas ligações pode casar: nunca entrada com entrada nem saída com saída; `ambos` casa com tudo. */
function fluxosCasam(a: LigacaoNoMundo, b: LigacaoNoMundo): boolean {
  if (a.fluxo === 'ambos' || b.fluxo === 'ambos') return true;
  return a.fluxo !== b.fluxo;
}

/**
 * Regra 6 (fase 2, P1): se as duas ligações declaram encaixe, têm de ser bolsa × ponta, salvo se uma delas aceitar o mesmo tipo
 * (luva dupla, manga de correr). Sem encaixe em alguma das duas, a regra não se aplica (ligações antigas continuam casando).
 */
function encaixesCasam(a: LigacaoNoMundo, b: LigacaoNoMundo): boolean {
  if (!a.encaixe || !b.encaixe) return true;
  if (a.encaixe.tipo !== b.encaixe.tipo) return true;
  return a.encaixe.aceitaMesmoTipo || b.encaixe.aceitaMesmoTipo;
}

/**
 * Compatibilidade de duas ligações (CONTRATO §3, regras 1 a 5, mais a regra 6 de encaixe), na ordem: domínio, seção, bitola, direção e fluxo.
 * Devolve o motivo da primeira regra que recusa. Pura: não olha posição, só domínio, seção, medidas, direção e fluxo.
 */
export function ligacoesCompativeis(a: LigacaoNoMundo, b: LigacaoNoMundo): ResultadoCompatibilidade {
  if (!aceitaDominio(a, b) || !aceitaDominio(b, a)) return { ok: false, motivo: 'domínios incompatíveis' };
  if (a.secao !== b.secao) return { ok: false, motivo: 'seções diferentes' };
  if (!mesmasBitolas(a, b)) return { ok: false, motivo: 'bitolas diferentes' };
  if (!(produtoDirecoes(a, b) <= OPOSTO_MINIMO)) return { ok: false, motivo: 'ligações precisam apontar uma para a outra' };
  if (!fluxosCasam(a, b)) return { ok: false, motivo: 'fluxos incompatíveis' };
  if (!encaixesCasam(a, b)) return { ok: false, motivo: a.encaixe?.tipo === 'bolsa' ? 'bolsa não encaixa em bolsa' : 'ponta não encaixa em ponta' };
  return { ok: true };
}

/** Distância euclidiana (m) entre as posições no mundo de duas ligações. */
function distancia(a: LigacaoNoMundo, b: LigacaoNoMundo): number {
  const dx = b.posicaoMundo[0] - a.posicaoMundo[0];
  const dy = b.posicaoMundo[1] - a.posicaoMundo[1];
  const dz = b.posicaoMundo[2] - a.posicaoMundo[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Melhor encaixe da ligação `alvo` entre as `candidatas`: a compatível mais próxima (posição no mundo), dentro de `tolerancia`
 * (m; 50 mm por padrão). Empate fica com a primeira na ordem da lista. `deslocamento` é o vetor de `alvo.posicaoMundo` até
 * `candidata.posicaoMundo`, o quanto a instância arrastada deve andar para casar as ligações.
 *
 * TODO (primeira versão): a ficha prevê também `rotacaoZ` e `inclinacao` (alinhar a direção de uma ligação à outra). Ficam de
 * fora porque o giro em torno de Z e a inclinação dependem do modelo de inclinação 3D (ADR 0061 §D6) e de como a instância
 * arrastada absorve a rotação; esta versão devolve só o deslocamento, que basta para a posição.
 */
export function encaixarLigacoes(
  alvo: LigacaoNoMundo,
  candidatas: LigacaoNoMundo[],
  tolerancia = 0.05,
): { candidata: LigacaoNoMundo; deslocamento: [number, number, number] } | null {
  let melhor: LigacaoNoMundo | null = null;
  let melhorDistancia = Infinity;
  for (const candidata of candidatas) {
    if (!ligacoesCompativeis(alvo, candidata).ok) continue;
    const d = distancia(alvo, candidata);
    if (d > tolerancia || d >= melhorDistancia) continue;
    melhor = candidata;
    melhorDistancia = d;
  }
  if (melhor === null) return null;
  const deslocamento: [number, number, number] = [
    melhor.posicaoMundo[0] - alvo.posicaoMundo[0],
    melhor.posicaoMundo[1] - alvo.posicaoMundo[1],
    melhor.posicaoMundo[2] - alvo.posicaoMundo[2],
  ];
  return { candidata: melhor, deslocamento };
}

/** Componente sem translação: a matriz que só gira, usada para as direções. */
function componenteSemTranslacao(componente: Component): Component {
  return { ...componente, x: 0, y: 0, z: 0 };
}

/**
 * Leva uma ligação resolvida ao mundo pela matriz do componente. A posição passa pela matriz inteira (translação incluída);
 * a direção só gira (a mesma matriz sem translação).
 */
export function ligacaoNoMundo(lig: LigacaoResolvida, componente: Component): LigacaoNoMundo {
  const p: PontoXYZ = pontoNoMundo(componente, { x: lig.posicao[0], y: lig.posicao[1], z: lig.posicao[2] });
  const d: PontoXYZ = pontoNoMundo(componenteSemTranslacao(componente), { x: lig.direcao[0], y: lig.direcao[1], z: lig.direcao[2] });
  return { ...lig, posicaoMundo: [p.x, p.y, p.z], direcaoMundo: [d.x, d.y, d.z] };
}
