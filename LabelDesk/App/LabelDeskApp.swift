import SwiftUI

@main
struct LabelDeskApp: App {
    @StateObject private var updater = UpdateManager()
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            MainView()
                .preferredColorScheme(.light)
                .environmentObject(store)
                .environmentObject(updater)
                .frame(minWidth: 1020, minHeight: 690)
        }
    }
}
