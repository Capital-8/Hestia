//! Suplementos em desenvolvimento: leitura de uma PASTA com `manifest.json` (docs/plugins/08 §8).
//!
//! Mesmo estilo de `biblioteca.rs`: o usuário escolhe a pasta pelo seletor do sistema e este módulo só lê dentro dela.
//! Nada é executado aqui; a web valida o conteúdo (mesmas regras do `.hestiapkg`) com os mesmos limites. Aqui os limites
//! também valem, para não carregar a memória com uma pasta enorme: até 200 arquivos, 8 MiB por arquivo, 16 MiB no total
//! (bytes), profundidade de pasta até 8, links simbólicos ignorados.

use std::fs;
use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MAX_ARQUIVOS: usize = 200;
const MAX_BYTES_ARQUIVO: u64 = 8 * 1024 * 1024;
const MAX_BYTES_TOTAL: u64 = 16 * 1024 * 1024;
const MAX_PROFUNDIDADE: usize = 8;

/// Arquivo da pasta: caminho relativo com `/` e conteúdo em bytes.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ArquivoSuplemento {
    caminho: String,
    bytes: Vec<u8>,
}

/// Lê a pasta recursivamente com os limites acima. Erro claro ao passar de qualquer um deles.
fn ler_pasta(raiz: &Path) -> Result<Vec<ArquivoSuplemento>, String> {
    if !raiz.is_dir() {
        return Err("a escolha não é uma pasta".into());
    }
    if !raiz.join("manifest.json").is_file() {
        return Err("manifest.json não encontrado na raiz da pasta".into());
    }
    let mut saida = Vec::new();
    let mut total: u64 = 0;
    visitar(raiz, raiz, 0, &mut saida, &mut total)?;
    Ok(saida)
}

fn visitar(
    raiz: &Path,
    dir: &Path,
    nivel: usize,
    saida: &mut Vec<ArquivoSuplemento>,
    total: &mut u64,
) -> Result<(), String> {
    if nivel > MAX_PROFUNDIDADE {
        return Err("pastas aninhadas demais".into());
    }
    let mut itens: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("não foi possível ler {}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .collect();
    itens.sort_by_key(|i| i.file_name());
    for item in itens {
        let caminho = item.path();
        // `symlink_metadata` não segue links: um link para fora da pasta é simplesmente ignorado.
        let meta = fs::symlink_metadata(&caminho)
            .map_err(|e| format!("não foi possível ler {}: {e}", caminho.display()))?;
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            visitar(raiz, &caminho, nivel + 1, saida, total)?;
        } else if meta.is_file() {
            if saida.len() >= MAX_ARQUIVOS {
                return Err(format!("mais de {MAX_ARQUIVOS} arquivos"));
            }
            if meta.len() > MAX_BYTES_ARQUIVO {
                return Err(format!("arquivo grande demais: {}", caminho.display()));
            }
            *total += meta.len();
            if *total > MAX_BYTES_TOTAL {
                return Err("conteúdo da pasta grande demais".into());
            }
            let relativo = caminho
                .strip_prefix(raiz)
                .map_err(|_| "caminho fora da pasta".to_string())?
                .components()
                .map(|c| c.as_os_str().to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join("/");
            let bytes = fs::read(&caminho)
                .map_err(|e| format!("não foi possível ler {}: {e}", caminho.display()))?;
            saida.push(ArquivoSuplemento {
                caminho: relativo,
                bytes,
            });
        }
    }
    Ok(())
}

/// Abre o seletor de pasta e devolve os arquivos do suplemento em desenvolvimento (ou `None` se o usuário cancelar).
#[tauri::command]
pub async fn suplementos_ler_pasta(app: AppHandle) -> Result<Option<Vec<ArquivoSuplemento>>, String> {
    let escolhida = tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
        .await
        .map_err(|e| format!("seletor de pastas falhou: {e}"))?;
    let Some(arquivo) = escolhida else {
        return Ok(None);
    };
    let caminho = arquivo
        .into_path()
        .map_err(|e| format!("caminho inválido: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || ler_pasta(&caminho).map(Some))
        .await
        .map_err(|e| format!("leitura falhou: {e}"))?
}

#[cfg(test)]
mod testes {
    use super::*;

    fn pasta_temp(nome: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("hestia-sup-{nome}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn le_pasta_com_manifesto_e_subpasta() {
        let d = pasta_temp("ok");
        fs::write(d.join("manifest.json"), b"{}").unwrap();
        fs::create_dir_all(d.join("data")).unwrap();
        fs::write(d.join("data").join("a.json"), b"[]").unwrap();
        let arqs = ler_pasta(&d).unwrap();
        let nomes: Vec<_> = arqs.iter().map(|a| a.caminho.as_str()).collect();
        assert_eq!(nomes, vec!["data/a.json", "manifest.json"]);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn recusa_pasta_sem_manifesto() {
        let d = pasta_temp("sem");
        assert!(ler_pasta(&d).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn recusa_arquivo_acima_do_limite() {
        let d = pasta_temp("grande");
        fs::write(d.join("manifest.json"), b"{}").unwrap();
        fs::write(d.join("x.json"), vec![0u8; (MAX_BYTES_ARQUIVO + 1) as usize]).unwrap();
        assert!(ler_pasta(&d).unwrap_err().contains("grande demais"));
        let _ = fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn ignora_link_simbolico() {
        let d = pasta_temp("link");
        fs::write(d.join("manifest.json"), b"{}").unwrap();
        std::os::unix::fs::symlink("/etc/hostname", d.join("segredo.txt")).unwrap();
        let arqs = ler_pasta(&d).unwrap();
        assert_eq!(arqs.len(), 1);
        let _ = fs::remove_dir_all(&d);
    }
}
