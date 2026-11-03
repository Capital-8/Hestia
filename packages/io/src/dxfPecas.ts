import type { PecaResolvida } from '@hestia/engine';

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
  void pecas;
  void opcoes;
  throw new Error('não implementado: ficha E6-dxf');
}
