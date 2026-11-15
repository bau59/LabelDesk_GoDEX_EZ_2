import SwiftUI

struct PrinterSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var ports = SerialPortService.availablePorts()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Printer settings").font(.title2)
            Form {
                Section("Connection") {
                    Picker("Serial port", selection: $store.settings.profile.portPath) {
                        Text("Choose a port").tag("")
                        ForEach(ports, id: \.self) { Text($0).tag($0) }
                    }
                    Button("Refresh ports") { ports = SerialPortService.availablePorts() }
                    LabeledContent("Port format", value: "9600 baud, 8 data bits, no parity, 1 stop bit")
                    Picker("Flow control", selection: $store.settings.profile.flowControl) {
                        ForEach(FlowControl.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Section("Print profile") {
                    Stepper("Density: \(store.settings.profile.density)", value: $store.settings.profile.density, in: 0...7)
                    NumberField(title: "Left margin", value: $store.settings.profile.leftMarginMM, suffix: "mm")
                    NumberField(title: "X offset", value: $store.settings.profile.xOffsetMM, suffix: "mm")
                    NumberField(title: "Y offset", value: $store.settings.profile.yOffsetMM, suffix: "mm")
                    NumberField(title: "Gap", value: $store.settings.profile.materialGapMM, suffix: "mm")
                }
            }
            HStack {
                Button("Cancel") { dismiss() }
                Spacer()
                Button("Save") { store.saveSettings(); dismiss() }.buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 520)
    }
}
