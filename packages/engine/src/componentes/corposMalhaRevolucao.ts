import type { Malha } from './malha.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import { aneisDoPerfil, faixasLaterais, malhaVazia, tampa, type Mapa, type Pt2 } from './corposMalhaApoio.ts';

/*
 * Malha da revolução (CONTRATO.md §2.3 "Revolução"): o perfil no plano XZ, u = distância ao eixo Z (≥ 0), v = z; gira em
 * torno de Z, anti-horário visto de +Z. Em 360° o sólido fecha sem tampas; abaixo de 360° há duas tampas planas, uma em
 * cada extremo. `segmentos` é o número de passos para o ângulo informado (a conversão do padrão por volta fica com quem
 * chama). Pontos com u = 0 geram triângulos de área nula, que são omitidos.
 *
 * `posicionarPerfilRevolucao` aplica a regra de `afastamento` (CONTRATO §2.3): perfis centrados encostam no eixo
 * (menor u = afastamento); `poligono` usa u literal mais o afastamento. Entrada inválida devolve malha vazia, sem lançar.
 */

const DOIS_PI = 2 * Math.PI;
const TOLERANCIA_ANGULO = 1e-9;

const mapaRevolucao: Mapa = (u, v, nu, nv, t) => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { p: [u * c, u * s, v], n: [nu * c, nu * s, nv] };
};

export function malhaRevolucao(perfil: PerfilResolvido, anguloRad: number, segmentos: number): Malha {
  const m = malhaVazia();
  const passos = Math.round(segmentos);
  if (!(anguloRad > 0) || anguloRad > DOIS_PI + TOLERANCIA_ANGULO || !Number.isFinite(passos) || passos < 1) return m;
  const cheio = anguloRad >= DOIS_PI - TOLERANCIA_ANGULO;
  if (cheio && passos < 3) return m;
  const cortes: number[] = [];
  if (cheio) {
    for (let k = 0; k < passos; k++) cortes.push((DOIS_PI * k) / passos);
  } else {
    for (let k = 0; k <= passos; k++) cortes.push((anguloRad * k) / passos);
  }
  const aneis = aneisDoPerfil(perfil);
  for (const anel of aneis) faixasLaterais(m, anel, cortes, cheio, mapaRevolucao);
  if (!cheio) tampasDosExtremos(m, aneis, cortes[0]!, cortes[cortes.length - 1]!);
  return m;
}

/** Tampas planas em θ0 (normal −tangente) e em θ1 (normal +tangente), com a seção girada para cada ângulo. */
function tampasDosExtremos(m: Malha, aneis: Pt2[][], t0: number, t1: number): void {
  const levarEm = (t: number) => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return (u: number, v: number): [number, number, number] => [u * c, u * s, v];
  };
  tampa(m, aneis, levarEm(t0), [Math.sin(t0), -Math.cos(t0), 0]);
  tampa(m, aneis, levarEm(t1), [-Math.sin(t1), Math.cos(t1), 0]);
}

export type ResultadoPosicao = { ok: true; perfil: PerfilResolvido } | { ok: false; erro: string };

/**
 * Posiciona o perfil para a revolução: `centrado` (todos menos `poligono`) desloca em u para que o menor u do externo seja
 * `afastamento`; senão soma `afastamento` a cada u. `afastamento` em metros. Qualquer u final negativo é erro.
 */
export function posicionarPerfilRevolucao(perfil: PerfilResolvido, afastamento: number, centrado: boolean): ResultadoPosicao {
  if (!Number.isFinite(afastamento) || afastamento < 0) return { ok: false, erro: 'afastamento não pode ser negativo' };
  const minimoExterno = menorU(perfil.externo);
  const deslocamento = centrado ? afastamento - minimoExterno : afastamento;
  const externo = deslocar(perfil.externo, deslocamento);
  const furos = perfil.furos.map((f) => deslocar(f, deslocamento));
  const cruza = [externo, ...furos].some((plano) => menorU(plano) < -1e-12);
  if (cruza) return { ok: false, erro: 'perfil de revolução cruza o eixo' };
  return { ok: true, perfil: { externo, furos } };
}

function menorU(plano: number[]): number {
  let menor = Infinity;
  for (let i = 0; i < plano.length; i += 2) menor = Math.min(menor, plano[i] ?? Infinity);
  return Number.isFinite(menor) ? menor : 0;
}

function deslocar(plano: number[], du: number): number[] {
  return plano.map((valor, i) => (i % 2 === 0 ? valor + du : valor));
}

