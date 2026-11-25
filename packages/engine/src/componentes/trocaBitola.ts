import { isComponent, type Id, type Project } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import { trechoDeTubo } from './orientarSegmento.ts';
import { type RegrasConexao } from './posicaoConexao.ts';
import { bitolasDoTubo, bitolaPermitida, regrasDoTubo, tipoDaFamiliaDeTubo } from './tiposTubulacao.ts';
import { listarProblemasDeViabilidade } from './viabilidadeNo.ts';
import { entradasDeViabilidade, estadoDe, extremosFinais, lerTubo, semErrosNovos, tipoComDn } from './trocaBitolaGeometria.ts';
import { tratarNo } from './trocaBitolaNo.ts';
import type { Comando, Ctx, EstadoTubo, PlanoTrocaBitola, RecusaTroca, Tubo } from './trocaBitolaTipos.ts';

export type { AlertaTroca, CodigoAlertaTroca, Comando, ConexaoRemovida, ConexaoTrocada, PlanoTrocaBitola, RecusaTroca, ReducaoInserida } from './trocaBitolaTipos.ts';

/*
 * Troca de bitola de um tubo já traçado (fase 3, ficha B3). `planejarTrocaDeBitola` é PURO e determinístico: lê o projeto, não grava
 * nada e devolve o plano. Passos:
 *  1. Recusa, sem mudar nada, DN fora da lista do tipo de tubulação (ou que a família do tubo não tem);
 *  2. nas DUAS pontas do tubo, decide o nó (`trocaBitolaNo.ts`): peça com tipo para o novo DN muda de DN; senão, com redução no tipo,
 *     entra a redução (curva: `resolverNo` devolve `ajustada`); senão a peça sai e o tubo fica com a ponta aberta, com alerta;
 *  3. reencurta os tubos pelos recuos das peças (como `aparar` da ferramenta Tubo);
 *  4. confere a viabilidade (B2) com os recuos finais: bloqueio vira remoção da conexão com alerta, nunca troca silenciosa.
 * Os comandos saem na ordem: famílias, desconexões, apagar peças, inserir peças, atualizar peças e tubos, conexões. Quem aplica deve
 * rodar todos numa única transação (`aplicarTrocaDeBitola`, no pacote de ferramentas).
 */

/** Tipo sem nenhuma peça: tubo de domínio sem regras de conexão (toda peça ligada é tratada como sem substituta). */
const SEM_REGRAS: RegrasConexao = { tubo: '', curva90: '', curva45: '', te: '', juncao45: '', luva: '', reducao: '', tampao: '' };

/** Teto de rodadas do laço de viabilidade (cada rodada remove uma conexão; uma rede real tem poucas). */
const MAX_RODADAS = 24;

const vazio = (): Omit<PlanoTrocaBitola, 'ok'> => ({ comandos: [], conexoesTrocadas: [], conexoesRemovidas: [], reducoesInseridas: [], alertas: [] });

function recusa(r: RecusaTroca): PlanoTrocaBitola {
  return { ok: false, recusa: r, ...vazio() };
}

/** DN que a família do tubo declara em `DN` (opções), para dizer quais valem. */
function bitolasDaFamilia(tubo: Tubo): number[] | undefined {
  const op = tubo.familia.parametros.find((q) => q.id === 'DN')?.opcoes;
  return op?.map((o) => Number(o.valor)).filter((x) => Number.isFinite(x));
}

function montar(p: Project, tubo: Tubo, novoDn: number, regras: RegrasConexao, forcados: ReadonlyMap<string, string>): Ctx {
  const tipoT = tipoDaFamiliaDeTubo(tubo.comp.familyId);
  const ctx: Ctx = {
    p, tubo, novoDn, regras, forcados,
    tipo: { regras, bitolas: tipoT?.bitolas ?? null, ...(tipoT ? { linha: tipoT.linha } : {}) },
    geo: new Map(), upserts: new Map(), desconectar: [], desfeitas: new Set(), apagar: [], adicionar: [], atualizar: [], conectar: [], usados: new Set(),
    trocadas: [], removidas: [], reducoes: [], alertas: [], nos: [],
  };
  estadoDe(ctx, tubo).tocado = true;
  tratarNo(ctx, 'a');
  tratarNo(ctx, 'b');
  return ctx;
}

/** `updateComponent` do tubo: nova posição e comprimento pelos recuos finais e, no tubo trocado, o DN e o tipo. */
function atualizacaoDoTubo(ctx: Ctx, e: EstadoTubo): Comando {
  const c = e.tubo.comp;
  const trocado = c.id === ctx.tubo.comp.id;
  const dn = trocado ? ctx.novoDn : e.tubo.dn;
  const f = extremosFinais(e);
  const t = trechoDeTubo(f.a, f.b, { id: c.familyId }, dn, { id: c.id, levelId: c.levelId });
  const values = { ...(c.values ?? {}), ...(t?.values ? { L: t.values.L } : {}), ...(trocado ? { DN: ctx.novoDn } : {}) };
  const geometria = t ? { x: t.x, y: t.y, z: t.z, rotation: t.rotation, inclinacao: t.inclinacao } : {};
  const tipo = trocado ? { typeId: tipoComDn(e.tubo.familia, ctx.novoDn) ?? c.typeId } : {};
  return { type: 'updateComponent', id: c.id, patch: { ...geometria, ...tipo, values } };
}

