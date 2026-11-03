import type { ReactElement } from 'react';
import { useFamilia } from './familiaStore.ts';
import { FamiliaArquivo } from './FamiliaArquivo.tsx';
import { FamiliaCatalogo } from './FamiliaCatalogo.tsx';
import { FamiliaLista } from './FamiliaLista.tsx';
import { FamiliaNovo } from './FamiliaNovo.tsx';
import { DialogoParametros } from './FamiliaParametros.tsx';
import { DialogoTipos } from './FamiliaTipos.tsx';

/** Roteia o diálogo aberto do editor de famílias (cada um vive no seu arquivo). */
export function FamiliaDialogos(): ReactElement | null {
  const d = useFamilia((s) => s.dialogo);
  if (d === 'parametros') return <DialogoParametros />;
  if (d === 'tipos') return <DialogoTipos />;
  if (d === 'pecas') return <FamiliaLista />;
  if (d === 'catalogo') return <FamiliaCatalogo />;
  if (d === 'novo') return <FamiliaNovo />;
  if (d === 'arquivo') return <FamiliaArquivo />;
  return null;
}
