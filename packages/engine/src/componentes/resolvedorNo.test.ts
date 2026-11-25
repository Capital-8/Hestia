import { describe, expect, it } from 'vitest';
import { resolverNo, type EntradaNo, type SolucaoNo, type TrechoNo } from './resolvedorNo.ts';
import { TIPOS_TUBULACAO } from './tiposTubulacao.ts';

const esgoto = TIPOS_TUBULACAO.find((t) => t.id === 'krona_esgoto')!;
const soldavel = TIPOS_TUBULACAO.find((t) => t.id === 'krona_soldavel')!;
const graus = (g: number): [number, number, number] => [Math.cos((g * Math.PI) / 180), Math.sin((g * Math.PI) / 180), 0];
const tr = (direcao: [number, number, number], dn: number): TrechoNo => ({ direcao, dn });

/** Encontro com o segundo trecho formando o ângulo interno `interno` (graus) com o primeiro (que sai para +x). */
const encontro = (tipo: EntradaNo['tipo'], interno: number, dnA = 50, dnB = dnA): EntradaNo => ({ tipo, no: { tipo: 'encontro', trechos: [tr([1, 0, 0], dnA), tr(graus(interno), dnB)] } });
const derivacao = (tipo: EntradaNo['tipo'], anguloRamal: number, dn = 50, dnRamal = dn): EntradaNo => ({ tipo, no: { tipo: 'derivacao', principal: { rumoA: [1, 0, 0], rumoB: [-1, 0, 0], dn }, ramal: tr(graus(anguloRamal), dnRamal) } });

const ok = (s: SolucaoNo) => {
  if (s.status !== 'ok') throw new Error(`esperava ok, veio ${s.status}`);
  return s;
};
const falha = (s: SolucaoNo) => {
  if (s.status !== 'sem_solucao') throw new Error(`esperava sem_solucao, veio ${s.status}`);
  return s;
};

describe('resolverNo: encontro de dois trechos', () => {
  it('colinear do mesmo DN no esgoto: luva', () => {
    const s = ok(resolverNo(encontro(esgoto, 180)));
    expect(s.conexao.tipo).toBe('luva');
    expect(s.conexao.familiaId).toBe(esgoto.regras.luva);
    expect(s.recuos).toEqual([0, 0]);
  });
  it('colinear do mesmo DN no soldável: luva', () => {
    expect(ok(resolverNo(encontro(soldavel, 180, 25))).conexao.familiaId).toBe(soldavel.regras.luva);
  });
  it('joelho 90° no esgoto e no soldável', () => {
    expect(ok(resolverNo(encontro(esgoto, 90))).conexao).toMatchObject({ tipo: 'curva90', familiaId: esgoto.regras.curva90 });
    expect(ok(resolverNo(encontro(soldavel, 90, 32))).conexao).toMatchObject({ tipo: 'curva90', familiaId: soldavel.regras.curva90 });
  });
  it('joelho 45° (interno 135°) no esgoto e no soldável', () => {
    expect(ok(resolverNo(encontro(esgoto, 135))).conexao).toMatchObject({ tipo: 'curva45', familiaId: esgoto.regras.curva45 });
    expect(ok(resolverNo(encontro(soldavel, 135, 25))).conexao).toMatchObject({ tipo: 'curva45', familiaId: soldavel.regras.curva45 });
  });
  it('aceita ângulo dentro da tolerância e normaliza direções', () => {
    const e = encontro(esgoto, 91.5);
    expect(ok(resolverNo(e)).conexao.tipo).toBe('curva90');
    const g = encontro(esgoto, 90);
    if (g.no.tipo === 'encontro') g.no.trechos = [tr([7, 0, 0], 50), tr([0, 3, 0], 50)];
    expect(ok(resolverNo(g)).conexao.direcoes).toEqual([[1, 0, 0], [0, 1, 0]]);
  });
  it('ângulos fora da tolerância dão angulo_sem_peca com o texto atual', () => {
    const a = falha(resolverNo(encontro(esgoto, 150)));
    expect(a.codigo).toBe('angulo_sem_peca');
    expect(a.motivo).toBe('Ângulo de 30° sem conexão automática (só 0°, 45° e 90°).');
    expect(falha(resolverNo(encontro(esgoto, 120))).motivo).toContain('60°');
    expect(falha(resolverNo(encontro(soldavel, 150, 25))).codigo).toBe('angulo_sem_peca');
  });
  it('redução: tipos da Krona não têm, então tipo_sem_peca', () => {
    const s = falha(resolverNo(encontro(esgoto, 180, 100, 50)));
    expect(s.codigo).toBe('tipo_sem_peca');
    expect(s.motivo).toBe('Este tipo de tubulação não tem redução: o trecho fica sem essa conexão.');
  });
  it('redução quando o tipo a oferece', () => {
    const tipo = { regras: { ...esgoto.regras, reducao: 'fam_red' } };
    expect(ok(resolverNo(encontro(tipo, 180, 100, 50))).conexao).toMatchObject({ tipo: 'reducao', familiaId: 'fam_red', diametros: [100, 50] });
  });
  it('DN diferente em curva: bitolas_diferentes_em_curva', () => {
    const s = falha(resolverNo(encontro(esgoto, 90, 100, 50)));
    expect(s.codigo).toBe('bitolas_diferentes_em_curva');
    expect(s.motivo).toBe('Curva entre bitolas diferentes: coloque uma redução num trecho reto antes da curva.');
  });
  it('trecho nulo: trecho_nulo', () => {
    const e: EntradaNo = { tipo: esgoto, no: { tipo: 'encontro', trechos: [tr([0, 0, 0], 50), tr([1, 0, 0], 50)] } };
    const s = falha(resolverNo(e));
    expect(s.codigo).toBe('trecho_nulo');
    expect(s.motivo).toBe('Trecho de comprimento nulo: nada a conectar.');
  });
  it('bitola fora da lista do tipo', () => {
    const s = falha(resolverNo(encontro(esgoto, 90, 60)));
    expect(s.codigo).toBe('bitola_fora_da_lista');
    expect(s.motivo).toBe('DN 60 não existe na linha esgoto da Krona. Bitolas: 40, 50, 75, 100, 150, 200, 250.');
    expect(falha(resolverNo(encontro(soldavel, 90, 32, 33))).codigo).toBe('bitola_fora_da_lista');
  });
  it('tipo sem luva: colinear do mesmo DN é direto', () => {
    const tipo = { regras: { ...esgoto.regras, luva: '' } };
    expect(resolverNo(encontro(tipo, 180))).toEqual({ status: 'direto' });
  });
  it('tipo sem a peça do ângulo: tipo_sem_peca', () => {
    const tipo = { regras: { ...esgoto.regras, curva90: '' } };
    const s = falha(resolverNo(encontro(tipo, 90)));
    expect(s.codigo).toBe('tipo_sem_peca');
    expect(s.motivo).toContain('joelho ou curva de 90°');
  });
  it('sem bitolas declaradas, qualquer DN vale', () => {
    expect(ok(resolverNo(encontro({ regras: esgoto.regras }, 90, 63))).conexao.tipo).toBe('curva90');
  });
});

