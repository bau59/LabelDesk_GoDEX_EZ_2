import AppKit
import Foundation
import SwiftUI
import WebKit

/// Offline HTML canvas with native Swift/JSON document ownership.
/// The web view cannot communicate with the network or printer.
struct EditorView: NSViewRepresentable {
    @EnvironmentObject private var store: AppStore

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store)
    }

    func makeNSView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "labelDesk")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator

        if let file = Bundle.main.url(forResource: "editor", withExtension: "html") {
            web.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        } else {
            web.loadHTMLString("<h2>Missing bundled editor.html</h2>", baseURL: nil)
        }
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        context.coordinator.synchronize(to: web)
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        private weak var store: AppStore?
        private var ready = false
        private var lastModelJSON: String?

        init(store: AppStore) {
            self.store = store
        }

        private func serialize(_ document: LabelDocument) -> String? {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            guard let data = try? encoder.encode(document) else { return nil }
            return String(data: data, encoding: .utf8)
        }

        func synchronize(to web: WKWebView) {
            guard ready, let store, let json = serialize(store.document),
                  json != lastModelJSON else { return }
            lastModelJSON = json
            // Embedding a Foundation-encoded JSON object in JavaScript is safe
            // here: JSONEncoder escapes its string values for JavaScript syntax.
            web.evaluateJavaScript("window.labelDeskLoad(" + json + ");", completionHandler: nil)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "labelDesk",
                  let payload = message.body as? [String: Any],
                  let type = payload["type"] as? String else { return }

            if type == "ready" {
                ready = true
                synchronize(to: message.webView!)
                return
            }
            guard let store else { return }
            if type == "save" {
                store.saveDocument()
                return
            }
            if type == "document", let json = payload["json"] as? String,
               json.utf8.count < 512_000 {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                guard let decoded = try? decoder.decode(LabelDocument.self, from: Data(json.utf8)),
                      decoded.elements.count <= 150 else { return }

                // Prevent model feedback from resetting the inspector caret or
                // current layer while the user is typing in the web editor.
                lastModelJSON = serialize(decoded)
                store.document = decoded
                if let rawID = payload["selected"] as? String {
                    store.selectedElementID = UUID(uuidString: rawID)
                } else {
                    store.selectedElementID = nil
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            ready = true
            synchronize(to: webView)
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.navigationType == .other, action.request.url?.isFileURL == true {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}
