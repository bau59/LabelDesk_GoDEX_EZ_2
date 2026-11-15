import Foundation

@MainActor
final class PrintQueueService: ObservableObject {
    @Published private(set) var jobs: [PrintJob]
    @Published private(set) var isPaused = false
    private let storage: StorageService
    private let port = SerialPortService()
    private let encoder = GodexEZ2Encoder()

    init(storage: StorageService) {
        self.storage = storage
        jobs = storage.loadQueue().map { job in
            var restored = job
            if restored.state == .sending { restored.state = .uncertain }
            return restored
        }
    }

    func enqueue(document: LabelDocument, copies: Int) {
        jobs.append(PrintJob(document: document, copies: max(1, copies)))
        persist()
    }

    func cancel(_ id: UUID) {
        guard let index = jobs.firstIndex(where: { $0.id == id }), jobs[index].state == .pending else { return }
        jobs[index].state = .cancelled
        persist()
    }

    func retry(_ id: UUID) {
        guard let index = jobs.firstIndex(where: { $0.id == id }), [.failed, .uncertain].contains(jobs[index].state) else { return }
        jobs[index].state = .pending
        jobs[index].errorMessage = nil
        persist()
    }

    func clearCompleted() {
        jobs.removeAll { [.sent, .cancelled].contains($0.state) }
        persist()
    }

    func togglePause() { isPaused.toggle() }

    func process(profile: PrinterProfile) {
        guard !isPaused, let index = jobs.firstIndex(where: { $0.state == .pending }) else { return }
        jobs[index].state = .sending
        persist()
        let job = jobs[index]
        Task.detached { [port, encoder] in
            do {
                let data = try encoder.nativeCommands(for: job.document, profile: profile)
                for _ in 0..<job.copies { try port.write(data, profile: profile) }
                await self.finish(job.id, state: .sent, error: nil, profile: profile)
            } catch {
                await self.finish(job.id, state: .failed, error: error.localizedDescription, profile: profile)
            }
        }
    }

    private func finish(_ id: UUID, state: PrintJobState, error: String?, profile: PrinterProfile) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[index].state = state
        jobs[index].errorMessage = error
        persist()
        if state == .sent { process(profile: profile) }
    }

    private func persist() { try? storage.saveQueue(jobs) }
}
