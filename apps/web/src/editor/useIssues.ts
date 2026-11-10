import { useEffect, useState } from 'react';
import { guardaCorpoAvisosDeGeometria, servicoGuardaCorpo } from '@hestia/engine';
import { isGuardaCorpo, type Project, type ValidationIssue } from '@hestia/model';
import { useProject } from './controller.ts';
import { useI18n } from './i18n.ts';
import { agendarAvisos } from './avisosProjeto.ts';

/**
 * Avisos de geometria degenerada dos guarda-corpos (trecho que vira ponto, deslocamento maior que a largura, caminho com vértices repetidos...), medidos
 * pelo kernel Rust na thread principal (o worker de avisos não tem kernel). Vazio sem guarda-corpo ou com o kernel ainda não pronto.
 */
export function avisosGeometriaGuardaCorpo(p: Project, lang = useI18n.getState().lang): ValidationIssue[] {
  if (!Object.values(p.elements).some(isGuardaCorpo)) return [];
  return guardaCorpoAvisosDeGeometria(p, servicoGuardaCorpo().avisos(p), lang);
}

/**
 * Avisos de validação do projeto atual. Todo modelo é validado depois de SETTLE_MS sem novas mudanças (até lá, mostra o
 * resultado anterior; na abertura, lista vazia). Antes, modelos com até 2000 elementos eram validados na mesma renderização,
 * o que somava o custo dos avisos à abertura. O resultado final é o mesmo: `agendarAvisos` usa `avisosDoProjeto`.
 * Os avisos de geometria do guarda-corpo (kernel) entram depois, no mesmo tempo de silêncio, e são refeitos quando o kernel fica pronto.
 */
export function useIssues(): ValidationIssue[] {
  const project = useProject();
  const [settled, setSettled] = useState<ValidationIssue[]>([]);
  const [kernelPronto, setKernelPronto] = useState(0);
  useEffect(() => servicoGuardaCorpo().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(
    () => agendarAvisos(project, (a) => setSettled([...a, ...avisosGeometriaGuardaCorpo(project)])),
    // `kernelPronto` refaz a lista quando o kernel carrega ou é trocado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, kernelPronto],
  );
  return settled;
}
