import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import {
  applyCommand as aplicarNoLugar,
  createEmptyProject,
  FAMILIA_ARMARIO,
  type Command,
  type Project,
} from '@hestia/model';
import type { CaixaLocal, FaceDeParede, Pose } from './encaixeTipos.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import { resolverComponente } from './instancia.ts';
import { montarFila } from './montarFila.ts';

/*
 * Testes CEGOS de `montarFila` e `larguraDoModulo`, escritos só a partir da especificação da ficha T-F5-fila-motor.
 * Cada valor esperado tem a conta feita à mão no comentário ao lado; a função testada NUNCA é usada para calcular
 * o esperado. Tolerância: 1e-9 (9 casas decimais no `toBeCloseTo`). Neste worktree `montarFila.ts` é o esboço que
 * lança "não implementado": estes testes devem falhar aqui, e isso é esperado.
 */

type Pedido = Parameters<typeof montarFila>[1];
type Resultado = ReturnType<typeof montarFila>;

const CASAS = 9;
const FAM = FAMILIA_ARMARIO.id;
const PROFUNDIDADE = 0.56;
const ALTURA = 0.72;

/** Aplica um comando a uma cópia (o comando altera o projeto no lugar). */
function aplicar(p: Project, c: Command): Project {
  const q = structuredClone(p);
  aplicarNoLugar(q, c);
  return q;
}

