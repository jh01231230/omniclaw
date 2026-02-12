import Foundation

public enum OmniClawCanvasCommand: String, Codable, Sendable {
    case present = "canvas.present"
    case hide = "canvas.hide"
    case navigate = "canvas.navigate"
    case evalJS = "canvas.eval"
    case snapshot = "canvas.snapshot"
}
