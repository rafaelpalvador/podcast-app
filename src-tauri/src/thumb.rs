//! Miniaturas das capas (protocolo `thumb:`).
//!
//! Muitos feeds publicam a capa em 3000×3000. Mostrar isso numa lista de 48 px obriga o
//! WebView a baixar megabytes e decodificar ~36 MB de pixels por capa, o que trava a rolagem
//! e enche a memória no celular. Aqui a capa é baixada uma vez, recortada em quadrado,
//! reduzida para o tamanho pedido e guardada em disco como JPEG pequeno.

use std::{fs, path::PathBuf, sync::OnceLock};
use tauri::{http, Manager, Runtime};
use tokio::sync::Semaphore;

fn sem() -> &'static Semaphore {
    static S: OnceLock<Semaphore> = OnceLock::new();
    S.get_or_init(|| Semaphore::new(4))
}

fn fnv(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

fn cache_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let d = app.path().app_cache_dir().ok()?.join("capas");
    fs::create_dir_all(&d).ok()?;
    Some(d)
}

fn reply(status: u16, ctype: &str, body: Vec<u8>) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Content-Type", ctype)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

fn shrink(bytes: &[u8], size: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?;
    let (w, h) = (img.width(), img.height());
    if w == 0 || h == 0 {
        return None;
    }
    let m = w.min(h);
    let sq = if w != h { img.crop_imm((w - m) / 2, (h - m) / 2, m, m) } else { img };
    let t = if m > size { sq.thumbnail_exact(size, size) } else { sq };
    let rgb = t.to_rgb8();
    let mut out = Vec::with_capacity(16 * 1024);
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 84);
    enc.encode_image(&rgb).ok()?;
    Some(out)
}

/// `thumb://localhost/<url codificada>?s=<px>` (ou `http://thumb.localhost/...` no Android/Windows)
pub async fn handle<R: Runtime>(app: tauri::AppHandle<R>, uri: String) -> http::Response<Vec<u8>> {
    let parsed: http::Uri = match uri.parse() {
        Ok(u) => u,
        Err(_) => return reply(400, "text/plain", Vec::new()),
    };
    let raw = parsed.path().trim_start_matches('/');
    let src = percent_encoding::percent_decode_str(raw).decode_utf8_lossy().to_string();
    if !(src.starts_with("http://") || src.starts_with("https://")) {
        return reply(400, "text/plain", Vec::new());
    }
    let size: u32 = parsed
        .query()
        .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("s=")))
        .and_then(|v| v.parse().ok())
        .unwrap_or(256)
        .clamp(32, 1024);

    let file = cache_dir(&app).map(|d| d.join(format!("{}_{}.jpg", fnv(&src), size)));
    if let Some(f) = &file {
        if let Ok(b) = fs::read(f) {
            return reply(200, "image/jpeg", b);
        }
    }

    let _permit = sem().acquire().await.ok();
    // outro pedido igual pode ter terminado enquanto esperávamos
    if let Some(f) = &file {
        if let Ok(b) = fs::read(f) {
            return reply(200, "image/jpeg", b);
        }
    }
    let rs = match crate::net().get(&src).timeout(std::time::Duration::from_secs(30)).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return reply(404, "text/plain", Vec::new()),
    };
    let ctype = rs
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = match rs.bytes().await {
        Ok(b) => b.to_vec(),
        Err(_) => return reply(404, "text/plain", Vec::new()),
    };
    let work = bytes.clone();
    let small = tauri::async_runtime::spawn_blocking(move || shrink(&work, size)).await.ok().flatten();
    match small {
        Some(out) => {
            if let Some(f) = &file {
                let tmp = f.with_extension("part");
                if fs::write(&tmp, &out).is_ok() {
                    let _ = fs::rename(&tmp, f);
                }
            }
            reply(200, "image/jpeg", out)
        }
        // formato que não sabemos reduzir (gif, avif…): entrega o original
        None => reply(200, &ctype, bytes),
    }
}
