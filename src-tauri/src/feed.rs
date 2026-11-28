//! Leitura de feeds RSS de podcast em Rust.
//!
//! Antes o feed (às vezes 1–5 MB de XML) era interpretado no JavaScript com DOMParser,
//! na mesma thread que desenha a interface, e cada descrição passava por outro DOMParser.
//! Agora o download e a leitura acontecem aqui, em paralelo e fora da interface, e o app
//! recebe só um JSON enxuto. Também respeitamos ETag/Last-Modified: se o feed não mudou,
//! o servidor responde 304 e nada é baixado nem processado.

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use serde::Serialize;

#[derive(Serialize, Default)]
pub struct Transcript {
    pub url: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Serialize, Default)]
pub struct Item {
    pub title: String,
    pub guid: String,
    pub url: String,
    #[serde(rename = "type")]
    pub kind: String,
    /// pubDate como veio no feed; o JS converte com Date.parse
    pub date: String,
    /// itunes:duration como veio (segundos ou hh:mm:ss)
    pub dur: String,
    pub desc: String,
    pub img: String,
    pub link: String,
    pub chapters: String,
    pub transcripts: Vec<Transcript>,
    #[serde(skip)]
    d_content: String,
    #[serde(skip)]
    d_desc: String,
    #[serde(skip)]
    d_summary: String,
}

#[derive(Serialize, Default)]
pub struct Feed {
    pub title: String,
    pub author: String,
    pub image: String,
    pub desc: String,
    pub cat: String,
    pub link: String,
    pub podroll: Vec<String>,
    pub items: Vec<Item>,
    #[serde(rename = "self")]
    pub self_url: String,
    #[serde(skip)]
    editor: String,
    #[serde(skip)]
    summary: String,
    #[serde(skip)]
    image_url: String,
    #[serde(skip)]
    atom_self: String,
}

fn attr(e: &BytesStart, key: &[u8]) -> String {
    match e.try_get_attribute(key) {
        Ok(Some(a)) => a
            .unescape_value()
            .map(|v| v.trim().to_string())
            .unwrap_or_else(|_| String::from_utf8_lossy(&a.value).trim().to_string()),
        _ => String::new(),
    }
}

/// Texto simples a partir de HTML: tira as tags, decodifica entidades e junta espaços.
pub fn strip_html(s: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(s.len().min(max_chars * 2));
    let mut in_tag = false;
    let mut tag = String::new();
    for c in s.chars() {
        if in_tag {
            if c == '>' {
                in_tag = false;
                let t = tag.trim_start_matches('/').to_ascii_lowercase();
                let name: String = t.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
                if matches!(name.as_str(), "br" | "p" | "div" | "li" | "h1" | "h2" | "h3" | "h4" | "tr") {
                    out.push('\n');
                } else {
                    out.push(' ');
                }
                tag.clear();
            } else if tag.len() < 16 {
                tag.push(c);
            }
        } else if c == '<' {
            in_tag = true;
        } else {
            out.push(c);
        }
        if out.len() > max_chars * 4 {
            break;
        }
    }
    let decoded = html_escape::decode_html_entities(&out);
    // junta espaços; no máximo uma linha em branco seguida
    let mut res = String::with_capacity(decoded.len());
    let mut space = false;
    let mut nl = 0;
    for c in decoded.chars() {
        if c == '\n' {
            nl += 1;
            space = false;
            continue;
        }
        if c.is_whitespace() {
            space = true;
            continue;
        }
        if nl > 0 && !res.is_empty() {
            res.push('\n');
        } else if space && !res.is_empty() {
            res.push(' ');
        }
        nl = 0;
        space = false;
        res.push(c);
    }
    if res.chars().count() > max_chars {
        res = res.chars().take(max_chars).collect();
    }
    res
}

fn clean(s: &str) -> String {
    let t = s.trim();
    if t.contains('&') {
        html_escape::decode_html_entities(t).trim().to_string()
    } else {
        t.to_string()
    }
}

