import type { Malha } from './malha.ts';
import type { CaminhoResolvido, PerfilResolvido } from './corposTipos.ts';
import { aneisDoPerfil, faixasLaterais, malhaVazia, tampa, type Mapa, type Ponto3 } from './corposMalhaApoio.ts';
import { alargamentoDaJunta, direcoesDoCaminho, dotV, mulV, quadrosDoCaminho, somaV, type V3 } from './corposQuadro.ts';

/*
 * Malha da varredura (CONTRATO.md §2.3 "Varredura"): anéis da seção ao longo do caminho com quadro móvel por transporte
 * paralelo (`corposQuadro.ts`), u seguindo N e v seguindo B. Cada ponto interior do caminho é uma junta de esquadro: o
 * anel fica no plano bissetor, alargado por 1/cos(φ/2) ao longo de `e`. Em arcos discretizados o ângulo é pequeno e o
 * esquadro vira praticamente a seção perpendicular à tangente. O anel é COMPARTILHADO pelas duas faixas vizinhas (malha
 * estanque); a normal do vértice vem do quadro bissetor. Tampas planas nas pontas (−T no início, +T no fim), com furos por
 * `triangulate`. Os furos do perfil viram túnel (tubo oco). Entrada inválida devolve malha vazia, sem lançar.
 */

export function malhaVarredura(perfil: PerfilResolvido, caminho: CaminhoResolvido): Malha {
  const m = malhaVazia();
  const pontos = caminho.pontos;
  const n = Math.floor(pontos.length / 3);
  if (n < 2 || !pontos.every(Number.isFinite)) return m;
  const quadros = quadrosDoCaminho(pontos);
  if (quadros.length !== n) return m;
  const dirs = direcoesDoCaminho(pontos);
  const aneis = aneisDoPerfil(perfil);
  if (aneis.length === 0) return m;

  const centro = (k: number): V3 => [pontos[k * 3]!, pontos[k * 3 + 1]!, pontos[k * 3 + 2]!];
  const levarEm =
    (k: number) =>
    (u: number, v: number): Ponto3 => {
      const q = quadros[k]!;
      let w = somaV(mulV(q.N, u), mulV(q.B, v));
      if (k > 0 && k < n - 1) {
        const { fator, e } = alargamentoDaJunta(dirs, k);
        w = somaV(w, mulV(e, (fator - 1) * dotV(w, e)));
      }
      return somaV(centro(k), w);
    };
  const mapa: Mapa = (u, v, nu, nv, k) => {
    const q = quadros[k]!;
    return { p: levarEm(k)(u, v), n: somaV(mulV(q.N, nu), mulV(q.B, nv)) };
  };
  const cortes = Array.from({ length: n }, (_, k) => k);
  for (const anel of aneis) faixasLaterais(m, anel, cortes, false, mapa);
  const primeiro = quadros[0]!;
  const ultimo = quadros[n - 1]!;
  tampa(m, aneis, levarEm(0), [-primeiro.T[0], -primeiro.T[1], -primeiro.T[2]]);
  tampa(m, aneis, levarEm(n - 1), ultimo.T);
  return m;
}
