import { useEffect, useState } from 'react';
import { cortinaAvisosDeGeometria, cortinaAvisosSemKernel, estrAvisosDeInvalidez, estrAvisosSemKernel, guardaCorpoAvisosDeGeometria, servicoCortina, servicoEstr, servicoGuardaCorpo, temCortina, temEstrutura } from '@hestia/engine';
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
 * Avisos da parede cortina (decisão 0056): as medidas vêm do kernel Rust; sem o kernel pronto aparece o aviso `cortina-sem-kernel` (a cortina vira só o eixo).
 * Vazio sem cortina no projeto.
 */
export function avisosGeometriaCortina(p: Project, lang = useI18n.getState().lang): ValidationIssue[] {
  if (!temCortina(p)) return [];
  const s = servicoCortina();
  return s.pronto() ? cortinaAvisosDeGeometria(s.avisos(p), lang) : cortinaAvisosSemKernel(p, lang);
}

/**
 * Avisos da estrutura (pilar, viga e fundação; ficha R1a): `estr-invalida` (o TS deixou de enviar o elemento ou o kernel o recusou) e, sem o kernel pronto,
 * `estr-sem-kernel` (a estrutura não é desenhada). Vazio sem estrutura no projeto.
 */
export function avisosGeometriaEstr(p: Project, lang = useI18n.getState().lang): ValidationIssue[] {
  if (!temEstrutura(p)) return [];
  const s = servicoEstr();
  const invalidos = estrAvisosDeInvalidez(p, lang, s.recusados(p));
  return s.pronto() ? invalidos : [...invalidos, ...estrAvisosSemKernel(p, lang)];
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
  useEffect(() => servicoCortina().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(() => servicoEstr().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(
    () => agendarAvisos(project, (a) => setSettled([...a, ...avisosGeometriaGuardaCorpo(project), ...avisosGeometriaCortina(project), ...avisosGeometriaEstr(project)])),
    // `kernelPronto` refaz a lista quando o kernel carrega ou é trocado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, kernelPronto],
  );
  return settled;
}
