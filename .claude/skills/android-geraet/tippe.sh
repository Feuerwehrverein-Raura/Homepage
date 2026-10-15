#!/bin/sh
# Tippt auf dem per USB verbundenen Android-Geraet auf das erste Element mit
# genau diesem Text (aus "uiautomator dump"). Aufruf: tippe.sh "Trotzdem herunterladen"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
"$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
xy=$("$ADB" shell cat /sdcard/ui.xml | python3 -c "
import sys, re
s = sys.stdin.read(); t = sys.argv[1]
m = re.search(r'text=\"' + re.escape(t) + r'\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"', s)
print(f'{(int(m.group(1))+int(m.group(3)))//2} {(int(m.group(2))+int(m.group(4)))//2}' if m else '')" "$1")
[ -n "$xy" ] || { echo "nicht gefunden: $1"; exit 1; }
"$ADB" shell input tap $xy && echo "getippt: $1 ($xy)"
