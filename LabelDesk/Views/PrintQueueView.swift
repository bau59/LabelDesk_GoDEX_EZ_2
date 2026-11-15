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
        VStack(spacing: 6) {
            HStack {
                Label(store.status, systemImage: store.status.hasPrefix("Ready") ? "checkmark.circle" : "circle")
                    .foregroundStyle(store.status.hasPrefix("TEST failed") ? .red : .secondary)
                Spacer()
                Stepper("Copies: \(store.copies)", value: $store.copies, in: 1...999).frame(width: 135)
                Button("Add to queue") { queue.enqueue(document: store.document, copies: store.copies) }
                Button(queue.isPaused ? "Resume" : "Start") { queue.togglePause(); queue.process(profile: store.settings.profile) }
                Button("Clear completed") { queue.clearCompleted() }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            if queue.jobs.isEmpty {
                Text("Print queue is empty").foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12)
            } else {
                List(queue.jobs) { job in
                    HStack {
                        Text(job.title)
                        Spacer()
                        Text(job.state.rawValue.capitalized).foregroundStyle(job.state == .failed || job.state == .uncertain ? .red : .secondary)
                        if job.state == .pending { Button("Cancel") { queue.cancel(job.id) } }
                        if job.state == .failed || job.state == .uncertain { Button("Retry") { queue.retry(job.id) } }
                    }
                    if let error = job.errorMessage { Text(error).font(.caption).foregroundStyle(.red) }
                }
                .frame(height: 110)
            }
        }
        .padding(.bottom, 8)
    }
}
