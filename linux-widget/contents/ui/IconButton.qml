import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami

Item {
    property var app
    id: ib
    property string icon
    property string label
    signal clicked()
    width: 40; height: 40
    opacity: enabled ? 1 : 0.4
    Rectangle { anchors.fill: parent; radius: 20; color: ibArea.containsMouse ? Qt.rgba(1, 1, 1, 0.08) : "transparent" }
    Kirigami.Icon { anchors.centerIn: parent; width: 22; height: 22; source: ib.icon; color: app.tx; isMask: true }
    Text { anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: -2; text: ib.label; color: app.tx2; font.family: app.fam; font.pixelSize: 9; font.weight: Font.Bold }
    MouseArea { id: ibArea; anchors.fill: parent; hoverEnabled: true; enabled: ib.enabled; cursorShape: Qt.PointingHandCursor; onClicked: ib.clicked() }
    Accessible.role: Accessible.Button
    Accessible.name: ib.label
}
