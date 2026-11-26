import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    property alias cfg_token: tokenField.text
    property alias cfg_interval: intervalBox.value
    property alias cfg_showCoverGlow: glowBox.checked

    Kirigami.FormLayout {
        QQC2.TextField {
            id: tokenField
            Kirigami.FormData.label: "Token do GitHub:"
            echoMode: TextInput.Password
            placeholderText: "ghp_…"
            Layout.preferredWidth: Kirigami.Units.gridUnit * 18
        }
        QQC2.Label {
            text: "O mesmo token (só com a permissão gist) que você usa no app.\nO widget lê e grava o gist podcast-dados.json."
            opacity: 0.7
            wrapMode: Text.WordWrap
            Layout.preferredWidth: Kirigami.Units.gridUnit * 18
        }
        QQC2.Button {
            text: "Criar token no GitHub"
            icon.name: "internet-services"
            onClicked: Qt.openUrlExternally("https://github.com/settings/tokens/new?scopes=gist&description=Podcast%20widget%20Linux")
        }
        Item { Kirigami.FormData.isSection: true }
        QQC2.SpinBox {
            id: intervalBox
            Kirigami.FormData.label: "Buscar novidades a cada:"
            from: 1; to: 60
            textFromValue: function(v) { return v + " min" }
            valueFromText: function(t) { return parseInt(t) }
        }
        QQC2.CheckBox {
            id: glowBox
            Kirigami.FormData.label: "Visual:"
            text: "Fundo com a cor da capa"
        }
    }
}
