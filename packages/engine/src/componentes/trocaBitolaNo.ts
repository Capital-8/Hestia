import { familiaDaBiblioteca, isComponent, type Component, type Familia, type Id } from '@hestia/model';
import { ligacaoNoMundo, ligacoesCompativeis } from './ligacoesEncaixe.ts';
import { resolverComponente } from './instancia.ts';
import { posicionarConexao, TOLERANCIA_ANGULO, type ConexaoEncontro, type PosicaoConexao, type TipoConexao } from './posicaoConexao.ts';
import { resolverNo } from './resolvedorNo.ts';
import { dnDaInstancia, dot, lerTubo, nega, pontaDe, posicionarPonta, semErrosNovos, soma, subtrai, tipoComDn, unitario } from './trocaBitolaGeometria.ts';
import type { Ctx, Tubo, V3 } from './trocaBitolaTipos.ts';

/*
 * Decisão por nó da troca de bitola (ficha B3). Para cada ponta do tubo trocado olha o que está ligado nela: outro tubo (ligação
 * direta) ou uma peça (joelho, tê, junção, luva, redução, tampão). Peça com tipo para a nova bitola muda de DN; senão, com redução no
 * tipo de tubulação, entra a redução (`resolverNo` devolve `ajustada` na curva); senão a peça sai, os tubos ficam com a ponta aberta e
 * o alerta explica. Tudo acumulado em `Ctx`; quem monta os comandos é `trocaBitola.ts`.
 */

type TipoPeca = TipoConexao | 'tampao';

const ROTULO: Record<TipoPeca, string> = { luva: 'Luva', curva90: 'Joelho 90°', curva45: 'Joelho 45°', reducao: 'Redução', te: 'Tê', juncao45: 'Junção 45°', tampao: 'Tampão' };

/** Perna da peça: uma ligação dela, para onde aponta (unitária, no mundo) e o que está ligado nela. */
interface Perna {
  idx: number;
  id: string;
  dir: V3;
  viz: Component | null;
  vizLig: string;
  vizTubo: Tubo | null;
  /** DN que a perna exige (mm): o do vizinho (o novo DN para o tubo trocado); `null` = ligação aberta. */
  dn: number | null;
  ehT: boolean;
}

