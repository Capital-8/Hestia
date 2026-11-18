import { caixaDoContorno, type PecaResolvida } from '@hestia/engine';
import type { DxfPoint } from './dxf.ts';
import { writeDxf2000, type DxfDoc, type DxfDocEntity, type DxfDocLayer } from './dxfDoc.ts';

/*
 * DXF das peças para a máquina de corte (CNC) e para o marceneiro. FICHA E6-dxf: implementar `dxfDasPecas`. Testes em `dxfPecas.test.ts`.
 * Reaproveite `DxfDoc` e `writeDxf2000` de `./dxfDoc.ts` (R2000, o que o Hestia já exporta e o AutoCAD abre) e confira o resultado com
 * `dxfProblems2000` de `./dxfCheck.ts` (só aceita POLYLINE, VERTEX, SEQEND, LINE e TEXT: não use CIRCLE nem ARC).
 */

export interface OpcoesDxfPecas {
  /** Espaço entre as peças na folha (m). Padrão 0,05. */
  espaco?: number;
  /** Segmentos que aproximam um furo (polígono regular). Padrão 24; mínimo 8. */
  segmentosDoFuro?: number;
}

/** Espaçamento padrão entre as peças na folha (m). */
const ESPACO_PADRAO = 0.05;

/** Segmentos padrão de um furo (polígono regular). */
const SEGMENTOS_PADRAO = 24;

/** Abaixo disso o furo vira um polígono feio demais: mínimo de 8 lados. */
const SEGMENTOS_MINIMOS = 8;

/** Altura do nome da peça (m). */
const ALTURA_TEXTO = 0.02;

/** Folga do nome acima da peça (m). */
const FOLGA_TEXTO = 0.02;

/** Camadas do desenho, na ordem em que saem na tabela LAYER. */
const CAMADAS: readonly DxfDocLayer[] = [
  { name: 'PECA', color: 7, linetype: 'CONTINUOUS' },
  { name: 'FURO_A', color: 1, linetype: 'CONTINUOUS' },
  { name: 'FURO_B', color: 5, linetype: 'CONTINUOUS' },
  { name: 'RASGO', color: 3, linetype: 'CONTINUOUS' },
  { name: 'RECORTE', color: 6, linetype: 'CONTINUOUS' },
  { name: 'TEXTO', color: 2, linetype: 'CONTINUOUS' },
];

/** As duas medidas no plano da chapa: largura em u e altura em v (m). */
function dimensoesDaPeca(p: PecaResolvida): { largura: number; altura: number } {
  if (p.contorno !== null && p.contorno.length > 0) {
    const caixa = caixaDoContorno(p.contorno);
    return { largura: caixa.u1 - caixa.u0, altura: caixa.v1 - caixa.v0 };
  }
  return { largura: p.tamanho[0], altura: p.tamanho[1] };
}

/** Retângulo fechado com o canto mínimo em (x, y) e lados largura × altura, em sentido anti-horário. */
function retangulo(x: number, y: number, largura: number, altura: number): DxfPoint[] {
  return [
    { x, y },
    { x: x + largura, y },
    { x: x + largura, y: y + altura },
    { x, y: y + altura },
  ];
}

/** Polígono regular de `segmentos` vértices em torno do centro, primeiro vértice em ângulo 0 e sentido anti-horário. */
function circulo(centro: DxfPoint, raio: number, segmentos: number): DxfPoint[] {
  const pontos: DxfPoint[] = [];
  for (let i = 0; i < segmentos; i += 1) {
    const angulo = (2 * Math.PI * i) / segmentos;
    pontos.push({ x: centro.x + raio * Math.cos(angulo), y: centro.y + raio * Math.sin(angulo) });
  }
  return pontos;
}

/** Contorno da peça deslocado para a folha: pares (u, v) em metros, com u somado ao X da peça. */
function contornoNaFolha(contorno: readonly number[], x: number): DxfPoint[] {
  const pontos: DxfPoint[] = [];
  for (let i = 0; i + 1 < contorno.length; i += 2) {
    pontos.push({ x: contorno[i]! + x, y: contorno[i + 1]! });
  }
  return pontos;
}

