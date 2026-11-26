import { LIMITES, LIMITES_CORPO, tentar, type Corpo, type Env, type Familia, type FormaCorpo, type Perfil } from '@hestia/model';
import { resolverCaminho } from './corposCaminho.ts';
import { resolverLigacoes } from './corposLigacoes.ts';
import { malhaDosCorpos } from './corposMalha.ts';
import { resolverPerfil } from './corposPerfil.ts';
import type { CaminhoResolvido, CorpoResolvido, FormaCorpoResolvida, LigacaoResolvida, PerfilResolvido } from './corposTipos.ts';
import type { ErroResolucao } from './pecas.ts';

/*
 * Resolução dos CORPOS e LIGAÇÕES da família dentro de `resolverFamilia` (ficha A7, CONTRATO §2 e §3). Texto em mm e graus;
 * saída em metros e radianos. Nunca lança: cada problema vira um `ErroResolucao` com `onde` (`corpos[id].forma.perfil`) e o
 * corpo ou a ligação afetada fica de fora. Sem corpos e sem ligações, devolve listas vazias e nenhum erro.
 *
 * Caixa dos corpos (decisão da A7): a caixa envolvente sai da malha dos corpos SÓLIDOS (`malhaDosCorpos`), que já inclui
 * revolução, varredura e transição com a posição final. É mais cara que a caixa dos pontos do perfil, mas não erra o toro
 * nem o cotovelo. Corpos vazios (fantasmas) não entram na caixa.
 */