describe('resolverNo: derivação', () => {
  it('ramal a 90°: tê no esgoto e no soldável', () => {
    const s = ok(resolverNo(derivacao(esgoto, 90)));
    expect(s.conexao).toMatchObject({ tipo: 'te', familiaId: esgoto.regras.te, diametros: [50, 50, 50] });
    expect(s.recuos).toEqual([0, 0, 0]);
    expect(ok(resolverNo(derivacao(soldavel, 90, 25))).conexao.familiaId).toBe(soldavel.regras.te);
  });
  it('ramal de DN menor no principal: tê com diâmetros [principal, principal, ramal]', () => {
    expect(ok(resolverNo(derivacao(esgoto, 90, 100, 50))).conexao.diametros).toEqual([100, 100, 50]);
  });
  it('ramal a 45° nos dois sentidos: junção 45° no esgoto', () => {
    expect(ok(resolverNo(derivacao(esgoto, 45))).conexao).toMatchObject({ tipo: 'juncao45', familiaId: esgoto.regras.juncao45 });
    expect(ok(resolverNo(derivacao(esgoto, 135))).conexao.tipo).toBe('juncao45');
  });
  it('junção 45° no soldável: tipo_sem_peca', () => {
    const s = falha(resolverNo(derivacao(soldavel, 45, 25)));
    expect(s.codigo).toBe('tipo_sem_peca');
    expect(s.motivo).toContain('junção de 45°');
  });
  it('ramal a 30° ou 60°: angulo_sem_peca', () => {
    const s = falha(resolverNo(derivacao(esgoto, 60)));
    expect(s.codigo).toBe('angulo_sem_peca');
    expect(s.motivo).toBe('Derivação só a 90° (tê) ou 45° (junção): outro ângulo fica sem conexão.');
    expect(falha(resolverNo(derivacao(esgoto, 30))).codigo).toBe('angulo_sem_peca');
  });
  it('ramal nulo e bitola fora da lista', () => {
    const nulo: EntradaNo = { tipo: esgoto, no: { tipo: 'derivacao', principal: { rumoA: [1, 0, 0], rumoB: [-1, 0, 0], dn: 50 }, ramal: tr([0, 0, 0], 50) } };
    expect(falha(resolverNo(nulo)).codigo).toBe('trecho_nulo');
    expect(falha(resolverNo(derivacao(esgoto, 90, 50, 55))).codigo).toBe('bitola_fora_da_lista');
  });
});

describe('resolverNo: propriedades', () => {
  it('é determinístico e não altera a entrada', () => {
    const e = encontro(esgoto, 135);
    const copia = structuredClone(e);
    expect(resolverNo(e)).toEqual(resolverNo(e));
    expect(e).toEqual(copia);
    const d = derivacao(esgoto, 90);
    expect(resolverNo(d)).toEqual(resolverNo(structuredClone(d)));
  });
  it('a cota informada não muda a decisão', () => {
    const e = encontro(esgoto, 90);
    if (e.no.tipo === 'encontro') e.no.trechos = [{ ...e.no.trechos[0], cota: 0 }, { ...e.no.trechos[1], cota: 2 }];
    expect(ok(resolverNo(e)).conexao.tipo).toBe('curva90');
  });
});
