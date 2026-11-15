import SwiftUI

struct CalibrationView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Material calibration").font(.title2)
            Text("Set the material dimensions below, then use the explicit TEST command from the main window to check paper movement. No automatic calibration command is sent.")
            Form {
                NumberField(title: "Label width", value: $store.document.widthMM, suffix: "mm")
                NumberField(title: "Label height", value: $store.document.heightMM, suffix: "mm")
                NumberField(title: "Inter-label gap", value: $store.document.gapMM, suffix: "mm")
                NumberField(title: "Horizontal correction", value: $store.settings.profile.xOffsetMM, suffix: "mm")
                NumberField(title: "Vertical correction", value: $store.settings.profile.yOffsetMM, suffix: "mm")
            }
            GroupBox("Gap sensor — manual adjustment") {
                Text("With the printer powered on and label material under the sensor, adjust the VR slowly and press FEED repeatedly until the indicator is green and the feed aligns. This is a mechanical setting on the EZ-2; LabelDesk does not claim to calibrate it electronically.")
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack { Spacer(); Button("Save and close") { store.saveSettings(); dismiss() }.buttonStyle(.borderedProminent) }
        }
        .padding(20)
        .frame(width: 560)
    }
}
