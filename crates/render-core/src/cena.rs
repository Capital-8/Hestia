//! Cena neutra do render offline: triângulos, materiais, lotes, sol, fundo e câmera.
//!
//! # Formato binário `HSTR` versão 3 (escrita com texturas), 2 (sem texturas) e 1 (leitura)
//!
//! Tudo é **little-endian**; `f32` é IEEE-754 de 32 bits. O JS monta os bytes na ordem abaixo
//! (`apps/web/src/editor/render/wasmClient.ts` é a referência dos bytes). A versão 1 continua aceita
//! na leitura; a versão 2 acrescenta, no fim de cada material, o tipo de superfície e a escala; a
//! versão 3 acrescenta os índices de textura por material e a seção de texturas. `codificar` grava
//! a v3 só quando a cena tem textura; sem textura grava a v2, como antes.
//!
//! ```text
//! cabeçalho fixo — 32 bytes
//!   0   "HSTR"                      4 bytes
//!   4   versão                      u32 = 3 com texturas, 2 sem (1, 2 e 3 são aceitas na leitura)
//!   8   n_vertices                  u32
//!   12  n_indices                   u32 (múltiplo de 3)
//!   16  n_normais                   u32 (0 ou n_vertices)
//!   20  n_materiais                 u32
//!   24  n_batches                   u32
//!   28  flags                       u32 (bit 0 = normais presentes, bit 1 = fundo presente)
//!
//! posições        n_vertices * 3 f32        (x, y, z em metros, Z para cima)
//! índices         n_indices  * u32
//! normais         n_vertices * 3 f32        (só se flags & 1)
//! materiais       n_materiais * bloco       (ver abaixo; v1 = 44 bytes, v2 = 52, v3 = 68)
//! texturas        só na v3: seção abaixo (quantidade 0 quando não há textura)
//! lotes           n_batches * 3 u32         (início, quantidade de índices, material)
//! sol             3 f32                     (azimute em graus, elevação em graus, intensidade)
//! fundo           3 f32                     (só se flags & 2; cor linear)
//! câmera          37 f32                    (view 16, projeção 16, posição 3, perto, longe)
//! ```
//!
//! Bloco de material, na ordem:
//!
//! ```text
//! v1 (44 bytes): 11 f32
//!   cor base (3), rugosidade, metálico, opacidade, transmissão, IOR, emissivo (3)
//! v2 (52 bytes): 11 f32 da v1, depois
//!   tipo    u32   0 liso, 1 reboco, 2 madeira, 3 telha, 4 piso, 5 metal, 6 vidro, 7 tijolo
//!   escala  f32   coordenada de padrão = posição / escala (metros por repetição), > 0
//! v3 (68 bytes): o bloco da v2, depois 4 u32 de índice de textura, nesta ordem: albedo, normal,
//!   rugosidade, metálico. 0xFFFFFFFF = sem textura. Materiais v1 e v2 leem os quatro como
//!   0xFFFFFFFF.
//! ```
//!
//! Seção de texturas (só na v3), logo depois dos materiais e antes dos lotes:
//!
//! ```text
//! u32   quantidade de texturas (0 a 64)
//! por textura, nesta ordem:
//!   u32   largura (1 a 8192)
//!   u32   altura  (1 a 8192)
//!   u32   níveis de mip N (de 1 até o máximo da cadeia completa de largura x altura)
//!   N níveis RGBA8 em sequência, nível 0 primeiro; cada nível tem metade do lado (mínimo 1),
//!   linhas de cima para baixo, sem padding e sem compressão
//! ```
//!
//! A seção inteira (cabeçalhos incluídos) fica limitada a 1 GB. Na leitura, a seção é conferida
//! contra o tamanho do buffer antes de cada cópia. Índice de textura fora da lista, textura fora
//! dos limites ou número de níveis errado tornam a cena inválida (código 1), sem fallback. As
//! texturas são RGBA8 e o nível 0 é a própria imagem; a amostragem é feita pelo renderizador.
//!
//! Na leitura da v1, todo material vira `tipo = 0`, `escala = 1.0` e sem textura. Valores fora da
//! faixa, `NaN`/infinito, tipo > 7, escala não positiva, índice fora dos arrays ou lote que não
//! cabe nos índices tornam a cena inválida (código 1), nunca um panic.

use crate::bvh::{AcertoGeometrico, Bvh};
use crate::camera::Camera;
use crate::erro::Erro;
use crate::leitor::{escrever_f32, escrever_u32, Leitor};
use crate::vetor::{Aabb, Vec3};

pub const MAGIA_CENA: [u8; 4] = *b"HSTR";
/// Versão gravada por `codificar` quando a cena tem textura (sem textura, grava `VERSAO_CENA_V2`).
pub const VERSAO_CENA: u32 = 3;
/// Versão gravada por `codificar` sem textura: o layout da v2, sem seção de texturas.
pub const VERSAO_CENA_V2: u32 = 2;
/// Versão legada, ainda aceita na leitura.
pub const VERSAO_CENA_V1: u32 = 1;
/// Bytes de um material na v1 (11 f32).
pub const TAMANHO_MATERIAL_V1: usize = 11 * 4;
/// Bytes de um material na v2 (11 f32 + tipo u32 + escala f32).
pub const TAMANHO_MATERIAL_V2: usize = TAMANHO_MATERIAL_V1 + 4 + 4;
/// Bytes de um material na v3 (os 52 da v2 + 4 u32 de índice de textura).
pub const TAMANHO_MATERIAL_V3: usize = TAMANHO_MATERIAL_V2 + 4 * 4;
/// Índice de textura de um canal sem textura (0xFFFFFFFF no formato).
pub const SEM_TEXTURA: u32 = u32::MAX;
/// Quantidade máxima de texturas numa cena (limite do formato).
pub const MAX_TEXTURAS: u32 = 64;
/// Maior largura ou altura de uma textura, em texels.
pub const LADO_TEXTURA_MAXIMO: u32 = 8192;
/// Tamanho máximo da seção de texturas, cabeçalhos incluídos (1 GB).
pub const TAMANHO_SECAO_TEXTURAS_MAXIMO: usize = 1 << 30;
/// Maior valor válido de `Material::tipo`.
pub const TIPO_MATERIAL_MAXIMO: u8 = 7;

