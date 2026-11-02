import type { ReactElement } from 'react';
import { useI18n } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import type { FaseImportacao } from '../editor/ifcImport.ts';
import './IfcImportOverlay.css';

const ROTULOS: Record<'pt' | 'en', Record<FaseImportacao, string>> = {
  pt: {
    read: 'Lendo o arquivo…',
    parse: 'Lendo as entidades do IFC…',
    relations: 'Ligando relações (tipos, vãos e preenchimentos)…',
    levels: 'Montando os níveis…',
    walls: 'Convertendo paredes…',
    openings: 'Convertendo portas e janelas…',
    slabs: 'Convertendo pisos, lajes e ambientes…',
    generic: 'Montando a geometria dos demais objetos…',
    finish: 'Finalizando…',
  },
  en: {
    read: 'Reading the file…',
    parse: 'Reading the IFC entities…',
    relations: 'Linking relations (types, openings and fillings)…',
    levels: 'Building the levels…',
    walls: 'Converting walls…',
    openings: 'Converting doors and windows…',
    slabs: 'Converting floors, slabs and rooms…',
    generic: 'Building the remaining geometry…',
    finish: 'Finishing…',
  },
};

/**
 * Barra de progresso da importação IFC. O trabalho pesado roda no worker; aqui só se lê o andamento que ele manda,
 * então a janela continua respondendo e o usuário vê em que fase o arquivo está.
 */
export function IfcImportOverlay(): ReactElement | null {
  const progresso = useUi((s) => s.ifcImport);
  const pt = useI18n((s) => s.lang) === 'pt';
  if (!progresso) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progresso.fracao * 100)));
  const etapa = ROTULOS[pt ? 'pt' : 'en'][progresso.fase];
  const contagem = progresso.total > 1 && progresso.fase !== 'read' && progresso.fase !== 'parse'
    ? ` ${Math.min(progresso.feito, progresso.total)}/${progresso.total}`
    : '';
  return (
    <div className="ifc-progress" role="status" aria-live="polite" aria-label={pt ? 'Importando IFC' : 'Importing IFC'}>
      <div className="ifc-progress-card">
        <div className="ifc-progress-head">
          <b>{pt ? 'Importando IFC' : 'Importing IFC'}</b>
          <span className="mono">{pct}%</span>
        </div>
        <div
          className="ifc-progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="ifc-progress-stage">{etapa}{contagem}</div>
        <p className="ifc-progress-hint">
          {pt
            ? 'O arquivo roda fora da thread principal: você pode continuar usando a janela enquanto ele é convertido.'
            : 'The file runs off the main thread: you can keep using the window while it is converted.'}
        </p>
      </div>
    </div>
  );
}
