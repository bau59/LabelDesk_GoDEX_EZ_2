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
    @Published var rasterProbePending = false
    @Published var feedTestPending = false
    @Published var registrationVerified = UserDefaults.standard.bool(forKey: "ez2V05FeedConfirmed")
    @Published var rasterVerified = UserDefaults.standard.bool(forKey: "ez2RasterVerified")
    @Published var showSettings = false
    @Published var showCalibration = false
    @Published var showQueue = false
    @Published var alert: AppAlert?
    @Published var undoStack: [LabelDocument] = []
    @Published var redoStack: [LabelDocument] = []

    let storage = StorageService()
    let serialPort = SerialPortService()
    let encoder = GodexEZ2Encoder()
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
            if !queue.isPaused && rasterVerified && registrationVerified {
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
        if !queue.isPaused && rasterVerified && registrationVerified {
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
        // Material registration must be rechecked after changing sensor or Q.
        let oldProfile = storage.loadSettings().profile
        if oldProfile.topOfFormDots != settings.profile.topOfFormDots
            || oldProfile.sensorMode != settings.profile.sensorMode {
            registrationVerified = false
            feedTestPending = false
            queue.pause()
            UserDefaults.standard.set(false, forKey: "ez2V05FeedConfirmed")
        }
        do {
            try storage.saveSettings(settings)
            status = settings.profile.portPath.isEmpty ? "No serial port selected" : "Ready: \(settings.profile.portPath)"
        } catch { alert = AppAlert(title: "Could not save settings", message: error.localizedDescription) }
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
            if !queue.isPaused && rasterVerified && registrationVerified { queue.process(profile: settings.profile) }
            status = "Added to queue"
        } catch {
            alert = AppAlert(title: "Label cannot be printed", message: error.localizedDescription)
        }
    }

    func startQueue() {
        guard rasterVerified else {
            alert = AppAlert(title: "Verify graphics first",
                             message: "Press Raster TEST and verify the small square on paper. Normal labels use ESC G and are disabled until you confirm this test.")
            return
        }
        guard registrationVerified else {
            alert = AppAlert(title: "Verify label advance",
                             message: "Print one Feed TEST and confirm that the printer advances to the next label. Existing raster jobs stopped at the end of the picture.")
            return
        }
        guard !settings.profile.portPath.isEmpty else {
            alert = AppAlert(title: "Choose serial port", message: "Open printer settings and select the USB–RS232 port.")
            return
        }
        queue.resume()
        queue.process(profile: settings.profile)
    }

    func pauseQueue() { queue.pause() }

    func sendFeedTest() {
        let profile = settings.profile
        guard !profile.portPath.isEmpty else {
            alert = AppAlert(title: "Choose serial port", message: "Connect and select the USB–RS232 port.")
            return
        }
        var sample = document
        sample.elements = [
            LabelElement(kind: .text, xMM: 1, yMM: 1,
                         widthMM: min(15, sample.widthMM - 2),
                         heightMM: min(7, sample.heightMM - 2),
                         value: "FEED", fontSize: 10)
        ]
        let data: Data
        do {
            data = try encoder.nativeCommands(for: sample, profile: profile)
        } catch {
            alert = AppAlert(title: "Invalid label size", message: error.localizedDescription)
            return
        }
        alert = AppAlert(
            title: "Print one Feed TEST?",
            message: "Uses the current label size and gap: \(Int(document.widthMM))×\(Int(document.heightMM)) mm, gap \(Int(document.gapMM)) mm. The printer will print FEED and should stop at the beginning of the NEXT label. Check that the material matches these settings.",
            action: { [weak self] in self?.performFeedTest(data: data, profile: profile) }
        )
    }

    private func performFeedTest(data: Data, profile: PrinterProfile) {
        feedTestPending = false
        status = "Sending one Feed TEST…"
        Task.detached { [serialPort] in
            do {
                try serialPort.write(data, profile: profile)
                await MainActor.run {
                    self.feedTestPending = true
                    self.status = "FEED sent; verify next-label registration"
                }
            } catch {
                await MainActor.run {
                    self.status = "Feed test failed"
                    self.alert = AppAlert(title: "Feed TEST failed", message: error.localizedDescription)
                }
            }
        }
    }

    func confirmFeedTest() {
        guard feedTestPending else { return }
        alert = AppAlert(
            title: "Did paper reach the next label?",
            message: "Confirm only if FEED printed and the printer advanced to the correct starting position of the next label. This enables normal queue printing.",
            action: { [weak self] in
                guard let self else { return }
                self.feedTestPending = false
                self.registrationVerified = true
                UserDefaults.standard.set(true, forKey: "ez2V05FeedConfirmed")
                self.status = "Graphics and label advance verified"
            }
        )
    }

    func sendRasterProbe() {
        let profile = settings.profile
        guard !profile.portPath.isEmpty else {
            alert = AppAlert(title: "Choose serial port", message: "Select the USB–RS232 port in Printer settings.")
            return
        }
        alert = AppAlert(title: "Print a graphics test?",
                         message: "Sends 40 graphic rows (a small letter L with an isolated upper-right mark) using ESC G. It may advance one label. Confirm paper is loaded.",
                         action: { [weak self] in self?.performRasterProbe(profile: profile) })
    }

    private func performRasterProbe(profile: PrinterProfile) {
        status = "Sending raster probe…"
        rasterProbePending = false
        let data = encoder.rasterProbe()
        Task.detached { [serialPort] in
            do {
                try serialPort.write(data, profile: profile)
                await MainActor.run {
                    self.rasterProbePending = true
                    self.status = "Raster probe sent; confirm paper result"
                }
            } catch {
                await MainActor.run {
                    self.status = "Raster probe failed"
                    self.alert = AppAlert(title: "Could not send graphics test", message: error.localizedDescription)
                }
            }
        }
    }

    func confirmRasterProbe() {
        guard rasterProbePending else { return }
        alert = AppAlert(title: "Confirm graphics test",
                         message: "Did the printer produce a black L with a small, separate upper-right mark, without garbled text or runaway feeding? Confirm only if the output was correct.",
                         action: { [weak self] in
            guard let self = self else { return }
            self.rasterVerified = true
            self.rasterProbePending = false
            UserDefaults.standard.set(true, forKey: "ez2RasterVerified")
            self.status = "Graphics verified; label printing enabled"
        })
    }

    func sendFontTest() {
        let profile = settings.profile
        guard !profile.portPath.isEmpty else {
            alert = AppAlert(title: "Select a port", message: "Choose the USB–RS232 port in settings.")
            return
        }
        alert = AppAlert(
            title: "Print native ASCII font test?",
            message: "Prints one label using the EZ-2 built-in 8×10 and 16×26 ASCII fonts. Paper should be loaded. This test does not enable hybrid printing.",
            action: { [weak self] in self?.performFontTest(profile: profile) }
        )
    }

    private func performFontTest(profile: PrinterProfile) {
        status = "Sending built-in font test…"
        let data = encoder.nativeFontProbe(profile: profile)
        Task.detached { [serialPort] in
            do {
                try serialPort.write(data, profile: profile)
                await MainActor.run {
                    self.status = "Native font TEST sent — inspect the printed label"
                }
            } catch {
                await MainActor.run {
                    self.status = "Native font TEST failed"
                    self.alert = AppAlert(title: "Font test could not be sent", message: error.localizedDescription)
                }
            }
        }
    }

    func sendTest() {
        let profile = settings.profile
        guard !profile.portPath.isEmpty else {
            alert = AppAlert(title: "Select a port first", message: "Open Printer settings and choose the USB–RS232 device.")
            return
        }
        alert = AppAlert(title: "Print TEST?", message: "This sends the verified TEST command to \(profile.portPath). Ensure paper is loaded.", action: { [weak self] in
            self?.performTest(profile: profile)
        })
    }

    private func performTest(profile: PrinterProfile) {
        status = "Sending TEST…"
        let data = encoder.testLabel(profile: profile)
        Task.detached { [serialPort] in
            do {
                try serialPort.write(data, profile: profile)
                await MainActor.run { self.status = "TEST sent to serial port (physical print not confirmed)" }
            } catch {
                await MainActor.run { self.status = "TEST failed"; self.alert = AppAlert(title: "TEST was not sent", message: error.localizedDescription) }
            }
        }
    }
}

struct AppAlert: Identifiable {
    let id = UUID()
    let title: String
    let message: String
    var action: (() -> Void)?
}
