//! Seções da parede cortina (decisão 0056; esquema v14 na fase 1 e v15 na fase 2): `cortinas`, `tipos_cortina`, `grades_cortina`, `grade_posicoes_cortina`,
//! `tipos_montante_cortina` e `tipos_painel_cortina` (ids 100 a 105), e as sobrescritas da fase 2: `cortina_linhas_extras`, `cortina_segmentos_removidos`,
//! `cortina_linhas_sobrescritas` e `cortina_celulas_sobrescritas` (ids 106 a 109), e a vizinhança das pontas da fase 3: `cortina_extremidades` (id 110), e a esquadria na célula e a cortina embutida da fase 5: `cortina_celulas_abertura` e `cortina_hospedes` (ids 112 e 113).
//!
//! Mesmo molde de `secoes_gc`: `BTreeMap` por chave (ordem canônica = id crescente) e decodificação que valida antes de tocar a cena (atômica): tamanho,
//! chave ausente ou duplicada, valores não finitos e enums fora do domínio (`ENTRADA`). As referências ENTRE seções (tipo, montante, painel, grade) não
//! são checadas aqui, porque as seções chegam em qualquer ordem: `validar_referencias` as confere e é chamada pelas consultas.
//!
//! A cortina não passa pelo resolvedor de camadas das paredes: o adaptador TS a tira da seção 1 e a manda só nestas seções.

use std::collections::{BTreeMap, BTreeSet};

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::cortina_tipos::*;
use crate::esquema::{
    self, Secao, ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_CORTINAS, SECAO_CORTINA_CELULAS_SOBRESCRITAS,
    SECAO_CORTINA_CELULAS_ABERTURA, SECAO_CORTINA_EXTREMIDADES, SECAO_CORTINA_HOSPEDES, SECAO_CORTINA_LINHAS_EXTRAS, SECAO_CORTINA_LINHAS_SOBRESCRITAS, SECAO_CORTINA_SEGMENTOS_REMOVIDOS, SECAO_GRADES_CORTINA,
    SECAO_GRADE_POSICOES_CORTINA, SECAO_TIPOS_CORTINA, SECAO_TIPOS_MONTANTE_CORTINA, SECAO_TIPOS_PAINEL_CORTINA,
};

/// Linha extra da grade (`cortina_linhas_extras`, fase 2). `comp` é o comprimento do eixo na gravação (usado quando não é `travada`); `montante` `ID_AUSENTE`
/// = o interior do sistema.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinhaExtraLinha {
    pub cortina: u32,
    pub eixo: u8,
    pub pos: f64,
    pub travada: bool,
    pub comp: f64,
    pub montante: u32,
}

/// Segmento removido (`cortina_segmentos_removidos`, fase 2). `extra`: a linha é uma extra (`linha` é o id dela); senão, `linha` é o índice gerado na
/// gravação, com `pos_norm` e `n` para remapear. `k` e `nk`: o segmento ao longo da linha e o total; `mid`: o ponto médio normalizado.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SegmentoRemovidoLinha {
    pub cortina: u32,
    pub eixo: u8,
    pub extra: bool,
    pub linha: u32,
    pub pos_norm: f64,
    pub n: u32,
    pub k: u32,
    pub nk: u32,
    pub mid: f64,
}

/// Linha GERADA sobrescrita (`cortina_linhas_sobrescritas`, fase 2). `modo` 0 herda o montante do eixo, 1 sem montante, 2 o tipo `montante`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinhaSobrescritaLinha {
    pub cortina: u32,
    pub eixo: u8,
    pub linha: u32,
    pub pos_norm: f64,
    pub n: u32,
    pub travada: bool,
    /// `NaN` = sem posição nova.
    pub pos: f64,
    pub comp: f64,
    pub modo: u8,
    pub montante: u32,
}

/// Painel sobrescrito de uma célula (`cortina_celulas_sobrescritas`, fase 2).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CelulaSobrescritaLinha {
    pub cortina: u32,
    pub i: u32,
    pub j: u32,
    pub s: f64,
    pub z: f64,
    pub nu: u32,
    pub nv: u32,
    pub painel: u32,
}

/// Vizinhança de uma ponta da cortina (`cortina_extremidades`, fase 3; ADR §6.2 e §6.5). `vizinha` `ID_AUSENTE` = nenhuma parede no nó (a cortina termina no
/// eixo, como antes). `vizinha_cortina`: a vizinha é outra cortina (id em `vizinha`, uma cortina da seção 100); senão é uma parede comum (id do TS, só
/// informativo). `lado` (0 esquerda, 1 direita, 2 atravessa o nó) é calculado pelo TS e conferido na validação. `angulo` (rad, 0 a π) é o ângulo entre as
/// direções que SAEM do nó, uma para cada parede. `face1` e `face2` são os dois segmentos de face da vizinha (`ax, ay, bx, by`, no mundo); `espessura` a dela.
/// Flags: bit 0 = junção desligada nesta ponta (`noJoin`); bit 2 = a vizinha atravessa o nó (T). Bit 1 reservado.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ExtremidadeLinha {
    pub cortina: u32,
    pub fim: u8,
    pub vizinha: u32,
    pub vizinha_cortina: bool,
    pub lado: u8,
    pub flags: u8,
    pub angulo: f64,
    pub face1: [f64; 4],
    pub face2: [f64; 4],
    pub espessura: f64,
}

