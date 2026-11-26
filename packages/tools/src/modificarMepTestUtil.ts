import { categoriaDaFamilia, diagnosticarRede, ligacaoNoMundo, resolverComponente, trechoDeTubo } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, type Component, type Id, type Project } from '@hestia/model';
import { FAMILIA_ELETRODUTO, opcoesEletroduto } from './eletrodutoTool.ts';
import { opcoesTubo } from './tuboTool.ts';
import { trechoDoProjeto, type TrechoAlvo } from './tuboTrecho.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { PointerInfo } from './types.ts';

/* Apoio dos testes da ficha F6a (ferramentas da aba Modificar sobre tubo e eletroduto): redes de exemplo e gestos. Não é exportado no índice. */

export const ESG = 'fam_krona_esgoto_tubo_corte';
export const SOL = 'fam_krona_soldavel_tubo_corte';
export const ELE = FAMILIA_ELETRODUTO;
export const COR = 'fam_tigre_tigreflex_amarelo';
export type Ctx = ReturnType<typeof makeEnv>;

export const comps = (ctx: Ctx): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
export const tubosDe = (ctx: Ctx, fam?: string): TrechoAlvo[] => comps(ctx).filter((c) => !fam || c.familyId === fam).map((c) => trechoDoProjeto(ctx.store.project, c.id)).filter((t): t is TrechoAlvo => t !== null);
export const pecasDe = (ctx: Ctx, sufixo?: string): Component[] => comps(ctx).filter((c) => categoriaDaFamilia(c.familyId) && (!sufixo || c.familyId.endsWith(sufixo)));
const CODIGOS = new Set(['conexao_afastada', 'incompativel', 'ligacao_incompativel', 'conexao_invalida', 'conexoes_coladas', 'curvatura_fechada']);
/** Problemas de rede que o dono não aceita ao final de uma edição: afastada, incompatível, colada, curvatura. */
export const problemas = (p: Project): string[] => diagnosticarRede(p).filter((d) => CODIGOS.has(d.codigo)).map((d) => `${d.codigo}:${d.elementId}`);
export const L = (c: Component | undefined): number => Number(c?.values?.L ?? NaN);

/** Prepara o ambiente: grade fina e a ferramenta de traçado pronta com a família, o DN e a cota. */
export function preparar(fam: string, dn: number, z = 0.5, eletrico = false): { ctx: Ctx; t: ReturnType<typeof tool> } {
  const ctx = makeEnv();
  ctx.env.gridStep = () => 0.01;
  ctx.env.say = () => {};
  if (eletrico) {
    opcoesEletroduto.familiaId = fam;
    opcoesEletroduto.dn = dn;
    opcoesEletroduto.z = z;
    opcoesEletroduto.declividade = 0;
    opcoesEletroduto.modoCota = 'subir_primeiro';
  } else {
    ctx.env.options().componentFamilyId = fam;
    opcoesTubo.dn = dn;
    opcoesTubo.z = z;
    opcoesTubo.declividade = 0;
    opcoesTubo.modoCota = 'subir_primeiro';
  }
  return { ctx, t: tool(eletrico ? 'eletroduto' : 'tubo', ctx.env) };
}

/** Tubo reto de (0,0) a (comp,0). */
export function redeReta(fam: string, dn: number, comp = 3, z = 0.5, eletrico = false): Ctx {
  const { ctx, t } = preparar(fam, dn, z, eletrico);
  clickAt(t, 0, 0);
  clickAt(t, comp, 0);
  t.cancel();
  return ctx;
}

/** Tubo em L: (0,0) → (2,0) → (2,2); o canto leva a conexão do tipo. */
export function redeEmL(fam: string, dn: number, z = 0.5, eletrico = false): Ctx {
  const { ctx, t } = preparar(fam, dn, z, eletrico);
  clickAt(t, 0, 0);
  clickAt(t, 2, 0);
  clickAt(t, 2, 2);
  t.cancel();
  return ctx;
}

/** Gesto do Selecionar: pega em `de`, arrasta até `para` e solta, com os modificadores. */
export function arrastarComSelecionar(ctx: Ctx, de: [number, number], para: [number, number], mod: Partial<PointerInfo> = {}): void {
  const s = tool('select', ctx.env);
  s.move(P(de[0], de[1]));
  s.down?.(P(de[0], de[1]));
  s.drag?.(P(para[0], para[1], mod));
  s.up?.(P(para[0], para[1], mod));
}

export const ids = (xs: TrechoAlvo[]): Id[] => xs.map((x) => x.id);

export const CAIXA = 'fam_krona_eletrica_caixa_4x4';
export const TUBO_ELE = 'fam_krona_eletrica_tubo_corte';

/** Duas caixas (x = 0 e x = `dist`, em y = 0) e o eletroduto `t1` ligando as portas d e c (o projeto só tem o tubo e a caixa, sem curvas). */
export function redeEntreCaixas(dist = 2): Ctx {
  const ctx = makeEnv();
  ctx.env.say = () => {};
  for (const id of [TUBO_ELE, CAIXA]) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(id)!) });
  for (const [id, x] of [['c1', 0], ['c2', dist]] as const) {
    ctx.store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: CAIXA, typeId: null, levelId: 'lv_0', x, y: 0, z: 0.3, rotation: 0, mirrored: false, mark: id } as Component });
  }
  const porta = (id: Id, lig: string) => {
    const c = ctx.store.project.elements[id] as Component;
    return ligacaoNoMundo(resolverComponente(ctx.store.project, c).ligacoes!.find((l) => l.id === lig)!, c).posicaoMundo;
  };
  ctx.store.exec({ type: 'addComponent', component: trechoDeTubo(porta('c1', 'd'), porta('c2', 'c'), { id: TUBO_ELE }, 20, { id: 't1', levelId: 'lv_0' })! });
  ctx.store.exec({ type: 'connectComponents', a: 'c1', ligacaoA: 'd', b: 't1', ligacaoB: 'a' });
  ctx.store.exec({ type: 'connectComponents', a: 'c2', ligacaoA: 'c', b: 't1', ligacaoB: 'b' });
  return ctx;
}
