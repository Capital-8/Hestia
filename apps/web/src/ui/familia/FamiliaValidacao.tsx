import { validarFamilia } from '@hestia/model';
import type { ReactElement } from 'react';
import { useFamilia, useResolucao } from './familiaStore.ts';

/** Validação do editor: problemas estruturais da família e erros da resolução corrente. */

interface Aviso {
  nivel: 'erro' | 'aviso';
  texto: string;
}

const MAXIMO = 6;

export function Validacao(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const resolucao = useResolucao();
  const avisos: Aviso[] = [
    ...validarFamilia(familia).map((p) => ({ nivel: p.nivel, texto: `${p.onde}: ${p.mensagem}` })),
    ...resolucao.erros.map((e) => ({ nivel: 'erro' as const, texto: `${e.onde}: ${e.mensagem}` })),
  ];
  const mostrar = avisos.slice(0, MAXIMO);
  const restantes = avisos.length - mostrar.length;
  return (
    <div className="fam-grp"><div className="fam-gh">Validação</div>
      {avisos.length === 0
        ? <div className="fam-msg">Sem problemas: {resolucao.pecas.length} peças</div>
        : mostrar.map((a, i) => <div key={i} className={`fam-msg${a.nivel === 'erro' ? ' erro' : ' aviso'}`}>{a.texto}</div>)}
      {restantes > 0 && <div className="fam-msg">+{restantes} …</div>}
    </div>
  );
}