/// Limites defensivos: o wasm é single-thread e uma cena absurda não pode derrubar a aba.
const MAX_VERTICES: u32 = 2_000_000;
const MAX_INDICES: u32 = 6_000_000;
const MAX_MATERIAIS: u32 = 100_000;
const MAX_BATCHES: u32 = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Material {
    /// Cor linear, 0..1.
    pub cor_base: [f64; 3],
    pub rugosidade: f64,
    pub metalico: f64,
    pub opacidade: f64,
    pub transmissao: f64,
    pub ior: f64,
    /// Emissivo linear; sem textura nesta fase, mas já transportado pelo contrato.
    pub emissivo: [f64; 3],
    /// Superfície procedural: 0 liso, 1 reboco, 2 madeira, 3 telha, 4 piso, 5 metal, 6 vidro,
    /// 7 tijolo. Na v1 lida como 0.
    pub tipo: u8,
    /// Metros por repetição do padrão (coordenada = posição / escala). Finita e > 0; 1.0 mantém
    /// as dimensões do padrão. Na v1 lida como 1.0.
    pub escala: f64,
    /// Índices na lista de texturas da cena, na ordem: albedo, normal, rugosidade, metálico.
    /// `None` = sem textura naquele canal. Na v1 e na v2 são todos `None`. Índice fora da lista de
    /// texturas torna a cena inválida (ver `Cena::nova`).
    pub texturas: [Option<u32>; 4],
}

/// Textura RGBA8 com cadeia de mips. `niveis[0]` é a imagem; cada nível seguinte tem metade da
/// largura e da altura (mínimo 1). Linhas de cima para baixo, sem padding.
#[derive(Clone, Debug, PartialEq)]
pub struct Textura {
    pub largura: u32,
    pub altura: u32,
    pub niveis: Vec<Vec<u8>>,
}

impl Textura {
    /// Níveis da cadeia completa de mips, até 1x1.
    pub fn niveis_completos(largura: u32, altura: u32) -> u32 {
        32 - largura.max(altura).max(1).leading_zeros()
    }

    /// Largura e altura do nível `nivel` (mínimo 1 em cada eixo).
    pub fn dimensoes_do_nivel(largura: u32, altura: u32, nivel: u32) -> (u32, u32) {
        ((largura >> nivel).max(1), (altura >> nivel).max(1))
    }

    /// `true` se as dimensões, o número de níveis e o tamanho de cada nível estão nos limites.
    pub fn valida(&self) -> bool {
        let lado_ok = |v: u32| (1..=LADO_TEXTURA_MAXIMO).contains(&v);
        if !lado_ok(self.largura) || !lado_ok(self.altura) {
            return false;
        }
        let niveis = self.niveis.len();
        if niveis == 0 || niveis > Self::niveis_completos(self.largura, self.altura) as usize {
            return false;
        }
        self.niveis.iter().enumerate().all(|(nivel, pixels)| {
            let (w, h) = Self::dimensoes_do_nivel(self.largura, self.altura, nivel as u32);
            pixels.len() == w as usize * h as usize * 4
        })
    }
}

impl Material {
    /// Material cinza de fallback quando o snapshot não traz nenhum.
    pub fn padrao() -> Self {
        Self {
            cor_base: [0.55, 0.55, 0.55],
            rugosidade: 0.8,
            metalico: 0.0,
            opacidade: 1.0,
            transmissao: 0.0,
            ior: 1.5,
            emissivo: [0.0, 0.0, 0.0],
            tipo: 0,
            escala: 1.0,
            texturas: [None; 4],
        }
    }

    pub fn cor(self) -> Vec3 {
        Vec3::de_array(self.cor_base)
    }

    pub fn emissao(self) -> Vec3 {
        Vec3::de_array(self.emissivo)
    }

    pub fn valido(self) -> bool {
        let cor_ok = self
            .cor_base
            .iter()
            .all(|v| v.is_finite() && (0.0..=1.0).contains(v));
        let emissivo_ok = self
            .emissivo
            .iter()
            .all(|v| v.is_finite() && *v >= 0.0 && *v <= 100.0);
        cor_ok
            && emissivo_ok
            && self.tipo <= TIPO_MATERIAL_MAXIMO
            && self.escala.is_finite()
            && self.escala > 0.0
            && (0.0..=1.0).contains(&self.rugosidade)
            && (0.0..=1.0).contains(&self.metalico)
            && (0.0..=1.0).contains(&self.opacidade)
            && (0.0..=1.0).contains(&self.transmissao)
            && self.ior.is_finite()
            && self.ior >= 0.1
            && self.ior <= 10.0
    }
}

/// Faixa de índices de um material, exatamente como `RenderBatch` do TypeScript.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Lote {
    pub inicio_indices: u32,
    pub quantidade_indices: u32,
    pub material: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sol {
    /// Graus, 0 = leste, anti-horário.
    pub azimute: f64,
    /// Graus acima do horizonte.
    pub elevacao: f64,
    pub intensidade: f64,
}

impl Sol {
    pub fn padrao() -> Self {
        Self {
            azimute: 135.0,
            elevacao: 45.0,
            intensidade: 3.0,
        }
    }

    pub fn valido(self) -> bool {
        self.azimute.is_finite()
            && self.elevacao.is_finite()
            && self.intensidade.is_finite()
            && (-90.0..=90.0).contains(&self.elevacao)
            && (0.0..=1000.0).contains(&self.intensidade)
    }

