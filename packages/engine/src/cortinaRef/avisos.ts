/**
 * Referência TS dos avisos da parede cortina (decisão 0056, §5.8): são MEDIDAS, não texto.
 * Códigos numéricos iguais aos de `esquema.rs` (`AVISO_CORTINA_*`). Fase 1: 1 a 5; 6 é `arco-nao-suportado` (reservado: a
 * referência não o emite). Fase 2: 7 (órfã de célula), 8 (órfã de linha), 9 (órfã de segmento), 10 (remoção que daria região
 * não retangular). Os três de órfã têm o mesmo nome do ADR (`cortina-override-orfao`), o código diz o tipo.
 * `cortina-sem-kernel` e `cortina-angulo-nao-suportado` não entram: o primeiro é do TS, o segundo é ENTRADA aqui.
 */
import { CURTAIN_MIN_CELL, EPS_CMP, ID_AUSENTE, at, type CortinaEntrada } from './tipos.ts';
import type { GradeResolvida } from './grade.ts';
import { ESTADO } from './remap.ts';
import { profundidadeDoPerfil, type Pecas } from './pecas.ts';

export const AVISO_CELULA_PEQUENA = 1;
export const AVISO_MONTANTE_SOBREPOSTO = 2;
export const AVISO_SOBRA_FUNDIDA = 3;
export const AVISO_POSICAO_FORA = 4;
export const AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL = 5;
export const AVISO_ARCO_NAO_SUPORTADO = 6;
export const AVISO_ORFA_CELULA = 7;
export const AVISO_ORFA_LINHA = 8;
export const AVISO_ORFA_SEGMENTO = 9;
export const AVISO_CELULA_NAO_RETANGULAR = 10;

export const NOMES_AVISO: Record<number, string> = {
  [AVISO_CELULA_PEQUENA]: 'cortina-celula-pequena',
  [AVISO_MONTANTE_SOBREPOSTO]: 'cortina-montante-sobreposto',
  [AVISO_SOBRA_FUNDIDA]: 'cortina-sobra-fundida',
  [AVISO_POSICAO_FORA]: 'cortina-posicao-fora',
  [AVISO_PROFUNDIDADE_MENOR_QUE_PERFIL]: 'cortina-profundidade-menor-que-perfil',
  [AVISO_ORFA_CELULA]: 'cortina-override-orfao',
  [AVISO_ORFA_LINHA]: 'cortina-override-orfao',
  [AVISO_ORFA_SEGMENTO]: 'cortina-override-orfao',
  [AVISO_CELULA_NAO_RETANGULAR]: 'cortina-celula-nao-retangular',
};

/**
 * `i`/`j`: índices; `ID_AUSENTE` onde não se aplica (aviso de eixo U traz só `i`, de eixo V só `j`). Órfã de linha: o índice
 * da linha gerada gravada, ou a posição (1 a n) da extra em `addedLines`, em `i` (eixo U) ou `j` (eixo V). Órfã de célula: a
 * chave gravada (`i`, `j`). Órfã de segmento: `i` = a linha gravada, `j` = `k`. Remoção não retangular: a célula do par.
 * Nas órfãs, `medido` = `s` e `limite` = `z` (m), como o Rust (`aviso_orfao` em `cortina_pecas.rs`).
 */
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

  // cortina-celula-pequena: menor lado LIVRE da região (região menos a meia largura dos montantes que a margeiam).
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

  // Sobrescritas órfãs (ADR §4.4, passo 5). Célula: a chave gravada, no ponto gravado (m).
  g.remap.celulas.forEach((r, ordem) => {
    if (r.estado === ESTADO.adotada) return;
    const chave = e.instancia?.cells?.[ordem]?.key;
    out.push({ codigo: AVISO_ORFA_CELULA, i: chave?.i ?? ID_AUSENTE, j: chave?.j ?? ID_AUSENTE, medido: r.px, limite: r.pz, s: r.px, z: r.pz });
  });
  // Linha: a sobrescrita de linha gerada que não se aplicou (fora do vão, ou perdeu uma disputa) e a linha extra que saiu do
  // vão. O índice da extra é a sua posição em `addedLines` (1 a n), como o Rust numera.
  const ordemDaExtra = (id: string): number => (e.instancia?.addedLines ?? []).findIndex((a) => a.id === id) + 1;
  const orfaLinha = (eixo: 'u' | 'v', indice: number, pos: number): AvisoCortina => ({
    codigo: AVISO_ORFA_LINHA, i: eixo === 'u' ? indice : ID_AUSENTE, j: eixo === 'v' ? indice : ID_AUSENTE,
    medido: eixo === 'u' ? pos : 0, limite: eixo === 'v' ? pos : 0, s: eixo === 'u' ? pos : 0, z: eixo === 'v' ? pos : 0,
  });
  (e.instancia?.lineOverrides ?? []).forEach((ov, ordem) => {
    const r = g.remap.linhas[ordem];
    if (!r || r.estado === ESTADO.adotada || 'added' in ov.line) return; // sobrescrita de linha extra: a órfã sai pela extra
    out.push(orfaLinha(ov.line.axis, ov.line.index, r.px));
  });
  for (const [eixo, ex] of [['u', g.u], ['v', g.v]] as const) {
    for (const x of ex.foraDoVao) out.push(orfaLinha(eixo, ordemDaExtra(x.id), x.pos));
  }
  // Segmento: a linha gravada (índice, ou a posição da extra) e o k. A posição segue o Rust: a linha em m, e o meio do
  // segmento no outro eixo.
  g.remap.segmentos.forEach((r, ordem) => {
    if (r.estado === ESTADO.adotada) return;
    const ref = e.instancia?.removedSegments?.[ordem];
    if (!ref) return;
    let eixo: 'u' | 'v';
    let indice: number;
    let posLinha: number;
    if ('added' in ref.line) {
      const idExtra = ref.line.added;
      eixo = (e.instancia?.addedLines ?? []).find((a) => a.id === idExtra)?.axis ?? 'u';
      indice = ordemDaExtra(idExtra);
      posLinha = 0;
    } else {
      eixo = ref.line.axis;
      indice = ref.line.index;
      posLinha = ref.line.pos * (eixo === 'u' ? g.L : g.H);
    }
    const meio = ref.mid * (eixo === 'u' ? g.H : g.L);
    const s = eixo === 'u' ? posLinha : meio;
    const z = eixo === 'u' ? meio : posLinha;
    out.push({ codigo: AVISO_ORFA_SEGMENTO, i: indice, j: ref.k, medido: s, limite: z, s, z });
  });

  // Remoção que daria região não retangular: ignorada (ADR §5.2). Ponto = centro da célula do par (como o Rust).
  for (const x of g.remocao.naoRetangulares) {
    out.push({
      codigo: AVISO_CELULA_NAO_RETANGULAR, i: x.i, j: x.j, medido: x.celulas, limite: x.area,
      s: (at(g.u.bordas, x.i) + at(g.u.bordas, x.i + 1)) / 2, z: (at(g.v.bordas, x.j) + at(g.v.bordas, x.j + 1)) / 2,
    });
  }

  out.sort((a, b) => a.codigo - b.codigo || a.i - b.i || a.j - b.j || a.medido - b.medido);
  return out;
}
