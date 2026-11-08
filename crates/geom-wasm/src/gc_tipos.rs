//! Tipos comuns do guarda-corpo no Rust (decisão 0055, Fase 2): códigos dos enums das seções 60 a 81, limites de defesa e a estrutura `CadeiaGC`.
//!
//! `CadeiaGC` é a cadeia de nós 3D do eixo do guarda-corpo (ADR §5.1). A Fase 3a a produz a partir das seções do hospedeiro; as fases 3b, 3c e 4a a
//! consomem. Até a 3a ficar pronta, os testes dessas fases usam as cadeias sintéticas daqui (`CadeiaGC::reta`, `em_l`, `lance_inclinado`).

/// Limites de defesa (ADR §4.2): acima deles a consulta devolve `LIMITE` (ou `ENTRADA` quando a lista fica abaixo do mínimo).
pub const LIMITE_TRILHOS: usize = 12;
pub const LIMITE_CORRIMAOS: usize = 4;
pub const LIMITE_PREENCHIMENTOS: usize = 8;
pub const LIMITE_ELEMENTOS_PADRAO: usize = 16;
pub const PERFIL_PONTOS_MIN: u32 = 3;
pub const PERFIL_PONTOS_MAX: u32 = 64;
pub const LIMITE_VERTICES_CAMINHO: usize = 512;
pub const LIMITE_BALAUSTRES: usize = 20_000;
/// Menor e maior `tol_corda` aceitos (m): 0,5 a 10 mm (ADR §5.1, item 2).
pub const TOL_CORDA_MIN: f64 = 0.0005;
pub const TOL_CORDA_MAX: f64 = 0.01;
/// Tolerância de soldagem de nós (m) e grade de saída (m = 1 µm), ADR §5.
pub const TOL_SOLDA_NOS: f64 = 1e-6;
pub const GRADE_SAIDA: f64 = 1e-6;
/// Lados da discretização de um perfil circular (ADR §5.8): 16, ou 24 acima de 80 mm de diâmetro.
pub const LADOS_CIRCULO: u32 = 16;
pub const LADOS_CIRCULO_GRANDE: u32 = 24;
pub const DIAMETRO_CIRCULO_GRANDE: f64 = 0.08;
pub const LADOS_MIN: u32 = 3;
pub const LADOS_MAX: u32 = 256;

/// `hosp` de `guardas_corpo`.
pub const HOSP_MANUAL: u8 = 0;
pub const HOSP_ESCADA: u8 = 1;
pub const HOSP_RAMPA: u8 = 2;
/// Bits de `lados`.
pub const LADO_ESQ_LANCE: u8 = 1;
pub const LADO_ESQ_PATAMAR: u8 = 2;
pub const LADO_DIR_LANCE: u8 = 4;
pub const LADO_DIR_PATAMAR: u8 = 8;
/// Bits de `flags`.
pub const FLAG_POSTES_INTERMEDIARIOS: u8 = 1;
pub const FLAG_PREENCHIMENTO: u8 = 2;
pub const FLAG_CORRIMAO: u8 = 4;
/// `tipo` de `escada_componentes_gc`.
pub const COMPONENTE_LANCE: u8 = 0;
pub const COMPONENTE_PATAMAR: u8 = 1;
/// `forma` de `perfis_guarda`.
pub const FORMA_CIRCULAR: u8 = 0;
pub const FORMA_RETANGULAR: u8 = 1;
pub const FORMA_POLIGONO: u8 = 2;
/// `papel` de `postes_guarda`.
pub const POSTE_INICIO: u8 = 0;
pub const POSTE_FIM: u8 = 1;
pub const POSTE_CANTO: u8 = 2;
pub const POSTE_INTERMEDIARIO: u8 = 3;
/// `base_tipo` e `topo_tipo`.
pub const REF_HOSPEDEIRO_OU_ALTURA: u8 = 0;
pub const REF_TRILHO: u8 = 1;
pub const REF_CORRIMAO: u8 = 2;

/// Número de colunas de limite em `normas_guarda` (depois de `id_num` e `n_flags`): o bit `k` de `n_flags` é a coluna `k + 2`.
pub const NORMA_N_LIMITES: u32 = 26;

/// Ponto 3D de uma cadeia.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct No3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// `origem` dos trechos de `guarda_caminhos` (ADR §6.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OrigemTrecho {
    Lance = 0,
    Patamar = 1,
    Manual = 2,
    Caracol = 3,
}

/// Um trecho contínuo do eixo: de um poste de início a um de fim, sem interrupção por lado desligado.
#[derive(Clone, Debug, PartialEq)]
pub struct TrechoGC {
    pub guarda: u32,
    pub indice: u32,
    pub origem: OrigemTrecho,
    /// `true` quando o trecho é uma curva suave (arco ou hélice) já discretizada: não existe nó de canto no meio.
    pub curvo: bool,
    pub fechado: bool,
    pub nos: Vec<No3>,
}

