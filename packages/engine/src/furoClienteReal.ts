/**
 * Cliente REAL do furo por contorno (docs/estudo-esquadrias/27): liga a porta `ClienteFuroContorno` às exportações do Rust.
 *
 * - `furarPrisma`: uma chamada de `furo_prisma_furar` por pedido; a planta de cada camada pós-junção (anéis em [u, s]) vai como
 *   chega, sem aproximar por faixas.
 * - `retornoDoVao`: `furo_retorno_vao` em modo contorno; o `recuo` do pedido (camadas envolventes entre esta e o núcleo) é
 *   aplicado no Rust como offset do contorno para dentro, antes de gerar o anel.
 * - `furarParede`: o da ABI de prisma (planta retangular), via `clienteFuroPrisma`.
 *
 * Falha de uma chamada nunca estoura no resolve: erro leve (entrada ou limite) e erro grave devolvem `null` e o chamador
 * (`camadaFurada`) recua para o furo retangular (a parede nunca fica sem vão). Erro grave (trap, versão) também reinstancia o
 * módulo, uma vez por falha, para a próxima chamada não herdar um wasm quebrado.
 *
 * Módulo sem as exportações: `instalarClienteFuroReal` não instala nada (ou instala só o que o módulo tem) e devolve o motivo.
 */
import { carregarFuroPrisma, carregarFuroQuant, furarPrismas, furoPrismaCarregado, furoPrismaCurvoCarregado, furoPrismaExtCarregado, furoQuantCarregado, furoRetornoCurvoCarregado, furoRetornoExtCarregado, quantificarParede, retornoDoContorno, type CamadaPrisma, type VaoContorno } from '@hestia/geom';
import { clienteFuroContorno, definirClienteFuroContorno, type ClienteFuroContorno, type MalhaPrismaFurada, type PedidoFuroPrisma, type PedidoQuantParede, type PedidoRetornoVao, type ResultadoFuroPrisma, type ResultadoQuantParede, type ResultadoRetornoVao } from './furoContornoDespacho.ts';
import { clienteFuroPrisma } from './furoClienteEngine.ts';

export interface DiagnosticoFuroReal {
  chamadasPrisma: number;
  chamadasRetorno: number;
  falhas: number;
  reinstanciacoes: number;
  ultimoErro: string | null;
}

const diag: DiagnosticoFuroReal = { chamadasPrisma: 0, chamadasRetorno: 0, falhas: 0, reinstanciacoes: 0, ultimoErro: null };

/** Contadores do cliente real (para a interface e para os testes). */
export const diagnosticoFuroReal = (): Readonly<DiagnosticoFuroReal> => ({ ...diag });

const EPS = 1e-9;

/** Vão que não encosta no envelope das camadas (u, z) não remove nada e faria a ABI recusar o pedido inteiro: sai antes. */
function vaosNoEnvelope(camadas: readonly CamadaPrisma[], vaos: readonly VaoContorno[]): VaoContorno[] {
  let u0 = Infinity, u1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of camadas) {
    z0 = Math.min(z0, c.z0);
    z1 = Math.max(z1, c.z1);
    for (const poly of c.poligonos) for (const [u] of poly[0] ?? []) {
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
    }
  }
  return vaos.filter((v) => {
    const a0 = v.x + Math.min(...v.contorno.map((p) => p[0]));
    const a1 = v.x + Math.max(...v.contorno.map((p) => p[0]));
    const b0 = v.soleira + Math.min(...v.contorno.map((p) => p[1]));
    const b1 = v.soleira + Math.max(...v.contorno.map((p) => p[1]));
    return a1 > u0 + EPS && a0 < u1 - EPS && b1 > z0 + EPS && b0 < z1 - EPS;
  });
}

export interface OpcoesClienteReal {
  /** Chamado depois de uma falha grave para reinstanciar o wasm (o instalador passa o módulo compilado). */
  reinstanciar?: () => Promise<void> | void;
}

/**
 * Cliente da porta sobre as exportações já carregadas (`carregarFuroPrisma`, `carregarFuroQuant`). Só oferece o que está
 * carregado: sem prisma não há `furarPrisma` (o chamador recua para faixas), sem quantitativo não há `retornoDoVao`.
 */
