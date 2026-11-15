# Retomada no computador local

Estado em 2026-11-15. O **plano obrigatório está concluído**. Leia `docs/terreno/ESTADO.md` (tabela das fichas e pendências), `docs/terreno/PLANO.md` (Parte A é a lei; emendas E1 a E4 no fim) e `docs/decisoes/0058-terreno-e-lote.md`.

## Onde está o trabalho
- Branch única no GitHub: `claude/happy-einstein-sgyixh`. **Nada de pull request** (o dono não pediu). Tudo o que está lá passou no portão do fiscal.
- **Entregue:** modelo, kernel Rust (TIN com `spade`), motor, planta, 3D, corte e elevação, importação DXF e CSV, edição, regiões, tabela e mapa de corte e aterro, lote (desenho, rumos, índices, avisos), gravidade, IFC, DXF e prancha, E2E em navegador.
- **Verificação em navegador:** `docs/terreno/evidencias/final/` (21 capturas e `RELATORIO-E2E.md`); rode `npm run build && node tests/e2e/terreno.mjs`.

## O que ainda falta (nada bloqueia o uso)
1. **P5, envelope legal** e "incluir massas" nos índices: dependem da massa conceitual (`docs/massa/`, branch `claude/youthful-dirac-l4egd1`), que não está nesta branch. Quando a massa entrar na `main`, rode o protocolo de B.7 do plano e depois a ficha P5.
2. **Fase 7, Rastreamento e Referência (F1 e F2):** opcional; **só com o aceite do dono**, porque mexe no estado das vistas.
3. **Defeitos conhecidos não corrigidos** (ver a linha da Q1 no ESTADO): D6 rótulos HTML da planta escondidos após zoom; D7 sem WASM o app não abre projeto (kernel obrigatório); D8 solo do corte sem hachura (a biblioteca não tem material de terra); D9 coluna Saldo fora da área visível sem rolar.
4. **Pendências menores:** contorno do lote tracejado longo em vez de traço-dois-pontos; textos frente, lateral e fundo em dicionário local (`render/plan/lote.ts`) em vez do i18n; 3D: tremor entre plataforma e laje não verificado; comentário `lote: ficha P3` em `copyLink.ts`.
5. **Decisão do dono ainda aberta:** o sinal do norte verdadeiro foi decidido pelo fiscal (emenda E4: `azimute + norteVerdadeiro`); reverter se discordar (um sinal em `packages/engine/src/loteRumos.ts` e nos testes).

## Preparar a máquina
```bash
git clone https://github.com/engdennylsonsantos-cloud/hestia.git
cd hestia
git checkout claude/happy-einstein-sgyixh
npm ci
rustup toolchain install 1.97.1 --profile minimal --target wasm32-unknown-unknown --component clippy
```
Linha de base: typecheck, lint (8 avisos antigos), `test:rapido` verde, `test:wasm` verde, `test:ifc-export` verde; **clippy já falha na base com 39 avisos** (o portão é: não sobe de 39 e arquivo novo da frente não tem nenhum). Para o E2E e `test:i18n` o ambiente precisa do Chromium (no Linux de nuvem: `mkdir -p /opt/pw-browsers/chromium-1248/chrome-linux64 && ln -sf /opt/pw-browsers/chromium /opt/pw-browsers/chromium-1248/chrome-linux64/chrome`) e de um servidor em `:5173` para o `test:i18n` (`npm run dev -w @hestia/web -- --port 5173`).

## Regras desta frente
- Subagentes **somente Sonnet ou Haiku** (ordem do dono); Haiku para fichas mecânicas com molde próximo.
- Uma suíte de testes por vez (duas em paralelo geram falhas espúrias de tempo).
- `reports/i18n/hardcoded-pt.json` (saída do `npm run audit:i18n`) não pode ser commitado.
- O worktree é a unidade de trabalho: `git worktree add /home/user/hestia-wt/<ficha> -b terreno/<ficha> claude/happy-einstein-sgyixh` e `npm ci` dentro dele. Só a branch de trabalho vai ao GitHub.

## Como continuar com um assistente
Abra o Claude Code na pasta, na branch acima, e diga: "leia `docs/terreno/RETOMADA.md`, `ESTADO.md` e `PLANO.md` e me diga o que falta".