const iguais = (x: number, y: number): boolean => Math.abs(x - y) <= 0.5;
const angulo = (u: V3, v: V3): number => (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
const tipoConexaoDe = (t: TipoPeca): TipoConexao => (t === 'tampao' ? 'luva' : t);

function familiaDe(ctx: Ctx, id: string): Familia | undefined {
  return ctx.p.componentFamilies?.[id] ?? familiaDaBiblioteca(id) ?? undefined;
}

/** Id novo e determinístico: `base`, ou `base_2`, `base_3`... se já existe no projeto ou no plano. */
function idNovo(ctx: Ctx, base: string): Id {
  let id = base;
  for (let i = 2; ctx.p.elements[id] !== undefined || ctx.usados.has(id); i++) id = `${base}_${i}`;
  ctx.usados.add(id);
  return id;
}

function adicionarPeca(ctx: Ctx, fam: Familia, base: string, pos: PosicaoConexao): Id {
  if (!ctx.p.componentFamilies?.[fam.id]) ctx.upserts.set(fam.id, structuredClone(fam));
  const id = idNovo(ctx, base);
  ctx.adicionar.push({ id, kind: 'component', familyId: fam.id, typeId: null, levelId: ctx.tubo.comp.levelId, x: pos.x, y: pos.y, z: pos.z, rotation: pos.rotation, inclinacao: pos.inclinacao, mirrored: false, values: pos.values, mark: '' });
  return id;
}

/** Agenda soltar a ligação `lig` de `a` (e a do outro lado), uma vez só por par. */
function soltar(ctx: Ctx, a: Id, lig: string): void {
  const e = ctx.p.elements[a];
  const cx = isComponent(e) ? e.ligacoes?.[lig] : undefined;
  if (!cx) return;
  const k1 = `${a}|${lig}`;
  const k2 = `${cx.componenteId}|${cx.ligacaoId}`;
  if (ctx.desfeitas.has(k1) || ctx.desfeitas.has(k2)) return;
  ctx.desfeitas.add(k1);
  ctx.desfeitas.add(k2);
  ctx.desconectar.push({ a, lig });
}

function dnDoVizinho(ctx: Ctx, viz: Component, vizLig: string, tubo: Tubo | null): number | null {
  if (tubo) return tubo.dn;
  const dn = dnDaInstancia(ctx.p, viz);
  if (dn !== null) return dn;
  const lig = resolverComponente(ctx.p, viz).ligacoes?.find((l) => l.id === vizLig);
  return lig ? Math.round(lig.diametro * 1000) : null;
}

function pernasDe(ctx: Ctx, peca: Component): Perna[] {
  return (resolverComponente(ctx.p, peca).ligacoes ?? []).map((l, idx) => {
    const w = ligacaoNoMundo(l, peca);
    const cx = peca.ligacoes?.[l.id];
    const e = cx ? ctx.p.elements[cx.componenteId] : undefined;
    const viz = isComponent(e) ? e : null;
    const ehT = viz?.id === ctx.tubo.comp.id;
    const vizTubo = viz && !ehT ? lerTubo(ctx.p, viz) : null;
    return { idx, id: l.id, dir: unitario(w.direcaoMundo), viz, vizLig: cx?.ligacaoId ?? '', vizTubo, ehT, dn: ehT ? ctx.novoDn : viz && cx ? dnDoVizinho(ctx, viz, cx.ligacaoId, vizTubo) : null };
  });
}

/** Qual peça é: pelo id nas regras do tipo de tubulação, senão pela geometria das pernas. */
function tipoDaPeca(ctx: Ctx, peca: Component, pernas: Perna[]): TipoPeca {
  for (const k of ['curva90', 'curva45', 'te', 'juncao45', 'luva', 'reducao'] as const) if (ctx.regras[k] === peca.familyId) return k;
  if (ctx.regras.tampao === peca.familyId || pernas.length === 1) return 'tampao';
  if (pernas.length >= 3) return 'te';
  const a = pernas[0];
  const b = pernas[1];
  if (!a || !b) return 'curva90';
  const ang = angulo(a.dir, b.dir);
  return ang >= 180 - TOLERANCIA_ANGULO ? 'luva' : ang < 112.5 ? 'curva90' : 'curva45';
}

/** Remove a peça: solta todas as ligações, apaga e alerta. `causa` completa "<peça> DN x removido: ...". */
function removerPeca(ctx: Ctx, peca: Component, pernas: Perna[], rotulo: string, dP: number, causa: string): void {
  const motivo = `${rotulo} DN ${dP} removido: ${causa}`;
  for (const l of pernas) {
    if (!l.viz) continue;
    soltar(ctx, peca.id, l.id);
    ctx.removidas.push({ elementId: l.viz.id, ligacaoId: l.vizLig, motivo });
  }
  ctx.apagar.push(peca.id);
  ctx.alertas.push({ codigo: 'conexao_removida', motivo, elementId: ctx.tubo.comp.id });
}

/** DN de cada ligação depois da troca, na ordem `ordem` das pernas (tê e junção: principal, principal, ramal); `null` se não há como. */
function arranjoDeDiametros(ctx: Ctx, pernas: Perna[], tipoP: TipoPeca): { ordem: number[]; diametros: number[] } | null {
  const n = ctx.novoDn;
  const dem = pernas.map((l) => l.dn);
  if (pernas.length === 1) return { ordem: [0], diametros: [n] };
  if (pernas.length === 2) {
    if (tipoP === 'reducao') return { ordem: [0, 1], diametros: dem.map((d) => d ?? n) };
    return dem.some((d) => d !== null && !iguais(d, n)) ? null : { ordem: [0, 1], diametros: [n, n] };
  }
  if (pernas.length !== 3) return null;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const a = pernas[i];
      const b = pernas[j];
      const k = 3 - i - j;
      if (!a || !b || dot(a.dir, b.dir) > -0.999) continue;
      const conhecidos = [dem[i], dem[j]].filter((d): d is number => d !== null && d !== undefined);
      const dp = conhecidos[0] ?? n;
      if (conhecidos.some((d) => !iguais(d, dp))) return null;
      return { ordem: [i, j, k], diametros: [dp, dp, dem[k] ?? dp] };
    }
  }
  return null;
}

