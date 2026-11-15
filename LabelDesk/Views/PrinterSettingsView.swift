import SwiftUI

struct PrinterSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var ports = SerialPortService.availablePorts()
    @State private var draft = PrinterProfile()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Настройки GoDEX EZ-2").font(.title2).fontWeight(.semibold)

            TabView {
                Form {
                    Section("USB–RS232") {
                        Picker("Последовательный порт", selection: $draft.portPath) {
                            Text("Не выбран").tag("")
                            if !draft.portPath.isEmpty && !ports.contains(draft.portPath) {
                                Text(draft.portPath + " (ранее выбран)").tag(draft.portPath)
                            }
                            ForEach(ports, id: \.self) { Text($0).tag($0) }
                        }
                        Button("Обновить список портов") {
                            ports = SerialPortService.availablePorts()
                        }
                        LabeledContent("Скорость интерфейса", value: "9600 бод")
                        LabeledContent("Формат", value: "8 бит · без чётности · 1 стоп-бит")
                        Picker("Управление потоком", selection: $draft.flowControl) {
                            ForEach(FlowControl.allCases) { mode in
                                Text(mode.rawValue).tag(mode)
                            }
                        }
                    }
                    Section {
                        Text("Это настройки последовательной передачи, не скорости движения бумаги. Для RTS/CTS требуется соответствующая распайка кабеля.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .tabItem { Label("Подключение", systemImage: "cable.connector") }

                Form {
                    Section("Термопечать") {
                        Picker("Скорость механизма", selection: $draft.printSpeed) {
                            ForEach(EZ2PrintSpeed.allCases) { speed in
                                Text(speed.title).tag(speed)
                            }
                        }
                        Stepper("Плотность: \(draft.density) / 7", value: $draft.density, in: 0...7)
                        Stepper("Порог монохромного растра: \(draft.rasterThreshold)",
                                value: $draft.rasterThreshold, in: 64...192, step: 8)
                    }
                    Section("Аппаратные ограничения") {
                        LabeledContent("Разрешение", value: "203 dpi (8 точек/мм)")
                        LabeledContent("Ширина головки", value: "56 мм")
                        LabeledContent("Максимум растра ESC G", value: "55 мм (440 точек)")
                        Text("Плотность D0–D7 влияет на нагрев, порог растра — на толщину сглаженных линий. Скорость S0/S1 задаёт движение бумаги, но не ускоряет канал RS-232 9600 бод.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .tabItem { Label("Качество и скорость", systemImage: "speedometer") }

                Form {
                    Section("Датчик материала") {
                        Picker("Тип датчика", selection: $draft.sensorMode) {
                            ForEach(EZ2SensorMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        Text("Изменяйте датчик только при соответствующем типе этикеток. По умолчанию существующие настройки принтера не трогаются.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Section("Позиционирование") {
                        Stepper("ESC Q: \(draft.topOfFormDots) точек", value: $draft.topOfFormDots,
                                in: 4...999, step: 8)
                        NumberField(title: "Горизонтальная поправка", value: $draft.xOffsetMM, suffix: "мм")
                        NumberField(title: "Вертикальная поправка", value: $draft.yOffsetMM, suffix: "мм")
                        Text("По умолчанию Q176 — проверенная настройка теста. Значение Q зависит от материала; после изменения проверьте Feed TEST на одной этикетке. Размер и зазор задаются в редакторе.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Section("Тестовый текст") {
                        NumberField(title: "Поле для Print TEST", value: $draft.leftMarginMM, suffix: "мм")
                        Text("Для растровых макетов применяется фиксированное M01; текстовое поле относится только к первоначальному TEST.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .tabItem { Label("Материал", systemImage: "ruler") }

                VStack(alignment: .leading, spacing: 15) {
                    Text("Встроенные шрифты EZ-2").font(.headline)
                    Text("Документированы ASCII 8×10 точек (ESC A00) и 16×26 точек (ESC A11), увеличение и стандартные штрихкоды. Кириллицы в списке кодовых страниц нет.")
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Для обычных русских текстов остаётся растровый вывод. Отдельная печать встроенного ASCII-текста намного компактнее. Гибридная печать возможна только после испытания расположения текстовых и графических строк.")
                        .fixedSize(horizontal: false, vertical: true)
                    Text("В главном окне доступна кнопка «Font TEST»: она печатает одну пробную этикетку двумя встроенными шрифтами. Пока тест не выполнен, режим смешанной печати не включается.")
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                }
                .padding(18)
                .tabItem { Label("Возможности", systemImage: "textformat") }
            }
            .frame(minHeight: 455)

            HStack {
                Button("Отмена") { dismiss() }
                Spacer()
                Button("Сохранить настройки") {
                    store.settings.profile = draft
                    store.saveSettings()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(18)
        .frame(width: 680, height: 560)
        .onAppear {
            draft = store.settings.profile
            ports = SerialPortService.availablePorts()
        }
    }
}
