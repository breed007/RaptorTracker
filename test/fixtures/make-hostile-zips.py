#!/usr/bin/env python3
"""
Builds the hostile archives used by test/security.js. Python's zipfile lets us
write entries a normal archiver would refuse to: traversal names, symlinks,
and a "decompression bomb" — a few KB on disk that inflates to far more.

Usage: make-hostile-zips.py <output dir>
"""
import os
import stat
import sys
import zipfile

out = sys.argv[1]
os.makedirs(out, exist_ok=True)

# 1) Bomb: 600 MB of zeros compresses to well under 1 MB.
with zipfile.ZipFile(os.path.join(out, 'bomb.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    with z.open('raptortracker.db', 'w', force_zip64=True) as f:
        chunk = b'\0' * (1024 * 1024)
        for _ in range(600):
            f.write(chunk)

# 2) Traversal: an entry that tries to escape the extraction directory.
with zipfile.ZipFile(os.path.join(out, 'traversal.zip'), 'w') as z:
    z.writestr('mods.json', '{"mods": [{"part_name": "Traversal test", "photos": ["/uploads/../../evil.jpg"]}]}')
    z.writestr('images/../../../evil.jpg', b'not really a jpeg')

# 3) Symlink: an entry marked as a symlink pointing outside the archive.
with zipfile.ZipFile(os.path.join(out, 'symlink.zip'), 'w') as z:
    z.writestr('mods.json', '{"mods": [{"part_name": "Symlink test", "photos": ["/uploads/link.jpg"]}]}')
    info = zipfile.ZipInfo('images/link.jpg')
    info.create_system = 3  # Unix
    info.external_attr = (stat.S_IFLNK | 0o777) << 16
    z.writestr(info, '/etc/passwd')

# 4) Disallowed type: an "image" that is really HTML with script.
with zipfile.ZipFile(os.path.join(out, 'svg.zip'), 'w') as z:
    z.writestr('mods.json', '{"mods": [{"part_name": "SVG test", "photos": ["/uploads/x.svg", "/uploads/ok.jpg"]}]}')
    z.writestr('images/x.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    z.writestr('images/ok.jpg', b'\xff\xd8\xff\xe0 fake jpeg body')

print('ok')
