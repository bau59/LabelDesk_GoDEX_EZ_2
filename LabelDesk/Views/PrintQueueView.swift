import SwiftUI

struct PrintQueueView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        QueueContent(queue: store.queue)
    }
}

private struct QueueContent: View {
    @EnvironmentObject private var store: AppStore
    @ObservedObject var queue: PrintQueueService

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 12) {
                Label(store.status, systemImage: store.rasterVerified ? "checkmark.circle" : "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(store.rasterVerified ? .secondary : .orange)
                Spacer()
                Stepper("Copies: \(store.copies)", value: $store.copies, in: 1...99)
                    .frame(width: 150)
                Button("Add label") { store.enqueue() }
                Button(queue.isPaused ? "Start queue" : "Pause") {
                    if queue.isPaused {
                        store.startQueue()
                    } else {
                        store.pauseQueue()
                    }
                }
                .buttonStyle(.borderedProminent)
                Button("Clear completed") { queue.clearCompleted() }
            }

            if !store.rasterVerified {
                HStack(spacing: 12) {
                    Text("Full labels use unverified ESC G graphics. First print Raster TEST, inspect the paper, then confirm.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                    if store.rasterProbePending {
                        Button("Raster TEST looks correct") { store.confirmRasterProbe() }
                    }
                }
            }

            if queue.jobs.isEmpty {
                Text("Queue is empty").foregroundStyle(.secondary)
                    .font(.caption)
            } else {
                List(queue.jobs) { job in
                    HStack(spacing: 10) {
                        Text(job.title).lineLimit(1)
                        Spacer()
                        Text(job.state.rawValue.capitalized)
                            .foregroundStyle(job.state == .failed || job.state == .uncertain ? .red : .secondary)
                        if job.state == .pending {
                            Button("Cancel") { queue.cancel(job.id) }
                        } else if job.state == .failed || job.state == .uncertain {
                            Button("Retry") { queue.retry(job.id) }
                        }
                    }
                    if let error = job.errorMessage {
                        Text(error).font(.caption).foregroundStyle(.red)
                    }
                }
                .frame(height: 125)
            }
        }
        .padding(12)
    }
}
