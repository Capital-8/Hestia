import { beforeEach, describe, expect, it } from 'vitest';
import { opcoesTubo } from './tuboTool.ts';
import { itensDoBloqueio, sugestaoDeBloqueio, textoSugestao, type BloqueioTubo } from './tuboBloqueio.ts';
import type { PontoTubo } from './tuboGeometria.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/*
 * Alertas da ferramenta Tubo (ficha B5): o trecho bloqueado fica em vermelho na prévia com a sugestão de cota, a fala leva a sugestão
 * (exceto a mensagem de ângulo, que segue exata), e o alerta some no próximo clique válido ou no Esc.
 */

const ESGOTO = 'fam_krona_esgoto_tubo_corte';
const REGRAS = { curva45: 'fam_krona_esgoto_joelho45', curva90: 'fam_krona_esgoto_joelho90' };
const SEM_45 = { curva45: '', curva90: 'fam_krona_esgoto_joelho90' };

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

/** Itens vermelhos (tom `invalid`) da prévia. */
const vermelhos = (t: ReturnType<typeof tool>) => t.preview().filter((i) => 'tone' in i && i.tone === 'invalid');

/** Dois trechos a 90° com o segundo de 60 mm: o recuo do joelho deixa 2 mm e a ferramenta bloqueia. */
function bloquearTrechoCurto(ctx: ReturnType<typeof makeEnv>) {
  ctx.env.options().componentFamilyId = ESGOTO;
  const t = tool('tubo', ctx.env);
  clickAt(t, 0, 0);
  clickAt(t, 1, 0);
  t.move(P(1, 1));
  t.type?.('0.06');
  return t;
}

describe('alerta do bloqueio na ferramenta Tubo (ficha B5)', () => {
  it('trecho curto: a fala traz o motivo e a sugestão de 45° com a mudança exata (60 mm)', () => {
    const ctx = makeEnv();
    const dita = falas(ctx);
    bloquearTrechoCurto(ctx);
    const ultima = dita.at(-1) ?? '';
    expect(ultima.startsWith('Bloqueado: Trecho curto demais')).toBe(true);
    expect(ultima.endsWith('Sugestão: mudar a cota em 60 mm para permitir 45°.')).toBe(true);
  });

  it('o segmento tentado aparece em vermelho na prévia, com rótulo de bloqueio', () => {
    const ctx = makeEnv();
    const t = bloquearTrechoCurto(ctx);
    const linhas = vermelhos(t);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ kind: 'line', a: { x: 1, y: 0 }, b: { x: 1, y: 0.06 } });
    const rotulo = t.preview().find((i) => i.kind === 'label' && i.text.startsWith('Bloqueado'));
    expect(rotulo).toBeDefined();
  });

  it('o vermelho continua enquanto o cursor se move e some com Esc', () => {
    const ctx = makeEnv();
    const t = bloquearTrechoCurto(ctx);
    t.move(P(1.5, 0.5));
    expect(vermelhos(t)).toHaveLength(1);
    t.cancel();
    expect(vermelhos(t)).toHaveLength(0);
  });

  it('um clique válido depois do bloqueio cria o trecho e apaga o vermelho', () => {
    const ctx = makeEnv();
    const t = bloquearTrechoCurto(ctx);
    expect(vermelhos(t)).toHaveLength(1);
    clickAt(t, 1, 1);
    expect(vermelhos(t)).toHaveLength(0);
  });

  it('mudança de cota de prumada: a fala mantém o motivo e acrescenta a sugestão de 90° com o que falta (52 mm)', () => {
    const ctx = makeEnv();
    ctx.env.options().componentFamilyId = ESGOTO;
    const dita = falas(ctx);
    const t = tool('tubo', ctx.env);
    clickAt(t, 1, 0);
    opcoesTubo.z = 0.55;
    clickAt(t, 1, 0);
    clickAt(t, 2, 0);
    const ultima = dita.at(-1) ?? '';
    expect(ultima.startsWith('Bloqueado: Mudança de cota de 50 mm insuficiente para a prumada')).toBe(true);
    expect(ultima.endsWith('Sugestão: mudar a cota em 52 mm para permitir 90°.')).toBe(true);
    expect(vermelhos(t)).toHaveLength(1);
  });
});

describe('sugestaoDeBloqueio (função de cálculo do alerta)', () => {
  const a: PontoTubo = { xyz: [0, 0, 0], alvo: null };
  const livre = (x: number, y: number, z: number): PontoTubo => ({ xyz: [x, y, z], alvo: null });
  const sempre = (): boolean => true;

  it('trecho curto que passa na viabilidade com a cota nova: sugere a mudança de 45°', () => {
    // 500 mm em planta e 0 de desnível: a 45° o desnível vira 500 mm.
    expect(sugestaoDeBloqueio(REGRAS, 'trecho_curto', a, livre(0.5, 0, 0), undefined, sempre)).toBe('Sugestão: mudar a cota em 500 mm para permitir 45°.');
  });

  it('trecho curto que continua inviável com a cota nova: sem sugestão (não se sugere o que não resolve)', () => {
    expect(sugestaoDeBloqueio(REGRAS, 'trecho_curto', a, livre(0.5, 0, 0), undefined, () => false)).toBeNull();
  });

  it('ponto final encaixado numa conexão: a cota vem da rede, sem sugestão', () => {
    const encaixado: PontoTubo = { xyz: [0.5, 0, 0], alvo: { componentId: 'cm_x', ligacaoId: 'a' } };
    expect(sugestaoDeBloqueio(REGRAS, 'trecho_curto', a, encaixado, undefined, sempre)).toBeNull();
  });

  it('tipo sem a peça de 45°: sem sugestão de 45° (o motivo sozinho)', () => {
    expect(sugestaoDeBloqueio(SEM_45, 'trecho_curto', a, livre(0.5, 0, 0), undefined, sempre)).toBeNull();
    expect(sugestaoDeBloqueio(SEM_45, 'angulo', a, livre(0.5, 0, 0), undefined, sempre)).toBeNull();
  });

  it('ângulo sem conexão: sugere 45° com a mudança da geometria (planta 1000 mm, desnível 200 mm → 800 mm)', () => {
    expect(sugestaoDeBloqueio(REGRAS, 'angulo', a, livre(1, 0, 0.2), undefined, sempre)).toBe('Sugestão: mudar a cota em 800 mm para permitir 45°.');
  });

  it('código sem sugestão (conexões se tocam) e sem regras: null', () => {
    expect(sugestaoDeBloqueio(REGRAS, 'conexoes_se_tocam', a, livre(0.5, 0, 0), undefined, sempre)).toBeNull();
    expect(sugestaoDeBloqueio(null, 'trecho_curto', a, livre(0.5, 0, 0), undefined, sempre)).toBeNull();
  });

  it('textoSugestao arredonda para mm inteiros e a prévia sem sugestão mostra só "Bloqueado"', () => {
    expect(textoSugestao(90, 51.6)).toBe('Sugestão: mudar a cota em 52 mm para permitir 90°.');
    const semSugestao: BloqueioTubo = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, motivo: 'x', sugestao: null };
    expect(itensDoBloqueio(semSugestao)).toContainEqual({ kind: 'label', at: { x: 0.5, y: 0 }, text: 'Bloqueado' });
  });
});
