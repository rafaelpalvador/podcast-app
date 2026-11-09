use serde::Serialize;
use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::Manager;

// ---------- HTTP sem limites de CORS (feeds RSS, busca, Google) ----------
#[derive(Serialize)]
struct HttpOut {
    status: u16,
    body: String,
    headers: BTreeMap<String, String>,
}

fn client(secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(secs))
        .user_agent("PodcastApp/0.1 (app pessoal; +https://github.com/rafaelpalvador/podcast-app)")
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn http_req(
    method: String,
    url: String,
    headers: BTreeMap<String, String>,
    body: Option<String>,
) -> Result<HttpOut, String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut rq = client(60)?.request(m, &url);
    for (k, v) in headers.iter() {
        rq = rq.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        rq = rq.body(b64.decode(b).map_err(|e| e.to_string())?);
    }
    let rs = rq.send().await.map_err(|e| e.to_string())?;
    let status = rs.status().as_u16();
    let mut hs = BTreeMap::new();
    for (k, v) in rs.headers().iter() {
        if let Ok(s) = v.to_str() {
            hs.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let bytes = rs.bytes().await.map_err(|e| e.to_string())?;
    Ok(HttpOut { status, body: b64.encode(&bytes), headers: hs })
}

// ---------- Downloads de episódios ----------
fn dl_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("episodios");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn safe_name(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.').collect()
}

#[tauri::command]
async fn download_episode(app: tauri::AppHandle, url: String, name: String) -> Result<String, String> {
    let dir = dl_dir(&app)?;
    let path = dir.join(safe_name(&name));
    let rs = client(1800)?.get(&url).send().await.map_err(|e| e.to_string())?;
    if !rs.status().is_success() {
        return Err(format!("erro {}", rs.status().as_u16()));
    }
    let bytes = rs.bytes().await.map_err(|e| e.to_string())?;
    let tmp = path.with_extension("part");
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_download(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let p = dl_dir(&app)?.join(safe_name(&name));
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn download_path(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let p = dl_dir(&app)?.join(safe_name(&name));
    Ok(if p.exists() { Some(p.to_string_lossy().to_string()) } else { None })
}

#[tauri::command]
fn downloads_size(app: tauri::AppHandle) -> Result<u64, String> {
    let mut total = 0u64;
    if let Ok(rd) = fs::read_dir(dl_dir(&app)?) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    Ok(total)
}

// ---------- Salvar arquivo de texto (OPML, momentos em Markdown) ----------
#[tauri::command]
fn save_text(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(safe_name(&name));
    fs::write(&p, text).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

// ---------- Login do Google (OAuth com retorno para 127.0.0.1) ----------
mod oauth {
    use std::{sync::Mutex, time::Duration};
    pub static RESULT: Mutex<Option<String>> = Mutex::new(None);
    pub fn listen() -> Result<u16, String> {
        let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("sem porta")?;
        if let Ok(mut r) = RESULT.lock() {
            *r = None;
        }
        std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(600);
            while std::time::Instant::now() < deadline {
                let rq = match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(r)) => r,
                    Ok(None) => continue,
                    Err(_) => break,
                };
                let url = rq.url().to_string();
                if !url.contains("code=") && !url.contains("error=") {
                    let _ = rq.respond(tiny_http::Response::from_string("").with_status_code(404));
                    continue;
                }
                let html = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='font-family:system-ui;text-align:center;padding:48px 20px;background:#0C0D10;color:#F3F4F6'><h2>Pronto!</h2><p>Você entrou com o Google. Pode fechar esta aba e voltar ao <b>Podcast</b>.</p></body>";
                let mut resp = tiny_http::Response::from_string(html);
                if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]) {
                    resp.add_header(h);
                }
                let _ = rq.respond(resp);
                if let Ok(mut r) = RESULT.lock() {
                    *r = Some(url);
                }
                break;
            }
        });
        Ok(port)
    }
}

#[tauri::command]
fn oauth_listen() -> Result<u16, String> {
    oauth::listen()
}

#[tauri::command]
fn oauth_poll() -> Option<String> {
    oauth::RESULT.lock().ok().and_then(|mut r| r.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            http_req,
            download_episode,
            delete_download,
            download_path,
            downloads_size,
            save_text,
            oauth_listen,
            oauth_poll
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app");
}
