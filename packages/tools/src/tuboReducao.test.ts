import { beforeEach, describe, expect, it } from 'vitest';
import { BIBLIOTECA_MEP, isComponent, type Component, type Familia } from '@hestia/model';
import { diagnosticarRede, posicionarConexao, resolverNo, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/*
 * Redução automática entre bitolas na Krona (ficha B6): o tipo de esgoto tem a redução excêntrica e o soldável tem a luva de redução.
 * A peça sai do par de bitolas (maior x menor) do catálogo: `COD` e `typeId` do tipo do par. Par sem tipo no catálogo não insere
 * nada e avisa. O tubo trocado recua até a ponta ficar dentro da bolsa pequena, e a rede não acusa afastamento nem incompatibilidade.
 */

const ESG = 'fam_krona_esgoto_tubo_corte';
const SOL = 'fam_krona_soldavel_tubo_corte';
const RED_ESG = 'fam_krona_esgoto_reducao_excentrica';
const LUVA_RED_SOL = 'fam_krona_soldavel_luva_reducao';
const LUVA_ESG = 'fam_krona_esgoto_luva';

type Trecho = [dn: number, a: [number, number], b: [number, number]];

const familias = (): Familia[] => Object.values(BIBLIOTECA_MEP) as Familia[];
const familiaDaBiblioteca = (id: string): Familia => {
  const f = familias().find((x) => x.id === id);
  if (!f) throw new Error(`família ${id} ausente da biblioteca`);
  return f;
};

/** Ambiente da ferramenta Tubo com a família do trecho escolhida; `said` guarda os avisos que a ferramenta fala. */
function ambiente(familia: string) {
  const ctx = makeEnv();
  const said: string[] = [];
  ctx.env.say = (m: string) => { said.push(m); };
  ctx.env.options().componentFamilyId = familia;
  return { ctx, said };
}

/** Desenha cada trecho com a ferramenta Tubo, um por vez, cada um começando na ponta do anterior (o DN vale por trecho). */
function desenhar(ctx: ReturnType<typeof makeEnv>, trechos: Trecho[]): void {
  for (const [dn, a, b] of trechos) {
    opcoesTubo.dn = dn;
    const t = tool('tubo', ctx.env);
    clickAt(t, a[0], a[1]);
    clickAt(t, b[0], b[1]);
    t.cancel();
  }
}

const comps = (ctx: ReturnType<typeof makeEnv>): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);
const porFamilia = (ctx: ReturnType<typeof makeEnv>, id: string): Component[] => comps(ctx).filter((c) => c.familyId === id);
// declividade é verificada em diagnosticoRedeDn.test.ts; aqui só a geometria das conexões
const problemas = (ctx: ReturnType<typeof makeEnv>) => diagnosticarRede(ctx.store.project).filter((d) => d.codigo !== 'ligacao_aberta' && d.codigo !== 'rede_sem_saida' && d.codigo !== 'inclinacao_fora_limite');
const ligacoesDe = (c: Component): number => Object.keys(c.ligacoes ?? {}).length;

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

