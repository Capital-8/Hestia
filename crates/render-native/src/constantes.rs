//! Constantes compartilhadas pelo renderizador (formato, sombra e ambiente).

/// Lado do mapa de sombra direcional.
pub const LADO_SOMBRA: u32 = 2048;

/// Formato da textura final; a codificação sRGB é feita no shader.
pub const FORMATO_COR: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Formato de profundidade principal e do mapa de sombra.
pub const FORMATO_PROFUNDIDADE: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

/// Exposição fixa desta primeira versão (o HSTR não carrega exposição).
pub const EXPOSICAO: f64 = 1.0;

/// Céu linear usado quando `Cena.fundo` é `None`.
pub const CEU_PADRAO: [f64; 3] = [0.36, 0.52, 0.75];

/// Luz refletida do chão no ambiente hemisférico.
pub const CHAO_AMBIENTE: [f64; 3] = [0.18, 0.16, 0.13];