    /// Direção **para o Sol**, em Z para cima. Azimute 0 = +X (leste) e cresce no anti-horário
    /// visto de cima, como `SunState` do contrato.
    pub fn direcao(self) -> Vec3 {
        let azimute = self.azimute.to_radians();
        let elevacao = self.elevacao.to_radians();
        let horizontal = elevacao.cos();
        Vec3::novo(
            horizontal * azimute.cos(),
            horizontal * azimute.sin(),
            elevacao.sin(),
        )
    }

    /// Payload de `atualizar_sol`: 3 `f32` (azimute, elevação, intensidade).
    pub fn de_tripla(bytes: &[u8]) -> Result<Self, Erro> {
        if bytes.len() != 12 {
            return Err(Erro::TrabalhoInvalido);
        }
        let mut leitor = Leitor::novo(bytes);
        let sol = Self {
            azimute: leitor.f32().ok_or(Erro::TrabalhoInvalido)?,
            elevacao: leitor.f32().ok_or(Erro::TrabalhoInvalido)?,
            intensidade: leitor.f32().ok_or(Erro::TrabalhoInvalido)?,
        };
        if sol.valido() {
            Ok(sol)
        } else {
            Err(Erro::TrabalhoInvalido)
        }
    }
}

pub(crate) struct Triangulo {
    pub v0: Vec3,
    pub v1: Vec3,
    pub v2: Vec3,
    pub n0: Vec3,
    pub n1: Vec3,
    pub n2: Vec3,
    pub material: usize,
    pub caixa: Aabb,
    pub centroide: Vec3,
}

/// Interseção devolvida ao tracer.
#[derive(Clone, Copy, Debug)]
pub struct Acerto {
    pub t: f64,
    pub ponto: Vec3,
    /// Normal interpolada, já orientada contra o raio.
    pub normal: Vec3,
    pub material: usize,
}

/// Partes usadas para montar uma cena validada (e para os testes).
pub struct PartesCena {
    pub posicoes: Vec<f64>,
    pub indices: Vec<u32>,
    pub normais: Vec<f64>,
    pub materiais: Vec<Material>,
    pub texturas: Vec<Textura>,
    pub lotes: Vec<Lote>,
    pub sol: Sol,
    pub fundo: Option<[f64; 3]>,
    pub camera: Camera,
}

pub struct Cena {
    pub posicoes: Vec<f64>,
    pub indices: Vec<u32>,
    pub normais: Vec<f64>,
    pub materiais: Vec<Material>,
    /// Texturas RGBA8 referenciadas pelos índices de `Material::texturas`. Vazia sem textura.
    pub texturas: Vec<Textura>,
    pub lotes: Vec<Lote>,
    pub sol: Sol,
    pub fundo: Option<[f64; 3]>,
    pub camera: Camera,
    pub(crate) triangulos: Vec<Triangulo>,
    pub(crate) bvh: Bvh,
}

impl Cena {
    pub fn nova(partes: PartesCena) -> Result<Self, Erro> {
        let PartesCena {
            posicoes,
            indices,
            normais,
            mut materiais,
            texturas,
            lotes,
            sol,
            fundo,
            camera,
        } = partes;

        if posicoes.len() % 3 != 0 || posicoes.is_empty() {
            return Err(Erro::CenaInvalida);
        }
        let n_vertices = posicoes.len() / 3;
        if indices.is_empty() || indices.len() % 3 != 0 {
            return Err(Erro::CenaInvalida);
        }
        if !posicoes.iter().all(|v| v.is_finite()) {
            return Err(Erro::CenaInvalida);
        }
        if !indices.iter().all(|&i| (i as usize) < n_vertices) {
            return Err(Erro::CenaInvalida);
        }
        if !normais.is_empty() && normais.len() != posicoes.len() {
            return Err(Erro::CenaInvalida);
        }
        if !normais.iter().all(|v| v.is_finite()) {
            return Err(Erro::CenaInvalida);
        }
        if materiais.is_empty() {
            materiais.push(Material::padrao());
        }
        if !materiais.iter().all(|m| m.valido()) {
            return Err(Erro::CenaInvalida);
        }
        if texturas.len() > MAX_TEXTURAS as usize || !texturas.iter().all(Textura::valida) {
            return Err(Erro::CenaInvalida);
        }
        // Índice de textura fora da lista é recusado, nunca ignorado em silêncio.
        let indice_valido = |i: u32| (i as usize) < texturas.len();
        if !materiais
            .iter()
            .all(|m| m.texturas.iter().flatten().all(|&i| indice_valido(i)))
        {
            return Err(Erro::CenaInvalida);
        }
        for lote in &lotes {
            let fim = (lote.inicio_indices as usize)
                .checked_add(lote.quantidade_indices as usize)
                .ok_or(Erro::CenaInvalida)?;
            if lote.inicio_indices % 3 != 0
                || lote.quantidade_indices % 3 != 0
                || fim > indices.len()
                || lote.material as usize >= materiais.len()
            {
                return Err(Erro::CenaInvalida);
            }
        }
        if !sol.valido() || !camera.valida() {
            return Err(Erro::CenaInvalida);
        }
        if let Some(cor) = fundo {
            if !cor
                .iter()
                .all(|v| v.is_finite() && (0.0..=100.0).contains(v))
            {
                return Err(Erro::CenaInvalida);
            }
        }

        let triangulos = montar_triangulos(&posicoes, &indices, &normais, &lotes, materiais.len())?;
        let bvh = Bvh::construir(&triangulos);
        Ok(Self {
            posicoes,
            indices,
            normais,
            materiais,
            texturas,
            lotes,
            sol,
            fundo,
            camera,
            triangulos,
            bvh,
        })
    }

    pub fn quantidade_triangulos(&self) -> usize {
        self.triangulos.len()
    }

    pub fn atualizar_camera(&mut self, camera: Camera) -> Result<(), Erro> {
        if camera.valida() {
            self.camera = camera;
            Ok(())
        } else {
            Err(Erro::CenaInvalida)
        }
    }