/** Segmentos do furo: o pedido (arredondado), com o mínimo de 8. */
function segmentosDoFuro(segmentos: number | undefined): number {
  const pedido = segmentos ?? SEGMENTOS_PADRAO;
  return Math.max(SEGMENTOS_MINIMOS, Math.round(pedido));
}

/** Entidades de usinagem da peça deslocada para o X da folha. Furos de borda ficam de fora. */
function entidadesDasUsinagens(p: PecaResolvida, x: number, segmentos: number): DxfDocEntity[] {
  const entidades: DxfDocEntity[] = [];
  for (const us of p.usinagens) {
    if (us.tipo === 'furo') {
      if (us.face !== 'a' && us.face !== 'b') continue;
      const camada = us.face === 'a' ? 'FURO_A' : 'FURO_B';
      entidades.push({ kind: 'polyline', layer: camada, points: circulo({ x: us.u + x, y: us.v }, us.diametro / 2, segmentos), closed: true });
    } else if (us.tipo === 'rasgo') {
      entidades.push({ kind: 'polyline', layer: 'RASGO', points: retangulo(us.u + x, us.v, us.comprimento, us.largura), closed: true });
    } else {
      entidades.push({ kind: 'polyline', layer: 'RECORTE', points: retangulo(us.u + x, us.v, us.comprimento, us.largura), closed: true });
    }
  }
  return entidades;
}

/**
 * Uma folha com todas as peças NÃO vazias lado a lado, na ordem da lista, da esquerda para a direita, cada uma vista pela face `a`:
 * u do plano da chapa → X e v → Y; a peça `i` começa em X = soma das larguras (extensão em u = `tamanho[0]`, ou a caixa do `contorno`) das anteriores + `espaco` × i; Y começa em 0.
 * O documento é montado em METROS e gravado com `units: 'mm'` (o escritor converte).
 * Camadas (nome, cor ACI): `PECA` (7), `FURO_A` (1), `FURO_B` (5), `RASGO` (3), `RECORTE` (6), `TEXTO` (2); todas CONTINUOUS.
 * Entidades por peça: contorno como UMA polilinha fechada na camada PECA (retângulo = 4 vértices `0,0 a,0 a,b 0,b`; com `contorno`, os pontos dele);
 * cada furo em face `a` ou `b` como polilinha fechada de `segmentosDoFuro` vértices em torno de (u, v) com raio `diametro / 2`, na camada FURO_A ou FURO_B;
 * cada rasgo como retângulo fechado (u, v)–(u + comprimento, v + largura) na camada RASGO, e cada recorte na camada RECORTE; furos de BORDA (n, s, l, o)
 * não entram; um TEXTO com o nome da peça centrado em (X + largura/2, b + 0,02) com altura 0,02 m na camada TEXTO.
 * A saída termina em CRLF e passa em `dxfProblems2000` sem problemas. Lista sem peças não vazias: documento válido só com as camadas.
 */
export function dxfDasPecas(pecas: readonly PecaResolvida[], opcoes: OpcoesDxfPecas = {}): string {
  const espaco = opcoes.espaco ?? ESPACO_PADRAO;
  const segmentos = segmentosDoFuro(opcoes.segmentosDoFuro);
  const entidades: DxfDocEntity[] = [];
  let x = 0;
  let colocadas = 0;
  for (const p of pecas) {
    if (p.vazio) continue;
    if (colocadas > 0) x += espaco;
    const { largura, altura } = dimensoesDaPeca(p);
    const pontos = p.contorno !== null && p.contorno.length > 0
      ? contornoNaFolha(p.contorno, x)
      : retangulo(x, 0, largura, altura);
    entidades.push({ kind: 'polyline', layer: 'PECA', points: pontos, closed: true });
    entidades.push(...entidadesDasUsinagens(p, x, segmentos));
    entidades.push({ kind: 'text', layer: 'TEXTO', at: { x: x + largura / 2, y: altura + FOLGA_TEXTO }, height: ALTURA_TEXTO, text: p.nome, rotation: 0, centered: true });
    x += largura;
    colocadas += 1;
  }
  const doc: DxfDoc = { layers: CAMADAS, entities: entidades, units: 'mm' };
  return writeDxf2000(doc);
}