/** A peça continua no nó e muda de DN (e de tipo, se há tipo para a bitola); reposiciona os recuos dos tubos ligados. */
function trocarDnDaPeca(ctx: Ctx, peca: Component, pernas: Perna[], tipoP: TipoPeca, dP: number, centro: V3): boolean {
  const fam = ctx.p.componentFamilies?.[peca.familyId];
  const arr = arranjoDeDiametros(ctx, pernas, tipoP);
  if (!fam || !arr || !fam.parametros.some((q) => q.id === 'DN')) return false;
  if (!arr.diametros.every((d) => iguais(d, arr.diametros[0] ?? d)) && !fam.parametros.some((q) => q.id === 'DN2')) return false;
  const conexao: ConexaoEncontro = { tipo: tipoConexaoDe(tipoP), familiaId: peca.familyId, direcoes: arr.ordem.map((i) => pernas[i]?.dir ?? [0, 0, 0]), diametros: arr.diametros };
  const pos = posicionarConexao(fam, centro, conexao);
  if (!pos) return false;
  const values = { ...(peca.values ?? {}), ...pos.values };
  const dnNovo = pos.values.DN ?? ctx.novoDn;
  const typeId = tipoComDn(fam, dnNovo) ?? peca.typeId;
  if (!semErrosNovos(fam, typeId, peca.values, values)) return false;
  const candidata: Component = { ...peca, typeId, values };
  const ligs = resolverComponente(ctx.p, candidata).ligacoes ?? [];
  for (const l of pernas) {
    if (!l.viz || l.ehT || l.vizTubo) continue;
    const minha = ligs.find((x) => x.id === l.id);
    const dele = resolverComponente(ctx.p, l.viz).ligacoes?.find((x) => x.id === l.vizLig);
    if (!minha || !dele || !ligacoesCompativeis(ligacaoNoMundo(minha, candidata), ligacaoNoMundo(dele, l.viz)).ok) return false;
  }
  ctx.atualizar.push({ id: peca.id, patch: { typeId, values } });
  ctx.trocadas.push({ elementId: peca.id, familiaAntes: peca.familyId, familiaDepois: peca.familyId, dnAntes: dP, dnDepois: dnNovo });
  arr.ordem.forEach((i, k) => {
    const l = pernas[i];
    const tubo = l?.ehT ? ctx.tubo : l?.vizTubo;
    if (!l || !tubo) return;
    posicionarPonta(ctx, tubo, pontaDe(tubo, l.vizLig), centro, pos.recuos[k] ?? 0);
    ctx.nos.push({ chave: peca.id, tuboId: tubo.comp.id, recuo: pos.recuos[k] ?? 0 });
  });
  return true;
}

/** A peça fica como está (na bitola `dP`) e uma redução dP → novo DN entra no trecho do tubo trocado, junto a ela. */
function reducaoJuntoDaPeca(ctx: Ctx, peca: Component, pernas: Perna[], minha: Perna, tipoP: TipoPeca, ponta: 'a' | 'b', dP: number, centro: V3): boolean {
  const n = ctx.novoDn;
  const famR = familiaDe(ctx, ctx.regras.reducao);
  if (!famR) return false;
  const conexaoR: ConexaoEncontro = { tipo: 'reducao', familiaId: famR.id, direcoes: [nega(minha.dir), minha.dir], diametros: [dP, n] };
  const pos0 = posicionarConexao(famR, centro, conexaoR);
  if (!pos0) return false;
  const famP = ctx.p.componentFamilies?.[peca.familyId];
  const posP = famP ? posicionarConexao(famP, centro, { tipo: tipoConexaoDe(tipoP), familiaId: peca.familyId, direcoes: pernas.map((l) => l.dir), diametros: pernas.map(() => dP) }) : null;
  const centroR = soma(centro, minha.dir, (posP?.recuos[minha.idx] ?? 0) + (pos0.recuos[0] ?? 0));
  const pos = posicionarConexao(famR, centroR, conexaoR);
  if (!pos) return false;
  const T = ctx.tubo;
  const ligT = ponta === 'a' ? T.idA : T.idB;
  const id = adicionarPeca(ctx, famR, `${T.comp.id}_red_${ponta}`, pos);
  soltar(ctx, T.comp.id, ligT);
  ctx.conectar.push({ a: id, la: pos.ligacoes[0] ?? '', b: peca.id, lb: minha.id }, { a: id, la: pos.ligacoes[1] ?? '', b: T.comp.id, lb: ligT });
  posicionarPonta(ctx, T, ponta, centroR, pos.recuos[1] ?? 0);
  ctx.nos.push({ chave: peca.id, tuboId: T.comp.id, recuo: pos.recuos[1] ?? 0 });
  ctx.reducoes.push({ elementId: id, familiaId: famR.id, dnMaior: Math.max(dP, n), dnMenor: Math.min(dP, n) });
  return true;
}

