import Foundation
import CryptoKit

@MainActor
final class PrintQueueService: ObservableObject {
    @Published private(set) var jobs: [PrintJob]
    @Published private(set) var isPaused = true

    let diagnostics = PrintDiagnostics()
    private let storage: StorageService
    private let port = SerialPortService()
    private let encoder = GodexEZ2Encoder()
    private var stopAfterCurrent = false

    init(storage: StorageService) {
        self.storage = storage
        jobs = storage.loadQueue().map { job in
            var restored = job
            if restored.state == .sending { restored.state = .uncertain }
            return restored
        }
        diagnostics.record("queue restored", details: "jobs=\(jobs.count), transmission paused")
    }

    func enqueue(document: LabelDocument, copies: Int) {
        let job = PrintJob(document: document, copies: max(1, copies))
        jobs.append(job)
        persist()
        diagnostics.record("queued", jobID: job.id,
                           details: "size=\(document.widthMM)x\(document.heightMM)mm gap=\(document.gapMM)mm copies=\(job.copies)")
    }

    func cancel(_ id: UUID) {
        guard let index = jobs.firstIndex(where: { $0.id == id }), jobs[index].state == .pending else { return }
        jobs[index].state = .cancelled
        persist()
        diagnostics.record("cancelled", jobID: id)
    }

    func retry(_ id: UUID) {
        guard let index = jobs.firstIndex(where: { $0.id == id }),
              [.failed, .uncertain].contains(jobs[index].state) else { return }
        jobs[index].state = .pending
        jobs[index].errorMessage = nil
        persist()
        diagnostics.record("manual retry", jobID: id,
                           details: "User must inspect paper to avoid duplicate labels")
    }

    /// An explicit new job: preserve the original transmission record.
    /// Requires user confirmation in the UI because physical output is unknown.
    func requeueSent(_ id: UUID) {
        guard let previous = jobs.first(where: { $0.id == id && $0.state == .sent }) else { return }
        var retry = previous
        retry.id = UUID()
        retry.addedAt = Date()
        retry.state = .pending
        retry.errorMessage = nil
        jobs.append(retry)
        persist()
        diagnostics.record("manual resend queued", jobID: retry.id,
                           details: "previousJob=\(id.uuidString) copies=\(retry.copies), duplication possible")
    }

    func clearCompleted() {
        let count = jobs.filter { [.sent, .cancelled].contains($0.state) }.count
        jobs.removeAll { [.sent, .cancelled].contains($0.state) }
        persist()
        diagnostics.record("queue cleared", details: "removed=\(count)")
    }

    func pause() {
        isPaused = true
        diagnostics.record("queue paused", details: "currently sending job may finish")
    }

    /// By default a one-job diagnostic run stops after the current job.
    /// Full batch printing requires a distinct explicit user action.
    func resume(onlyOne: Bool = false) {
        port.beginSeries()
        stopAfterCurrent = onlyOne
        isPaused = false
        diagnostics.record("queue started", details: onlyOne ? "mode=one-job" : "mode=full-batch")
    }

    func process(profile: PrinterProfile) {
        guard !isPaused, !jobs.contains(where: { $0.state == .sending }),
              let index = jobs.firstIndex(where: { $0.state == .pending }) else { return }

        jobs[index].state = .sending
        persist()
        let job = jobs[index]
        let diagnostics = self.diagnostics
        diagnostics.record("encode begin", jobID: job.id,
            details: "port=\(profile.portPath) 9600-8N1 G55 rows=280 interval=\(profile.labelIntervalSeconds)s copies=\(job.copies)")

        Task.detached { [port, encoder, diagnostics] in
            let data: Data
            do {
                data = try encoder.nativeCommands(for: job.document, profile: profile)
            } catch {
                await diagnostics.record("encode failed", jobID: job.id, details: error.localizedDescription)
                await self.finish(job.id, state: .failed,
                                  error: "Не удалось сформировать растр. Байты в порт не отправлялись: " + error.localizedDescription,
                                  profile: profile)
                return
            }

            let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            let theoretical = Double(data.count * 10) / Double(max(1, profile.baudRate))
            await diagnostics.record("encoded", jobID: job.id,
                details: "bytes/label=\(data.count) sha256=\(digest) theoreticalTX=\(String(format: "%.1f", theoretical))s at 9600 baud; physical print not verified")

            let started = Date()
            for copy in 1...job.copies {
                await diagnostics.record("serial begin", jobID: job.id,
                    details: "copy=\(copy)/\(job.copies), port=\(profile.portPath)")
                do {
                    try port.sendLabel(data, startup: encoder.startupCommands(), profile: profile) { stage in
                        Task { @MainActor in
                            diagnostics.record("serial", jobID: job.id, details: "copy=\(copy) \(stage)")
                        }
                    }
                    await diagnostics.record("serial returned", jobID: job.id,
                        details: "copy=\(copy)/\(job.copies) bytes=\(data.count) elapsed=\(String(format: "%.2f", Date().timeIntervalSince(started)))s. NO printer acknowledgement.")
                } catch {
                    await diagnostics.record("serial FAILED", jobID: job.id,
                        details: "copy=\(copy)/\(job.copies) \(error.localizedDescription)")
                    await self.finish(job.id, state: .uncertain,
                        error: "Передача прервана или могла быть частичной. Проверьте бумагу перед повтором. " + error.localizedDescription,
                        profile: profile)
                    return
                }
            }
            await diagnostics.record("sent to port", jobID: job.id,
                details: "copies=\(job.copies) totalElapsed=\(String(format: "%.2f", Date().timeIntervalSince(started)))s. Printer has not confirmed paper output.")
            await self.finish(job.id, state: .sent, error: nil, profile: profile)
        }
    }

    private func finish(_ id: UUID, state: PrintJobState, error: String?, profile: PrinterProfile) {
        guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[index].state = state
        jobs[index].errorMessage = error
        persist()
        if state != .sent || stopAfterCurrent {
            isPaused = true
            stopAfterCurrent = false
            diagnostics.record("queue stopped", jobID: id,
                details: state == .sent ? "one-job diagnostic completed; inspect actual label" : "error: no automatic retry")
        } else {
            process(profile: profile)
        }
    }

    private func persist() {
        do {
            try storage.saveQueue(jobs)
        } catch {
            diagnostics.record("PERSIST ERROR", details: error.localizedDescription)
        }
    }
}
