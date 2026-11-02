/**
 * Ponta a ponta contra o wasm REAL (ABI v2). Roda só em `npm run test:wasm` (vitest.wasm.config.ts); o CI aponta
 * `KERNEL_WASM_PATH` para o binário recém-compilado. Se o binário não exporta o ABI v2 (ainda é o da ABI v1), os
 * testes são pulados.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../caminhoWasm.ts';
import { codificarSecao, definicaoDaSecao } from './codec.ts';
import { CenaV2 } from './cena.ts';
import { criarInstanciaFalsa } from './falso.ts';
import { ErroKernelLeve } from './erros.ts';
import { CODIGOS, CONSULTAS, NIVEL_TODOS } from './esquema.gerado.ts';
import { criarInstanciadorDoWasm, GerenciadorKernelV2, type InstanciaAbi2 } from './gerenciador.ts';
import { colunasDeParedes, fonteDeParedes, paredesDeTeste } from './paredes.ts';
import {
  referenciaEstatisticasNivel,
  referenciaParedesNaCaixa,
  referenciaParesProximos,
  type LinhaParede,
} from './referencia.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let modulo: WebAssembly.Module | null = null;
if (bytes) {
  try {
    modulo = new WebAssembly.Module(bytes);
    if (!WebAssembly.Module.exports(modulo).some((e) => e.name === 'abi2_versao')) modulo = null;
  } catch {
    modulo = null;
  }
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function aleatorio(semente: number): () => number {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paredesAleatorias(niveis: number, porNivel: number, semente: number): LinhaParede[] {
  const r = aleatorio(semente);
  const saida: LinhaParede[] = [];
  let id = 1;
  for (let nv = 0; nv < niveis; nv++) {
    for (let i = 0; i < porNivel; i++) {
      const ax = Math.round(r() * 400) / 10;
      const ay = Math.round(r() * 400) / 10;
      saida.push({ id: id++, nivel: nv, ax, ay, bx: ax + Math.round((r() - 0.5) * 80) / 10, by: ay + Math.round((r() - 0.5) * 80) / 10, espessura: 0.05 + Math.round(r() * 30) / 100 });
    }
  }
  return saida;
}

const iguais = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

describe.skipIf(modulo === null)('kernel v2: wasm real contra a referência', () => {
  let ger: GerenciadorKernelV2;
  beforeAll(async () => {
    ger = await GerenciadorKernelV2.dosBytes(modulo!);
  });

  it('versões do ABI e do esquema', () => {
    expect(ger.estado()).toMatchObject({ ligado: true, versaoAbi: 2, versaoEsquema: 1 });
  });

  it('as 3 consultas batem com a referência (aleatório, 3 níveis)', () => {
    const ps = paredesAleatorias(3, 150, 42);
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    for (const nivel of [0, 1, 2, NIVEL_TODOS, 9]) {
      const ref = referenciaEstatisticasNivel(ps, nivel);
      const r = cena.consultar('estatisticas_nivel', [nivel]);
      expect(r['n_paredes']![0]).toBe(ref.nParedes);
      ref.caixa.forEach((v, i) => expect(r['caixa']![i]).toBeCloseTo(v, 9));
      expect(r['comprimento_total']![0]).toBeCloseTo(ref.comprimentoTotal, 9);
      const caixas: [number, number, number, number][] = [[0, 0, 50, 50], [10, 10, 12, 12], [-5, -5, 100, 100], [200, 200, 300, 300], [20, 0, 20, 50]];
      for (const c of caixas) {
        expect(iguais(cena.consultar('paredes_na_caixa', [nivel, ...c])['ids']!, referenciaParedesNaCaixa(ps, nivel, ...c))).toBe(true);
      }
      for (const tol of [0, 0.05, 1]) {
        expect(iguais(cena.consultar('pares_proximos', [nivel, tol])['pares']!, referenciaParesProximos(ps, nivel, tol))).toBe(true);
      }
    }
    cena.destruir();
  });

  it('fronteira inclusiva: paredes que só se tocam', () => {
    const ps: LinhaParede[] = [
      { id: 1, nivel: 0, ax: 0, ay: 0, bx: 1, by: 0, espessura: 0 },
      { id: 2, nivel: 0, ax: 1, ay: 0, bx: 2, by: 0, espessura: 0 },
      { id: 3, nivel: 0, ax: 2.5, ay: 0, bx: 3, by: 0, espessura: 0 },
    ];
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    for (const tol of [0, 0.5, 0.4999]) {
      expect(Array.from(cena.consultar('pares_proximos', [0, tol])['pares']!)).toEqual(Array.from(referenciaParesProximos(ps, 0, tol)));
    }
    expect(Array.from(cena.consultar('paredes_na_caixa', [0, 1, -1, 1, 1])['ids']!)).toEqual([1, 2]);
    cena.destruir();
  });

  it('upsert e remoção mantêm a cena igual à referência; resultado determinístico', () => {
    let ps = paredesAleatorias(2, 80, 7);
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    const trocadas = ps.slice(0, 10).map((p) => ({ ...p, bx: p.bx + 3, espessura: 0.4 }));
    const novas = paredesAleatorias(1, 5, 99).map((p, i) => ({ ...p, id: 1000 + i }));
    cena.upsert('paredes', colunasDeParedes([...trocadas, ...novas]), 15);
    ps = [...trocadas, ...ps.slice(10), ...novas];
    cena.remover('paredes', [ps[20]!.id, ps[21]!.id]);
    ps = ps.filter((p) => p.id !== ps[20]!.id && p.id !== ps[21]!.id);
    for (const nivel of [0, 1]) {
      const a = cena.consultar('pares_proximos', [nivel, 0.05])['pares']!;
      expect(iguais(a, referenciaParesProximos(ps, nivel, 0.05))).toBe(true);
      expect(iguais(a, cena.consultar('pares_proximos', [nivel, 0.05])['pares']!)).toBe(true);
      expect(cena.consultar('estatisticas_nivel', [nivel])['n_paredes']![0]).toBe(referenciaEstatisticasNivel(ps, nivel).nParedes);
    }
    cena.destruir();
  });

  it('entrada inválida é falha leve e o kernel segue ligado', () => {
    const cena = CenaV2.criar(ger, fonteDeParedes(() => paredesDeTeste(1, 5)));
    const p = paredesDeTeste(1, 1)[0]!;
    expect(() => cena.upsert('paredes', colunasDeParedes([p, p]), 2)).toThrow(ErroKernelLeve);
    expect(() => cena.upsert('paredes', colunasDeParedes([{ ...p, ax: NaN }]), 1)).toThrow(ErroKernelLeve);
    expect(() => cena.upsert('paredes', colunasDeParedes([{ ...p, id: 0xffffffff }]), 1)).toThrow(ErroKernelLeve);
    try {
      cena.upsert('paredes', colunasDeParedes([p, p]), 2);
    } catch (e) {
      expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.ENTRADA);
    }
    expect(ger.ligado).toBe(true);
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(5);
    cena.destruir();
  });

  it('as 29 exportações existem', () => {
    const nomes = WebAssembly.Module.exports(modulo!).map((e) => e.name);
    const abi2 = nomes.filter((n) => /^(abi2_|cena_|saida_|erro_|memoria_usada)/.test(n));
    expect(abi2.length).toBeGreaterThanOrEqual(18);
    for (const n of ['abi2_versao', 'abi2_esquema_versao', 'abi2_alocar', 'abi2_liberar', 'cena_criar', 'cena_destruir', 'cena_definir_secao', 'cena_upsert_linhas', 'cena_remover_linhas', 'cena_executar', 'saida_n', 'saida_tipo', 'saida_ptr', 'saida_len', 'saida_liberar', 'erro_ptr', 'erro_len', 'memoria_usada', 'memory']) {
      expect(nomes).toContain(n);
    }
  });

  it('sem vazamento: memoria_usada não cresce entre ciclos de criar/destruir', () => {
    const ciclo = (semente: number): number => {
      const ps = paredesAleatorias(2, 300, semente);
      const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
      for (let i = 0; i < 5; i++) {
        cena.consultar('pares_proximos', [NIVEL_TODOS, 0.05]);
        cena.consultar('paredes_na_caixa', [0, 0, 0, 40, 40]);
      }
      expect(ger.instancia().exports.memoria_usada()).toBeGreaterThan(base);
      cena.destruir();
      return ger.instancia().exports.memoria_usada();
    };
    const base = ger.instancia().exports.memoria_usada();
    const primeiro = ciclo(0);
    expect(primeiro).toBeLessThanOrEqual(base + 4096); // resíduo fixo (tabela de handles + texto de erro)
    for (let r = 1; r < 4; r++) expect(ciclo(r)).toBe(primeiro);
  });

  it('recriar a instância reenvia a cena e as consultas continuam iguais', () => {
    const ps = paredesAleatorias(1, 100, 5);
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    const antes = cena.consultar('pares_proximos', [0, 0.05])['pares']!;
    ger.recriar('teste de ponta a ponta');
    expect(iguais(cena.consultar('pares_proximos', [0, 0.05])['pares']!, antes)).toBe(true);
    cena.destruir();
  });
});

// ---------------------------------------------------------------------------------------------
// Casos-limite: o falso TypeScript e o wasm real devolvem o MESMO código de retorno. Cada cenário roda numa
// instância nova (falso e real) e devolve o código da chamada que interessa. O código esperado vem da decisão
// 0046 §3.3/§3.2; falso e real têm de bater com ele, sem afrouxar a comparação.
// ---------------------------------------------------------------------------------------------

type Cenario = (alvo: InstanciaAbi2) => number;

const SECAO_PAREDES_DEF = definicaoDaSecao('paredes');
const PAREDE_OK: LinhaParede = { id: 1, nivel: 0, ax: 0, ay: 0, bx: 3, by: 0, espessura: 0.2 };

/** Copia bytes para a memória da instância (ponteiro de `abi2_alocar`, alinhado a 8). A view é refeita depois da alocação. */
function escrever(alvo: InstanciaAbi2, bytes: Uint8Array): number {
  const ptr = alvo.exports.abi2_alocar(bytes.length);
  new Uint8Array(alvo.memory.buffer, ptr, bytes.length).set(bytes);
  return ptr;
}
const ptrParedes = (alvo: InstanciaAbi2, ps: readonly LinhaParede[]): number =>
  escrever(alvo, codificarSecao(SECAO_PAREDES_DEF, colunasDeParedes(ps), ps.length));