/** Caixa envolvente dos corpos sólidos, em metros, no sistema da família. */
export interface CaixaCorpos {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ResultadoCorposDaFamilia {
  corpos: CorpoResolvido[];
  ligacoes: LigacaoResolvida[];
  caixaCorpos: CaixaCorpos | null;
  erros: ErroResolucao[];
}

/** mm arredondado a 1 µm (3 casas), como o resolvedor de peças. */
const mm3 = (v: number): number => Math.round(v * 1000) / 1000;
/** mm → m arredondado a 1 µm (6 casas). */
const metros = (v: number): number => Math.round(v * 1000) / 1e6;
/** Segmentos padrão de revolução por volta completa (CONTRATO §2.3). */
const SEGMENTOS_VOLTA = 32;

const ehVerdadeiro = (v: unknown): boolean => (typeof v === 'string' ? v !== '' : Boolean(v));

/** Avalia uma fórmula como número (mm). Erro vai para `erros` com `onde` e devolve `null`. */
function numero(src: string, env: Env, onde: string, erros: ErroResolucao[]): number | null {
  const r = tentar(src, env);
  if (!r.ok) { erros.push({ onde, mensagem: r.erro.message }); return null; }
  if (typeof r.valor !== 'number' || !Number.isFinite(r.valor)) { erros.push({ onde, mensagem: 'a fórmula não resulta em número' }); return null; }
  return mm3(r.valor);
}

/** Como `numero`, mas exige valor > 0. */
function positivo(src: string, env: Env, onde: string, erros: ErroResolucao[]): number | null {
  const v = numero(src, env, onde, erros);
  if (v === null) return null;
  if (!(v > 0)) { erros.push({ onde, mensagem: 'precisa ser maior que 0' }); return null; }
  return v;
}

/**
 * Resultado com erro de fórmula já registrado em `erros` não gera uma segunda mensagem genérica: o gerador só acrescenta
 * a sua quando nenhuma fórmula falhou durante a chamada.
 */
function perfilDoCorpo(perfil: Perfil, env: Env, onde: string, erros: ErroResolucao[]): PerfilResolvido | null {
  const antes = erros.length;
  const r = resolverPerfil(perfil, (expr) => numero(expr, env, onde, erros) ?? Number.NaN);
  if (r.ok) return r.perfil;
  if (erros.length === antes) erros.push({ onde, mensagem: r.erro });
  return null;
}

/** Matriz de rotação `R = Rz · Ry · Rx` (graus, ordem `[rx, ry, rz]`), 9 números por linha. */
function matrizRotacao(graus: readonly [number, number, number]): number[] {
  const [rx, ry, rz] = graus.map((g) => (g * Math.PI) / 180);
  const [cx, sx] = [Math.cos(rx!), Math.sin(rx!)];
  const [cy, sy] = [Math.cos(ry!), Math.sin(ry!)];
  const [cz, sz] = [Math.cos(rz!), Math.sin(rz!)];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  const mul = (a: number[], b: number[]): number[] =>
    Array.from({ length: 9 }, (_, k) => {
      const i = Math.floor(k / 3);
      const j = k % 3;
      return (a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
    });
  // Arredonda a 1e-12 para tirar ruído de ponto flutuante (cos 90° etc.) e o zero negativo.
  return mul(Rz, mul(Ry, Rx)).map((v) => Math.round(v * 1e12) / 1e12 + 0);
}

function formaDoCorpo(forma: FormaCorpo, env: Env, id: string, erros: ErroResolucao[]): FormaCorpoResolvida | null {
  const onde = (campo: string): string => `corpos[${id}].forma.${campo}`;
  switch (forma.tipo) {
    case 'extrusao': {
      const perfil = perfilDoCorpo(forma.perfil, env, onde('perfil'), erros);
      const comprimento = positivo(forma.comprimento, env, onde('comprimento'), erros);
      if (perfil === null || comprimento === null) return null;
      return { tipo: 'extrusao', perfil, comprimento: metros(comprimento) };
    }
    case 'revolucao': {
      const perfil = perfilDoCorpo(forma.perfil, env, onde('perfil'), erros);
      const angulo = numero(forma.angulo, env, onde('angulo'), erros);
      if (perfil === null || angulo === null) return null;
      if (!(angulo > 0 && angulo <= 360)) { erros.push({ onde: onde('angulo'), mensagem: 'ângulo precisa estar entre 0 e 360 graus' }); return null; }
      let segmentos = Math.max(1, Math.round((SEGMENTOS_VOLTA * angulo) / 360));
      if (forma.segmentos !== undefined) {
        const s = numero(forma.segmentos, env, onde('segmentos'), erros);
        if (s === null) return null;
        segmentos = Math.round(s);
      }
      if (segmentos < 1 || segmentos > LIMITES_CORPO.segmentosCirculo) {
        erros.push({ onde: onde('segmentos'), mensagem: `segmentos deve estar entre 1 e ${LIMITES_CORPO.segmentosCirculo}` });
        return null;
      }
      const afastamento = forma.afastamento === undefined ? 0 : numero(forma.afastamento, env, onde('afastamento'), erros);
      if (afastamento === null) return null;
      return {
        tipo: 'revolucao',
        perfil,
        angulo: (angulo * Math.PI) / 180,
        segmentos,
        afastamento: metros(afastamento),
        centradoNoEixo: forma.perfil.tipo !== 'poligono',
      };
    }
    case 'varredura': {
      const perfil = perfilDoCorpo(forma.perfil, env, onde('perfil'), erros);
      if (perfil === null) return null;
      const antes = erros.length;
      const r = resolverCaminho(forma.caminho, (e) => numero(e, env, onde('caminho'), erros));
      if (!r.ok) {
        if (erros.length === antes) erros.push({ onde: onde('caminho'), mensagem: r.erro });
        return null;
      }
      const caminho: CaminhoResolvido = r.caminho;
      return { tipo: 'varredura', perfil, caminho };
    }
    case 'transicao': {
      const perfilA = perfilDoCorpo(forma.perfilA, env, onde('perfilA'), erros);
      const perfilB = perfilDoCorpo(forma.perfilB, env, onde('perfilB'), erros);
      const comprimento = positivo(forma.comprimento, env, onde('comprimento'), erros);
      if (perfilA === null || perfilB === null || comprimento === null) return null;
      let desvio: [number, number] = [0, 0];
      if (forma.desvio !== undefined) {
        const du = numero(forma.desvio[0], env, onde('desvio[0]'), erros);
        const dv = numero(forma.desvio[1], env, onde('desvio[1]'), erros);
        if (du === null || dv === null) return null;
        desvio = [metros(du), metros(dv)];
      }
      return { tipo: 'transicao', perfilA, perfilB, comprimento: metros(comprimento), desvio };
    }
  }
}

function materialDoCorpo(c: Corpo, env: Env): string | null {
  if (c.material === undefined) return null;
  const v = env[c.material];
  return typeof v === 'string' ? v : c.material;
}

/** Um corpo já com `i`/`n` no ambiente: quadro, forma e atributos. Erro de qualquer parte descarta o corpo. */
function corpoUnico(c: Corpo, nome: string, indice: number, env: Env, erros: ErroResolucao[]): CorpoResolvido | null {
  const onde = (campo: string): string => `corpos[${c.id}].quadro.${campo}`;
  const origem = c.quadro.origem.map((s, k) => numero(s, env, onde(`origem[${k}]`), erros));
  const graus = (c.quadro.rotacao ?? ['0', '0', '0']).map((s, k) => numero(s, env, onde(`rotacao[${k}]`), erros));
  const forma = formaDoCorpo(c.forma, env, c.id, erros);
  if (origem.includes(null) || graus.includes(null) || forma === null) return null;
  const [ox, oy, oz] = origem as [number, number, number];
  const [rx, ry, rz] = graus as [number, number, number];
  return {
    id: c.id,
    nome,
    indice,
    papel: c.papel,
    forma,
    origem: [metros(ox), metros(oy), metros(oz)],
    rotacao: matrizRotacao([rx, ry, rz]),
    vazio: c.vazio === true,
    ...(c.furar !== undefined && c.furar.length > 0 ? { furar: [...c.furar] } : {}),
    material: materialDoCorpo(c, env),
    detalhe3d: c.detalhe3d !== undefined ? [...c.detalhe3d] : null,
    vistas: c.vistas !== undefined ? [...c.vistas] : null,
    grupo: c.grupo ?? null,
  };
}

/** `repetir` e `quando` do corpo (mesma regra da `Peca`): devolve um corpo por repetição válida. */
function corposDoItem(c: Corpo, env: Env, erros: ErroResolucao[]): CorpoResolvido[] {
  let n = 1;
  if (c.repetir !== undefined) {
    const r = numero(c.repetir, env, `corpos[${c.id}].repetir`, erros);
    if (r === null) return [];
    n = Math.max(0, Math.min(LIMITES.repeticao, Math.floor(r)));
  }
  const saida: CorpoResolvido[] = [];
  for (let i = 1; i <= n; i++) {
    const e: Env = c.repetir !== undefined ? { ...env, i, n } : env;
    if (c.quando !== undefined) {
      const q = tentar(c.quando, e);
      if (!q.ok) { erros.push({ onde: `corpos[${c.id}].quando`, mensagem: q.erro.message }); continue; }
      if (!ehVerdadeiro(q.valor)) continue;
    }
    const nome = c.repetir !== undefined && n > 1 ? `${c.nome} ${i}` : c.nome;
    const corpo = corpoUnico(c, nome, i, e, erros);
    if (corpo !== null) saida.push(corpo);
  }
  return saida;
}

/** Caixa envolvente dos vértices da malha (x, y, z por vértice, em m). */
function caixaDaMalha(posicoes: readonly number[]): CaixaCorpos | null {
  if (posicoes.length < 3) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < posicoes.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = posicoes[i + k];
      if (v === undefined) continue;
      min[k] = Math.min(min[k]!, v);
      max[k] = Math.max(max[k]!, v);
    }
  }
  return { min, max };
}

