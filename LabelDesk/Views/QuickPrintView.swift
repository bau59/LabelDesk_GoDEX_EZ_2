import SwiftUI

/// A deliberately limited operator screen: variable text only, no geometry edits.
struct QuickPrintView: View {
    @EnvironmentObject private var store: AppStore
    @State private var batchMode = false
    @State private var batchText = ""
    @State private var batchFieldID: UUID?
    @State private var showSaveVariant = false
    @State private var variantName = ""

    private var batchLines: [String] {
        batchText.components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 19) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Заполнение этикетки")
                                .font(.system(size: 25, weight: .bold))
                                .foregroundStyle(DeskPalette.ink)
                            Text(store.activeFolder?.name ?? "Выберите папку")
                                .font(.system(size: 13))
                                .foregroundStyle(DeskPalette.secondary)
                        }
                        Spacer(minLength: 8)
                        Button {
                            store.editBaseTemplate()
                        } label: {
                            Label("Макет", systemImage: "slider.horizontal.3")
                        }
                        .buttonStyle(.bordered)
                        .help("Открыть базовый шаблон в редакторе")
                    }

                    HStack(spacing: 9) {
                        Image(systemName: "lock.shield")
                            .foregroundStyle(DeskPalette.green)
                        Text("Макет защищён. Здесь меняется только текст.")
                            .foregroundStyle(DeskPalette.secondary)
                    }
                    .font(.system(size: 12))
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(DeskPalette.border) }

                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("Данные этикетки")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(DeskPalette.ink)
                            Spacer()
                            if !store.quickFields.isEmpty {
                                Button("Сбросить") { store.prepareQuickValues() }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(DeskPalette.accent)
                            }
                        }

                        if store.quickFields.isEmpty {
                            VStack(alignment: .leading, spacing: 13) {
                                Label("Нет полей для заполнения", systemImage: "text.badge.xmark")
                                    .font(.system(size: 14, weight: .medium))
                                Text("Отметьте нужный текст в редакторе свойством «Менять при печати» и сохраните базовый шаблон.")
                                    .foregroundStyle(DeskPalette.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Button("Настроить шаблон") { store.editBaseTemplate() }
                                    .buttonStyle(.borderedProminent)
                                    .tint(DeskPalette.accent)
                            }
                        } else {
                            Text("Enter создаёт новую строку. Длинные слова и предложения переносятся в рамках текстового блока; всё лишнее по высоте обрезается.")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            ForEach(store.quickFields) { field in
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(field.title)
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(DeskPalette.ink)
                                    TextEditor(
                                        text: Binding(
                                            get: { store.quickValues[field.id] ?? field.initialValue },
                                            set: { store.quickValues[field.id] = $0 }
                                        )
                                    )
                                    .font(.system(size: 14))
                                    .scrollContentBackground(.hidden)
                                    .padding(7)
                                    .frame(minHeight: 83, maxHeight: 120)
                                    .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 9))
                                    .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(DeskPalette.border) }
                                    .help("Enter — новая строка; длинный текст переносится внутри границ блока")
                                }
                            }
                        }
                    }
                    .deskSurface()

                    if !store.quickFields.isEmpty {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Text("Печать")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(DeskPalette.ink)
                                Spacer()
                                Text("Шаг 2 из 2")
                                    .font(.system(size: 11))
                                    .foregroundStyle(DeskPalette.secondary)
                            }

                            Picker("Способ", selection: $batchMode) {
                                Text("Одна этикетка").tag(false)
                                Text("Список").tag(true)
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()

                            if batchMode {
                                Text("Одна строка — одна этикетка. Остальные поля остаются без изменений.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(DeskPalette.secondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                Picker("Заменять поле", selection: $batchFieldID) {
                                    ForEach(store.quickFields) { field in
                                        Text(field.title).tag(Optional(field.id))
                                    }
                                }

                                TextEditor(text: $batchText)
                                    .font(.system(size: 13, design: .monospaced))
                                    .scrollContentBackground(.hidden)
                                    .padding(7)
                                    .frame(height: 128)
                                    .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 9))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 9).strokeBorder(DeskPalette.border)
                                    }

                                Text("\(batchLines.count) из 200 строк")
                                    .font(.system(size: 11))
                                    .foregroundStyle(batchLines.count > 200 ? Color.red : DeskPalette.secondary)
                            }

                            HStack(spacing: 12) {
                                Stepper("Копий: \(store.copies)", value: $store.copies, in: 1...99)
                                    .font(.system(size: 12))
                                Spacer()
                                if !batchMode {
                                    Button {
                                        variantName = store.quickValues[store.quickFields[0].id] ?? ""
                                        showSaveVariant = true
                                    } label: {
                                        Image(systemName: "bookmark")
                                    }
                                    .help("Сохранить заполненную этикетку как шаблон")
                                    .buttonStyle(.bordered)
                                }
                            }

                            Button {
                                if batchMode {
                                    guard let field = batchFieldID else { return }
                                    store.enqueueQuickBatch(fieldID: field, text: batchText)
                                } else {
                                    store.enqueueQuick()
                                }
                            } label: {
                                Label(
                                    batchMode ? "Добавить \(batchLines.count) в очередь" : "Добавить в очередь",
                                    systemImage: "printer.fill"
                                )
                                .font(.system(size: 14, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(DeskPalette.accent)
                            .disabled(batchMode && (batchLines.isEmpty || batchLines.count > 200 || batchFieldID == nil))

                            Text("Добавление в очередь не отправляет этикетку на принтер, пока очередь не запущена.")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .deskSurface()
                    }
                }
                .padding(26)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .frame(minWidth: 370, idealWidth: 455, maxWidth: 590)
            .background(DeskPalette.background)

            Rectangle().fill(DeskPalette.border).frame(width: 1)

            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Предпросмотр")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(DeskPalette.ink)
                        if let label = store.quickDocument {
                            Text("\(Int(label.widthMM)) × \(Int(label.heightMM)) мм · 203 dpi")
                                .font(.system(size: 12))
                                .foregroundStyle(DeskPalette.secondary)
                        }
                    }
                    Spacer()
                    Label("Как на печати", systemImage: "checkmark.seal")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.green)
                }

                GeometryReader { geometry in
                    ZStack {
                        RoundedRectangle(cornerRadius: 15)
                            .fill(Color.white.opacity(0.62))
                        if let label = store.quickDocument,
                           let raster = try? LabelRasterizer().rasterize(
                            label, profile: store.settings.profile
                           ) {
                            Image(nsImage: raster.image)
                                .resizable()
                                .interpolation(.none)
                                .aspectRatio(contentMode: .fit)
                                .frame(
                                    maxWidth: max(120, geometry.size.width - 76),
                                    maxHeight: max(100, geometry.size.height - 80)
                                )
                                .background(.white)
                                .overlay { Rectangle().strokeBorder(DeskPalette.border, lineWidth: 1) }
                                .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
                        } else {
                            ContentUnavailableView(
                                "Предпросмотр недоступен",
                                systemImage: "doc.text.magnifyingglass",
                                description: Text("Проверьте размеры и содержимое базового шаблона.")
                            )
                        }
                    }
                }

                HStack(spacing: 8) {
                    Image(systemName: "info.circle")
                    Text("Текст и размеры меняйте слева. Расположение элементов — в редакторе.")
                }
                .font(.system(size: 11))
                .foregroundStyle(DeskPalette.secondary)
            }
            .padding(24)
            .frame(minWidth: 300, maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
        }
        .sheet(isPresented: $showSaveVariant) {
            VStack(alignment: .leading, spacing: 15) {
                Text("Сохранить вариант")
                    .font(.system(size: 20, weight: .semibold))
                Text("Новый шаблон будет сохранён в текущей папке. Базовый макет не изменится.")
                    .foregroundStyle(DeskPalette.secondary)
                TextField("Название варианта", text: $variantName)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    Button("Отмена") { showSaveVariant = false }
                    Spacer()
                    Button("Сохранить") {
                        store.saveQuickVariant(named: variantName)
                        showSaveVariant = false
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(DeskPalette.accent)
                    .disabled(variantName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(24)
            .frame(width: 430)
        }
        .onAppear { batchFieldID = store.quickFields.first?.id }
        .onChange(of: store.selectedFolderID) { _, _ in
            batchMode = false
            batchText = ""
            batchFieldID = store.quickFields.first?.id
        }
        .onChange(of: store.quickFields.map(\.id)) { _, _ in
            if !store.quickFields.contains(where: { $0.id == batchFieldID }) {
                batchFieldID = store.quickFields.first?.id
            }
        }
    }
}
