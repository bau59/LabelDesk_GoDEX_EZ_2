import SwiftUI

struct TemplateLibraryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var createFolder = false
    @State private var renameFolder: LabelFolder?
    @State private var nameInput = ""
    @State private var pendingDeletion: Deletion?
    @State private var showDeletion = false
    @State private var showSizes = false
    @State private var search = ""

    private enum Deletion {
        case folder(LabelFolder)
        case template(LabelDocument)

        var description: String {
            switch self {
            case .folder(let folder):
                "Удалить папку «\(folder.name)»? Её шаблоны останутся в разделе «Без папки»."
            case .template(let template):
                "Удалить шаблон «\(template.name)»? Это действие нельзя отменить."
            }
        }
    }

    private var visibleTemplates: [LabelDocument] {
        store.templates.filter { template in
            template.folderID == store.selectedFolderID &&
                (search.isEmpty || template.name.localizedStandardContains(search))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Библиотека")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(DeskPalette.ink)
                    Text("\(store.folders.count) папок · \(store.templates.count) шаблонов")
                        .font(.system(size: 11))
                        .foregroundStyle(DeskPalette.secondary)
                }
                Spacer()
                Button {
                    nameInput = ""
                    createFolder = true
                } label: {
                    Image(systemName: "folder.badge.plus")
                        .font(.system(size: 15))
                        .foregroundStyle(DeskPalette.accent)
                        .frame(width: 34, height: 34)
                        .background(DeskPalette.paleBlue, in: RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(.plain)
                .help("Создать папку с базовым шаблоном")
            }
            .padding(.horizontal, 17)
            .padding(.top, 19)
            .padding(.bottom, 15)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(DeskPalette.secondary)
                TextField("Поиск шаблона", text: $search)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 9))
            .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(DeskPalette.border) }
            .padding(.horizontal, 14)
            .padding(.bottom, 17)

            ScrollView {
                VStack(alignment: .leading, spacing: 17) {
                    VStack(alignment: .leading, spacing: 6) {
                        sectionTitle("ПАПКИ")

                        libraryRow(
                            title: "Без папки",
                            icon: "tray",
                            selected: store.selectedFolderID == nil,
                            detail: "\(store.templates.filter { $0.folderID == nil }.count)"
                        ) {
                            store.selectUngrouped()
                        }

                        ForEach(store.folders) { folder in
                            HStack(spacing: 4) {
                                libraryRow(
                                    title: folder.name,
                                    icon: "folder",
                                    selected: store.selectedFolderID == folder.id,
                                    detail: "\(store.templates.filter { $0.folderID == folder.id }.count)"
                                ) {
                                    store.selectFolder(folder.id)
                                }

                                Menu {
                                    Button("Заполнить и напечатать") { store.selectFolder(folder.id) }
                                    Button("Изменить базовый макет") {
                                        store.selectFolder(folder.id)
                                        store.editBaseTemplate()
                                    }
                                    Divider()
                                    Button("Переименовать") {
                                        nameInput = folder.name
                                        renameFolder = folder
                                    }
                                    Button("Удалить папку", role: .destructive) {
                                        pendingDeletion = .folder(folder)
                                        showDeletion = true
                                    }
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .foregroundStyle(DeskPalette.secondary)
                                        .frame(width: 19, height: 32)
                                }
                                .menuStyle(.borderlessButton)
                                .fixedSize()
                            }
                        }

                        if store.folders.isEmpty {
                            Text("Создайте папку, чтобы быстро печатать по одному макету.")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.horizontal, 9)
                                .padding(.top, 4)
                        }
                    }

                    Rectangle().fill(DeskPalette.border).frame(height: 1)

                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            sectionTitle("ШАБЛОНЫ")
                            Spacer()
                            Text("\(visibleTemplates.count)")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                        }
                        if visibleTemplates.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 22))
                                    .foregroundStyle(DeskPalette.secondary.opacity(0.6))
                                Text(search.isEmpty ? "В этой папке пока нет шаблонов." : "Ничего не найдено.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(DeskPalette.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                        }

                        ForEach(visibleTemplates) { template in
                            HStack(spacing: 4) {
                                Button {
                                    store.load(template)
                                } label: {
                                    HStack(spacing: 9) {
                                        Image(systemName: store.activeFolder?.baseTemplateID == template.id
                                              ? "star.fill" : "doc.text")
                                            .foregroundStyle(store.activeFolder?.baseTemplateID == template.id
                                                             ? DeskPalette.accent : DeskPalette.secondary)
                                            .frame(width: 20)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(template.name)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(DeskPalette.ink)
                                                .lineLimit(1)
                                            Text("\(Int(template.widthMM)) × \(Int(template.heightMM)) мм")
                                                .font(.system(size: 10))
                                                .foregroundStyle(DeskPalette.secondary)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 8)
                                    .background(store.document.id == template.id && store.mode == .editor
                                                ? DeskPalette.paleBlue : Color.clear,
                                                in: RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)

                                Menu {
                                    Button("Открыть в редакторе") { store.load(template) }
                                    Button("Создать копию") { store.duplicateTemplate(template) }
                                    Menu("Переместить") {
                                        Button("Без папки") { store.moveTemplate(template, to: nil) }
                                        ForEach(store.folders) { folder in
                                            Button(folder.name) { store.moveTemplate(template, to: folder.id) }
                                        }
                                    }
                                    .disabled(store.folders.contains(where: { $0.baseTemplateID == template.id }))
                                    if store.activeFolder != nil {
                                        Button("Назначить базовым") { store.makeBaseTemplate(template) }
                                    }
                                    Divider()
                                    Button("Удалить", role: .destructive) {
                                        pendingDeletion = .template(template)
                                        showDeletion = true
                                    }
                                    .disabled(store.folders.contains(where: { $0.baseTemplateID == template.id }))
                                } label: {
                                    Image(systemName: "ellipsis")
                                        .foregroundStyle(DeskPalette.secondary)
                                        .frame(width: 19, height: 32)
                                }
                                .menuStyle(.borderlessButton)
                                .fixedSize()
                            }
                        }
                    }

                    DisclosureGroup(isExpanded: $showSizes) {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(LabelPreset.standard) { preset in
                                Button {
                                    store.mode = .editor
                                    store.apply(preset)
                                } label: {
                                    Label(preset.title, systemImage: "rectangle.dashed")
                                        .font(.system(size: 12))
                                        .foregroundStyle(DeskPalette.ink)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 6)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 7)
                    } label: {
                        Text("Размеры этикеток")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(DeskPalette.ink)
                    }
                    .padding(.horizontal, 9)
                }
                .padding(.horizontal, 13)
                .padding(.bottom, 20)
            }

            HStack(spacing: 8) {
                Button {
                    store.newDocument()
                } label: {
                    Label("Новый макет", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(13)
            .background(Color.white)
            .overlay(alignment: .top) { DeskPalette.border.frame(height: 1) }
        }
        .background(DeskPalette.background)
        .sheet(isPresented: $createFolder) {
            folderDialog(title: "Новая папка",
                         explanation: "Для неё будет сохранена копия текущего макета.",
                         action: {
                store.createFolder(named: nameInput)
                createFolder = false
            })
        }
        .sheet(item: $renameFolder) { folder in
            folderDialog(title: "Переименовать папку", explanation: folder.name, action: {
                store.renameFolder(folder.id, to: nameInput)
                renameFolder = nil
            })
        }
        .alert("Подтвердите удаление", isPresented: $showDeletion) {
            Button("Удалить", role: .destructive) {
                switch pendingDeletion {
                case .folder(let folder): store.deleteFolder(folder.id)
                case .template(let template): store.deleteTemplate(template)
                case nil: break
                }
                pendingDeletion = nil
            }
            Button("Отмена", role: .cancel) { pendingDeletion = nil }
        } message: {
            Text(pendingDeletion?.description ?? "")
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(DeskPalette.secondary)
            .padding(.horizontal, 9)
            .padding(.bottom, 5)
    }

    private func libraryRow(
        title: String, icon: String, selected: Bool, detail: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .frame(width: 20)
                Text(title)
                    .font(.system(size: 12, weight: selected ? .semibold : .medium))
                    .lineLimit(1)
                Spacer(minLength: 3)
                Text(detail)
                    .font(.system(size: 10))
                    .foregroundStyle(DeskPalette.secondary)
            }
            .foregroundStyle(selected ? DeskPalette.accent : DeskPalette.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .background(selected ? DeskPalette.paleBlue : Color.clear,
                        in: RoundedRectangle(cornerRadius: 9))
        }
        .buttonStyle(.plain)
    }

    private func folderDialog(title: String, explanation: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 15) {
            Text(title).font(.system(size: 21, weight: .semibold))
            Text(explanation)
                .font(.system(size: 13))
                .foregroundStyle(DeskPalette.secondary)
            TextField("Название папки", text: $nameInput)
                .textFieldStyle(.roundedBorder)
                .controlSize(.large)
                .onSubmit(action)
            HStack {
                Button("Отмена") {
                    createFolder = false
                    renameFolder = nil
                }
                Spacer()
                Button("Сохранить", action: action)
                    .buttonStyle(.borderedProminent)
                    .tint(DeskPalette.accent)
                    .disabled(nameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 420)
    }
}