const ptrF64 = (alvo: InstanciaAbi2, valores: number[]): number => escrever(alvo, new Uint8Array(new Float64Array(valores).buffer));
const ptrU32 = (alvo: InstanciaAbi2, valores: number[]): number => escrever(alvo, new Uint8Array(new Uint32Array(valores).buffer));

/** Cena nova com `ps` carregadas na seção paredes (sem checar o código: é o cenário de pré-condição). */
function cenaCom(alvo: InstanciaAbi2, ps: readonly LinhaParede[] = [PAREDE_OK]): number {
  const h = alvo.exports.cena_criar();
  alvo.exports.cena_definir_secao(h, SECAO_PAREDES_DEF.id, ps.length, ptrParedes(alvo, ps));
  return h;
}
const definirCom =
  (ps: LinhaParede[]): Cenario =>
  (alvo) =>
    alvo.exports.cena_definir_secao(alvo.exports.cena_criar(), SECAO_PAREDES_DEF.id, ps.length, ptrParedes(alvo, ps));
const executarCom =
  (consulta: number, args: number[]): Cenario =>
  (alvo) => {
    const h = cenaCom(alvo);
    return args.length === 0 ? alvo.exports.cena_executar(h, consulta, 0, 0) : alvo.exports.cena_executar(h, consulta, args.length, ptrF64(alvo, args));
  };