    pub fn atualizar_sol(&mut self, sol: Sol) -> Result<(), Erro> {
        if sol.valido() {
            self.sol = sol;
            Ok(())
        } else {
            Err(Erro::CenaInvalida)
        }
    }

    /// Primeira interseção no intervalo `(t_min, t_max)`.
    pub fn intersectar(
        &self,
        origem: Vec3,
        direcao: Vec3,
        t_min: f64,
        t_max: f64,
    ) -> Option<Acerto> {
        let bruto = self
            .bvh
            .intersectar(&self.triangulos, origem, direcao, t_min, t_max)?;
        self.montar_acerto(bruto, origem, direcao)
    }

    /// Versão de sombra: para no primeiro acerto.
    pub fn algum_acerto(&self, origem: Vec3, direcao: Vec3, t_min: f64, t_max: f64) -> bool {
        self.bvh
            .algum_acerto(&self.triangulos, origem, direcao, t_min, t_max)
    }

    fn montar_acerto(
        &self,
        bruto: AcertoGeometrico,
        origem: Vec3,
        direcao: Vec3,
    ) -> Option<Acerto> {
        let triangulo = self.triangulos.get(bruto.triangulo as usize)?;
        let (u, v) = (bruto.u, bruto.v);
        let w = 1.0 - u - v;
        let mut normal = triangulo.n0 * w + triangulo.n1 * u + triangulo.n2 * v;
        normal = normal.normalizado();
        if normal.comprimento() < 1.0e-12 {
            normal = (triangulo.v1 - triangulo.v0)
                .cross(triangulo.v2 - triangulo.v0)
                .normalizado();
        }
        if normal.dot(direcao) > 0.0 {
            normal = -normal;
        }
        Some(Acerto {
            t: bruto.t,
            ponto: origem + direcao * bruto.t,
            normal,
            material: triangulo.material,
        })
    }

    /// Serializa no formato `HSTR` v1 (usado nos testes e por ferramentas nativas).
    pub fn codificar(&self) -> Vec<u8> {
        let mut saida = Vec::with_capacity(32 + self.posicoes.len() * 4 + self.indices.len() * 4);
        // Com textura (ou com índice de textura, que a leitura recusaria sem seção): v3. Senão v2.
        let com_texturas = !self.texturas.is_empty()
            || self
                .materiais
                .iter()
                .any(|m| m.texturas.iter().any(Option::is_some));
        saida.extend_from_slice(&MAGIA_CENA);
        escrever_u32(&mut saida, if com_texturas { VERSAO_CENA } else { VERSAO_CENA_V2 });
        escrever_u32(&mut saida, (self.posicoes.len() / 3) as u32);
        escrever_u32(&mut saida, self.indices.len() as u32);
        escrever_u32(&mut saida, (self.normais.len() / 3) as u32);
        escrever_u32(&mut saida, self.materiais.len() as u32);
        escrever_u32(&mut saida, self.lotes.len() as u32);
        let mut flags = 0u32;
        if !self.normais.is_empty() {
            flags |= 1;
        }
        if self.fundo.is_some() {
            flags |= 2;
        }
        escrever_u32(&mut saida, flags);

        for &valor in &self.posicoes {
            escrever_f32(&mut saida, valor);
        }
        for &indice in &self.indices {
            escrever_u32(&mut saida, indice);
        }
        for &valor in &self.normais {
            escrever_f32(&mut saida, valor);
        }
        for material in &self.materiais {
            for valor in material.cor_base {
                escrever_f32(&mut saida, valor);
            }
            escrever_f32(&mut saida, material.rugosidade);
            escrever_f32(&mut saida, material.metalico);
            escrever_f32(&mut saida, material.opacidade);
            escrever_f32(&mut saida, material.transmissao);
            escrever_f32(&mut saida, material.ior);
            for valor in material.emissivo {
                escrever_f32(&mut saida, valor);
            }
            escrever_u32(&mut saida, u32::from(material.tipo));
            escrever_f32(&mut saida, material.escala);
            if com_texturas {
                for canal in material.texturas {
                    escrever_u32(&mut saida, canal.unwrap_or(SEM_TEXTURA));
                }
            }
        }
        if com_texturas {
            escrever_u32(&mut saida, self.texturas.len() as u32);
            for textura in &self.texturas {
                escrever_u32(&mut saida, textura.largura);
                escrever_u32(&mut saida, textura.altura);
                escrever_u32(&mut saida, textura.niveis.len() as u32);
                for nivel in &textura.niveis {
                    saida.extend_from_slice(nivel);
                }
            }
        }
        for lote in &self.lotes {
            escrever_u32(&mut saida, lote.inicio_indices);
            escrever_u32(&mut saida, lote.quantidade_indices);
            escrever_u32(&mut saida, lote.material);
        }
        escrever_f32(&mut saida, self.sol.azimute);
        escrever_f32(&mut saida, self.sol.elevacao);
        escrever_f32(&mut saida, self.sol.intensidade);
        if let Some(cor) = self.fundo {
            for valor in cor {
                escrever_f32(&mut saida, valor);
            }
        }
        for valor in self.camera.view {
            escrever_f32(&mut saida, valor);
        }
        for valor in self.camera.projecao {
            escrever_f32(&mut saida, valor);
        }
        for valor in self.camera.posicao.para_array() {
            escrever_f32(&mut saida, valor);
        }
        escrever_f32(&mut saida, self.camera.perto);
        escrever_f32(&mut saida, self.camera.longe);
        saida
    }

