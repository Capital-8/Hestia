import { beforeEach, describe, expect, it } from 'vitest';
import { isComponent } from '@hestia/model';
import { opcoesTubo } from './tuboTool.ts';
import { avisoComSugestao, itensDoBloqueio, type BloqueioTubo } from './tuboBloqueio.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Prévia e fala dos alertas da ferramenta Tubo (ficha B9): o trecho que seria bloqueado já fica vermelho no HOVER, com o motivo; o
 * bloqueio do clique continua marcado enquanto o cursor anda; e o ângulo sem peça (60°) leva a sugestão de cota na fala e na prévia.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';

beforeEach(() => {
  opcoesTubo.dn = 100;
  opcoesTubo.z = 0.5;
  opcoesTubo.declividade = 0;
});

const falas = (ctx: ReturnType<typeof makeEnv>): string[] => {
  const dita: string[] = [];
  const original = ctx.env.say;
  ctx.env.say = (m: string): void => {
    dita.push(m);
    original(m);
  };
  return dita;
};

const vermelhos = (t: ReturnType<typeof tool>) => t.preview().filter((i) => 'tone' in i && i.tone === 'invalid');
const rotulos = (t: ReturnType<typeof tool>): string[] => t.preview().flatMap((i) => (i.kind === 'label' ? [i.text] : []));

/** Ferramenta com o primeiro trecho (0,0)→(1,0) desenhado e o cursor pronto para o segundo. DN 200: o recuo do joelho já bloqueia 100 mm (a grade do teste é de 0,1 m). */
function comTrecho(dn = 100) {
  opcoesTubo.dn = dn;
  const ctx = makeEnv();
  ctx.env.options().componentFamilyId = ESGOTO;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, 1, 0);
  return { ctx, t };
}

describe('prévia vermelha no hover (B9, defeito 4)', () => {
  it('trecho curto demais: só passar o mouse já mostra o segmento vermelho com o motivo', () => {
    const { t } = comTrecho(200);
    t.move(P(1, 0.1));
    expect(vermelhos(t)).toHaveLength(1);
    expect(rotulos(t).some((r) => r.startsWith('Bloqueado: Trecho curto demais'))).toBe(true);
  });

  it('trecho viável: prévia normal, sem vermelho e com o comprimento', () => {
    const { t } = comTrecho(200);
    t.move(P(1, 1));
    expect(vermelhos(t)).toHaveLength(0);
    expect(rotulos(t)).toContain('1,00 m');
  });

  it('o vermelho do hover some quando o cursor volta a um ponto viável e não grava nada', () => {
    const { ctx, t } = comTrecho(200);
    const antes = Object.values(ctx.store.project.elements).filter(isComponent).length;
    t.move(P(1, 0.1));
    expect(vermelhos(t)).toHaveLength(1);
    t.move(P(1, 1));
    expect(vermelhos(t)).toHaveLength(0);
    expect(Object.values(ctx.store.project.elements).filter(isComponent).length).toBe(antes);
  });

  it('depois do clique bloqueado o segmento tentado fica vermelho mesmo com o cursor em ponto viável', () => {
    const { t } = comTrecho(200);
    clickAt(t, 1, 0.1);
    expect(vermelhos(t)).toHaveLength(1);
    t.move(P(1, 1));
    expect(vermelhos(t)).toHaveLength(1);
    expect(vermelhos(t)[0]).toMatchObject({ kind: 'line', a: { x: 1, y: 0 }, b: { x: 1, y: 0.1 } });
    t.cancel();
    expect(vermelhos(t)).toHaveLength(0);
  });

  it('itensDoBloqueio: o motivo só entra no rótulo quando pedido', () => {
    const b: BloqueioTubo = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, motivo: 'curto', sugestao: 'Sugestão: s.' };
    expect(itensDoBloqueio(b)).toContainEqual({ kind: 'label', at: { x: 0.5, y: 0 }, text: 'Bloqueado · Sugestão: s.' });
    expect(itensDoBloqueio(b, true)).toContainEqual({ kind: 'label', at: { x: 0.5, y: 0 }, text: 'Bloqueado: curto · Sugestão: s.' });
  });
});

describe('ângulo sem peça com sugestão de cota (B9, defeito 3)', () => {
  /** Segundo trecho a 60° do primeiro: ponto (1,0)→(1,5; 0,866) tem 1 m em planta. */
  const A60 = [1.5, Math.sqrt(3) / 2] as const;

  it('a prévia mostra o aviso do ângulo no canto, com a sugestão de 45° (1000 mm)', () => {
    const { t } = comTrecho();
    t.move(P(A60[0], A60[1]));
    const aviso = rotulos(t).find((r) => r.startsWith('Ângulo de 60°'));
    expect(aviso).toBe('Ângulo de 60° sem conexão automática (só 0°, 45° e 90°). Sugestão: mudar a cota em 1000 mm para permitir 45°.');
    expect(vermelhos(t)).toHaveLength(0);
  });

  it('a fala do trecho criado leva o aviso e a sugestão; o trecho nasce sem joelho', () => {
    const { ctx, t } = comTrecho();
    const dita = falas(ctx);
    const antes = Object.values(ctx.store.project.elements).filter(isComponent);
    clickAt(t, A60[0], A60[1]);
    const depois = Object.values(ctx.store.project.elements).filter(isComponent);
    expect(depois.length - antes.length).toBe(1);
    const ultima = dita.at(-1) ?? '';
    expect(ultima).toContain('Ângulo de 60° sem conexão automática (só 0°, 45° e 90°).');
    expect(ultima).toContain('Sugestão: mudar a cota em 1000 mm para permitir 45°.');
  });

  it('90° e 0° não levam aviso de ângulo', () => {
    const { t } = comTrecho();
    t.move(P(1, 1));
    expect(rotulos(t).some((r) => r.startsWith('Ângulo'))).toBe(false);
    t.move(P(2, 0));
    expect(rotulos(t).some((r) => r.startsWith('Ângulo'))).toBe(false);
  });

  it('avisoComSugestao: sem a peça de 45° no tipo ou com ponto final encaixado, só o aviso', () => {
    const a = { xyz: [0, 0, 0] as [number, number, number], alvo: null };
    const b = { xyz: [1, 0, 0] as [number, number, number], alvo: null };
    expect(avisoComSugestao('x.', { curva45: '', curva90: 'j90' }, a, b)).toBe('x.');
    expect(avisoComSugestao('x.', { curva45: 'j45', curva90: 'j90' }, a, { ...b, alvo: { componentId: 'c', ligacaoId: 'a' } })).toBe('x.');
    expect(avisoComSugestao('x.', { curva45: 'j45', curva90: 'j90' }, a, b)).toBe('x. Sugestão: mudar a cota em 1000 mm para permitir 45°.');
  });
});
