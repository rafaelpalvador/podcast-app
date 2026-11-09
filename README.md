<p align="center"><img src="assets/logo/podcast-icon-dark.svg" width="96" alt="Logo do Podcast"></p>

<h1 align="center">Podcast</h1>

<p align="center">App de podcast pessoal, local-first, para <b>Android</b> e <b>Windows 11</b>, com sincronização pelo Google Drive e sem servidor próprio.</p>

---

## Status

**Fase de design.** Este repositório tem, por enquanto, o design aprovado e o logo. O código do app vem na próxima etapa.

- Design interativo (canvas): https://claude.ai/artifact/KYZm2xfbXYqwUYVRbq3Hqg
- Fontes do design: [`design/`](design/)
- Logo em SVG: [`assets/logo/`](assets/logo/)

## Ideia

Um app só, com a mesma interface no celular e no PC. Abaixo de 900 px de largura ele vira layout de celular (abas embaixo e mini player). Acima disso, mostra barra lateral e player completo.

Seus dados (inscrições, fila, progresso, momentos salvos, estatísticas e ajustes) ficam numa pasta privada do app no **seu** Google Drive (`appDataFolder`). Não existe servidor no meio, e o app também funciona sem conta, só no aparelho.

## Telas

| Aba | O que tem |
|---|---|
| **Início** | Continuar ouvindo, caixa de entrada (triagem de episódios novos), fila e momentos salvos |
| **Biblioteca** | Pastas, playlists inteligentes (por regras), inscrições e página de cada podcast com ajustes próprios |
| **Descobrir** | Busca, sugestões baseadas no que você ouve, episódios recomendados, ranking por categoria, indicações dos criadores (`podcast:podroll`) e convidados que você curte |
| **Estatísticas** | Tempo ouvindo, tempo economizado, mapa de calor dia × horário, o que e de quem você ouviu, retrospectiva anual |
| **Ajustes** | 12 grupos: reprodução, caixa de entrada, momentos, transcrições, downloads, vídeo, feeds, sincronização, notificações, aparência, carro e atalhos, privacidade |
| **Player** | Capítulos, transcrição com toque para pular, momentos, notas, velocidade, cortar silêncio, realçar voz, mono, timer de sono |

## Recursos inspirados em outros apps

| Recurso | Inspiração |
|---|---|
| Caixa de entrada para triar episódios novos | Castro |
| Cortar silêncio, realçar voz, contador de tempo economizado, pular intro e final por podcast | Overcast |
| Pastas e playlists inteligentes | Pocket Casts |
| Salvar momentos (inclusive pelo fone) e exportar em Markdown | Snipd |
| Transcrição com busca e toque para pular | Apple Podcasts |
| Capítulos e podcasts em vídeo | Spotify |
| Retrospectiva anual gerada no aparelho | AntennaPod (Echo) |

## Widgets e atalhos

- **Widgets Android:** mini player 2×1, capa 2×2, player 4×2, estatísticas 2×2, fila e caixa de entrada 4×4, salvar momento 4×1, momento do dia 4×2 e próximo episódio 2×2
- **Atalhos ao segurar o ícone:** continuar ouvindo, caixa de entrada, salvar momento, timer de sono e buscar
- **Windows 11:** os mesmos atalhos no menu do ícone na barra de tarefas, além de um mini player sempre visível

## Stack planejada

- **App:** [Tauri 2](https://tauri.app), uma base de código para Android e Windows
- **Busca e catálogo:** [Podcast Index API](https://podcastindex.org) e iTunes Search API
- **Sync:** Google Drive API (`appDataFolder`), login com Google via OAuth
- **Importar/exportar:** OPML

## Estrutura

```
assets/logo/   logo em SVG (escuro, âmbar, monocromático, símbolo e versão de 16 px)
design/        fontes do design (.dc.html) e layout do canvas
```

Os arquivos `.dc.html` são o formato do editor de design onde o projeto foi criado. Para ver e mexer, use o link do canvas acima.

Os nomes de podcasts e os números que aparecem no design são exemplos fictícios.