/** Projeto vazio com a família de armário carregada. */
function projetoComArmario(): Project {
  return aplicar(createEmptyProject('fila-cega'), { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
}

/** Pedido padrão da ficha: face (0,0)→(4,0), início 0, comprimento 2,0 m e três módulos 60/80/60. */
function pedido(extra: Partial<Pedido> = {}): Pedido {
  return {
    levelId: 'lv_0',
    face: { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
    inicio: 0,
    comprimento: 2.0,
    modulos: [
      { familyId: FAM, typeId: 'A60' },
      { familyId: FAM, typeId: 'A80' },
      { familyId: FAM, typeId: 'A60' },
    ],
    preencher: false,
    idBase: 'fila1',
    ...extra,
  };
}

/** Caixa local de um módulo: largura × profundidade, apoiada no chão. */
function caixaDaLargura(largura: number, profundidade: number): CaixaLocal {
  return { min: [0, 0, 0], max: [largura, profundidade, ALTURA] };
}

/** Compara uma pose com os valores calculados à mão. */
function esperarPose(p: Pose, x: number, y: number, rotation: number, z = 0): void {
  expect(p.x).toBeCloseTo(x, CASAS);
  expect(p.y).toBeCloseTo(y, CASAS);
  expect(p.rotation).toBeCloseTo(rotation, CASAS);
  expect(p.mirrored).toBe(false);
  expect(p.z).toBeCloseTo(z, CASAS);
}

/** Compara os 4 cantos do retângulo no mundo, na ordem local de `retanguloNoMundo`. */
function esperarCantos(cantos: ReadonlyArray<Vec2>, esperado: ReadonlyArray<readonly [number, number]>): void {
  expect(cantos).toHaveLength(esperado.length);
  cantos.forEach((p, i) => {
    expect(p.x).toBeCloseTo(esperado[i]![0], CASAS);
    expect(p.y).toBeCloseTo(esperado[i]![1], CASAS);
  });
}

/** Soma em micrômetros inteiros (a especificação exige µm exatos quando as larguras cabem no vão). */
function somaEmMicra(larguras: readonly number[]): number {
  return larguras.reduce((t, w) => t + Math.round(w * 1_000_000), 0);
}

/** Confere larguras contra os valores calculados à mão. */
function esperarLarguras(r: Resultado, esperado: readonly number[]): void {
  expect(r.larguras).toHaveLength(esperado.length);
  r.larguras.forEach((w, i) => expect(w).toBeCloseTo(esperado[i]!, CASAS));
}

describe('montarFila — fila horizontal exata', () => {
  it('face (0,0)→(4,0), início 0, comprimento 2,0: 60 + 80 + 60 fecham o vão sem painel', () => {
    // Soma 0,6 + 0,8 + 0,6 = 2,0 = comprimento → painel 0 e sobra 0.
    // d = (1, 0), rotação π; origem local cai no fim do trecho, 0,56 para +y (esquerda de d).
    const p = projetoComArmario();
    const r = montarFila(p, pedido());

    expect(r.componentes).toHaveLength(3);
    esperarLarguras(r, [0.6, 0.8, 0.6]);
    expect(r.painel).toBeCloseTo(0, CASAS);
    expect(r.sobra).toBeCloseTo(0, CASAS);
    expect(r.avisos).toHaveLength(0);

    expect(r.componentes.map((c) => c.id)).toEqual(['fila1_1', 'fila1_2', 'fila1_3']);
    expect(r.componentes.map((c) => c.familyId)).toEqual([FAM, FAM, FAM]);
    expect(r.componentes.map((c) => c.typeId)).toEqual(['A60', 'A80', 'A60']);
    expect(r.componentes.map((c) => c.levelId)).toEqual(['lv_0', 'lv_0', 'lv_0']);
    expect(r.componentes.map((c) => c.z)).toEqual([0, 0, 0]);
    expect(r.componentes.map((c) => c.mark)).toEqual(['', '', '']);
    // Largura não mudou em relação ao tipo: nenhum `values`.
    r.componentes.forEach((c) => expect(c.values).toBeUndefined());

    // Avanços: 0,6; 0,6 + 0,8 = 1,4; 1,4 + 0,6 = 2,0.
    esperarPose(r.componentes[0]!, 0.6, 0.56, Math.PI);
    esperarPose(r.componentes[1]!, 1.4, 0.56, Math.PI);
    esperarPose(r.componentes[2]!, 2.0, 0.56, Math.PI);

    // Retângulo do módulo 0 (0,6 × 0,56): R(π)·(lx, ly) = (−lx, −ly), somado a (0,6; 0,56).
    esperarCantos(retanguloNoMundo(r.componentes[0]!, caixaDaLargura(0.6, PROFUNDIDADE)), [[0.6, 0.56], [0, 0.56], [0, 0], [0.6, 0]]);
    // Módulo 1: pose (1,4; 0,56), largura 0,8 → x de 0,6 a 1,4.
    esperarCantos(retanguloNoMundo(r.componentes[1]!, caixaDaLargura(0.8, PROFUNDIDADE)), [[1.4, 0.56], [0.6, 0.56], [0.6, 0], [1.4, 0]]);
    // Módulo 2: pose (2,0; 0,56), largura 0,6 → x de 1,4 a 2,0.
    esperarCantos(retanguloNoMundo(r.componentes[2]!, caixaDaLargura(0.6, PROFUNDIDADE)), [[2.0, 0.56], [1.4, 0.56], [1.4, 0], [2.0, 0]]);

    // Conjunto: id = idBase, nome padrão "Fila", membros na ordem e linha de (0,0) a (2,0).
    expect(r.grupo.id).toBe('fila1');
    expect(r.grupo.nome).toBe('Fila');
    expect(r.grupo.levelId).toBe('lv_0');
    expect(r.grupo.membros).toEqual(['fila1_1', 'fila1_2', 'fila1_3']);
    expect(r.grupo.regras).toEqual(['alinhar-frente']);
    expect(r.grupo.linha!.a.x).toBeCloseTo(0, CASAS);
    expect(r.grupo.linha!.a.y).toBeCloseTo(0, CASAS);
    expect(r.grupo.linha!.b.x).toBeCloseTo(2.0, CASAS);
    expect(r.grupo.linha!.b.y).toBeCloseTo(0, CASAS);
  });

  it('início 0,5 desloca a fila: primeiro módulo começa em x = 0,5 e a linha vai de 0,5 a 2,5', () => {
    // a' = (0,5; 0); b' = a' + 2,0·d = (2,5; 0). Módulo 0 termina em 0,5 + 0,6 = 1,1.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ inicio: 0.5 }));

    esperarLarguras(r, [0.6, 0.8, 0.6]);
    esperarPose(r.componentes[0]!, 1.1, 0.56, Math.PI);
    // Marcas do trecho: x de 0,5 a 1,1 (posição final 1,1 menos a largura 0,6).
    esperarCantos(retanguloNoMundo(r.componentes[0]!, caixaDaLargura(0.6, PROFUNDIDADE)), [[1.1, 0.56], [0.5, 0.56], [0.5, 0], [1.1, 0]]);
    // Último módulo termina em 0,5 + 2,0 = 2,5.
    esperarPose(r.componentes[2]!, 2.5, 0.56, Math.PI);
    expect(r.grupo.linha!.a.x).toBeCloseTo(0.5, CASAS);
    expect(r.grupo.linha!.b.x).toBeCloseTo(2.5, CASAS);
    expect(r.painel).toBeCloseTo(0, CASAS);
    expect(r.sobra).toBeCloseTo(0, CASAS);
  });

  it('nome do pedido é usado no conjunto', () => {
    // O campo `nome` é opcional; quando presente, o grupo o usa em vez de "Fila".
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ nome: 'Cozinha em linha' }));
    expect(r.grupo.nome).toBe('Cozinha em linha');
  });
});

