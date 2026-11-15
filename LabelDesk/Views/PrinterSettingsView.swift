import SwiftUI

struct PrinterSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var ports = SerialPortService.availablePorts()
    @State private var draft = PrinterProfile()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Настройки принтера")
                        .font(.system(size: 22, weight: .bold))
                    Text("GoDEX EZ-2 · RS-232 · проверенный построчный режим")
                        .font(.system(size: 12))
                        .foregroundStyle(DeskPalette.secondary)
                }
                Spacer()
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Последовательный порт").font(.headline)
                HStack {
                    Picker("Порт", selection: $draft.portPath) {
                        Text("Выберите порт").tag("")
                        if !draft.portPath.isEmpty && !ports.contains(draft.portPath) {
                            Text(draft.portPath + " (сохранён)").tag(draft.portPath)
                        }
                        ForEach(ports, id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                    Button("Обновить") { ports = SerialPortService.availablePorts() }
                }
                Text("9600 бод · 8N1 · без XON/XOFF и RTS/CTS")
                    .font(.system(size: 12))
                    .foregroundStyle(DeskPalette.secondary)
            }
            .deskSurface()

            VStack(alignment: .leading, spacing: 13) {
                Text("Интервал между этикетками").font(.headline)
                Stepper(value: $draft.labelIntervalSeconds, in: 0.2...10, step: 0.1) {
                    Text(String(format: "%.1f с", draft.labelIntervalSeconds))
                        .monospacedDigit()
                }
                Text("Проверено: 1,5 с. Пауза начинается после передачи FF и завершения вывода данных из драйвера RS-232. Между растровыми строками пауз нет.")
                    .font(.system(size: 12))
                    .foregroundStyle(DeskPalette.secondary)
            }
            .deskSurface()

            VStack(alignment: .leading, spacing: 12) {
                Text("Порог чёрно-белого растра").font(.headline)
                HStack {
                    Slider(value: Binding(
                        get: { Double(draft.rasterThreshold) },
                        set: { draft.rasterThreshold = Int(($0 / 8).rounded()) * 8 }
                    ), in: 64...192, step: 8)
                    Text("\(draft.rasterThreshold)")
                        .monospacedDigit()
                }
                Text("Материал 58 × 38 мм · зазор 2 мм · шаг 40 мм. Область печати: 55 × 35 мм (440 × 280 точек). Стартовая этикетка T3 печатается автоматически при запуске очереди.")
                    .font(.system(size: 12))
                    .foregroundStyle(DeskPalette.secondary)
            }
            .deskSurface()

            Spacer()
            HStack {
                Text("Изменения сохраняются после нажатия «Применить».")
                    .font(.system(size: 11))
                    .foregroundStyle(DeskPalette.secondary)
                Spacer()
                Button("Отмена") { dismiss() }
                Button("Применить") {
                    store.settings.profile = draft
                    store.saveSettings()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .tint(DeskPalette.accent)
            }
        }
        .padding(24)
        .frame(width: 670, height: 610)
        .background(Color.white)
        .onAppear {
            draft = store.settings.profile
            ports = SerialPortService.availablePorts()
        }
    }
}
