// TarsosDSP's beat tracking as its own beat-extraction example does it: complex-domain
// onsets (512 samples, 256 overlap) into its BeatRoot tracker. One JSON line per file.
//   java Run <folder of WAVs> <out.jsonl>
import be.tarsos.dsp.AudioDispatcher;
import be.tarsos.dsp.beatroot.BeatRootOnsetEventHandler;
import be.tarsos.dsp.io.jvm.AudioDispatcherFactory;
import be.tarsos.dsp.onsets.ComplexOnsetDetector;
import be.tarsos.dsp.onsets.OnsetHandler;
import java.io.File;
import java.io.PrintWriter;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;
import javax.sound.sampled.*;

public class Run {
    public static void main(String[] a) throws Exception {
        List<Path> files;
        try (Stream<Path> s = Files.walk(Paths.get(a[0]))) {
            files = s.filter(p -> p.toString().toLowerCase().endsWith(".wav") && !p.getFileName().toString().startsWith("._")).sorted().collect(Collectors.toList());
        }
        try (PrintWriter out = new PrintWriter(a[1], "UTF-8")) {
            for (Path p : files) {
                String name = p.getFileName().toString();
                try {
                    File f = p.toFile();
                    AudioFileFormat fmt = AudioSystem.getAudioFileFormat(f);
                    double dur = fmt.getFrameLength() / (double) fmt.getFormat().getFrameRate();
                    long t0 = System.nanoTime();
                    int size = 512, overlap = 256;
                    AudioDispatcher d = AudioDispatcherFactory.fromFile(f, size, overlap);
                    ComplexOnsetDetector detector = new ComplexOnsetDetector(size);
                    BeatRootOnsetEventHandler handler = new BeatRootOnsetEventHandler();
                    detector.setHandler(handler);
                    d.addAudioProcessor(detector);
                    d.run();
                    final List<Double> beats = new ArrayList<>();
                    handler.trackBeats(new OnsetHandler() { public void handleOnset(double time, double salience) { beats.add(time); } });
                    double secs = (System.nanoTime() - t0) / 1e9, bpm = 0;
                    if (beats.size() > 2) {
                        double[] g = new double[beats.size() - 1];
                        for (int i = 1; i < beats.size(); i++) g[i - 1] = beats.get(i) - beats.get(i - 1);
                        Arrays.sort(g); bpm = 60.0 / g[g.length / 2];
                    }
                    StringBuilder b = new StringBuilder();
                    for (int i = 0; i < beats.size(); i++) b.append(i > 0 ? ", " : "").append(String.format(Locale.ROOT, "%.4f", beats.get(i)));
                    out.println(String.format(Locale.ROOT, "{\"file\": \"%s\", \"bpm\": %.3f, \"beats\": [%s], \"secs\": %.4f, \"dur\": %.2f}", name, bpm, b, secs, dur));
                } catch (Throwable e) {
                    out.println(String.format(Locale.ROOT, "{\"file\": \"%s\", \"bpm\": 0.0, \"beats\": null, \"secs\": 0.0, \"dur\": 0.0, \"error\": \"%s\"}", name, String.valueOf(e).replace("\"", "'")));
                }
                out.flush();
            }
        }
    }
}
