/*
 * Podcast — widget para o KDE Plasma 6.
 * Lê e grava o mesmo gist secreto (podcast-dados.json) que o app usa para sincronizar.
 * Mostra o episódio para continuar, controles e a fila; toca o áudio aqui mesmo.
 * O layout se adapta ao tamanho: capa cheia (pequeno), cartão (médio), capa ao lado + fila (largo).
 */
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import QtQuick.Effects
import QtMultimedia
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    // ------------------------------------------------------------ visual do app
    readonly property color acc: "#F5B544"
    readonly property color tx: "#FFFFFF"
    readonly property color tx2: Qt.rgba(235/255, 235/255, 245/255, 0.62)
    readonly property color tx3: Qt.rgba(235/255, 235/255, 245/255, 0.38)
    readonly property color grp: "#141416"
    readonly property color sep: Qt.rgba(1, 1, 1, 0.09)
    readonly property string fam: "Inter"

    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: Plasmoid.formFactor === PlasmaCore.Types.Planar ? fullRepresentation : compactRepresentation
    switchWidth: Kirigami.Units.gridUnit * 6
    switchHeight: Kirigami.Units.gridUnit * 5
    toolTipMainText: shownId ? epTitle(shownId) : "Podcast"
    toolTipSubText: shownId ? showTitle(shownId) : (token ? "Nada para continuar" : "Configure o token do GitHub")

    // ------------------------------------------------------------ dados (gist)
    readonly property string token: (Plasmoid.configuration.token || "").trim()
    readonly property string fileName: "podcast-dados.json"
    property var db: null
    property string gid: ""
    property string err: ""
    property bool busy: false
    property double lastSync: 0
    property var pending: []
    property bool pushing: false

    function api(method, path, body, cb) {
        var x = new XMLHttpRequest();
        x.open(method, path.indexOf("http") === 0 ? path : "https://api.github.com" + path);
        x.setRequestHeader("Authorization", "Bearer " + token);
        x.setRequestHeader("Accept", "application/vnd.github+json");
        x.setRequestHeader("X-GitHub-Api-Version", "2022-11-28");
        if (body !== null && body !== undefined) x.setRequestHeader("Content-Type", "application/json");
        x.onreadystatechange = function() {
            if (x.readyState !== XMLHttpRequest.DONE) return;
            if (x.status === 401) { err = "Token inválido ou expirado"; busy = false; pushing = false; return; }
            cb(x.status, x.responseText);
        };
        x.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
    }

    function findGist(cb) {
        if (gid) { cb(gid); return; }
        api("GET", "/gists?per_page=100", null, function(st, txt) {
            if (st !== 200) { fail("GitHub respondeu " + st); return; }
            var L = []; try { L = JSON.parse(txt); } catch (e) { }
            for (var i = 0; i < L.length; i++) if (L[i].files && L[i].files[fileName]) { gid = L[i].id; break; }
            if (!gid) { fail("Ainda não há dados. Conecte o GitHub no app primeiro."); return; }
            cb(gid);
        });
    }

    function fail(m) { err = m; busy = false; pushing = false; }

    // Lê o gist; cb(d) recebe os dados frescos
    function read(cb) {
        if (!token) return;
        busy = true;
        findGist(function(id) {
            api("GET", "/gists/" + id, null, function(st, txt) {
                if (st === 404) { gid = ""; fail("O gist sumiu; sincronize o app de novo"); return; }
                if (st !== 200) { fail("Leitura falhou (" + st + ")"); return; }
                var f = null; try { f = JSON.parse(txt).files[fileName]; } catch (e) { }
                if (!f) { fail("Arquivo não encontrado no gist"); return; }
                var done = function(content) {
                    var d = null; try { d = JSON.parse(content || "{}"); } catch (e) { fail("Dados ilegíveis"); return; }
                    err = ""; busy = false; lastSync = Date.now();
                    cb(d);
                };
                if (f.truncated) api("GET", f.raw_url, null, function(s2, t2) { if (s2 === 200) done(t2); else fail("Leitura falhou (" + s2 + ")"); });
                else done(f.content);
            });
        });
    }

    function pull() { if (!pushing) read(function(d) { db = d; }); }

    // Grava uma mudança: lê de novo, aplica e envia (o app junta pelo horário de cada item)
    function push(mutate) {
        if (!token) return;
        pending.push(mutate);
        if (!pushing) drain();
    }
    function drain() {
        if (!pending.length) { pushing = false; return; }
        pushing = true;
        var batch = pending; pending = [];
        read(function(d) {
            for (var i = 0; i < batch.length; i++) batch[i](d);
            var files = {}; files[fileName] = { content: JSON.stringify(d) };
            api("PATCH", "/gists/" + gid, { files: files }, function(st) {
                if (st >= 300) err = "Envio falhou (" + st + ")";
                db = d; lastSync = Date.now();
                drain();
            });
        });
    }

    Timer {
        interval: Math.max(1, Plasmoid.configuration.interval || 5) * 60000
        running: root.token !== ""
        repeat: true
        triggeredOnStart: true
        onTriggered: root.pull()
    }
    onTokenChanged: { gid = ""; err = ""; db = null; if (token) pull(); }

    // ------------------------------------------------------------ consultas
    function ep(id) { return db && db.eps ? db.eps[id] : null; }
    function sub(id) { var e = ep(id); return e && db.subs ? db.subs[e.feed] : null; }
    function epTitle(id) { var e = ep(id); return e ? e.title : ""; }
    function showTitle(id) { var s = sub(id); return s ? s.title : ""; }
    function art(id) { var e = ep(id), s = sub(id); return (e && e.img) || (s && s.image) || ""; }
    function prog(id) { return db && db.prog ? db.prog[id] : null; }
    function durOf(id) { var p = prog(id), e = ep(id); return (p && p.dur > 0 ? p.dur : 0) || (e && e.dur) || 0; }
    function savedPos(id) { var p = prog(id); return p && !p.done ? (p.pos || 0) : 0; }
    function speedFor(id) { var s = sub(id); return (s && s.ps && s.ps.speed) || (db && db.set && db.set.speed) || 1; }
    function setting(k, d) { return db && db.set && db.set[k] !== undefined ? db.set[k] : d; }

    readonly property string contId: {
        if (!db || !db.prog) return "";
        var best = "", bt = 0;
        for (var id in db.prog) {
            var p = db.prog[id];
            if (!p.done && p.pos > 5 && ep(id) && (p.t || 0) > bt) { best = id; bt = p.t || 0; }
        }
        if (best) return best;
        var q = (db.queue || []).filter(function(x) { return !!ep(x); });
        return q.length ? q[0] : "";
    }
    property string curId: ""
    readonly property string shownId: curId || contId
    readonly property var queueIds: db ? (db.queue || []).filter(function(x) { return !!ep(x) && x !== shownId; }) : []

    // ------------------------------------------------------------ player
    readonly property bool loaded: curId !== "" && mp.source.toString() !== ""
    readonly property bool playing: mp.playbackState === MediaPlayer.PlayingState
    readonly property bool buffering: playing && (mp.mediaStatus === MediaPlayer.LoadingMedia || mp.mediaStatus === MediaPlayer.StalledMedia || mp.mediaStatus === MediaPlayer.BufferingMedia)
    property double pendingSeek: 0
    readonly property real posS: shownId === curId && loaded ? mp.position / 1000 : savedPos(shownId)
    readonly property real durS: shownId === curId && loaded && mp.duration > 0 ? mp.duration / 1000 : durOf(shownId)

    MediaPlayer {
        id: mp
        audioOutput: AudioOutput { id: out }
        onSeekableChanged: if (seekable && root.pendingSeek > 0) { setPosition(root.pendingSeek); root.pendingSeek = 0; }
        onMediaStatusChanged: if (mediaStatus === MediaPlayer.EndOfMedia) root.finish()
        onPlaybackStateChanged: if (playbackState === MediaPlayer.PausedState) root.savePos()
        onErrorOccurred: function(e, msg) { root.err = "Não consegui tocar: " + msg; }
    }
    Timer { interval: 60000; repeat: true; running: root.playing; onTriggered: root.savePos() }

    function playId(id) {
        var e = ep(id); if (!e) return;
        if (curId === id && loaded) { mp.play(); return; }
        if (curId && loaded) savePos();
        curId = id;
        var start = savedPos(id);
        if (start > 0 && setting("resume5", true)) start = Math.max(0, start - 5);
        pendingSeek = start * 1000;
        mp.source = e.url;
        mp.playbackRate = speedFor(id);
        mp.play();
    }
    function toggle() {
        if (!shownId) return;
        if (playing) mp.pause(); else playId(shownId);
    }
    function skip(sec) { if (loaded) mp.setPosition(Math.max(0, Math.min(mp.duration, mp.position + sec * 1000))); }
    function seekFrac(f) { if (loaded && mp.duration > 0) mp.setPosition(f * mp.duration); }
    function cycleSpeed() {
        var opts = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2], r = mp.playbackRate, i = 0;
        while (i < opts.length && opts[i] <= r + 0.001) i++;
        mp.playbackRate = opts[i % opts.length];
    }
    function savePos() {
        if (!curId || !loaded || mp.duration <= 0) return;
        var id = curId, pos = mp.position / 1000, dur = mp.duration / 1000;
        push(function(d) {
            d.prog = d.prog || {};
            var old = d.prog[id];
            if (old && old.t > Date.now()) return;
            d.prog[id] = { pos: pos, dur: dur, t: Date.now(), done: false };
        });
    }
    function finish() {
        var id = curId, dur = mp.duration / 1000;
        push(function(d) {
            d.prog = d.prog || {};
            d.prog[id] = { pos: 0, dur: dur, t: Date.now(), done: true };
            d.queue = (d.queue || []).filter(function(x) { return x !== id; });
            d.lists = d.lists || {}; d.lists.queueT = Date.now();
        });
        var next = queueIds.length ? queueIds[0] : "";
        curId = ""; mp.stop(); mp.source = "";
        if (next && setting("cont", true)) playId(next);
    }
    function playFromQueue(id) {
        push(function(d) {
            d.queue = (d.queue || []).filter(function(x) { return x !== id; });
            d.lists = d.lists || {}; d.lists.queueT = Date.now();
        });
        playId(id);
    }

    function fmt(s) {
        s = Math.max(0, Math.floor(s || 0));
        var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (x < 10 ? "0" : "") + x;
    }
    function durTxt(id) {
        var d = durOf(id) - savedPos(id); if (d <= 0) return "";
        var m = Math.round(d / 60); return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60 < 10 ? "0" : "") + (m % 60) : m + " min";
    }

    // ------------------------------------------------------------ painel (ícone)
    compactRepresentation: MouseArea {
        acceptedButtons: Qt.LeftButton | Qt.MiddleButton
        hoverEnabled: true
        onClicked: function(ev) { if (ev.button === Qt.MiddleButton) root.toggle(); else root.expanded = !root.expanded; }
        Kirigami.Icon {
            anchors.fill: parent
            source: root.playing ? "media-playback-pause" : "audio-headphones"
            active: parent.containsMouse
        }
    }

    // ------------------------------------------------------------ widget completo
    fullRepresentation: Item {
        id: full
        Layout.minimumWidth: Kirigami.Units.gridUnit * 8
        Layout.minimumHeight: Kirigami.Units.gridUnit * 6
        Layout.preferredWidth: Kirigami.Units.gridUnit * 22
        Layout.preferredHeight: Kirigami.Units.gridUnit * 12

        readonly property bool mini: width < 260 || height < 150
        readonly property bool wide: !mini && width >= 480
        readonly property bool listOn: !mini && height >= (wide ? 250 : 330)
        readonly property int pad: mini ? 0 : (width < 340 ? 12 : 16)
        readonly property real coverSize: wide ? Math.min(height - pad * 2, width * 0.36, 300)
                                               : Math.min(64 + Math.max(0, width - 300) * 0.2, 96)
        readonly property string img: root.art(root.shownId)

        // Máscara dos cantos arredondados
        Rectangle { id: cardMask; anchors.fill: parent; radius: 24; visible: false; layer.enabled: true }

        Item {
            id: card
            anchors.fill: parent
            layer.enabled: true
            layer.effect: MultiEffect { maskEnabled: true; maskSource: cardMask; maskThresholdMin: 0.5; maskSpreadAtMin: 1.0 }

            Rectangle { anchors.fill: parent; color: "#000000" }

            // Fundo com a cor da capa (desfocado), como a página do podcast no app
            Image {
                id: glowSrc
                anchors.fill: parent
                source: full.img
                sourceSize: Qt.size(96, 96)
                fillMode: Image.PreserveAspectCrop
                visible: false
            }
            MultiEffect {
                anchors.fill: parent
                source: glowSrc
                visible: Plasmoid.configuration.showCoverGlow && full.img !== "" && !full.mini
                blurEnabled: true; blurMax: 64; blur: 1.0
                saturation: 0.25
                opacity: 0.5
            }
            Rectangle {
                anchors.fill: parent
                visible: !full.mini
                gradient: Gradient {
                    GradientStop { position: 0.0; color: Qt.rgba(0, 0, 0, 0.15) }
                    GradientStop { position: 0.75; color: Qt.rgba(0, 0, 0, 0.82) }
                    GradientStop { position: 1.0; color: "#000000" }
                }
            }

            // ---------------- pequeno: capa cheia, título e play
            Item {
                anchors.fill: parent
                visible: full.mini && root.shownId !== ""
                Image { anchors.fill: parent; source: full.img; fillMode: Image.PreserveAspectCrop; asynchronous: true }
                Rectangle {
                    anchors.fill: parent
                    gradient: Gradient {
                        GradientStop { position: 0.35; color: "transparent" }
                        GradientStop { position: 1.0; color: Qt.rgba(0, 0, 0, 0.85) }
                    }
                }
                Text {
                    anchors { left: parent.left; right: miniPlay.left; bottom: parent.bottom; margins: 12; rightMargin: 8 }
                    text: root.epTitle(root.shownId)
                    color: root.tx; font.family: root.fam; font.pixelSize: 13; font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight
                }
                PlayButton { id: miniPlay; app: root; size: 40; anchors { right: parent.right; bottom: parent.bottom; margins: 10 } }
                Rectangle {
                    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
                    height: 3; color: Qt.rgba(1, 1, 1, 0.2)
                    Rectangle { height: parent.height; color: root.acc; width: root.durS > 0 ? parent.width * Math.min(1, root.posS / root.durS) : 0 }
                }
            }

            // ---------------- médio e largo
            ColumnLayout {
                id: mainCol
                anchors.fill: parent
                anchors.margins: full.pad
                spacing: 10
                visible: !full.mini && root.shownId !== ""

                RowLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: full.wide
                    spacing: full.wide ? 18 : 14

                    Item {
                        Layout.preferredWidth: full.coverSize
                        Layout.preferredHeight: full.coverSize
                        Layout.alignment: Qt.AlignTop
                        Rectangle {
                            anchors.fill: parent; radius: full.wide ? 18 : 12; color: root.grp
                            Kirigami.Icon { anchors.centerIn: parent; width: parent.width * 0.35; height: width; source: "audio-headphones"; color: root.tx3; isMask: true }
                        }
                        Kirigami.ShadowedImage {
                            anchors.fill: parent
                            source: full.img
                            radius: full.wide ? 18 : 12
                            shadow.size: full.wide ? 18 : 8
                            shadow.color: Qt.rgba(0, 0, 0, 0.5)
                            shadow.yOffset: 4
                            visible: full.img !== ""
                        }
                    }

                    ColumnLayout {
                        id: rightCol
                        Layout.fillWidth: true
                        Layout.fillHeight: full.wide
                        Layout.alignment: Qt.AlignTop
                        spacing: 3

                        Text {
                            text: root.playing ? "TOCANDO AGORA" : (root.curId ? "PAUSADO" : (root.savedPos(root.shownId) > 5 ? "CONTINUAR" : "A SEGUIR"))
                            color: root.acc; font.family: root.fam; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6
                        }
                        Text {
                            Layout.fillWidth: true
                            text: root.epTitle(root.shownId)
                            color: root.tx; font.family: root.fam; font.pixelSize: full.wide ? 19 : 16; font.weight: Font.Bold
                            wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight
                        }
                        Text {
                            Layout.fillWidth: true
                            text: root.showTitle(root.shownId)
                            color: root.tx2; font.family: root.fam; font.pixelSize: 13
                            elide: Text.ElideRight
                        }
                        Item { Layout.fillHeight: true; visible: full.wide && !full.listOn }
                    }
                }
            }

            // Progresso + controles + fila: ficam sob a capa (médio) ou ao lado dela (largo)
            ColumnLayout {
                id: ctl
                parent: full.wide ? rightCol : mainCol
                visible: !full.mini && root.shownId !== ""
                Layout.fillWidth: true
                Layout.fillHeight: full.listOn
                Layout.topMargin: full.wide ? 8 : 0
                spacing: 8

                // barra de progresso (clique para pular)
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4
                    Item {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 14
                        Rectangle {
                            id: track
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width; height: seekArea.containsMouse ? 6 : 4; radius: height / 2
                            color: Qt.rgba(1, 1, 1, 0.16)
                            Behavior on height { NumberAnimation { duration: 120 } }
                            Rectangle {
                                height: parent.height; radius: parent.radius; color: root.tx
                                width: root.durS > 0 ? parent.width * Math.min(1, root.posS / root.durS) : 0
                            }
                        }
                        MouseArea {
                            id: seekArea
                            anchors.fill: parent; hoverEnabled: true
                            cursorShape: root.loaded ? Qt.PointingHandCursor : Qt.ArrowCursor
                            onClicked: function(ev) { root.seekFrac(ev.x / width); }
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        Text { text: root.fmt(root.posS); color: root.tx2; font.family: root.fam; font.pixelSize: 11 }
                        Item { Layout.fillWidth: true }
                        Text { text: root.durS > 0 ? "−" + root.fmt(root.durS - root.posS) : ""; color: root.tx2; font.family: root.fam; font.pixelSize: 11 }
                    }
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 0
                    PillButton { app: root; text: (root.loaded ? mp.playbackRate : root.speedFor(root.shownId)).toString().replace(".", ",") + "×"; onClicked: root.cycleSpeed(); enabled: root.loaded }
                    Item { Layout.fillWidth: true }
                    IconButton { app: root; icon: "media-seek-backward"; label: String(root.setting("back", 15)); onClicked: root.skip(-root.setting("back", 15)); enabled: root.loaded }
                    Item { Layout.preferredWidth: full.width < 340 ? 6 : 14 }
                    PlayButton { app: root; size: full.wide ? 52 : 46 }
                    Item { Layout.preferredWidth: full.width < 340 ? 6 : 14 }
                    IconButton { app: root; icon: "media-seek-forward"; label: String(root.setting("fwd", 30)); onClicked: root.skip(root.setting("fwd", 30)); enabled: root.loaded }
                    Item { Layout.fillWidth: true }
                    PillButton { app: root; text: root.queueIds.length ? "Fila " + root.queueIds.length : "Fila"; onClicked: if (root.queueIds.length) root.playFromQueue(root.queueIds[0]); enabled: root.queueIds.length > 0 }
                }

                // fila
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    visible: full.listOn
                    spacing: 6
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 4
                        Text { text: "A seguir"; color: root.tx; font.family: root.fam; font.pixelSize: 15; font.weight: Font.Bold }
                        Item { Layout.fillWidth: true }
                        Text { text: root.queueIds.length ? root.queueIds.length + (root.queueIds.length === 1 ? " episódio" : " episódios") : ""; color: root.tx3; font.family: root.fam; font.pixelSize: 12 }
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 14
                        color: Qt.rgba(1, 1, 1, 0.05)
                        border.color: root.sep
                        clip: true
                        Text {
                            anchors.centerIn: parent
                            visible: root.queueIds.length === 0
                            text: "A fila está vazia"
                            color: root.tx3; font.family: root.fam; font.pixelSize: 13
                        }
                        ListView {
                            anchors.fill: parent
                            anchors.margins: 4
                            model: root.queueIds
                            boundsBehavior: Flickable.StopAtBounds
                            QQC2.ScrollBar.vertical: QQC2.ScrollBar { policy: QQC2.ScrollBar.AsNeeded }
                            delegate: Rectangle {
                                required property string modelData
                                width: ListView.view.width
                                height: 52
                                radius: 10
                                color: rowArea.containsMouse ? Qt.rgba(1, 1, 1, 0.06) : "transparent"
                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 8; anchors.rightMargin: 8
                                    spacing: 10
                                    Kirigami.ShadowedImage {
                                        Layout.preferredWidth: 38; Layout.preferredHeight: 38
                                        source: root.art(modelData); radius: 8
                                        color: root.grp
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 1
                                        Text { Layout.fillWidth: true; text: root.epTitle(modelData); color: root.tx; font.family: root.fam; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight }
                                        Text { Layout.fillWidth: true; text: root.showTitle(modelData) + (root.durTxt(modelData) ? " · " + root.durTxt(modelData) : ""); color: root.tx2; font.family: root.fam; font.pixelSize: 11; elide: Text.ElideRight }
                                    }
                                    Kirigami.Icon { Layout.preferredWidth: 18; Layout.preferredHeight: 18; source: "media-playback-start"; color: root.acc; isMask: true; opacity: rowArea.containsMouse ? 1 : 0.6 }
                                }
                                MouseArea { id: rowArea; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.playFromQueue(modelData) }
                            }
                        }
                    }
                }
            }

            // ---------------- estados vazios
            ColumnLayout {
                anchors.centerIn: parent
                width: parent.width - 32
                visible: root.shownId === ""
                spacing: 8
                Kirigami.Icon { Layout.alignment: Qt.AlignHCenter; Layout.preferredWidth: 32; Layout.preferredHeight: 32; source: "audio-headphones"; color: root.acc; isMask: true }
                Text {
                    Layout.fillWidth: true
                    horizontalAlignment: Text.AlignHCenter
                    text: !root.token ? "Conecte o GitHub para ver seus podcasts"
                        : root.busy ? "Sincronizando…"
                        : root.err ? root.err
                        : "Nada para continuar. Escolha um episódio no app."
                    color: root.tx2; font.family: root.fam; font.pixelSize: 13; wrapMode: Text.WordWrap
                }
                PillButton {
                    app: root
                    Layout.alignment: Qt.AlignHCenter
                    visible: !root.token
                    text: "Configurar"
                    onClicked: Plasmoid.internalAction("configure").trigger()
                }
            }

            // aviso discreto de erro/sincronização
            Rectangle {
                anchors { top: parent.top; right: parent.right; margins: 10 }
                width: 8; height: 8; radius: 4
                visible: root.shownId !== "" && (root.err !== "" || root.busy || root.pushing)
                color: root.err ? "#E07A5F" : root.acc
                opacity: root.err ? 1 : 0.8
                QQC2.ToolTip.visible: dotArea.containsMouse
                QQC2.ToolTip.text: root.err || "Sincronizando…"
                MouseArea { id: dotArea; anchors.fill: parent; anchors.margins: -6; hoverEnabled: true }
            }
        }

        // borda fina por cima
        Rectangle { anchors.fill: parent; radius: 24; color: "transparent"; border.color: root.sep; border.width: 1 }
    }
}
