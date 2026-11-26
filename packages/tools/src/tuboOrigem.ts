import type { Vec2 } from '@hestia/geom';
import { resolverComponente, tipoDaFamiliaDeTubo } from '@hestia/engine';
import { isComponent, type Id, type Project } from '@hestia/model';
import { ligacoesAbertas, type LigacaoAberta } from './tuboApoio.ts';
import { extremosDoTubo, type PontoTubo } from './tuboGeometria.ts';

/*
 * 'Criar tubo a partir daqui' (fase 4, ficha F5; no Revit, clicar com o direito numa conexão ou tubo e Criar tubo): dado um componente
 * selecionado, onde o traçado começa: a PORTA LIVRE mais perto do cursor (qualquer peça: tubo, conexão, caixa, dispositivo, aparelho) ou,
 * num tubo, o PONTO DO MEIO sob o cursor (derivação). Função pura; a interface ativa a ferramenta e chama `TuboTool.iniciarEm`.
 */

/** Domínios que a ferramenta Tubo ou Eletroduto traça: as demais ligações (força, dados, ar, estrutura) não oferecem origem. */
export const DOMINIOS_DE_TUBO: ReadonlySet<string> = new Set(['agua_fria', 'agua_quente', 'esgoto', 'ventilacao', 'pluvial', 'gas', 'incendio', 'eletroduto']);

/** Raio (m) em planta em que uma ponta aberta do tubo vale mais que o meio dele. */
const PERTO_DA_PONTA = 0.15;
/** Distância (m) mínima das pontas para o ponto do meio. */
const MARGEM_DO_MEIO = 0.05;

/** Onde o traçado começa, e com que ferramenta, bitola e família. */
export interface OrigemDoTraco {
  ferramenta: 'tubo' | 'eletroduto';
  origem: PontoTubo;
  /** Bitola (mm) da porta ou do tubo. */
  dn: number | null;
  /** Família do tubo clicado (o ramal usa o mesmo tipo); null quando a origem é porta de outra peça. */
  familiaId: string | null;
  /** Texto curto do que foi escolhido, para a fala. */
  rotulo: string;
}

/** Motivo de não haver origem. */
export interface SemOrigem {
  erro: string;
}

const plano = (c: LigacaoAberta, cursor: Vec2 | undefined): number => (cursor ? Math.hypot(c.lig.posicaoMundo[0] - cursor.x, c.lig.posicaoMundo[1] - cursor.y) : 0);

/** Origem a partir da porta livre `c`. Dono que não é tubo nem conexão exige chegar de frente para a porta (`direcao`). */
function dePorta(p: Project, c: LigacaoAberta): OrigemDoTraco {
  const dono = p.elements[c.componentId];
  const cat = isComponent(dono) ? p.componentFamilies?.[dono.familyId]?.categoria : undefined;
  const comEntrada = cat !== 'eletroduto' && cat !== 'tubulacao' && cat !== 'conexao_tubo';
  const ferramenta = c.lig.dominio === 'eletroduto' ? 'eletroduto' : 'tubo';
  const origem: PontoTubo = { xyz: [...c.lig.posicaoMundo], alvo: { componentId: c.componentId, ligacaoId: c.lig.id }, ...(comEntrada ? { direcao: c.lig.direcaoMundo } : {}) };
  const ehTubo = isComponent(dono) && tipoDaFamiliaDeTubo(dono.familyId) !== undefined;
  return { ferramenta, origem, dn: Math.round(c.lig.diametro * 1000), familiaId: ehTubo && isComponent(dono) ? dono.familyId : null, rotulo: `a porta ${c.lig.nome}` };
}

/** Origem para o componente `id`: a porta livre mais perto de `cursor` (ou a primeira) ou, num tubo, o meio do tubo sob o cursor (ou o centro). */
export function origemDoComponente(p: Project, id: Id, cursor?: Vec2): OrigemDoTraco | SemOrigem {
  const c = p.elements[id];
  if (!isComponent(c) || !p.componentFamilies?.[c.familyId]?.ligacoes?.length) return { erro: 'Esta peça não tem porta para sair com tubulação.' };
  const livres = ligacoesAbertas(p).filter((l) => l.componentId === id && DOMINIOS_DE_TUBO.has(l.lig.dominio)).sort((a, b) => plano(a, cursor) - plano(b, cursor));
  const ext = tipoDaFamiliaDeTubo(c.familyId) ? extremosDoTubo(p, c) : null;
  const perto = livres[0];
  if (!ext) return perto ? dePorta(p, perto) : { erro: 'Esta peça não tem porta livre: todas as ligações já estão usadas.' };
  // Tubo: ponta aberta perto do cursor vale; senão o ponto do eixo sob o cursor (o centro, sem cursor).
  if (perto && cursor && plano(perto, cursor) <= PERTO_DA_PONTA) return dePorta(p, perto);
  const [dx, dy, dz] = [ext.b[0] - ext.a[0], ext.b[1] - ext.a[1], ext.b[2] - ext.a[2]];
  const h2 = dx * dx + dy * dy;
  if (h2 < 1e-12) return perto ? dePorta(p, perto) : { erro: 'Tubo vertical sem ponta livre: não há meio em planta para derivar.' };
  const L = Math.hypot(dx, dy, dz);
  const t0 = cursor ? ((cursor.x - ext.a[0]) * dx + (cursor.y - ext.a[1]) * dy) / h2 : 0.5;
  const t = Math.min(1 - MARGEM_DO_MEIO / L, Math.max(MARGEM_DO_MEIO / L, t0));
  if (MARGEM_DO_MEIO / L >= 0.5) return { erro: 'Tubo curto demais para derivar do meio.' };
  const dominio = resolverComponente(p, c).ligacoes?.[0]?.dominio;
  return { ferramenta: dominio === 'eletroduto' ? 'eletroduto' : 'tubo', origem: { xyz: [ext.a[0] + t * dx, ext.a[1] + t * dy, ext.a[2] + t * dz], alvo: null, derivacao: true }, dn: ext.dn || null, familiaId: c.familyId, rotulo: 'o meio do tubo' };
}