/** Peça reta (luva ou redução) entre DN diferentes: sai e entra uma redução no lugar. */
function substituirPorReducao(ctx: Ctx, peca: Component, pernas: Perna[], minha: Perna, outra: Perna, ponta: 'a' | 'b', dP: number, centro: V3): boolean {
  const n = ctx.novoDn;
  const famR = familiaDe(ctx, ctx.regras.reducao);
  const dO = outra.dn;
  if (!famR || dO === null || !outra.viz) return false;
  const pos = posicionarConexao(famR, centro, { tipo: 'reducao', familiaId: famR.id, direcoes: [outra.dir, minha.dir], diametros: [dO, n] });
  if (!pos) return false;
  const T = ctx.tubo;
  const ligT = ponta === 'a' ? T.idA : T.idB;
  const id = adicionarPeca(ctx, famR, `${T.comp.id}_red_${ponta}`, pos);
  for (const l of pernas) soltar(ctx, peca.id, l.id);
  ctx.apagar.push(peca.id);
  ctx.conectar.push({ a: id, la: pos.ligacoes[0] ?? '', b: outra.viz.id, lb: outra.vizLig }, { a: id, la: pos.ligacoes[1] ?? '', b: T.comp.id, lb: ligT });
  posicionarPonta(ctx, T, ponta, centro, pos.recuos[1] ?? 0);
  if (outra.vizTubo) posicionarPonta(ctx, outra.vizTubo, pontaDe(outra.vizTubo, outra.vizLig), centro, pos.recuos[0] ?? 0);
  ctx.nos.push({ chave: peca.id, tuboId: T.comp.id, recuo: pos.recuos[1] ?? 0 });
  ctx.trocadas.push({ elementId: peca.id, familiaAntes: peca.familyId, familiaDepois: famR.id, dnAntes: dP, dnDepois: n });
  ctx.reducoes.push({ elementId: id, familiaId: famR.id, dnMaior: Math.max(dO, n), dnMenor: Math.min(dO, n) });
  return true;
}

/** Peça ligada à ponta `ponta` do tubo trocado. */
function tratarPeca(ctx: Ctx, ponta: 'a' | 'b', peca: Component): void {
  const T = ctx.tubo;
  const n = ctx.novoDn;
  const ligT = ponta === 'a' ? T.idA : T.idB;
  const pernas = pernasDe(ctx, peca);
  const minha = pernas.find((l) => l.ehT && l.vizLig === ligT);
  if (!minha) return;
  const tipoP = tipoDaPeca(ctx, peca, pernas);
  const rotulo = ROTULO[tipoP];
  const outras = pernas.filter((l) => l !== minha);
  const outra = outras.find((l) => l.dn !== null);
  const dP = dnDaInstancia(ctx.p, peca) ?? outra?.dn ?? n;
  const centro: V3 = [peca.x, peca.y, peca.z];
  const forcado = ctx.forcados.get(peca.id);
  if (forcado !== undefined) return removerPeca(ctx, peca, pernas, rotulo, dP, forcado);
  if (trocarDnDaPeca(ctx, peca, pernas, tipoP, dP, centro)) return;
  const nome = rotulo.toLowerCase();
  const semRed = ctx.regras.reducao === '';
  const naoTem = `não existe ${nome} DN ${n} nem redução neste tipo de tubulação.`;
  if (pernas.length === 2 && outra && outra.dn !== null && !iguais(outra.dn, n)) {
    const dO = outra.dn;
    const sol = resolverNo({ tipo: ctx.tipo, familias: ctx.p.componentFamilies, no: { tipo: 'encontro', trechos: [{ direcao: outra.dir, dn: dO }, { direcao: minha.dir, dn: n }] } });
    if (sol.status === 'ajustada' && iguais(dP, dO) && reducaoJuntoDaPeca(ctx, peca, pernas, minha, tipoP, ponta, dP, centro)) return;
    if (sol.status === 'ok' && sol.conexao.tipo === 'reducao' && substituirPorReducao(ctx, peca, pernas, minha, outra, ponta, dP, centro)) return;
    const causa = sol.status === 'sem_solucao' && sol.codigo !== 'bitolas_diferentes_em_curva' && sol.codigo !== 'tipo_sem_peca' ? sol.motivo : `os trechos ligados ficam com DN ${dO} e DN ${n} e ${semRed ? 'este tipo de tubulação não tem redução' : 'a redução não pôde ser posicionada'}.`;
    return removerPeca(ctx, peca, pernas, rotulo, dP, causa);
  }
  if (pernas.length <= 2 && !semRed && !iguais(dP, n) && reducaoJuntoDaPeca(ctx, peca, pernas, minha, tipoP, ponta, dP, centro)) return;
  removerPeca(ctx, peca, pernas, rotulo, dP, semRed ? naoTem : `não existe ${nome} DN ${n} e a redução não pôde ser posicionada.`);
}

