import SwiftUI

struct TemplateLibraryView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        List {
            Section("Label size") {
                ForEach(LabelPreset.standard) { preset in
                    Button(preset.title) { store.apply(preset) }
                        .buttonStyle(.plain)
                }
            }
            Section("Saved templates") {
                if store.templates.isEmpty { Text("No saved templates").foregroundStyle(.secondary) }
                ForEach(store.templates) { template in
                    Button(template.name) { store.load(template) }
                        .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.sidebar)
    }
}
