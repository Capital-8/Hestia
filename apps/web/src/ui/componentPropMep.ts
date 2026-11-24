import { isComponent, type Component, type ConexaoComponente, type Id, type Ligacao, type Project, type ProjectStore, type SistemaMep } from '@hestia/model';

/*
 * Lógica do painel de propriedades MEP (ficha G3), sem JSX: lista as ligações de uma instância com o vizinho conectado,
 * e grava inclinação, desconexão e renomeação de sistema pelos comandos do modelo, uma transação por edição (desfazer).
 */

/** Uma ligação da família, com a conexão atual (se houver), o vizinho resolvido para exibir e o sistema. */
export interface LinhaLigacao {
  ligacao: Ligacao;
  conexao: ConexaoComponente | undefined;
  /** Vizinho existente: id da instância, nome da família e da ligação dele. `null` quando livre ou quando a instância sumiu. */
  vizinho: { id: Id; familia: string; ligacao: string } | null;
  sistema: SistemaMep | undefined;
}

export function linhasDeLigacao(p: Project, c: Component): LinhaLigacao[] {
  const familia = p.componentFamilies?.[c.familyId];
  return (familia?.ligacoes ?? []).map((ligacao) => {
    const conexao = c.ligacoes?.[ligacao.id];
    const outra = conexao ? p.elements[conexao.componenteId] : undefined;
    const vizinho = conexao && isComponent(outra)
      ? {
        id: outra.id,
        familia: p.componentFamilies?.[outra.familyId]?.nome ?? outra.familyId,
        ligacao: p.componentFamilies?.[outra.familyId]?.ligacoes?.find((l) => l.id === conexao.ligacaoId)?.nome ?? conexao.ligacaoId,
      }
      : null;
    const sistema = conexao?.sistemaId !== undefined ? p.sistemasMep?.[conexao.sistemaId] : undefined;
    return { ligacao, conexao, vizinho, sistema };
  });
}

/** Sistema da instância (o primeiro das suas conexões que tem um), ou `undefined`. */
export function sistemaDaLinhas(linhas: readonly LinhaLigacao[]): SistemaMep | undefined {
  return linhas.find((l) => l.sistema !== undefined)?.sistema;
}

/** Inclinação [inclinação, giro] em radianos; ausente = [0, 0] (CONTRATO §7). */
export function inclinacaoDe(c: Component): [number, number] {
  return c.inclinacao ?? [0, 0];
}

export function grausDeRadianos(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function radianosDeGraus(graus: number): number {
  return (graus * Math.PI) / 180;
}

/**
 * Inclinação do trecho como o projetista pensa (fase 2, ficha M1). O campo interno `inclinacao[0]` continua medido a partir da
 * VERTICAL (0 = em pé, 90° = deitado) porque o eixo do tubo é o Z da família; aqui ele vira o ângulo em relação à HORIZONTAL
 * (0° = horizontal, positivo = a ponta B mais alta que a A) e a declividade em % (tangente do ângulo).
 */
export function anguloDaHorizontalGraus(inclinacaoRad: number): number {
  return 90 - grausDeRadianos(inclinacaoRad);
}

/** Declividade (%) = tg(ângulo da horizontal) × 100; `null` quando o trecho é quase vertical (a tangente explode). */
export function declividadePercentual(inclinacaoRad: number): number | null {
  const beta = anguloDaHorizontalGraus(inclinacaoRad);
  return Math.abs(beta) >= 89.5 ? null : Math.tan(radianosDeGraus(beta)) * 100;
}

/** Inclinação interna (graus a partir da vertical) para um ângulo em relação à horizontal. */
export function inclinacaoDeAngulo(anguloDaHorizontal: number): number {
  return 90 - anguloDaHorizontal;
}

/** Inclinação interna (graus a partir da vertical) para uma declividade em %. */
export function inclinacaoDeDeclividade(percentual: number): number {
  return 90 - grausDeRadianos(Math.atan(percentual / 100));
}

/** Grava um dos dois ângulos (0 = inclinação, 1 = giro) em todas as instâncias, numa só transação. */
export function aplicarInclinacao(store: ProjectStore, ids: readonly Id[], indice: 0 | 1, graus: number, rotulo: string): void {
  const valor = radianosDeGraus(graus);
  store.transaction(rotulo, () => {
    for (const id of ids) {
      const atual = store.project.elements[id];
      if (!isComponent(atual)) continue;
      const [inclinacao, giro] = inclinacaoDe(atual);
      const nova: [number, number] = indice === 0 ? [valor, giro] : [inclinacao, valor];
      store.exec({ type: 'setComponentInclination', id, inclinacao: nova });
    }
  });
}

/** Desfaz a ligação `ligacaoId` nos dois lados, para cada instância da seleção que a tiver conectada. */
export function desconectarLigacao(store: ProjectStore, ids: readonly Id[], ligacaoId: string, rotulo: string): void {
  store.transaction(rotulo, () => {
    for (const id of ids) {
      const atual = store.project.elements[id];
      if (!isComponent(atual) || !atual.ligacoes?.[ligacaoId]) continue;
      store.exec({ type: 'disconnectComponents', a: id, ligacaoA: ligacaoId });
    }
  });
}

export function renomearSistema(store: ProjectStore, sistemaId: Id, nome: string, rotulo: string): void {
  store.transaction(rotulo, () => {
    store.exec({ type: 'renameMepSystem', id: sistemaId, nome });
  });
}