function comandosDe(ctx: Ctx): Comando[] {
  const cmds: Comando[] = [];
  for (const family of ctx.upserts.values()) cmds.push({ type: 'upsertFamily', family });
  for (const d of ctx.desconectar) cmds.push({ type: 'disconnectComponents', a: d.a, ligacaoA: d.lig });
  if (ctx.apagar.length > 0) cmds.push({ type: 'deleteElements', ids: [...new Set(ctx.apagar)] });
  for (const component of ctx.adicionar) cmds.push({ type: 'addComponent', component });
  for (const u of ctx.atualizar) cmds.push({ type: 'updateComponent', id: u.id, patch: u.patch });
  for (const e of ctx.geo.values()) if (e.tocado) cmds.push(atualizacaoDoTubo(ctx, e));
  for (const c of ctx.conectar) cmds.push({ type: 'connectComponents', a: c.a, ligacaoA: c.la, b: c.b, ligacaoB: c.lb });
  return cmds;
}

/**
 * Plano da troca do DN do tubo `tuboId` para `novoDn` (mm). `ok: false` = recusa (nada muda). Trocar para o mesmo DN é `ok` sem comandos.
 * Conexão incompatível NÃO recusa: o plano a remove e alerta (`conexoesRemovidas`, `alertas`).
 */
export function planejarTrocaDeBitola(projeto: Project, tuboId: Id, novoDn: number): PlanoTrocaBitola {
  const e = projeto.elements[tuboId];
  const tubo = isComponent(e) ? lerTubo(projeto, e) : null;
  if (!tubo) return recusa({ codigo: 'tubo_inexistente', motivo: `O elemento ${tuboId} não é um tubo do projeto.` });
  const fixas = bitolasDoTubo(tubo.comp.familyId) ?? bitolasDaFamilia(tubo);
  if (!Number.isFinite(novoDn) || novoDn <= 0) return recusa({ codigo: 'bitola_fora_da_lista', motivo: `DN ${novoDn} inválido.`, ...(fixas ? { bitolas: fixas } : {}) });
  const permitida = bitolaPermitida(tubo.comp.familyId, novoDn);
  if (!permitida.ok) return recusa({ codigo: 'bitola_fora_da_lista', motivo: permitida.motivo, ...(fixas ? { bitolas: fixas } : {}) });
  const valores = { ...(tubo.comp.values ?? {}), DN: novoDn };
  if (!tubo.familia.parametros.some((q) => q.id === 'DN') || !semErrosNovos(tubo.familia, tipoComDn(tubo.familia, novoDn) ?? tubo.comp.typeId, tubo.comp.values, valores)) {
    const lista = bitolasDaFamilia(tubo);
    return recusa({ codigo: 'bitola_fora_da_lista', motivo: `DN ${novoDn} não existe na família ${tubo.familia.nome}.${lista ? ` Bitolas: ${lista.join(', ')}.` : ''}`, ...(lista ? { bitolas: lista } : {}) });
  }
  if (Math.abs(novoDn - tubo.dn) < 0.5) return { ok: true, ...vazio() };

  const dominio = resolverComponente(projeto, tubo.comp).ligacoes?.[0]?.dominio ?? '';
  const regras = regrasDoTubo(tubo.comp.familyId, dominio) ?? SEM_REGRAS;
  let forcados = new Map<string, string>();
  let ctx = montar(projeto, tubo, novoDn, regras, forcados);
  for (let i = 0; i < MAX_RODADAS; i++) {
    const ent = entradasDeViabilidade(ctx);
    const bloqueio = listarProblemasDeViabilidade({ trechos: ent.trechos, prumadas: ent.prumadas }).find((q) => q.severidade === 'bloqueio');
    const id = bloqueio?.trechoAfetado === undefined ? undefined : ent.ids[bloqueio.trechoAfetado];
    const candidato = bloqueio && id ? ctx.nos.filter((n) => n.tuboId === id && n.recuo > 1e-9 && !forcados.has(n.chave)).sort((a, b) => b.recuo - a.recuo)[0] : undefined;
    if (!bloqueio || !candidato) break;
    forcados = new Map(forcados).set(candidato.chave, bloqueio.motivo);
    ctx = montar(projeto, tubo, novoDn, regras, forcados);
  }
  const avisos = listarProblemasDeViabilidade({ declividades: entradasDeViabilidade(ctx).declividades }).filter((q) => q.severidade === 'aviso');
  const alertas = [...ctx.alertas, ...avisos.map((q) => ({ codigo: 'declividade_fora_do_limite' as const, motivo: q.motivo, elementId: tubo.comp.id }))];
  return { ok: true, comandos: comandosDe(ctx), conexoesTrocadas: ctx.trocadas, conexoesRemovidas: ctx.removidas, reducoesInseridas: ctx.reducoes, alertas };
}
