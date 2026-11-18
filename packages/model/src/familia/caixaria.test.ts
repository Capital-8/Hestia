import { describe, expect, it } from 'vitest';
import {
  alterarDivisaoItem,
  alterarEstruturaCaixaria,
  compilarCaixaria,
  criarFamiliaCaixaria,
  definirTampoCaixaria,
  definirTamponamentosCaixaria,
  desvincularPecaCaixaria,
  dividirVao,
  dividirVaoEmIguais,
  encontrarDivisaoPorPecaId,
  encontrarVao,
  garantirCaixaria,
  preencherVao,
  removerDivisao,
  resolverVaosCaixaria,
  revincularPecaCaixaria,
  sincronizarCaixaria,
} from './index.ts';
import { tentar, type Env } from './expressao.ts';
import { ordemDeAvaliacao } from './grafo.ts';
import { FAMILIA_FORMATO, FAMILIA_VERSAO, LIMITES, type Familia } from './tipos.ts';
import { validarFamilia } from './validar.ts';

function avaliarFamiliaParaTeste(f: Familia, extra: Record<string, number | string> = {}): Env {
  const env: Record<string, number | string | boolean> = {};
  for (const p of f.parametros) {
    if (p.formula !== undefined) continue;
    env[p.id] = extra[p.id] ?? p.padrao;
    if (p.tipo === 'chapa') {
      const op = p.opcoes?.find((o) => o.valor === env[p.id]);
      if (op?.esp !== undefined) env[`${p.id}.esp`] = op.esp;
    }
  }
  const ordem = ordemDeAvaliacao(f);
  expect(ordem.ok).toBe(true);
  if (ordem.ok) {
    const params = new Map(f.parametros.map((p) => [p.id, p]));
    const planos = new Map(f.planos.map((p) => [p.id, p]));
    for (const id of ordem.ordem) {
      const expr = params.get(id)?.formula ?? planos.get(id)?.posicao;
      if (expr === undefined) continue;
      const r = tentar(expr, env);
      expect(r.ok, `${id}: ${expr}`).toBe(true);
      if (r.ok) env[id] = r.valor;
    }
  }
  return env;
}

function verificarTodasPecasAvaliam(f: Familia, extra: Record<string, number | string> = {}): void {
  expect(validarFamilia(f)).toEqual([]);
  const env = avaliarFamiliaParaTeste(f, extra);
  for (const p of f.pecas) {
    let n = 1;
    if (p.repetir !== undefined) {
      const rr = tentar(p.repetir, env);
      expect(rr.ok, `${p.id}.repetir=${p.repetir}`).toBe(true);
      if (rr.ok) n = Math.max(1, Math.floor(Number(rr.valor)));
    }
    const e: Env = p.repetir !== undefined ? { ...env, i: 1, n } : env;
    for (const [k, s] of p.origem.entries()) {
      expect(s.length, `${p.id}.origem[${k}]`).toBeLessThanOrEqual(LIMITES.formula);
      const r = tentar(s, e);
      expect(r.ok, `${p.id}.origem[${k}]=${s}`).toBe(true);
    }
    for (const [k, s] of p.tamanho.entries()) {
      expect(s.length, `${p.id}.tamanho[${k}]`).toBeLessThanOrEqual(LIMITES.formula);
      const r = tentar(s, e);
      expect(r.ok, `${p.id}.tamanho[${k}]=${s}`).toBe(true);
      if (r.ok) expect(Number(r.valor), `${p.id}.tamanho[${k}]=${s}`).toBeGreaterThan(0);
    }
    const re = tentar(p.espessura, e);
    expect(re.ok, `${p.id}.espessura=${p.espessura}`).toBe(true);
    if (re.ok) expect(Number(re.valor), `${p.id}.espessura`).toBeGreaterThan(0);
  }
  for (const fe of f.ferragens) {
    const rq = tentar(fe.quantidade, env);
    expect(rq.ok, `${fe.id}.quantidade=${fe.quantidade}`).toBe(true);
  }
}

