import Foundation

enum LabelDeskMode: String {
    case editor, quick
}


@MainActor
final class AppStore: ObservableObject {
    @Published var document = LabelDocument()
    @Published var selectedElementID: UUID?
    @Published var settings: AppSettings
    @Published var templates: [LabelDocument] = []
    @Published var folders: [LabelFolder] = []
    @Published var selectedFolderID: UUID?
    @Published var mode: LabelDeskMode = .editor
    @Published var quickValues: [UUID: String] = [:]
    @Published var status = "No serial port selected"
    @Published var copies = 1
    @Published var showSettings = false
    @Published var showQueue = false
    @Published var alert: AppAlert?
    @Published var undoStack: [LabelDocument] = []
    @Published var redoStack: [LabelDocument] = []

    let storage = StorageService()
    let queue: PrintQueueService

    init() {
        var loadedSettings = storage.loadSettings()
        if loadedSettings.profile.portPath.isEmpty {
            loadedSettings.profile.portPath = UserDefaults.standard.string(forKey: "serialPort") ?? ""
        }
        settings = loadedSettings
        templates = storage.listDocuments()
        folders = storage.loadFolders()
        queue = PrintQueueService(storage: storage)
        if !settings.profile.portPath.isEmpty { status = "Ready: \(settings.profile.portPath)" }
        if let raw = UserDefaults.standard.string(forKey: "labeldeskLastFolder"),
           let id = UUID(uuidString: raw),
           folders.contains(where: { $0.id == id }) {
            selectFolder(id)
        }
    }


    var activeFolder: LabelFolder? {
        folders.first { $0.id == selectedFolderID }
    }

    var baseTemplate: LabelDocument? {
        guard let id = activeFolder?.baseTemplateID else { return nil }
        return templates.first { $0.id == id }
    }

    var quickFields: [QuickLabelField] {
        guard let base = baseTemplate else { return [] }
        return QuickLabelBuilder.fields(for: base)
    }

    var quickDocument: LabelDocument? {
        guard let base = baseTemplate else { return nil }
        return QuickLabelBuilder.filled(base: base, values: quickValues)
    }

    func selectFolder(_ id: UUID) {
        guard folders.contains(where: { $0.id == id }) else { return }
        selectedFolderID = id
        if let base = baseTemplate {
            document = base
            selectedElementID = nil
        }
        mode = .quick
        UserDefaults.standard.set(id.uuidString, forKey: "labeldeskLastFolder")
        prepareQuickValues()
    }

    func selectUngrouped() {
        selectedFolderID = nil
        mode = .editor
        document = templates.first(where: { $0.folderID == nil }) ?? LabelDocument()
        selectedElementID = nil
        quickValues = [:]
        UserDefaults.standard.removeObject(forKey: "labeldeskLastFolder")
    }

    func prepareQuickValues() {
        guard let base = baseTemplate else {
            quickValues = [:]
            return
        }
        quickValues = Dictionary(
            uniqueKeysWithValues: QuickLabelBuilder.fields(for: base).map { ($0.id, $0.initialValue) }
        )
    }

    /// Creates an actual independent saved base document, never a reference
    /// to a different folder's template or to the current unsaved editor buffer.
    func createFolder(named rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 60 else {
            alert = AppAlert(title: "Название папки", message: "Введите от 1 до 60 символов.")
            return
        }
        guard !folders.contains(where: { $0.name.compare(name, options: .caseInsensitive) == .orderedSame }) else {
            alert = AppAlert(title: "Папка существует", message: "Выберите другое название.")
            return
        }
        let folderID = UUID()
        var base = (mode == .quick ? (quickDocument ?? document) : document)
        base.id = UUID()
        base.folderID = folderID
        base.name = "Базовый шаблон"
        base.updatedAt = Date()
        let folder = LabelFolder(id: folderID, name: name, baseTemplateID: base.id)
        do {
            try storage.saveDocument(base)
            do { try storage.saveFolders(folders + [folder]) }
            catch {
                try? storage.deleteDocument(base.id)
                throw error
            }
            templates = storage.listDocuments()
            folders = storage.loadFolders()
            selectFolder(folderID)
            status = "Создана папка «\(name)»"
        } catch {
            alert = AppAlert(title: "Не удалось создать папку", message: error.localizedDescription)
        }
    }

