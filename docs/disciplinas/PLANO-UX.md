# Plano de UX das disciplinas (consenso de 2026-11-23)

Este documento é a fonte única para a implementação do pacote de UX aprovado pelo dono. Em caso de dúvida, ele vence.

## Decisões aprovadas

1. **Visibilidade ≠ permissão.** Elemento de outra disciplina pode estar visível e **travado**.
2. **Apresentação** deixa de ser só `normal | halftone | hidden` e ganha **clareamento** (mistura com o papel) e **opacidade** (0..1), independentes.
3. **Default das referências:** parede em Estrutura = `halftone`, `clareamento 0.2`, `opacidade 0.5`. Demais referências: `clareamento 0.5`, `opacidade 1` (visual de hoje), salvo a tabela abaixo.
4. **Configurador:** modo simples disciplina × disciplina + slider global de opacidade; modo avançado por categoria com os dois sliders.
5. **HR** = reexibir tudo permanentemente na vista ativa (Hide in View + temporário). **RH** não muda.
6. **Terreno e lote** passam a pertencer a **Arquitetura** (não a `geral`).
7. **Grupo de disciplina criada** mostra o nome (ou “Disciplina <id>”) e a cor.
8. **Vistas 3D salvas** no projeto, duplicáveis/renomeáveis/excluíveis.
9. Compatibilidade: tudo opcional; esquema **32 → 33** (identidade); arquivo antigo abre com o comportamento de hoje.

## Modelo

```ts
export type Tone = 'normal' | 'halftone' | 'hidden';
export interface Apresentacao {
  tone: Tone;
  /** 0..1 — mistura com o papel. 0 = cor original; 1 = papel. */
  clareamento?: number;
  /** 0..1 — 1 = opaco. */
  opacidade?: number;
}
export type TomOuApresentacao = Tone | Apresentacao;
export type DisciplineProfile = Partial<Record<GraphicsCategory, TomOuApresentacao>>;
```

- `apresentacaoDe(valor)` normaliza: string `halftone` ⇒ `{ tone:'halftone', clareamento:0.5, opacidade:1 }`; `normal`/`hidden` ⇒ clareamento 0/opacidade 1; objeto válido ⇒ clamp 0..1; inválido ⇒ normal opaco.
- `presetApresentacao(trabalho, elemento)`:
  - `estrutura|arquitetura` ⇒ `{ tone:'halftone', clareamento:0.2, opacidade:0.5 }`;
  - `arquitetura|estrutura` ⇒ `{ tone:'normal', clareamento:0, opacidade:1 }`;
  - demais pares `halftone` ⇒ `{ tone:'halftone', clareamento:0.5, opacidade:1 }`;
  - `geral` nunca recebe tom (normal opaco).
- `apresentacaoDaCategoria(p, plan, categoria, disciplinaElemento?)` com a precedência atual: exceção da vista → perfil → predefinido → normal. `tomDaCategoria` continua existindo como wrapper que devolve `.tone`.
- Schema **33**; migração 32 → 33 identidade. Atualizar todos os testes de versão (32 → 33; recusa 33 → 34).
- `Project.disciplineProfiles` e `PlanView.tones` aceitam `TomOuApresentacao`. Leitura tolerante; escrita preserva.

## Renderização

- **Planta/corte:** `PlanPaint` ganha `clareamento` e `opacidade`; o preenchimento/hachura usa `alpha * opacidade`; as linhas usam `max(0.3, opacidade)` para não sumirem. `halftone` legado continua verdadeiro quando `tone === 'halftone'`.
- **3D:** `materiais3d.face` mistura a cor por `clareamento` e usa `transparent`/`opacity` por `opacidade`; `depthWrite: false` quando `opacidade < 1`. Arestas continuam opacas. Referência não entra no picking.
- **Picking/seleção:** `tone==='halftone'` continua não selecionável (snap/cota sim). `normal` de outra disciplina é **travado** (não seleciona) salvo “Liberar edição”.

## Edição

- `UiState.liberarEdicao: boolean` (sessão; padrão `false`).
- `disciplinaDeTrabalho`: `minhaDisciplina ?? disciplina da vista` (3D: `view3d.discipline`; se ausente = todas ⇒ edita todas; corte usa `minhaDisciplina ?? 'arquitetura'`).
- `podeEditar(el, p, trabalho, liberar)`: `liberar || trabalho === 'todas' || disciplinaDoElemento(el) === trabalho`. `geral` só edita se `trabalho === 'geral'` ou liberar (anotações são por vista e não entram nessa regra).
- Elementos travados: desenhados normalmente, **não selecionam**; cursor/mensagem “Pertence a <disciplina>”. Snap/cota continuam.
- Implementar em `visibilityOf` um conjunto `bloqueados` e passá-lo ao `ToolEnv`/picking, como `halftone`.
- UI: botão “Editar outras disciplinas” na barra da vista (liga/desliga `liberarEdicao`).

## Configurador

- Botão **“Disciplinas”** na barra da vista, ao lado de “Minha disciplina”.
- **Simples:** linhas = disciplinas do projeto; colunas = Normal / Referência / Oculto; slider global “Opacidade das referências” (padrão 50%). “Copiar de…”, “Restaurar predefinido”.
- **Avançado:** matriz por categoria; ao escolher Referência, dois campos: “Clarear %” e “Opacidade %”.
- Cada alteração é um comando (um passo de desfazer); recusa em `role="alert"`.
- Nome de disciplina criada: `rotuloDaDisciplina(p, lang, id)` (nome do projeto, fallback “Disciplina <id>”), com cor e ordenação.

## HR e RH

- `RH` = revelar ocultos (temporário) — **não mexer**.
- `HR` = **Reexibir tudo** na vista ativa: limpa Hide in View (elementos + categorias) e o temporário (HH/HI/HC/IC/RH), num passo de desfazer. Não mexe no perfil de disciplina nem em “Visibilidade e gráficos”.
- Atualizar atalhos, tooltips e testes.

## Terreno e lote

- `DISCIPLINE_OF_KIND.terrain/terrainRegion/lot` e `CATEGORY_REGISTRY.site/lot` passam a `arquitetura`.
- `geral` fica para anotações, `cad`/`generic` sem classe IFC.
- Em outras disciplinas: Referência por padrão (configurável); edição só na dona.

## Vistas 3D salvas

- `Project.view3dViews?: View3DView[]`:
  ```ts
  interface View3DView {
    id: Id; name: string; discipline?: Discipline;
    camera: { azimuth: number; elevation: number; distance: number; target: {x:number;y:number;z:number}; ortho: boolean };
    settings: View3DSettings;
    hidden?: ViewHidden;
    tones?: Partial<Record<Discipline, TomOuApresentacao>>;
  }
  ```
- Comandos: `addView3DView`, `duplicateView3DView`, `updateView3DView`, `removeView3DView`.
- Navegador: grupo “Vistas 3D” com abrir, duplicar, renomear, excluir. Aba `3d:<id>`.
- A vista 3D atual continua como “3D padrão”.

## Regras de execução

- Trabalhe só na worktree indicada. Não faça commit, push, merge, rebase nem checkout.
- Rode testes com `~/hestia-tools/pvitest.sh` (nunca `npx vitest` direto). Typecheck/lint pelo portão do orquestrador.
- Textos de interface nos **sete idiomas**.
- Testes com valores **literais**; não altere teste existente sem justificar.
- Relatório final curto: arquivos, testes, pendências.
