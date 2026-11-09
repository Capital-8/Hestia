import { isGuardaCorpo, type Id, type Project } from '@hestia/model';
import { servicoGuardaCorpo, ServicoGuardaCorpo } from './kernelGuardaCorpoServico.ts';
import { totaisPorTipoGC, type GuardaCorpoQuantities, type TotaisTipoGC } from './guardaCorpoQuantities.ts';

/** Uma linha da tabela de guarda-corpos: as quantidades vem de `quant_guarda` (kernel Rust), sem soma paralela em TypeScript. */
export interface GuardaCorpoScheduleRow {
  guardaId: Id;
  typeId: Id;
  typeName: string;
  levelId: Id;
  levelName: string;
  hospedeiro: 'escada' | 'rampa' | 'manual';
  comprimentoEixo: number;
  comprimentoDesenvolvido: number;
  metrosCorrimao: number;
  metrosTrilho: number;
  balaustres: number;
  postes: number;
  areaPaineis: number;
  volume: number;
  custo: number;
}

export interface GuardaCorpoSchedule {
  rows: GuardaCorpoScheduleRow[];
  porTipo: TotaisTipoGC[];
  /** `false` enquanto o kernel Rust nao esta pronto (a tabela fica vazia, nunca com numeros de TypeScript). */
  pronto: boolean;
}

/** Monta a tabela a partir das quantidades do kernel (consulta 64), no padrao das tabelas de parede e laje. */
export function buildGuardaCorpoSchedule(p: Project, quantidades?: readonly GuardaCorpoQuantities[] | null): GuardaCorpoSchedule {
  const q = quantidades ?? (ServicoGuardaCorpo.temGuardaCorpo(p) ? servicoGuardaCorpo().quantidades(p) : []);
  if (!q) return { rows: [], porTipo: [], pronto: false };
  const rows: GuardaCorpoScheduleRow[] = [];
  const nivelNome = new Map(p.levels.map((l) => [l.id, l.name] as const));
  for (const el of Object.values(p.elements)) {
    if (!isGuardaCorpo(el)) continue;
    const x = q.find((y) => y.guardaId === el.id);
    if (!x) continue;
    const papel = (n: string): number => x.porPapel.find((r) => r.papel === n)?.comprimento ?? 0;
    rows.push({
      guardaId: el.id,
      typeId: el.typeId,
      typeName: p.tiposGuardaCorpo[el.typeId]?.name ?? el.typeId,
      levelId: el.levelId,
      levelName: nivelNome.get(el.levelId) ?? '',
      hospedeiro: x.hospedeiro,
      comprimentoEixo: x.comprimentoEixo,
      comprimentoDesenvolvido: x.comprimentoDesenvolvido,
      metrosCorrimao: papel('corrimao') + papel('travessa'),
      metrosTrilho: papel('trilho'),
      balaustres: x.balaustres,
      postes: x.postes,
      areaPaineis: x.areaPaineis,
      volume: x.volumeTotal,
      custo: x.custo,
    });
  }
  return { rows, porTipo: Object.values(totaisPorTipoGC(q)), pronto: true };
}
