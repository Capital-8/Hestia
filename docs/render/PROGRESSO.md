# Render GPU nativo: progresso e pendências

Data: 2026-11-06. Branch: `render/integracao-teste` (integração de teste, ainda não entrou no branch principal).

## Feito

- **Motor (Rust/wgpu)**: tiles com progresso real, MSAA 4×, sombra suave (PCSS), oclusão ambiente (SSAO), vidro com refração e reflexo, céu com iluminação em harmônicos esféricos.
- **Texturas**: formato v3 com mapas por material (albedo, normal, rugosidade, metálico), mipmaps e triplanar. Sem o limite de 16 texturas: agora são arrays (a casa de alto padrão usa 22 e renderiza em ~0,4 s).
- **Sombra**: o volume da sombra segue a cena real, não a margem do chão. Causa do "sem sombra" na vista padrão: a câmera olha quase na direção do sol.
- **Chão e exposição**: albedo do chão calibrado (0,25); exposição padrão 0 EV.
- **Escala das texturas**: recalibrada por superfície (tijolo, telha, madeira, piso, reboco).
- **Prévia**: cache de texturas, carga em paralelo (4), prévia em 512 px e progresso visível.
- **Câmera de render**: a câmera escolhida na aba Vista entra no render GPU nativo.
- **Materiais**: aba "Render" na janela de materiais (textura, escala, rugosidade, metalicidade, transmissão, IOR, emissão) e valores iniciais para os materiais padrão, aplicados só quando faltam.
- **Ícone**: esfera quadriculada em azul no menu Gerenciar.

## Em andamento (não commitado)

- Céu e horizonte: o commit `972d18b6` já tem o horizonte, o halo do sol e a névoa de distância. A parte de pós-processamento (curva de tons AgX, balanço de branco, exposição automática opcional) está em andamento, sem commit.

## Pendente

1. **Cor do material na parede com textura**: hoje a textura substitui a cor do material, e a parede fica mais escura que a paleta. Correção prevista: multiplicar a textura pela cor do material.
2. **Iluminação global** (rastreamento de caminhos ou sondas): é o que dá o realismo de verdade (reflexos no vidro, luz indireta, sombra de contato). Ainda não começou; precisa de aprovação do tempo de render.
3. **Luzes internas**: materiais emissivos ainda não iluminam o ambiente.
4. **Compressão das texturas**: a casa gera ~120 MB por render.
5. **Perfis de qualidade por placa**: só a RX 580 foi testada.
6. **Render final em CPU (WASM)**: não aplica texturas; recusa com aviso.
7. **Integração no branch principal**: depende de autorização.

## Como testar

- Serviço: `npm run render:service` (a partir de `wt\integracao`).
- App: `npx vite --port 5180 --strictPort` (em `apps\web`), depois `http://localhost:5180/`.

## Pendência final (verificar por último)

Verificação no localhost, só depois de todos os lotes terminarem:
1. Recompilar e reiniciar o serviço (`npm run render:service`, a partir de `wt\integracao`); o serviço não estava em execução em 2026-11-06.
2. Conferir no app: segundo render da mesma cena sem reenvio (cache de cenas), céu e horizonte, cor das paredes com textura, câmera de render escolhida, aba Render dos materiais, ícone de materiais nos dois temas.
3. Conferir no console (F12) se alguma textura de `/texturas-render/` falha ao carregar.

## Protótipo de iluminação global (crates/render-pt0)

- Fase 3 (commit 06668b4f): com 4 vértices por caminho, a diferença contra o rastreador de CPU do render-core é 0,77 % nas faces diretas e 2,27 % na luz indireta (cena de teste, céu uniforme, 640x360). Custo ~8,4 ms por passe, 0,54 s para 64 amostras na RX 580.
- Limites: a referência usa um ambiente simplificado (0,3 x cor x céu); a cena de teste não tem metal, vidro nem texturas; ainda há grão com 64 amostras (falta denoise). Não é fotorrealismo comprovado.
- Bug achado em crates/render-core: `Rng::novo` mistura semente e amostra por XOR nos mesmos bits; sementes 1 e 2 com 4 ou 64 amostras geram imagens idênticas. Não corrigido (código fora do escopo do render GPU).
- A anomalia de tempo do modo "só sol" era a GPU saindo do repouso, não custo do modo (inferido pelo tempo).

## Atualização 2026-11-06 (tarde)

Feito desde a nota anterior (todos commitados no branch de teste):
- **Cor do material com textura**: a textura é multiplicada pela cor do material (a parede deixou de ficar mais escura que a paleta).
- **Céu/horizonte e pós-processamento**: horizonte com névoa de distância, halo do sol, curva AgX, balanço de branco, exposição automática opcional (desligada).
- **Cache de cenas** no serviço e no cliente (segundo render sem reenvio do HSTR; ~0,4 s para ~0,06 s no serviço).
- **Fluidez**: mipmaps, codificação do HSTR, hash SHA-256 e leitura de pixels das texturas em Web Worker. Não medido em navegador real.
- **Perfis de qualidade por placa** (leve/padrão/alta), tile adaptativo e recusa explícita quando a cena não cabe. Só a RX 580 foi testada; a memória da placa não é informada pelo wgpu.
- **Sombras em cascata** (3 cascatas): texel até 4x mais fino perto da câmera; sem ganho mensurável de nitidez de borda; memória de sombra 16 -> 48 MiB.
- **Protótipo de iluminação global (crates/render-pt0)**: path tracing na GPU com BVH, sol com disco, céu do motor, 4 vértices, metal, vidro, texturas (triplanar + mips) e denoise À-Trous. Na casa de alto padrão, 1280x720: ~84 ms por passe; N=16 com denoise estimado em ~3 s (1920x1080).
  - Limites: denoise piora texturas e arestas a partir de N=32 e remove o antialias dos contornos; vidro e metal não validados contra referência correta; tipos procedurais não existem no pt0.
  - Ainda NÃO está integrado ao serviço nem ao app.

Pendências:
1. Integrar o path tracing ao serviço como modo de qualidade máxima (modo no job, progressão por amostra, perfis).
2. Corrigir o denoise (albedo por amostra, preservar antialias).
3. Luzes internas (precisa de decisão sobre quais elementos são luminárias).
4. Compressão das texturas.
5. Bug no render-core: `Rng::novo` mistura semente e amostra por XOR.
6. Verificação final no localhost (ver "Pendência final").
