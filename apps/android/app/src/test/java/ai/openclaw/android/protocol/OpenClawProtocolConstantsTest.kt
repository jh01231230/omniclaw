package ai.omniclaw.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class OmniClawProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", OmniClawCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", OmniClawCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", OmniClawCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", OmniClawCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", OmniClawCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", OmniClawCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", OmniClawCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", OmniClawCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", OmniClawCapability.Canvas.rawValue)
    assertEquals("camera", OmniClawCapability.Camera.rawValue)
    assertEquals("screen", OmniClawCapability.Screen.rawValue)
    assertEquals("voiceWake", OmniClawCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", OmniClawScreenCommand.Record.rawValue)
  }
}
