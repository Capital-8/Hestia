//! Perfil de qualidade do render por GPU: `leve`, `padrao` e `alta`.
//!
//! Um perfil fixa o que custa GPU ou memória sem mudar a regra da imagem: amostras do MSAA, lado
//! inicial dos tiles, teto do lado das texturas de material e orçamento de memória. O perfil
//! `padrao` reproduz o comportamento anterior (MSAA x4, tile 256, texturas sem teto além do limite
//! da placa).
//!
//! A escolha é automática, pela medida do adaptador (tipo de dispositivo e limites do wgpu), salvo
//! `RENDER_PERFIL=leve|padrao|alta`, que vence sempre. O wgpu não expõe a memória da placa, então
//! hoje ela chega como `None`: GPU dedicada sem memória conhecida cai no `padrao`, o padrão
//! conservador, e o motivo diz isso. Ver `DadosAdaptador::memoria_mib`.
//!
//! Tudo aqui é função pura (testável sem GPU); quem chama fornece os dados do adaptador.

use crate::constantes::{LADO_SOMBRA, MARGEM_AO_PX, MARGEM_DESFOQUE_PX};

/// Variável de ambiente que força um perfil (`leve`, `padrao` ou `alta`).
pub const VARIAVEL_PERFIL: &str = "RENDER_PERFIL";

const MIB: u64 = 1024 * 1024;

/// Teto de textura que não reduz nada: o lado 2D máximo que o formato aceita na prática.
const TETO_TEXTURA_SEM_LIMITE: u32 = 16_384;

/// Limites do wgpu abaixo dos quais a placa é tratada como fraca (perfil leve).
const DIMENSAO_TEXTURA_MINIMA: u32 = 8_192;
const CAMADAS_MINIMAS: u32 = 256;
const BUFFER_MINIMO_MIB: u64 = 1024;

/// Memória dedicada (MiB) que separa os perfis, quando o adaptador a informa.
const MEMORIA_ALTA_MIB: u64 = 6 * 1024;
const MEMORIA_PADRAO_MIB: u64 = 3 * 1024;

/// Parâmetros de um perfil. `padrao` é o comportamento anterior à escolha por perfil.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PerfilQualidade {
    pub nome: &'static str,
    /// Amostras do passe principal: 1 (sem MSAA) ou 4 (MSAA x4 com resolve).
    pub amostras_msaa: u32,
    /// Lado inicial dos tiles. O render por tiles mede um tile de teste e pode trocar esse valor.
    pub lado_tile: u32,
    /// Maior lado de tile que a medição pode pedir.
    pub lado_tile_maximo: u32,
    /// Maior lado do tamanho comum das texturas de material; maiores são reduzidas.
    pub lado_maximo_textura: u32,
    /// Orçamento de memória do render (texturas, malha, sombra e alvos), em MiB. É um teto do
    /// próprio render, não a memória da placa.
    pub orcamento_mib: u64,
}

pub const LEVE: PerfilQualidade = PerfilQualidade {
    nome: "leve",
    amostras_msaa: 1,
    lado_tile: 128,
    lado_tile_maximo: 256,
    lado_maximo_textura: 512,
    orcamento_mib: 1024,
};

pub const PADRAO: PerfilQualidade = PerfilQualidade {
    nome: "padrao",
    amostras_msaa: 4,
    lado_tile: 256,
    lado_tile_maximo: 256,
    lado_maximo_textura: TETO_TEXTURA_SEM_LIMITE,
    orcamento_mib: 2048,
};

pub const ALTA: PerfilQualidade = PerfilQualidade {
    nome: "alta",
    amostras_msaa: 4,
    lado_tile: 256,
    lado_tile_maximo: 512,
    lado_maximo_textura: TETO_TEXTURA_SEM_LIMITE,
    orcamento_mib: 4096,
};

/// Perfil em uso e o motivo da escolha (vai para o log e para `/health`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Escolha {
    pub perfil: PerfilQualidade,
    pub motivo: String,
    /// `true` quando veio de `RENDER_PERFIL` ou foi fixado por chamada explícita (sem medição).
    pub forcado: bool,
}

