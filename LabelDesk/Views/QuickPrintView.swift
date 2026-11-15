import AppKit
import SwiftUI

/// Operator view: edits only variable text values of a saved base template.
/// No geometry, styling, barcode content or source template is modified here.
struct QuickPrintView: View {
    @EnvironmentObject private var store: AppStore
    @State private var batchText = ""
    @State private var batchFieldID: UUID?

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 8) {
                        Label("Быстрая печать", systemImage: "text.badge.checkmark")
                            .font(.title2).fontWeight(.semibold)
                        Spacer()
                        Button("Редактировать базовый шаблон") {
                            store.editBaseTemplate()
                        }
                        .buttonStyle(.bordered)
                    }
                    if let folder = store.activeFolder {
                        Text("Папка: \(folder.name) · исходный макет защищён")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }

                    if store.quickFields.isEmpty {
                        GroupBox("Нет изменяемых текстовых полей") {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Откройте базовый шаблон в редакторе, добавьте текст и включите свойство «Менять при печати». Затем сохраните макет.")
                                    .fixedSize(horizontal: false, vertical: true)
                                Button("Перейти к редактору") { store.editBaseTemplate() }
                            }
                            .padding(6)
                        }
                    } else {
                        GroupBox("Подставить данные") {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(store.quickFields) { field in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(field.title).font(.caption).fontWeight(.medium)
                                        TextField(
                                            field.title,
                                            text: Binding(
                                                get: { store.quickValues[field.id] ?? field.initialValue },
                                                set: { store.quickValues[field.id] = $0 }
                                            )
                                        )
                                        .textFieldStyle(.roundedBorder)
                                    }
                                }
                                HStack {
                                    Button("Вернуть текст из шаблона") { store.prepareQuickValues() }
                                    Spacer()
                                }
                            }
                            .padding(8)
                        }

                        GroupBox("Добавить в очередь") {
                            HStack {
                                Stepper("Копий: \(store.copies)", value: $store.copies, in: 1...99)
                                Spacer()
                                Button("Добавить этикетку") { store.enqueueQuick() }
                                    .buttonStyle(.borderedProminent)
                            }
                            .padding(8)
                        }

                        GroupBox("Пакетная печать списком") {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Одна строка — одна этикетка. Меняется выбранное поле; остальные сохраняют введённые значения.")
                                    .font(.caption).foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Picker("Поле", selection: $batchFieldID) {
                                    ForEach(store.quickFields) { field in
                                        Text(field.title).tag(Optional(field.id))
                                    }
                                }
                                TextEditor(text: $batchText)
                                    .font(.system(.body, design: .monospaced))
                                    .frame(height: 90)
                                    .overlay { RoundedRectangle(cornerRadius: 5).stroke(Color.secondary.opacity(0.35)) }
                                HStack {
                                    Text("\(nonemptyBatchLines.count) строк · максимум 200")
                                        .font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Button("Добавить список в очередь") {
                                        guard let fieldID = batchFieldID else { return }
                                        store.enqueueQuickBatch(fieldID: fieldID, text: batchText)
                                    }
                                    .disabled(batchFieldID == nil || nonemptyBatchLines.isEmpty || nonemptyBatchLines.count > 200)
                                }
                            }
                            .padding(8)
                        }
                    }
                }
                .padding(18)
            }
            .frame(minWidth: 360, idealWidth: 435, maxWidth: 550)

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Text("Предпросмотр печати")
                    .font(.headline)
                Text("203 dpi · 8 точек/мм · монохром")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if let document = store.quickDocument {
                    if let raster = try? LabelRasterizer().rasterize(document, profile: store.settings.profile) {
                        Image(nsImage: raster.image)
                            .resizable()
                            .interpolation(.none)
                            .aspectRatio(contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .padding(20)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                    } else {
                        ContentUnavailableView("Ошибка макета", systemImage: "exclamationmark.triangle",
                                               description: Text("Проверьте размеры и элементы базового шаблона."))
                    }
                } else {
                    ContentUnavailableView("Нет базового шаблона", systemImage: "doc.text",
                                           description: Text("Выберите папку с базовым макетом."))
                }
                Spacer(minLength: 4)
                Text("Здесь нельзя двигать элементы. Для изменения дизайна откройте базовый шаблон в редакторе.")
                    .font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear {
            batchFieldID = store.quickFields.first?.id
        }
        .onChange(of: store.selectedFolderID) { _, _ in
            batchText = ""
            batchFieldID = store.quickFields.first?.id
        }
        .onChange(of: store.quickFields.map(\.id)) { _, _ in
            if !store.quickFields.contains(where: { $0.id == batchFieldID }) {
                batchFieldID = store.quickFields.first?.id
            }
        }
    }

    private var nonemptyBatchLines: [String] {
        batchText.components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
}