describe('redução automática entre bitolas (Krona)', () => {
  it('tipos da Krona apontam para a redução da linha (esgoto e soldável)', () => {
    expect(tipoDaFamiliaDeTubo(ESG)?.regras.reducao).toBe(RED_ESG);
    expect(tipoDaFamiliaDeTubo(SOL)?.regras.reducao).toBe(LUVA_RED_SOL);
  });

  it('esgoto 100 → 75 em linha reta insere 1 redução excêntrica com o COD do par 100x75 (656)', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [75, [1, 0], [2, 0]]]);
    const reducoes = porFamilia(ctx, RED_ESG);
    expect(reducoes).toHaveLength(1);
    expect(reducoes[0]?.values?.COD).toBe(656);
    expect(reducoes[0]?.typeId).toBe('cod0656');
  });

  it('a redução 100 → 75: o tubo de DN 75 recua até a bolsa pequena e o de DN 100 encosta na ponta lisa grande (recuo 0)', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [75, [1, 0], [2, 0]]]);
    const L = (dn: number) => Number(porFamilia(ctx, ESG).find((c) => c.values?.DN === dn)?.values?.L ?? NaN);
    expect(L(100)).toBeCloseTo(1000, 6);
    expect(L(75)).toBeLessThan(1000 - 1);
  });

  // Pendência conhecida (não fechada nesta ficha): a excêntrica desloca o eixo do lado pequeno em Dx = (De − Db) / 2 (13,05 mm
  // para 100 x 75) e a ferramenta desenha os dois trechos no mesmo eixo. Ver o teste documentado abaixo.
  it.todo('a rede 100 → 75 não acusa afastamento nem incompatibilidade (PENDENTE: deslocar o trecho menor em Dx)');

  it('cada tubo para na distância que o catálogo manda (ponta dentro da bolsa pequena)', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [75, [1, 0], [2, 0]]]);
    const pos = posicionarConexao(familiaDaBiblioteca(RED_ESG), [0, 0, 0], { tipo: 'reducao', familiaId: RED_ESG, direcoes: [[-1, 0, 0], [1, 0, 0]], diametros: [100, 75] });
    expect(pos).not.toBeNull();
    const esperado = [1000 - (pos?.recuos[0] ?? 0) * 1000, 1000 - (pos?.recuos[1] ?? 0) * 1000].sort((x, y) => x - y);
    const L = porFamilia(ctx, ESG).map((c) => Number(c.values?.L ?? 0)).sort((x, y) => x - y);
    expect(L[0]).toBeCloseTo(esperado[0] ?? 0, 2);
    expect(L[1]).toBeCloseTo(esperado[1] ?? 0, 2);
  });

  it('sentido invertido (DN 75 → 100) usa o mesmo par e o mesmo COD', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[75, [0, 0], [1, 0]], [100, [1, 0], [2, 0]]]);
    const reducoes = porFamilia(ctx, RED_ESG);
    expect(reducoes).toHaveLength(1);
    expect(reducoes[0]?.values?.COD).toBe(656);
    expect(reducoes[0]?.typeId).toBe('cod0656');
  });

  it('documenta a pendência da excêntrica: a única acusação é o desvio lateral de Dx (13,05 mm) e a declividade do DN 75 plano', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [75, [1, 0], [2, 0]]]);
    const codigos = problemas(ctx).map((d) => d.codigo).sort();
    expect(codigos).toEqual(['conexao_afastada', 'inclinacao_fora_limite']);
    const afastada = problemas(ctx).find((d) => d.codigo === 'conexao_afastada');
    expect(afastada?.valor).toBeGreaterThan(13);
    expect(afastada?.valor).toBeLessThan(13.2);
  });

  it('par que NÃO existe no catálogo (150 → 50) não insere nada, avisa e não liga os tubos direto', () => {
    const { ctx, said } = ambiente(ESG);
    desenhar(ctx, [[150, [0, 0], [1, 0]], [50, [1, 0], [2, 0]]]);
    expect(porFamilia(ctx, RED_ESG)).toHaveLength(0);
    expect(said.some((m) => m.includes('Não há redução DN 150 x 50'))).toBe(true);
    expect(porFamilia(ctx, ESG).every((c) => ligacoesDe(c) === 0)).toBe(true);
  });

  it('soldável 25 → 20 insere a luva de redução com o COD 450 (DN 25x20)', () => {
    const { ctx } = ambiente(SOL);
    desenhar(ctx, [[25, [0, 0], [1, 0]], [20, [1, 0], [2, 0]]]);
    const luvas = porFamilia(ctx, LUVA_RED_SOL);
    expect(luvas).toHaveLength(1);
    expect(luvas[0]?.values?.COD).toBe(450);
    expect(luvas[0]?.typeId).toBe('cod0450');
  });

  // Pendência conhecida: a origem da luva soldável fica na bolsa grande, então a ponta do DN 25 deveria ENTRAR 18,6 mm na bolsa
  // (recuo negativo, alongar o tubo); a ferramenta só encurta (recuo clampado em 0) e a rede acusa 18,6 mm.
  it('documenta a pendência da luva soldável 25 → 20: o único diagnóstico é a bolsa grande (18,6 mm) não encaixada', () => {
    const { ctx } = ambiente(SOL);
    desenhar(ctx, [[25, [0, 0], [1, 0]], [20, [1, 0], [2, 0]]]);
    const codigos = problemas(ctx).map((d) => d.codigo);
    expect(codigos).toEqual(['conexao_afastada']);
    expect(problemas(ctx)[0]?.valor).toBeCloseTo(18.6, 1);
  });
  it.todo('a luva soldável 25 → 20 não acusa nada na rede (PENDENTE: recuo negativo na bolsa grande)');

  it('soldável 110 → 75 usa o par 110x75 (COD 589)', () => {
    const { ctx } = ambiente(SOL);
    desenhar(ctx, [[110, [0, 0], [1, 0]], [75, [1, 0], [2, 0]]]);
    expect(porFamilia(ctx, LUVA_RED_SOL).map((c) => c.values?.COD)).toEqual([589]);
  });

  it('DN igual em linha reta segue sem peça (nem redução, nem luva)', () => {
    const { ctx } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [100, [1, 0], [2, 0]]]);
    expect(porFamilia(ctx, RED_ESG)).toHaveLength(0);
    expect(porFamilia(ctx, LUVA_ESG)).toHaveLength(0);
    expect(problemas(ctx)).toEqual([]);
  });

  it('curva entre bitolas diferentes segue com o aviso antigo: sem redução e sem joelho', () => {
    const { ctx, said } = ambiente(ESG);
    desenhar(ctx, [[100, [0, 0], [1, 0]], [75, [1, 0], [1, 1]]]);
    expect(porFamilia(ctx, RED_ESG)).toHaveLength(0);
    expect(porFamilia(ctx, 'fam_krona_esgoto_joelho90')).toHaveLength(0);
    expect(said.some((m) => m.includes('Curva entre bitolas diferentes: coloque uma redução num trecho reto antes da curva.'))).toBe(true);
  });
});