impl Escolha {
    /// Perfil fixado pela chamada, sem medição (`Motor::nativo_com_amostras`, `com_device`).
    pub fn explicita(amostras_msaa: u32, motivo: &str) -> Escolha {
        Escolha {
            perfil: PerfilQualidade {
                nome: "explicito",
                amostras_msaa,
                ..PADRAO
            },
            motivo: motivo.to_string(),
            forcado: true,
        }
    }
}

/// Dados do adaptador usados pela escolha. `memoria_mib` é `None` quando o caminho nativo não a
/// conhece: o wgpu não expõe a memória da placa. Quando um caminho (ex.: DXGI) a fornecer, ela
/// entra aqui e a classificação por memória passa a valer.
#[derive(Clone, Debug, PartialEq)]
pub struct DadosAdaptador {
    pub tipo: wgpu::DeviceType,
    pub max_dimensao_textura: u32,
    pub max_buffer: u64,
    pub max_camadas: u32,
    pub memoria_mib: Option<u64>,
}

/// Escolhe o perfil. `sobrescrita` é o valor de `RENDER_PERFIL`, se definido: vence sempre, e um
/// valor inválido é erro (nunca ignorado). Sem sobrescrita, classifica o adaptador.
pub fn escolher_perfil(dados: &DadosAdaptador, sobrescrita: Option<&str>) -> Result<Escolha, String> {
    let mut escolha = match sobrescrita {
        Some(texto) => Escolha {
            perfil: perfil_por_nome(texto)?,
            motivo: format!("forçado por {VARIAVEL_PERFIL}={texto}"),
            forcado: true,
        },
        None => classificar(dados),
    };
    limitar_a_placa(&mut escolha, dados);
    Ok(escolha)
}

fn perfil_por_nome(texto: &str) -> Result<PerfilQualidade, String> {
    match texto.trim().to_lowercase().as_str() {
        "leve" => Ok(LEVE),
        "padrao" | "padrão" => Ok(PADRAO),
        "alta" => Ok(ALTA),
        _ => Err(format!(
            "{VARIAVEL_PERFIL}={texto:?} inválido; use leve, padrao ou alta"
        )),
    }
}

/// Escolha automática. O tipo de dispositivo define a faixa; a memória, quando conhecida, separa
/// alta, padrão e leve dentro da faixa de GPU dedicada; limites baixos do wgpu forçam o leve.
fn classificar(dados: &DadosAdaptador) -> Escolha {
    let (perfil, motivo) = match &dados.tipo {
        wgpu::DeviceType::DiscreteGpu => match dados.memoria_mib {
            // Memória desconhecida é incerta: o padrão conservador (sem alta, sem leve por palpite).
            None => (
                PADRAO,
                "GPU dedicada; memória da placa não informada pelo adaptador, padrão conservador"
                    .to_string(),
            ),
            Some(mib) if mib >= MEMORIA_ALTA_MIB => (ALTA, format!("GPU dedicada com {mib} MiB")),
            Some(mib) if mib >= MEMORIA_PADRAO_MIB => {
                (PADRAO, format!("GPU dedicada com {mib} MiB"))
            }
            Some(mib) => (LEVE, format!("GPU dedicada com pouca memória ({mib} MiB)")),
        },
        wgpu::DeviceType::IntegratedGpu => (
            LEVE,
            "GPU integrada: a memória é compartilhada com o sistema".to_string(),
        ),
        wgpu::DeviceType::Cpu => (LEVE, "rasterizador de software".to_string()),
        _ => (
            LEVE,
            "tipo de adaptador desconhecido ou virtual: leve por segurança".to_string(),
        ),
    };
    if let Some(razao) = limites_fracos(dados) {
        return Escolha {
            perfil: LEVE,
            motivo: format!("{motivo}; limites do wgpu baixos ({razao}), leve"),
            forcado: false,
        };
    }
    Escolha {
        perfil,
        motivo,
        forcado: false,
    }
}