const destruida = (alvo: InstanciaAbi2): number => {
  const h = cenaCom(alvo);
  alvo.exports.cena_destruir(h);
  return h;
};
const ESTATISTICAS = CONSULTAS.estatisticas_nivel.id;
const NA_CAIXA = CONSULTAS.paredes_na_caixa.id;
const PARES = CONSULTAS.pares_proximos.id;
const ENTRADA = CODIGOS.ENTRADA;

const CASOS: [string, Cenario, number][] = [
  ['coordenada |x| = 1e13 em definir -> ENTRADA', definirCom([{ ...PAREDE_OK, ax: 1e13 }]), ENTRADA],
  ['coordenada -1e13 em by (upsert) -> ENTRADA', (alvo) => {
    const h = cenaCom(alvo);
    return alvo.exports.cena_upsert_linhas(h, SECAO_PAREDES_DEF.id, 1, ptrParedes(alvo, [{ ...PAREDE_OK, by: -1e13 }]));
  }, ENTRADA],
  ['coordenada exatamente 1e12 e aceita -> OK', definirCom([{ ...PAREDE_OK, bx: 1e12 }]), CODIGOS.OK],
  ['espessura 1e13 -> ENTRADA', definirCom([{ ...PAREDE_OK, espessura: 1e13 }]), ENTRADA],
  ['espessura negativa -> ENTRADA', definirCom([{ ...PAREDE_OK, espessura: -0.1 }]), ENTRADA],
  ['espessura zero e aceita -> OK', definirCom([{ ...PAREDE_OK, espessura: 0 }]), CODIGOS.OK],
  ['nivel_num 0xFFFFFFFF numa linha -> ENTRADA', definirCom([{ ...PAREDE_OK, nivel: NIVEL_TODOS }]), ENTRADA],
  ['id_num 0xFFFFFFFF numa linha -> ENTRADA', definirCom([{ ...PAREDE_OK, id: 0xffffffff }]), ENTRADA],
  ['id repetido no mesmo lote -> ENTRADA', definirCom([PAREDE_OK, { ...PAREDE_OK, bx: 9 }]), ENTRADA],
  ['coordenada NaN -> ENTRADA', definirCom([{ ...PAREDE_OK, ay: NaN }]), ENTRADA],
  ['seção desconhecida em definir -> ENTRADA', (alvo) => alvo.exports.cena_definir_secao(cenaCom(alvo), 99, 0, 0), ENTRADA],
  ['seção desconhecida em upsert -> ENTRADA', (alvo) => alvo.exports.cena_upsert_linhas(cenaCom(alvo), 99, 0, 0), ENTRADA],
  ['seção desconhecida em remover -> ENTRADA', (alvo) => alvo.exports.cena_remover_linhas(cenaCom(alvo), 99, 1, ptrU32(alvo, [1])), ENTRADA],
  ['remover id ausente -> OK', (alvo) => alvo.exports.cena_remover_linhas(cenaCom(alvo), SECAO_PAREDES_DEF.id, 1, ptrU32(alvo, [999])), CODIGOS.OK],
  ['consulta com 0 args (esquema pede 1) -> ENTRADA', executarCom(ESTATISTICAS, []), ENTRADA],
  ['consulta com 2 args (esquema pede 1) -> ENTRADA', executarCom(ESTATISTICAS, [0, 0]), ENTRADA],
  ['nivel fracionário (0.5) -> ENTRADA', executarCom(ESTATISTICAS, [0.5]), ENTRADA],
  ['nivel negativo (-1) -> ENTRADA', executarCom(ESTATISTICAS, [-1]), ENTRADA],
  ['nivel 2^32 -> ENTRADA', executarCom(ESTATISTICAS, [4294967296]), ENTRADA],
  ['nivel 0xFFFFFFFF (todos) e aceito -> OK', executarCom(ESTATISTICAS, [NIVEL_TODOS]), CODIGOS.OK],
  ['argumento NaN em paredes_na_caixa -> ENTRADA', executarCom(NA_CAIXA, [0, NaN, 0, 1, 1]), ENTRADA],
  ['tol negativo em pares_proximos -> ENTRADA', executarCom(PARES, [0, -0.5]), ENTRADA],
  ['tol 0 em pares_proximos e aceito -> OK', executarCom(PARES, [0, 0]), CODIGOS.OK],
  ['mais de 1024 args -> LIMITE', (alvo) => alvo.exports.cena_executar(cenaCom(alvo), ESTATISTICAS, 1025, ptrF64(alvo, new Array(1025).fill(0))), CODIGOS.LIMITE],
  ['handle destruído em cena_destruir -> HANDLE', (alvo) => alvo.exports.cena_destruir(destruida(alvo)), CODIGOS.HANDLE],
  ['handle destruído em definir -> HANDLE', (alvo) => alvo.exports.cena_definir_secao(destruida(alvo), SECAO_PAREDES_DEF.id, 1, ptrParedes(alvo, [PAREDE_OK])), CODIGOS.HANDLE],
  ['handle destruído em upsert -> HANDLE', (alvo) => alvo.exports.cena_upsert_linhas(destruida(alvo), SECAO_PAREDES_DEF.id, 1, ptrParedes(alvo, [PAREDE_OK])), CODIGOS.HANDLE],
  ['handle destruído em remover -> HANDLE', (alvo) => alvo.exports.cena_remover_linhas(destruida(alvo), SECAO_PAREDES_DEF.id, 1, ptrU32(alvo, [1])), CODIGOS.HANDLE],
  ['handle destruído em executar -> HANDLE', (alvo) => alvo.exports.cena_executar(destruida(alvo), ESTATISTICAS, 1, ptrF64(alvo, [0])), CODIGOS.HANDLE],
  ['consulta desconhecida -> NAO_IMPLEMENTADO', executarCom(77, []), CODIGOS.NAO_IMPLEMENTADO],
];

describe.skipIf(modulo === null)('casos-limite: falso e real devolvem o mesmo código', () => {
  let criarReal: () => InstanciaAbi2;
  beforeAll(async () => {
    criarReal = await criarInstanciadorDoWasm(modulo!);
  });

  it.each(CASOS)('%s', (_nome, cenario, esperado) => {
    const codigoFalso = cenario(criarInstanciaFalsa());
    const codigoReal = cenario(criarReal());
    expect(codigoReal).toBe(esperado);
    expect(codigoFalso).toBe(codigoReal);
  });
});
