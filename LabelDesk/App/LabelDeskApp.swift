import AppKit
import SwiftUI
import WebKit

/// Native macOS shell: the label editor, settings, queue and raster renderer
/// live in plain HTML/JS. Only filesystem and Process APIs remain in Swift.
@main
struct LabelDeskApp: App {
    var body: some Scene {
        WindowGroup {
            WebLabelDeskView()
                .frame(minWidth: 1020, minHeight: 680)
        }
        .defaultSize(width: 1250, height: 800)
    }
}

struct WebLabelDeskView: NSViewRepresentable {
    func makeCoordinator() -> WebLabelDeskBridge { WebLabelDeskBridge() }

    func makeNSView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "labelDesk")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.webView = view

        do {
            let runtime = try context.coordinator.prepareRuntime()
            let index = runtime.appendingPathComponent("app.html")
            view.loadFileURL(index, allowingReadAccessTo: runtime)
        } catch {
            view.loadHTMLString(
                "<h2>LabelDesk cannot open local files</h2><pre>\(error.localizedDescription)</pre>",
                baseURL: nil
            )
        }
        return view
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
