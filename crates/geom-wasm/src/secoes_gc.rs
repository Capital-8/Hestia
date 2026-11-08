//! Seções do guarda-corpo (decisão 0055, Fase 2; esquema v13): hospedeiros (60 a 67), guarda-corpos, tipos e normas (70 a 81).
//!
//! Mesmo molde de `secoes_b`: `BTreeMap` por chave (ordem canônica = id crescente) e decodificação que valida antes de tocar a cena (atômica): tamanho,
//! chave ausente ou duplicada, valores não finitos e enums fora do domínio (`ENTRADA`). As referências ENTRE seções (tipo inexistente, perfil inexistente,
//! índice de trilho fora da lista) não são checadas aqui, porque as seções chegam em qualquer ordem: `validar_referencias` as confere e é chamada pelas
//! consultas (fases 3 e 4), que devolvem `ENTRADA` (referência quebrada) ou `LIMITE` (mais que o permitido).

use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{
    self, Secao, Tipo, ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_CORRIMAOS_GUARDA, SECAO_ESCADAS_GC, SECAO_ESCADA_COMPONENTES_GC, SECAO_ESCADA_CURVAS_GC,
    SECAO_ESCADA_ESPELHOS_GC, SECAO_ESCADA_PATAMARES_GC, SECAO_GUARDAS_CORPO, SECAO_GUARDA_CAMINHOS_MANUAIS, SECAO_NORMAS_GUARDA, SECAO_PADROES_GUARDA, SECAO_PADRAO_ELEMENTOS_GUARDA,
    SECAO_PAINEIS_GUARDA, SECAO_PERFIS_GUARDA, SECAO_PERFIS_GUARDA_PONTOS, SECAO_POSTES_GUARDA, SECAO_RAMPAS_GC, SECAO_RAMPA_LANCES_GC, SECAO_RAMPA_PATAMARES_GC, SECAO_TIPOS_GUARDA,
    SECAO_TRILHOS_GUARDA,
};
use crate::gc_tipos::*;

/// Nomes das colunas de limite de `normas_guarda`, na ordem do bit de `n_flags` (bit `k` = `NORMA_COLUNAS[k]`).
pub const NORMA_COLUNAS: [&str; NORMA_N_LIMITES as usize] = [
    "desnivel_exige_guarda",
    "altura_minima",
    "altura_minima_escada_interna",
    "altura_alta_acima",
    "altura_alta_altura",
    "esfera_maxima",
    "esfera_maxima_triangulo",
    "folga_inferior_maxima",
    "carga_linear_horizontal",
    "carga_area_horizontal",
    "carga_pontual_guarda",
    "corrimao_altura_min",
    "corrimao_altura_max",
    "corrimao_altura_adicional_1",
    "corrimao_altura_adicional_2",
    "corrimao_altura_adicional_3",
    "corrimao_altura_adicional_4",
    "corrimao_diametro_min",
    "corrimao_diametro_max",
    "corrimao_afastamento_min",
    "corrimao_extensao_min",
    "corrimao_dois_lados",
    "corrimao_continuo",
    "corrimao_intermediario_largura",
    "corrimao_intermediario_espacamento",
    "carga_corrimao",
];

