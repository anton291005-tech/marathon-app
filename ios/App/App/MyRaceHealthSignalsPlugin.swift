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
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise)
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
                if let model = s.device?.model { row["deviceModel"] = model }
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
