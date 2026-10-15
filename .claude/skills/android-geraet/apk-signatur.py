"""SHA-256 des Signaturzertifikats einer APK (v2/v3-Signaturblock), ohne Java.
Aufruf: python3 -I apk-signatur.py <datei.apk>
Play-Signatur der Mitglieder-App: EF:99:A7:..., unser Upload-Schluessel: 00:66:28:...
"""
import hashlib, struct, sys

d = open(sys.argv[1], 'rb').read()
eocd = d.rfind(b'PK\x05\x06'); cd = struct.unpack('<I', d[eocd + 16:eocd + 20])[0]
assert d[cd - 16:cd] == b'APK Sig Block 42', 'kein v2/v3-Signaturblock'
size = struct.unpack('<Q', d[cd - 24:cd - 16])[0]; blk = d[cd - size:cd - 24]; i = 0


def lp(b, o):
    n = struct.unpack('<I', b[o:o + 4])[0]
    return b[o + 4:o + 4 + n], o + 4 + n


while i < len(blk):
    n, kid = struct.unpack('<QI', blk[i:i + 12]); val = blk[i + 12:i + 8 + n]; i += 8 + n
    if kid in (0x7109871a, 0xf05368c0):
        s, _ = lp(val, 0); s, _ = lp(s, 0); sd, _ = lp(s, 0); _, o = lp(sd, 0); c, _ = lp(sd, o); c, _ = lp(c, 0)
        h = hashlib.sha256(c).hexdigest().upper()
        print('SHA-256', ':'.join(h[j:j + 2] for j in range(0, len(h), 2)))
        break