describe('montarFila — preencher', () => {
  it('comprimento 2,2: as larguras somam exatamente 2,2 m dentro de [0,3; 1,2] e values.L acompanha', () => {
    // Soma inicial 2,0; faltam 0,2 = 200 000 µm em 3 flexíveis → 66 667, 66 667 e 66 666 µm.
    // Larguras: 0,6 + 0,066667 = 0,666667; 0,8 + 0,066667 = 0,866667; 0,6 + 0,066666 = 0,666666.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ comprimento: 2.2, preencher: true }));

    esperarLarguras(r, [0.666667, 0.866667, 0.666666]);
    expect(somaEmMicra(r.larguras)).toBe(2_200_000);
    r.larguras.forEach((w) => {
      expect(w).toBeGreaterThanOrEqual(0.3);
      expect(w).toBeLessThanOrEqual(1.2);
    });
    expect(r.painel).toBeCloseTo(0, CASAS);
    expect(r.sobra).toBeCloseTo(0, CASAS);
    expect(r.avisos).toHaveLength(0);

    // values.L em mm; a largura mudou em relação ao tipo (600/800/600 mm), então existe nos três.
    expect(r.componentes[0]!.values?.L).toBeCloseTo(666.667, 6);
    expect(r.componentes[1]!.values?.L).toBeCloseTo(866.667, 6);
    expect(r.componentes[2]!.values?.L).toBeCloseTo(666.666, 6);

    // Fila redimensionada termina em 2,2.
    esperarPose(r.componentes[2]!, 2.2, 0.56, Math.PI);
  });

  it('comprimento 5,0 excede o máximo dos módulos: sobra/painel > 0 e aviso', () => {
    // Máximos 1,2 + 1,2 + 1,2 = 3,6 < 5,0; o que falta (1,4 m) não cabe no painel (máx. 0,15) → sobra.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ comprimento: 5.0, preencher: true }));

    esperarLarguras(r, [1.2, 1.2, 1.2]);
    // O excedente total (painel + sobra) é 5,0 − 3,6 = 1,4 m.
    expect(r.painel + r.sobra).toBeCloseTo(1.4, CASAS);
    expect(r.painel + r.sobra).toBeGreaterThan(0);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('painel exatamente no mínimo (0,02) ainda fecha o vão', () => {
    // Três módulos já no máximo 1,2 somam 3,6; comprimento 3,62 deixa 0,02 ∈ [0,02; 0,15] → painel 0,02.
    const p = projetoComArmario();
    const modulos = [
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
    ];
    const r = montarFila(p, pedido({ comprimento: 3.62, preencher: true, modulos }));
    esperarLarguras(r, [1.2, 1.2, 1.2]);
    expect(r.painel).toBeCloseTo(0.02, CASAS);
    expect(r.sobra).toBeCloseTo(0, CASAS);
  });

  it('painel exatamente no máximo (0,15) ainda fecha o vão', () => {
    // Comprimento 3,75 − 3,6 = 0,15 ∈ [0,02; 0,15] → painel 0,15 e sobra 0.
    const p = projetoComArmario();
    const modulos = [
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
    ];
    const r = montarFila(p, pedido({ comprimento: 3.75, preencher: true, modulos }));
    esperarLarguras(r, [1.2, 1.2, 1.2]);
    expect(r.painel).toBeCloseTo(0.15, CASAS);
    expect(r.sobra).toBeCloseTo(0, CASAS);
  });

  it('resto de 0,01 fica abaixo do painel mínimo: vira sobra e aviso', () => {
    // Comprimento 3,61 − 3,6 = 0,01 < 0,02 → não cabe painel; sobra 0,01.
    const p = projetoComArmario();
    const modulos = [
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
    ];
    const r = montarFila(p, pedido({ comprimento: 3.61, preencher: true, modulos }));
    esperarLarguras(r, [1.2, 1.2, 1.2]);
    expect(r.painel).toBeCloseTo(0, CASAS);
    expect(r.sobra).toBeCloseTo(0.01, CASAS);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('resto de 0,17 fica acima do painel máximo: vira sobra e aviso', () => {
    // Comprimento 3,77 − 3,6 = 0,17 > 0,15 → não cabe painel; sobra 0,17.
    const p = projetoComArmario();
    const modulos = [
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
      { familyId: FAM, typeId: 'A60', largura: 1.2 },
    ];
    const r = montarFila(p, pedido({ comprimento: 3.77, preencher: true, modulos }));
    esperarLarguras(r, [1.2, 1.2, 1.2]);
    expect(r.painel).toBeCloseTo(0, CASAS);
    expect(r.sobra).toBeCloseTo(0.17, CASAS);
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});

describe('montarFila — casos de borda', () => {
  it('família ausente: aviso, módulo ignorado e os demais ficam', () => {
    // O módulo do meio aponta para família que não existe; sobram 60 + 80 = 1,4 m.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({
      comprimento: 1.4,
      modulos: [
        { familyId: FAM, typeId: 'A60' },
        { familyId: 'fam_inexistente', typeId: 'A60' },
        { familyId: FAM, typeId: 'A80' },
      ],
    }));
    expect(r.componentes).toHaveLength(2);
    expect(r.componentes.map((c) => c.typeId)).toEqual(['A60', 'A80']);
    expect(r.componentes.map((c) => c.familyId)).toEqual([FAM, FAM]);
    expect(r.larguras).toHaveLength(2);
    expect(r.grupo.membros).toEqual(r.componentes.map((c) => c.id));
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('comprimento 0 devolve resultado vazio com aviso, sem lançar', () => {
    // Sem comprimento não há fila: componentes e larguras vazios e pelo menos um aviso.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ comprimento: 0 }));
    expect(r.componentes).toEqual([]);
    expect(r.larguras).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('comprimento negativo devolve resultado vazio com aviso, sem lançar', () => {
    // Comprimento ≤ 0 cai na mesma borda do caso anterior.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ comprimento: -1 }));
    expect(r.componentes).toEqual([]);
    expect(r.larguras).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('módulos vazios devolve resultado vazio com aviso', () => {
    // Sem módulos não há o que montar, mesmo com comprimento positivo.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({ modulos: [] }));
    expect(r.componentes).toEqual([]);
    expect(r.larguras).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('face degenerada (a = b) devolve resultado vazio com aviso, sem lançar', () => {
    // posicoesDaFila lançaria com linha degenerada; montarFila deve tratar antes.
    const p = projetoComArmario();
    const face: FaceDeParede = { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } };
    const r = montarFila(p, pedido({ face }));
    expect(r.componentes).toEqual([]);
    expect(r.larguras).toEqual([]);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('face vertical (0,0)→(0,4): fundo em x = 0 e frente em x = −profundidade', () => {
    // d = (0, 1), rotação atan2(−1, −0) = −π/2; avanço 0,6.
    // Origem local: x = 0 + 0,6·0 − 0,56·1 = −0,56; y = 0 + 0,6·1 + 0,56·0 = 0,6.
    const p = projetoComArmario();
    const r = montarFila(p, pedido({
      face: { a: { x: 0, y: 0 }, b: { x: 0, y: 4 } },
      comprimento: 0.6,
      modulos: [{ familyId: FAM, typeId: 'A60' }],
    }));
    expect(r.componentes).toHaveLength(1);
    esperarPose(r.componentes[0]!, -0.56, 0.6, -Math.PI / 2);
    // R(−π/2)·(lx, ly) = (ly, −lx), somado a (−0,56; 0,6): fundo (ly = 0,56) em x = 0, frente (ly = 0) em x = −0,56.
    esperarCantos(retanguloNoMundo(r.componentes[0]!, caixaDaLargura(0.6, PROFUNDIDADE)), [[-0.56, 0.6], [-0.56, 0], [0, 0], [0, 0.6]]);
    expect(r.grupo.linha!.a.x).toBeCloseTo(0, CASAS);
    expect(r.grupo.linha!.a.y).toBeCloseTo(0, CASAS);
    expect(r.grupo.linha!.b.x).toBeCloseTo(0, CASAS);
    expect(r.grupo.linha!.b.y).toBeCloseTo(0.6, CASAS);
  });
});

describe('montarFila — propriedades', () => {
  it('determinismo: duas chamadas com a mesma entrada devolvem o mesmo resultado', () => {
    // Função pura: mesmo projeto e mesmo pedido → mesmo resultado.
    const p = projetoComArmario();
    expect(montarFila(p, pedido())).toEqual(montarFila(p, pedido()));
  });

  it('idempotência: com a soma já igual ao comprimento, ligar `preencher` não muda as larguras', () => {
    // A soma 2,0 já é o comprimento 2,0; o ajuste tem diferença 0 e as larguras/poses continuam as mesmas.
    const p = projetoComArmario();
    const sem = montarFila(p, pedido({ preencher: false }));
    const com = montarFila(p, pedido({ preencher: true }));
    esperarLarguras(sem, [0.6, 0.8, 0.6]);
    esperarLarguras(com, [0.6, 0.8, 0.6]);
    sem.componentes.forEach((c, i) => {
      const d = com.componentes[i]!;
      expect(d.x).toBeCloseTo(c.x, CASAS);
      expect(d.y).toBeCloseTo(c.y, CASAS);
      expect(d.rotation).toBeCloseTo(c.rotation, CASAS);
    });
    // Larguras inalteradas em relação ao tipo: nenhum `values`.
    com.componentes.forEach((c) => expect(c.values).toBeUndefined());
  });

  it('simetria: espelhar a cena em torno da origem espelha as poses e mantém as larguras', () => {
    // Face (0,0)→(4,0) vs. (0,0)→(−4,0): d inverte, então pose (x, y) vira (−x, −y) e a linha também.
    const p = projetoComArmario();
    const original = montarFila(p, pedido());
    const espelhado = montarFila(p, pedido({ face: { a: { x: 0, y: 0 }, b: { x: -4, y: 0 } } }));

    esperarLarguras(espelhado, [0.6, 0.8, 0.6]);
    original.componentes.forEach((c, i) => {
      const e = espelhado.componentes[i]!;
      expect(e.x).toBeCloseTo(-c.x, CASAS);
      expect(e.y).toBeCloseTo(-c.y, CASAS);
      expect(e.z).toBeCloseTo(c.z, CASAS);
    });
    expect(espelhado.grupo.linha!.a.x).toBeCloseTo(-original.grupo.linha!.a.x, CASAS);
    expect(espelhado.grupo.linha!.a.y).toBeCloseTo(-original.grupo.linha!.a.y, CASAS);
    expect(espelhado.grupo.linha!.b.x).toBeCloseTo(-original.grupo.linha!.b.x, CASAS);
    expect(espelhado.grupo.linha!.b.y).toBeCloseTo(-original.grupo.linha!.b.y, CASAS);
  });
});

describe('montarFila — aplicar ao projeto', () => {
  it('addComponent + upsertComponentGroup deixa o projeto válido e resolverComponente sem erro', () => {
    // Os componentes entram soltos (o `upsertComponentGroup` acerta o `groupId` depois) e resolvem sem erro.
    const p = projetoComArmario();
    const r = montarFila(p, pedido());
    let q = p;
    for (const c of r.componentes) q = aplicar(q, { type: 'addComponent', component: c });
    q = aplicar(q, { type: 'upsertComponentGroup', group: r.grupo });

    expect(q.componentGroups?.[r.grupo.id]?.membros).toEqual(r.componentes.map((c) => c.id));
    for (const c of r.componentes) {
      const salvo = q.elements[c.id];
      expect(salvo?.kind).toBe('component');
      if (salvo?.kind === 'component') {
        expect(salvo.groupId).toBe(r.grupo.id);
        expect(resolverComponente(q, salvo).erros).toEqual([]);
      }
    }
  });
});

describe('ambiguidades da especificação', () => {
  it.skip('conteúdo do `grupo` quando o resultado é vazio: a ficha não diz se vem com membros [] e linha degenerada', () => {
    // "resultado vazio com aviso" não detalha o conjunto; fixar os campos seria adivinhar.
  });

  it.skip('módulo com `typeId: null`: a ficha não diz se usa o tipo padrão da família em `larguraDoModulo`', () => {
    // `Component.typeId` null significa "padrão da família", mas a ficha de `larguraDoModulo` só cita o typeId recebido.
  });

  it.skip('`typeId` inexistente dentro de família existente: a ficha não diz se é null, aviso ou erro', () => {
    // Só "família ausente" tem comportamento declarado.
  });

  it.skip('`preencher: false` com soma diferente do comprimento: a ficha só define painel/sobra no modo `preencher`', () => {
    // Não dá para afirmar o que vai em `painel`/`sobra` sem esssa regra.
  });
});
