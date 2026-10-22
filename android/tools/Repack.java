import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Enumeration;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Copies an APK ZIP while normalizing Windows backslashes in asset names.
 *
 * The important part is preserving each entry's original compression method.
 * In particular resources.arsc must stay STORED (uncompressed); Android 11+
 * rejects APKs where it has been deflated.
 */
public final class Repack {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: Repack <input.apk> <output.apk>");
            System.exit(2);
        }

        try (ZipFile input = new ZipFile(args[0]);
             ZipOutputStream output = new ZipOutputStream(new FileOutputStream(args[1]))) {

            Enumeration<? extends ZipEntry> entries = input.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (entry.isDirectory()) continue;

                byte[] data;
                try (InputStream stream = input.getInputStream(entry)) {
                    data = stream.readAllBytes();
                }

                String name = entry.getName().replace('\\', '/');
                ZipEntry copy = new ZipEntry(name);
                if (entry.getTime() >= 0) copy.setTime(entry.getTime());

                int method = entry.getMethod();
                if (method == ZipEntry.STORED) {
                    CRC32 crc = new CRC32();
                    crc.update(data);
                    copy.setMethod(ZipEntry.STORED);
                    copy.setSize(data.length);
                    copy.setCompressedSize(data.length);
                    copy.setCrc(crc.getValue());
                } else {
                    copy.setMethod(ZipEntry.DEFLATED);
                }

                output.putNextEntry(copy);
                output.write(data);
                output.closeEntry();
            }
        }
    }
}