export function clienteFuroContornoReal(opcoes: OpcoesClienteReal = {}): ClienteFuroContorno {
  const falhou = (e: unknown): null => {
    diag.falhas++;
    diag.ultimoErro = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === 'ErroKernelGrave' && opcoes.reinstanciar) {
      diag.reinstanciacoes++;
      void Promise.resolve(opcoes.reinstanciar()).catch((x: unknown) => {
        diag.ultimoErro = x instanceof Error ? x.message : String(x);
      });
    }
    return null;
  };

  const furarPrisma = (pedido: PedidoFuroPrisma): ResultadoFuroPrisma | null => {
    diag.chamadasPrisma++;
    try {
      const ext = furoPrismaExtCarregado();
      const camadas: CamadaPrisma[] = pedido.camadas.map((c) => ({ poligonos: c.poligonos, z0: c.z0, z1: c.z1, ...(c.topo && ext ? { topo: c.topo } : {}) }));
      const todos = pedido.vaos.map((v) => ({ contorno: v.contorno, x: v.x, soleira: v.soleira }));
      // Parede curva (docs/estudo-esquadrias/33 §4): `x` é comprimento de eixo, não u, então o envelope não se confere aqui; o Rust recorta.
      const curvo = pedido.raio !== undefined;
      const vaos = curvo ? todos : vaosNoEnvelope(camadas, todos);
      // Com a ABI estendida o vão que sai só em parte do envelope é furado pela parte que cabe (docs/estudo-esquadrias/33 §2.3);
      // sem ela a ABI recusa o pedido e o chamador recua para faixas retangulares.
      const r = furarPrismas(camadas, vaos, curvo ? { raio: pedido.raio! } : ext ? { recortar: true } : {});
      return {
        camadas: r.camadas.map((m): MalhaPrismaFurada => ({ z0: m.z0, z1: m.z1, vertices: m.vertices, indices: m.indices, volume: m.volume, volumeSemFuro: m.volumeSemFuro })),
        volume: r.volume,
        volumeRemovido: r.volumeRemovido,
      };
    } catch (e) {
      return falhou(e);
    }
  };

  const retornoDoVao = (p: PedidoRetornoVao): ResultadoRetornoVao | null => {
    diag.chamadasRetorno++;
    try {
      // Base livre e recorte em canto exigem a ABI estendida; sem ela vale o retorno de sempre (contorno inteiro, sem recorte).
      const ext = furoRetornoExtCarregado();
      const r = retornoDoContorno({ contorno: p.contorno, x: p.x, soleira: p.soleira, espessura: p.espessura, espessuraAcabamento: p.espessura, recuo: p.recuo, y0: p.y0, y1: p.y1, modo: ext && p.semBase ? 'contorno-sem-base' : 'contorno', ...(ext && p.recorte ? { recorte: p.recorte } : {}), ...(p.raio !== undefined ? { raio: p.raio } : {}) });
      return { vertices: r.vertices, indices: r.indices, volume: r.volume, areaExposta: r.areaExposta };
    } catch (e) {
      // "O retorno não cabe" (contorno estreito para a espessura ou o recuo) é um caso normal: sem retorno, sem alarde.
      if (e instanceof Error && e.name === 'ErroKernelLeve' && /nao cabe|consome/.test(e.message)) return null;
      return falhou(e);
    }
  };

  const quantificar = (p: PedidoQuantParede): ResultadoQuantParede | null => {
    try {
      const r = quantificarParede(p.vaos.map((v) => ({ contorno: v.contorno, x: v.x, soleira: v.soleira })), [0.1], p.comprimento, p.altura);
      const c = r.camadas[0];
      return c ? { areaFuroNaFace: c.areaFuroNaFace, areaFaceLiquida: c.areaFaceLiquida } : null;
    } catch (e) {
      // Vão que a placa não comporta (sai do retângulo da parede) é um caso normal: sem a medição, a área cai na malha das faixas.
      if (e instanceof Error && e.name === 'ErroKernelLeve') return null;
      return falhou(e);
    }
  };

  // Parede curva: o furo do prisma e, se há retorno, o retorno curvo precisam estar no módulo.
  const curva = furoPrismaCurvoCarregado() && (!furoQuantCarregado() || furoRetornoCurvoCarregado());
  return {
    ...(furoPrismaExtCarregado() ? { topoInclinado: true } : {}),
    ...(curva ? { curva: true } : {}),
    ...(furoQuantCarregado() ? { quantificarParede: quantificar } : {}),
    furarParede: furoPrismaCarregado() ? clienteFuroPrisma().furarParede : () => null,
    ...(furoPrismaCarregado() ? { furarPrisma } : {}),
    ...(furoQuantCarregado() ? { retornoDoVao } : {}),
  };
}

const exportacoes = (m: WebAssembly.Module): Set<string> => new Set(WebAssembly.Module.exports(m).map((e) => e.name));

export interface ResultadoInstalacao {
  instalado: boolean;
  /** O que o módulo tem: prisma (`furarPrisma`) e quantitativo (`retornoDoVao`). */
  prisma: boolean;
  retorno: boolean;
  motivo?: string;
}

/**
 * Carrega as exportações do furo dos bytes do kernel e instala o cliente real (`definirClienteFuroContorno`). Nunca lança.
 * Não instala nada quando já há um cliente (de teste ou de outro carregador) ou quando o módulo não tem `furo_prisma_furar`
 * (o app segue no furo retangular, como antes). `furo_retorno_vao` ausente: instala sem `retornoDoVao`.
 */
export async function instalarClienteFuroReal(bytes: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<ResultadoInstalacao> {
  const vazio: ResultadoInstalacao = { instalado: false, prisma: false, retorno: false };
  try {
    if (clienteFuroContorno() !== null) return { ...vazio, motivo: 'já há um cliente do furo instalado' };
    const modulo = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes as BufferSource);
    const nomes = exportacoes(modulo);
    const prisma = nomes.has('furo_prisma_furar') && nomes.has('furo_prisma_abi_versao');
    const retorno = nomes.has('furo_retorno_vao') && nomes.has('furo_quant_abi_versao');
    if (!prisma) return { ...vazio, motivo: 'o módulo não exporta furo_prisma_furar (furo retangular mantido)' };
    const carregar = async (): Promise<void> => {
      await carregarFuroPrisma(modulo);
      if (retorno) await carregarFuroQuant(modulo);
    };
    await carregar();
    // Instalou outro cliente enquanto carregava: não pisa nele.
    if (clienteFuroContorno() !== null) return { ...vazio, motivo: 'já há um cliente do furo instalado' };
    definirClienteFuroContorno(clienteFuroContornoReal({ reinstanciar: carregar }));
    return { instalado: true, prisma, retorno };
  } catch (e) {
    return { ...vazio, motivo: e instanceof Error ? e.message : String(e) };
  }
}
