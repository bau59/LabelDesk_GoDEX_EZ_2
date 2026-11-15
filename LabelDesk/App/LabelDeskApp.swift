import AppKit
import SwiftUI
import WebKit

/// Native macOS shell: editor, queue, raster and printer commands remain in
/// editable HTML/JavaScript/zsh. The built-in updater installs new releases.
@main
struct LabelDeskApp: App {
    @StateObject private var updater = UpdateManager()

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text("LabelDesk v\(updater.currentVersion)")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                    Text(updater.status)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Button("Проверить обновления") {
                        Task { await updater.check(silent: false) }
                    }
                    .disabled(updater.isChecking || updater.isDownloading)
                    if updater.showUpdatePrompt {
                        Button("Установить v\(updater.latestVersion)") {
                            Task { await updater.installUpdate() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(updater.isChecking || updater.isDownloading)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(Color(nsColor: .windowBackgroundColor))

                WebLabelDeskView()
            }
            .frame(minWidth: 1020, minHeight: 680)
            .task { await updater.checkOnLaunch() }
            .alert("Обновление LabelDesk", isPresented: $updater.showInfo) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(updater.infoMessage)
            }
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