    pub fn decodificar(bytes: &[u8]) -> Result<Self, Erro> {
        let mut leitor = Leitor::novo(bytes);
        let magia = leitor.bytes(4).ok_or(Erro::CenaInvalida)?;
        if magia != MAGIA_CENA {
            return Err(Erro::CenaInvalida);
        }
        let versao = leitor.u32().ok_or(Erro::CenaInvalida)?;
        if versao != VERSAO_CENA && versao != VERSAO_CENA_V2 && versao != VERSAO_CENA_V1 {
            return Err(Erro::CenaInvalida);
        }
        // v2 e v3 trazem tipo e escala; só a v3 traz os índices de textura e a seção de texturas.
        let tem_extras_material = versao >= VERSAO_CENA_V2;
        let tem_texturas = versao == VERSAO_CENA;
        let tamanho_material = if tem_texturas {
            TAMANHO_MATERIAL_V3
        } else if tem_extras_material {
            TAMANHO_MATERIAL_V2
        } else {
            TAMANHO_MATERIAL_V1
        };
        let n_vertices = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let n_indices = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let n_normais = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let n_materiais = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let n_batches = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let flags = leitor.u32().ok_or(Erro::CenaInvalida)?;

        if n_vertices > MAX_VERTICES
            || n_indices > MAX_INDICES
            || n_materiais > MAX_MATERIAIS
            || n_batches > MAX_BATCHES
            || n_vertices == 0
            || n_indices == 0
            || n_indices % 3 != 0
        {
            return Err(Erro::CenaInvalida);
        }
        let tem_normais = flags & 1 != 0;
        let tem_fundo = flags & 2 != 0;
        if flags & !3 != 0
            || (tem_normais && n_normais != n_vertices)
            || (!tem_normais && n_normais != 0)
        {
            return Err(Erro::CenaInvalida);
        }

        // Antes de reservar, confere se o buffer tem pelo menos o tamanho declarado. Sem isso um
        // cabeçalho corrompido poderia pedir uma alocação gigante e derrubar o wasm.
        let bytes_minimos = (n_vertices as usize)
            .checked_mul(12)
            .and_then(|v| v.checked_add((n_indices as usize).checked_mul(4)?))
            .and_then(|v| v.checked_add((n_normais as usize).checked_mul(12)?))
            .and_then(|v| v.checked_add((n_materiais as usize).checked_mul(tamanho_material)?))
            .and_then(|v| v.checked_add((n_batches as usize).checked_mul(12)?))
            .and_then(|v| v.checked_add(12))
            // Quantidade de texturas (v3). O restante da seção é conferido texture a texture.
            .and_then(|v| v.checked_add(if tem_texturas { 4 } else { 0 }))
            .and_then(|v| {
                let fundo = if tem_fundo { 12 } else { 0 };
                v.checked_add(fundo)
            })
            .and_then(|v| v.checked_add(37 * 4))
            .ok_or(Erro::CenaInvalida)?;
        if bytes_minimos > leitor.restante() {
            return Err(Erro::CenaInvalida);
        }

        let mut posicoes = Vec::with_capacity((n_vertices as usize) * 3);
        for _ in 0..(n_vertices as usize) * 3 {
            posicoes.push(leitor.f32().ok_or(Erro::CenaInvalida)?);
        }
        let mut indices = Vec::with_capacity(n_indices as usize);
        for _ in 0..n_indices {
            indices.push(leitor.u32().ok_or(Erro::CenaInvalida)?);
        }
        let mut normais = Vec::with_capacity((n_normais as usize) * 3);
        for _ in 0..(n_normais as usize) * 3 {
            normais.push(leitor.f32().ok_or(Erro::CenaInvalida)?);
        }
        let mut materiais = Vec::with_capacity(n_materiais as usize);
        for _ in 0..n_materiais {
            materiais.push(Material {
                cor_base: [
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                ],
                rugosidade: leitor.f32().ok_or(Erro::CenaInvalida)?,
                metalico: leitor.f32().ok_or(Erro::CenaInvalida)?,
                opacidade: leitor.f32().ok_or(Erro::CenaInvalida)?,
                transmissao: leitor.f32().ok_or(Erro::CenaInvalida)?,
                ior: leitor.f32().ok_or(Erro::CenaInvalida)?,
                emissivo: [
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                    leitor.f32().ok_or(Erro::CenaInvalida)?,
                ],
                // Campos da v2 vêm depois do bloco da v1; na v1 valem os padrões.
                tipo: if tem_extras_material {
                    u8::try_from(leitor.u32().ok_or(Erro::CenaInvalida)?)
                        .map_err(|_| Erro::CenaInvalida)?
                } else {
                    0
                },
                escala: if tem_extras_material {
                    leitor.f32().ok_or(Erro::CenaInvalida)?
                } else {
                    1.0
                },
                texturas: if tem_texturas {
                    let mut canais = [None; 4];
                    for canal in canais.iter_mut() {
                        let valor = leitor.u32().ok_or(Erro::CenaInvalida)?;
                        *canal = (valor != SEM_TEXTURA).then_some(valor);
                    }
                    canais
                } else {
                    [None; 4]
                },
            });
        }
        // Seção de texturas (v3): logo depois dos materiais e antes dos lotes.
        let texturas = if tem_texturas {
            ler_secao_texturas(&mut leitor)?
        } else {
            Vec::new()
        };
        let mut lotes = Vec::with_capacity(n_batches as usize);
        for _ in 0..n_batches {
            lotes.push(Lote {
                inicio_indices: leitor.u32().ok_or(Erro::CenaInvalida)?,
                quantidade_indices: leitor.u32().ok_or(Erro::CenaInvalida)?,
                material: leitor.u32().ok_or(Erro::CenaInvalida)?,
            });
        }
        let sol = Sol {
            azimute: leitor.f32().ok_or(Erro::CenaInvalida)?,
            elevacao: leitor.f32().ok_or(Erro::CenaInvalida)?,
            intensidade: leitor.f32().ok_or(Erro::CenaInvalida)?,
        };
        let fundo = if tem_fundo {
            Some([
                leitor.f32().ok_or(Erro::CenaInvalida)?,
                leitor.f32().ok_or(Erro::CenaInvalida)?,
                leitor.f32().ok_or(Erro::CenaInvalida)?,
            ])
        } else {
            None
        };
        let view = leitor.f32_array::<16>().ok_or(Erro::CenaInvalida)?;
        let projecao = leitor.f32_array::<16>().ok_or(Erro::CenaInvalida)?;
        let posicao = [
            leitor.f32().ok_or(Erro::CenaInvalida)?,
            leitor.f32().ok_or(Erro::CenaInvalida)?,
            leitor.f32().ok_or(Erro::CenaInvalida)?,
        ];
        let perto = leitor.f32().ok_or(Erro::CenaInvalida)?;
        let longe = leitor.f32().ok_or(Erro::CenaInvalida)?;
        if leitor.restante() != 0 {
            return Err(Erro::CenaInvalida);
        }
        let camera = Camera::com_matrizes(view, projecao, Vec3::de_array(posicao), perto, longe)?;
        Self::nova(PartesCena {
            posicoes,
            indices,
            normais,
            materiais,
            texturas,
            lotes,
            sol,
            fundo,
            camera,
        })
    }
}

