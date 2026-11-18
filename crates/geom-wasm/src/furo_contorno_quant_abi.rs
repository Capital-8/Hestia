//! ABI do quantitativo e do retorno do vão por contorno (docs/estudo-esquadrias/27-ligacao-real.md).
//!
//! Expõe, sobre `furo_contorno_quant`, três exportações com o mesmo modelo de memória de `furo_contorno_abi`
//! (entrada alocada pelo JS com `abi2_alocar`, saídas do wasm lidas com `furo_saida_*`, erros em `furo_erro_*`;
//! o estado de saída é o MESMO de `furo_contorno_furar` e `furo_prisma_furar`: uma chamada apaga as saídas da outra):
//!
//! - `furo_quant_vao(n_pontos, ptr_pontos)`: área e perímetro do contorno REAL.
//!   Saída 0, F64 `[largura, altura, area, perimetro, area_envelope]`.
//! - `furo_retorno_vao(n_pontos, ptr_pontos, x, soleira, espessura, espessura_acabamento, recuo, y0, y1, modo)`:
//!   retorno do acabamento que segue o contorno. `recuo` (m, >= 0) desloca o contorno para dentro antes de gerar
//!   o anel (soma das camadas envolventes entre esta e o núcleo). `modo`: 0 contorno inteiro, 1 só ombreiras.
//!   Saídas: 0 F64 `[espessura, limitada(0|1), y0, y1, area_anel, area_livre, volume, area_exposta]`;
//!   1 F64 vértices (x, y, z intercalados, já com `x` e `soleira`); 2 U32 índices.
//! - `furo_quant_parede(...)`: mesmos argumentos de `furo_contorno_furar`; fura e mede sobre a malha.
//!   Saídas: 0 F64 por camada `[y0, y1, espessura, volume_liquido, volume_bruto, volume_removido, area_face_bruta,
//!   area_face_liquida, area_face_oposta, area_furo_na_face]` (len `10 C`); 1 F64 `[volume_liquido, volume_removido]`.
//!
//! Retorno de cada chamada: 0 OK, 3 ENTRADA, 5 LIMITE, 6 INTERNO. Nenhuma entrada do JS provoca panic: limites e
//! finitude antes de ler ponteiros, contornos validados (simples, sem ponto repetido) antes de qualquer booleana
//! ou offset. Toda a lógica fica em funções `*_planos` que só recebem slices (testáveis nativamente).

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, INTERNO, LIMITE};
use crate::furo_contorno::{area_com_sinal, furar_parede, validar_anel, Vao};
use crate::furo_contorno_abi::{erro_do_furo, estado, fatia, Entradas, LIMITE_CAMADAS, LIMITE_PONTOS, LIMITE_PONTOS_POR_VAO, LIMITE_VAOS};
use crate::furo_contorno_quant::{quant_vao, quantificar_parede, retorno_do_vao, EntradaRetorno, ErroQuant, ModoRetorno};
use crate::ops::offset;
use crate::ERRO_ENTRADA;

/// Versão desta ABI (layout dos buffers e das saídas).
pub const VERSAO_ABI_QUANT: u32 = 1;
/// Módulo máximo aceito para um escalar em metros (recusa valores absurdos antes de qualquer geometria).
const LIMITE_ESCALAR: f64 = 1.0e6;

/// Entradas do retorno, já decodificadas.
pub struct EntradaRetornoAbi<'a> {
    /// x, z intercalados do contorno (2 * n f64), anti-horário, aberto, relativo à origem do vão.
    pub pontos: &'a [f64],
    pub x: f64,
    pub soleira: f64,
    pub espessura: f64,
    pub espessura_acabamento: f64,
    pub recuo: f64,
    pub y0: f64,
    pub y1: f64,
    /// 0 = contorno inteiro, 1 = ombreiras.
    pub modo: u32,
}

fn escalar_ok(v: f64) -> bool {
    v.is_finite() && v.abs() <= LIMITE_ESCALAR
}

fn contorno_de(pontos: &[f64]) -> Result<Vec<[f64; 2]>, (u32, String)> {
    if pontos.len() % 2 != 0 {
        return Err((ENTRADA, "tamanho do contorno incoerente".into()));
    }
    let n = pontos.len() / 2;
    if n > LIMITE_PONTOS_POR_VAO as usize {
        return Err((LIMITE, format!("pontos por vao demais ({n} > {LIMITE_PONTOS_POR_VAO})")));
    }
    let c: Vec<[f64; 2]> = pontos.chunks_exact(2).map(|p| [p[0], p[1]]).collect();
    // Coordenadas absurdas ficam fora antes de qualquer conta (validar_anel só exige finitude).
    if c.iter().any(|p| !escalar_ok(p[0]) || !escalar_ok(p[1])) {
        return Err((ENTRADA, "contorno com coordenada nao finita ou fora de +-1e6 m".into()));
    }
    validar_anel(0, &c).map_err(erro_do_furo)?;
    Ok(c)
}