pub fn parse(xml: &[u8], max_items: usize) -> Result<Feed, String> {
    let mut r = Reader::from_reader(xml);
    {
        let c = r.config_mut();
        c.trim_text(true);
        c.check_end_names = false;
    }
    let mut buf = Vec::new();
    let mut stack: Vec<Vec<u8>> = Vec::with_capacity(16);
    let mut feed = Feed::default();
    let mut item: Option<Item> = None;
    let mut text = String::new();
    let mut seen_channel = false;
    let mut in_podroll = false;

    loop {
        let ev = r.read_event_into(&mut buf);
        match ev {
            Ok(Event::Start(e)) => {
                let name = e.name().as_ref().to_vec();
                let parent = stack.last().map(|v| v.as_slice()).unwrap_or(b"");
                on_open(&e, &name, parent, &mut feed, &mut item, &mut in_podroll, max_items);
                if name == b"channel" {
                    seen_channel = true;
                }
                stack.push(name);
                text.clear();
            }
            Ok(Event::Empty(e)) => {
                let name = e.name().as_ref().to_vec();
                let parent = stack.last().map(|v| v.as_slice()).unwrap_or(b"");
                on_open(&e, &name, parent, &mut feed, &mut item, &mut in_podroll, max_items);
                if item.is_some() && name == b"item" {
                    // <item/> vazio: descarta
                    item = None;
                }
            }
            Ok(Event::Text(t)) => match t.unescape() {
                Ok(s) => text.push_str(&s),
                Err(_) => text.push_str(&String::from_utf8_lossy(&t)),
            },
            Ok(Event::CData(t)) => text.push_str(&String::from_utf8_lossy(&t)),
            Ok(Event::End(_)) => {
                let name = stack.pop().unwrap_or_default();
                let parent = stack.last().map(|v| v.as_slice()).unwrap_or(b"");
                on_close(&name, parent, &stack, &text, &mut feed, &mut item, &mut in_podroll, max_items);
                text.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                // XML quebrado no fim: se já temos episódios, aproveita o que deu para ler
                if feed.items.is_empty() {
                    return Err(format!("feed inválido: {}", e));
                }
                break;
            }
            _ => {}
        }
        buf.clear();
    }
    if !seen_channel {
        return Err("Esse endereço não é um feed de podcast válido".into());
    }
    if feed.image.is_empty() {
        feed.image = std::mem::take(&mut feed.image_url);
    }
    if feed.author.is_empty() {
        feed.author = std::mem::take(&mut feed.editor);
    }
    if feed.desc.is_empty() && !feed.summary.is_empty() {
        feed.desc = strip_html(&feed.summary, 800);
    }
    if feed.self_url.is_empty() {
        feed.self_url = std::mem::take(&mut feed.atom_self);
    }
    Ok(feed)
}

#[allow(clippy::too_many_arguments)]
fn on_open(e: &BytesStart, name: &[u8], parent: &[u8], feed: &mut Feed, item: &mut Option<Item>, in_podroll: &mut bool, max_items: usize) {
    if let Some(it) = item.as_mut() {
        if parent != b"item" {
            return;
        }
        match name {
            b"enclosure" => {
                if it.url.is_empty() {
                    it.url = attr(e, b"url");
                    it.kind = attr(e, b"type");
                }
            }
            b"itunes:image" => it.img = attr(e, b"href"),
            b"podcast:chapters" => it.chapters = attr(e, b"url"),
            b"podcast:transcript" => {
                let url = attr(e, b"url");
                if !url.is_empty() {
                    it.transcripts.push(Transcript { url, kind: attr(e, b"type").to_lowercase() });
                }
            }
            _ => {}
        }
        return;
    }
    match (parent, name) {
        (b"channel", b"item") => {
            if feed.items.len() < max_items {
                *item = Some(Item::default());
            }
        }
        (b"channel", b"itunes:image") => {
            if feed.image.is_empty() {
                feed.image = attr(e, b"href");
            }
        }
        (b"channel", b"itunes:category") => {
            if feed.cat.is_empty() {
                feed.cat = clean(&attr(e, b"text"));
            }
        }
        (b"channel", b"atom:link") => {
            if attr(e, b"rel") == "self" && feed.atom_self.is_empty() {
                feed.atom_self = attr(e, b"href");
            }
        }
        (b"channel", b"podcast:podroll") => *in_podroll = true,
        (b"podcast:podroll", b"podcast:remoteItem") if *in_podroll => {
            let u = attr(e, b"feedUrl");
            if !u.is_empty() {
                feed.podroll.push(u);
            }
        }
        _ => {}
    }
}

