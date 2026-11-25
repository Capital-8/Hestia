import { avaliarDerivacao, avaliarEncontro, listarProblemasDeViabilidade, posicionarConexao, resolverFamilia, type DeclividadeViabilidade, type PrumadaViabilidade, type RegrasConexao, type TrechoEncontro, type TrechoViabilidade } from '@hestia/engine';
import { familiaDaBiblioteca, isComponent, type Familia, type Project } from '@hestia/model';
import { extremosDoTubo, tuboSob, type ExtremosTubo, type PontoTubo } from './tuboGeometria.ts';

/*
 * Viabilidade do trecho da ferramenta Tubo (ficha B2): ANTES de gravar qualquer coisa, calcula os recuos REAIS de cada conexão que o
 * trecho novo vai criar (a mesma decisão e o mesmo `posicionarConexao` de `criar`) e confere, por `verificarViabilidade`, o trecho
 * novo e os tubos existentes tocados. Famílias sem encaixe têm recuo 0: nada é bloqueado por comprimento (comportamento de sempre).
 */

/** Resultado: `bloqueio` (motivo) impede o trecho; `avisos` são mostrados depois de criar. */
export interface ViabilidadeDoTrecho {
  bloqueio: string | null;
  avisos: string[];
}

/** Horizontal menor que isto (m) = trecho vertical (prumada). */
const HORIZONTAL_NULA = 0.001;

interface ParteDoTubo {
  de: [number, number, number];
  para: [number, number, number];
  /** Recuo (m) em `de` e em `para`. */
  recuoDe: number;
  recuoPara: number;
}

const comprimento = (u: readonly number[], v: readonly number[]): number => Math.hypot((u[0] ?? 0) - (v[0] ?? 0), (u[1] ?? 0) - (v[1] ?? 0), (u[2] ?? 0) - (v[2] ?? 0));

/** Família da conexão: a do projeto ou, se ainda não está lá, a da biblioteca (que `garantirFamilias` gravará). */
function familiaDaConexao(p: Project, id: string): Familia | undefined {
  return p.componentFamilies?.[id] ?? familiaDaBiblioteca(id) ?? undefined;
}

/** Diâmetro externo (mm) da peça do tubo: o parâmetro `De` da família (Krona) ou, sem ele, o DN. */
function diametroExterno(familia: Familia, dn: number): number {
  const de = resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).env.De;
  return typeof de === 'number' && de > 0 ? de : dn;
}

/** Converte as partes em entradas de viabilidade; parte vertical com recuo real vira prumada, as demais, trecho. */
function paraEntradas(partes: ParteDoTubo[], de: number, trechos: TrechoViabilidade[], prumadas: PrumadaViabilidade[]): void {
  for (const t of partes) {
    if (t.recuoDe + t.recuoPara <= 1e-9) continue;
    const dz = Math.abs(t.para[2] - t.de[2]);
    const horizontal = Math.hypot(t.para[0] - t.de[0], t.para[1] - t.de[1]);
    if (horizontal < HORIZONTAL_NULA && dz > 1e-9) {
      const deBaixo = t.de[2] <= t.para[2];
      prumadas.push({ desvioVertical: dz * 1000, diametroExterno: de, recuoBaixo: (deBaixo ? t.recuoDe : t.recuoPara) * 1000, recuoCima: (deBaixo ? t.recuoPara : t.recuoDe) * 1000 });
    } else {
      trechos.push({ comprimento: comprimento(t.de, t.para) * 1000, recuoInicio: t.recuoDe * 1000, recuoFim: t.recuoPara * 1000 });
    }
  }
}

/**
 * Confere o trecho `a`→`b` de `familia` (DN em mm) antes de ser gravado. `regras` null (domínio sem conexão automática) = nada a
 * conferir além da declividade. Não grava nada e não lança.
 */
