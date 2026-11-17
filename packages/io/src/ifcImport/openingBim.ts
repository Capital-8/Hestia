import type { OpeningType } from '@hestia/model';
import type { IfcFile } from './ifc.ts';
import { propertyDefsOf, psetValueOf, typePropertyOf } from './psets.ts';
import type { StepEntity } from './step.ts';

/** Campos de desempenho e fabricante que a importação grava no tipo de porta/janela. */
export type BimFields = Pick<OpeningType, 'manufacturer' | 'solarFactor' | 'fireRating' | 'uValue' | 'acousticRw'>;

/**
 * Índice acústico (Rw, dB) a partir de `AcousticRating`: aceita número puro, `"30 dB"`, `"Rw 32"` e variações com
 * `Rw(C;Ctr)`. Texto sem número (ou sem indicação de Rw/dB) não vira valor.
 */
export function acousticRwOf(value: string | number | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/rw|db|^\s*-?\d/i.test(value)) return null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(value);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/**
 * Fabricante (`Pset_ManufacturerTypeInformation`, no tipo) e desempenho do tipo, lidos dos conjuntos do elemento e do
 * tipo. Campo ausente, vazio ou fora da faixa física não entra no tipo.
 * - `fireRating`: `FireRating` de `Pset_WindowCommon` (janela) ou `Pset_DoorCommon` (porta).
 * - `uValue`: `ThermalTransmittance` do mesmo conjunto (W/m²·K).
 * - `acousticRw`: `AcousticRating` do mesmo conjunto (ver `acousticRwOf`).
 * - `solarFactor`: `SolarHeatGainTransmittance` de `Pset_WindowCommon` ou `Pset_DoorWindowGlazingType` (0 a 1).
 */
export function bimFieldsOf(f: IfcFile, filler: StepEntity, declared: StepEntity | undefined, kind: 'door' | 'window'): BimFields {
  const out: BimFields = {};
  const manufacturer = declared ? typePropertyOf(f, declared, 'Pset_ManufacturerTypeInformation', 'Manufacturer') : undefined;
  if (typeof manufacturer === 'string' && manufacturer) out.manufacturer = manufacturer;
  const common = kind === 'door' ? 'Pset_DoorCommon' : 'Pset_WindowCommon';
  const fire = psetValueOf(f, filler, declared, common, 'FireRating');
  if (typeof fire === 'string' && fire) out.fireRating = fire;
  else if (typeof fire === 'number' && Number.isFinite(fire)) out.fireRating = String(fire);
  const u = positive(psetValueOf(f, filler, declared, common, 'ThermalTransmittance'));
  if (u != null) out.uValue = u;
  const rw = acousticRwOf(psetValueOf(f, filler, declared, common, 'AcousticRating') as string | number | undefined);
  if (rw != null) out.acousticRw = rw;
  for (const pset of ['Pset_WindowCommon', 'Pset_DoorWindowGlazingType']) {
    const solar = psetValueOf(f, filler, declared, pset, 'SolarHeatGainTransmittance');
    if (typeof solar === 'number' && solar >= 0 && solar <= 1) {
      out.solarFactor = solar;
      break;
    }
  }
  return out;
}

/** Operação de cada `IfcWindowPanelProperties` ligado à janela (ocorrência e tipo), na ordem do arquivo. */
export function windowPanelOperations(f: IfcFile, filler: StepEntity, declared: StepEntity | undefined): string[] {
  return propertyDefsOf(f, filler, declared)
    .filter((d) => d.type === 'IFCWINDOWPANELPROPERTIES')
    .map((d) => f.enum(d, 4))
    .filter((op) => op !== '');
}

/** Painel que abre de fato (não fixo nem de operação indefinida). */
export const isOperablePanel = (op: string): boolean => !/^(FIXEDCASEMENT|NOTDEFINED|OTHEROPERATION)$/.test(op);

/**
 * Lado da dobradiça pela primeira operação de painel que diga direita ou esquerda (`...RIGHT...` = true, como nas portas).
 * `undefined` quando nenhum painel informa o lado: nesse caso o chamador mantém o padrão.
 */
export function panelHandOf(operations: string[]): boolean | undefined {
  for (const op of operations) {
    if (!isOperablePanel(op)) continue;
    if (/RIGHT/.test(op)) return true;
    if (/LEFT/.test(op)) return false;
  }
  return undefined;
}