describe('posicionarConexao e resolvedor com bitola composta', () => {
  it('o par 100x75 devolve o tipo cod0656 e o COD 656', () => {
    const pos = posicionarConexao(familiaDaBiblioteca(RED_ESG), [0, 0, 0], { tipo: 'reducao', familiaId: RED_ESG, direcoes: [[-1, 0, 0], [1, 0, 0]], diametros: [100, 75] });
    expect(pos?.typeId).toBe('cod0656');
    expect(pos?.values.COD).toBe(656);
    expect(pos?.values.DN).toBeUndefined();
  });

  it('par ausente (150x50) devolve null: a família não inventa peça', () => {
    const pos = posicionarConexao(familiaDaBiblioteca(RED_ESG), [0, 0, 0], { tipo: 'reducao', familiaId: RED_ESG, direcoes: [[-1, 0, 0], [1, 0, 0]], diametros: [150, 50] });
    expect(pos).toBeNull();
  });

  it('a ponta grande (De) vai no trecho de DN maior mesmo quando ele é o segundo trecho da lista', () => {
    const fam = familiaDaBiblioteca(RED_ESG);
    const direto = posicionarConexao(fam, [0, 0, 0], { tipo: 'reducao', familiaId: RED_ESG, direcoes: [[-1, 0, 0], [1, 0, 0]], diametros: [100, 75] });
    const invertido = posicionarConexao(fam, [0, 0, 0], { tipo: 'reducao', familiaId: RED_ESG, direcoes: [[1, 0, 0], [-1, 0, 0]], diametros: [75, 100] });
    expect(direto?.ligacoes).toEqual(['a', 'b']);
    expect(invertido?.ligacoes).toEqual(['b', 'a']);
  });

  it('o resolvedor, com a família, devolve sem_solucao (nunca ok) para par que o catálogo não tem', () => {
    const regras = tipoDaFamiliaDeTubo(ESG)!.regras;
    const sol = resolverNo({
      tipo: { regras, bitolas: [40, 50, 75, 100, 150, 200, 250], linha: 'esgoto da Krona' },
      familias: { [RED_ESG]: familiaDaBiblioteca(RED_ESG) },
      no: { tipo: 'encontro', trechos: [{ direcao: [-1, 0, 0], dn: 150 }, { direcao: [1, 0, 0], dn: 50 }] },
    });
    expect(sol.status).toBe('sem_solucao');
    if (sol.status === 'sem_solucao') {
      expect(sol.codigo).toBe('bitola_fora_da_lista');
      expect(sol.motivo).toBe('Não há redução DN 150 x 50 na linha esgoto da Krona: o trecho fica sem essa conexão.');
    }
  });
});
