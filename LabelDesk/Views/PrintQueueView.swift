import SwiftUI

struct PrintQueueView: View {
    @EnvironmentObject private var store: AppStore
    let onBack: () -> Void

    var body: some View {
        QueueWorkspace(queue: store.queue, onBack: onBack)
    }
}

private struct QueueWorkspace: View {
    @EnvironmentObject private var store: AppStore
    @ObservedObject var queue: PrintQueueService
    let onBack: () -> Void

    private var pending: Int { queue.jobs.filter { $0.state == .pending }.count }
    private var finished: Int { queue.jobs.filter { $0.state == .sent }.count }
    private var isReady: Bool { store.rasterVerified && store.registrationVerified }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 19) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Очередь печати")
                            .font(.system(size: 25, weight: .bold))
                            .foregroundStyle(DeskPalette.ink)
                        Text("Отправка заданий на GoDEX EZ-2")
                            .font(.system(size: 13))
                            .foregroundStyle(DeskPalette.secondary)
                    }
                    Spacer()

                    Button("Назад к этикеткам", systemImage: "arrow.left") { onBack() }
                        .buttonStyle(.bordered)
                }

                HStack(spacing: 12) {
                    queueStatistic("\(pending)", "Ожидают", icon: "clock")
                    queueStatistic("\(finished)", "Отправлены", icon: "checkmark.circle")
                    queueStatistic(queue.isPaused ? "Пауза" : "Работает",
                                   "Состояние", icon: queue.isPaused ? "pause.circle" : "play.circle")
                }

                if !isReady {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Перед печатью проверьте принтер", systemImage: "exclamationmark.triangle")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(DeskPalette.ink)

                        if !store.rasterVerified {
                            Text("Графическая печать ещё не подтверждена. Напечатайте тестовую L и оцените результат на бумаге.")
                                .font(.system(size: 12))
                                .foregroundStyle(DeskPalette.secondary)
                            HStack(spacing: 10) {
                                Button("Печать Raster TEST") { store.sendRasterProbe() }
                                if store.rasterProbePending {
                                    Button("Тест выглядит правильно") { store.confirmRasterProbe() }
                                }
                            }
                        } else if !store.registrationVerified {
                            Text("Подача этикетки не подтверждена. Убедитесь, что после теста бумага остановилась у начала следующей наклейки.")
                                .font(.system(size: 12))
                                .foregroundStyle(DeskPalette.secondary)
                            HStack(spacing: 10) {
                                Button("Печать Feed TEST") { store.sendFeedTest() }
                                if store.feedTestPending {
                                    Button("Подача работает") { store.confirmFeedTest() }
                                }
                            }
                        }
                    }
                    .deskSurface()
                }

                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 13) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Задания")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(DeskPalette.ink)
                            Text(queue.isPaused ? "Задания отправляются только после запуска очереди." :
                                 "Передача выполняется по одному заданию.")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                        }
                        Spacer()
                        Button("Очистить выполненные") { queue.clearCompleted() }
                            .disabled(!queue.jobs.contains(where: { $0.state == .sent || $0.state == .cancelled }))
                        Button {
                            if queue.isPaused { store.startQueue() }
                            else { store.pauseQueue() }
                        } label: {
                            Label(queue.isPaused ? "Запустить печать" : "Приостановить",
                                  systemImage: queue.isPaused ? "play.fill" : "pause.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(DeskPalette.accent)
                        .disabled(queue.isPaused && pending == 0)
                    }

                    if queue.jobs.isEmpty {
                        VStack(spacing: 11) {
                            Image(systemName: "tray")
                                .font(.system(size: 35, weight: .light))
                                .foregroundStyle(DeskPalette.secondary.opacity(0.55))
                            Text("Пока нет заданий")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(DeskPalette.ink)
                            Text("Выберите папку, заполните поля и добавьте этикетку в очередь.")
                                .font(.system(size: 12))
                                .foregroundStyle(DeskPalette.secondary)
                                .multilineTextAlignment(.center)
                            Button("Открыть этикетки") { onBack() }
                                .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(queue.jobs) { job in
                                jobRow(job)
                                if job.id != queue.jobs.last?.id {
                                    DeskPalette.border.frame(height: 1)
                                }
                            }
                        }
                    }
                }
                .deskSurface()
            }
            .padding(27)
            .frame(maxWidth: 1000)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(DeskPalette.background)
    }

    private func queueStatistic(_ number: String, _ title: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 21))
                .foregroundStyle(DeskPalette.accent)
                .frame(width: 38, height: 38)
                .background(DeskPalette.paleBlue, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 4) {
                Text(number)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(DeskPalette.ink)
                Text(title)
                    .font(.system(size: 11))
                    .foregroundStyle(DeskPalette.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .deskSurface(padding: 15)
    }

    private func jobRow(_ job: PrintJob) -> some View {
        HStack(spacing: 13) {
            Image(systemName: "tag")
                .foregroundStyle(DeskPalette.secondary)
                .frame(width: 35, height: 35)
                .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 5) {
                Text(job.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DeskPalette.ink)
                    .lineLimit(1)
                Text("\(Int(job.document.widthMM)) × \(Int(job.document.heightMM)) мм")
                    .font(.system(size: 11))
                    .foregroundStyle(DeskPalette.secondary)
                if let error = job.errorMessage {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 10)
            Label(stateTitle(job.state), systemImage: stateIcon(job.state))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(job.state == .failed || job.state == .uncertain
                                 ? DeskPalette.amber : DeskPalette.secondary)
            if job.state == .pending {
                Button("Отменить") { queue.cancel(job.id) }
                    .buttonStyle(.borderless)
            } else if job.state == .failed || job.state == .uncertain {
                Button("Повторить") { queue.retry(job.id) }
                    .buttonStyle(.bordered)
                    .help("Проверьте уже напечатанные этикетки, чтобы не создать дубликаты.")
            }
        }
        .padding(.vertical, 12)
    }

    private func stateTitle(_ state: PrintJobState) -> String {
        switch state {
        case .pending: "Ожидает"
        case .sending: "Отправляется"
        case .sent: "Передано"
        case .failed: "Ошибка"
        case .cancelled: "Отменено"
        case .uncertain: "Проверьте результат"
        }
    }

    private func stateIcon(_ state: PrintJobState) -> String {
        switch state {
        case .pending: "clock"
        case .sending: "arrow.up.right.circle"
        case .sent: "checkmark.circle"
        case .failed: "xmark.circle"
        case .cancelled: "minus.circle"
        case .uncertain: "exclamationmark.circle"
        }
    }
}
