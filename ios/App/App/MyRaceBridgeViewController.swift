import UIKit
import Capacitor

/// Bridge-Controller der App. Registriert lokale Plugins, die nicht als npm-Paket vorliegen
/// (Capacitor 8: `capacitorDidLoad()` läuft, sobald die Bridge steht).
class MyRaceBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(MyRaceHealthSignalsPlugin())
    }
}