impl TrechoGC {
    /// Comprimento em planta.
    pub fn comprimento_planta(&self) -> f64 {
        let mut s: f64 = self.nos.windows(2).map(|w| (w[1].x - w[0].x).hypot(w[1].y - w[0].y)).sum();
        if self.fechado {
            if let (Some(a), Some(b)) = (self.nos.first(), self.nos.last()) {
                s += (a.x - b.x).hypot(a.y - b.y);
            }
        }
        s
    }

    /// Comprimento desenvolvido (no espaço, contando a inclinação).
    pub fn comprimento_desenvolvido(&self) -> f64 {
        let d = |a: &No3, b: &No3| ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
        let mut s: f64 = self.nos.windows(2).map(|w| d(&w[0], &w[1])).sum();
        if self.fechado {
            if let (Some(a), Some(b)) = (self.nos.first(), self.nos.last()) {
                s += d(a, b);
            }
        }
        s
    }
}

/// Todas as cadeias dos guarda-corpos de um nível, ordenadas por `(guarda, indice)`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CadeiaGC {
    pub trechos: Vec<TrechoGC>,
}

impl CadeiaGC {
    /// Cadeia sintética de teste: um trecho reto horizontal de `(x0, y0)` a `(x1, y1)` na cota `z`.
    pub fn reta(guarda: u32, (x0, y0): (f64, f64), (x1, y1): (f64, f64), z: f64) -> CadeiaGC {
        CadeiaGC {
            trechos: vec![TrechoGC {
                guarda,
                indice: 0,
                origem: OrigemTrecho::Manual,
                curvo: false,
                fechado: false,
                nos: vec![No3 { x: x0, y: y0, z }, No3 { x: x1, y: y1, z }],
            }],
        }
    }

    /// Cadeia sintética de teste: duas retas em L (canto de 90 graus em `(comp, 0)`), na cota `z`.
    pub fn em_l(guarda: u32, comp: f64, z: f64) -> CadeiaGC {
        CadeiaGC {
            trechos: vec![TrechoGC {
                guarda,
                indice: 0,
                origem: OrigemTrecho::Manual,
                curvo: false,
                fechado: false,
                nos: vec![No3 { x: 0.0, y: 0.0, z }, No3 { x: comp, y: 0.0, z }, No3 { x: comp, y: comp, z }],
            }],
        }
    }

    /// Cadeia sintética de teste: um lance reto inclinado ao longo de +x, de `z0` a `z1`, seguido de um patamar horizontal de `patamar` metros
    /// (dois trechos independentes: lance e patamar, soldados no mesmo nó).
    pub fn lance_inclinado(guarda: u32, comp: f64, z0: f64, z1: f64, patamar: f64) -> CadeiaGC {
        CadeiaGC {
            trechos: vec![
                TrechoGC {
                    guarda,
                    indice: 0,
                    origem: OrigemTrecho::Lance,
                    curvo: false,
                    fechado: false,
                    nos: vec![No3 { x: 0.0, y: 0.0, z: z0 }, No3 { x: comp, y: 0.0, z: z1 }],
                },
                TrechoGC {
                    guarda,
                    indice: 1,
                    origem: OrigemTrecho::Patamar,
                    curvo: false,
                    fechado: false,
                    nos: vec![No3 { x: comp, y: 0.0, z: z1 }, No3 { x: comp + patamar, y: 0.0, z: z1 }],
                },
            ],
        }
    }

    /// Trechos de um guarda-corpo.
    pub fn do_guarda(&self, guarda: u32) -> impl Iterator<Item = &TrechoGC> {
        self.trechos.iter().filter(move |t| t.guarda == guarda)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn comprimentos_das_cadeias_sinteticas() {
        let c = CadeiaGC::reta(1, (0.0, 0.0), (3.0, 4.0), 1.0);
        assert!((c.trechos[0].comprimento_planta() - 5.0).abs() < 1e-12);
        assert!((c.trechos[0].comprimento_desenvolvido() - 5.0).abs() < 1e-12);
        let l = CadeiaGC::em_l(2, 2.0, 0.0);
        assert!((l.trechos[0].comprimento_planta() - 4.0).abs() < 1e-12);
        let r = CadeiaGC::lance_inclinado(3, 3.0, 0.0, 4.0, 1.0);
        assert_eq!(r.trechos.len(), 2);
        assert!((r.trechos[0].comprimento_planta() - 3.0).abs() < 1e-12);
        assert!((r.trechos[0].comprimento_desenvolvido() - 5.0).abs() < 1e-12);
        assert_eq!(r.do_guarda(3).count(), 2);
        assert_eq!(r.do_guarda(9).count(), 0);
        let mut f = em_laco();
        f.fechado = true;
        assert!((f.comprimento_planta() - 4.0).abs() < 1e-12);
    }

    fn em_laco() -> TrechoGC {
        let p = |x, y| No3 { x, y, z: 0.0 };
        TrechoGC { guarda: 1, indice: 0, origem: OrigemTrecho::Manual, curvo: false, fechado: false, nos: vec![p(0.0, 0.0), p(1.0, 0.0), p(1.0, 1.0), p(0.0, 1.0)] }
    }
}
