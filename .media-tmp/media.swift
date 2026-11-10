import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let src = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
let exportVideo = args.count > 3 && args[3] == "export"
let asset = AVURLAsset(url: src)
let sema = DispatchSemaphore(value: 0)

Task {
    do {
        let dur = try await asset.load(.duration)
        let vtracks = try await asset.loadTracks(withMediaType: .video)
        let atracks = try await asset.loadTracks(withMediaType: .audio)
        print("duration=\(dur.seconds) video=\(vtracks.count) audio=\(atracks.count)")
        if let v = vtracks.first {
            let size = try await v.load(.naturalSize)
            let fps = try await v.load(.nominalFrameRate)
            print("size=\(size) fps=\(fps)")
        }
        if !exportVideo {
            let gen = AVAssetImageGenerator(asset: asset)
            gen.appliesPreferredTrackTransform = true
            gen.requestedTimeToleranceBefore = .zero
            gen.requestedTimeToleranceAfter = .zero
            for (t, name) in [(0.0, "frame0.png"), (2.0, "frame2.png")] {
                let (img, actual) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 600))
                let url = outDir.appendingPathComponent(name)
                let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
                CGImageDestinationAddImage(dest, img, nil)
                CGImageDestinationFinalize(dest)
                print("\(name) actual=\(actual.seconds) \(img.width)x\(img.height)")
            }
        } else if !atracks.isEmpty, let v = vtracks.first {
            let comp = AVMutableComposition()
            let ct = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
            let range = try await v.load(.timeRange)
            try ct.insertTimeRange(range, of: v, at: .zero)
            ct.preferredTransform = try await v.load(.preferredTransform)
            let exp = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
            exp.outputURL = outDir.appendingPathComponent("videoonly.mp4")
            exp.outputFileType = .mp4
            exp.shouldOptimizeForNetworkUse = true
            await exp.export()
            print("export status=\(exp.status.rawValue) error=\(String(describing: exp.error))")
        } else {
            print("no audio track; nothing to strip")
        }
    } catch {
        print("ERROR \(error)")
    }
    sema.signal()
}
sema.wait()