#[allow(clippy::too_many_arguments)]
fn on_close(name: &[u8], parent: &[u8], stack: &[Vec<u8>], text: &str, feed: &mut Feed, item: &mut Option<Item>, in_podroll: &mut bool, _max_items: usize) {
    if name == b"item" && parent == b"channel" {
        if let Some(mut it) = item.take() {
            if !it.url.is_empty() {
                let d = if !it.d_content.is_empty() {
                    &it.d_content
                } else if !it.d_desc.is_empty() {
                    &it.d_desc
                } else {
                    &it.d_summary
                };
                it.desc = strip_html(d, 1500);
                it.d_content = String::new();
                it.d_desc = String::new();
                it.d_summary = String::new();
                feed.items.push(it);
            }
        }
        return;
    }
    if let Some(it) = item.as_mut() {
        if parent != b"item" {
            return;
        }
        match name {
            b"title" => it.title = clean(text),
            b"guid" => it.guid = text.trim().to_string(),
            b"pubDate" => it.date = text.trim().to_string(),
            b"itunes:duration" => it.dur = text.trim().to_string(),
            b"link" => it.link = text.trim().to_string(),
            b"content:encoded" => it.d_content = text.to_string(),
            b"description" => it.d_desc = text.to_string(),
            b"itunes:summary" => it.d_summary = text.to_string(),
            _ => {}
        }
        return;
    }
    if name == b"podcast:podroll" {
        *in_podroll = false;
    }
    if parent == b"channel" {
        match name {
            b"title" => {
                if feed.title.is_empty() {
                    feed.title = clean(text)
                }
            }
            b"itunes:author" => feed.author = clean(text),
            b"managingEditor" => feed.editor = clean(text),
            b"description" => {
                if feed.desc.is_empty() {
                    feed.desc = strip_html(text, 800)
                }
            }
            b"itunes:summary" => feed.summary = text.to_string(),
            b"link" => {
                if feed.link.is_empty() {
                    feed.link = text.trim().to_string()
                }
            }
            b"itunes:new-feed-url" => feed.self_url = text.trim().to_string(),
            _ => {}
        }
    } else if name == b"url" && parent == b"image" && stack.len() >= 2 && stack[stack.len() - 2] == b"channel" {
        feed.image_url = text.trim().to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn le_feed_basico() {
        let xml = br#"<?xml version="1.0"?><rss xmlns:itunes="x" xmlns:content="y" xmlns:podcast="z"><channel>
<title>Pod &amp; Teste</title><itunes:author>Autor</itunes:author><itunes:image href="https://ex.com/i.jpg"/>
<description><![CDATA[<p>Um <b>podcast</b> &eacute; bom</p>]]></description><itunes:category text="Technology"/>
<podcast:podroll><podcast:remoteItem feedGuid="g" feedUrl="https://outro.com/f.xml"/></podcast:podroll>
<item><title>Ep 1</title><guid>g1</guid><pubDate>Mon, 01 Sep 2025 10:00:00 +0000</pubDate><itunes:duration>01:02:03</itunes:duration>
<enclosure url="https://ex.com/1.mp3" type="audio/mpeg" length="1"/><content:encoded><![CDATA[<p>Olá <a href="#">mundo</a></p><p>Linha 2</p>]]></content:encoded>
<itunes:image href="https://ex.com/e1.jpg"/><podcast:transcript url="https://ex.com/t.vtt" type="text/VTT"/></item>
<item><title>Sem áudio</title></item>
</channel></rss>"#;
        let f = parse(xml, 200).unwrap();
        assert_eq!(f.title, "Pod & Teste");
        assert_eq!(f.author, "Autor");
        assert_eq!(f.image, "https://ex.com/i.jpg");
        assert_eq!(f.desc, "Um podcast é bom");
        assert_eq!(f.cat, "Technology");
        assert_eq!(f.podroll, vec!["https://outro.com/f.xml"]);
        assert_eq!(f.items.len(), 1);
        let it = &f.items[0];
        assert_eq!(it.url, "https://ex.com/1.mp3");
        assert_eq!(it.dur, "01:02:03");
        assert_eq!(it.desc, "Olá mundo\nLinha 2");
        assert_eq!(it.transcripts[0].kind, "text/vtt");
    }
}
