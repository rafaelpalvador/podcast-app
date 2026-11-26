import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami

Rectangle {
    property var app
    id: pill
    property string text
    signal clicked()
    implicitWidth: pillText.implicitWidth + 22
    implicitHeight: 30
    radius: 15
    color: pillArea.containsMouse && enabled ? Qt.rgba(1, 1, 1, 0.14) : Qt.rgba(1, 1, 1, 0.08)
    opacity: enabled ? 1 : 0.45
    Text { id: pillText; anchors.centerIn: parent; text: pill.text; color: app.tx; font.family: app.fam; font.pixelSize: 12; font.weight: Font.DemiBold }
    MouseArea { id: pillArea; anchors.fill: parent; hoverEnabled: true; enabled: pill.enabled; cursorShape: Qt.PointingHandCursor; onClicked: pill.clicked() }
    Accessible.role: Accessible.Button
    Accessible.name: pill.text
}
