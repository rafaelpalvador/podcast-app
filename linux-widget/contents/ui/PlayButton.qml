import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami

Rectangle {
    property var app
    property int size: 46
    width: size; height: size; radius: size / 2
    color: pbArea.pressed ? Qt.darker(app.acc, 1.15) : app.acc
    scale: pbArea.pressed ? 0.94 : 1
    Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }
    Kirigami.Icon {
        anchors.centerIn: parent
        width: parent.size * 0.44; height: width
        source: app.playing ? "media-playback-pause" : "media-playback-start"
        color: "#1A1205"; isMask: true
        visible: !app.buffering
    }
    QQC2.BusyIndicator { anchors.centerIn: parent; width: parent.size * 0.6; height: width; running: app.buffering; visible: running }
    MouseArea { id: pbArea; anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: app.toggle() }
    Accessible.role: Accessible.Button
    Accessible.name: app.playing ? "Pausar" : "Tocar"
}
