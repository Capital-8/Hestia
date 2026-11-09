import { isGuardaCorpo, type GuardaCorpo, type Id, type TipoGuardaCorpo } from '@hestia/model';
import { gid, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { addPropertySet } from './ifcProperties.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, list, num, OMIT, ref, stepString } from './ifcStep.ts';

export type IfcRailingEnum = 'GUARDRAIL' | 'HANDRAIL' | 'BALUSTRADE' | 'USERDEFINED';

/**
 * `PredefinedType` do `IFCRAILING` (decisão 0055 §7.2): o do tipo, se definido; senão pela composição. Tem preenchimento (balaústre ou
 * painel) e corrimão ou painel: GUARDRAIL; só balaústres: BALUSTRADE; só corrimão: HANDRAIL; outro: USERDEFINED.
 */
export function ifcPredefinidoGC(tipo: TipoGuardaCorpo | undefined): IfcRailingEnum {
  if (!tipo) return 'USERDEFINED';
  if (tipo.ifcPredefinido) return tipo.ifcPredefinido;
  const balaustres = tipo.preenchimentos.some((x) => x.tipo === 'balaustres');
  const paineis = tipo.preenchimentos.some((x) => x.tipo === 'painel');
  const corrimao = tipo.corrimaos.length > 0;
  if (balaustres || paineis) return balaustres && !paineis && !corrimao ? 'BALUSTRADE' : 'GUARDRAIL';
  return corrimao ? 'HANDRAIL' : 'USERDEFINED';
}

function comprimentoManual(g: GuardaCorpo): number | undefined {
  if (g.hospedeiro.tipo !== 'manual') return undefined;
  const c = g.hospedeiro.caminho;
  let s = 0;
  for (let i = 0; i + 1 < c.length; i++) s += Math.hypot(c[i + 1]!.x - c[i]!.x, c[i + 1]!.y - c[i]!.y, c[i + 1]!.dz - c[i]!.dz);
  if (g.hospedeiro.fechado && c.length > 2) s += Math.hypot(c[0]!.x - c.at(-1)!.x, c[0]!.y - c.at(-1)!.y, c[0]!.dz - c.at(-1)!.dz);
  return s;
}

/**
 * Um `IFCRAILING` por guarda-corpo, contido no pavimento, com `Pset_RailingCommon`, `Qto_RailingBaseQuantities` (`Length`, quando se sabe o
 * comprimento desenvolvido) e `Pset_Hestia_GuardaCorpo`; cada corrimão do tipo vira um `IFCRAILING` HANDRAIL agregado. `comprimentos` traz o
 * comprimento desenvolvido vindo do kernel; sem ele, só o manual tem `Length`. Sem malha nesta versão (a geometria vem da Fase 5).
 */
export function addGuardaCorpos(c: IfcCtx, comprimentos?: ReadonlyMap<Id, number>): void {
  for (const g of Object.values(c.p.elements)) {
    if (!isGuardaCorpo(g)) continue;
    const st = storeyOf(c, g.levelId);
    if (!st) continue;
    const tipo = c.p.tiposGuardaCorpo[g.typeId];
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const nome = g.mark || tipo?.name || 'Guarda-corpo';
    const pre = ifcPredefinidoGC(tipo);
    const objType = pre === 'USERDEFINED' ? stepString('GUARDA-CORPO') : OMIT;
    const rail = c.w.add('IFCRAILING', [gid(`railing:${g.id}`), OMIT, stepString(nome), OMIT, objType, ref(place), OMIT, OMIT, en(pre)]);
    c.products?.set(g.id, rail);
    st.contained.push(rail);
    const altura = g.altura ?? tipo?.altura;
    const corrimao = tipo?.corrimaos.find((x) => x.perfil.forma === 'circular');
    const common: Array<[string, string | number | boolean]> = [['Reference', tipo?.code || tipo?.name || g.typeId]];
    if (altura !== undefined) common.push(['Height', altura]);
    if (corrimao) common.push(['Diameter', corrimao.perfil.largura]);
    addPropertySet(c, `pset:railing:${g.id}:common`, 'Pset_RailingCommon', common, rail);
    const len = comprimentos?.get(g.id) ?? comprimentoManual(g);
    if (len !== undefined) {
      const q = c.w.add('IFCQUANTITYLENGTH', [stepString('Length'), OMIT, OMIT, num(len), OMIT]);
      const set = c.w.add('IFCELEMENTQUANTITY', [gid(`qto:railing:${g.id}`), OMIT, stepString('Qto_RailingBaseQuantities'), OMIT, OMIT, list([ref(q)])]);
      c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`qtorel:railing:${g.id}`), OMIT, OMIT, OMIT, list([ref(rail)]), ref(set)]);
    }
    const hosp = g.hospedeiro.tipo === 'escada' ? g.hospedeiro.escadaId : g.hospedeiro.tipo === 'rampa' ? g.hospedeiro.rampaId : (g.hospedeiro.referenciaId ?? '');
    addPropertySet(c, `pset:railing:${g.id}:hestia`, 'Pset_Hestia_GuardaCorpo', [['hospedeiro', `${g.hospedeiro.tipo}${hosp ? `:${hosp}` : ''}`], ['norma', g.sobrescritas?.normaId ?? tipo?.normaId ?? c.p.settings.normaGuardaCorpoId ?? 'nbr-br']], rail);
    const filhos = (tipo?.corrimaos ?? []).map((cm, i) => c.w.add('IFCRAILING', [gid(`railing:${g.id}:hand:${i}`), OMIT, stepString(cm.nome), OMIT, OMIT, ref(localPlacement(c.w, st.place, [0, 0, 0])), OMIT, OMIT, en('HANDRAIL')]));
    if (filhos.length > 0) c.w.add('IFCRELAGGREGATES', [gid(`railingagg:${g.id}`), OMIT, OMIT, OMIT, ref(rail), list(filhos.map(ref))]);
  }
}
