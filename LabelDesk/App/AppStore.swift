import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var document = LabelDocument()
    @Published var selectedElementID: UUID?
    @Published var settings: AppSettings
    @Published var templates: [LabelDocument] = []
    @Published var status = "No serial port selected"
    @Published var copies = 1
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
        settings = storage.loadSettings()
        if settings.profile.portPath.isEmpty {
            settings.profile.portPath = UserDefaults.standard.string(forKey: "serialPort") ?? ""
        }
        templates = storage.listDocuments()
        queue = PrintQueueService(storage: storage)
        if !settings.profile.portPath.isEmpty { status = "Ready: \(settings.profile.portPath)" }
    }

    var selectedElement: LabelElement? { document.elements.first { $0.id == selectedElementID } }

    func newDocument() {
        checkpoint()
        document = LabelDocument()
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
        selectedElementID = nil
    }

    func saveDocument() {
        document.updatedAt = Date()
        do {
            try storage.saveDocument(document)
            templates = storage.listDocuments()
            status = "Saved \(document.name)"
        } catch { alert = AppAlert(title: "Could not save", message: error.localizedDescription) }
    }

    func saveSettings() {
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