fn erro_da_quant(e: ErroQuant) -> (u32, String) {
    match e {
        ErroQuant::Furo(f) => erro_do_furo(f),
        ErroQuant::ContornoInvalido => (ENTRADA, "contorno invalido".into()),
        ErroQuant::EspessuraInvalida => (ENTRADA, "espessura invalida (positiva e finita)".into()),
        ErroQuant::ProfundidadeInvalida => (ENTRADA, "profundidade do retorno invalida (y1 > y0)".into()),
        ErroQuant::RetornoNaoCabe => (ENTRADA, "o retorno nao cabe no contorno".into()),
        ErroQuant::Geometria(c) if c == ERRO_ENTRADA => (ENTRADA, "geometria do retorno fora do dominio".into()),
        ErroQuant::Geometria(c) => (INTERNO, format!("geometria 2D falhou (codigo {c})")),
        ErroQuant::Manifold(s) => (INTERNO, format!("kernel: {s}")),
        ErroQuant::Inconsistente(s) => (INTERNO, format!("inconsistente: {s}")),
    }
}

/// Área e perímetro do contorno real. Saída: um array F64 `[largura, altura, area, perimetro, area_envelope]`.
pub fn quant_vao_planos(pontos: &[f64]) -> Result<Vec<Saida>, (u32, String)> {
    let c = contorno_de(pontos)?;
    let q = quant_vao(&c).map_err(erro_da_quant)?;
    Ok(vec![Saida::F64(vec![q.largura, q.altura, q.area, q.perimetro, q.area_envelope])])
}

/// Contorno deslocado para dentro por `recuo` (offset), exigindo um único polígono sem furos; `None` = não cabe.
fn recuar(c: Vec<[f64; 2]>, recuo: f64) -> Result<Vec<[f64; 2]>, (u32, String)> {
    if recuo == 0.0 {
        return Ok(c);
    }
    let r = offset(&vec![vec![c]], -recuo).map_err(|e| if e == ERRO_ENTRADA { (ENTRADA, "recuo fora do dominio".into()) } else { (INTERNO, format!("offset do recuo falhou (codigo {e})")) })?;
    let nao_cabe = || (ENTRADA, "o recuo consome o contorno".to_string());
    let mut it = r.into_iter();
    let (Some(poligono), None) = (it.next(), it.next()) else {
        return Err(nao_cabe());
    };
    let mut aneis = poligono.into_iter();
    let (Some(mut anel), None) = (aneis.next(), aneis.next()) else {
        return Err(nao_cabe());
    };
    if area_com_sinal(&anel) < 0.0 {
        anel.reverse();
    }
    validar_anel(0, &anel).map_err(|_| nao_cabe())?;
    Ok(anel)
}

/// Retorno do acabamento que segue o contorno. Saídas: meta F64 (8), vértices F64, índices U32.
pub fn retorno_planos(e: &EntradaRetornoAbi) -> Result<Vec<Saida>, (u32, String)> {
    let modo = match e.modo {
        0 => ModoRetorno::Contorno,
        1 => ModoRetorno::Ombreiras,
        m => return Err((ENTRADA, format!("modo do retorno invalido ({m})"))),
    };
    if ![e.x, e.soleira, e.espessura, e.espessura_acabamento, e.recuo, e.y0, e.y1].iter().all(|v| escalar_ok(*v)) {
        return Err((ENTRADA, "escalar nao finito ou fora de +-1e6 m".into()));
    }
    if e.recuo < 0.0 {
        return Err((ENTRADA, "recuo negativo".into()));
    }
    let c = recuar(contorno_de(e.pontos)?, e.recuo)?;
    let vao = Vao { contorno: c, x: e.x, soleira: e.soleira };
    let r = retorno_do_vao(&vao, &EntradaRetorno { espessura_pedida: e.espessura, espessura_acabamento: e.espessura_acabamento, y0: e.y0, y1: e.y1, modo }).map_err(erro_da_quant)?;
    Ok(vec![
        Saida::F64(vec![r.espessura, if r.limitada { 1.0 } else { 0.0 }, r.y0, r.y1, r.area_anel, r.area_livre, r.volume, r.area_exposta]),
        Saida::F64(r.vertices),
        Saida::U32(r.indices),
    ])
}

