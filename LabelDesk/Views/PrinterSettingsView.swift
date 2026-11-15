import SwiftUI

private enum SettingsPage: String, CaseIterable, Identifiable {
    case connection = "Подключение"
    case quality = "Качество и скорость"
    case paper = "Материал и подача"
    case capabilities = "Возможности"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .connection: "cable.connector"
        case .quality: "slider.horizontal.3"
        case .paper: "ruler"
        case .capabilities: "textformat"
        }
    }
}

struct PrinterSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var ports = SerialPortService.availablePorts()
    @State private var draft = PrinterProfile()
    @State private var page: SettingsPage = .connection

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                Image(systemName: "printer.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(DeskPalette.accent)
                    .frame(width: 41, height: 41)
                    .background(DeskPalette.paleBlue, in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Настройки принтера")
                        .font(.system(size: 21, weight: .bold))
                        .foregroundStyle(DeskPalette.ink)
                    Text("GoDEX EZ-2 · USB–RS232 · 203 dpi")
                        .font(.system(size: 12))
                        .foregroundStyle(DeskPalette.secondary)
                }
                Spacer()
            }
            .padding(21)

            DeskPalette.border.frame(height: 1)

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(SettingsPage.allCases) { option in
                        Button {
                            page = option
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: option.icon)
                                    .frame(width: 19)
                                Text(option.rawValue)
                                    .font(.system(size: 12, weight: page == option ? .semibold : .medium))
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(page == option ? DeskPalette.accent : DeskPalette.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 11)
                            .background(page == option ? DeskPalette.paleBlue : Color.clear,
                                        in: RoundedRectangle(cornerRadius: 9))
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    Text("Параметры сохраняются только по кнопке «Применить».")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 10)
                }
                .padding(14)
                .frame(width: 202)
                .background(DeskPalette.background)

                DeskPalette.border.frame(width: 1)

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        switch page {
                        case .connection:
                            connectionContent
                        case .quality:
                            qualityContent
                        case .paper:
                            paperContent
                        case .capabilities:
                            capabilitiesContent
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(25)
                }
                .background(Color.white)
            }

            DeskPalette.border.frame(height: 1)

            HStack(spacing: 10) {
                Label("Изменение датчика или ESC Q потребует повторного Feed TEST.",
                      systemImage: "info.circle")
                    .font(.system(size: 11))
                    .foregroundStyle(DeskPalette.secondary)
                Spacer()
                Button("Отмена") { dismiss() }
                    .buttonStyle(.bordered)
                Button("Применить настройки") {
                    store.settings.profile = draft
                    store.saveSettings()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .tint(DeskPalette.accent)
            }
            .padding(17)
        }
        .frame(width: 790, height: 600)
        .background(.white)
        .onAppear {
            draft = store.settings.profile
            ports = SerialPortService.availablePorts()
        }
    }

    private var connectionContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            pageHeading("Подключение", subtitle: "Настройки последовательного интерфейса USB–RS232")
            sectionCard {
                field("Порт принтера") {
                    HStack(spacing: 9) {
                        Picker("Порт принтера", selection: $draft.portPath) {
                            Text("Выберите порт").tag("")
                            if !draft.portPath.isEmpty && !ports.contains(draft.portPath) {
                                Text(draft.portPath + " (сохранён)").tag(draft.portPath)
                            }
                            ForEach(ports, id: \.self) { Text($0).tag($0) }
                        }
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                        Button {
                            ports = SerialPortService.availablePorts()
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .help("Обновить доступные порты")
                    }
                }
                Divider()
                HStack {
                    infoValue("Скорость", "9600 бод")
                    Spacer()
                    infoValue("Формат", "8N1")
                }
                Divider()
                field("Управление потоком") {
                    Picker("Управление потоком", selection: $draft.flowControl) {
                        ForEach(FlowControl.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 260, alignment: .leading)
                }
            }
            tip("На EZ-2 заводские параметры: 9600 бод, 8 бит, без чётности, 1 стоп-бит. XON/XOFF и RTS/CTS — разные режимы управления потоком; правильный режим зависит от фактического кабеля и настроек принтера. При непечатающих заданиях проверьте журнал передачи.")
        }
    }

    private var qualityContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            pageHeading("Качество и скорость", subtitle: "Параметры механизма и подготовка монохромного изображения")
            sectionCard {
                field("Механическая скорость") {
                    Picker("Скорость", selection: $draft.printSpeed) {
                        ForEach(EZ2PrintSpeed.allCases) { speed in
                            Text(speed.title).tag(speed)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 310, alignment: .leading)
                }
                Divider()
                field("Плотность нагрева: \(draft.density) / 7") {
                    HStack(spacing: 14) {
                        Slider(value: Binding(
                            get: { Double(draft.density) },
                            set: { draft.density = Int($0.rounded()) }
                        ), in: 0...7, step: 1)
                        Text("\(draft.density)")
                            .monospacedDigit()
                            .frame(width: 26)
                    }
                }
                Divider()
                field("Передача больших растров") {
                    Picker("Передача", selection: $draft.rasterTransport) {
                        ForEach(EZ2RasterTransport.allCases) { transport in
                            Text(transport.title).tag(transport)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Совместимый режим отправляет небольшие блоки с ограничением скорости 9600 бод. Исходный режим сохранён для сравнения.")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.secondary)
                }
                Divider()
                field("Порог растра: \(draft.rasterThreshold)") {
                    HStack(spacing: 14) {
                        Slider(value: Binding(
                            get: { Double(draft.rasterThreshold) },
                            set: { draft.rasterThreshold = Int(($0 / 8).rounded()) * 8 }
                        ), in: 64...192, step: 8)
                        Text("\(draft.rasterThreshold)")
                            .monospacedDigit()
                            .frame(width: 34)
                    }
                }
            }
            HStack(spacing: 11) {
                spec("203 dpi", "Разрешение")
                spec("56 мм", "Печатная головка")
                spec("55 мм", "Ширина растра")
            }
            tip("По руководству EZ-2 скорость задаётся S1 (1 дюйм/с) и S2 (2 дюйма/с). Передача через RS-232 9600 бод ограничивает скорость большого растра.")
        }
    }

    private var paperContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            pageHeading("Материал и подача", subtitle: "Датчик этикетки и положение начала печати")
            sectionCard {
                field("Датчик материала") {
                    Picker("Датчик", selection: $draft.sensorMode) {
                        ForEach(EZ2SensorMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
                Divider()
                field("Остановка этикетки (ESC Q)") {
                    Toggle("Подбирать по высоте этикетки", isOn: $draft.automaticTopOfForm)
                    if draft.automaticTopOfForm {
                        Text("Для текущего макета \(Int(store.document.heightMM)) мм: Q\(String(format: "%03d", GodexEZ2Encoder.labelStopQ(heightMM: Int(store.document.heightMM))))")
                            .font(.system(size: 12))
                            .foregroundStyle(DeskPalette.secondary)
                    } else {
                        Stepper(value: $draft.topOfFormDots, in: 4...999, step: 8) {
                            Text("Q\(String(format: "%03d", draft.topOfFormDots))")
                                .monospacedDigit()
                        }
                        .frame(maxWidth: 200, alignment: .leading)
                    }
                }
                Divider()
                HStack(spacing: 20) {
                    NumberField(title: "X", value: $draft.xOffsetMM, suffix: "мм")
                    NumberField(title: "Y", value: $draft.yOffsetMM, suffix: "мм")
                }
                Divider()
                NumberField(title: "Отступ Print TEST", value: $draft.leftMarginMM, suffix: "мм")
            }
            tip("По таблице EZ-2 Q176 соответствует высоте 26 мм; Q144 — 30 мм. Отдельная команда q учитывает высоту с зазором. После изменения режима Q сделайте Feed TEST, чтобы проверить протяжку.")
        }
    }

    private var capabilitiesContent: some View {
        VStack(alignment: .leading, spacing: 17) {
            pageHeading("Возможности EZ-2", subtitle: "Что поддерживает именно этот старый принтер")
            sectionCard {
                infoValue("Встроенный шрифт 1", "ASCII 8×10 точек")
                Divider()
                infoValue("Встроенный шрифт 2", "ASCII 16×26 точек")
                Divider()
                infoValue("Графика", "ESC G, монохром, до 55 мм")
                Divider()
                infoValue("Штрихкоды", "Встроенные команды и программный Code 39")
            }
            tip("Кириллица выводится растром. Встроенный ASCII-текст печатается намного компактнее, но полноценный гибридный режим пока не включён без дополнительного физического тестирования.")
        }
    }

    private func pageHeading(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(DeskPalette.ink)
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(DeskPalette.secondary)
        }
    }

    private func sectionCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 16, content: content)
            .deskSurface(padding: 19)
    }

    private func field<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DeskPalette.ink)
            content()
        }
    }

    private func infoValue(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(DeskPalette.secondary)
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DeskPalette.ink)
        }
    }

    private func spec(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(DeskPalette.ink)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(DeskPalette.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .deskSurface(padding: 14)
    }

    private func tip(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle")
                .foregroundStyle(DeskPalette.accent)
            Text(text)
                .foregroundStyle(DeskPalette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 12))
        .padding(14)
        .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 11))
    }
}