/// Primeiro limite do wgpu abaixo do mínimo do perfil `padrao`, descrito; `None` se todos passam.
fn limites_fracos(dados: &DadosAdaptador) -> Option<String> {
    if dados.max_dimensao_textura < DIMENSAO_TEXTURA_MINIMA {
        return Some(format!("textura máxima de {} px", dados.max_dimensao_textura));
    }
    if dados.max_camadas < CAMADAS_MINIMAS {
        return Some(format!("{} camadas por array", dados.max_camadas));
    }
    if dados.max_buffer < BUFFER_MINIMO_MIB * MIB {
        return Some(format!("buffer máximo de {} MiB", dados.max_buffer / MIB));
    }
    None
}

/// O teto de textura do perfil não passa do limite da placa; quando reduz, o motivo diz isso.
fn limitar_a_placa(escolha: &mut Escolha, dados: &DadosAdaptador) {
    if dados.max_dimensao_textura < escolha.perfil.lado_maximo_textura {
        escolha.motivo = format!(
            "{}; teto de textura de {} px pelo limite da placa",
            escolha.motivo, dados.max_dimensao_textura
        );
        escolha.perfil.lado_maximo_textura = dados.max_dimensao_textura;
    }
}

/// Bytes do mapa de sombra (Depth32Float, `LADO_SOMBRA` x `LADO_SOMBRA`).
pub fn bytes_sombra() -> u64 {
    u64::from(LADO_SOMBRA) * u64::from(LADO_SOMBRA) * 4
}

/// Bytes dos alvos de um render de região `largura x altura`, por cima. Cor final e oclusão da
/// região; na janela com as margens do SSAO: normais (8 bytes por pixel), profundidade do pré-passe
/// (4) e oclusão bruta (1); profundidade do passe principal (4 por amostra) e, com MSAA, a cor
/// multiamostra; com vidro, a cor opaca da janela e a cópia de tela.
pub fn bytes_alvos(largura: u32, altura: u32, amostras: u32, vidro: bool) -> u64 {
    let margem = 2 * u64::from(MARGEM_AO_PX + MARGEM_DESFOQUE_PX);
    let regiao = u64::from(largura) * u64::from(altura);
    let janela = (u64::from(largura) + margem) * (u64::from(altura) + margem);
    let amostras = u64::from(amostras.max(1));
    let mut total = regiao * (4 + 1) + janela * (8 + 4 + 1) + janela * 4 * amostras;
    if amostras > 1 {
        total += janela * 4 * amostras;
    }
    if vidro {
        total += janela * 4 * 2;
    }
    total
}

/// Memória estimada de um render, em bytes, por componente.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Estimativa {
    pub texturas: u64,
    pub malha: u64,
    pub sombra: u64,
    pub alvos: u64,
}

impl Estimativa {
    pub fn total(&self) -> u64 {
        self.texturas + self.malha + self.sombra + self.alvos
    }

