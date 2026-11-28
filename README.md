<p align="center"><img src="assets/logo/podcast-icon-dark.svg" width="96" alt="Logo do Podcast"></p>

<h1 align="center">Podcast</h1>

<p align="center">App de podcast pessoal, local-first, para <b>Android</b> e <b>Windows 11</b>, com sincronização opcional pelo GitHub e sem servidor próprio.</p>

---

## Baixar

Links fixos, sempre a versão mais nova:

- **Android:** [Podcast-Android.apk](https://github.com/rafaelpalvador/podcast-app/releases/latest/download/Podcast-Android.apk). No **Obtainium**, adicione o endereço deste repositório para receber as atualizações sozinho.
- **Windows 11:** [Podcast-Windows-instalador.exe](https://github.com/rafaelpalvador/podcast-app/releases/latest/download/Podcast-Windows-instalador.exe)
- **Linux (app):** [Podcast-Linux.AppImage](https://github.com/rafaelpalvador/podcast-app/releases/latest/download/Podcast-Linux.AppImage) para qualquer distro, ou [Podcast-Linux.tar.gz](https://github.com/rafaelpalvador/podcast-app/releases/latest/download/Podcast-Linux.tar.gz) para Arch/CachyOS (também há `.deb` e `.rpm` na página da versão). Veja *App para Linux* abaixo.
- **Linux (widget do KDE Plasma 6):** [Podcast-Linux-widget.plasmoid](https://github.com/rafaelpalvador/podcast-app/releases/latest/download/Podcast-Linux-widget.plasmoid). Veja *Widget para Linux* abaixo.

Cada envio para o branch `main` compila de novo os dois (GitHub Actions) e substitui a versão em *Releases*.

## Sincronização (opcional, pelo GitHub)

Não há login com Google. Para deixar o celular e o PC iguais, o app usa um **gist secreto** na sua conta do GitHub:

1. Em **Ajustes → Sincronizar pelo GitHub → Conectar**, toque em **Criar token no GitHub**. O link já abre com só a permissão `gist` marcada; em *Expiration*, escolha *No expiration*.
2. Copie o token, cole no app e conecte. Repita no outro aparelho.

O app cria o gist `podcast-dados.json` na primeira vez e depois sincroniza sozinho (ao sair do app e uns segundos depois de cada mudança). O token fica só no aparelho e não dá acesso aos seus repositórios. Sem conectar, o app funciona normalmente, só no aparelho.

## App para Linux

O mesmo app do celular e do Windows, com a mesma sincronização pelo GitHub.

**AppImage (qualquer distro):** baixe, dê permissão e abra. Já vem com o que precisa para tocar áudio.

```
chmod +x ~/Downloads/Podcast-Linux.AppImage
~/Downloads/Podcast-Linux.AppImage
```

No Arch/CachyOS, se o AppImage não abrir, instale o `fuse2` (`sudo pacman -S fuse2`).

**Arch/CachyOS (.tar.gz, mais leve, usa as bibliotecas do sistema):**

```
sudo pacman -S --needed webkit2gtk-4.1 gst-plugins-good gst-plugins-bad gst-libav
tar xzf ~/Downloads/Podcast-Linux.tar.gz -C ~/Downloads
bash ~/Downloads/Podcast-Linux/instalar.sh
```

Ele aparece no menu de aplicativos como **Podcast**. Para atualizar, repita os dois últimos comandos com o arquivo novo; para remover, `bash ~/Downloads/Podcast-Linux/desinstalar.sh`.

## Widget para Linux (KDE Plasma 6)

Um widget de área de trabalho com o visual do app (fundo preto, capa, cor âmbar) que lê o mesmo gist do GitHub. Mostra o episódio para continuar, toca o áudio ali mesmo, tem progresso clicável, voltar/avançar, velocidade e a fila. Quando você para de ouvir, a posição volta para o gist, e o celular continua de onde parou.

O layout se adapta ao tamanho: pequeno mostra só a capa com o play; médio vira um cartão com controles; largo põe a capa ao lado e, com altura, aparece a fila. No painel ele vira um ícone.

Instalar (no terminal, também funciona no fish):

```
kpackagetool6 -t Plasma/Applet -i ~/Downloads/Podcast-Linux-widget.plasmoid
```

Para atualizar, troque `-i` por `-u`. Depois: clique com o botão direito na área de trabalho → *Adicionar widgets* → **Podcast**, e em *Configurar* cole o token do GitHub (o mesmo do app). Precisa do pacote `qt6-multimedia` (no CachyOS/Arch: `sudo pacman -S qt6-multimedia`, se ainda não estiver instalado).

## O que já funciona (versão 0.1)

- Página do podcast com informações do programa (frequência, duração média, quanto você ouviu) e sua nota em estrelas
- Busca (iTunes), seguir por link RSS, importar XML de podcasts (lista OPML de outro app ou o RSS de um podcast) e exportar OPML
- Caixa de entrada, fila, pastas e playlists inteligentes
- Player com velocidade por podcast, pular início e final, capítulos, transcrição (quando o podcast publica), timer de sono e controles na tela de bloqueio
- Downloads para ouvir offline
- Momentos salvos com exportação em Markdown
- Estatísticas (quando, o que e de quem você ouviu, tempo economizado) e sugestões por categoria
- Sincronização opcional entre celular e PC por um gist secreto do GitHub

- **Android:** player nativo com notificação de mídia, controles na tela bloqueada, na cápsula do Honor e no fone; 3 widgets (player, mini player, semana e caixa de entrada) e atalhos ao segurar o ícone

**Ainda não:** cortar silêncio e realçar voz (próximas versões).

## Design

- Design interativo (canvas): https://claude.ai/artifact/KYZm2xfbXYqwUYVRbq3Hqg
- Fontes do design: [`design/`](design/)
- Logo em SVG: [`assets/logo/`](assets/logo/)

## Ideia

Um app só, com a mesma interface no celular e no PC. Abaixo de 900 px de largura ele vira layout de celular (abas embaixo e mini player). Acima disso, mostra barra lateral e player completo.

Seus dados (inscrições, fila, progresso, momentos salvos, estatísticas e ajustes) ficam no aparelho. Se quiser, eles também vão para um gist secreto na **sua** conta do GitHub para sincronizar. Não existe servidor no meio.

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
- **Sync:** GitHub Gists API (gist secreto, token só com a permissão `gist`)
- **Importar/exportar:** OPML

## Estrutura

```
src/                 interface do app (HTML, CSS e JavaScript, sem etapa de build)
src-tauri/           parte nativa em Rust (rede, downloads, arquivos)
.github/workflows/   compilação do APK e do instalador do Windows
android-assinatura/  chave que assina o APK
assets/logo/         logo em SVG
design/              fontes do design (.dc.html) e layout do canvas
linux-widget/        widget do KDE Plasma 6 (QML)
```

Os arquivos `.dc.html` são o formato do editor de design onde o projeto foi criado. Para ver e mexer, use o link do canvas acima.

Os nomes de podcasts e os números que aparecem no design são exemplos fictícios.
