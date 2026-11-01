import { machineNumber } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { sectionPoints } from '@hestia/model';
import { assinaturasDoProjeto, hashTexto } from './assinaturasNivel.ts';
import { assembleSection, sectionLevelPart, type SectionLevelPart, type SectionLine, type SectionResult } from './section.ts';

/**
 * Corte incremental: guarda a parte de cada pavimento (`sectionLevelPart`) e a refaz só quando o conteúdo que ela lê muda.
 * A parte de um pavimento depende da linha, do bloco global do projeto (tipos, materiais, cotas), dos pisos, lajes,
 * escadas, rampas e telhados de qualquer pavimento (os cortadores os leem), do conteúdo do próprio pavimento e dos
 * vizinhos por cota (como a chave de nível da 3D) e, com parede anexada ao telhado, dos telhados. O resultado final é
 * igual ao de `computeSection`: as partes não mudam, só a união e a oclusão (`assembleSection`) rodam de novo.
 */
export class SecaoIncremental {
  private readonly partes = new Map<Id, { chave: string; parte: SectionLevelPart }>();
  /** Quantos pavimentos foram recalculados na última chamada (diagnóstico e testes). */
  recalculados = 0;

  calcular(p: Project, line: SectionLine, levelIds: Id[] = p.levels.map((l) => l.id)): SectionResult {
    const chaves = chavesDoCorte(p, line);
    const partes: SectionLevelPart[] = [];
    this.recalculados = 0;
    for (const id of levelIds) {
      const chave = chaves.get(id) ?? `?${Math.random()}`;
      const hit = this.partes.get(id);
      if (hit && hit.chave === chave) {
        partes.push(hit.parte);
        continue;
      }
      const parte = sectionLevelPart(p, id, line);
      this.partes.set(id, { chave, parte });
      this.recalculados++;
      partes.push(parte);
    }
    for (const id of [...this.partes.keys()]) if (!levelIds.includes(id)) this.partes.delete(id);
    return assembleSection(p, line, partes);
  }
}

/** Chave de conteúdo da parte de cada pavimento no corte da linha. */
export function chavesDoCorte(p: Project, line: SectionLine): Map<Id, string> {
  const a = assinaturasDoProjeto(p);
  const conteudo = (id: Id): string => a.nivel.get(id) ?? '-';
  const telhados = a.comTelhado.map((id) => conteudo(id)).join('|');
  const linha = [line.a.x, line.a.y, line.b.x, line.b.y, line.depth].map((v) => machineNumber(v, 9)).join(',');
  const out = new Map<Id, string>();
  a.ordem.forEach((id, i) => {
    const abaixo = i > 0 ? conteudo(a.ordem[i - 1]!) : '-';
    const acima = i < a.ordem.length - 1 ? conteudo(a.ordem[i + 1]!) : '-';
    const deTelhado = a.anexadosAoTelhado.has(id) ? telhados : '-';
    out.set(id, hashTexto([linha, a.global, a.horizontais, abaixo, conteudo(id), acima, deTelhado].join('|')));
  });
  return out;
}

/** Corte de uma vista do projeto, com o estado incremental guardado por vista (no worker, vive com ele). */
const porVista = new Map<Id, SecaoIncremental>();
export function calcularCorteDaVista(p: Project, viewId: Id): SectionResult | null {
  const view = p.views.find((v) => v.id === viewId);
  if (!view) {
    porVista.delete(viewId);
    return null;
  }
  const pts = sectionPoints(p, view);
  let inc = porVista.get(viewId);
  if (!inc) porVista.set(viewId, (inc = new SecaoIncremental()));
  return inc.calcular(p, { a: pts.a, b: pts.b, depth: view.depth });
}
