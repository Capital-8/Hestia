//! Casca desktop do Hestia: abre a janela com o app web já gerado em
//! `apps/web/dist` e verifica atualizações pelo GitHub Releases.

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Copy)]
enum Idioma {
    Portugues,
    Ingles,
}

/// Idioma do sistema. Português é o padrão; inglês só quando o sistema é inglês.
fn idioma_do_sistema() -> Idioma {
    match sys_locale::get_locale() {
        Some(locale) if locale.to_ascii_lowercase().starts_with("en") => Idioma::Ingles,
        _ => Idioma::Portugues,
    }
}

fn pergunta_de_atualizacao(idioma: Idioma, versao: &str) -> String {
    match idioma {
        Idioma::Portugues => format!("Há uma nova versão do Hestia ({versao}). Atualizar agora?"),
        Idioma::Ingles => format!("A new version of Hestia ({versao}) is available. Update now?"),
    }
}

fn rotulos_dos_botoes(idioma: Idioma) -> (String, String) {
    match idioma {
        Idioma::Portugues => ("Atualizar".to_string(), "Depois".to_string()),
        Idioma::Ingles => ("Update".to_string(), "Later".to_string()),
    }
}

/// Verificação de atualização em segundo plano. Qualquer falha (sem rede,
/// assinatura inválida, endpoint fora do ar) vira uma linha no log de erros
/// e o app segue normalmente, sem diálogo.
async fn verificar_atualizacao(app: AppHandle) {
    if let Err(erro) = verificar_e_instalar(app).await {
        eprintln!("[atualizador] {erro}");
    }
}

async fn verificar_e_instalar(app: AppHandle) -> Result<(), String> {
    let atualizador = app
        .updater()
        .map_err(|e| format!("atualizador indisponível: {e}"))?;

    let Some(atualizacao) = atualizador
        .check()
        .await
        .map_err(|e| format!("falha ao verificar atualização: {e}"))?
    else {
        return Ok(());
    };

    let idioma = idioma_do_sistema();
    let versao = atualizacao.version.clone();
    let (atualizar, depois) = rotulos_dos_botoes(idioma);
    let pergunta = pergunta_de_atualizacao(idioma, &versao);

    let dialogo = app
        .dialog()
        .message(pergunta)
        .title("Hestia")
        .buttons(MessageDialogButtons::OkCancelCustom(atualizar, depois));

    // O diálogo bloqueia a thread até a resposta: roda fora do runtime assíncrono.
    let aceitou = tauri::async_runtime::spawn_blocking(move || dialogo.blocking_show())
        .await
        .map_err(|e| format!("diálogo de atualização falhou: {e}"))?;

    if !aceitou {
        return Ok(());
    }

    atualizacao
        .download_and_install(|_bytes, _total| {}, || {})
        .await
        .map_err(|e| format!("falha ao baixar ou instalar a atualização: {e}"))?;

    // O plugin de processo expõe reinício por `restart`; no Tauri 2.4 o reinício
    // ordenado é `request_restart` (o mesmo que o comando do plugin usa).
    app.request_restart();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            // Não bloqueia a abertura da janela.
            tauri::async_runtime::spawn(verificar_atualizacao(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Hestia");
}
