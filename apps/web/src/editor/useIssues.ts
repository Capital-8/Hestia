import { useEffect, useState } from 'react';
import { cortinaAvisosDeGeometria, cortinaAvisosSemKernel, guardaCorpoAvisosDeGeometria, massaAvisosDoProjeto, servicoCortina, servicoGuardaCorpo, servicoMassa, temCortina } from '@hestia/engine';
import { isGuardaCorpo, isMass, type Project, type ValidationIssue } from '@hestia/model';
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
 * Avisos da massa (plano de massa, A.5; ficha U2): as medidas vêm do kernel (consulta 145) e `massaAvisosDoProjeto` monta o texto, com o
 * "Ir para" pela massa. Sem massa no projeto, vazio. Sem kernel, cada massa ganha `massa-sem-kernel`; massa recusada, `massa-invalida`.
 */
export function avisosGeometriaMassa(p: Project, lang = useI18n.getState().lang): ValidationIssue[] {
  if (!Object.values(p.elements).some(isMass)) return [];
  return massaAvisosDoProjeto(p, servicoMassa(), lang);
}

/**
 * Avisos de validação do projeto atual. Todo modelo é validado depois de SETTLE_MS sem novas mudanças (até lá, mostra o
 * resultado anterior; na abertura, lista vazia). Antes, modelos com até 2000 elementos eram validados na mesma renderização,
 * o que somava o custo dos avisos à abertura. O resultado final é o mesmo: `agendarAvisos` usa `avisosDoProjeto`.
 * Os avisos de geometria do guarda-corpo, da cortina e da massa (kernel) entram depois, no mesmo tempo de silêncio, e são refeitos quando o kernel fica pronto.
 */
export function useIssues(): ValidationIssue[] {
  const project = useProject();
  const [settled, setSettled] = useState<ValidationIssue[]>([]);
  const [kernelPronto, setKernelPronto] = useState(0);
  useEffect(() => servicoGuardaCorpo().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(() => servicoCortina().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(() => servicoMassa().aoMudarPronto(() => setKernelPronto((n) => n + 1)), []);
  useEffect(
    () =>
      agendarAvisos(project, (a) =>
        setSettled([...a, ...avisosGeometriaGuardaCorpo(project), ...avisosGeometriaCortina(project), ...avisosGeometriaMassa(project)]),
      ),
    // `kernelPronto` refaz a lista quando o kernel carrega ou é trocado.
    [project, kernelPronto],
  );
  return settled;
}