/// Índices em `NormaLinha::limite` dos limites que o motor usa.
pub mod limite {
    pub const DESNIVEL_EXIGE_GUARDA: usize = 0;
    pub const ALTURA_MINIMA: usize = 1;
    pub const ALTURA_MINIMA_ESCADA_INTERNA: usize = 2;
    pub const ALTURA_ALTA_ACIMA: usize = 3;
    pub const ALTURA_ALTA_ALTURA: usize = 4;
    pub const ESFERA_MAXIMA: usize = 5;
    pub const ESFERA_MAXIMA_TRIANGULO: usize = 6;
    pub const FOLGA_INFERIOR_MAXIMA: usize = 7;
    pub const CORRIMAO_ALTURA_MIN: usize = 11;
    pub const CORRIMAO_ALTURA_MAX: usize = 12;
    pub const CORRIMAO_EXTENSAO_MIN: usize = 20;
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EscadaGC {
    pub nivel: u32,
    pub z_base: f64,
    pub z_topo: f64,
    pub altura_espelho: f64,
    pub profundidade_piso: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ComponenteGC {
    pub escada: u32,
    pub indice: u32,
    pub tipo: u8,
    pub caracol: bool,
    pub centro: [f64; 2],
    pub r_int: f64,
    pub r_ext: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CurvaGC {
    pub componente: u32,
    pub lado: u8,
    pub ordem: u32,
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub sag: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EspelhoGC {
    pub componente: u32,
    pub indice: u32,
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub z0: f64,
    pub z1: f64,
}

/// Vértice de um anel de patamar. `dono`: o `componente_num` (escada) ou o `rampa_num` (rampa); `componente`: o índice do patamar na rampa (0 na escada).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PontoAnelGC {
    pub dono: u32,
    pub componente: u32,
    pub indice: u32,
    pub p: [f64; 2],
    pub z: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RampaGC {
    pub nivel: u32,
    pub z_base: f64,
    pub z_topo: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LanceRampaGC {
    pub rampa: u32,
    pub indice: u32,
    pub inicio: [f64; 2],
    pub fim: [f64; 2],
    /// Borda de início (a, b) e de fim (c, d).
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub c: [f64; 2],
    pub d: [f64; 2],
    pub z0: f64,
    pub z1: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GuardaCorpoLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub hosp: u8,
    pub hosp_num: u32,
    pub lados: u8,
    pub pos_base: u8,
    pub desloc: f64,
    /// `NaN` = a altura do tipo.
    pub altura: f64,
    pub inverter: bool,
    pub fechado: bool,
    pub lado_desloc: u8,
    pub cota_base: f64,
    pub flags: u8,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CaminhoLinha {
    pub guarda: u32,
    pub indice: u32,
    pub x: f64,
    pub y: f64,
    pub dz: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoGuardaLinha {
    pub altura: f64,
    pub desloc: f64,
    pub ajuste_patamar: f64,
    pub folga_inferior: f64,
    pub junc_angular: u8,
    pub junc_tangente: u8,
    pub conexao: u8,
    pub tol_corda: f64,
    /// `ID_AUSENTE` = a norma do argumento da consulta.
    pub norma: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerfilGuardaLinha {
    pub forma: u8,
    pub largura: f64,
    pub altura: f64,
    pub n_pontos: u32,
    pub lados: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerfilPontoLinha {
    pub perfil: u32,
    pub indice: u32,
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TrilhoLinha {
    pub tipo: u32,
    pub indice: u32,
    pub altura: f64,
    pub desloc: f64,
    pub perfil: u32,
    pub material: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ExtensaoLinha {
    pub estilo: u8,
    pub comprimento: f64,
    pub mais_piso: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CorrimaoLinha {
    pub tipo: u32,
    pub indice: u32,
    pub funcao: u8,
    pub posicao: u8,
    pub altura: f64,
    pub afastamento: f64,
    pub perfil: u32,
    pub material: u32,
    pub ext_inicio: ExtensaoLinha,
    pub ext_fim: ExtensaoLinha,
    pub sup_layout: u8,
    pub sup_espac: f64,
    pub sup_numero: u32,
    pub sup_justif: u8,
    pub sup_perfil: u32,
    pub sup_comp: f64,
    pub transicao: u8,
    pub juncao: u8,
    pub raio_filete: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PosteLinha {
    pub tipo: u32,
    pub papel: u8,
    pub ativo: bool,
    pub perfil: u32,
    pub material: u32,
    pub acima: f64,
    pub abaixo: f64,
    pub ang_canto: f64,
    pub modo: u8,
    pub espacamento: f64,
    pub numero: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PadraoLinha {
    pub tipo: u32,
    pub indice: u32,
    pub base_tipo: u8,
    pub base_idx: u32,
    pub topo_tipo: u8,
    pub topo_idx: u32,
    pub periodo: f64,
    pub justif: u8,
    pub sobra: u8,
    pub quebra: u8,
    pub ang_quebra: f64,
    pub escopo: u8,
    pub pd_ativo: bool,
    pub pd_qtd: u32,
    pub pd_dist: f64,
    pub pd_perfil: u32,
    pub pd_material: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ElementoPadraoLinha {
    pub padrao: u32,
    pub indice: u32,
    /// `ID_AUSENTE` = elemento vazio.
    pub perfil: u32,
    pub material: u32,
    pub dist_anterior: f64,
    pub desloc_lateral: f64,
    pub desloc_base: f64,
    pub desloc_topo: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PainelLinha {
    pub tipo: u32,
    pub indice: u32,
    pub familia: u8,
    pub base_tipo: u8,
    pub base_idx: u32,
    pub topo_tipo: u8,
    pub topo_idx: u32,
    pub desl_base: f64,
    pub desl_topo: f64,
    pub espessura: f64,
    pub folga_lateral: f64,
    pub largura_max: f64,
    pub material: u32,
    pub perf_diam: f64,
    pub perf_passo_x: f64,
    pub perf_passo_y: f64,
    pub perf_alternado: bool,
    pub tela_larg: f64,
    pub tela_alt: f64,
    pub tela_fio: f64,
    pub cabo_diam: f64,
    pub cabo_espac: f64,
    pub cabo_orient: u8,
}

/// Perfil de norma: `limite[k]` é `Some` quando o bit `k` de `n_flags` está ligado (ver `NORMA_COLUNAS` e o módulo `limite`). Os dois booleanos
/// (`corrimao_dois_lados`, `corrimao_continuo`) viram 0,0 ou 1,0.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NormaLinha {
    pub limite: [Option<f64>; NORMA_N_LIMITES as usize],
}

macro_rules! tabelas {
    ($($campo:ident: $ty:ty = $id:ident,)*) => {
        /// Linhas das seções do guarda-corpo.
        #[derive(Default)]
        pub struct SecoesGC {
            $(pub $campo: BTreeMap<u32, $ty>,)*
        }

        #[allow(non_camel_case_types)]
        enum Lote {
            $($campo(Vec<(u32, $ty)>),)*
        }

        impl Lote {
            fn chaves(&self) -> Vec<u32> {
                match self {
                    $(Lote::$campo(v) => v.iter().map(|x| x.0).collect(),)*
                }
            }
        }

        impl SecoesGC {
            /// `true` se a seção é uma das daqui.
            pub fn e_minha(secao: u32) -> bool {
                matches!(secao, $($id)|*)
            }

            fn tamanho(&self, secao: u32) -> usize {
                match secao {
                    $($id => self.$campo.len(),)*
                    _ => 0,
                }
            }

            fn contem(&self, secao: u32, k: u32) -> bool {
                match secao {
                    $($id => self.$campo.contains_key(&k),)*
                    _ => false,
                }
            }

            fn limpar(&mut self, secao: u32) {
                match secao {
                    $($id => self.$campo.clear(),)*
                    _ => {}
                }
            }

            fn aplicar(&mut self, lote: Lote) {
                match lote {
                    $(Lote::$campo(v) => self.$campo.extend(v),)*
                }
            }

            /// Remove pelas chaves (ausentes são ignoradas).
            pub fn remover(&mut self, secao: u32, ids: &[u32]) {
                for k in ids {
                    match secao {
                        $($id => { self.$campo.remove(k); })*
                        _ => {}
                    }
                }
            }

            /// Total de linhas em todas as seções daqui.
            pub fn total_linhas(&self) -> usize {
                0 $(+ self.$campo.len())*
            }
        }
    };
}

tabelas! {
    escadas: EscadaGC = SECAO_ESCADAS_GC,
    componentes: ComponenteGC = SECAO_ESCADA_COMPONENTES_GC,
    curvas: CurvaGC = SECAO_ESCADA_CURVAS_GC,
    espelhos: EspelhoGC = SECAO_ESCADA_ESPELHOS_GC,
    patamares_escada: PontoAnelGC = SECAO_ESCADA_PATAMARES_GC,
    rampas: RampaGC = SECAO_RAMPAS_GC,
    lances_rampa: LanceRampaGC = SECAO_RAMPA_LANCES_GC,
    patamares_rampa: PontoAnelGC = SECAO_RAMPA_PATAMARES_GC,
    guardas: GuardaCorpoLinha = SECAO_GUARDAS_CORPO,
    caminhos: CaminhoLinha = SECAO_GUARDA_CAMINHOS_MANUAIS,
    tipos: TipoGuardaLinha = SECAO_TIPOS_GUARDA,
    perfis: PerfilGuardaLinha = SECAO_PERFIS_GUARDA,
    perfis_pontos: PerfilPontoLinha = SECAO_PERFIS_GUARDA_PONTOS,
    trilhos: TrilhoLinha = SECAO_TRILHOS_GUARDA,
    corrimaos: CorrimaoLinha = SECAO_CORRIMAOS_GUARDA,
    postes: PosteLinha = SECAO_POSTES_GUARDA,
    padroes: PadraoLinha = SECAO_PADROES_GUARDA,
    padrao_elementos: ElementoPadraoLinha = SECAO_PADRAO_ELEMENTOS_GUARDA,
    paineis: PainelLinha = SECAO_PAINEIS_GUARDA,
    normas: NormaLinha = SECAO_NORMAS_GUARDA,
}

/// As colunas decodificadas de uma seção, lidas por nome.
struct Tab {
    s: &'static Secao,
    c: Vec<Coluna>,
    n: usize,
}

impl Tab {
    fn nova(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Tab, u32> {
        let c = decodificar_colunas(secao, n_linhas, bytes)?;
        let s = esquema::secao(secao).ok_or(ENTRADA)?;
        Ok(Tab { s, c, n: n_linhas as usize })
    }

    fn coluna(&self, nome: &str) -> Result<&Coluna, u32> {
        let k = self.s.colunas.iter().position(|c| c.nome == nome).ok_or(INTERNO)?;
        self.c.get(k).ok_or(INTERNO)
    }

    fn u(&self, nome: &str, i: usize) -> Result<u32, u32> {
        match self.coluna(nome)? {
            Coluna::U32(v) => v.get(i).copied().ok_or(INTERNO),
            _ => Err(INTERNO),
        }
    }

    /// Chave estrangeira: aceita qualquer valor (inclusive `ID_AUSENTE`, que quer dizer "nenhum" onde o contrato permite).
    fn id(&self, nome: &str, i: usize) -> Result<u32, u32> {
        self.u(nome, i)
    }

    /// `f64` finito e dentro de `COORD_MAX`.
    fn d(&self, nome: &str, i: usize) -> Result<f64, u32> {
        match self.coluna(nome)? {
            Coluna::F64(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x.is_finite() && x.abs() <= COORD_MAX {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    /// `f64` finito e não negativo.
    fn dp(&self, nome: &str, i: usize) -> Result<f64, u32> {
        let x = self.d(nome, i)?;
        if x >= 0.0 {
            Ok(x)
        } else {
            Err(ENTRADA)
        }
    }

    /// `f64` que também pode ser `NaN` (= ausente), mas nunca infinito.
    fn dn(&self, nome: &str, i: usize) -> Result<f64, u32> {
        match self.coluna(nome)? {
            Coluna::F64(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x.is_nan() || (x.is_finite() && x.abs() <= COORD_MAX) {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    /// `u8` de enum, de 0 a `max`.
    fn e(&self, nome: &str, i: usize, max: u8) -> Result<u8, u32> {
        match self.coluna(nome)? {
            Coluna::U8(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x <= max {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    fn b(&self, nome: &str, i: usize) -> Result<bool, u32> {
        Ok(self.e(nome, i, 1)? == 1)
    }

    /// Ponto `[x, y]` de duas colunas.
    fn p(&self, nx: &str, ny: &str, i: usize) -> Result<[f64; 2], u32> {
        Ok([self.d(nx, i)?, self.d(ny, i)?])
    }

    /// Valor numérico de uma coluna `f64` ou `u8` (os booleanos de `normas_guarda`), sem checar o domínio de `u8` além de 0 e 1.
    fn numero(&self, nome: &str, i: usize) -> Result<f64, u32> {
        match self.coluna(nome)? {
            Coluna::U8(_) => Ok(if self.b(nome, i)? { 1.0 } else { 0.0 }),
            _ => self.d(nome, i),
        }
    }

    fn chaves(&self) -> Result<Vec<u32>, u32> {
        let ids = match self.c.first() {
            Some(Coluna::U32(v)) => v.clone(),
            _ => return Err(INTERNO),
        };
        if ids.contains(&ID_AUSENTE) {
            return Err(ENTRADA);
        }
        let mut o = ids.clone();
        o.sort_unstable();
        if o.windows(2).any(|w| w[0] == w[1]) {
            return Err(ENTRADA);
        }
        Ok(ids)
    }
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let t = Tab::nova(secao, n_linhas, bytes)?;
    debug_assert!(t.s.colunas.first().map(|c| c.tipo) == Some(Tipo::U32));
    let ids = t.chaves()?;
    let n = t.n;
    macro_rules! linhas {
        ($i:ident => $fila:expr) => {{
            let mut v = Vec::with_capacity(n);
            for ($i, &k) in ids.iter().enumerate() {
                v.push((k, $fila));
            }
            v
        }};
    }
    Ok(match secao {
        SECAO_ESCADAS_GC => Lote::escadas(linhas!(i => EscadaGC {
            nivel: t.u("nivel_num", i)?,
            z_base: t.d("z_base", i)?,
            z_topo: t.d("z_topo", i)?,
            altura_espelho: t.dp("altura_espelho", i)?,
            profundidade_piso: t.dp("profundidade_piso", i)?,
        })),
        SECAO_ESCADA_COMPONENTES_GC => Lote::componentes(linhas!(i => ComponenteGC {
            escada: t.u("escada_num", i)?,
            indice: t.u("indice", i)?,
            tipo: t.e("tipo", i, 1)?,
            caracol: t.b("caracol", i)?,
            centro: t.p("centro_x", "centro_y", i)?,
            r_int: t.dp("r_int", i)?,
            r_ext: t.dp("r_ext", i)?,
        })),
        SECAO_ESCADA_CURVAS_GC => Lote::curvas(linhas!(i => CurvaGC {
            componente: t.u("componente_num", i)?,
            lado: t.e("lado", i, 1)?,
            ordem: t.u("ordem", i)?,
            a: t.p("ax", "ay", i)?,
            b: t.p("bx", "by", i)?,
            sag: t.d("sag", i)?,
        })),
        SECAO_ESCADA_ESPELHOS_GC => Lote::espelhos(linhas!(i => EspelhoGC {
            componente: t.u("componente_num", i)?,
            indice: t.u("indice", i)?,
            a: t.p("ax", "ay", i)?,
            b: t.p("bx", "by", i)?,
            z0: t.d("z0", i)?,
            z1: t.d("z1", i)?,
        })),
        SECAO_ESCADA_PATAMARES_GC => Lote::patamares_escada(linhas!(i => PontoAnelGC {
            dono: t.u("componente_num", i)?,
            componente: 0,
            indice: t.u("indice", i)?,
            p: t.p("x", "y", i)?,
            z: t.d("z", i)?,
        })),
        SECAO_RAMPAS_GC => Lote::rampas(linhas!(i => RampaGC {
            nivel: t.u("nivel_num", i)?,
            z_base: t.d("z_base", i)?,
            z_topo: t.d("z_topo", i)?,
        })),
        SECAO_RAMPA_LANCES_GC => Lote::lances_rampa(linhas!(i => LanceRampaGC {
            rampa: t.u("rampa_num", i)?,
            indice: t.u("indice", i)?,
            inicio: t.p("sx", "sy", i)?,
            fim: t.p("ex", "ey", i)?,
            a: t.p("ax", "ay", i)?,
            b: t.p("bx", "by", i)?,
            c: t.p("cx", "cy", i)?,
            d: t.p("dx", "dy", i)?,
            z0: t.d("z0", i)?,
            z1: t.d("z1", i)?,
        })),
        SECAO_RAMPA_PATAMARES_GC => Lote::patamares_rampa(linhas!(i => PontoAnelGC {
            dono: t.u("rampa_num", i)?,
            componente: t.u("componente", i)?,
            indice: t.u("indice", i)?,
            p: t.p("x", "y", i)?,
            z: t.d("z", i)?,
        })),
        SECAO_GUARDAS_CORPO => Lote::guardas(linhas!(i => GuardaCorpoLinha {
            nivel: t.u("nivel_num", i)?,
            tipo: t.u("tipo_num", i)?,
            hosp: t.e("hosp", i, HOSP_RAMPA)?,
            hosp_num: t.id("hosp_num", i)?,
            lados: t.e("lados", i, 15)?,
            pos_base: t.e("pos_base", i, 1)?,
            desloc: t.d("desloc", i)?,
            altura: t.dn("altura", i)?,
            inverter: t.b("inverter", i)?,
            fechado: t.b("fechado", i)?,
            lado_desloc: t.e("lado_desloc", i, 2)?,
            cota_base: t.d("cota_base", i)?,
            flags: t.e("flags", i, 7)?,
        })),
        SECAO_GUARDA_CAMINHOS_MANUAIS => Lote::caminhos(linhas!(i => CaminhoLinha {
            guarda: t.u("guarda_num", i)?,
            indice: t.u("indice", i)?,
            x: t.d("x", i)?,
            y: t.d("y", i)?,
            dz: t.d("dz", i)?,
        })),
        SECAO_TIPOS_GUARDA => Lote::tipos(linhas!(i => TipoGuardaLinha {
            altura: t.d("altura", i)?,
            desloc: t.d("desloc", i)?,
            ajuste_patamar: t.d("ajuste_patamar", i)?,
            folga_inferior: t.dp("folga_inferior", i)?,
            junc_angular: t.e("junc_angular", i, 1)?,
            junc_tangente: t.e("junc_tangente", i, 2)?,
            conexao: t.e("conexao", i, 1)?,
            tol_corda: {
                let x = t.d("tol_corda", i)?;
                if !(TOL_CORDA_MIN..=TOL_CORDA_MAX).contains(&x) {
                    return Err(ENTRADA);
                }
                x
            },
            norma: t.id("norma_num", i)?,
        })),
        SECAO_PERFIS_GUARDA => Lote::perfis(linhas!(i => PerfilGuardaLinha {
            forma: t.e("forma", i, FORMA_POLIGONO)?,
            largura: t.dp("largura", i)?,
            altura: t.dp("altura", i)?,
            n_pontos: t.u("n_pontos", i)?,
            lados: t.u("lados", i)?,
        })),
        SECAO_PERFIS_GUARDA_PONTOS => Lote::perfis_pontos(linhas!(i => PerfilPontoLinha {
            perfil: t.u("perfil_num", i)?,
            indice: t.u("indice", i)?,
            x: t.d("x", i)?,
            y: t.d("y", i)?,
        })),
        SECAO_TRILHOS_GUARDA => Lote::trilhos(linhas!(i => TrilhoLinha {
            tipo: t.u("tipo_num", i)?,
            indice: t.u("indice", i)?,
            altura: t.d("altura", i)?,
            desloc: t.d("desloc", i)?,
            perfil: t.u("perfil_num", i)?,
            material: t.u("material_num", i)?,
        })),
        SECAO_CORRIMAOS_GUARDA => Lote::corrimaos(linhas!(i => CorrimaoLinha {
            tipo: t.u("tipo_num", i)?,
            indice: t.u("indice", i)?,
            funcao: t.e("funcao", i, 1)?,
            posicao: t.e("posicao", i, 3)?,
            altura: t.d("altura", i)?,
            afastamento: t.dp("afastamento", i)?,
            perfil: t.u("perfil_num", i)?,
            material: t.u("material_num", i)?,
            ext_inicio: ExtensaoLinha { estilo: t.e("ext_ini_estilo", i, 3)?, comprimento: t.dp("ext_ini_comp", i)?, mais_piso: t.b("ext_ini_mais_piso", i)? },
            ext_fim: ExtensaoLinha { estilo: t.e("ext_fim_estilo", i, 3)?, comprimento: t.dp("ext_fim_comp", i)?, mais_piso: t.b("ext_fim_mais_piso", i)? },
            sup_layout: t.e("sup_layout", i, 5)?,
            sup_espac: t.dp("sup_espac", i)?,
            sup_numero: t.u("sup_numero", i)?,
            sup_justif: t.e("sup_justif", i, 3)?,
            sup_perfil: t.u("sup_perfil_num", i)?,
            sup_comp: t.dp("sup_comp", i)?,
            transicao: t.e("transicao", i, 2)?,
            juncao: t.e("juncao", i, 1)?,
            raio_filete: t.dp("raio_filete", i)?,
        })),
        SECAO_POSTES_GUARDA => Lote::postes(linhas!(i => PosteLinha {
            tipo: t.u("tipo_num", i)?,
            papel: t.e("papel", i, POSTE_INTERMEDIARIO)?,
            ativo: t.b("ativo", i)?,
            perfil: t.u("perfil_num", i)?,
            material: t.u("material_num", i)?,
            acima: t.dp("acima", i)?,
            abaixo: t.dp("abaixo", i)?,
            ang_canto: t.dp("ang_canto", i)?,
            modo: t.e("modo", i, 3)?,
            espacamento: t.dp("espacamento", i)?,
            numero: t.u("numero", i)?,
        })),
        SECAO_PADROES_GUARDA => Lote::padroes(linhas!(i => PadraoLinha {
            tipo: t.u("tipo_num", i)?,
            indice: t.u("indice", i)?,
            base_tipo: t.e("base_tipo", i, REF_TRILHO)?,
            base_idx: t.u("base_idx", i)?,
            topo_tipo: t.e("topo_tipo", i, REF_CORRIMAO)?,
            topo_idx: t.u("topo_idx", i)?,
            periodo: t.dp("periodo", i)?,
            justif: t.e("justif", i, 3)?,
            sobra: t.e("sobra", i, 2)?,
            quebra: t.e("quebra", i, 2)?,
            ang_quebra: t.dp("ang_quebra", i)?,
            escopo: t.e("escopo", i, 1)?,
            pd_ativo: t.b("pd_ativo", i)?,
            pd_qtd: t.u("pd_qtd", i)?,
            pd_dist: t.dp("pd_dist", i)?,
            pd_perfil: t.u("pd_perfil_num", i)?,
            pd_material: t.u("pd_material_num", i)?,
        })),
        SECAO_PADRAO_ELEMENTOS_GUARDA => Lote::padrao_elementos(linhas!(i => ElementoPadraoLinha {
            padrao: t.u("padrao_num", i)?,
            indice: t.u("indice", i)?,
            perfil: t.id("perfil_num", i)?,
            material: t.u("material_num", i)?,
            dist_anterior: t.dp("dist_anterior", i)?,
            desloc_lateral: t.d("desloc_lateral", i)?,
            desloc_base: t.d("desloc_base", i)?,
            desloc_topo: t.d("desloc_topo", i)?,
        })),
        SECAO_PAINEIS_GUARDA => Lote::paineis(linhas!(i => PainelLinha {
            tipo: t.u("tipo_num", i)?,
            indice: t.u("indice", i)?,
            familia: t.e("familia", i, 4)?,
            base_tipo: t.e("base_tipo", i, REF_TRILHO)?,
            base_idx: t.u("base_idx", i)?,
            topo_tipo: t.e("topo_tipo", i, REF_CORRIMAO)?,
            topo_idx: t.u("topo_idx", i)?,
            desl_base: t.d("desl_base", i)?,
            desl_topo: t.d("desl_topo", i)?,
            espessura: t.dp("espessura", i)?,
            folga_lateral: t.dp("folga_lateral", i)?,
            largura_max: t.dp("largura_max", i)?,
            material: t.u("material_num", i)?,
            perf_diam: t.dp("perf_diam", i)?,
            perf_passo_x: t.dp("perf_passo_x", i)?,
            perf_passo_y: t.dp("perf_passo_y", i)?,
            perf_alternado: t.b("perf_alternado", i)?,
            tela_larg: t.dp("tela_larg", i)?,
            tela_alt: t.dp("tela_alt", i)?,
            tela_fio: t.dp("tela_fio", i)?,
            cabo_diam: t.dp("cabo_diam", i)?,
            cabo_espac: t.dp("cabo_espac", i)?,
            cabo_orient: t.e("cabo_orient", i, 1)?,
        })),
        SECAO_NORMAS_GUARDA => Lote::normas(linhas!(i => {
            let flags = t.u("n_flags", i)?;
            if flags >> NORMA_N_LIMITES != 0 {
                return Err(ENTRADA);
            }
            // O par `alturaMinimaAlta` vale junto.
            let (a, b) = ((flags >> limite::ALTURA_ALTA_ACIMA) & 1, (flags >> limite::ALTURA_ALTA_ALTURA) & 1);
            if a != b {
                return Err(ENTRADA);
            }
            let mut lim = [None; NORMA_N_LIMITES as usize];
            for (k, nome) in NORMA_COLUNAS.iter().enumerate() {
                if (flags >> k) & 1 == 1 {
                    lim[k] = Some(t.numero(nome, i)?);
                }
            }
            NormaLinha { limite: lim }
        })),
        _ => return Err(ENTRADA),
    })
}

impl SecoesGC {
    /// Substitui todas as linhas da seção (atômico: decodifica antes de tocar).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        self.limpar(secao);
        self.aplicar(lote);
        Ok(())
    }

    /// Insere ou substitui pela chave (atômico). `LIMITE` se passar do máximo de linhas da seção.
    pub fn upsert(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        let novas = lote.chaves().into_iter().filter(|&k| !self.contem(secao, k)).count();
        if self.tamanho(secao).saturating_add(novas) > LIMITE_LINHAS_POR_SECAO as usize {
            return Err(LIMITE);
        }
        self.aplicar(lote);
        Ok(())
    }

    /// Confere as referências entre seções e os limites de defesa (ADR §6.2: `ENTRADA` para seção inconsistente, `LIMITE` para o que passa dos máximos).
    /// As consultas das fases 3 e 4 chamam isto antes de calcular; as seções de cada guarda-corpo são lidas só quando ele existe.
    pub fn validar_referencias(&self) -> Result<(), u32> {
        let contar = |it: &mut dyn Iterator<Item = u32>| -> HashMap<u32, usize> {
            let mut m = HashMap::new();
            for k in it {
                *m.entry(k).or_insert(0usize) += 1;
            }
            m
        };
        // Hospedeiros: componentes -> escada; curvas, espelhos e anéis -> componente; lances e anéis de rampa -> rampa.
        for c in self.componentes.values() {
            if !self.escadas.contains_key(&c.escada) {
                return Err(ENTRADA);
            }
        }
        for dono in self.curvas.values().map(|x| x.componente).chain(self.espelhos.values().map(|x| x.componente)).chain(self.patamares_escada.values().map(|x| x.dono)) {
            if !self.componentes.contains_key(&dono) {
                return Err(ENTRADA);
            }
        }
        for dono in self.lances_rampa.values().map(|x| x.rampa).chain(self.patamares_rampa.values().map(|x| x.dono)) {
            if !self.rampas.contains_key(&dono) {
                return Err(ENTRADA);
            }
        }
        // Perfis: pontos do polígono.
        let pontos_por_perfil = contar(&mut self.perfis_pontos.values().map(|p| p.perfil));
        for p in self.perfis_pontos.values() {
            if !self.perfis.contains_key(&p.perfil) {
                return Err(ENTRADA);
            }
        }
        for (id, p) in &self.perfis {
            let linhas = pontos_por_perfil.get(id).copied().unwrap_or(0);
            if p.n_pontos as usize != linhas {
                return Err(ENTRADA);
            }
            match p.forma {
                FORMA_POLIGONO if !(PERFIL_PONTOS_MIN..=PERFIL_PONTOS_MAX).contains(&p.n_pontos) => return Err(ENTRADA),
                FORMA_CIRCULAR if !(LADOS_MIN..=LADOS_MAX).contains(&p.lados) => return Err(ENTRADA),
                _ => {}
            }
        }
        // Tipos: trilhos, corrimãos, postes, padrões e painéis dependem de um tipo e apontam para perfis.
        let perfil_existe = |k: u32| self.perfis.contains_key(&k);
        for t in self.tipos.values() {
            if t.norma != ID_AUSENTE && !self.normas.contains_key(&t.norma) {
                return Err(ENTRADA);
            }
        }
        for t in self.trilhos.values() {
            if !self.tipos.contains_key(&t.tipo) || !perfil_existe(t.perfil) {
                return Err(ENTRADA);
            }
        }
        for c in self.corrimaos.values() {
            if !self.tipos.contains_key(&c.tipo) || !perfil_existe(c.perfil) || (c.sup_layout != 0 && !perfil_existe(c.sup_perfil)) {
                return Err(ENTRADA);
            }
        }
        for p in self.postes.values() {
            if !self.tipos.contains_key(&p.tipo) || (p.ativo && !perfil_existe(p.perfil)) {
                return Err(ENTRADA);
            }
        }
        let n_trilhos = contar(&mut self.trilhos.values().map(|t| t.tipo));
        let n_corrimaos = contar(&mut self.corrimaos.values().map(|t| t.tipo));
        let n_padroes = contar(&mut self.padroes.values().map(|t| t.tipo));
        let n_paineis = contar(&mut self.paineis.values().map(|t| t.tipo));
        let n_elementos = contar(&mut self.padrao_elementos.values().map(|t| t.padrao));
        for &id in self.tipos.keys() {
            let g = |m: &HashMap<u32, usize>| m.get(&id).copied().unwrap_or(0);
            if g(&n_trilhos) > LIMITE_TRILHOS || g(&n_corrimaos) > LIMITE_CORRIMAOS || g(&n_padroes) + g(&n_paineis) > LIMITE_PREENCHIMENTOS {
                return Err(LIMITE);
            }
        }
        let ref_ok = |tipo: u32, rt: u8, idx: u32, topo: bool| -> bool {
            let tr = n_trilhos.get(&tipo).copied().unwrap_or(0);
            let co = n_corrimaos.get(&tipo).copied().unwrap_or(0);
            match rt {
                REF_HOSPEDEIRO_OU_ALTURA => true,
                REF_TRILHO => (idx as usize) < tr,
                _ => topo && (idx as usize) < co,
            }
        };
        let mut indices_preench: BTreeSet<(u32, u32)> = BTreeSet::new();
        for (id, p) in &self.padroes {
            if !self.tipos.contains_key(&p.tipo) || !ref_ok(p.tipo, p.base_tipo, p.base_idx, false) || !ref_ok(p.tipo, p.topo_tipo, p.topo_idx, true) {
                return Err(ENTRADA);
            }
            if p.pd_ativo && (p.pd_qtd == 0 || (p.pd_perfil != ID_AUSENTE && !perfil_existe(p.pd_perfil))) {
                return Err(ENTRADA);
            }
            let ne = n_elementos.get(id).copied().unwrap_or(0);
            if ne == 0 {
                return Err(ENTRADA);
            }
            if ne > LIMITE_ELEMENTOS_PADRAO {
                return Err(LIMITE);
            }
            if !indices_preench.insert((p.tipo, p.indice)) {
                return Err(ENTRADA);
            }
        }
        for p in self.paineis.values() {
            if !self.tipos.contains_key(&p.tipo) || !ref_ok(p.tipo, p.base_tipo, p.base_idx, false) || !ref_ok(p.tipo, p.topo_tipo, p.topo_idx, true) {
                return Err(ENTRADA);
            }
            if !indices_preench.insert((p.tipo, p.indice)) {
                return Err(ENTRADA);
            }
        }
        for e in self.padrao_elementos.values() {
            if !self.padroes.contains_key(&e.padrao) || (e.perfil != ID_AUSENTE && !perfil_existe(e.perfil)) {
                return Err(ENTRADA);
            }
        }
        // Guarda-corpos: tipo, hospedeiro e caminho manual.
        let n_caminho = contar(&mut self.caminhos.values().map(|c| c.guarda));
        for c in self.caminhos.values() {
            if !self.guardas.contains_key(&c.guarda) {
                return Err(ENTRADA);
            }
        }
        for (id, g) in &self.guardas {
            if !self.tipos.contains_key(&g.tipo) {
                return Err(ENTRADA);
            }
            match g.hosp {
                HOSP_ESCADA if !self.escadas.contains_key(&g.hosp_num) => return Err(ENTRADA),
                HOSP_RAMPA if !self.rampas.contains_key(&g.hosp_num) => return Err(ENTRADA),
                HOSP_MANUAL => {
                    let n = n_caminho.get(id).copied().unwrap_or(0);
                    if n < 2 {
                        return Err(ENTRADA);
                    }
                    if n > LIMITE_VERTICES_CAMINHO {
                        return Err(LIMITE);
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
}

/// Gancho da Fase 2 para `guarda_caminhos`: confere as referências entre as seções e devolve as quatro saídas vazias do esquema. A Fase 3a troca o corpo
/// pelo cálculo das cadeias (`CadeiaGC`); a validação fica.
pub fn guarda_caminhos_gancho(cena: &crate::cena::Cena) -> Result<Vec<crate::consultas::Saida>, u32> {
    use crate::consultas::Saida;
    cena.gc.validar_referencias()?;
    Ok(vec![Saida::U32(Vec::new()), Saida::F64(Vec::new()), Saida::U32(Vec::new()), Saida::F64(Vec::new())])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::esquema::{bytes_coluna, SECOES};

    /// Bytes de uma seção a partir de colunas dadas por nome (as que faltam ficam zeradas). Cada coluna é preenchida a múltiplo de 8, como no codec.
    fn bytes(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
        let s = esquema::secao(secao).expect("seção");
        let mut out = Vec::new();
        for c in s.colunas {
            let v: Vec<f64> = valores.iter().find(|(nome, _)| *nome == c.nome).map(|(_, v)| v.clone()).unwrap_or_else(|| vec![0.0; n]);
            assert_eq!(v.len(), n, "coluna {}", c.nome);
            let mut col = Vec::new();
            for x in v {
                match c.tipo {
                    Tipo::U32 => col.extend_from_slice(&(x as u32).to_le_bytes()),
                    Tipo::I32 => col.extend_from_slice(&(x as i32).to_le_bytes()),
                    Tipo::F64 => col.extend_from_slice(&x.to_le_bytes()),
                    Tipo::U8 => col.push(x as u8),
                }
            }
            col.resize(bytes_coluna(c.tipo, n).expect("tam"), 0);
            out.extend(col);
        }
        out
    }

    fn v(x: &[f64]) -> Vec<f64> {
        x.to_vec()
    }

    #[test]
    fn toda_secao_gc_tem_dono_e_decodifica_zeros_ou_recusa_com_codigo() {
        let ids: Vec<u32> = SECOES.iter().map(|s| s.id).filter(|&i| i >= 60).collect();
        assert_eq!(ids.len(), 20);
        for id in ids {
            assert!(SecoesGC::e_minha(id), "seção {id}");
            // Zero linhas sempre vale.
            let mut s = SecoesGC::default();
            assert_eq!(s.definir(id, 0, &bytes(id, 0, &[])), Ok(()), "seção {id} vazia");
            // Uma linha de zeros: ou entra, ou é recusada com ENTRADA (por ex. tol_corda fora da faixa), nunca com INTERNO.
            let r = s.definir(id, 1, &bytes(id, 1, &[("id_num", v(&[1.0]))]));
            assert!(r == Ok(()) || r == Err(ENTRADA), "seção {id}: {r:?}");
        }
        assert!(!SecoesGC::e_minha(25));
        assert!(!SecoesGC::e_minha(68));
        assert!(!SecoesGC::e_minha(82));
    }

    #[test]
    fn ida_e_volta_de_escada_e_rampa() {
        let mut s = SecoesGC::default();
        let b = bytes(SECAO_ESCADAS_GC, 2, &[("id_num", v(&[7.0, 3.0])), ("nivel_num", v(&[1.0, 2.0])), ("z_base", v(&[0.0, 3.0])), ("z_topo", v(&[3.0, 6.0])), ("altura_espelho", v(&[0.17, 0.18])), ("profundidade_piso", v(&[0.28, 0.27]))]);
        s.definir(SECAO_ESCADAS_GC, 2, &b).expect("escadas");
        assert_eq!(s.escadas.keys().copied().collect::<Vec<_>>(), vec![3, 7], "ordem canônica por id");
        assert_eq!(s.escadas[&7], EscadaGC { nivel: 1, z_base: 0.0, z_topo: 3.0, altura_espelho: 0.17, profundidade_piso: 0.28 });

        let b = bytes(SECAO_RAMPA_PATAMARES_GC, 2, &[("id_num", v(&[1.0, 2.0])), ("rampa_num", v(&[5.0, 5.0])), ("componente", v(&[2.0, 2.0])), ("indice", v(&[0.0, 1.0])), ("x", v(&[0.0, 1.0])), ("y", v(&[0.0, 0.5])), ("z", v(&[0.9, 0.9]))]);
        s.definir(SECAO_RAMPA_PATAMARES_GC, 2, &b).expect("patamares de rampa");
        assert_eq!(s.patamares_rampa[&2], PontoAnelGC { dono: 5, componente: 2, indice: 1, p: [1.0, 0.5], z: 0.9 });

        let b = bytes(SECAO_ESCADA_COMPONENTES_GC, 1, &[("id_num", v(&[4.0])), ("escada_num", v(&[7.0])), ("indice", v(&[2.0])), ("tipo", v(&[1.0])), ("caracol", v(&[1.0])), ("centro_x", v(&[1.5])), ("r_int", v(&[0.2])), ("r_ext", v(&[1.2]))]);
        s.definir(SECAO_ESCADA_COMPONENTES_GC, 1, &b).expect("componentes");
        let c = s.componentes[&4];
        assert!(c.caracol && c.tipo == COMPONENTE_PATAMAR && c.centro == [1.5, 0.0] && c.r_ext == 1.2);
    }

    #[test]
    fn recusa_chave_ausente_duplicada_nao_finito_e_enum_fora() {
        let mut s = SecoesGC::default();
        let ok = |ids: &[f64]| bytes(SECAO_RAMPAS_GC, ids.len(), &[("id_num", v(ids))]);
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 2, &ok(&[1.0, 1.0])), Err(ENTRADA), "duplicada");
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 1, &ok(&[ID_AUSENTE as f64])), Err(ENTRADA), "ausente");
        let nan = bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[1.0])), ("z_base", v(&[f64::NAN]))]);
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 1, &nan), Err(ENTRADA), "NaN em coluna que não aceita");
        let inf = bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[1.0])), ("z_topo", v(&[f64::INFINITY]))]);
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 1, &inf), Err(ENTRADA));
        let grande = bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[1.0])), ("z_topo", v(&[2e12]))]);
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 1, &grande), Err(ENTRADA));
        assert_eq!(s.definir(SECAO_RAMPAS_GC, 1, &ok(&[1.0])[..8]), Err(ENTRADA), "tamanho errado");
        let enum_fora = bytes(SECAO_GUARDAS_CORPO, 1, &[("id_num", v(&[1.0])), ("hosp", v(&[3.0]))]);
        assert_eq!(s.definir(SECAO_GUARDAS_CORPO, 1, &enum_fora), Err(ENTRADA));
        let lados = bytes(SECAO_GUARDAS_CORPO, 1, &[("id_num", v(&[1.0])), ("lados", v(&[16.0]))]);
        assert_eq!(s.definir(SECAO_GUARDAS_CORPO, 1, &lados), Err(ENTRADA));
        let bool_fora = bytes(SECAO_GUARDAS_CORPO, 1, &[("id_num", v(&[1.0])), ("inverter", v(&[2.0]))]);
        assert_eq!(s.definir(SECAO_GUARDAS_CORPO, 1, &bool_fora), Err(ENTRADA));
        assert_eq!(s.rampas.len(), 0, "falha não toca a cena");
        // NaN na altura do guarda-corpo = a do tipo.
        let nan_ok = bytes(SECAO_GUARDAS_CORPO, 1, &[("id_num", v(&[1.0])), ("altura", v(&[f64::NAN]))]);
        assert_eq!(s.definir(SECAO_GUARDAS_CORPO, 1, &nan_ok), Ok(()));
        assert!(s.guardas[&1].altura.is_nan());
        // tol_corda fora de 0,5 a 10 mm.
        let tol = |x: f64| bytes(SECAO_TIPOS_GUARDA, 1, &[("id_num", v(&[1.0])), ("tol_corda", v(&[x]))]);
        assert_eq!(s.definir(SECAO_TIPOS_GUARDA, 1, &tol(0.002)), Ok(()));
        assert_eq!(s.definir(SECAO_TIPOS_GUARDA, 1, &tol(0.0001)), Err(ENTRADA));
        assert_eq!(s.definir(SECAO_TIPOS_GUARDA, 1, &tol(0.02)), Err(ENTRADA));
    }

    #[test]
    fn upsert_remover_e_atomicidade() {
        let mut s = SecoesGC::default();
        let a = bytes(SECAO_RAMPAS_GC, 2, &[("id_num", v(&[1.0, 2.0])), ("z_topo", v(&[3.0, 4.0]))]);
        s.definir(SECAO_RAMPAS_GC, 2, &a).expect("definir");
        let b = bytes(SECAO_RAMPAS_GC, 2, &[("id_num", v(&[2.0, 9.0])), ("z_topo", v(&[40.0, 90.0]))]);
        s.upsert(SECAO_RAMPAS_GC, 2, &b).expect("upsert");
        assert_eq!(s.rampas.len(), 3);
        assert_eq!(s.rampas[&2].z_topo, 40.0);
        assert_eq!(s.rampas[&1].z_topo, 3.0, "linha não tocada fica");
        // upsert inválido (chave duplicada no lote) não muda nada.
        let ruim = bytes(SECAO_RAMPAS_GC, 2, &[("id_num", v(&[1.0, 1.0])), ("z_topo", v(&[7.0, 8.0]))]);
        assert_eq!(s.upsert(SECAO_RAMPAS_GC, 2, &ruim), Err(ENTRADA));
        assert_eq!(s.rampas[&1].z_topo, 3.0);
        s.remover(SECAO_RAMPAS_GC, &[1, 77]);
        assert_eq!(s.rampas.keys().copied().collect::<Vec<_>>(), vec![2, 9]);
        // definir substitui tudo.
        s.definir(SECAO_RAMPAS_GC, 1, &bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[5.0]))])).expect("definir de novo");
        assert_eq!(s.rampas.keys().copied().collect::<Vec<_>>(), vec![5]);
        assert_eq!(s.total_linhas(), 1);
    }

    #[test]
    fn norma_flags_e_par_de_altura_alta() {
        let mut s = SecoesGC::default();
        let flags = (1u32 << limite::ALTURA_MINIMA) | (1 << limite::ESFERA_MAXIMA) | (1 << 21) | (1 << 22);
        let b = bytes(SECAO_NORMAS_GUARDA, 1, &[("id_num", v(&[1.0])), ("n_flags", v(&[flags as f64])), ("altura_minima", v(&[1.1])), ("esfera_maxima", v(&[0.11])), ("corrimao_dois_lados", v(&[1.0])), ("altura_minima_escada_interna", v(&[9.9]))]);
        s.definir(SECAO_NORMAS_GUARDA, 1, &b).expect("norma");
        let n = s.normas[&1];
        assert_eq!(n.limite[limite::ALTURA_MINIMA], Some(1.1));
        assert_eq!(n.limite[limite::ESFERA_MAXIMA], Some(0.11));
        assert_eq!(n.limite[21], Some(1.0));
        assert_eq!(n.limite[22], Some(0.0));
        assert_eq!(n.limite[limite::ALTURA_MINIMA_ESCADA_INTERNA], None, "bit zerado ignora a coluna");
        // Bit ligado com valor não finito.
        let nan = bytes(SECAO_NORMAS_GUARDA, 1, &[("id_num", v(&[1.0])), ("n_flags", v(&[2.0])), ("altura_minima", v(&[f64::NAN]))]);
        assert_eq!(s.definir(SECAO_NORMAS_GUARDA, 1, &nan), Err(ENTRADA));
        // Par alturaMinimaAlta incompleto e bit fora da faixa.
        let par = bytes(SECAO_NORMAS_GUARDA, 1, &[("id_num", v(&[1.0])), ("n_flags", v(&[(1u32 << limite::ALTURA_ALTA_ACIMA) as f64]))]);
        assert_eq!(s.definir(SECAO_NORMAS_GUARDA, 1, &par), Err(ENTRADA));
        let fora = bytes(SECAO_NORMAS_GUARDA, 1, &[("id_num", v(&[1.0])), ("n_flags", v(&[(1u64 << 26) as f64]))]);
        assert_eq!(s.definir(SECAO_NORMAS_GUARDA, 1, &fora), Err(ENTRADA));
        let par_ok = bytes(SECAO_NORMAS_GUARDA, 1, &[("id_num", v(&[1.0])), ("n_flags", v(&[(0b11000u32) as f64])), ("altura_alta_acima", v(&[12.0])), ("altura_alta_altura", v(&[1.3]))]);
        assert_eq!(s.definir(SECAO_NORMAS_GUARDA, 1, &par_ok), Ok(()));
        assert_eq!(s.normas[&1].limite[limite::ALTURA_ALTA_ACIMA], Some(12.0));
        // Os nomes das colunas de limite batem com o esquema, na ordem do bit.
        let esq = esquema::secao(SECAO_NORMAS_GUARDA).expect("norma");
        for (k, nome) in NORMA_COLUNAS.iter().enumerate() {
            assert_eq!(esq.colunas[k + 2].nome, *nome);
        }
        assert_eq!(esq.colunas.len(), NORMA_COLUNAS.len() + 2);
    }

    /// Um conjunto completo e coerente: uma escada com um lance, um tipo com dois trilhos, um corrimão, um padrão, um painel, um perfil poligonal e um guarda-corpo.
    fn conjunto_completo() -> SecoesGC {
        let mut s = SecoesGC::default();
        let mut def = |secao: u32, n: usize, c: Vec<(&str, Vec<f64>)>| s.definir(secao, n as u32, &bytes(secao, n, &c)).expect("definir");
        def(SECAO_ESCADAS_GC, 1, vec![("id_num", v(&[1.0])), ("z_topo", v(&[3.0])), ("altura_espelho", v(&[0.17])), ("profundidade_piso", v(&[0.28]))]);
        def(SECAO_ESCADA_COMPONENTES_GC, 1, vec![("id_num", v(&[1.0])), ("escada_num", v(&[1.0]))]);
        def(SECAO_ESCADA_CURVAS_GC, 1, vec![("id_num", v(&[1.0])), ("componente_num", v(&[1.0])), ("bx", v(&[3.0]))]);
        def(SECAO_PERFIS_GUARDA, 2, vec![("id_num", v(&[1.0, 2.0])), ("forma", v(&[0.0, 2.0])), ("largura", v(&[0.04, 0.0])), ("n_pontos", v(&[0.0, 3.0])), ("lados", v(&[16.0, 0.0]))]);
        def(SECAO_PERFIS_GUARDA_PONTOS, 3, vec![("id_num", v(&[1.0, 2.0, 3.0])), ("perfil_num", v(&[2.0, 2.0, 2.0])), ("indice", v(&[0.0, 1.0, 2.0])), ("x", v(&[0.0, 0.02, 0.0])), ("y", v(&[0.0, 0.0, 0.02]))]);
        def(SECAO_NORMAS_GUARDA, 1, vec![("id_num", v(&[1.0]))]);
        def(SECAO_TIPOS_GUARDA, 1, vec![("id_num", v(&[1.0])), ("altura", v(&[1.1])), ("tol_corda", v(&[0.002])), ("norma_num", v(&[ID_AUSENTE as f64]))]);
        def(SECAO_TRILHOS_GUARDA, 2, vec![("id_num", v(&[1.0, 2.0])), ("tipo_num", v(&[1.0, 1.0])), ("indice", v(&[0.0, 1.0])), ("altura", v(&[0.2, 0.9])), ("perfil_num", v(&[1.0, 1.0]))]);
        def(SECAO_CORRIMAOS_GUARDA, 1, vec![("id_num", v(&[1.0])), ("tipo_num", v(&[1.0])), ("funcao", v(&[1.0])), ("altura", v(&[0.92])), ("perfil_num", v(&[1.0]))]);
        def(SECAO_POSTES_GUARDA, 1, vec![("id_num", v(&[1.0])), ("tipo_num", v(&[1.0])), ("ativo", v(&[1.0])), ("perfil_num", v(&[1.0]))]);
        def(SECAO_PADROES_GUARDA, 1, vec![("id_num", v(&[1.0])), ("tipo_num", v(&[1.0])), ("indice", v(&[0.0])), ("base_tipo", v(&[1.0])), ("base_idx", v(&[0.0])), ("topo_tipo", v(&[1.0])), ("topo_idx", v(&[1.0])), ("periodo", v(&[0.11]))]);
        def(SECAO_PADRAO_ELEMENTOS_GUARDA, 2, vec![("id_num", v(&[1.0, 2.0])), ("padrao_num", v(&[1.0, 1.0])), ("indice", v(&[0.0, 1.0])), ("perfil_num", v(&[1.0, ID_AUSENTE as f64])), ("dist_anterior", v(&[0.0, 0.05]))]);
        def(SECAO_PAINEIS_GUARDA, 1, vec![("id_num", v(&[1.0])), ("tipo_num", v(&[1.0])), ("indice", v(&[1.0])), ("topo_tipo", v(&[2.0])), ("topo_idx", v(&[0.0])), ("espessura", v(&[0.01]))]);
        def(SECAO_GUARDAS_CORPO, 1, vec![("id_num", v(&[1.0])), ("tipo_num", v(&[1.0])), ("hosp", v(&[1.0])), ("hosp_num", v(&[1.0])), ("lados", v(&[5.0]))]);
        s
    }

    #[test]
    fn referencias_de_um_conjunto_coerente_valem() {
        assert_eq!(conjunto_completo().validar_referencias(), Ok(()));
        assert_eq!(SecoesGC::default().validar_referencias(), Ok(()));
    }

    #[test]
    fn referencias_quebradas_dao_entrada() {
        let quebra = |f: &dyn Fn(&mut SecoesGC)| {
            let mut s = conjunto_completo();
            f(&mut s);
            s.validar_referencias()
        };
        assert_eq!(quebra(&|s| s.remover(SECAO_TIPOS_GUARDA, &[1])), Err(ENTRADA), "tipo sumiu");
        assert_eq!(quebra(&|s| s.remover(SECAO_PERFIS_GUARDA, &[1])), Err(ENTRADA), "perfil sumiu");
        assert_eq!(quebra(&|s| s.remover(SECAO_ESCADAS_GC, &[1])), Err(ENTRADA), "hospedeiro sumiu");
        assert_eq!(quebra(&|s| s.remover(SECAO_ESCADA_COMPONENTES_GC, &[1])), Err(ENTRADA), "curva sem componente");
        assert_eq!(quebra(&|s| s.remover(SECAO_TRILHOS_GUARDA, &[2])), Err(ENTRADA), "padrão aponta trilho 1 que não existe mais");
        assert_eq!(quebra(&|s| s.remover(SECAO_CORRIMAOS_GUARDA, &[1])), Err(ENTRADA), "painel aponta corrimão que não existe");
        assert_eq!(quebra(&|s| s.remover(SECAO_PADRAO_ELEMENTOS_GUARDA, &[1, 2])), Err(ENTRADA), "padrão sem elementos");
        assert_eq!(quebra(&|s| s.remover(SECAO_PERFIS_GUARDA_PONTOS, &[3])), Err(ENTRADA), "n_pontos não bate");
        assert_eq!(quebra(&|s| s.padroes.get_mut(&1).expect("padrão").tipo = 9), Err(ENTRADA));
        assert_eq!(quebra(&|s| s.guardas.get_mut(&1).expect("guarda").hosp = HOSP_RAMPA), Err(ENTRADA), "rampa inexistente");
        assert_eq!(quebra(&|s| s.guardas.get_mut(&1).expect("guarda").hosp = HOSP_MANUAL), Err(ENTRADA), "manual sem caminho");
        assert_eq!(quebra(&|s| s.tipos.get_mut(&1).expect("tipo").norma = 44), Err(ENTRADA), "norma inexistente");
        assert_eq!(quebra(&|s| s.paineis.get_mut(&1).expect("painel").indice = 0), Err(ENTRADA), "índice de preenchimento repetido");
        assert_eq!(quebra(&|s| s.perfis.get_mut(&2).expect("perfil").n_pontos = 2), Err(ENTRADA));
    }

    #[test]
    fn limites_de_defesa_dao_limite() {
        let mut s = conjunto_completo();
        s.guardas.get_mut(&1).expect("guarda").hosp = HOSP_MANUAL;
        for k in 0..513u32 {
            s.caminhos.insert(k + 1, CaminhoLinha { guarda: 1, indice: k, x: f64::from(k), y: 0.0, dz: 0.0 });
        }
        assert_eq!(s.validar_referencias(), Err(LIMITE), "513 vértices");
        for k in 512..513u32 {
            s.caminhos.remove(&(k + 1));
        }
        assert_eq!(s.validar_referencias(), Ok(()), "512 vértices");

        let mut s = conjunto_completo();
        let t = s.trilhos[&1];
        for k in 0..12u32 {
            s.trilhos.insert(10 + k, TrilhoLinha { indice: 2 + k, ..t });
        }
        assert_eq!(s.validar_referencias(), Err(LIMITE), "14 trilhos");

        let mut s = conjunto_completo();
        let e = s.padrao_elementos[&1];
        for k in 0..16u32 {
            s.padrao_elementos.insert(10 + k, ElementoPadraoLinha { indice: 2 + k, ..e });
        }
        assert_eq!(s.validar_referencias(), Err(LIMITE), "18 elementos");

        let mut s = conjunto_completo();
        let p = s.paineis[&1];
        for k in 0..8u32 {
            s.paineis.insert(10 + k, PainelLinha { indice: 5 + k, ..p });
        }
        assert_eq!(s.validar_referencias(), Err(LIMITE), "mais de 8 preenchimentos");
    }

    #[test]
    fn limite_de_linhas_no_upsert() {
        let mut s = SecoesGC::default();
        // Simula a seção cheia sem alocar 4 milhões de linhas: o teste de `LIMITE` do upsert depende de `tamanho`, que já é coberto aqui por uma
        // contagem pequena; o valor do limite vem do esquema.
        assert_eq!(LIMITE_LINHAS_POR_SECAO, 4_194_304);
        let b = bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[1.0]))]);
        assert_eq!(s.upsert(SECAO_RAMPAS_GC, 1, &b), Ok(()));
        assert_eq!(s.upsert(SECAO_RAMPAS_GC, 1, &b), Ok(()), "mesma chave substitui");
        assert_eq!(s.rampas.len(), 1);
    }

    #[test]
    fn consulta_guarda_caminhos_valida_as_referencias() {
        use crate::cena::Cena;
        use crate::consultas::{executar, Saida};
        use crate::esquema::{CONSULTA_GUARDA_CAMINHOS, CONSULTA_GUARDA_MALHA, NAO_IMPLEMENTADO};
        let mut c = Cena::novo();
        c.gc = conjunto_completo();
        let r = executar(&mut c, CONSULTA_GUARDA_CAMINHOS, &[0.0, 1e-6]).expect("consulta");
        assert_eq!(r.len(), 4);
        assert!(r.iter().all(Saida::is_empty));
        assert_eq!(executar(&mut c, CONSULTA_GUARDA_CAMINHOS, &[0.0, -1.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, CONSULTA_GUARDA_CAMINHOS, &[0.0]), Err(ENTRADA));
        c.gc.remover(SECAO_TIPOS_GUARDA, &[1]);
        assert_eq!(executar(&mut c, CONSULTA_GUARDA_CAMINHOS, &[0.0, 1e-6]), Err(ENTRADA));
        assert_eq!(executar(&mut c, CONSULTA_GUARDA_MALHA, &[0.0, 1.0]), Err(NAO_IMPLEMENTADO), "o resto fica para as fases 3 e 4");
    }

    #[test]
    fn cena_encaminha_as_secoes_do_guarda_corpo() {
        use crate::cena::Cena;
        let mut c = Cena::novo();
        let a = bytes(SECAO_RAMPAS_GC, 2, &[("id_num", v(&[1.0, 2.0])), ("z_topo", v(&[3.0, 4.0]))]);
        assert_eq!(c.definir_secao(SECAO_RAMPAS_GC, 2, &a), Ok(()));
        assert_eq!(c.gc.rampas.len(), 2);
        // Reenviar a mesma seção não muda nada (selo); upsert e remover chegam ao SecoesGC.
        assert_eq!(c.definir_secao(SECAO_RAMPAS_GC, 2, &a), Ok(()));
        let b = bytes(SECAO_RAMPAS_GC, 1, &[("id_num", v(&[2.0])), ("z_topo", v(&[9.0]))]);
        assert_eq!(c.upsert(SECAO_RAMPAS_GC, 1, &b), Ok(()));
        assert_eq!(c.gc.rampas[&2].z_topo, 9.0);
        assert_eq!(c.remover(SECAO_RAMPAS_GC, &[1]), Ok(()));
        assert_eq!(c.gc.rampas.len(), 1);
        // Dado ruim: ENTRADA e a cena fica como estava.
        let ruim = bytes(SECAO_RAMPAS_GC, 2, &[("id_num", v(&[5.0, 5.0]))]);
        assert_eq!(c.definir_secao(SECAO_RAMPAS_GC, 2, &ruim), Err(ENTRADA));
        assert_eq!(c.gc.rampas.len(), 1);
        // O guarda-corpo não mexe nas paredes.
        assert_eq!(c.n_paredes(), 0);
        // Seção fora do esquema continua recusada.
        assert_eq!(c.definir_secao(68, 0, &[]), Err(ENTRADA));
    }
}