/** Resolve corpos e ligações da família. `env` é o ambiente final de `resolverFamilia` (parâmetros e derivados já avaliados). */
export function resolverCorposDaFamilia(f: Familia, env: Env): ResultadoCorposDaFamilia {
  const erros: ErroResolucao[] = [];
  const declarados = f.corpos ?? [];
  if (declarados.length > LIMITES_CORPO.corpos) {
    erros.push({ onde: 'corpos', mensagem: `a família passa de ${LIMITES_CORPO.corpos} corpos` });
  }
  const corpos: CorpoResolvido[] = [];
  for (const c of declarados.slice(0, LIMITES_CORPO.corpos)) corpos.push(...corposDoItem(c, env, erros));

  let caixaCorpos: CaixaCorpos | null = null;
  if (corpos.length > 0) {
    const malha = malhaDosCorpos(corpos);
    for (const mensagem of malha.erros) erros.push({ onde: 'corpos', mensagem });
    caixaCorpos = caixaDaMalha(malha.solidas.positions);
  }

  const ligacoes = resolverLigacoes(f, env);
  for (const d of ligacoes.diagnosticos) erros.push({ onde: d.onde, mensagem: d.mensagem });
  return { corpos, ligacoes: ligacoes.ligacoes, caixaCorpos, erros };
}
