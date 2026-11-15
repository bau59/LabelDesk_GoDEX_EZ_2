import SwiftUI

/// Guided calibration for the original EZ-2. No undocumented reset/autosense
/// commands are sent: the operator measures an actual one-label print.
struct CalibrationView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0
    @State private var widthMM: Double = 40
    @State private var heightMM: Double = 30
    @State private var gapMM: Double = 3
    @State private var draft = PrinterProfile()

    private var hasChanges: Bool {
        draft != store.settings.profile
            || widthMM != store.document.widthMM
            || heightMM != store.document.heightMM
            || gapMM != store.document.gapMM
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 11) {
                Image(systemName: "scope")
                    .font(.system(size: 20))
                    .foregroundStyle(DeskPalette.accent)
                    .frame(width: 42, height: 42)
                    .background(DeskPalette.paleBlue, in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Калибровка этикетки")
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundStyle(DeskPalette.ink)
                    Text("GoDEX EZ-2 · одна пробная этикетка на каждый шаг")
                        .font(.system(size: 12))
                        .foregroundStyle(DeskPalette.secondary)
                }
                Spacer()
                Button("Закрыть") { dismiss() }
                    .buttonStyle(.bordered)
            }
            .padding(21)

            DeskPalette.border.frame(height: 1)

            Picker("Этап", selection: $step) {
                Text("1. Материал").tag(0)
                Text("2. Подача ленты").tag(1)
                Text("3. Положение печати").tag(2)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 23)
            .padding(.vertical, 15)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch step {
                    case 0: materialStep
                    case 1: feedStep
                    default: positionStep
                    }
                }
                .padding(.horizontal, 23)
                .padding(.bottom, 20)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }

            DeskPalette.border.frame(height: 1)

            VStack(spacing: 10) {
                if hasChanges {
                    Label("Сначала сохраните новые параметры. Тест будет использовать сохранённый профиль.",
                          systemImage: "exclamationmark.circle")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.amber)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(spacing: 9) {
                    Button("Сохранить параметры") {
                        _ = store.applyCalibration(widthMM: widthMM, heightMM: heightMM,
                                                   gapMM: gapMM, profile: draft)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(DeskPalette.accent)
                    .disabled(!hasChanges)

                    Button("FEED: текст") { store.sendFeedTest() }
                        .disabled(hasChanges || store.diagnosticRunning)
                        .help("Тест надписи у начала этикетки")
                    if store.feedTestPending {
                        Button("Подтвердить FEED") { store.confirmFeedTest() }
                            .disabled(hasChanges || store.diagnosticRunning)
                    }
                    Spacer()
                    Button("Начало") { store.sendCalibrationPattern(variant: .top) }
                        .disabled(hasChanges || store.diagnosticRunning)
                    Button("Конец") { store.sendCalibrationPattern(variant: .bottom) }
                        .disabled(hasChanges || store.diagnosticRunning)
                    Button("Рамка", systemImage: "square.dashed") {
                        store.sendCalibrationPattern(variant: .frame)
                    }
                    .disabled(hasChanges || store.diagnosticRunning)
                }
            }
            .padding(19)
        }
        .background(Color.white)
        .frame(width: 760, height: 650)
        .onAppear {
            widthMM = store.document.widthMM
            heightMM = store.document.heightMM
            gapMM = store.document.gapMM
            draft = store.settings.profile
        }
        .alert(store.alert?.title ?? "", isPresented: Binding(
            get: { store.alert != nil },
            set: { if !$0 { store.alert = nil } }
        )) {
            if let action = store.alert?.action {
                Button("Подтвердить") {
                    store.alert = nil
                    action()
                }
                Button("Отмена", role: .cancel) { store.alert = nil }
            } else {
                Button("OK") { store.alert = nil }
            }
        } message: {
            Text(store.alert?.message ?? "")
        }
    }

    private var materialStep: some View {
        VStack(alignment: .leading, spacing: 17) {
            heading("Укажите фактический материал",
                    subtitle: "Ширину и высоту измерьте по самой наклейке, зазор — между наклейками.")
            VStack(alignment: .leading, spacing: 14) {
                dimension("Ширина ленты, мм", value: $widthMM, range: 10...60)
                dimension("Высота, мм", value: $heightMM, range: 10...100)
                dimension("Зазор, мм", value: $gapMM, range: 0...10)
                Divider()
                Picker("Тип датчика", selection: $draft.sensorMode) {
                    ForEach(EZ2SensorMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .deskSurface()

            note("Материал может быть до 60 мм. Графическая команда ESC G печатает только первые 55 мм; заштрихованный правый край редактора не попадёт на бумагу. Для ширины ленты 56–60 мм уменьшать макет не требуется.")
            note("Эти значения изменяют текущий шаблон после сохранения. Если его объекты выходят за новые границы, сохранение будет отклонено.")
            note("На конкретном EZ-2 физическая кнопка Feed может продвигать ленту на небольшое расстояние. Это не эквивалент программного FEED TEST и не критерий правильной подачи целой наклейки. Не меняйте VR без отдельной проверки датчика по инструкции именно EZ-2.")
        }
    }

    private var feedStep: some View {
        VStack(alignment: .leading, spacing: 17) {
            heading("Положение остановки ленты",
                    subtitle: "Настраивается расстояние до начала следующей этикетки, а не размещение текста.")
            VStack(alignment: .leading, spacing: 15) {
                Toggle("Подбирать ESC Q по высоте этикетки", isOn: $draft.automaticTopOfForm)
                    .font(.system(size: 13))
                Divider()
                if draft.automaticTopOfForm {
                    HStack {
                        Text("Для высоты \(Int(heightMM)) мм")
                        Spacer()
                        Text("Q\(String(format: "%03d", GodexEZ2Encoder.labelStopQ(heightMM: Int(heightMM))))")
                            .font(.system(.body, design: .monospaced, weight: .semibold))
                    }
                } else {
                    Stepper(value: $draft.topOfFormDots, in: 4...999, step: 8) {
                        HStack {
                            Text("Ручное значение ESC Q")
                            Spacer()
                            Text("\(draft.topOfFormDots)")
                                .monospacedDigit()
                        }
                    }
                }
                Divider()
                HStack {
                    Text("Длина наклейки с зазором (ESC q)")
                    Spacer()
                    Text("\(Int(heightMM + gapMM)) мм")
                        .fontWeight(.semibold)
                }
            }
            .font(.system(size: 13))
            .deskSurface()

            VStack(alignment: .leading, spacing: 9) {
                Text("Сопоставимые контрольные отпечатки")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(DeskPalette.ink)
                Text("1. Сохраните размер, зазор, Q и режим передачи.")
                Text("2. Напечатайте «FEED: текст», затем «Начало», затем «Конец» — не меняя настройки.")
                Text("3. Если начало совпадает, а конец уходит на соседнюю наклейку, проблема связана с печатью/подачей по всей высоте, а не с X/Y.")
                Text("4. «Рамка» — окончательная проверка; она отправляет больше графических байт, но тем же способом.")
            }
            .font(.system(size: 12))
            .foregroundStyle(DeskPalette.secondary)
            .deskSurface()
            note("Механическая кнопка Feed у твоего принтера протягивает лишь небольшой участок ленты. Никакого обязательного теста «пять нажатий = пять наклеек» здесь больше нет.")
            note("Если положение не повторяется, не подтверждайте правильную подачу и не пытайтесь компенсировать проблему X/Y. Проверяйте также материал и датчик зазора.")
        }
    }

    private var positionStep: some View {
        VStack(alignment: .leading, spacing: 17) {
            heading("Положение изображения и рабочая ширина",
                    subtitle: "Поправки смещают содержимое этикетки, но не изменяют движение рулона.")
            VStack(alignment: .leading, spacing: 18) {
                axisControl("X — влево / вправо", value: $draft.xOffsetMM,
                            help: "Положительное X сдвигает рисунок вправо.")
                Divider()
                axisControl("Y — раньше / позже", value: $draft.yOffsetMM,
                            help: "Положительное Y сдвигает рисунок ниже по этикетке.")
            }
            .deskSurface()
            VStack(alignment: .leading, spacing: 11) {
                HStack {
                    Text("Пробная рамка")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(DeskPalette.ink)
                    Spacer()
                    Text("2 мм от краёв")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.secondary)
                }
                HStack(spacing: 17) {
                    calibrationDiagram
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Рамка показывает все четыре края и центральные оси.")
                        Text("Если она смещена, меняйте X/Y и печатайте повторно.")
                        Text("Если правый край обрезан, уменьшите X или ширину макета. Головка EZ-2 ограничивает растровую печать 55 мм.")
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(DeskPalette.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .deskSurface()
            note("Для материала шире 55 мм тестируется область до 55 мм, а не вся лента. Сначала сравните «Начало» и «Конец» с неизменными параметрами, затем печатайте рамку.")
            note("Если лента начинает печатать на предыдущей наклейке, сначала исправьте датчик и подачу на этапе 2. Здесь исправляется только расположение графики в пределах текущей этикетки.")
        }
    }

    private var calibrationDiagram: some View {
        ZStack {
            Rectangle().fill(Color.white)
            Rectangle().stroke(DeskPalette.ink, lineWidth: 1.5).padding(12)
            Rectangle().fill(DeskPalette.secondary).frame(width: 1)
                .padding(.vertical, 12)
            Rectangle().fill(DeskPalette.secondary).frame(height: 1)
                .padding(.horizontal, 12)
        }
        .frame(width: 146, height: 95)
        .overlay { Rectangle().strokeBorder(DeskPalette.border) }
    }

    private func heading(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(DeskPalette.ink)
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(DeskPalette.secondary)
        }
    }

    private func dimension(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        Stepper(value: value, in: range, step: 1) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value.wrappedValue))")
                    .monospacedDigit()
                    .fontWeight(.semibold)
            }
        }
        .font(.system(size: 13))
    }

    private func axisControl(_ title: String, value: Binding<Double>, help: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DeskPalette.ink)
                Spacer()
                Text(String(format: "%+.3f мм", value.wrappedValue))
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(DeskPalette.ink)
            }
            HStack(spacing: 8) {
                Button {
                    value.wrappedValue = max(-8, value.wrappedValue - 0.125)
                } label: { Image(systemName: "minus") }
                .buttonStyle(.bordered)
                Slider(value: value, in: -8...8, step: 0.125)
                    .tint(DeskPalette.accent)
                Button {
                    value.wrappedValue = min(8, value.wrappedValue + 0.125)
                } label: { Image(systemName: "plus") }
                .buttonStyle(.bordered)
                Button("0") { value.wrappedValue = 0 }
                    .buttonStyle(.bordered)
                    .help("Сбросить поправку")
            }
            Text(help).font(.system(size: 11)).foregroundStyle(DeskPalette.secondary)
        }
    }

    private func note(_ value: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle")
                .foregroundStyle(DeskPalette.accent)
            Text(value)
                .foregroundStyle(DeskPalette.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.system(size: 12))
        .padding(13)
        .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 10))
    }
}