    func renameFolder(_ folderID: UUID, to rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 60,
              !folders.contains(where: { $0.id != folderID && $0.name.compare(name, options: .caseInsensitive) == .orderedSame }),
              let index = folders.firstIndex(where: { $0.id == folderID }) else {
            alert = AppAlert(title: "Некорректное название", message: "Название пустое, слишком длинное или уже используется.")
            return
        }
        var updated = folders
        updated[index].name = name
        do {
            try storage.saveFolders(updated)
            folders = storage.loadFolders()
        } catch {
            alert = AppAlert(title: "Не удалось переименовать", message: error.localizedDescription)
        }
    }

    /// Non-destructive: orphaning a folder moves its templates to "Без папки".
    func deleteFolder(_ folderID: UUID) {
        guard folders.contains(where: { $0.id == folderID }) else { return }
        do {
            for var template in templates where template.folderID == folderID {
                template.folderID = nil
                try storage.saveDocument(template)
            }
            try storage.saveFolders(folders.filter { $0.id != folderID })
            templates = storage.listDocuments()
            folders = storage.loadFolders()
            if selectedFolderID == folderID {
                selectUngrouped()
                newDocument()
            }
        } catch {
            alert = AppAlert(title: "Не удалось удалить папку", message: error.localizedDescription)
            templates = storage.listDocuments()
        }
    }

    func editBaseTemplate() {
        guard let base = baseTemplate else { return }
        load(base)
    }

    func makeBaseTemplate(_ template: LabelDocument) {
        guard let folderID = selectedFolderID,
              let index = folders.firstIndex(where: { $0.id == folderID }),
              template.folderID == folderID else { return }
        var next = folders
        next[index].baseTemplateID = template.id
        do {
            try storage.saveFolders(next)
            folders = storage.loadFolders()
            prepareQuickValues()
            mode = .quick
        } catch {
            alert = AppAlert(title: "Не удалось назначить шаблон", message: error.localizedDescription)
        }
    }

    func duplicateTemplate(_ template: LabelDocument) {
        var copy = template
        copy.id = UUID()
        copy.name = template.name + " — копия"
        copy.updatedAt = Date()
        do {
            try storage.saveDocument(copy)
            templates = storage.listDocuments()
            load(copy)
        } catch {
            alert = AppAlert(title: "Не удалось дублировать", message: error.localizedDescription)
        }
    }

    func moveTemplate(_ template: LabelDocument, to folderID: UUID?) {
        guard folderID == nil || folders.contains(where: { $0.id == folderID }) else { return }
        guard !folders.contains(where: { $0.baseTemplateID == template.id }) else {
            alert = AppAlert(title: "Базовый шаблон", message: "Сначала назначьте другой базовый шаблон.")
            return
        }
        var updated = template
        updated.folderID = folderID
        updated.updatedAt = Date()
        do {
            try storage.saveDocument(updated)
            templates = storage.listDocuments()
            if document.id == updated.id { document.folderID = folderID }
            status = "Шаблон перемещён"
        } catch {
            alert = AppAlert(title: "Не удалось переместить", message: error.localizedDescription)
        }
    }

    func saveQuickVariant(named rawName: String) {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= 80, var copy = quickDocument else {
            alert = AppAlert(title: "Название варианта", message: "Введите название от 1 до 80 символов.")
            return
        }
        copy.id = UUID()
        copy.folderID = selectedFolderID
        copy.name = name
        copy.updatedAt = Date()
        do {
            try LabelRasterizer.validate(copy)
            try storage.saveDocument(copy)
            templates = storage.listDocuments()
            status = "Вариант «\(name)» сохранён в папке"
        } catch {
            alert = AppAlert(title: "Не удалось сохранить вариант", message: error.localizedDescription)
        }
    }

    func deleteTemplate(_ template: LabelDocument) {
        guard !folders.contains(where: { $0.baseTemplateID == template.id }) else {
            alert = AppAlert(title: "Базовый шаблон", message: "Сначала назначьте другой базовый шаблон для этой папки.")
            return
        }
        do {
            try storage.deleteDocument(template.id)
            templates = storage.listDocuments()
            if document.id == template.id { newDocument() }
        } catch {
            alert = AppAlert(title: "Не удалось удалить шаблон", message: error.localizedDescription)
        }
    }

    func enqueueQuick() {
        guard var filled = quickDocument else { return }
        do {
            try LabelRasterizer.validate(filled)
            filled.name = activeFolder?.name ?? filled.name
            queue.enqueue(document: filled, copies: copies)
            if !queue.isPaused {
                queue.process(profile: settings.profile)
            }
            status = "Этикетка добавлена в очередь"
        } catch {
            alert = AppAlert(title: "Ошибка этикетки", message: error.localizedDescription)
        }
    }