    /// `Ok` se cabe no orçamento do perfil. Senão, erro com o necessário, o disponível e o que fazer.
    pub fn conferir(&self, perfil: &PerfilQualidade) -> Result<(), String> {
        let orcamento = perfil.orcamento_mib * MIB;
        if self.total() <= orcamento {
            return Ok(());
        }
        let mib = |bytes: u64| bytes as f64 / MIB as f64;
        let sugestao = if perfil.nome == LEVE.nome {
            "reduza a resolução ou a cena".to_string()
        } else {
            format!("use {VARIAVEL_PERFIL}=leve, que reduz texturas e alvos")
        };
        Err(format!(
            "memória estimada de {:.1} MiB para o render (texturas {:.1}, malha {:.1}, sombra {:.1}, \
             alvos {:.1}) excede o orçamento de {} MiB do perfil '{}' (teto do render, não a memória \
             da placa); {sugestao}",
            mib(self.total()),
            mib(self.texturas),
            mib(self.malha),
            mib(self.sombra),
            mib(self.alvos),
            perfil.orcamento_mib,
            perfil.nome,
        ))
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use wgpu::DeviceType;

    const GIB: u64 = 1024 * MIB;

    fn dados(tipo: DeviceType, memoria_mib: Option<u64>) -> DadosAdaptador {
        DadosAdaptador {
            tipo,
            max_dimensao_textura: 16_384,
            max_buffer: 4 * GIB,
            max_camadas: 2048,
            memoria_mib,
        }
    }

    #[test]
    fn integrada_escolhe_leve() {
        let escolha = escolher_perfil(&dados(DeviceType::IntegratedGpu, None), None).unwrap();
        assert_eq!(escolha.perfil, LEVE);
        assert!(escolha.motivo.contains("integrada"), "motivo: {}", escolha.motivo);
        assert!(!escolha.forcado);
    }

    #[test]
    fn dedicada_grande_escolhe_alta() {
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, Some(8192)), None).unwrap();
        assert_eq!(escolha.perfil, ALTA);
    }

    #[test]
    fn dedicada_media_escolhe_padrao() {
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, Some(4096)), None).unwrap();
        assert_eq!(escolha.perfil, PADRAO);
    }

    #[test]
    fn dedicada_pequena_escolhe_leve() {
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, Some(2048)), None).unwrap();
        assert_eq!(escolha.perfil, LEVE);
        assert!(escolha.motivo.contains("pouca memória"), "motivo: {}", escolha.motivo);
    }

    #[test]
    fn memoria_desconhecida_e_padrao_conservador_declarado() {
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, None), None).unwrap();
        assert_eq!(escolha.perfil, PADRAO);
        assert!(escolha.motivo.contains("não informada"), "motivo: {}", escolha.motivo);
    }

    #[test]
    fn limites_baixos_do_wgpu_forcam_leve() {
        let mut d = dados(DeviceType::DiscreteGpu, None);
        d.max_dimensao_textura = 4096;
        let escolha = escolher_perfil(&d, None).unwrap();
        assert_eq!(escolha.perfil.nome, "leve");
        assert!(escolha.motivo.contains("textura máxima"), "motivo: {}", escolha.motivo);
    }

    #[test]
    fn tipo_desconhecido_ou_virtual_e_leve() {
        let escolha = escolher_perfil(&dados(DeviceType::Other, None), None).unwrap();
        assert_eq!(escolha.perfil, LEVE);
        let escolha = escolher_perfil(&dados(DeviceType::VirtualGpu, None), None).unwrap();
        assert_eq!(escolha.perfil, LEVE);
    }

    #[test]
    fn sobrescrita_vence_a_medicao() {
        let escolha =
            escolher_perfil(&dados(DeviceType::IntegratedGpu, None), Some("alta")).unwrap();
        assert_eq!(escolha.perfil, ALTA);
        assert!(escolha.forcado);
        assert!(escolha.motivo.contains("RENDER_PERFIL=alta"), "motivo: {}", escolha.motivo);
    }

    #[test]
    fn sobrescrita_aceita_maiusculas_e_espacos() {
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, None), Some(" LEVE ")).unwrap();
        assert_eq!(escolha.perfil, LEVE);
        let escolha = escolher_perfil(&dados(DeviceType::DiscreteGpu, None), Some("padrão")).unwrap();
        assert_eq!(escolha.perfil, PADRAO);
    }

    #[test]
    fn sobrescrita_invalida_e_erro_explicito() {
        let erro = escolher_perfil(&dados(DeviceType::DiscreteGpu, None), Some("ultra")).unwrap_err();
        assert!(erro.contains("RENDER_PERFIL") && erro.contains("ultra"), "erro: {erro}");
        assert!(escolher_perfil(&dados(DeviceType::DiscreteGpu, None), Some("")).is_err());
    }

    #[test]
    fn teto_da_placa_reduz_o_teto_do_perfil_e_declara() {
        let mut d = dados(DeviceType::DiscreteGpu, None);
        d.max_dimensao_textura = 8192;
        let escolha = escolher_perfil(&d, None).unwrap();
        assert_eq!(escolha.perfil.lado_maximo_textura, 8192);
        assert!(escolha.motivo.contains("limite da placa"), "motivo: {}", escolha.motivo);
        // Perfil leve já tem teto menor que o da placa: não muda.
        let leve = escolher_perfil(&d, Some("leve")).unwrap();
        assert_eq!(leve.perfil.lado_maximo_textura, 512);
    }

    /// Os valores dos perfis são constantes: a ordem de custo é conferida em tempo de compilação.
    const _: () = {
        assert!(LEVE.orcamento_mib < PADRAO.orcamento_mib);
        assert!(PADRAO.orcamento_mib < ALTA.orcamento_mib);
        assert!(LEVE.lado_tile < PADRAO.lado_tile);
        assert!(LEVE.lado_maximo_textura < PADRAO.lado_maximo_textura);
        assert!(LEVE.amostras_msaa == 1 && PADRAO.amostras_msaa == 4);
    };

    #[test]
    fn padrao_nao_muda_o_tile_nem_limita_a_textura() {
        assert_eq!(PADRAO.lado_tile, PADRAO.lado_tile_maximo, "padrão não muda o tile");
        assert_eq!(PADRAO.lado_maximo_textura, TETO_TEXTURA_SEM_LIMITE);
    }

    #[test]
    fn explicita_mantem_o_padrao_e_so_troca_amostras() {
        let um = Escolha::explicita(1, "teste");
        assert_eq!(um.perfil.amostras_msaa, 1);
        assert_eq!(um.perfil.lado_tile, PADRAO.lado_tile);
        assert_eq!(um.perfil.lado_maximo_textura, PADRAO.lado_maximo_textura);
        assert!(um.forcado);
    }

    #[test]
    fn estimativa_dentro_do_orcamento_passa() {
        // Casa de referência: ~117 MiB de textura, malha pequena, sombra e um tile.
        let estimativa = Estimativa {
            texturas: 117 * MIB,
            malha: 20 * MIB,
            sombra: bytes_sombra(),
            alvos: bytes_alvos(256, 256, 4, true),
        };
        assert!(estimativa.conferir(&PADRAO).is_ok());
    }

    #[test]
    fn estimativa_acima_do_orcamento_mostra_os_numeros() {
        let estimativa = Estimativa {
            texturas: 3 * GIB,
            malha: 0,
            sombra: bytes_sombra(),
            alvos: 0,
        };
        let erro = estimativa.conferir(&PADRAO).unwrap_err();
        assert!(erro.contains("texturas 3072.0"), "erro: {erro}");
        assert!(erro.contains("2048 MiB"), "erro: {erro}");
        assert!(erro.contains("padrao"), "erro: {erro}");
        assert!(erro.contains("RENDER_PERFIL=leve"), "erro: {erro}");
    }

    #[test]
    fn estouro_no_leve_nao_sugere_o_leve() {
        let estimativa = Estimativa {
            texturas: 2 * GIB,
            malha: 0,
            sombra: 0,
            alvos: 0,
        };
        let erro = estimativa.conferir(&LEVE).unwrap_err();
        assert!(erro.contains("reduza"), "erro: {erro}");
        assert!(!erro.contains("RENDER_PERFIL=leve"), "erro: {erro}");
    }

    #[test]
    fn sombra_tem_16_mib() {
        assert_eq!(bytes_sombra(), 16 * MIB);
    }

    #[test]
    fn alvos_crescem_com_msaa_e_vidro_e_cabem_no_tile() {
        let base = bytes_alvos(256, 256, 1, false);
        assert!(bytes_alvos(256, 256, 4, false) > base);
        assert!(bytes_alvos(256, 256, 1, true) > base);
        // Um tile de 256 com MSAA x4 e vidro fica bem abaixo de 64 MiB.
        assert!(bytes_alvos(256, 256, 4, true) < 64 * MIB);
    }
}
