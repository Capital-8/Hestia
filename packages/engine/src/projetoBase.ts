import type { Project } from '@hestia/model';

/**
 * Projeto promovido (`projetoComParceiras`) -> projeto de que saiu. Pisos, lajes e telhados dependem só do projeto real: a
 * resolução deles usa o ORIGINAL, para reaproveitar caches e despacho (o promovido é um objeto novo por nível e refaria tudo).
 */
const origem = new WeakMap<Project, Project>();

export const registrarProjetoBase = (promovido: Project, original: Project): void => {
  origem.set(promovido, original);
};

/** O projeto original de um promovido; o próprio projeto se não for promovido. */
export const projetoBase = (p: Project): Project => origem.get(p) ?? p;
