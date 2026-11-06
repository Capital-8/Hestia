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
