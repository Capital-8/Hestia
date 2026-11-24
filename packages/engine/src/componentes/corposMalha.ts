import { LIMITES_CORPO } from '@hestia/model';
import type { Malha, MalhasDasPecas } from './malha.ts';
import type { CorpoResolvido } from './corposTipos.ts';
import { malhaVazia } from './corposMalhaApoio.ts';
import { malhaExtrusao } from './corposMalhaExtrusao.ts';
import { malhaRevolucao, posicionarPerfilRevolucao } from './corposMalhaRevolucao.ts';
import { malhaTransicao } from './corposMalhaTransicao.ts';
import { malhaVarredura } from './corposMalhaVarredura.ts';

/*
 * Agregador das malhas dos corpos (CONTRATO.md §2.3 "Malha"): despacha as quatro formas (extrusão, revolução, varredura,
 * transição), aplica o quadro do corpo (`p_familia = R · p_corpo + origem`, `rotacao` em 9 números por linha; as normais só
 * giram) e separa `solidas` e `vazios`. `pecaDoTriangulo` aponta o ÍNDICE DO CORPO na lista de entrada.
 *
 * Revolução: o afastamento do eixo vem de `afastamento` (m, 0 por padrão) e `centradoNoEixo` em `FormaCorpoResolvida`
 * (corposTipos.ts), resolvido por `posicionarPerfilRevolucao` (A5).
 *
 * Erros (perfil de revolução que cruza o eixo, transição com furos, estouro de `triangulosPorCorpo`) NÃO lançam e NÃO
 * geram malha gigante: o corpo é omitido e a mensagem entra em `erros` (prefixo `corpos[id]`). O retorno é compatível com
 * `MalhasDasPecas`.
 */

export interface MalhasDosCorpos extends MalhasDasPecas {
  erros: string[];
}

type Resultado = { ok: true; malha: Malha } | { ok: false; erro: string };

function malhaDoCorpo(corpo: CorpoResolvido): Resultado {
  const f = corpo.forma;
  switch (f.tipo) {
    case 'extrusao':
      return { ok: true, malha: malhaExtrusao(f.perfil, f.comprimento) };
    case 'revolucao': {
      const p = posicionarPerfilRevolucao(f.perfil, f.afastamento ?? 0, f.centradoNoEixo ?? false);
      if (!p.ok) return { ok: false, erro: p.erro };
      return { ok: true, malha: malhaRevolucao(p.perfil, f.angulo, f.segmentos) };
    }
    case 'varredura':
      return { ok: true, malha: malhaVarredura(f.perfil, f.caminho) };
    case 'transicao':
      if (f.perfilA.furos.length > 0 || f.perfilB.furos.length > 0) return { ok: false, erro: 'transição não aceita perfil com furos' };
      return { ok: true, malha: malhaTransicao(f.perfilA, f.perfilB, f.comprimento, f.desvio) };
  }
}

function acrescentar(destino: Malha, origem: Malha, corpo: CorpoResolvido, indice: number): void {
  const r = corpo.rotacao;
  const g = (k: number): number => r[k] ?? (k % 4 === 0 ? 1 : 0);
  const base = destino.positions.length / 3;
  for (let i = 0; i < origem.positions.length; i += 3) {
    const x = origem.positions[i]!;
    const y = origem.positions[i + 1]!;
    const z = origem.positions[i + 2]!;
    destino.positions.push(
      g(0) * x + g(1) * y + g(2) * z + corpo.origem[0],
      g(3) * x + g(4) * y + g(5) * z + corpo.origem[1],
      g(6) * x + g(7) * y + g(8) * z + corpo.origem[2],
    );
    const nx = origem.normals[i]!;
    const ny = origem.normals[i + 1]!;
    const nz = origem.normals[i + 2]!;
    destino.normals.push(g(0) * nx + g(1) * ny + g(2) * nz, g(3) * nx + g(4) * ny + g(5) * nz, g(6) * nx + g(7) * ny + g(8) * nz);
  }
  for (const idx of origem.indices) destino.indices.push(base + idx);
  for (let t = 0; t < origem.indices.length / 3; t++) destino.pecaDoTriangulo.push(indice);
}

export function malhaDosCorpos(corpos: CorpoResolvido[]): MalhasDosCorpos {
  const solidas = malhaVazia();
  const vazios = malhaVazia();
  const erros: string[] = [];
  corpos.forEach((corpo, indice) => {
    const r = malhaDoCorpo(corpo);
    if (!r.ok) {
      erros.push(`corpos[${corpo.id}]: ${r.erro}`);
      return;
    }
    const triangulos = r.malha.indices.length / 3;
    if (triangulos > LIMITES_CORPO.triangulosPorCorpo) {
      erros.push(`corpos[${corpo.id}]: ${triangulos} triângulos passam do limite de ${LIMITES_CORPO.triangulosPorCorpo}`);
      return;
    }
    acrescentar(corpo.vazio ? vazios : solidas, r.malha, corpo, indice);
  });
  return { solidas, vazios, erros };
}
