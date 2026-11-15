import SwiftUI

struct EditorView: View {
    @EnvironmentObject private var store: AppStore
    @State private var zoom = 6.0

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                TextField("Label name", text: $store.document.name)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 220)
                Spacer(minLength: 8)
                Text("\(Int(store.document.widthMM)) × \(Int(store.document.heightMM)) mm")
                    .foregroundStyle(.secondary)
                Slider(value: $zoom, in: 3...10) { Text("Zoom") }
                    .frame(width: 120)
            }
            .padding([.top, .horizontal], 12)

            GeometryReader { reader in
                ScrollView([.horizontal, .vertical]) {
                    LabelCanvas(scale: zoom)
                        .padding(max(30, reader.size.width / 5))
                }
                .background(Color(nsColor: .windowBackgroundColor))
            }

            HStack {
                Label("203 dpi · 8 dots/mm · 56 mm head · 55 mm graphics", systemImage: "info.circle")
                Spacer()
                if let issue = try? validateIssue {
                    Text(issue).foregroundStyle(.orange)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }

    private var validateIssue: String? {
        do {
            try LabelRasterizer.validate(store.document)
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}

private struct LabelCanvas: View {
    @EnvironmentObject private var store: AppStore
    let scale: Double

    var body: some View {
        let doc = store.document
        let width = CGFloat(max(10, doc.widthMM) * scale)
        let height = CGFloat(max(10, doc.heightMM) * scale)
        let preview = try? LabelRasterizer().rasterize(doc, profile: store.settings.profile)

        ZStack(alignment: .topLeading) {
            if let raster = preview {
                Image(nsImage: raster.image)
                    .resizable()
                    .interpolation(.none)
                    .frame(width: width, height: height)
            } else {
                Rectangle().fill(.white).frame(width: width, height: height)
                Text("Invalid label size or object bounds")
                    .foregroundStyle(.red)
                    .padding(12)
            }
            GridView(width: Double(width), height: Double(height), step: scale)
                .allowsHitTesting(false)

            ForEach(doc.elements) { item in
                DraggableOutline(item: item, scale: scale,
                                 maxWidthMM: doc.widthMM, maxHeightMM: doc.heightMM,
                                 isSelected: store.selectedElementID == item.id)
                    .position(
                        x: CGFloat((item.xMM + item.widthMM / 2) * scale),
                        y: CGFloat((item.yMM + item.heightMM / 2) * scale)
                    )
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .background(.white)
        .clipped()
        .overlay { Rectangle().stroke(.gray, lineWidth: 1) }
        .shadow(color: .black.opacity(0.15), radius: 5)
    }
}

private struct DraggableOutline: View {
    @EnvironmentObject private var store: AppStore
    let item: LabelElement
    let scale: Double
    let maxWidthMM: Double
    let maxHeightMM: Double
    let isSelected: Bool

    @State private var dragStart: LabelElement?

    var body: some View {
        Rectangle()
            .fill(Color.black.opacity(0.001))
            .contentShape(Rectangle())
            .overlay { Rectangle().stroke(isSelected ? Color.accentColor : .clear, lineWidth: 1.4) }
            .frame(width: CGFloat(max(4, item.widthMM * scale)),
                   height: CGFloat(max(4, item.heightMM * scale)))
            .onTapGesture { store.selectedElementID = item.id }
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { value in
                        if dragStart == nil {
                            dragStart = item
                            store.selectedElementID = item.id
                            store.checkpoint()
                        }
                        guard var moved = dragStart else { return }
                        let snap = store.settings.snapToGrid ? 1.0 : 0.125
                        let x = moved.xMM + Double(value.translation.width) / scale
                        let y = moved.yMM + Double(value.translation.height) / scale
                        moved.xMM = min(maxWidthMM - moved.widthMM, max(0, (x / snap).rounded() * snap))
                        moved.yMM = min(maxHeightMM - moved.heightMM, max(0, (y / snap).rounded() * snap))
                        store.updateElement(moved)
                    }
                    .onEnded { _ in dragStart = nil }
            )
    }
}

private struct GridView: View {
    let width: Double
    let height: Double
    let step: Double

    var body: some View {
        Canvas { context, _ in
            guard step > 0, width > 0, height > 0 else { return }
            for x in stride(from: 0.0, through: width, by: step) {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: height))
                context.stroke(path, with: .color(.gray.opacity(0.10)), lineWidth: 0.5)
            }
            for y in stride(from: 0.0, through: height, by: step) {
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: width, y: y))
                context.stroke(path, with: .color(.gray.opacity(0.10)), lineWidth: 0.5)
            }
        }
        .frame(width: width, height: height)
    }
}
