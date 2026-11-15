import SwiftUI

/// Retained for project compatibility. The old trial-and-error calibration
/// workflow is no longer used: media and serial commands are fixed to the
/// verified 58×38 mm / 2 mm-gap print path.
struct CalibrationView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Профиль ленты")
                .font(.title2.bold())
            Text("GoDEX EZ-2 · 58 × 38 мм · зазор 2 мм")
            Text("Шаг 40 мм. Начальная T3 печатается автоматически один раз при запуске очереди. Дальше — G55, 280 строк и FF.")
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(width: 520)
    }
}
