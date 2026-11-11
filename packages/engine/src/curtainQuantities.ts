// Quantitativos da parede cortina (decisão 0056, §5.7). TS só agrega o que `quant_cortina` (consulta 104) devolve: a conta
// das peças é do Rust (`cortina_quant.rs`), e a massa e o custo ficam em `curtainSchedule.ts`, que conhece os preços.
// Sem kernel não há linhas, e a tabela não mostra zero no lugar do que não foi calculado.

import type { LinhaQuantCortina } from './kernelCortinaConsultas.ts';
import { PAPEL_QUANT_CORTINA } from './kernelCortinaTabelas.ts';

/** Resumo de uma cortina (chave: `cortina_num` do adaptador). Áreas em m², comprimentos em m, volumes em m³. */
export interface ResumoCortina {
  cortina: number;
  /** Comprimento do sistema (L) e área bruta do sistema (L × H). */
  comprimento: number;
  areaSistema: number;
  /** Vidro: área bruta (retângulo livre mais o encaixe) e visível (retângulo livre), em m². */
  vidroBruta: number;
  vidroVisivel: number;
  /** Chapa sólida (área bruta) e vão vazio (área do vão), em m². */
  areaSolida: number;
  areaVazia: number;
  /** Montantes: metros lineares total, por papel e por tipo de montante; contagem e volume. */
  metrosMontante: number;
  metrosPorPapel: Map<number, number>;
  metrosPorTipo: Map<number, number>;
  quantidadeMontantes: number;
  volumeMontantes: number;
  /** Painéis: contagem, área bruta por tipo de painel, e volume. */
  quantidadePaineis: number;
  areaBrutaPorTipoPainel: Map<number, number>;
  volumePaineis: number;
}

const ehMontante = (papel: number): boolean => papel <= PAPEL_QUANT_CORTINA.bordaTopo;
const ehPainel = (papel: number): boolean => papel === PAPEL_QUANT_CORTINA.painelVidro || papel === PAPEL_QUANT_CORTINA.painelSolido || papel === PAPEL_QUANT_CORTINA.painelVazio;

const vazio = (cortina: number): ResumoCortina => ({
  cortina,
  comprimento: 0,
  areaSistema: 0,
  vidroBruta: 0,
  vidroVisivel: 0,
  areaSolida: 0,
  areaVazia: 0,
  metrosMontante: 0,
  metrosPorPapel: new Map(),
  metrosPorTipo: new Map(),
  quantidadeMontantes: 0,
  volumeMontantes: 0,
  quantidadePaineis: 0,
  areaBrutaPorTipoPainel: new Map(),
  volumePaineis: 0,
});

const soma = (m: Map<number, number>, chave: number, valor: number): void => {
  m.set(chave, (m.get(chave) ?? 0) + valor);
};

/**
 * Agrega as linhas de `quant_cortina` por cortina. Ordem crescente de `cortina_num`. Montante: `comprimento` é o metro
 * linear, `area` a área vista, `volume` o volume do perfil. Painel: `area` é a bruta, `area_liquida` a visível.
 */
export function resumirCortinas(linhas: readonly LinhaQuantCortina[]): ResumoCortina[] {
  const porCortina = new Map<number, ResumoCortina>();
  for (const l of linhas) {
    const r = porCortina.get(l.cortina) ?? vazio(l.cortina);
    porCortina.set(l.cortina, r);
    if (l.papel === PAPEL_QUANT_CORTINA.sistema) {
      r.comprimento = l.comprimento;
      r.areaSistema = l.area;
    } else if (ehMontante(l.papel)) {
      r.metrosMontante += l.comprimento;
      r.quantidadeMontantes += l.n;
      r.volumeMontantes += l.volume;
      soma(r.metrosPorPapel, l.papel, l.comprimento);
      soma(r.metrosPorTipo, l.tipo, l.comprimento);
    } else if (ehPainel(l.papel)) {
      r.quantidadePaineis += l.n;
      r.volumePaineis += l.volume;
      soma(r.areaBrutaPorTipoPainel, l.tipo, l.area);
      if (l.papel === PAPEL_QUANT_CORTINA.painelVidro) {
        r.vidroBruta += l.area;
        r.vidroVisivel += l.areaLiquida;
      } else if (l.papel === PAPEL_QUANT_CORTINA.painelSolido) {
        r.areaSolida += l.area;
      } else {
        r.areaVazia += l.area;
      }
    }
  }
  return [...porCortina.values()].sort((a, b) => a.cortina - b.cortina);
}
