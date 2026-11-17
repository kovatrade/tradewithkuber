"""Inspect the actual installable APK; fail CI on a wrong ABI or oversized download."""
import argparse
import json
from pathlib import Path
import zipfile


def inspect(apk):
    groups = {}
    architectures = set()
    native_compressed = True
    with zipfile.ZipFile(apk) as archive:
        names = set(archive.namelist())
        if 'AndroidManifest.xml' not in names or 'assets/index.android.bundle' not in names:
            raise ValueError('Expected a release APK containing the manifest and app bundle.')
        for entry in archive.infolist():
            parts = entry.filename.split('/')
            if parts[0] == 'lib' and len(parts) >= 3 and entry.filename.endswith('.so'):
                architectures.add(parts[1])
                native_compressed &= entry.compress_type != zipfile.ZIP_STORED
                group = '/'.join(parts[:2])
            else:
                group = 'dex' if entry.filename.endswith('.dex') else parts[0]
            values = groups.setdefault(group, {'rawBytes': 0, 'apkBytes': 0})
            values['rawBytes'] += entry.file_size
            values['apkBytes'] += entry.compress_size
    if not architectures:
        raise ValueError('APK contains no native libraries.')
    return {'file': Path(apk).name, 'bytes': Path(apk).stat().st_size,
            'megabytes': round(Path(apk).stat().st_size / 1_000_000, 2),
            'architectures': sorted(architectures), 'nativeLibrariesCompressed': native_compressed,
            'groups': groups}


def validate(report, expected_abi, max_mb):
    if report['architectures'] != [expected_abi]:
        raise ValueError(f"Expected only {expected_abi}, got {report['architectures']}.")
    if not report['nativeLibrariesCompressed']:
        raise ValueError('Native libraries are uncompressed; check expo.useLegacyPackaging.')
    if report['bytes'] > max_mb * 1_000_000:
        raise ValueError(f"APK is {report['megabytes']} MB, exceeding the {max_mb} MB download limit.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk')
    parser.add_argument('--expected-abi', required=True)
    parser.add_argument('--max-mb', type=float, default=20)
    parser.add_argument('--report')
    args = parser.parse_args()
    result = inspect(args.apk)
    print(json.dumps(result, indent=2))
    if args.report:
        Path(args.report).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    try:
        validate(result, args.expected_abi, args.max_mb)
    except ValueError as error:
        parser.exit(1, str(error) + '\n')
