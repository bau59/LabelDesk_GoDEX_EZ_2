import SwiftUI

struct MainView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            HSplitView {
                TemplateLibraryView()
                    .frame(minWidth: 175, idealWidth: 205, maxWidth: 260)
                EditorView()
                    .frame(minWidth: 420, maxWidth: .infinity)
                InspectorView()
                    .frame(minWidth: 220, idealWidth: 250, maxWidth: 300)
            }
            Divider()
            PrintQueueView()
        }
        .sheet(isPresented: $store.showSettings) { PrinterSettingsView() }
        .sheet(isPresented: $store.showCalibration) { CalibrationView() }
        .alert(store.alert?.title ?? "", isPresented: Binding(get: { store.alert != nil }, set: { if !$0 { store.alert = nil } })) {
            if let action = store.alert?.action {
                Button("Send") { store.alert = nil; action() }
                Button("Cancel", role: .cancel) { store.alert = nil }
            } else {
                Button("OK") { store.alert = nil }
            }
        } message: { Text(store.alert?.message ?? "") }
    }

    private var toolbar: some View {
        HStack(spacing: 12) {
            Button("New", systemImage: "doc.badge.plus") { store.newDocument() }
            Button("Save", systemImage: "square.and.arrow.down") { store.saveDocument() }
            Divider().frame(height: 22)
            Button("Text", systemImage: "textformat") { store.add(.text()) }
            Button("Code 39", systemImage: "barcode") { store.add(.barcode()) }
            Button("Line", systemImage: "minus") { store.add(.line()) }
            Button("Box", systemImage: "rectangle") { store.add(.rectangle()) }
            Divider().frame(height: 22)
            Button("Undo", systemImage: "arrow.uturn.backward") { store.undo() }.disabled(store.undoStack.isEmpty)
            Button("Redo", systemImage: "arrow.uturn.forward") { store.redo() }.disabled(store.redoStack.isEmpty)
            Spacer()
            Button("Printer settings", systemImage: "printer") { store.showSettings = true }
            Button("Calibrate", systemImage: "scope") { store.showCalibration = true }
            Button("Print TEST", systemImage: "bolt.fill") { store.sendTest() }
                .buttonStyle(.borderedProminent)
        }
        .padding(10)
    }
}
