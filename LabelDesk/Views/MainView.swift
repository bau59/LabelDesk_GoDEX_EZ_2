import SwiftUI

/// One restrained visual language across the native screens and bundled HTML editor.
enum DeskPalette {
    static let accent = Color(red: 0.20, green: 0.36, blue: 0.83)
    static let ink = Color(red: 0.14, green: 0.19, blue: 0.28)
    static let secondary = Color(red: 0.43, green: 0.48, blue: 0.56)
    static let background = Color(red: 0.965, green: 0.973, blue: 0.988)
    static let border = Color(red: 0.89, green: 0.91, blue: 0.94)
    static let paleBlue = Color(red: 0.92, green: 0.95, blue: 1.0)
    static let green = Color(red: 0.10, green: 0.52, blue: 0.33)
    static let amber = Color(red: 0.66, green: 0.39, blue: 0.07)
}

extension View {
    func deskSurface(padding: CGFloat = 20) -> some View {
        self.padding(padding)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 15))
            .overlay {
                RoundedRectangle(cornerRadius: 15)
                    .strokeBorder(DeskPalette.border, lineWidth: 1)
            }
    }
}

private enum DeskSection {
    case quick, editor, queue
}

struct MainView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showQueue = false

    private var section: DeskSection {
        if showQueue { return .queue }
        return store.mode == .quick && store.activeFolder != nil ? .quick : .editor
    }

    private var pendingJobs: Int {
        store.queue.jobs.filter { $0.state == .pending || $0.state == .sending }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            HSplitView {
                TemplateLibraryView()
                    .frame(minWidth: 210, idealWidth: 245, maxWidth: 300)
                Group {
                    switch section {
                    case .quick:
                        QuickPrintView()
                            .id(store.selectedFolderID)
                    case .editor:
                        EditorView()
                    case .queue:
                        PrintQueueView()
                    }
                }
                .frame(minWidth: 730, maxWidth: .infinity, maxHeight: .infinity)
                .background(DeskPalette.background)
            }

            footer
        }
        .background(DeskPalette.background)
        .frame(minWidth: 1090, minHeight: 710)
        .sheet(isPresented: $store.showSettings) { PrinterSettingsView() }
        .sheet(isPresented: $store.showCalibration) { CalibrationView() }
        .alert(store.alert?.title ?? "", isPresented: Binding(
            get: { store.alert != nil },
            set: { if !$0 { store.alert = nil } }
        )) {
            if let action = store.alert?.action {
                Button("Подтвердить") { store.alert = nil; action() }
                Button("Отмена", role: .cancel) { store.alert = nil }
            } else {
                Button("OK") { store.alert = nil }
            }
        } message: {
            Text(store.alert?.message ?? "")
        }
    }

    private var header: some View {
        HStack(spacing: 15) {
            Image(systemName: "tag.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 43, height: 43)
                .background(DeskPalette.accent, in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 3) {
                Text("LabelDesk")
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(DeskPalette.ink)
                Text("Этикетки для GoDEX EZ-2")
                    .font(.system(size: 11))
                    .foregroundStyle(DeskPalette.secondary)
            }
            .frame(width: 174, alignment: .leading)

            HStack(spacing: 4) {
                navigationButton("Заполнение", icon: "text.badge.checkmark", for: .quick)
                    .disabled(store.activeFolder == nil)
                navigationButton("Редактор", icon: "slider.horizontal.3", for: .editor)
                navigationButton("Очередь", icon: "printer", for: .queue)
            }
            .padding(4)
            .background(DeskPalette.background, in: RoundedRectangle(cornerRadius: 11))

            Spacer(minLength: 8)

            Menu {
                Button("Проверка текста", systemImage: "textformat") { store.sendTest() }
                Button("Проверка растра", systemImage: "square.dashed") { store.sendRasterProbe() }
                Button("Проверка подачи", systemImage: "arrow.down.to.line") { store.sendFeedTest() }
                Button("Встроенные шрифты", systemImage: "textformat.abc") { store.sendFontTest() }
                Divider()
                Button("Калибровка материала", systemImage: "scope") { store.showCalibration = true }
            } label: {
                Label("Проверки", systemImage: "wrench.adjustable")
                    .foregroundStyle(DeskPalette.ink)
            }
            .menuStyle(.borderlessButton)
            .fixedSize()

            Button {
                store.showSettings = true
            } label: {
                Label("Настройки", systemImage: "gearshape")
            }
            .buttonStyle(.bordered)

            Button {
                showQueue = true
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "tray.full.fill")
                    Text("Задания")
                    if pendingJobs > 0 {
                        Text("\(pendingJobs)")
                            .font(.system(size: 11, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.white.opacity(0.24), in: Capsule())
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(DeskPalette.accent)
        }
        .padding(.horizontal, 21)
        .padding(.vertical, 15)
        .background(Color.white)
        .overlay(alignment: .bottom) { DeskPalette.border.frame(height: 1) }
    }

    private func navigationButton(_ title: String, icon: String, for target: DeskSection) -> some View {
        let active = section == target
        return Button {
            if target == .queue {
                showQueue = true
            } else {
                showQueue = false
                store.mode = (target == .quick) ? .quick : .editor
            }
        } label: {
            Label(title, systemImage: icon)
                .font(.system(size: 12, weight: active ? .semibold : .medium))
                .padding(.horizontal, 11)
                .padding(.vertical, 9)
                .foregroundStyle(active ? DeskPalette.accent : DeskPalette.secondary)
                .background(active ? Color.white : Color.clear,
                            in: RoundedRectangle(cornerRadius: 8))
                .shadow(color: active ? .black.opacity(0.055) : .clear, radius: 2, y: 1)
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack(spacing: 17) {
            Label(
                store.settings.profile.portPath.isEmpty ? "Порт не выбран" :
                    (store.settings.profile.portPath as NSString).lastPathComponent,
                systemImage: "cable.connector"
            )
            .foregroundStyle(store.settings.profile.portPath.isEmpty ? DeskPalette.amber : DeskPalette.ink)

            if store.rasterVerified && store.registrationVerified {
                Label("Тесты печати подтверждены", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(DeskPalette.green)
            } else {
                Label("Требуется проверка печати", systemImage: "exclamationmark.circle")
                    .foregroundStyle(DeskPalette.amber)
            }

            Spacer(minLength: 10)

            Text(store.status)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(maxWidth: 350, alignment: .trailing)
                .foregroundStyle(DeskPalette.secondary)

            UpdateBar()
        }
        .font(.system(size: 11))
        .padding(.horizontal, 20)
        .frame(height: 42)
        .background(Color.white)
        .overlay(alignment: .top) { DeskPalette.border.frame(height: 1) }
    }
}

private struct UpdateBar: View {
    @EnvironmentObject private var updater: UpdateManager
    @EnvironmentObject private var store: AppStore

    var body: some View {
        HStack(spacing: 7) {
            Text("v\(updater.currentVersion)")
                .foregroundStyle(DeskPalette.secondary)
            if updater.isChecking || updater.isDownloading {
                ProgressView().controlSize(.mini)
            }
            Button {
                Task { await updater.check(silent: false) }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.plain)
            .help("Проверить обновления · \(updater.status)")
            .disabled(updater.isChecking || updater.isDownloading)
        }
        .task { await updater.checkOnLaunch() }
        .alert("Доступно обновление", isPresented: $updater.showUpdatePrompt) {
            Button("Установить и перезапустить") {
                if store.queue.jobs.contains(where: { $0.state == .sending }) {
                    updater.infoMessage = "Сейчас отправляется задание. Дождитесь завершения передачи."
                    updater.showInfo = true
                } else {
                    Task { await updater.installUpdate() }
                }
            }
            Button("Позже", role: .cancel) { }
        } message: {
            Text("Доступна версия \(updater.latestVersion). Сохраните изменения перед установкой. Приложение закроется и запустится снова.")
        }
        .alert("Обновление LabelDesk", isPresented: $updater.showInfo) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(updater.infoMessage)
        }
    }
}
