import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('apk_size_report', Path(__file__).parents[1] / 'scripts/apk-size-report.py')
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ApkSizeCheck(unittest.TestCase):
    def apk(self, folder, abis=('arm64-v8a',), compressed=True):
        file = Path(folder) / 'app-release.apk'
        with zipfile.ZipFile(file, 'w', compression=zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED) as archive:
            archive.writestr('AndroidManifest.xml', 'manifest')
            archive.writestr('assets/index.android.bundle', 'app')
            for abi in abis:
                archive.writestr(f'lib/{abi}/libreactnative.so', b'x' * 2048)
        return report.inspect(file)

    def test_accepts_a_small_compressed_single_abi_apk(self):
        with tempfile.TemporaryDirectory() as folder:
            report.validate(self.apk(folder), 'arm64-v8a', 20)

    def test_rejects_the_universal_apk_in_the_primary_download(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'Expected only'):
                report.validate(self.apk(folder, ('arm64-v8a', 'armeabi-v7a')), 'arm64-v8a', 20)

    def test_rejects_uncompressed_native_libraries(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'uncompressed'):
                report.validate(self.apk(folder, compressed=False), 'arm64-v8a', 20)

    def test_enforces_download_bytes_instead_of_uncompressed_or_rounded_size(self):
        with tempfile.TemporaryDirectory() as folder:
            result = self.apk(folder)
            result['bytes'] = 20_000_001
            with self.assertRaisesRegex(ValueError, 'exceeding'):
                report.validate(result, 'arm64-v8a', 20)


if __name__ == '__main__':
    unittest.main()
