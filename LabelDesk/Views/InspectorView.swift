import SwiftUI

struct InspectorView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Properties").font(.headline)
            if let selected = store.selectedElement {
                ElementInspector(element: binding(for: selected))
                HStack {
                    Button("Duplicate") { store.duplicateSelected() }
                    Button("Delete", role: .destructive) { store.removeSelected() }
                }
            } else {
                Text("Select an object on the label to edit it.")
                    .foregroundStyle(.secondary)
                Divider()
                Text("Document").font(.headline)
                NumberField(title: "Width", value: $store.document.widthMM, suffix: "mm")
                NumberField(title: "Height", value: $store.document.heightMM, suffix: "mm")
                NumberField(title: "Gap", value: $store.document.gapMM, suffix: "mm")
                Toggle("Snap to 1 mm grid", isOn: $store.settings.snapToGrid)
            }
            Spacer()
        }
        .padding(12)
    }

    private func binding(for element: LabelElement) -> Binding<LabelElement> {
        Binding(get: { store.document.elements.first(where: { $0.id == element.id }) ?? element }, set: store.updateElement)
    }
}

private struct ElementInspector: View {
    @Binding var element: LabelElement

    var body: some View {
        Form {
            LabeledContent("Type", value: element.kind.title)
            NumberField(title: "X", value: $element.xMM, suffix: "mm")
            NumberField(title: "Y", value: $element.yMM, suffix: "mm")
            NumberField(title: "Width", value: $element.widthMM, suffix: "mm")
            NumberField(title: "Height", value: $element.heightMM, suffix: "mm")
            if element.kind == .text || element.kind == .barcode {
                TextField(element.kind == .barcode ? "Code 39 value" : "Text", text: $element.value)
                if element.kind == .text {
                    NumberField(title: "Size", value: $element.fontSize, suffix: "pt")
                    Toggle("Bold", isOn: $element.isBold)
                    Picker("Rotation", selection: $element.rotation) {
                        Text("0°").tag(0); Text("90°").tag(90); Text("180°").tag(180); Text("270°").tag(270)
                    }
                } else {
                    Toggle("Show text", isOn: $element.showsHumanReadable)
                    if !element.isValidCode39 {
                        Text("Unsupported Code 39 characters").foregroundStyle(.red).font(.caption)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

struct NumberField: View {
    let title: String
    @Binding var value: Double
    let suffix: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            TextField(title, value: $value, format: .number.precision(.fractionLength(0...2)))
                .labelsHidden().frame(width: 62)
            Text(suffix).foregroundStyle(.secondary).frame(width: 24, alignment: .leading)
        }
    }
}