/// Lê a seção de texturas da v3. Os limites vêm antes de cada cópia: quantidade, dimensões, número
/// de níveis e o tamanho total (1 GB com cabeçalhos). Cada nível é copiado só se o buffer tiver os
/// bytes, então um cabeçalho com dimensões grandes não aloca além do arquivo.
fn ler_secao_texturas(leitor: &mut Leitor<'_>) -> Result<Vec<Textura>, Erro> {
    let quantidade = leitor.u32().ok_or(Erro::CenaInvalida)?;
    if quantidade > MAX_TEXTURAS {
        return Err(Erro::CenaInvalida);
    }
    // A quantidade (4 bytes) já conta na seção.
    let mut total = 4usize;
    let mut texturas = Vec::with_capacity(quantidade as usize);
    for _ in 0..quantidade {
        let largura = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let altura = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let niveis = leitor.u32().ok_or(Erro::CenaInvalida)?;
        let lado_ok = |v: u32| (1..=LADO_TEXTURA_MAXIMO).contains(&v);
        if !lado_ok(largura) || !lado_ok(altura) {
            return Err(Erro::CenaInvalida);
        }
        if niveis == 0 || niveis > Textura::niveis_completos(largura, altura) {
            return Err(Erro::CenaInvalida);
        }
        // Cabeçalho da textura: largura, altura e número de níveis.
        total = total.checked_add(12).ok_or(Erro::CenaInvalida)?;
        let mut lista = Vec::with_capacity(niveis as usize);
        for nivel in 0..niveis {
            let (w, h) = Textura::dimensoes_do_nivel(largura, altura, nivel);
            let tamanho = w as usize * h as usize * 4;
            total = total
                .checked_add(tamanho)
                .filter(|&t| t <= TAMANHO_SECAO_TEXTURAS_MAXIMO)
                .ok_or(Erro::CenaInvalida)?;
            let pixels = leitor.bytes(tamanho).ok_or(Erro::CenaInvalida)?;
            lista.push(pixels.to_vec());
        }
        texturas.push(Textura {
            largura,
            altura,
            niveis: lista,
        });
    }
    Ok(texturas)
}

fn montar_triangulos(
    posicoes: &[f64],
    indices: &[u32],
    normais: &[f64],
    lotes: &[Lote],
    n_materiais: usize,
) -> Result<Vec<Triangulo>, Erro> {
    let n_triangulos = indices.len() / 3;
    // O snapshot deve cobrir todos os triângulos com lotes. Se algum ficar de fora, cai no
    // material 0 (cinza quando o exportador mandou um material padrão), como no contrato.
    let mut material_por_triangulo = vec![0usize; n_triangulos];
    for lote in lotes {
        let inicio = (lote.inicio_indices as usize) / 3;
        let fim = ((lote.inicio_indices + lote.quantidade_indices) as usize) / 3;
        for item in material_por_triangulo.iter_mut().take(fim).skip(inicio) {
            *item = lote.material as usize;
        }
    }
    if material_por_triangulo.iter().any(|&m| m >= n_materiais) {
        return Err(Erro::CenaInvalida);
    }

    let mut triangulos = Vec::with_capacity(n_triangulos);
    for (t, indices_tri) in indices.chunks_exact(3).enumerate() {
        let a = indices_tri[0] as usize;
        let b = indices_tri[1] as usize;
        let c = indices_tri[2] as usize;
        let v0 = Vec3::novo(posicoes[a * 3], posicoes[a * 3 + 1], posicoes[a * 3 + 2]);
        let v1 = Vec3::novo(posicoes[b * 3], posicoes[b * 3 + 1], posicoes[b * 3 + 2]);
        let v2 = Vec3::novo(posicoes[c * 3], posicoes[c * 3 + 1], posicoes[c * 3 + 2]);
        let geometrica = (v1 - v0).cross(v2 - v0).normalizado();
        let normal_em = |i: usize| {
            if normais.is_empty() {
                geometrica
            } else {
                let n = Vec3::novo(normais[i * 3], normais[i * 3 + 1], normais[i * 3 + 2])
                    .normalizado();
                if n.comprimento() < 1.0e-12 {
                    geometrica
                } else {
                    n
                }
            }
        };
        let caixa = Aabb::de_pontos(&[v0, v1, v2]);
        triangulos.push(Triangulo {
            v0,
            v1,
            v2,
            n0: normal_em(a),
            n1: normal_em(b),
            n2: normal_em(c),
            material: material_por_triangulo[t],
            caixa,
            centroide: (v0 + v1 + v2) * (1.0 / 3.0),
        });
    }
    Ok(triangulos)
}

/// Cena pequena e determinística usada pelos testes do núcleo.
#[cfg(test)]
pub(crate) fn cena_teste_publica() -> Cena {
    testes::cena_teste()
}

#[cfg(test)]
mod testes {
    use super::*;