/// Fura a parede (como `furar_planos`) e mede a malha. Saídas: por camada 10 F64; totais `[volume_liquido, volume_removido]`.
pub fn quant_parede_planos(e: &Entradas) -> Result<Vec<Saida>, (u32, String)> {
    let n_vaos = e.x.len();
    if e.soleira.len() != n_vaos || e.vaos.len() != n_vaos + 1 || e.pontos.len() % 2 != 0 {
        return Err((ENTRADA, "tamanhos dos buffers incoerentes".into()));
    }
    let n_pontos = e.pontos.len() / 2;
    if n_vaos > LIMITE_VAOS as usize || n_pontos > LIMITE_PONTOS as usize || e.espessuras.len() > LIMITE_CAMADAS as usize {
        return Err((LIMITE, "limite de vaos, pontos ou camadas excedido".into()));
    }
    if e.espessuras.is_empty() {
        return Err((ENTRADA, "a parede precisa de pelo menos uma camada".into()));
    }
    if e.vaos[0] != 0 || e.vaos[n_vaos] as usize != n_pontos || e.vaos.windows(2).any(|w| w[1] < w[0]) {
        return Err((ENTRADA, "offsets de contorno invalidos".into()));
    }
    if e.vaos.windows(2).any(|w| w[1] - w[0] > LIMITE_PONTOS_POR_VAO) {
        return Err((LIMITE, format!("pontos por vao demais (> {LIMITE_PONTOS_POR_VAO})")));
    }
    if !escalar_ok(e.comprimento) || !escalar_ok(e.altura) {
        return Err((ENTRADA, "parede invalida (comprimento e altura positivos e finitos)".into()));
    }
    let vaos: Vec<Vao> = (0..n_vaos)
        .map(|i| {
            let (de, ate) = (e.vaos[i] as usize, e.vaos[i + 1] as usize);
            Vao { contorno: e.pontos[2 * de..2 * ate].chunks_exact(2).map(|p| [p[0], p[1]]).collect(), x: e.x[i], soleira: e.soleira[i] }
        })
        .collect();
    let res = furar_parede(&vaos, e.espessuras, e.comprimento, e.altura).map_err(erro_do_furo)?;
    let q = quantificar_parede(&res, e.comprimento, e.altura).map_err(erro_da_quant)?;
    let mut meta = Vec::with_capacity(10 * q.camadas.len());
    for c in &q.camadas {
        meta.extend_from_slice(&[c.y0, c.y1, c.espessura, c.volume_liquido, c.volume_bruto, c.volume_removido, c.area_face_bruta, c.area_face_liquida, c.area_face_oposta, c.area_furo_na_face]);
    }
    Ok(vec![Saida::F64(meta), Saida::F64(vec![q.volume_liquido, q.volume_removido])])
}

// ---------------------------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn furo_quant_abi_versao() -> u32 {
    VERSAO_ABI_QUANT
}

/// Área e perímetro do contorno real do vão. 0 OK, 3 ENTRADA, 5 LIMITE, 6 INTERNO.
#[no_mangle]
pub extern "C" fn furo_quant_vao(n_pontos: u32, ptr_pontos: u32) -> u32 {
    let st = estado();
    st.saida_liberar();
    if n_pontos > LIMITE_PONTOS_POR_VAO {
        return st.falha(LIMITE, &format!("pontos por vao demais ({n_pontos} > {LIMITE_PONTOS_POR_VAO})"));
    }
    let Some(pontos) = fatia::<f64>(ptr_pontos, 2 * n_pontos as usize) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    st.guardar(quant_vao_planos(pontos))
}

/// Retorno do acabamento que segue o contorno. 0 OK, 3 ENTRADA, 5 LIMITE, 6 INTERNO.
#[no_mangle]
pub extern "C" fn furo_retorno_vao(n_pontos: u32, ptr_pontos: u32, x: f64, soleira: f64, espessura: f64, espessura_acabamento: f64, recuo: f64, y0: f64, y1: f64, modo: u32) -> u32 {
    let st = estado();
    st.saida_liberar();
    if n_pontos > LIMITE_PONTOS_POR_VAO {
        return st.falha(LIMITE, &format!("pontos por vao demais ({n_pontos} > {LIMITE_PONTOS_POR_VAO})"));
    }
    let Some(pontos) = fatia::<f64>(ptr_pontos, 2 * n_pontos as usize) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    st.guardar(retorno_planos(&EntradaRetornoAbi { pontos, x, soleira, espessura, espessura_acabamento, recuo, y0, y1, modo }))
}

/// Fura a parede e mede a malha (volume líquido, área de face). Mesmos argumentos de `furo_contorno_furar`.
#[no_mangle]
pub extern "C" fn furo_quant_parede(n_vaos: u32, n_pontos: u32, ptr_pontos: u32, ptr_vaos: u32, ptr_x: u32, ptr_soleira: u32, n_camadas: u32, ptr_espessuras: u32, comprimento: f64, altura: f64) -> u32 {
    let st = estado();
    st.saida_liberar();
    if n_vaos > LIMITE_VAOS || n_pontos > LIMITE_PONTOS || n_camadas > LIMITE_CAMADAS {
        return st.falha(LIMITE, "limite de vaos, pontos ou camadas excedido");
    }
    let nv = n_vaos as usize;
    let (Some(pontos), Some(vaos), Some(x), Some(soleira), Some(espessuras)) = (
        fatia::<f64>(ptr_pontos, 2 * n_pontos as usize),
        fatia::<u32>(ptr_vaos, nv + 1),
        fatia::<f64>(ptr_x, nv),
        fatia::<f64>(ptr_soleira, nv),
        fatia::<f64>(ptr_espessuras, n_camadas as usize),
    ) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    st.guardar(quant_parede_planos(&Entradas { pontos, vaos, x, soleira, espessuras, comprimento, altura }))
}
