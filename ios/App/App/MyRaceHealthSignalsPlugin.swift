import Foundation
import Capacitor
import HealthKit

/// Lokales Capacitor-Plugin im App-Target: liest die Apple-Watch-Signale, die `@capgo/capacitor-health` 8.4.2 nicht kennt
/// (RMSSD, Anstrengung, Schlaf-Handgelenktemperatur, Pulserholung, VO2max). **Nur Lesen** – es wird nichts nach
/// HealthKit geschrieben. Fehler kommen als `reject`, ohne HealthKit (z. B. iPad ohne Health) liefern alle Methoden
/// ein leeres Ergebnis. Doku und Einheiten: docs/readiness-data-sources.md (§5 „Gerätebefund Ultra“).
@objc(MyRaceHealthSignalsPlugin)
public class MyRaceHealthSignalsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MyRaceHealthSignalsPlugin"
    public let jsName = "MyRaceHealthSignals"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readQuantitySamples", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkoutEffort", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise)
    ]

    /// Schlüssel nach außen = Name des HealthKit-Typs (ohne Präfix), damit TS und Doku dieselben Namen nutzen.
    private enum Signal: String, CaseIterable {
        case heartRateVariabilityRMSSD
        case workoutEffortScore
        case estimatedWorkoutEffortScore
        case appleSleepingWristTemperature
        case heartRateRecoveryOneMinute
        case vo2Max

        var isAvailableOnThisOS: Bool {
            switch self {
            case .heartRateVariabilityRMSSD:
                if #available(iOS 27.0, *) { return true }
                return false
            case .workoutEffortScore, .estimatedWorkoutEffortScore:
                if #available(iOS 18.0, *) { return true }
                return false
            case .appleSleepingWristTemperature, .heartRateRecoveryOneMinute:
                if #available(iOS 16.0, *) { return true }
                return false
            case .vo2Max:
                return true
            }
        }

        var quantityType: HKQuantityType? {
            switch self {
            case .heartRateVariabilityRMSSD:
                if #available(iOS 27.0, *) { return HKQuantityType.quantityType(forIdentifier: .heartRateVariabilityRMSSD) }
                return nil
            case .workoutEffortScore:
                if #available(iOS 18.0, *) { return HKQuantityType.quantityType(forIdentifier: .workoutEffortScore) }
                return nil
            case .estimatedWorkoutEffortScore:
                if #available(iOS 18.0, *) { return HKQuantityType.quantityType(forIdentifier: .estimatedWorkoutEffortScore) }
                return nil
            case .appleSleepingWristTemperature:
                if #available(iOS 16.0, *) { return HKQuantityType.quantityType(forIdentifier: .appleSleepingWristTemperature) }
                return nil
            case .heartRateRecoveryOneMinute:
                if #available(iOS 16.0, *) { return HKQuantityType.quantityType(forIdentifier: .heartRateRecoveryOneMinute) }
                return nil
            case .vo2Max:
                return HKQuantityType.quantityType(forIdentifier: .vo2Max)
            }
        }

        /// (HKUnit, Name nach außen)
        var unit: (HKUnit, String)? {
            switch self {
            case .heartRateVariabilityRMSSD:
                return (HKUnit.secondUnit(with: .milli), "ms")
            case .workoutEffortScore, .estimatedWorkoutEffortScore:
                if #available(iOS 18.0, *) { return (HKUnit.appleEffortScore(), "score") }
                return nil
            case .appleSleepingWristTemperature:
                return (HKUnit.degreeCelsius(), "degC")
            case .heartRateRecoveryOneMinute:
                return (HKUnit.count().unitDivided(by: HKUnit.minute()), "bpm")
            case .vo2Max:
                return (HKUnit(from: "ml/(kg*min)"), "mL/(kg·min)")
            }
        }
    }

    private lazy var store: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil

    // MARK: - Datum

    private static func makeFormatter(fractional: Bool) -> ISO8601DateFormatter {
        let f = ISO8601DateFormatter()
        f.formatOptions = fractional ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return f
    }

    private static func parseDate(_ raw: String?) -> Date? {
        guard let raw = raw, !raw.isEmpty else { return nil }
        return makeFormatter(fractional: true).date(from: raw) ?? makeFormatter(fractional: false).date(from: raw)
    }

    private static func isoString(_ date: Date) -> String {
        makeFormatter(fractional: true).string(from: date)
    }

    // MARK: - requestAuthorization

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard let store = store else {
            call.resolve(["granted": false, "requested": [String](), "reason": "healthkit_unavailable"])
            return
        }
        var readTypes = Set<HKObjectType>()
        var requested: [String] = []
        for signal in Signal.allCases where signal.isAvailableOnThisOS {
            if let type = signal.quantityType {
                readTypes.insert(type)
                requested.append(signal.rawValue)
            }
        }
        // Workouts, damit die Anstrengung einem Training zugeordnet werden kann (wird vom Haupt-Plugin ohnehin angefragt).
        readTypes.insert(HKObjectType.workoutType())
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            // HealthKit verrät nicht, ob Lesezugriff verweigert wurde: `success` heißt nur „Dialog lief durch“.
            call.resolve(["granted": success, "requested": requested])
        }
    }

    // MARK: - readQuantitySamples

    @objc func readQuantitySamples(_ call: CAPPluginCall) {
        guard let typeName = call.getString("type"), let signal = Signal(rawValue: typeName) else {
            call.reject("unknown_type")
            return
        }
        guard let start = Self.parseDate(call.getString("startDate")),
              let end = Self.parseDate(call.getString("endDate")) else {
            call.reject("invalid_date")
            return
        }
        guard let store = store, signal.isAvailableOnThisOS,
              let type = signal.quantityType, let unit = signal.unit else {
            call.resolve(["samples": [[String: Any]]()])
            return
        }
        let limit = max(1, min(call.getInt("limit") ?? 1000, 10000))
        let ascending = call.getBool("ascending") ?? false
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: ascending)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, results, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            let samples: [[String: Any]] = (results as? [HKQuantitySample] ?? []).map { s in
                var row: [String: Any] = [
                    "value": s.quantity.doubleValue(for: unit.0),
                    "unit": unit.1,
                    "startDate": Self.isoString(s.startDate),
                    "endDate": Self.isoString(s.endDate),
                    "sourceName": s.sourceRevision.source.name
                ]
                Self.addDevice(s.device, to: &row)
                return row
            }
            call.resolve(["samples": samples])
        }
        store.execute(query)
    }

    // MARK: - readWorkoutEffort

    private struct EffortFound {
        let value: Double
        let method: String
    }

    @objc func readWorkoutEffort(_ call: CAPPluginCall) {
        guard let start = Self.parseDate(call.getString("workoutStart")),
              let end = Self.parseDate(call.getString("workoutEnd")) else {
            call.reject("invalid_date")
            return
        }
        guard let store = store else {
            call.resolve([:])
            return
        }
        guard #available(iOS 18.0, *) else {
            call.resolve([:])
            return
        }
        findWorkout(store: store, start: start, end: end) { workout in
            let group = DispatchGroup()
            let lock = NSLock()
            var user: EffortFound?
            var estimated: EffortFound?
            var firstError: Error?

            for (signal, isUser) in [(Signal.workoutEffortScore, true), (Signal.estimatedWorkoutEffortScore, false)] {
                group.enter()
                self.readEffort(store: store, signal: signal, workout: workout, start: start, end: end) { found, error in
                    lock.lock()
                    if let error = error, firstError == nil { firstError = error }
                    if isUser { user = found } else { estimated = found }
                    lock.unlock()
                    group.leave()
                }
            }
            group.notify(queue: .global()) {
                if user == nil && estimated == nil, let error = firstError {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                var out: [String: Any] = [:]
                var method: [String: String] = [:]
                if let user = user { out["userScore"] = user.value; method["user"] = user.method }
                if let estimated = estimated { out["estimatedScore"] = estimated.value; method["estimated"] = estimated.method }
                if !method.isEmpty { out["method"] = method }
                call.resolve(out)
            }
        }
    }

    /// Das HKWorkout mit (fast) gleichem Start/Ende wie das von der JS-Seite übergebene Workout, sonst `nil`.
    private func findWorkout(store: HKHealthStore, start: Date, end: Date, completion: @escaping (HKWorkout?) -> Void) {
        let predicate = HKQuery.predicateForSamples(
            withStart: start.addingTimeInterval(-300), end: end.addingTimeInterval(300), options: []
        )
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: 50, sortDescriptors: nil) { _, results, _ in
            let workouts = (results as? [HKWorkout]) ?? []
            let best = workouts
                .map { w -> (HKWorkout, TimeInterval) in
                    (w, abs(w.startDate.timeIntervalSince(start)) + abs(w.endDate.timeIntervalSince(end)))
                }
                .filter { $0.1 <= 60 }
                .min { $0.1 < $1.1 }
            completion(best?.0)
        }
        store.execute(query)
    }

    /// Erst über die „related“-Zuordnung (iOS 18), sonst über das Zeitfenster. `HKQuery.predicateForObjects(from:)`
    /// findet Effort-Samples nicht (Apple-Forum), deshalb nicht benutzt.
    @available(iOS 18.0, *)
    private func readEffort(
        store: HKHealthStore, signal: Signal, workout: HKWorkout?, start: Date, end: Date,
        completion: @escaping (EffortFound?, Error?) -> Void
    ) {
        guard let type = signal.quantityType, let unit = signal.unit?.0 else {
            completion(nil, nil)
            return
        }
        let newestFirst = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]

        func windowFallback(_ priorError: Error?) {
            let predicate = HKQuery.predicateForSamples(
                withStart: start.addingTimeInterval(-120), end: end.addingTimeInterval(120), options: []
            )
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: 20, sortDescriptors: newestFirst) { _, results, error in
                if let error = error {
                    completion(nil, error)
                    return
                }
                // Nur Samples, die das Training ungefähr umschließen (±2 min) – keine Nachbar-Trainings.
                let match = (results as? [HKQuantitySample] ?? []).first {
                    abs($0.startDate.timeIntervalSince(start)) <= 120 && abs($0.endDate.timeIntervalSince(end)) <= 120
                }
                if let match = match {
                    completion(EffortFound(value: match.quantity.doubleValue(for: unit), method: "window"), nil)
                } else {
                    completion(nil, priorError)
                }
            }
            store.execute(q)
        }

        guard let workout = workout else {
            windowFallback(nil)
            return
        }
        let related = HKQuery.predicateForWorkoutEffortSamplesRelated(workout: workout, activity: nil)
        let q = HKSampleQuery(sampleType: type, predicate: related, limit: 5, sortDescriptors: newestFirst) { _, results, error in
            if let sample = (results as? [HKQuantitySample])?.first {
                completion(EffortFound(value: sample.quantity.doubleValue(for: unit), method: "related"), nil)
            } else {
                windowFallback(error)
            }
        }
        store.execute(q)
    }

    // MARK: - Gerät

    /// Modell („Watch“), Hardware-Version (z. B. „Watch6,18“ = Ultra 1), Name, Hersteller – nur für die Diagnose.
    private static func addDevice(_ device: HKDevice?, to row: inout [String: Any]) {
        guard let device = device else { return }
        if let v = device.model { row["deviceModel"] = v }
        if let v = device.hardwareVersion { row["hardwareVersion"] = v }
        if let v = device.name { row["deviceName"] = v }
        if let v = device.manufacturer { row["deviceManufacturer"] = v }
    }

    // MARK: - authorizationStatus (Diagnose)

    /// HealthKit-Typ zu einem Namen: die eigenen Signale plus die Typen, die das bestehende Plugin anfragt.
    private func objectType(named name: String) -> HKObjectType? {
        if let signal = Signal(rawValue: name) {
            return signal.isAvailableOnThisOS ? signal.quantityType : nil
        }
        switch name {
        case "workout": return HKObjectType.workoutType()
        case "sleepAnalysis": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "heartRateVariabilitySDNN": return HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case "oxygenSaturation": return HKQuantityType.quantityType(forIdentifier: .oxygenSaturation)
        case "heartRate": return HKQuantityType.quantityType(forIdentifier: .heartRate)
        case "restingHeartRate": return HKQuantityType.quantityType(forIdentifier: .restingHeartRate)
        case "respiratoryRate": return HKQuantityType.quantityType(forIdentifier: .respiratoryRate)
        case "bodyTemperature": return HKQuantityType.quantityType(forIdentifier: .bodyTemperature)
        case "basalBodyTemperature": return HKQuantityType.quantityType(forIdentifier: .basalBodyTemperature)
        case "activeEnergyBurned": return HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
        case "distanceWalkingRunning": return HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)
        case "distanceCycling": return HKQuantityType.quantityType(forIdentifier: .distanceCycling)
        default: return nil
        }
    }

    /// Je Typ: `request` = ob HealthKit noch fragen würde („shouldRequest“ = nie angefragt → Lesen scheitert mit
    /// „not determined“; „unnecessary“ = schon angefragt – ob erlaubt oder verweigert, verrät iOS für Lesezugriff
    /// absichtlich nicht). `sharing` = Schreibstatus (MyRace schreibt nie, daher meist „notDetermined“/„sharingDenied“).
    @objc func authorizationStatus(_ call: CAPPluginCall) {
        let names = (call.getArray("types") as? [String]) ?? []
        guard let store = store else {
            call.resolve(["types": [String: Any]()])
            return
        }
        let group = DispatchGroup()
        let lock = NSLock()
        var out: [String: Any] = [:]
        for name in names {
            guard let type = objectType(named: name) else {
                out[name] = ["available": false]
                continue
            }
            let sharing: String
            switch store.authorizationStatus(for: type) {
            case .notDetermined: sharing = "notDetermined"
            case .sharingDenied: sharing = "sharingDenied"
            case .sharingAuthorized: sharing = "sharingAuthorized"
            @unknown default: sharing = "unknown"
            }
            group.enter()
            store.getRequestStatusForAuthorization(toShare: [], read: [type]) { status, error in
                let request: String
                if error != nil {
                    request = "error"
                } else {
                    switch status {
                    case .shouldRequest: request = "shouldRequest"
                    case .unnecessary: request = "unnecessary"
                    case .unknown: request = "unknown"
                    @unknown default: request = "unknown"
                    }
                }
                lock.lock()
                out[name] = ["available": true, "request": request, "sharing": sharing]
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .global()) {
            call.resolve(["types": out])
        }
    }

    // MARK: - readWorkouts (Diagnose, Gegenprobe zum bestehenden Plugin)

    @objc func readWorkouts(_ call: CAPPluginCall) {
        guard let start = Self.parseDate(call.getString("startDate")),
              let end = Self.parseDate(call.getString("endDate")) else {
            call.reject("invalid_date")
            return
        }
        guard let store = store else {
            call.resolve(["workouts": [[String: Any]]()])
            return
        }
        let limit = max(1, min(call.getInt("limit") ?? 50, 500))
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, results, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            let rows: [[String: Any]] = (results as? [HKWorkout] ?? []).map { w in
                var row: [String: Any] = [
                    "activityType": Int(w.workoutActivityType.rawValue),
                    "startDate": Self.isoString(w.startDate),
                    "endDate": Self.isoString(w.endDate),
                    "durationMin": (w.duration / 60).rounded(),
                    "sourceName": w.sourceRevision.source.name,
                    "sourceBundleId": w.sourceRevision.source.bundleIdentifier
                ]
                if let km = w.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) { row["distanceKm"] = (km * 100).rounded() / 100 }
                Self.addDevice(w.device, to: &row)
                return row
            }
            call.resolve(["workouts": rows])
        }
        store.execute(query)
    }

    // MARK: - availability

    @objc func availability(_ call: CAPPluginCall) {
        var types: [String: Bool] = [:]
        for signal in Signal.allCases {
            types[signal.rawValue] = signal.isAvailableOnThisOS && signal.quantityType != nil
        }
        call.resolve([
            "healthDataAvailable": HKHealthStore.isHealthDataAvailable(),
            "systemVersion": UIDevice.current.systemVersion,
            "types": types
        ])
    }
}