/// Esquadria numa célula (`cortina_celulas_abertura`, fase 5; ADR §7). A chave da célula (`i, j, s, z, nu, nv`) é a da seção 109. `tipo` é o `id_num` de uma linha da
/// seção 7. `grade`: o ajuste 1 (tamanho nominal do tipo, grade ajustada); senão preenche a célula. `alinhamento` (só no ajuste 1): 0 centro, 1 início, 2 fim.
/// `soleira` `NaN` = a base da região na janela e o peitoril do tipo na porta.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CelulaAberturaLinha {
    pub cortina: u32,
    pub i: u32,
    pub j: u32,
    pub s: f64,
    pub z: f64,
    pub nu: u32,
    pub nv: u32,
    pub tipo: u32,
    pub flip_mao: bool,
    pub flip_sentido: bool,
    pub grade: bool,
    pub alinhamento: u8,
    pub soleira: f64,
}

/// Cortina embutida (`cortina_hospedes`, fase 5; ADR §8). `cortina` é só informativo no kernel das paredes. `deslocamento` é o centro do vão ao longo do
/// hospedeiro a partir de `a`; `peitoril` a base do vão sobre a base do hospedeiro.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HospedeLinha {
    pub cortina: u32,
    pub hospedeiro: u32,
    pub deslocamento: f64,
    pub largura: f64,
    pub peitoril: f64,
    pub altura: f64,
}

/// Uma parede cortina (instância). `painel_padrao` = `ID_AUSENTE`: o painel do tipo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CortinaLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub z_base: f64,
    pub altura: f64,
    pub sag: f64,
    pub invertida: bool,
    pub loc: u8,
    pub flags: u8,
    pub painel_padrao: u32,
    pub hosp: u32,
}

/// Tipo de parede cortina. `montantes` na ordem dos papéis: interior vertical, interior horizontal, borda início, borda fim, borda base, borda topo,
/// canto (`ID_AUSENTE` = sem montante nesse papel).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoCortinaLinha {
    pub profundidade: f64,
    pub painel_padrao: u32,
    pub montantes: [u32; 7],
    pub prioridade: u8,
    /// `NaN` = o padrão (`CELULA_MINIMA_PADRAO`).
    pub celula_minima: f64,
    /// `NaN` = ausente (fase 4).
    pub faceta_max: f64,
    pub cadeia_grade: u8,
}

