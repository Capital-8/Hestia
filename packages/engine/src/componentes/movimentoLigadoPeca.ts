import type { Component, Project } from '@hestia/model';
import { posicionarConexao, type PosicaoConexao } from './posicaoConexao.ts';
import { resolverNo, type TipoParaNo, type TrechoNo } from './resolvedorNo.ts';
import { regrasDoTubo, tipoDaFamiliaDeTubo } from './tiposTubulacao.ts';
import type { LigacaoNoMundo } from './ligacoesEncaixe.ts';
import { dotV, type TuboLido, type V3 } from './movimentoLigadoRede.ts';

/*
 * Re-resolução de uma conexão (joelho, tê, luva, redução) cujos tubos mudaram de direção no movimento (ficha F4). Usa o MESMO
 * resolvedor de nó e o MESMO `posicionarConexao` da ferramenta Tubo: o ângulo novo precisa de uma peça da mesma família que a que está
 * no projeto (o Mover não troca peças nem cria conexão nova); fora disso a peça não acompanha e o chamador desfaz a ligação.
 */

/** Tubo ligado a uma porta da peça: a porta (no mundo), o tubo e a direção unitária do centro do nó rumo ao outro extremo dele. */
export interface PernaDaPeca {
  porta: LigacaoNoMundo;
  tubo: TuboLido;
  dir: V3;
}

export type ResultadoPeca = { ok: true; pos: PosicaoConexao; recuos: number[] } | { ok: false; motivo: string };

const falha = (motivo: string): ResultadoPeca => ({ ok: false, motivo });

/**
 * Posiciona a peça `peca` no `centro` (m) para os tubos `pernas` (na ordem das portas da família). `portas` são TODAS as portas da
 * peça: toda porta precisa ter tubo (peça com saída aberta ou ligada a outra peça não acompanha ângulo novo). `recuos` (m, com sinal)
 * saem na mesma ordem de `pernas`.
 */
export function resolverPecaDoMovimento(p: Project, peca: Component, centro: V3, pernas: readonly PernaDaPeca[], portas: readonly LigacaoNoMundo[]): ResultadoPeca {
  if (pernas.length !== portas.length || pernas.length < 2 || pernas.length > 3) return falha('a conexão tem saída aberta, é um tampão ou está ligada a outra conexão: ela não acompanha o ângulo novo.');
  const primeiro = pernas[0];
  const regras = primeiro ? regrasDoTubo(primeiro.tubo.c.familyId, primeiro.porta.dominio) : null;
  if (!primeiro || !regras) return falha('este tipo de tubulação não tem conexões automáticas para o ângulo novo.');
  const tipoT = tipoDaFamiliaDeTubo(primeiro.tubo.c.familyId);
  const tipo: TipoParaNo = { regras, bitolas: tipoT?.bitolas ?? null, ...(tipoT ? { linha: tipoT.linha, trechoMinimoEntreConexoes: tipoT.trechoMinimoEntreConexoes, paresDiretos: tipoT.paresDiretos } : {}) };
  const dnDe = (q: PernaDaPeca): number => (q.tubo.dn > 0 ? q.tubo.dn : q.porta.diametro * 1000);
  const trecho = (q: PernaDaPeca): TrechoNo => ({ direcao: q.dir, dn: dnDe(q) });
  // Ordens candidatas dos tubos para o resolvedor. `posicionarConexao` casa as portas por permutação (a primeira que serve), então a ordem
  // que casa cada tubo com a porta onde ele JÁ está ligado é a que passa na conferência de `mesmaPorta` abaixo.
  let ordens: PernaDaPeca[][];
  if (pernas.length === 2) {
    ordens = [[pernas[0] as PernaDaPeca, pernas[1] as PernaDaPeca], [pernas[1] as PernaDaPeca, pernas[0] as PernaDaPeca]];
  } else {
    // Tê e junção: o principal é o par de portas mais opostas entre si; o ramal é a restante (ordem do resolvedor: principal, principal, ramal).
    let melhor: [number, number, number] = [0, 1, 2];
    let menor = Infinity;
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]] as const) {
      const pi = pernas[i];
      const pj = pernas[j];
      const d = pi && pj ? dotV(pi.porta.direcaoMundo, pj.porta.direcaoMundo) : 2;
      if (d < menor - 1e-9) { menor = d; melhor = [i, j, k]; }
    }
    const [a, b, r] = melhor.map((i) => pernas[i]) as [PernaDaPeca, PernaDaPeca, PernaDaPeca];
    ordens = [[a, b, r], [b, a, r]];
  }
  const familia = p.componentFamilies?.[peca.familyId];
  let motivo = 'a conexão não casa com o ângulo novo.';
  for (const ordem of ordens) {
    const no: Parameters<typeof resolverNo>[0]['no'] = ordem.length === 2
      ? { tipo: 'encontro', trechos: [trecho(ordem[0] as PernaDaPeca), trecho(ordem[1] as PernaDaPeca)] }
      : { tipo: 'derivacao', principal: { rumoA: (ordem[0] as PernaDaPeca).dir, rumoB: (ordem[1] as PernaDaPeca).dir, dn: dnDe(ordem[0] as PernaDaPeca) }, ramal: trecho(ordem[2] as PernaDaPeca) };
    const sol = resolverNo({ tipo, no, ...(p.componentFamilies ? { familias: p.componentFamilies } : {}) });
    if (sol.status === 'sem_solucao') return falha(sol.motivo);
    if (sol.status !== 'ok') return falha('o ângulo novo pede outra conexão (ou nenhuma) e o Mover não troca nem cria peças.');
    if (sol.conexao.familiaId !== peca.familyId) return falha(`o ângulo novo pede outra conexão (${sol.conexao.familiaId}) e o Mover não troca peças.`);
    const pos = familia ? posicionarConexao(familia, centro, sol.conexao) : null;
    if (!pos) { motivo = 'a conexão não casa com o ângulo novo.'; continue; }
    if (!ordem.every((q, k) => pos.ligacoes[k] === q.porta.id)) { motivo = 'a conexão ficaria com as bocas trocadas para o ângulo novo.'; continue; }
    return { ok: true, pos, recuos: pernas.map((q) => pos.recuosComSinal[ordem.indexOf(q)] ?? 0) };
  }
  return falha(motivo);
}
