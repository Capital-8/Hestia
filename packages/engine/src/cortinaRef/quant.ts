/**
 * Referência TS dos quantitativos da parede cortina (decisão 0056, §5.7), no formato de `quant_cortina` (§6.3):
 * linhas `[cortina_num, papel, tipo_num, material_num, n]` e `[comprimento, area, area_liquida, volume]`.
 * Convenção desta referência (o ADR não fixa as colunas por papel):
 *  - montante (papéis 0 a 5): `n` = peças, `comprimento` = soma dos comprimentos (já aparados), `area` = `area_liquida` =
 *    comprimento × largura vista, `volume` = comprimento × área do perfil;
 *  - painel (10 vidro, 11 sólido, 12 vazio): `n` = painéis, `comprimento` = 0, `area` = área BRUTA (retângulo livre mais
 *    `bite`), `area_liquida` = área visível (retângulo livre), `volume` = área bruta × espessura (vazio: 0);
 *    no vazio `area` = `area_liquida` = o vão livre;
 *  - sistema (papel 20, `tipo_num` e `material_num` = 0): `n` = 1, `comprimento` = L, `area` = `area_liquida` = L × H, `volume` = 0.
 * Massa não entra: o TS agrega (volume × densidade).
 */
import type { CortinaEntrada } from './tipos.ts';
import { PAPEL_SISTEMA, type Pecas } from './pecas.ts';

export interface LinhaQuant {
  papel: number;
  tipoNum: number;
  materialNum: number;
  n: number;
  comprimento: number;
  area: number;
  areaLiquida: number;
  volume: number;
}

export function calcularQuant(e: CortinaEntrada, p: Pecas): LinhaQuant[] {
  const mapa = new Map<string, LinhaQuant>();
  const linha = (papel: number, tipoNum: number, materialNum: number): LinhaQuant => {
    const k = `${papel}/${tipoNum}/${materialNum}`;
    let l = mapa.get(k);
    if (!l) { l = { papel, tipoNum, materialNum, n: 0, comprimento: 0, area: 0, areaLiquida: 0, volume: 0 }; mapa.set(k, l); }
    return l;
  };
  for (const m of p.montantes) {
    const l = linha(m.papel, m.tipoNum, m.materialNum);
    l.n += 1;
    l.comprimento += m.comprimento;
    l.area += m.comprimento * m.largura;
    l.areaLiquida += m.comprimento * m.largura;
    l.volume += m.comprimento * m.areaPerfil;
  }
  for (const c of p.paineis) {
    const l = linha(c.papel, c.tipoNum, c.materialNum);
    l.n += 1;
    l.area += c.areaBruta;
    l.areaLiquida += c.areaVisivel;
    l.volume += c.volume;
  }
  const s = linha(PAPEL_SISTEMA, 0, 0);
  s.n = 1;
  s.comprimento = e.L;
  s.area = e.L * e.H;
  s.areaLiquida = e.L * e.H;
  return [...mapa.values()].sort((a, b) => a.papel - b.papel || a.tipoNum - b.tipoNum || a.materialNum - b.materialNum);
}