/// Um eixo da grade de um tipo (`dono` 0) ou de uma instância (`dono` 1). Na instância, os campos que ela não sobrescreve vêm com o valor de "herda":
/// `modo`, `justificacao` e `ancora` 255; `numero` `ID_AUSENTE`; os `f64`, `NaN`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GradeLinha {
    pub dono: u8,
    pub dono_num: u32,
    pub eixo: u8,
    pub modo: u8,
    pub numero: u32,
    pub distancia: f64,
    pub justificacao: u8,
    pub ancora: u8,
    pub deslocamento: f64,
    pub angulo: f64,
    pub resto_minimo: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GradePosicaoLinha {
    pub grade: u32,
    pub ordem: u32,
    pub pos: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MontanteTipoLinha {
    pub forma: u8,
    pub largura: f64,
    pub profundidade: f64,
    pub espessura: f64,
    pub largura2: f64,
    pub deslocamento: f64,
    pub posicao: u8,
    pub material: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PainelTipoLinha {
    pub tipo: u8,
    pub espessura: f64,
    pub deslocamento: f64,
    /// `NaN` = o padrão (`ENCAIXE_PADRAO`).
    pub encaixe: f64,
    pub material: u32,
    pub vidro_tipo: u8,
}

macro_rules! tabelas {
    ($($campo:ident: $ty:ty = $id:ident,)*) => {
        /// Linhas das seções da parede cortina.
        #[derive(Default)]
        pub struct SecoesCortina {
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

        impl SecoesCortina {
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
    cortinas: CortinaLinha = SECAO_CORTINAS,
    tipos: TipoCortinaLinha = SECAO_TIPOS_CORTINA,
    grades: GradeLinha = SECAO_GRADES_CORTINA,
    posicoes: GradePosicaoLinha = SECAO_GRADE_POSICOES_CORTINA,
    montantes: MontanteTipoLinha = SECAO_TIPOS_MONTANTE_CORTINA,
    paineis: PainelTipoLinha = SECAO_TIPOS_PAINEL_CORTINA,
    extras: LinhaExtraLinha = SECAO_CORTINA_LINHAS_EXTRAS,
    segmentos_removidos: SegmentoRemovidoLinha = SECAO_CORTINA_SEGMENTOS_REMOVIDOS,
    linhas_sobrescritas: LinhaSobrescritaLinha = SECAO_CORTINA_LINHAS_SOBRESCRITAS,
    celulas_sobrescritas: CelulaSobrescritaLinha = SECAO_CORTINA_CELULAS_SOBRESCRITAS,
    extremidades: ExtremidadeLinha = SECAO_CORTINA_EXTREMIDADES,
    aberturas_celula: CelulaAberturaLinha = SECAO_CORTINA_CELULAS_ABERTURA,
    hospedes: HospedeLinha = SECAO_CORTINA_HOSPEDES,
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

    /// `u8` de enum, de 0 a `max`; `herda` (se dado) também vale.
    fn e(&self, nome: &str, i: usize, max: u8, herda: Option<u8>) -> Result<u8, u32> {
        match self.coluna(nome)? {
            Coluna::U8(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x <= max || Some(x) == herda {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    fn b(&self, nome: &str, i: usize) -> Result<bool, u32> {
        Ok(self.e(nome, i, 1, None)? == 1)
    }

    fn p(&self, nx: &str, ny: &str, i: usize) -> Result<[f64; 2], u32> {
        Ok([self.d(nx, i)?, self.d(ny, i)?])
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
        SECAO_CORTINAS => Lote::cortinas(linhas!(i => CortinaLinha {
            nivel: t.u("nivel_num", i)?,
            tipo: t.u("tipo_num", i)?,
            a: t.p("ax", "ay", i)?,
            b: t.p("bx", "by", i)?,
            z_base: t.d("z_base", i)?,
            altura: t.dp("altura", i)?,
            sag: t.d("sag", i)?,
            invertida: t.b("flipped", i)?,
            loc: t.e("loc", i, 5, None)?,
            flags: t.e("flags", i, 15, None)?,
            painel_padrao: t.u("painel_padrao_num", i)?,
            hosp: t.u("hosp_num", i)?,
        })),
        SECAO_TIPOS_CORTINA => Lote::tipos(linhas!(i => TipoCortinaLinha {
            profundidade: t.dp("profundidade", i)?,
            painel_padrao: t.u("painel_padrao_num", i)?,
            montantes: [
                t.u("mont_int_v", i)?,
                t.u("mont_int_h", i)?,
                t.u("mont_borda_ini", i)?,
                t.u("mont_borda_fim", i)?,
                t.u("mont_borda_base", i)?,
                t.u("mont_borda_topo", i)?,
                t.u("mont_canto", i)?,
            ],
            prioridade: t.e("prioridade", i, PRIORIDADE_HORIZONTAL, None)?,
            celula_minima: t.dn("celula_minima", i)?,
            faceta_max: t.dn("faceta_max", i)?,
            cadeia_grade: t.e("cadeia_grade", i, 1, None)?,
        })),
        SECAO_GRADES_CORTINA => Lote::grades(linhas!(i => GradeLinha {
            dono: t.e("dono", i, 1, None)?,
            dono_num: t.u("dono_num", i)?,
            eixo: t.e("eixo", i, 1, None)?,
            modo: t.e("modo", i, MODO_MANUAL, Some(HERDA))?,
            numero: t.u("numero", i)?,
            distancia: t.dn("distancia", i)?,
            justificacao: t.e("justificacao", i, JUSTIF_FIM, Some(HERDA))?,
            ancora: t.e("ancora", i, 1, Some(HERDA))?,
            deslocamento: t.dn("deslocamento", i)?,
            angulo: t.dn("angulo", i)?,
            resto_minimo: t.dn("resto_minimo", i)?,
        })),
        SECAO_GRADE_POSICOES_CORTINA => Lote::posicoes(linhas!(i => GradePosicaoLinha {
            grade: t.u("grade_num", i)?,
            ordem: t.u("ordem", i)?,
            pos: t.d("pos", i)?,
        })),
        SECAO_TIPOS_MONTANTE_CORTINA => Lote::montantes(linhas!(i => MontanteTipoLinha {
            forma: t.e("forma", i, FORMA_CORNER, None)?,
            largura: t.dp("largura", i)?,
            profundidade: t.dp("profundidade", i)?,
            espessura: t.dp("espessura", i)?,
            largura2: t.dp("largura2", i)?,
            deslocamento: t.d("deslocamento", i)?,
            posicao: t.e("posicao", i, 1, None)?,
            material: t.u("material_num", i)?,
        })),
        SECAO_TIPOS_PAINEL_CORTINA => Lote::paineis(linhas!(i => PainelTipoLinha {
            tipo: t.e("tipo", i, PAINEL_VAZIO, None)?,
            espessura: t.dp("espessura", i)?,
            deslocamento: t.d("deslocamento", i)?,
            encaixe: t.dn("encaixe", i)?,
            material: t.u("material_num", i)?,
            vidro_tipo: t.e("vidro_tipo", i, 255, None)?,
        })),
        SECAO_CORTINA_LINHAS_EXTRAS => Lote::extras(linhas!(i => LinhaExtraLinha {
            cortina: t.u("cortina_num", i)?,
            eixo: t.e("eixo", i, EIXO_V, None)?,
            pos: t.d("pos", i)?,
            travada: t.b("travada", i)?,
            comp: t.dp("comp_gravado", i)?,
            montante: t.u("montante_num", i)?,
        })),
        SECAO_CORTINA_SEGMENTOS_REMOVIDOS => Lote::segmentos_removidos(linhas!(i => SegmentoRemovidoLinha {
            cortina: t.u("cortina_num", i)?,
            eixo: t.e("eixo", i, EIXO_V, None)?,
            extra: t.e("origem", i, 1, None)? == 1,
            linha: t.u("linha_num", i)?,
            pos_norm: t.dn("pos_norm", i)?,
            n: t.u("n", i)?,
            k: t.u("k", i)?,
            nk: t.u("nk", i)?,
            mid: t.dn("mid", i)?,
        })),
        SECAO_CORTINA_LINHAS_SOBRESCRITAS => Lote::linhas_sobrescritas(linhas!(i => LinhaSobrescritaLinha {
            cortina: t.u("cortina_num", i)?,
            eixo: t.e("eixo", i, EIXO_V, None)?,
            linha: t.u("linha_num", i)?,
            pos_norm: t.dn("pos_norm", i)?,
            n: t.u("n", i)?,
            travada: t.b("travada", i)?,
            pos: t.dn("pos", i)?,
            comp: t.dp("comp_gravado", i)?,
            modo: t.e("montante_modo", i, 2, None)?,
            montante: t.u("montante_num", i)?,
        })),
        SECAO_CORTINA_CELULAS_SOBRESCRITAS => Lote::celulas_sobrescritas(linhas!(i => CelulaSobrescritaLinha {
            cortina: t.u("cortina_num", i)?,
            i: t.u("i", i)?,
            j: t.u("j", i)?,
            s: t.d("s", i)?,
            z: t.d("z", i)?,
            nu: t.u("nu", i)?,
            nv: t.u("nv", i)?,
            painel: t.u("painel_num", i)?,
        })),
        SECAO_CORTINA_EXTREMIDADES => Lote::extremidades(linhas!(i => ExtremidadeLinha {
            cortina: t.u("cortina_num", i)?,
            fim: t.e("fim", i, 1, None)?,
            vizinha: t.u("vizinha_num", i)?,
            vizinha_cortina: t.e("vizinha_tipo", i, 1, None)? == 1,
            lado: t.e("lado", i, 2, None)?,
            flags: t.e("flags", i, 7, None)?,
            angulo: t.dn("angulo", i)?,
            face1: [t.dn("face1_ax", i)?, t.dn("face1_ay", i)?, t.dn("face1_bx", i)?, t.dn("face1_by", i)?],
            face2: [t.dn("face2_ax", i)?, t.dn("face2_ay", i)?, t.dn("face2_bx", i)?, t.dn("face2_by", i)?],
            espessura: t.dn("espessura_vizinha", i)?,
        })),
        SECAO_CORTINA_CELULAS_ABERTURA => Lote::aberturas_celula(linhas!(i => CelulaAberturaLinha {
            cortina: t.u("cortina_num", i)?,
            i: t.u("i", i)?,
            j: t.u("j", i)?,
            s: t.d("s", i)?,
            z: t.d("z", i)?,
            nu: t.u("nu", i)?,
            nv: t.u("nv", i)?,
            tipo: t.u("tipo_abertura_num", i)?,
            flip_mao: t.b("flip_mao", i)?,
            flip_sentido: t.b("flip_sentido", i)?,
            grade: t.e("ajuste", i, 1, None)? == 1,
            alinhamento: t.e("alinhamento", i, 2, None)?,
            soleira: t.dn("soleira", i)?,
        })),
        SECAO_CORTINA_HOSPEDES => Lote::hospedes(linhas!(i => HospedeLinha {
            cortina: t.u("cortina_num", i)?,
            hospedeiro: t.u("hospedeiro_num", i)?,
            deslocamento: t.d("deslocamento", i)?,
            largura: t.dp("largura", i)?,
            peitoril: t.dp("peitoril", i)?,
            altura: t.dp("altura", i)?,
        })),
        _ => return Err(ENTRADA),
    })
}

impl SecoesCortina {
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

    /// Confere as referências entre seções e os limites de defesa (ADR 0056 §6.4: `ENTRADA` para seção inconsistente, `LIMITE` para o que passa dos
    /// máximos). As consultas chamam isto antes de calcular. Sem nenhuma cortina não há nada a conferir.
    pub fn validar_referencias(&self) -> Result<(), u32> {
        if self.cortinas.is_empty() {
            return Ok(());
        }
        // Tipos: painel padrão e montantes existem.
        for t in self.tipos.values() {
            if t.profundidade <= 0.0 || !self.paineis.contains_key(&t.painel_padrao) {
                return Err(ENTRADA);
            }
            if !t.celula_minima.is_nan() && t.celula_minima <= 0.0 {
                return Err(ENTRADA);
            }
            if t.montantes.iter().any(|&m| m != ID_AUSENTE && !self.montantes.contains_key(&m)) {
                return Err(ENTRADA);
            }
        }
        // Grades: dono existe; uma linha por (dono, dono_num, eixo); posições apontam para uma grade.
        let mut vistos: BTreeSet<(u8, u32, u8)> = BTreeSet::new();
        for g in self.grades.values() {
            let existe = if g.dono == 0 { self.tipos.contains_key(&g.dono_num) } else { self.cortinas.contains_key(&g.dono_num) };
            if !existe || !vistos.insert((g.dono, g.dono_num, g.eixo)) {
                return Err(ENTRADA);
            }
        }
        let mut por_grade: BTreeMap<u32, usize> = BTreeMap::new();
        for p in self.posicoes.values() {
            if !self.grades.contains_key(&p.grade) {
                return Err(ENTRADA);
            }
            *por_grade.entry(p.grade).or_insert(0) += 1;
        }
        if por_grade.values().any(|&n| n > LIMITE_POSICOES_MANUAIS) {
            return Err(LIMITE);
        }
        // Instâncias: tipo e painel existem; todo tipo usado tem as duas grades.
        for c in self.cortinas.values() {
            if !self.tipos.contains_key(&c.tipo) || (c.painel_padrao != ID_AUSENTE && !self.paineis.contains_key(&c.painel_padrao)) {
                return Err(ENTRADA);
            }
            if !vistos.contains(&(0, c.tipo, 0)) || !vistos.contains(&(0, c.tipo, 1)) {
                return Err(ENTRADA);
            }
        }
        self.validar_sobrescritas()?;
        self.validar_extremidades()?;
        self.validar_aberturas()?;
        Ok(())
    }

    /// Fase 5: a esquadria aponta para uma cortina existente, com topologia e medidas finitas; o vão do hospedeiro tem largura e altura positivas. A existência
    /// do tipo de abertura (seção 7) e do hospedeiro (seção 1) é conferida por quem os lê, porque as seções moram em outra parte da cena.
    fn validar_aberturas(&self) -> Result<(), u32> {
        let mut por_cortina: BTreeMap<u32, usize> = BTreeMap::new();
        for a in self.aberturas_celula.values() {
            let ok = self.cortinas.contains_key(&a.cortina) && a.nu >= 1 && a.nv >= 1 && a.s.is_finite() && a.z.is_finite() && (a.soleira.is_nan() || a.soleira >= 0.0);
            if !ok {
                return Err(ENTRADA);
            }
            *por_cortina.entry(a.cortina).or_insert(0) += 1;
        }
        if por_cortina.values().any(|&n| n > LIMITE_CELULAS_SOBRESCRITAS) {
            return Err(LIMITE);
        }
        if self.hospedes.values().any(|h| h.largura <= 0.0 || h.altura <= 0.0) {
            return Err(ENTRADA);
        }
        Ok(())
    }

    /// Fase 3: cada ponta aponta para uma cortina, uma só linha por ponta; vizinha presente traz ângulo, faces e espessura finitos (e, se é cortina, uma
    /// cortina da seção 100 que não seja a própria).
    fn validar_extremidades(&self) -> Result<(), u32> {
        let mut vistas: BTreeSet<(u32, u8)> = BTreeSet::new();
        for e in self.extremidades.values() {
            if !self.cortinas.contains_key(&e.cortina) || !vistas.insert((e.cortina, e.fim)) {
                return Err(ENTRADA);
            }
            if e.vizinha == ID_AUSENTE {
                continue;
            }
            let finitos = e.angulo.is_finite() && e.espessura.is_finite() && e.face1.iter().chain(e.face2.iter()).all(|x| x.is_finite());
            if !finitos || !(0.0..=std::f64::consts::PI + 1e-9).contains(&e.angulo) || e.espessura <= 0.0 {
                return Err(ENTRADA);
            }
            if e.vizinha_cortina && (e.vizinha == e.cortina || !self.cortinas.contains_key(&e.vizinha)) {
                return Err(ENTRADA);
            }
        }
        Ok(())
    }

    /// Fase 2: cada sobrescrita aponta para uma cortina, um eixo válido e referências que existem; `LIMITE` acima dos máximos por cortina (ADR §4.3).
    fn validar_sobrescritas(&self) -> Result<(), u32> {
        let montante_ok = |m: u32| m == ID_AUSENTE || self.montantes.contains_key(&m);
        let mut contagem: BTreeMap<u32, [usize; 4]> = BTreeMap::new();
        for e in self.extras.values() {
            if !self.cortinas.contains_key(&e.cortina) || e.eixo > EIXO_V || !e.pos.is_finite() || (!e.travada && e.comp <= 0.0) || !montante_ok(e.montante) {
                return Err(ENTRADA);
            }
            contagem.entry(e.cortina).or_default()[0] += 1;
        }
        for s in self.segmentos_removidos.values() {
            if !self.cortinas.contains_key(&s.cortina) || s.eixo > EIXO_V || s.nk == 0 || s.k >= s.nk || !s.mid.is_finite() {
                return Err(ENTRADA);
            }
            if s.extra {
                if !self.extras.get(&s.linha).is_some_and(|x| x.cortina == s.cortina && x.eixo == s.eixo) {
                    return Err(ENTRADA);
                }
            } else if s.n < 2 || s.linha > s.n || !s.pos_norm.is_finite() {
                // Índice 0 ou n é a borda (remoção que só tira o montante da borda); 1 a n−1 é linha interna.
                return Err(ENTRADA);
            }
            contagem.entry(s.cortina).or_default()[1] += 1;
        }
        for s in self.linhas_sobrescritas.values() {
            if !self.cortinas.contains_key(&s.cortina) || s.eixo > EIXO_V || s.n < 2 || s.linha < 1 || s.linha >= s.n || !s.pos_norm.is_finite() {
                return Err(ENTRADA);
            }
            if s.modo > 2 || (s.modo == 2 && !self.montantes.contains_key(&s.montante)) || (!s.pos.is_nan() && !s.pos.is_finite()) {
                return Err(ENTRADA);
            }
            if s.pos.is_finite() && !s.travada && s.comp <= 0.0 {
                return Err(ENTRADA);
            }
            contagem.entry(s.cortina).or_default()[2] += 1;
        }
        for c in self.celulas_sobrescritas.values() {
            // A chave gravada pode ter índice fora da topologia gravada: o remapeamento a trata como fora da grade (ADR §4.4, passo 4).
            let ok = self.cortinas.contains_key(&c.cortina) && self.paineis.contains_key(&c.painel) && c.nu >= 1 && c.nv >= 1 && c.s.is_finite() && c.z.is_finite();
            if !ok {
                return Err(ENTRADA);
            }
            contagem.entry(c.cortina).or_default()[3] += 1;
        }
        let limites = [LIMITE_LINHAS_EXTRAS, LIMITE_SEGMENTOS_REMOVIDOS, LIMITE_LINHAS_SOBRESCRITAS, LIMITE_CELULAS_SOBRESCRITAS];
        for n in contagem.values() {
            if n.iter().zip(limites).any(|(&x, l)| x > l) {
                return Err(LIMITE);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod testes {
    use super::*;
    use crate::esquema::{bytes_coluna, Tipo};

    /// Bytes de uma seção a partir de colunas dadas por nome (as que faltam ficam zeradas). Cada coluna é preenchida a múltiplo de 8, como no codec.
    pub(crate) fn bytes(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
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
    fn toda_secao_da_cortina_tem_dono_e_decodifica_zeros_ou_recusa_com_codigo() {
        let ids: Vec<u32> = esquema::SECOES.iter().map(|s| s.id).filter(|&i| (100..=113).contains(&i)).collect();
        assert_eq!(ids, vec![100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 112, 113]);
        for id in ids {
            assert!(SecoesCortina::e_minha(id), "seção {id}");
            let mut s = SecoesCortina::default();
            assert_eq!(s.definir(id, 0, &bytes(id, 0, &[])), Ok(()), "seção {id} vazia");
            let r = s.definir(id, 1, &bytes(id, 1, &[("id_num", v(&[1.0]))]));
            assert!(r == Ok(()) || r == Err(ENTRADA), "seção {id}: {r:?}");
        }
        assert!(!SecoesCortina::e_minha(81));
        assert!(!SecoesCortina::e_minha(99));
        assert!(!SecoesCortina::e_minha(111), "a 111 é das cadeias (fase 4)");
        assert!(!SecoesCortina::e_minha(114));
    }

    #[test]
    fn ida_e_volta_de_uma_grade_de_instancia_e_de_um_montante() {
        let mut s = SecoesCortina::default();
        let b = bytes(
            SECAO_GRADES_CORTINA,
            2,
            &[
                ("id_num", v(&[9.0, 4.0])),
                ("dono", v(&[1.0, 0.0])),
                ("dono_num", v(&[30.0, 7.0])),
                ("eixo", v(&[1.0, 0.0])),
                ("modo", v(&[255.0, 1.0])),
                ("numero", v(&[ID_AUSENTE as f64, ID_AUSENTE as f64])),
                ("distancia", v(&[f64::NAN, 1.5])),
                ("justificacao", v(&[255.0, 2.0])),
                ("ancora", v(&[255.0, 255.0])),
                ("deslocamento", v(&[0.25, f64::NAN])),
                ("angulo", v(&[f64::NAN, 0.0])),
                ("resto_minimo", v(&[f64::NAN, 0.08])),
            ],
        );
        s.definir(SECAO_GRADES_CORTINA, 2, &b).expect("grades");
        assert_eq!(s.grades.keys().copied().collect::<Vec<_>>(), vec![4, 9], "ordem canônica por id");
        let g = s.grades[&4];
        assert_eq!((g.dono, g.dono_num, g.eixo, g.modo, g.justificacao, g.distancia, g.resto_minimo), (0, 7, 0, MODO_DIST_FIXA, JUSTIF_FIM, 1.5, 0.08));
        let h = s.grades[&9];
        assert_eq!((h.modo, h.numero, h.deslocamento), (HERDA, ID_AUSENTE, 0.25));
        assert!(h.distancia.is_nan());

        let b = bytes(SECAO_TIPOS_MONTANTE_CORTINA, 1, &[("id_num", v(&[2.0])), ("forma", v(&[1.0])), ("largura", v(&[0.05])), ("profundidade", v(&[0.05])), ("material_num", v(&[8.0]))]);
        s.definir(SECAO_TIPOS_MONTANTE_CORTINA, 1, &b).expect("montante");
        assert_eq!(s.montantes[&2], MontanteTipoLinha { forma: 1, largura: 0.05, profundidade: 0.05, espessura: 0.0, largura2: 0.0, deslocamento: 0.0, posicao: 0, material: 8 });
    }

    #[test]
    fn recusa_chave_ausente_duplicada_nao_finito_e_enum_fora() {
        let mut s = SecoesCortina::default();
        let ok = |ids: &[f64]| bytes(SECAO_TIPOS_PAINEL_CORTINA, ids.len(), &[("id_num", v(ids))]);
        assert_eq!(s.definir(SECAO_TIPOS_PAINEL_CORTINA, 2, &ok(&[1.0, 1.0])), Err(ENTRADA), "duplicada");
        assert_eq!(s.definir(SECAO_TIPOS_PAINEL_CORTINA, 1, &ok(&[ID_AUSENTE as f64])), Err(ENTRADA), "ausente");
        let inf = bytes(SECAO_TIPOS_PAINEL_CORTINA, 1, &[("id_num", v(&[1.0])), ("espessura", v(&[f64::INFINITY]))]);
        assert_eq!(s.definir(SECAO_TIPOS_PAINEL_CORTINA, 1, &inf), Err(ENTRADA));
        let neg = bytes(SECAO_TIPOS_PAINEL_CORTINA, 1, &[("id_num", v(&[1.0])), ("espessura", v(&[-0.01]))]);
        assert_eq!(s.definir(SECAO_TIPOS_PAINEL_CORTINA, 1, &neg), Err(ENTRADA));
        let tipo = bytes(SECAO_TIPOS_PAINEL_CORTINA, 1, &[("id_num", v(&[1.0])), ("tipo", v(&[3.0]))]);
        assert_eq!(s.definir(SECAO_TIPOS_PAINEL_CORTINA, 1, &tipo), Err(ENTRADA), "tipo de painel fora do domínio");
        let modo = bytes(SECAO_GRADES_CORTINA, 1, &[("id_num", v(&[1.0])), ("modo", v(&[4.0]))]);
        assert_eq!(s.definir(SECAO_GRADES_CORTINA, 1, &modo), Err(ENTRADA), "modo 4 não existe (255 é herda)");
        // Falha não altera a seção.
        assert!(s.paineis.is_empty() && s.grades.is_empty());
    }

    #[test]
    fn upsert_e_remover_pela_chave() {
        let mut s = SecoesCortina::default();
        let p = |ids: &[f64], esp: f64| bytes(SECAO_TIPOS_PAINEL_CORTINA, ids.len(), &[("id_num", v(ids)), ("espessura", vec![esp; ids.len()])]);
        s.definir(SECAO_TIPOS_PAINEL_CORTINA, 2, &p(&[1.0, 2.0], 0.01)).expect("definir");
        s.upsert(SECAO_TIPOS_PAINEL_CORTINA, 2, &p(&[2.0, 3.0], 0.02)).expect("upsert");
        assert_eq!(s.paineis.keys().copied().collect::<Vec<_>>(), vec![1, 2, 3]);
        assert_eq!(s.paineis[&2].espessura, 0.02);
        s.remover(SECAO_TIPOS_PAINEL_CORTINA, &[1, 99]);
        assert_eq!(s.paineis.len(), 2);
        assert_eq!(s.total_linhas(), 2);
    }

    fn cortina_nua(tipo: u32) -> CortinaLinha {
        CortinaLinha { nivel: 0, tipo, a: [0.0, 0.0], b: [3.0, 0.0], z_base: 0.0, altura: 3.0, sag: 0.0, invertida: false, loc: 0, flags: 0, painel_padrao: ID_AUSENTE, hosp: ID_AUSENTE }
    }

    #[test]
    fn extremidades_ida_e_volta_e_validacao() {
        let mut s = SecoesCortina::default();
        let n = f64::NAN;
        let b = bytes(
            SECAO_CORTINA_EXTREMIDADES,
            2,
            &[
                ("id_num", v(&[1.0, 2.0])),
                ("cortina_num", v(&[10.0, 10.0])),
                ("fim", v(&[0.0, 1.0])),
                ("vizinha_num", v(&[11.0, ID_AUSENTE as f64])),
                ("vizinha_tipo", v(&[1.0, 0.0])),
                ("lado", v(&[1.0, 0.0])),
                ("flags", v(&[4.0, 1.0])),
                ("angulo", v(&[1.5, n])),
                ("face1_ax", v(&[0.0, n])),
                ("face1_ay", v(&[0.0, n])),
                ("face1_bx", v(&[0.0, n])),
                ("face1_by", v(&[3.0, n])),
                ("face2_ax", v(&[0.2, n])),
                ("face2_ay", v(&[0.0, n])),
                ("face2_bx", v(&[0.2, n])),
                ("face2_by", v(&[3.0, n])),
                ("espessura_vizinha", v(&[0.2, n])),
            ],
        );
        s.definir(SECAO_CORTINA_EXTREMIDADES, 2, &b).expect("extremidades");
        assert_eq!(s.extremidades.keys().copied().collect::<Vec<_>>(), vec![1, 2]);
        let e = s.extremidades[&1];
        assert_eq!((e.cortina, e.fim, e.vizinha, e.vizinha_cortina, e.lado, e.flags), (10, 0, 11, true, 1, 4));
        assert_eq!(e.face2, [0.2, 0.0, 0.2, 3.0]);
        assert!(s.extremidades[&2].face1[0].is_nan() && s.extremidades[&2].flags == 1, "NaN vale onde não há vizinha");
        // Enum fora do domínio é ENTRADA e não toca na seção.
        let ruim = bytes(SECAO_CORTINA_EXTREMIDADES, 1, &[("id_num", v(&[3.0])), ("lado", v(&[3.0]))]);
        assert_eq!(s.definir(SECAO_CORTINA_EXTREMIDADES, 1, &ruim), Err(ENTRADA));
        assert_eq!(s.extremidades.len(), 2);

        // Referências: cortina existente, uma linha por ponta, vizinha cortina existente e diferente, e vizinha com ângulo, faces e espessura finitos.
        let mut s = SecoesCortina::default();
        s.cortinas.insert(10, cortina_nua(1));
        s.cortinas.insert(11, cortina_nua(1));
        let ext = |cortina: u32, fim: u8, vizinha: u32, cortina_viz: bool, angulo: f64, espessura: f64| ExtremidadeLinha {
            cortina,
            fim,
            vizinha,
            vizinha_cortina: cortina_viz,
            lado: 0,
            flags: 0,
            angulo,
            face1: [0.0, 0.0, 0.0, 1.0],
            face2: [0.1, 0.0, 0.1, 1.0],
            espessura,
        };
        let confere = |s: &SecoesCortina| s.validar_extremidades();
        s.extremidades.insert(1, ext(10, 0, 11, true, 1.0, 0.1));
        assert_eq!(confere(&s), Ok(()));
        s.extremidades.insert(2, ext(10, 0, ID_AUSENTE, false, f64::NAN, f64::NAN));
        assert_eq!(confere(&s), Err(ENTRADA), "duas linhas para a mesma ponta");
        s.extremidades.remove(&2);
        s.extremidades.insert(3, ext(99, 0, ID_AUSENTE, false, f64::NAN, f64::NAN));
        assert_eq!(confere(&s), Err(ENTRADA), "cortina inexistente");
        s.extremidades.remove(&3);
        for ruim in [ext(10, 1, 10, true, 1.0, 0.1), ext(10, 1, 77, true, 1.0, 0.1), ext(10, 1, 5, false, 4.0, 0.1), ext(10, 1, 5, false, 1.0, 0.0), ext(10, 1, 5, false, f64::NAN, 0.1)] {
            s.extremidades.insert(4, ruim);
            assert_eq!(confere(&s), Err(ENTRADA), "{ruim:?}");
        }
        s.extremidades.insert(4, ext(10, 1, 5, false, 1.0, 0.1));
        assert_eq!(confere(&s), Ok(()), "parede comum: o id é só informativo");
    }

    #[test]
    fn referencias_quebradas_sao_entrada_e_sem_cortina_nao_ha_o_que_conferir() {
        let mut s = SecoesCortina::default();
        assert_eq!(s.validar_referencias(), Ok(()));
        s.cortinas.insert(1, CortinaLinha { nivel: 0, tipo: 7, a: [0.0, 0.0], b: [3.0, 0.0], z_base: 0.0, altura: 3.0, sag: 0.0, invertida: false, loc: 0, flags: 0, painel_padrao: ID_AUSENTE, hosp: ID_AUSENTE });
        assert_eq!(s.validar_referencias(), Err(ENTRADA), "tipo inexistente");
    }
}