    /// A simple single-column batch: one nonempty line becomes one label.
    /// Validate the entire batch BEFORE enqueuing any rows.
    func enqueueQuickBatch(fieldID: UUID, text: String) {
        guard let base = baseTemplate,
              quickFields.contains(where: { $0.id == fieldID }) else { return }
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty, lines.count <= 200 else {
            alert = AppAlert(title: "Список значений", message: "Введите от 1 до 200 непустых строк.")
            return
        }
        var documents: [LabelDocument] = []
        do {
            for (index, value) in lines.enumerated() {
                var values = quickValues
                values[fieldID] = value
                var document = QuickLabelBuilder.filled(base: base, values: values)
                try LabelRasterizer.validate(document)
                document.name = "\(activeFolder?.name ?? base.name) · \(index + 1)"
                documents.append(document)
            }
        } catch {
            alert = AppAlert(title: "Невозможно напечатать список", message: error.localizedDescription)
            return
        }
        for document in documents { queue.enqueue(document: document, copies: copies) }
        if !queue.isPaused {
            queue.process(profile: settings.profile)
        }
        status = "В очередь добавлено \(documents.count) этикеток"
    }

    var selectedElement: LabelElement? { document.elements.first { $0.id == selectedElementID } }

    func newDocument() {
        checkpoint()
        document = LabelDocument()
        document.folderID = selectedFolderID
        mode = .editor
        selectedElementID = nil
    }

    func apply(_ preset: LabelPreset) {
        checkpoint()
        document.widthMM = preset.widthMM
        document.heightMM = preset.heightMM
    }

    func load(_ template: LabelDocument) {
        checkpoint()
        document = template
        selectedFolderID = template.folderID
        mode = .editor
        selectedElementID = nil
    }

    func saveDocument() {
        document.updatedAt = Date()
        do {
            try storage.saveDocument(document)
            templates = storage.listDocuments()
            // Keep quick-fill defaults synchronized after edits to the base.
            if activeFolder?.baseTemplateID == document.id {
                prepareQuickValues()
            }
            status = "Saved \(document.name)"
        } catch { alert = AppAlert(title: "Could not save", message: error.localizedDescription) }
    }

    func saveSettings() {
        let previous = storage.loadSettings().profile
        if previous.portPath != settings.profile.portPath
            || previous.labelIntervalSeconds != settings.profile.labelIntervalSeconds {
            queue.pause()
        }
        do {
            try storage.saveSettings(settings)
            status = settings.profile.portPath.isEmpty ? "Порт не выбран" : "Готово: \(settings.profile.portPath)"
        } catch {
            alert = AppAlert(title: "Ошибка сохранения", message: error.localizedDescription)
        }
    }

    func add(_ element: LabelElement) {
        checkpoint()
        document.elements.append(element)
        selectedElementID = element.id
    }

    func updateElement(_ element: LabelElement) {
        guard let index = document.elements.firstIndex(where: { $0.id == element.id }) else { return }
        document.elements[index] = element
    }

    func removeSelected() {
        guard let id = selectedElementID else { return }
        checkpoint()
        document.elements.removeAll { $0.id == id }
        selectedElementID = nil
    }

    func duplicateSelected() {
        guard var element = selectedElement else { return }
        checkpoint()
        element.id = UUID()
        element.xMM += 2
        element.yMM += 2
        document.elements.append(element)
        selectedElementID = element.id
    }

    func checkpoint() {
        undoStack.append(document)
        if undoStack.count > 40 { undoStack.removeFirst() }
        redoStack.removeAll()
    }

    func undo() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(document)
        document = previous
        selectedElementID = nil
    }

    func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(document)
        document = next
        selectedElementID = nil
    }

    func enqueue() {
        do {
            try LabelRasterizer.validate(document)
            queue.enqueue(document: document, copies: copies)
            if !queue.isPaused { queue.process(profile: settings.profile) }
            status = "Added to queue"
        } catch {
            alert = AppAlert(title: "Label cannot be printed", message: error.localizedDescription)
        }
    }

    func startQueue(onlyOne: Bool = false) {
        guard !settings.profile.portPath.isEmpty else {
            alert = AppAlert(title: "Порт не выбран", message: "Выберите USB–RS232 порт в настройках.")
            return
        }
        queue.resume(onlyOne: onlyOne)
        queue.process(profile: settings.profile)
    }

    func pauseQueue() { queue.pause() }

}

struct AppAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    var action: (() -> Void)?
}
