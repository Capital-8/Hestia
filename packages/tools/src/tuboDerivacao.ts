import { avaliarDerivacao, comprimentoDoSegmento, posicionarConexao, trechoDeTubo, type ConexaoEncontro, type PontoSegmento, type PosicaoConexao, type RegrasConexao, type TrechoEncontro } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, newId, type Id } from '@hestia/model';
import { extremosDoTubo, tuboSob, type PontoTubo } from './tuboGeometria.ts';
import type { ContextoTraco } from './tuboApoio.ts';
import type { ToolEnv } from './types.ts';

/*
 * Gravação das conexões do traçado de tubulação (extraído do `tuboTool.ts` na ficha F5): a peça de um encontro ou derivação, o aparo
 * das pontas na bolsa e a DIVISÃO do tubo sob um ponto do meio, com o tê ou a junção 45° e as ligações do tubo antigo preservadas.
 * Tudo roda dentro da transação do trecho (um passo de desfazer).
 */

/** Recuo (m) a aplicar numa ponta de trecho depois das conexões: o tubo entra na bolsa. */
export interface Aparo {
  id: Id;
  ponta: 'a' | 'b';
  recuo: number;
}

/** Instala a conexão `c` em `ponto` e liga cada boca ao trecho correspondente de `alvos` (mesma ordem de `c.direcoes`); null se faltar a família ou a geometria não casar. */
export function inserirConexao(env: ToolEnv, c: ConexaoEncontro, ponto: PontoSegmento, alvos: Array<{ componentId: Id; ligacaoId: string }>, avisos: string[]): PosicaoConexao | null {
  const fam = env.project().componentFamilies?.[c.familiaId];
  if (!fam) {
    avisos.push(`A família de conexão ${c.familiaId} não está no projeto: trechos ligados direto.`);
    return null;
  }
  const pos = posicionarConexao(fam, ponto, c);
  if (!pos) {
    avisos.push(`A família ${c.familiaId} não tem as ligações esperadas: trechos ligados direto.`);
    return null;
  }
  const cid = newId('cm');
  env.exec({ type: 'addComponent', component: { id: cid, kind: 'component', familyId: fam.id, typeId: pos.typeId ?? null, levelId: env.levelId(), x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' } });
  alvos.forEach((al, k) => env.exec({ type: 'connectComponents', a: cid, ligacaoA: pos.ligacoes[k] ?? '', b: al.componentId, ligacaoB: al.ligacaoId }));
  return pos;
}

/**
 * Derivação: divide o tubo sob `pt` em dois (o primeiro mantém o id e as ligações do início; o segundo leva a ligação do fim) e instala o
 * tê ou a junção ligando corrida, corrida e ramal. `minha` = ligação do trecho novo (`id`) que toca o meio. Os aparos entram em `aparos`.
 */
export function derivarNoMeio(env: ToolEnv, ctx: ContextoTraco, id: Id, minha: string, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, regras: RegrasConexao, aparos: Aparo[], avisos: string[]): void {
  const alvo = tuboSob(env.project(), ctx.familia.id, pt.xyz, 1e-6, 1e-6, id);
  if (!alvo) return;
  const { c: t, ext } = alvo;
  const r = avaliarDerivacao({ a: ext.a, b: ext.b, dn: ext.dn }, pt.xyz, novo, ponta, regras);
  const fam = r.conexao ? env.project().componentFamilies?.[r.conexao.familiaId] : undefined;
  if (!r.conexao || !fam || !posicionarConexao(fam, pt.xyz, r.conexao)) {
    avisos.push(r.aviso ?? 'Derivação sem a família de conexão no projeto: o trecho fica solto.');
    return;
  }
  const idT2 = newId('cm');
  const segundo = trechoDeTubo(pt.xyz, ext.b, ctx.familia, ext.dn, { id: idT2, levelId: t.levelId });
  if (!segundo) return;
  const primeiroL = comprimentoDoSegmento(ext.a, pt.xyz) * 1000;
  const antigoFim = t.ligacoes?.[ext.idB];
  env.exec({ type: 'addComponent', component: { ...segundo, values: { ...t.values, L: comprimentoDoSegmento(pt.xyz, ext.b) * 1000 } } });
  if (antigoFim) env.exec({ type: 'disconnectComponents', a: t.id, ligacaoA: ext.idB });
  env.exec({ type: 'updateComponent', id: t.id, patch: { values: { ...t.values, L: primeiroL } } });
  if (antigoFim) env.exec({ type: 'connectComponents', a: idT2, ligacaoA: ext.idB, b: antigoFim.componenteId, ligacaoB: antigoFim.ligacaoId });
  const pos = inserirConexao(env, r.conexao, pt.xyz, [{ componentId: t.id, ligacaoId: ext.idB }, { componentId: idT2, ligacaoId: ext.idA }, { componentId: id, ligacaoId: minha }], avisos);
  if (pos) aparos.push({ id: t.id, ponta: 'b', recuo: pos.recuos[0] ?? 0 }, { id: idT2, ponta: 'a', recuo: pos.recuos[1] ?? 0 }, { id, ponta, recuo: pos.recuos[2] ?? 0 });
}

/** Encurta a ponta `ponta` do trecho `id` em `recuo` (m) rumo à outra ponta; recuo maior que o trecho é ignorado com aviso. */
export function aparar(env: ToolEnv, id: Id, ponta: 'a' | 'b', recuo: number, avisos: string[]): void {
  if (recuo < 1e-9) return;
  const projeto = env.project();
  const c = projeto.elements[id];
  const ext = isComponent(c) ? extremosDoTubo(projeto, c) : null;
  if (!isComponent(c) || !ext) return;
  const total = comprimentoDoSegmento(ext.a, ext.b);
  if (recuo >= total - 1e-4) {
    avisos.push('Trecho curto demais para a bolsa da conexão: ele não foi encurtado.');
    return;
  }
  const k = recuo / total;
  const de = ponta === 'a' ? ext.a : ext.b;
  const para = ponta === 'a' ? ext.b : ext.a;
  const novo: PontoSegmento = [de[0] + (para[0] - de[0]) * k, de[1] + (para[1] - de[1]) * k, de[2] + (para[2] - de[2]) * k];
  const a = ponta === 'a' ? novo : ext.a;
  const b = ponta === 'a' ? ext.b : novo;
  const t = trechoDeTubo(a, b, { id: c.familyId }, ext.dn, { id, levelId: c.levelId });
  if (!t) return;
  env.exec({ type: 'updateComponent', id, patch: { x: t.x, y: t.y, z: t.z, rotation: t.rotation, inclinacao: t.inclinacao, values: { ...c.values, L: (total - recuo) * 1000 } } });
}

/**
 * Grava no projeto (dentro da transação do trecho) a família de tubo vinda da biblioteca MEP e, só então, as famílias de conexão do
 * domínio. Projeto que já tem o tubo (inclusive fixtures) não ganha conexões novas por trás.
 */
export function garantirFamilias(env: ToolEnv, ctx: ContextoTraco, regras: RegrasConexao | null, derivando = false): void {
  // Derivação (ficha F5) pede o tê, a junção e a redução mesmo num projeto cujo tubo já existe sem elas (tubo da paleta).
  if (!derivando && env.project().componentFamilies?.[ctx.familia.id] !== undefined) return;
  const ids = new Set<string>([ctx.familia.id, ...(regras ? Object.values(regras) : [])]);
  for (const id of ids) {
    if (env.project().componentFamilies?.[id] !== undefined) continue;
    const f = familiaDaBiblioteca(id);
    if (f) env.exec({ type: 'upsertFamily', family: structuredClone(f) });
  }
}
