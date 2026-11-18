import type { SheetViewSource } from '@hestia/model';

/**
 * Argumento da janela "Inserir vistas" (`dialogArg` é só texto): ou o id da prancha (botão/menu) ou um JSON com a vista
 * já escolhida e o ponto da folha onde ela foi solta (arrastar do Navegador com Shift).
 */
export interface InsertArg {
  sheetId: string;
  view?: SheetViewSource;
  /** Ponto da folha (mm de papel) onde o ponteiro soltou a vista; a vista entra centrada nele. */
  centre?: { x: number; y: number };
}

export function encodeInsertArg(a: InsertArg): string {
  return a.view || a.centre ? JSON.stringify(a) : a.sheetId;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Lê o argumento; texto que não é JSON válido vale como id da prancha. Nunca lança. */
export function decodeInsertArg(raw: string): InsertArg {
  if (!raw.startsWith('{')) return { sheetId: raw };
  try {
    const o = JSON.parse(raw) as Partial<InsertArg>;
    if (typeof o.sheetId !== 'string') return { sheetId: raw };
    const centre = o.centre && isNum(o.centre.x) && isNum(o.centre.y) ? { x: o.centre.x, y: o.centre.y } : undefined;
    return { sheetId: o.sheetId, ...(o.view && typeof o.view === 'object' && typeof (o.view as { kind?: unknown }).kind === 'string' ? { view: o.view } : {}), ...(centre ? { centre } : {}) };
  } catch {
    return { sheetId: raw };
  }
}