/** Outro tubo ligado direto: com DN diferente entra a redução; sem redução a ligação é desfeita e o usuário é avisado. */
function tratarDireto(ctx: Ctx, ponta: 'a' | 'b', viz: Tubo, vizLig: string): void {
  const T = ctx.tubo;
  const n = ctx.novoDn;
  if (iguais(viz.dn, n)) return;
  const ligT = ponta === 'a' ? T.idA : T.idB;
  const centro: V3 = ponta === 'a' ? T.a : T.b;
  const vPonta = pontaDe(viz, vizLig);
  const uT = unitario(subtrai(ponta === 'a' ? T.b : T.a, centro));
  const uV = unitario(subtrai(vPonta === 'a' ? viz.b : viz.a, centro));
  const chave = `direto:${T.comp.id}:${ponta}`;
  const desfazer = (causa: string): void => {
    const motivo = `Trechos de DN ${viz.dn} e DN ${n} ligados direto: ${causa}`;
    soltar(ctx, T.comp.id, ligT);
    ctx.removidas.push({ elementId: T.comp.id, ligacaoId: ligT, motivo });
    ctx.alertas.push({ codigo: 'bitolas_diferentes', motivo, elementId: T.comp.id });
  };
  const forcado = ctx.forcados.get(chave);
  if (forcado !== undefined) return desfazer(forcado);
  const sol = resolverNo({ tipo: ctx.tipo, familias: ctx.p.componentFamilies, no: { tipo: 'encontro', trechos: [{ direcao: uV, dn: viz.dn }, { direcao: uT, dn: n }] } });
  const fam = sol.status === 'ok' && sol.conexao.tipo === 'reducao' ? familiaDe(ctx, sol.conexao.familiaId) : undefined;
  const pos = fam && sol.status === 'ok' ? posicionarConexao(fam, centro, sol.conexao) : null;
  if (!fam || !pos) return desfazer(ctx.regras.reducao === '' ? 'este tipo de tubulação não tem redução, então a ligação foi removida.' : 'a redução não pôde ser posicionada, então a ligação foi removida.');
  const id = adicionarPeca(ctx, fam, `${T.comp.id}_red_${ponta}`, pos);
  soltar(ctx, T.comp.id, ligT);
  ctx.conectar.push({ a: id, la: pos.ligacoes[0] ?? '', b: viz.comp.id, lb: vizLig }, { a: id, la: pos.ligacoes[1] ?? '', b: T.comp.id, lb: ligT });
  posicionarPonta(ctx, T, ponta, centro, pos.recuos[1] ?? 0);
  posicionarPonta(ctx, viz, vPonta, centro, pos.recuos[0] ?? 0);
  ctx.nos.push({ chave, tuboId: T.comp.id, recuo: pos.recuos[1] ?? 0 }, { chave, tuboId: viz.comp.id, recuo: pos.recuos[0] ?? 0 });
  ctx.reducoes.push({ elementId: id, familiaId: fam.id, dnMaior: Math.max(viz.dn, n), dnMenor: Math.min(viz.dn, n) });
}

/** Trata o nó da ponta `ponta` ('a' início, 'b' fim) do tubo trocado. Ponta aberta não tem nada a fazer. */
export function tratarNo(ctx: Ctx, ponta: 'a' | 'b'): void {
  const T = ctx.tubo;
  const cx = T.comp.ligacoes?.[ponta === 'a' ? T.idA : T.idB];
  const e = cx ? ctx.p.elements[cx.componenteId] : undefined;
  if (!cx || !isComponent(e)) return;
  const tubo = lerTubo(ctx.p, e);
  if (tubo) tratarDireto(ctx, ponta, tubo, cx.ligacaoId);
  else tratarPeca(ctx, ponta, e);
}
