import SwiftUI

struct EditorView: View {
    @EnvironmentObject private var store: AppStore
    @State private var zoom = 5.0

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                TextField("Layout name", text: $store.document.name)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 230)
                Spacer()
                Text("\(Int(store.document.widthMM)) × \(Int(store.document.heightMM)) mm")
                    .foregroundStyle(.secondary)
                Slider(value: $zoom, in: 2...10) { Text("Zoom") }.frame(width: 130)
            }
            .padding([.top, .horizontal], 12)

            GeometryReader { reader in
                ScrollView([.horizontal, .vertical]) {
                    LabelCanvas(scale: zoom)
                        .padding(max(40, reader.size.width / 4))
                }
                .background(Color(nsColor: .windowBackgroundColor))
            }
            if !store.document.isWithinPrinterWidth {
                Label("Material width exceeds the printer’s 60 mm limit", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange).padding(.bottom, 8)
            }
        }
    }
}

private struct LabelCanvas: View {
    @EnvironmentObject private var store: AppStore
    let scale: Double

    var body: some View {
        let document = store.document
        ZStack(alignment: .topLeading) {
            GridView(width: document.widthMM * scale, height: document.heightMM * scale, step: scale)
            Rectangle().stroke(.secondary, lineWidth: 1)
            Rectangle()
                .fill(Color.orange.opacity(0.06))
                .frame(width: CGFloat(min(document.printableWidthMM, document.widthMM) * scale), height: CGFloat(document.heightMM * scale))
            ForEach(document.elements) { element in
                CanvasElement(element: element, scale: scale, isSelected: store.selectedElementID == element.id)
                    .position(x: CGFloat((element.xMM + element.widthMM / 2) * scale), y: CGFloat((element.yMM + max(element.heightMM, 1) / 2) * scale))
                    .gesture(drag(for: element))
                    .onTapGesture { store.selectedElementID = element.id }
            }
        }
        .frame(width: CGFloat(document.widthMM * scale), height: CGFloat(document.heightMM * scale), alignment: .topLeading)
        .background(.white)
        .shadow(color: .black.opacity(0.16), radius: 4)
    }

    private func drag(for element: LabelElement) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                var moved = element
                let x = element.xMM + Double(value.translation.width) / scale
                let y = element.yMM + Double(value.translation.height) / scale
                let step = store.settings.snapToGrid ? 1.0 : 0.1
                moved.xMM = max(0, (x / step).rounded() * step)
                moved.yMM = max(0, (y / step).rounded() * step)
                store.updateElement(moved)
            }
            .onEnded { _ in store.selectedElementID = element.id }
    }
}

private struct GridView: View {
    let width: Double
    let height: Double
    let step: Double

    var body: some View {
        Canvas { context, _ in
            guard step > 0 else { return }
            for x in stride(from: 0.0, through: width, by: step) {
                context.stroke(Path(CGRect(x: CGFloat(x), y: 0, width: 0, height: CGFloat(height))), with: .color(.gray.opacity(x.truncatingRemainder(dividingBy: step * 5) == 0 ? 0.20 : 0.08)))
            }
            for y in stride(from: 0.0, through: height, by: step) {
                context.stroke(Path(CGRect(x: 0, y: CGFloat(y), width: CGFloat(width), height: 0)), with: .color(.gray.opacity(y.truncatingRemainder(dividingBy: step * 5) == 0 ? 0.20 : 0.08)))
            }
        }
        .frame(width: CGFloat(width), height: CGFloat(height))
    }
}

private struct CanvasElement: View {
    let element: LabelElement
    let scale: Double
    let isSelected: Bool

    var body: some View {
        content
            .frame(width: CGFloat(max(element.widthMM * scale, 2)), height: CGFloat(max(element.heightMM * scale, 2)), alignment: .topLeading)
            .rotationEffect(.degrees(Double(element.rotation)))
            .overlay { if isSelected { Rectangle().stroke(.accent, lineWidth: 1) } }
    }

    @ViewBuilder private var content: some View {
        switch element.kind {
        case .text:
            Text(element.value).font(.system(size: CGFloat(element.fontSize * scale / 3), weight: element.isBold ? .bold : .regular)).lineLimit(nil)
        case .barcode:
            VStack(spacing: 1) {
                HStack(spacing: 1) {
                    ForEach(Array(element.value.utf8.enumerated()), id: \.offset) { index, byte in
                        Rectangle().fill(.black).frame(width: CGFloat(Double(Int(byte) % 3 + 1) * scale / 3))
                        if index % 2 == 0 { Spacer(minLength: CGFloat(scale / 4)) }
                    }
                }
                if element.showsHumanReadable { Text(element.value).font(.system(size: CGFloat(max(7, scale)))) }
            }
        case .line:
            Rectangle().fill(.black)
        case .rectangle:
            Rectangle().stroke(.black, lineWidth: 1)
        }
    }
}