export function viabilidadeDoTrecho(projeto: Project, familia: Familia, dominio: string, regras: RegrasConexao | null, dn: number, a: PontoTubo, b: PontoTubo): ViabilidadeDoTrecho {
  const novo: TrechoEncontro = { a: a.xyz, b: b.xyz, dn };
  const recuoNovo = { a: 0, b: 0 };
  const partes: ParteDoTubo[] = [];
  const noNo = (pt: PontoTubo, ponta: 'a' | 'b'): void => {
    if (!regras) return;
    if (pt.derivacao) {
      const sob = tuboSob(projeto, familia.id, pt.xyz, 1e-6, 1e-6);
      if (!sob) return;
      const r = avaliarDerivacao({ a: sob.ext.a, b: sob.ext.b, dn: sob.ext.dn }, pt.xyz, novo, ponta, regras);
      const fam = r.conexao ? familiaDaConexao(projeto, r.conexao.familiaId) : undefined;
      const pos = r.conexao && fam ? posicionarConexao(fam, pt.xyz, r.conexao) : null;
      if (!pos) return;
      partes.push({ de: [...sob.ext.a], para: [...pt.xyz], recuoDe: 0, recuoPara: pos.recuos[0] ?? 0 }, { de: [...pt.xyz], para: [...sob.ext.b], recuoDe: pos.recuos[1] ?? 0, recuoPara: 0 });
      recuoNovo[ponta] = pos.recuos[2] ?? 0;
      return;
    }
    if (!pt.alvo) return;
    const outro = projeto.elements[pt.alvo.componentId];
    const ext: ExtremosTubo | null = isComponent(outro) && outro.familyId === familia.id ? extremosDoTubo(projeto, outro) : null;
    if (!ext) return;
    const lado = pt.alvo.ligacaoId === ext.idA ? 'a' : 'b';
    const r = avaliarEncontro({ a: ext.a, b: ext.b, dn: ext.dn }, lado, novo, ponta, regras);
    // Luva ou sem conexão: o tubo liga direto, sem recuo.
    if (!r.conexao || r.conexao.tipo === 'luva') return;
    const fam = familiaDaConexao(projeto, r.conexao.familiaId);
    const pos = fam ? posicionarConexao(fam, pt.xyz, r.conexao) : null;
    if (!pos) return;
    const recuo = pos.recuos[0] ?? 0;
    partes.push({ de: [...ext.a], para: [...ext.b], recuoDe: lado === 'a' ? recuo : 0, recuoPara: lado === 'b' ? recuo : 0 });
    recuoNovo[ponta] = pos.recuos[1] ?? 0;
  };
  noNo(a, 'a');
  noNo(b, 'b');
  partes.push({ de: [...a.xyz], para: [...b.xyz], recuoDe: recuoNovo.a, recuoPara: recuoNovo.b });

  const trechos: TrechoViabilidade[] = [];
  const prumadas: PrumadaViabilidade[] = [];
  const declividades: DeclividadeViabilidade[] = [];
  paraEntradas(partes, diametroExterno(familia, dn), trechos, prumadas);
  // Declividade: só do trecho novo e só quando ele tem desnível (trecho em nível não é avisado aqui; o diagnóstico da rede o aponta).
  const horizontal = Math.hypot(b.xyz[0] - a.xyz[0], b.xyz[1] - a.xyz[1]);
  const dz = Math.abs(b.xyz[2] - a.xyz[2]);
  if (horizontal >= HORIZONTAL_NULA && dz > 1e-9) declividades.push({ percentual: (dz / horizontal) * 100, dominio: dominio as DeclividadeViabilidade['dominio'], dn });

  const problemas = listarProblemasDeViabilidade({ trechos, prumadas, declividades });
  const bloqueio = problemas.find((p) => p.severidade === 'bloqueio');
  return { bloqueio: bloqueio ? bloqueio.motivo : null, avisos: problemas.filter((p) => p.severidade === 'aviso').map((p) => p.motivo) };
}
