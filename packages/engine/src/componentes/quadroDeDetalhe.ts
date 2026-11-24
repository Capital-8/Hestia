import { ALTURA_TEXTO_PAPEL_MM, type CotaResolvida, type DetalheResolvido } from './detalharFamilia.ts';

/*
 * Quadro de detalhe (ficha D6, CONTRATO §5): conteúdo 2D de um `DetalheResolvido` na escala pedida, já em mm de PAPEL.
 * Função pura, sem prancha: a prancha (quando aceitar o tipo de vista) só posiciona o resultado. A conversão é
 * papel = origem + modelo(m) × 1000 / escala. Os textos têm altura fixa de 2,5 mm de papel em qualquer escala.
 * Não lança: escala inválida devolve quadro vazio com diagnóstico; pares não finitos são descartados.
 */

export interface PontoPapel {
  x: number;
  y: number;
}

export type TipoLinhaQuadro = 'corte' | 'contorno' | 'cota' | 'extensao';

export interface LinhaQuadro {
  tipo: TipoLinhaQuadro;
  pontos: PontoPapel[];
  /** Laço fechado (corte e contorno). Cotas e extensões são segmentos abertos. */
  fechada: boolean;
}

export interface TextoQuadro {
  cotaId: string;
  texto: string;
  /** Centro do texto no papel (mm), no meio da linha de cota. */
  posicao: PontoPapel;
  /** Altura do texto no papel (mm): sempre 2,5 mm. */
  alturaMm: number;
}

export interface QuadroDetalhe {
  id: string;
  nome: string;
  /** Denominador da escala efetivamente usada (100 = 1:100). */
  escala: number;
  linhas: LinhaQuadro[];
  textos: TextoQuadro[];
  diagnosticos: string[];
}

const finito = (n: number): boolean => Number.isFinite(n);

/** Converte um laço plano (pares u, v em m) para pontos de papel; descarta pares não finitos. */
function lacoParaPapel(pares: readonly number[], origem: PontoPapel, fator: number): PontoPapel[] {
  const pontos: PontoPapel[] = [];
  for (let i = 0; i + 1 < pares.length; i += 2) {
    const u = pares[i];
    const v = pares[i + 1];
    if (u === undefined || v === undefined || !finito(u) || !finito(v)) continue;
    pontos.push({ x: origem.x + u * fator, y: origem.y + v * fator });
  }
  return pontos;
}

const ponto = (p: readonly [number, number], origem: PontoPapel, fator: number): PontoPapel => ({
  x: origem.x + p[0] * fator,
  y: origem.y + p[1] * fator,
});

function linhasDeCota(cota: CotaResolvida, origem: PontoPapel, fator: number): LinhaQuadro[] {
  const cotaLinha: LinhaQuadro = {
    tipo: 'cota',
    pontos: [ponto(cota.linha.de, origem, fator), ponto(cota.linha.ate, origem, fator)],
    fechada: false,
  };
  const extensaoDe: LinhaQuadro = { tipo: 'extensao', pontos: [ponto(cota.de, origem, fator), ponto(cota.linha.de, origem, fator)], fechada: false };
  const extensaoAte: LinhaQuadro = { tipo: 'extensao', pontos: [ponto(cota.ate, origem, fator), ponto(cota.linha.ate, origem, fator)], fechada: false };
  return [cotaLinha, extensaoDe, extensaoAte];
}

function textoDeCota(cota: CotaResolvida, origem: PontoPapel, fator: number): TextoQuadro {
  const a = ponto(cota.linha.de, origem, fator);
  const b = ponto(cota.linha.ate, origem, fator);
  return { cotaId: cota.id, texto: cota.texto, posicao: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, alturaMm: ALTURA_TEXTO_PAPEL_MM };
}

/**
 * Conteúdo 2D do quadro do detalhe `detalhe` na escala `escala` (denominador), com o ponto do modelo (0,0) em `origem`
 * (mm de papel). Cortes e silhuetas viram laços; cada cota vira linha de cota, duas linhas de extensão e um texto.
 */
export function quadroDeDetalhe(detalhe: DetalheResolvido, escala: number, origem: PontoPapel = { x: 0, y: 0 }): QuadroDetalhe {
  const base = { id: detalhe.id, nome: detalhe.nome };
  if (!finito(escala) || escala <= 0) {
    return { ...base, escala: 0, linhas: [], textos: [], diagnosticos: [`escala inválida para o quadro: ${String(escala)}`] };
  }
  const ox = finito(origem.x) ? origem.x : 0;
  const oy = finito(origem.y) ? origem.y : 0;
  const origemOk: PontoPapel = { x: ox, y: oy };
  const fator = 1000 / escala;

  const linhas: LinhaQuadro[] = [];
  for (const laco of detalhe.cortados) linhas.push({ tipo: 'corte', pontos: lacoParaPapel(laco, origemOk, fator), fechada: true });
  for (const laco of detalhe.contornos) linhas.push({ tipo: 'contorno', pontos: lacoParaPapel(laco, origemOk, fator), fechada: true });
  const textos: TextoQuadro[] = [];
  for (const cota of detalhe.cotas) {
    linhas.push(...linhasDeCota(cota, origemOk, fator));
    textos.push(textoDeCota(cota, origemOk, fator));
  }

  return { ...base, escala, linhas, textos, diagnosticos: detalhe.diagnosticos.map((d) => `${d.onde}: ${d.mensagem}`) };
}
