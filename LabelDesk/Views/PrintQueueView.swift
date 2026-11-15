import AppKit
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

    @State private var showLog = false
    @State private var showHistory = false
    @State private var showFullConfirm = false
    @State private var resendID: UUID?
    @State private var showResendConfirm = false

    private var pending: Int { queue.jobs.filter { $0.state == .pending }.count }
    private var sending: Bool { queue.jobs.contains { $0.state == .sending } }
    private var finished: Int { queue.jobs.filter { $0.state == .sent }.count }
    private var isReady: Bool { !store.settings.profile.portPath.isEmpty }
    private var displayedJobs: [PrintJob] {
        queue.jobs.filter {
            showHistory ? [.sent, .cancelled].contains($0.state)
                        : ![.sent, .cancelled].contains($0.state)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 19) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Очередь печати")
                            .font(.system(size: 25, weight: .bold))
                            .foregroundStyle(DeskPalette.ink)
                        Text("Запись в RS-232 не подтверждает физическую печать")
                            .font(.system(size: 13))
                            .foregroundStyle(DeskPalette.secondary)
                    }
                    Spacer()
                    Button("Журнал передачи", systemImage: "doc.text.magnifyingglass") {
                        showLog = true
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(DeskPalette.accent)
                    Button("Назад к этикеткам", systemImage: "arrow.left") {
                        onBack()
                    }
                    .buttonStyle(.bordered)
                }

                HStack(spacing: 12) {
                    statistic("\(pending)", "Ожидают", icon: "clock")
                    statistic("\(finished)", "Передано в порт", icon: "arrow.up.right.circle")
                    statistic(queue.isPaused ? "Пауза" : "Передача",
                              "Состояние", icon: queue.isPaused ? "pause.circle" : "waveform")
                }

                if !isReady {
                    Text("Выберите RS-232 порт в настройках принтера.")
                        .font(.system(size: 12))
                        .foregroundStyle(DeskPalette.secondary)
                        .deskSurface()
                }

                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Задания")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(DeskPalette.ink)
                            Text("Начните с одного задания, проверьте бумагу, затем отправляйте партию.")
                                .font(.system(size: 11))
                                .foregroundStyle(DeskPalette.secondary)
                        }
                        Spacer()
                        Button(showHistory ? "Активные" : "История") {
                            showHistory.toggle()
                        }
                        .buttonStyle(.bordered)
                        .disabled(queue.jobs.isEmpty)
                        Button("Очистить историю") { queue.clearCompleted() }
                            .buttonStyle(.bordered)
                            .disabled(!queue.jobs.contains(where: { $0.state == .sent || $0.state == .cancelled }))
                    }

                    HStack(spacing: 10) {
                        if queue.isPaused {
                            Button {
                                store.startQueue(onlyOne: true)
                            } label: {
                                Label("Проверить одно задание", systemImage: "play.fill")
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(DeskPalette.accent)
                            .disabled(pending == 0 || !isReady)

                            Button("Отправить всю очередь", systemImage: "printer.fill") {
                                showFullConfirm = true
                            }
                            .buttonStyle(.bordered)
                            .disabled(pending == 0 || !isReady)
                        } else {
                            Button("Остановить после текущего задания", systemImage: "pause.fill") {
                                store.pauseQueue()
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(DeskPalette.accent)
                            .disabled(!sending && pending == 0)
                        }
                        Spacer()
                        Text(String(format: "RS-232 · интервал %.1f с", store.settings.profile.labelIntervalSeconds))
                            .font(.system(size: 11))
                            .foregroundStyle(DeskPalette.secondary)
                    }

                    if displayedJobs.isEmpty {
                        VStack(spacing: 11) {
                            Image(systemName: showHistory ? "clock.arrow.circlepath" : "tray")
                                .font(.system(size: 34, weight: .light))
                                .foregroundStyle(DeskPalette.secondary.opacity(0.6))
                            Text(showHistory ? "История пуста" : "Нет активных заданий")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(DeskPalette.ink)
                            Text(showHistory ? "Новые результаты появятся после передачи."
                                             : "Добавьте этикетку или откройте историю отправленных заданий.")
                                .font(.system(size: 12))
                                .foregroundStyle(DeskPalette.secondary)
                                .multilineTextAlignment(.center)
                            Button(showHistory ? "Активные задания" : "Открыть историю") {
                                showHistory.toggle()
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 45)
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(displayedJobs) { job in
                                jobRow(job)
                                if job.id != displayedJobs.last?.id {
                                    DeskPalette.border.frame(height: 1)
                                }
                            }
                        }
                    }
                }
                .deskSurface()
            }
            .padding(27)
            .frame(maxWidth: 1100)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(DeskPalette.background)
        .sheet(isPresented: $showLog) {
            PrintDiagnosticsPanel(diagnostics: queue.diagnostics,
                                  port: store.settings.profile.portPath)
        }
        .alert("Отправить всю очередь?", isPresented: $showFullConfirm) {
            Button("Отправить \(pending) заданий") { store.startQueue() }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Перед очередью печатается одна стартовая этикетка T3, затем задания идут построчно. Принтер не подтверждает физическое завершение печати; сначала проверьте одну серию.")
        }
        .alert("Повторить передачу?", isPresented: $showResendConfirm) {
            Button("Добавить повторное задание") {
                if let id = resendID { queue.requeueSent(id) }
                resendID = nil
                showHistory = false
            }
            Button("Отмена", role: .cancel) { resendID = nil }
        } message: {
            Text("Программа не знает, вышла ли этикетка из принтера. Повторная отправка может напечатать дубли. Исходная запись останется в истории.")
        }
    }

    private func statistic(_ value: String, _ title: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 21))
                .foregroundStyle(DeskPalette.accent)
                .frame(width: 38, height: 38)
                .background(DeskPalette.paleBlue, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 4) {
                Text(value)
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
                Text("\(Int(job.document.widthMM)) × \(Int(job.document.heightMM)) мм · \(job.id.uuidString.prefix(8))")
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
            Label(title(job.state), systemImage: stateIcon(job.state))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(job.state == .failed || job.state == .uncertain
                                 ? DeskPalette.amber : DeskPalette.secondary)
            if job.state == .pending {
                Button("Отменить") { queue.cancel(job.id) }
                    .buttonStyle(.bordered)
            } else if job.state == .failed || job.state == .uncertain {
                Button("Повторить") { queue.retry(job.id) }
                    .buttonStyle(.bordered)
                    .help("Сначала проверьте бумагу: повтор может напечатать дубли.")
            } else if job.state == .sent {
                Button("Повторить…") {
                    resendID = job.id
                    showResendConfirm = true
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 12)
    }

    private func title(_ state: PrintJobState) -> String {
        switch state {
        case .pending: "Ожидает"
        case .sending: "Передаётся"
        case .sent: "В порт передано"
        case .failed: "Ошибка данных"
        case .cancelled: "Отменено"
        case .uncertain: "Неясный результат"
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

private struct PrintDiagnosticsPanel: View {
    @ObservedObject var diagnostics: PrintDiagnostics
    let port: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Журнал передачи")
                        .font(.system(size: 21, weight: .bold))
                    Text("Этапы RS-232, размеры пакетов, длительности и ошибки")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Закрыть") { dismiss() }
            }
            HStack(spacing: 7) {
                Image(systemName: "info.circle")
                Text("«Передано в порт» означает успешную передачу драйверу macOS, не подтверждение печати на бумаге.")
            }
            .font(.system(size: 12))
            .foregroundStyle(DeskPalette.amber)
            .padding(11)
            .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 9))

            Text("Порт: \(port.isEmpty ? "не выбран" : port)")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)

            ScrollView {
                Text(diagnostics.visibleText.isEmpty ? "Журнал пока пуст" : diagnostics.visibleText)
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(13)
            }
            .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(DeskPalette.border) }

            if let error = diagnostics.writeError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.system(size: 11))
            }

            HStack(spacing: 10) {
                Button("Скопировать журнал", systemImage: "doc.on.doc") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(diagnostics.visibleText, forType: .string)
                }
                .buttonStyle(.borderedProminent)
                .tint(DeskPalette.accent)

                Button("Показать файл в Finder", systemImage: "folder") {
                    NSWorkspace.shared.activateFileViewerSelecting([diagnostics.fileURL])
                }
                .buttonStyle(.bordered)

                Spacer()

                Text("~/Library/Application Support/LabelDesk/logs/print.log")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .padding(24)
        .frame(width: 820, height: 620)
    }
}
