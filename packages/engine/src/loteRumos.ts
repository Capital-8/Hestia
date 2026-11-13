import type { Vec2 } from '@hestia/geom';

/** Uma linha da tabela de rumos e distâncias: azimute (graus, a partir do norte verdadeiro, sentido horário) e distância (m). */
export interface LinhaRumo {
  azimute: number;
  distancia: number;
}

/** Erro de fechamento aceito sem a marca "fechar no primeiro ponto" (A.4 regra 19), em metros. */
export const TOLERANCIA_FECHAMENTO = 0.05;

const GRAU = Math.PI / 180;

export interface PoligonoDeRumos {
  /** Um ponto por linha da tabela: o inicial e os pontos intermediários. O último lado fecha no primeiro. */
  pontos: Vec2[];
  /** Último ponto calculado (o fim da última linha), que deveria coincidir com o primeiro. */
  ultimo: Vec2;
  /** Distância entre o último ponto calculado e o primeiro (m). */
  erroFechamento: number;
}

/**
 * Tabela de rumos → polígono (A.4 regra 19). Direção no projeto: ângulo a partir de +y, sentido horário, igual a `azimute − norteVerdadeiro`
 * (`norteVerdadeiro` em radianos, como em `Localizacao`). Com n linhas saem n pontos; o erro de fechamento mede o quanto a n-ésima linha
 * erra o primeiro ponto.
 */
export function rumosParaPoligono(inicio: Vec2, linhas: readonly LinhaRumo[], norteVerdadeiro = 0): PoligonoDeRumos {
  const pontos: Vec2[] = [{ ...inicio }];
  let atual: Vec2 = { ...inicio };
  for (const l of linhas) {
    const ang = l.azimute * GRAU - norteVerdadeiro;
    atual = { x: atual.x + l.distancia * Math.sin(ang), y: atual.y + l.distancia * Math.cos(ang) };
    pontos.push(atual);
  }
  const ultimo = pontos.pop() ?? { ...inicio };
  if (linhas.length === 0) pontos.push({ ...inicio });
  return { pontos, ultimo, erroFechamento: Math.hypot(ultimo.x - inicio.x, ultimo.y - inicio.y) };
}

/** A tabela pode ser aceita: erro ≤ 0,05 m ou o usuário marcou "fechar no primeiro ponto". */
export const fechamentoAceito = (erro: number, fecharNoPrimeiro: boolean): boolean => fecharNoPrimeiro || erro <= TOLERANCIA_FECHAMENTO;

/**
 * Polígono → tabela (o inverso, para exibir): comprimento e azimute (graus, [0, 360), a partir do norte verdadeiro) de cada lado, na ordem
 * dos lados do lote (o lado i vai de contorno[i] a contorno[i+1]; o último fecha no primeiro).
 */
export function poligonoParaRumos(contorno: readonly Vec2[], norteVerdadeiro = 0): LinhaRumo[] {
  return contorno.map((a, i) => {
    const b = contorno[(i + 1) % contorno.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const graus = (Math.atan2(dx, dy) + norteVerdadeiro) / GRAU;
    return { azimute: ((graus % 360) + 360) % 360, distancia: Math.hypot(dx, dy) };
  });
}
