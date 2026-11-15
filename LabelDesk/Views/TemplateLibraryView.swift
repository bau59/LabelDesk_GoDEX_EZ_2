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
                return "Удалить папку «\(folder.name)»? Её шаблоны останутся в разделе «Без папки»."
            case .template(let template):
                return "Удалить шаблон «\(template.name)»? Это действие нельзя отменить."
            }
        }
    }

    private var visibleTemplates: [LabelDocument] {
        store.templates.filter { template in
            let matchingFolder = template.folderID == store.selectedFolderID
            let matchingSearch = search.isEmpty ||
                template.name.localizedStandardContains(search)
            return matchingFolder && matchingSearch
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Библиотека").font(.headline)
                Spacer()
                Button {
                    nameInput = ""
                    createFolder = true
                } label: {
                    Image(systemName: "folder.badge.plus")
                }
                .help("Новая папка с копией текущего макета как базовым")
            }
            .padding(12)

            List {
                Section("Папки") {
                    Button {
                        store.selectUngrouped()
                    } label: {
                        Label("Без папки", systemImage: "tray")
                            .foregroundStyle(store.selectedFolderID == nil ? Color.accentColor : Color.primary)
                    }
                    .buttonStyle(.plain)

                    ForEach(store.folders) { folder in
                        HStack(spacing: 6) {
                            Button {
                                store.selectFolder(folder.id)
                            } label: {
                                HStack {
                                    Image(systemName: "folder")
                                    Text(folder.name).lineLimit(1)
                                    Spacer(minLength: 0)
                                }
                                .foregroundStyle(store.selectedFolderID == folder.id ? Color.accentColor : Color.primary)
                            }
                            .buttonStyle(.plain)

                            Menu {
                                Button("Быстрое заполнение") { store.selectFolder(folder.id) }
                                Button("Редактировать базовый") {
                                    store.selectFolder(folder.id)
                                    store.editBaseTemplate()
                                }
                                Button("Переименовать") {
                                    nameInput = folder.name
                                    renameFolder = folder
                                }
                                Divider()
                                Button("Удалить папку", role: .destructive) {
                                    pendingDeletion = .folder(folder)
                                    showDeletion = true
                                }
                            } label: {
                                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                            }
                            .menuStyle(.borderlessButton)
                            .frame(width: 25)
                        }
                    }
                }

                Section {
                    if visibleTemplates.isEmpty {
                        Text("В этой папке нет шаблонов")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(visibleTemplates) { template in
                        HStack(spacing: 4) {
                            Button {
                                store.load(template)
                            } label: {
                                HStack(spacing: 5) {
                                    Image(systemName: store.activeFolder?.baseTemplateID == template.id ? "star.fill" : "doc.text")
                                        .foregroundStyle(store.activeFolder?.baseTemplateID == template.id ? Color.orange : Color.secondary)
                                    Text(template.name).lineLimit(1)
                                }
                            }
                            .buttonStyle(.plain)
                            Spacer(minLength: 0)
                            Menu {
                                Button("Открыть в редакторе") { store.load(template) }
                                Button("Создать копию") { store.duplicateTemplate(template) }
                                if store.activeFolder != nil {
                                    Button("Сделать базовым") { store.makeBaseTemplate(template) }
                                }
                                Divider()
                                Button("Удалить", role: .destructive) {
                                    pendingDeletion = .template(template)
                                    showDeletion = true
                                }
                                .disabled(store.folders.contains(where: { $0.baseTemplateID == template.id }))
                            } label: {
                                Image(systemName: "ellipsis").foregroundStyle(.secondary)
                            }
                            .menuStyle(.borderlessButton)
                            .frame(width: 25)
                        }
                    }
                } header: {
                    Text("Шаблоны")
                }

                Section {
                    DisclosureGroup("Готовые размеры", isExpanded: $showSizes) {
                        ForEach(LabelPreset.standard) { preset in
                            Button(preset.title) {
                                store.mode = .editor
                                store.apply(preset)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .searchable(text: $search, prompt: "Найти шаблон")
        }
        .sheet(isPresented: $createFolder) {
            folderDialog(title: "Новая папка",
                         explanation: "Базовый шаблон будет создан как отдельная копия текущего макета.",
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

    private func folderDialog(title: String, explanation: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.title2)
            Text(explanation).foregroundStyle(.secondary)
            TextField("Название", text: $nameInput)
                .textFieldStyle(.roundedBorder)
                .onSubmit(action)
            HStack {
                Button("Отмена") {
                    createFolder = false
                    renameFolder = nil
                }
                Spacer()
                Button("Сохранить", action: action)
                    .buttonStyle(.borderedProminent)
                    .disabled(nameInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 390)
    }
}
