# Instala ou atualiza o app Podcast e o widget do KDE Plasma (versão mais nova do GitHub).
# Uso: atualizar-podcast
function atualizar-podcast --description 'Instala ou atualiza o app Podcast e o widget do Plasma'
    set -l base https://github.com/rafaelpalvador/podcast-app/releases/latest/download
    set -l tmp (mktemp -d)

    # bibliotecas para abrir o app e tocar áudio (só instala o que faltar)
    if not pacman -Q webkit2gtk-4.1 gst-plugins-good gst-plugins-bad gst-libav >/dev/null 2>&1
        echo "Instalando bibliotecas do sistema (pede a senha uma vez)…"
        sudo pacman -S --needed --noconfirm webkit2gtk-4.1 gst-plugins-good gst-plugins-bad gst-libav
        or begin; rm -rf $tmp; return 1; end
    end

    echo "Baixando o app…"
    if not curl -fL --progress-bar -o $tmp/app.tar.gz $base/Podcast-Linux.tar.gz
        echo "Não consegui baixar. Confira a internet e tente de novo."
        rm -rf $tmp
        return 1
    end
    tar xzf $tmp/app.tar.gz -C $tmp
    and bash $tmp/Podcast-Linux/instalar.sh >/dev/null
    or begin; echo "Falha ao instalar o app."; rm -rf $tmp; return 1; end

    echo "Atualizando o widget…"
    if curl -fsL -o $tmp/widget.plasmoid $base/Podcast-Linux-widget.plasmoid
        kpackagetool6 -t Plasma/Applet -u $tmp/widget.plasmoid >/dev/null 2>&1
        or kpackagetool6 -t Plasma/Applet -i $tmp/widget.plasmoid >/dev/null 2>&1
    end

    set -l v (curl -fsL https://api.github.com/repos/rafaelpalvador/podcast-app/releases/latest | string match -r '"tag_name":\s*"([^"]+)"')[2]
    rm -rf $tmp
    echo "Pronto: Podcast $v instalado. Abra pelo menu de aplicativos."
    echo "(Se o widget já estava na área de trabalho, ele usa a versão nova depois de sair e entrar na sessão.)"
end