    pub(crate) fn cena_teste() -> Cena {
        let posicoes = vec![
            // chão (dois triângulos)
            -2.0, -2.0, 0.0, 2.0, -2.0, 0.0, 2.0, 2.0, 0.0, -2.0, 2.0, 0.0, // cubo
            -0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.5, 0.5, 0.0, -0.5, 0.5, 0.0, -0.5, -0.5, 1.0, 0.5,
            -0.5, 1.0, 0.5, 0.5, 1.0, -0.5, 0.5, 1.0,
        ];
        let indices = vec![
            0, 1, 2, 0, 2, 3, // chão
            4, 6, 5, 4, 7, 6, // base
            4, 5, 9, 4, 9, 8, // frente
            5, 6, 10, 5, 10, 9, // direita
            6, 7, 11, 6, 11, 10, // trás
            7, 4, 8, 7, 8, 11, // esquerda
            8, 9, 10, 8, 10, 11, // topo
        ];
        let materiais = vec![
            Material {
                cor_base: [0.55, 0.53, 0.5],
                rugosidade: 0.9,
                metalico: 0.0,
                opacidade: 1.0,
                transmissao: 0.0,
                ior: 1.5,
                emissivo: [0.0, 0.0, 0.0],
                tipo: 0,
                escala: 1.0,
                texturas: [None; 4],
            },
            Material {
                cor_base: [0.75, 0.22, 0.18],
                rugosidade: 0.55,
                metalico: 0.0,
                opacidade: 1.0,
                transmissao: 0.0,
                ior: 1.5,
                emissivo: [0.0, 0.0, 0.0],
                tipo: 0,
                escala: 1.0,
                texturas: [None; 4],
            },
        ];
        let lotes = vec![
            Lote {
                inicio_indices: 0,
                quantidade_indices: 6,
                material: 0,
            },
            Lote {
                inicio_indices: 6,
                quantidade_indices: (indices.len() - 6) as u32,
                material: 1,
            },
        ];
        let camera = Camera::olhando_para(
            Vec3::novo(0.0, -4.0, 2.2),
            Vec3::novo(0.0, 0.0, 0.8),
            Vec3::novo(0.0, 0.0, 1.0),
            0.9,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera de teste");
        Cena::nova(PartesCena {
            posicoes,
            indices,
            normais: Vec::new(),
            materiais,
            texturas: Vec::new(),
            lotes,
            sol: Sol::padrao(),
            fundo: None,
            camera,
        })
        .expect("cena de teste")
    }

    #[test]
    fn monta_e_intersecta() {
        let cena = cena_teste();
        assert_eq!(cena.quantidade_triangulos(), 14);
        let origem = Vec3::novo(0.0, -4.0, 0.8);
        let direcao = Vec3::novo(0.0, 1.0, 0.0);
        let acerto = cena
            .intersectar(origem, direcao, 0.001, 100.0)
            .expect("acerta o cubo");
        assert!((acerto.ponto.z - 0.8).abs() < 1.0e-6);
        assert!(cena.algum_acerto(origem, direcao, 0.001, 100.0));
        assert!(!cena.algum_acerto(origem, Vec3::novo(0.0, 0.0, 1.0), 0.001, 100.0));
    }

    #[test]
    fn codifica_e_decodifica() {
        let cena = cena_teste();
        let bytes = cena.codificar();
        let lida = Cena::decodificar(&bytes).expect("decodifica");
        assert_eq!(lida.quantidade_triangulos(), cena.quantidade_triangulos());
        assert_eq!(lida.indices, cena.indices);
        assert_eq!(lida.materiais.len(), cena.materiais.len());
        assert_eq!(lida.lotes, cena.lotes);
        assert!((lida.camera.posicao.z - cena.camera.posicao.z).abs() < 1.0e-6);
        assert_eq!(lida.codificar().len(), bytes.len());
    }

    #[test]
    fn indice_fora_da_cena_e_recusado() {
        let cena = cena_teste();
        let mut bytes = cena.codificar();
        // n_indices está no offset 12; troca o primeiro índice (offset do array) por um absurdo.
        let inicio_indices = 32 + (cena.posicoes.len() / 3) * 3 * 4;
        bytes[inicio_indices..inicio_indices + 4].copy_from_slice(&999_999u32.to_le_bytes());
        assert_eq!(Cena::decodificar(&bytes).err(), Some(Erro::CenaInvalida));
    }

    #[test]
    fn lote_invalido_e_recusado() {
        let cena = cena_teste();
        let bytes = cena.codificar();
        let mut lida = Cena::decodificar(&bytes).expect("decodifica");
        lida.lotes[0].quantidade_indices = 1;
        // A validação de lote acontece em `Cena::nova`; refazer pela serialização não passa por ela.
        // Por isso montamos de novo com as partes lidas.
        let partes = PartesCena {
            posicoes: lida.posicoes,
            indices: lida.indices,
            normais: lida.normais,
            materiais: lida.materiais,
            texturas: lida.texturas,
            lotes: lida.lotes,
            sol: lida.sol,
            fundo: lida.fundo,
            camera: lida.camera,
        };
        assert_eq!(Cena::nova(partes).err(), Some(Erro::CenaInvalida));
    }

    #[test]
    fn sol_aponta_para_cima_no_zenite() {
        let sol = Sol {
            azimute: 0.0,
            elevacao: 90.0,
            intensidade: 1.0,
        };
        let direcao = sol.direcao();
        assert!((direcao.z - 1.0).abs() < 1.0e-9);
        assert!(direcao.x.abs() < 1.0e-9);
    }

    #[test]
    fn fundo_nulo_fica_nulo_no_roundtrip() {
        let cena = cena_teste();
        assert!(cena.fundo.is_none());
        let lida = Cena::decodificar(&cena.codificar()).expect("decodifica");
        assert!(lida.fundo.is_none());
    }

    /// Cena de teste com tipos e escalas variados nos materiais.
    fn cena_com_tipos() -> Cena {
        let base = cena_teste();
        let mut partes = PartesCena {
            posicoes: base.posicoes.clone(),
            indices: base.indices.clone(),
            normais: base.normais.clone(),
            materiais: base.materiais.clone(),
            texturas: Vec::new(),
            lotes: base.lotes.clone(),
            sol: base.sol,
            fundo: base.fundo,
            camera: base.camera,
        };
        partes.materiais[0].tipo = 1;
        partes.materiais[0].escala = 2.5;
        partes.materiais[1].tipo = 7;
        partes.materiais[1].escala = 0.5;
        Cena::nova(partes).expect("cena com tipos")
    }

    #[test]
    fn roundtrip_v2_preserva_tipo_e_escala() {
        let cena = cena_com_tipos();
        let bytes = cena.codificar();
        assert_eq!(&bytes[4..8], &2u32.to_le_bytes(), "escrita usa a versão 2");
        let lida = Cena::decodificar(&bytes).expect("decodifica v2");
        assert_eq!(lida.materiais.len(), 2);
        assert_eq!(lida.materiais[0].tipo, 1);
        assert_eq!(lida.materiais[0].escala, 2.5);
        assert_eq!(lida.materiais[1].tipo, 7);
        assert_eq!(lida.materiais[1].escala, 0.5);
        for (a, b) in lida.materiais[0].cor_base.iter().zip(cena.materiais[0].cor_base) {
            assert!((a - b).abs() < 1.0e-6, "cor preservada em f32");
        }
        assert_eq!(lida.codificar(), bytes, "segundo round-trip é idêntico");
    }

    /// Bytes da versão 1 escritos à mão a partir do layout antigo (sem tipo nem escala).
    fn bytes_v1_manuais(cena: &Cena) -> Vec<u8> {
        let mut saida = Vec::new();
        saida.extend_from_slice(&MAGIA_CENA);
        escrever_u32(&mut saida, VERSAO_CENA_V1);
        escrever_u32(&mut saida, (cena.posicoes.len() / 3) as u32);
        escrever_u32(&mut saida, cena.indices.len() as u32);
        escrever_u32(&mut saida, 0);
        escrever_u32(&mut saida, cena.materiais.len() as u32);
        escrever_u32(&mut saida, cena.lotes.len() as u32);
        escrever_u32(&mut saida, 0);
        for &valor in &cena.posicoes {
            escrever_f32(&mut saida, valor);
        }
        for &indice in &cena.indices {
            escrever_u32(&mut saida, indice);
        }
        for m in &cena.materiais {
            for valor in m.cor_base {
                escrever_f32(&mut saida, valor);
            }
            for valor in [m.rugosidade, m.metalico, m.opacidade, m.transmissao, m.ior] {
                escrever_f32(&mut saida, valor);
            }
            for valor in m.emissivo {
                escrever_f32(&mut saida, valor);
            }
        }
        for lote in &cena.lotes {
            escrever_u32(&mut saida, lote.inicio_indices);
            escrever_u32(&mut saida, lote.quantidade_indices);
            escrever_u32(&mut saida, lote.material);
        }
        for valor in [cena.sol.azimute, cena.sol.elevacao, cena.sol.intensidade] {
            escrever_f32(&mut saida, valor);
        }
        for valor in cena.camera.view.iter().chain(cena.camera.projecao.iter()) {
            escrever_f32(&mut saida, *valor);
        }
        for valor in cena.camera.posicao.para_array() {
            escrever_f32(&mut saida, valor);
        }
        escrever_f32(&mut saida, cena.camera.perto);
        escrever_f32(&mut saida, cena.camera.longe);
        saida
    }

    #[test]
    fn le_v1_gerada_pelo_codigo_antigo_com_tipo_zero_e_escala_um() {
        let cena = cena_com_tipos();
        let bytes = bytes_v1_manuais(&cena);
        assert_eq!(&bytes[4..8], &1u32.to_le_bytes());
        let lida = Cena::decodificar(&bytes).expect("decodifica v1");
        assert_eq!(lida.materiais.len(), 2);
        for m in &lida.materiais {
            assert_eq!(m.tipo, 0);
            assert_eq!(m.escala, 1.0);
        }
        assert_eq!(lida.indices, cena.indices);
        assert_eq!(lida.lotes, cena.lotes);
        for (a, b) in lida.materiais[1].cor_base.iter().zip(cena.materiais[1].cor_base) {
            assert!((a - b).abs() < 1.0e-6, "cor preservada em f32");
        }
        assert!((lida.materiais[1].rugosidade - cena.materiais[1].rugosidade).abs() < 1.0e-6);
    }

    #[test]
    fn material_com_escala_invalida_e_recusado() {
        for escala in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let mut cena = cena_teste();
            cena.materiais[0].escala = escala;
            assert!(!cena.materiais[0].valido(), "escala {escala} não é válida");
            let bytes = cena.codificar();
            assert_eq!(
                Cena::decodificar(&bytes).err(),
                Some(Erro::CenaInvalida),
                "escala {escala} deve ser recusada na leitura"
            );
        }
    }

    #[test]
    fn tipo_fora_da_faixa_e_recusado() {
        let mut cena = cena_teste();
        cena.materiais[0].tipo = 8;
        assert!(!cena.materiais[0].valido());
        assert_eq!(
            Cena::decodificar(&cena.codificar()).err(),
            Some(Erro::CenaInvalida)
        );
    }

    #[test]
    fn tamanho_do_bloco_de_material_e_documentado() {
        assert_eq!(TAMANHO_MATERIAL_V1, 44);
        assert_eq!(TAMANHO_MATERIAL_V2, 52);
        let cena = cena_com_tipos();
        let bytes = cena.codificar();
        let esperado = 32
            + cena.posicoes.len() * 4
            + cena.indices.len() * 4
            + cena.materiais.len() * TAMANHO_MATERIAL_V2
            + cena.lotes.len() * 12
            + 12
            + 37 * 4;
        assert_eq!(bytes.len(), esperado);
        assert_eq!(Material::padrao().tipo, 0);
        assert_eq!(Material::padrao().escala, 1.0);
    }
}