describe('caixaria paramétrica', () => {
  it('criarFamiliaCaixaria cria família válida com parâmetros, planos, tipos e conectores', () => {
    const f = criarFamiliaCaixaria({ nome: 'Balcão Teste', L: 900, A: 800, P: 580, estrutura: 'laterais_passantes' });
    expect(f.formato).toBe(FAMILIA_FORMATO);
    expect(f.versao).toBe(FAMILIA_VERSAO);
    expect(f.unidade).toBe('mm');
    expect(f.hospedagem).toBe('nivel');
    expect(f.origem).toBe('canto');
    expect(f.nome).toBe('Balcão Teste');
    expect(f.parametros.map((p) => p.id)).toEqual(
      expect.arrayContaining(['L', 'A', 'P', 'corpo', 'esp', 'mat_porta', 'mat_tampo', 'mat_fundo']),
    );
    expect(f.tipos.map((t) => t.id)).toEqual(['P600', 'P800', 'P1200']);
    expect(f.conectores?.length).toBe(3);
    expect(f.caixaria?.estrutura).toBe('laterais_passantes');
    expect(f.pecas.map((p) => p.id)).toEqual(['cx_latE', 'cx_latD', 'cx_base', 'cx_topo', 'cx_fundo']);
    verificarTodasPecasAvaliam(f);
  });

  it('suporta todas as estruturas, rodapés e fundos mantendo validação limpa', () => {
    const estruturas = ['base_topo', 'laterais_passantes', 'sem_topo', 'aberta'] as const;
    const rodapes = [
      { tipo: 'nenhum', altura: 0, recuo: 50 },
      { tipo: 'recuado', altura: 100, recuo: 50 },
      { tipo: 'pes', altura: 120, recuo: 0 },
    ] as const;
    const fundos = [
      { tipo: 'encaixado', espessura: 6, recuo: 15 },
      { tipo: 'pregado', espessura: 6, recuo: 0 },
      { tipo: 'espesso', espessura: 18, recuo: 0 },
      { tipo: 'nenhum', espessura: 0, recuo: 0 },
    ] as const;

    for (const estrutura of estruturas) {
      for (const rodape of rodapes) {
        for (const fundo of fundos) {
          const f = criarFamiliaCaixaria({ estrutura });
          const erro = alterarEstruturaCaixaria(f, { rodape, fundo });
          expect(erro).toBeNull();
          verificarTodasPecasAvaliam(f);

          const ids = f.pecas.map((p) => p.id);
          if (estrutura === 'sem_topo') {
            expect(ids).toContain('cx_trF');
            expect(ids).toContain('cx_trT');
            expect(ids).not.toContain('cx_topo');
          } else if (estrutura === 'aberta') {
            expect(ids).not.toContain('cx_topo');
            expect(ids).not.toContain('cx_trF');
          } else {
            expect(ids).toContain('cx_topo');
          }

          if (rodape.tipo === 'recuado') expect(ids).toContain('cx_rodape');
          else expect(ids).not.toContain('cx_rodape');

          if (rodape.tipo === 'pes') expect(f.ferragens.some((g) => g.id === 'cx_fer_pes')).toBe(true);
          else expect(f.ferragens.some((g) => g.id === 'cx_fer_pes')).toBe(false);

          if (fundo.tipo === 'nenhum') expect(ids).not.toContain('cx_fundo');
          else expect(ids).toContain('cx_fundo');
        }
      }
    }
  });

  it('tampo com recorte vazio e tamponamentos externos geram peças válidas e podem ser removidos', () => {
    const f = criarFamiliaCaixaria();
    expect(definirTampoCaixaria(f, {
      espessura: 25,
      avancoFrente: 20,
      avancoEsq: 10,
      avancoDir: 10,
      avancoFundo: 0,
      recorte: { largura: 450, profundidade: 380, dx: 20, dy: -10 },
    })).toBeNull();
    expect(definirTamponamentosCaixaria(f, {
      esquerda: true,
      direita: true,
      topo: true,
      base: true,
      espessura: 18,
      avancoFrente: 20,
    })).toBeNull();

    const ids = f.pecas.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'cx_tampo',
      'cx_tampo_recorte',
      'cx_tamp_esq',
      'cx_tamp_dir',
      'cx_tamp_topo',
      'cx_tamp_base',
    ]));
    expect(f.pecas.find((p) => p.id === 'cx_tampo_recorte')?.vazio).toBe(true);
    verificarTodasPecasAvaliam(f);

    expect(definirTampoCaixaria(f, null)).toBeNull();
    expect(definirTamponamentosCaixaria(f, null)).toBeNull();
    expect(f.pecas.some((p) => p.id.startsWith('cx_tamp'))).toBe(false);
    verificarTodasPecasAvaliam(f);
  });

  it('divide, altera, remove e resolve vãos em profundidade sem estourar fórmulas', () => {
    const f = criarFamiliaCaixaria({ L: 1200, A: 2000, P: 600 });

    // Erro em entrada inválida não altera a família
    const snapshot = JSON.stringify(f);
    expect(dividirVao(f, 'raiz', 'x', 'proporcional', 1.2)).toBeTypeOf('string');
    expect(dividirVao(f, 'inexistente', 'x', 'proporcional', 0.5)).toBeTypeOf('string');
    expect(JSON.stringify(f)).toBe(snapshot);

    // Divide raiz em 3 colunas iguais e subdivide profundamente em Z e X
    expect(dividirVaoEmIguais(f, 'raiz', 'x', 3)).toBeNull();
    expect(f.caixaria!.raiz.filhos).toHaveLength(3);
    const col0 = f.caixaria!.raiz.filhos![0]!;
    const col1 = f.caixaria!.raiz.filhos![1]!;
    const col2 = f.caixaria!.raiz.filhos![2]!;

    // Não permite dividir diretamente col0 em Z e depois em X no mesmo nó
    expect(dividirVao(f, col0.id, 'z', 'fixo_inicio', 300, 20)).toBeNull();
    expect(dividirVao(f, col0.id, 'x', 'proporcional', 0.5)).toBeTypeOf('string');
    // Mas permite acrescentar outra prateleira no mesmo eixo Z
    expect(dividirVao(f, col0.id, 'z', 'fixo_fim', 400)).toBeNull();
    expect(col0.filhos).toHaveLength(3);

    // Subdivide profundamente (6 níveis)
    let atual = col1;
    for (let nivel = 0; nivel < 6; nivel++) {
      const eixo = nivel % 2 === 0 ? 'z' : 'x';
      expect(dividirVao(f, atual.id, eixo, 'proporcional', 0.5)).toBeNull();
      atual = atual.filhos![0]!;
    }

    verificarTodasPecasAvaliam(f);

    // Alterar item de divisão
    const itemId = col0.divisao!.itens[0]!.id;
    expect(alterarDivisaoItem(f, col0.id, itemId, { valor: 350, recuoFrente: 30 })).toBeNull();
    expect(col0.divisao!.itens[0]!.valor).toBe(350);
    expect(col0.divisao!.itens[0]!.recuoFrente).toBe(30);
    verificarTodasPecasAvaliam(f);

    // Remover divisão de col2 se não tiver divisão devolve erro; de col0 remove com sucesso
    expect(removerDivisao(f, col2.id)).toBeTypeOf('string');
    expect(removerDivisao(f, col0.id)).toBeNull();
    expect(encontrarVao(f.caixaria!.raiz, col0.id)?.vao.divisao).toBeUndefined();
    verificarTodasPecasAvaliam(f);
  });

  it('compila todos os tipos de preenchimento e ferragens corretamente', () => {
    const f = criarFamiliaCaixaria({ L: 1600, A: 2000, P: 600 });
    expect(dividirVaoEmIguais(f, 'raiz', 'x', 5)).toBeNull();
    const filhos = f.caixaria!.raiz.filhos!;

    expect(preencherVao(f, filhos[0]!.id, { tipo: 'porta', estilo: 'giro_2', montagem: 'sobreposta' })).toBeNull();
    expect(preencherVao(f, filhos[1]!.id, { tipo: 'gavetas', quantidade: 4, montagem: 'embutida', gavetoes: 1 })).toBeNull();
    expect(preencherVao(f, filhos[2]!.id, { tipo: 'cabideiro', alturaOffsetTopo: 70 })).toBeNull();
    expect(preencherVao(f, filhos[3]!.id, { tipo: 'ripado', direcao: 'vertical', larguraRipa: 30, espacamento: 20 })).toBeNull();
    expect(preencherVao(f, filhos[4]!.id, { tipo: 'sapateira', quantidade: 4 })).toBeNull();

    verificarTodasPecasAvaliam(f);

    const idsPecas = f.pecas.map((p) => p.id);
    expect(idsPecas).toContain(`cx_porta_${filhos[0]!.id}_1`);
    expect(idsPecas).toContain(`cx_porta_${filhos[0]!.id}_2`);
    expect(idsPecas).toContain(`cx_gav_frente_${filhos[1]!.id}_1`);
    expect(idsPecas).toContain(`cx_cabideiro_${filhos[2]!.id}`);
    expect(idsPecas).toContain(`cx_ripado_${filhos[3]!.id}`);
    expect(idsPecas).toContain(`cx_sapateira_${filhos[4]!.id}`);

    const idsFer = f.ferragens.map((g) => g.id);
    expect(idsFer).toContain(`cx_fer_dobradica_${filhos[0]!.id}`);
    expect(idsFer).toContain(`cx_fer_corredica_${filhos[1]!.id}`);
    expect(idsFer).toContain(`cx_fer_suporte_cab_${filhos[2]!.id}`);
    expect(idsFer).toContain(`cx_fer_pino_sap_${filhos[4]!.id}`);

    // Testa também gavetas uniformes (repetir), basculante, correr e ripado horizontal
    const f2 = criarFamiliaCaixaria({ L: 1000, A: 1200, P: 560 });
    expect(dividirVaoEmIguais(f2, 'raiz', 'x', 2)).toBeNull();
    const [e, d] = f2.caixaria!.raiz.filhos!;
    expect(preencherVao(f2, e!.id, { tipo: 'gavetas', quantidade: 3, montagem: 'sobreposta' })).toBeNull();
    expect(preencherVao(f2, d!.id, { tipo: 'porta', estilo: 'correr', montagem: 'sobreposta', folhasCorrer: 2 })).toBeNull();
    verificarTodasPecasAvaliam(f2);
    expect(f2.pecas.find((p) => p.id === `cx_gav_frente_${e!.id}`)?.repetir).toBe('3');
    expect(f2.pecas.find((p) => p.id === `cx_gav_latE_${e!.id}`)?.repetir).toBe('3');

    // Dobradiças pela altura da porta (altura ~2000mm -> 4 dobradiças por folha * 2 = 8)
    const env = avaliarFamiliaParaTeste(f);
    const dob = f.ferragens.find((g) => g.id === `cx_fer_dobradica_${filhos[0]!.id}`)!;
    const resDob = tentar(dob.quantidade, env);
    expect(resDob.ok && resDob.valor).toBe(8);

    // Remover preenchimento com 'nenhum'
    expect(preencherVao(f2, e!.id, { tipo: 'nenhum' })).toBeNull();
    expect(f2.pecas.some((p) => p.id.startsWith(`cx_gav_frente_${e!.id}`))).toBe(false);
  });

  it('resolverVaosCaixaria devolve caixas em metros exatas e flags consistentes', () => {
    const f = criarFamiliaCaixaria({ L: 800, A: 720, P: 560, estrutura: 'base_topo' });
    alterarEstruturaCaixaria(f, {
      rodape: { tipo: 'recuado', altura: 100, recuo: 50 },
      fundo: { tipo: 'encaixado', espessura: 6, recuo: 15 },
    });
    expect(dividirVao(f, 'raiz', 'x', 'proporcional', 0.5)).toBeNull();
    const [vEsq, vDir] = f.caixaria!.raiz.filhos!;
    expect(preencherVao(f, vEsq!.id, { tipo: 'porta', estilo: 'giro_1', montagem: 'sobreposta' })).toBeNull();

    const env = { L: 800, A: 720, P: 560, esp: 18 };
    const vaos = resolverVaosCaixaria(f, env);
    expect(vaos).toHaveLength(3);

    const raiz = vaos.find((v) => v.id === 'raiz')!;
    expect(raiz.folha).toBe(false);
    expect(raiz.temDivisao).toBe(true);
    expect(raiz.temPreenchimento).toBe(false);
    expect(raiz.eixoDivisao).toBe('x');
    // x: [18, 782] mm -> [0.018, 0.782] m; y: [0, 560 - 21 = 539] -> [0, 0.539]; z: [118, 702] -> [0.118, 0.702]
    expect(raiz.min).toEqual([0.018, 0, 0.118]);
    expect(raiz.max).toEqual([0.782, 0.539, 0.702]);

    const esq = vaos.find((v) => v.id === vEsq!.id)!;
    const dir = vaos.find((v) => v.id === vDir!.id)!;
    expect(esq.folha).toBe(true);
    expect(esq.temPreenchimento).toBe(true);
    expect(dir.folha).toBe(true);
    expect(dir.temPreenchimento).toBe(false);
    // Largura útil = 764 - 18 = 746 -> cada filho tem 373 mm = 0.373 m
    expect(esq.max[0] - esq.min[0]).toBeCloseTo(0.373, 6);
    expect(dir.max[0] - dir.min[0]).toBeCloseTo(0.373, 6);
    expect(dir.min[0] - esq.max[0]).toBeCloseTo(0.018, 6);
  });

  it('preserva peças customizadas, ferragens customizadas e peças cx_* desvinculadas', () => {
    const f = criarFamiliaCaixaria();
    f.pecas.push({
      id: 'custom_led',
      nome: 'Perfil LED',
      papel: 'generica',
      eixo: 'z',
      origem: ['esp', '10', 'A - esp - 5'],
      tamanho: ['L - 2 * esp', '10'],
      espessura: '5',
    });
    f.ferragens.push({ id: 'fer_custom', nome: 'Fita LED', quantidade: '1' });

    // Desvincula cx_latE e altera sua fórmula manualmente
    desvincularPecaCaixaria(f, 'cx_latE');
    const latE = f.pecas.find((p) => p.id === 'cx_latE')!;
    latE.origem[1] = '5';
    latE.nome = 'Lateral editada manualmente';

    // Altera estrutura e re-sincroniza
    expect(alterarEstruturaCaixaria(f, { estrutura: 'laterais_passantes' })).toBeNull();
    expect(f.pecas.find((p) => p.id === 'custom_led')).toBeDefined();
    expect(f.ferragens.find((g) => g.id === 'fer_custom')).toBeDefined();
    expect(f.pecas.find((p) => p.id === 'cx_latE')?.origem[1]).toBe('5');
    expect(f.pecas.find((p) => p.id === 'cx_latE')?.nome).toBe('Lateral editada manualmente');
    // cx_latD foi atualizada normalmente
    expect(f.pecas.find((p) => p.id === 'cx_latD')?.tamanho[1]).toBe('A');

    // Revincula cx_latE -> restaura fórmula compilada
    revincularPecaCaixaria(f, 'cx_latE');
    expect(f.pecas.find((p) => p.id === 'cx_latE')?.origem[1]).toBe('0');
    expect(f.pecas.find((p) => p.id === 'cx_latE')?.tamanho[1]).toBe('A');

    // garantirCaixaria e sincronizarCaixaria em família sem caixaria prévia
    const crua: Familia = { ...f, caixaria: undefined, pecas: [], parametros: f.parametros.slice(0, 3) };
    garantirCaixaria(crua);
    sincronizarCaixaria(crua);
    expect(crua.parametros.map((p) => p.id)).toEqual(
      expect.arrayContaining(['corpo', 'esp', 'mat_porta', 'mat_tampo', 'mat_fundo']),
    );
    expect(compilarCaixaria(crua).pecas.length).toBeGreaterThan(0);
    expect(validarFamilia(crua)).toEqual([]);
  });

  it('suporta avanço frontal negativo (-20 mm) em divisórias e localizar peça via encontrarDivisaoPorPecaId', () => {
    const f = criarFamiliaCaixaria({ L: 800, A: 720, P: 560 });
    expect(dividirVao(f, 'raiz', 'z', 'proporcional', 0.5, -20)).toBeNull();
    const divP = f.caixaria!.raiz.divisao!;
    expect(divP.itens[0]!.recuoFrente).toBe(-20);

    const pecaPrat = f.pecas.find((p) => p.id.startsWith('cx_prat_'))!;
    expect(pecaPrat).toBeDefined();
    expect(pecaPrat.origem[1]).toBe('-20');
    const achadaPrat = encontrarDivisaoPorPecaId(f.caixaria!.raiz, pecaPrat.id);
    expect(achadaPrat).not.toBeNull();
    expect(achadaPrat!.eixo).toBe('z');
    expect(achadaPrat!.item.id).toBe(divP.itens[0]!.id);

    const filhoSup = f.caixaria!.raiz.filhos![1]!;
    expect(dividirVao(f, filhoSup.id, 'x', 'proporcional', 0.5, -25)).toBeNull();
    const pecaDiv = f.pecas.find((p) => p.id.startsWith('cx_div_'))!;
    expect(pecaDiv).toBeDefined();
    expect(pecaDiv.origem[1]).toBe('-25');
    const achadaDiv = encontrarDivisaoPorPecaId(f.caixaria!.raiz, pecaDiv.id);
    expect(achadaDiv).not.toBeNull();
    expect(achadaDiv!.eixo).toBe('x');

    const env = avaliarFamiliaParaTeste(f);
    const yEval = tentar(pecaPrat.origem[1], env);
    expect(yEval.ok && yEval.valor).toBe(-20);
    verificarTodasPecasAvaliam(f);
  });

  it('compila exatamente 1 gaveta sem repetir e sem criar prateleira/divisória', () => {
    const f = criarFamiliaCaixaria({ L: 600, A: 720, P: 560 });
    expect(preencherVao(f, 'raiz', { tipo: 'gavetas', quantidade: 1, montagem: 'sobreposta' })).toBeNull();
    const gavPecas = f.pecas.filter((p) => p.id.startsWith('cx_gav_'));
    expect(gavPecas).toHaveLength(5);
    for (const p of gavPecas) {
      expect(p.repetir).toBeUndefined();
    }
    expect(f.pecas.some((p) => p.id.startsWith('cx_prat_') || p.id.startsWith('cx_div_'))).toBe(false);
    verificarTodasPecasAvaliam(f);
  });
});
