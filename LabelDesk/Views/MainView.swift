import SwiftUI

struct MainView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            HSplitView {
                TemplateLibraryView().frame(minWidth: 165, idealWidth: 190, maxWidth: 235)
                EditorView().frame(minWidth: 460, maxWidth: .infinity)
                InspectorView().frame(minWidth: 230, idealWidth: 265, maxWidth: 310)
            }
            Divider()
            PrintQueueView()
            Divider()
            UpdateBar().padding(.horizontal, 12).padding(.vertical, 6)
        }
        .frame(minWidth: 1020, minHeight: 690)
        .sheet(isPresented: $store.showSettings) { PrinterSettingsView() }
        .sheet(isPresented: $store.showCalibration) { CalibrationView() }
        .alert(store.alert?.title ?? "", isPresented: Binding(
            get: { store.alert != nil },
            set: { if !$0 { store.alert = nil } }
        )) {
            if let action = store.alert?.action {
                Button("Confirm") { store.alert = nil; action() }
                Button("Cancel", role: .cancel) { store.alert = nil }
            } else {
                Button("OK") { store.alert = nil }
            }
        } message: {
            Text(store.alert?.message ?? "")
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            Button("New", systemImage: "doc.badge.plus") { store.newDocument() }
            Button("Save", systemImage: "square.and.arrow.down") { store.saveDocument() }
            Divider().frame(height: 20)
            Button("Text", systemImage: "textformat") { store.add(.text()) }
            Button("Code 39", systemImage: "barcode") { store.add(.barcode()) }
            Button("Line", systemImage: "minus") { store.add(.line()) }
            Button("Box", systemImage: "rectangle") { store.add(.rectangle()) }
            Divider().frame(height: 20)
            Button("Undo", systemImage: "arrow.uturn.backward") { store.undo() }.disabled(store.undoStack.isEmpty)
            Button("Redo", systemImage: "arrow.uturn.forward") { store.redo() }.disabled(store.redoStack.isEmpty)
            Spacer(minLength: 6)
            Button("Settings", systemImage: "gearshape") { store.showSettings = true }
            Button("Calibration", systemImage: "scope") { store.showCalibration = true }
            Button("Print TEST", systemImage: "bolt.fill") { store.sendTest() }
            Button("Raster TEST", systemImage: "square.dashed") { store.sendRasterProbe() }
                .buttonStyle(.borderedProminent)
        }
        .padding(10)
    }
}

private struct UpdateBar: View {
    @EnvironmentObject private var updater: UpdateManager
    @EnvironmentObject private var store: AppStore

    var body: some View {
        HStack(spacing: 10) {
            Text("LabelDesk \(updater.currentVersion) · \(updater.status)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            if updater.isChecking || updater.isDownloading {
                ProgressView().controlSize(.small)
            }
            Button("Check for updates") {
                Task { await updater.check(silent: false) }
            }
            .disabled(updater.isChecking || updater.isDownloading)
        }
        .task { await updater.checkOnLaunch() }
        .alert("Update available", isPresented: $updater.showUpdatePrompt) {
            Button("Install and restart") {
                if store.queue.jobs.contains(where: { $0.state == .sending }) {
                    updater.infoMessage = "A print job is being transmitted. Finish printing before updating."
                    updater.showInfo = true
                } else {
                    Task { await updater.installUpdate() }
                }
            }
            Button("Later", role: .cancel) { }
        } message: {
            Text("LabelDesk \(updater.latestVersion) is available. Save unsaved edits before updating. LabelDesk will close, replace itself and reopen.")
        }
        .alert("LabelDesk updates", isPresented: $updater.showInfo) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(updater.infoMessage)
        }
    }
}
