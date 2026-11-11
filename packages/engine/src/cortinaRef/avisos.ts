/**
 * Referência TS dos avisos da fase 1 da parede cortina (decisão 0056, §5.8): são MEDIDAS, não texto.
 * Códigos numéricos definidos aqui (o ADR deixa os valores para `esquema.rs`): alinhar com `AVISO_CORTINA_*` ou casar por nome.
 * `cortina-sem-kernel` e `cortina-angulo-nao-suportado` não entram: o primeiro é do TS, o segundo é ENTRADA aqui.
 */
import { CURTAIN_MIN_CELL, EPS_CMP, ID_AUSENTE, at, type CortinaEntrada } from './tipos.ts';
import type { GradeResolvida } from './grade.ts';
import { profundidadeDoPerfil, type Pecas } from './pecas.ts';

export const AVISO_CELULA_PEQUENA = 1;
export const AVISO_MONTANTE_SOBREPOSTO = 2;
export const AVISO_SOBRA_FUNDIDA = 3;
export const AVISO_POSICAO_FORA = 4;
export const AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL = 5;

export const NOMES_AVISO: Record<number, string> = {
  [AVISO_CELULA_PEQUENA]: 'cortina-celula-pequena',
  [AVISO_MONTANTE_SOBREPOSTO]: 'cortina-montante-sobreposto',
  [AVISO_SOBRA_FUNDIDA]: 'cortina-sobra-fundida',
  [AVISO_POSICAO_FORA]: 'cortina-posicao-fora',
  [AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL]: 'cortina-profundidade-menor-que-perfil',
};

/** `i`/`j`: índices de célula; `ID_AUSENTE` onde não se aplica (aviso de eixo U traz só `i`, de eixo V só `j`). */
export interface AvisoCortina {
  codigo: number;
  i: number;
  j: number;
  medido: number;
  limite: number;
  /** Posição no plano (s, z) em metros; a coordenada que não se aplica vai 0. */
  s: number;
  z: number;
}

export function calcularAvisos(e: CortinaEntrada, g: GradeResolvida, p: Pecas): AvisoCortina[] {
  const out: AvisoCortina[] = [];
  const minCell = e.tipo.minCell ?? CURTAIN_MIN_CELL;

  // cortina-celula-pequena: menor lado LIVRE da célula (célula menos a meia largura dos montantes que a margeiam).
  for (const c of p.paineis) {
    const menor = Math.min(c.larguraLivre, c.alturaLivre);
    if (menor < minCell - EPS_CMP) {
      const cel = g.celulas.find((x) => x.i === c.i && x.j === c.j)!;
      out.push({ codigo: AVISO_CELULA_PEQUENA, i: c.i, j: c.j, medido: menor, limite: minCell, s: (cel.s0 + cel.s1) / 2, z: (cel.z0 + cel.z1) / 2 });
    }
  }

  // cortina-montante-sobreposto: duas linhas vizinhas (bordas contam) cujos montantes se sobrepõem em largura.
  const sobrepostos = (eixo: 'u' | 'v'): void => {
    // posição do CENTRO de cada montante (a borda é embutida, então o centro dela fica a meia largura da ponta)
    const bordas = eixo === 'u' ? p.centrosU : p.centrosV;
    const w = eixo === 'u' ? p.largurasU : p.largurasV;
    for (let k = 0; k + 1 < bordas.length; k++) {
      if (!(at(w, k) > 0) || !(at(w, k + 1) > 0)) continue;
      const dist = at(bordas, k + 1) - at(bordas, k);
      const lim = (at(w, k) + at(w, k + 1)) / 2;
      if (dist < lim - EPS_CMP) {
        const meio = (at(bordas, k) + at(bordas, k + 1)) / 2;
        out.push({
          codigo: AVISO_MONTANTE_SOBREPOSTO, i: eixo === 'u' ? k : ID_AUSENTE, j: eixo === 'v' ? k : ID_AUSENTE,
          medido: dist, limite: lim, s: eixo === 'u' ? meio : 0, z: eixo === 'v' ? meio : 0,
        });
      }
    }
  };
  sobrepostos('u');
  sobrepostos('v');

  // Informativos do eixo: sobra fundida e posição manual fora do vão.
  for (const [eixo, ex] of [['u', g.u], ['v', g.v]] as const) {
    for (const a of ex.avisos) {
      out.push({
        codigo: a.codigo === 'sobra-fundida' ? AVISO_SOBRA_FUNDIDA : AVISO_POSICAO_FORA,
        i: eixo === 'u' ? a.indice : ID_AUSENTE, j: eixo === 'v' ? a.indice : ID_AUSENTE,
        medido: a.medido, limite: a.limite, s: eixo === 'u' ? a.pos : 0, z: eixo === 'v' ? a.pos : 0,
      });
    }
  }

  // cortina-profundidade-menor-que-perfil: perfil mais fundo que o sistema. `i` leva o `num` do tipo de montante.
  const vistos = new Set<number>();
  for (const t of e.montantes) {
    if (vistos.has(t.num)) continue;
    const usado = p.montantes.some((x) => x.tipoNum === t.num) || p.segmentos.some((x) => x.tipoNum === t.num);
    if (!usado) continue;
    vistos.add(t.num);
    const prof = profundidadeDoPerfil(t);
    if (prof > e.tipo.depth + EPS_CMP) out.push({ codigo: AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL, i: t.num, j: ID_AUSENTE, medido: prof, limite: e.tipo.depth, s: 0, z: 0 });
  }

  out.sort((a, b) => a.codigo - b.codigo || a.i - b.i || a.j - b.j || a.medido - b.medido);
  return out;
}
