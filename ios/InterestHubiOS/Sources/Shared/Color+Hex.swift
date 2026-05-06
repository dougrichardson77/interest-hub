import SwiftUI

extension Color {
    init(hex: String) {
        let sanitized = hex.replacingOccurrences(of: "#", with: "")
        var number: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&number)

        let red, green, blue: Double
        switch sanitized.count {
        case 6:
            red = Double((number & 0xFF0000) >> 16) / 255
            green = Double((number & 0x00FF00) >> 8) / 255
            blue = Double(number & 0x0000FF) / 255
        default:
            red = 0.06
            green = 0.62
            blue = 0.68
        }

        self.init(red: red, green: green, blue: blue)
    }
}
