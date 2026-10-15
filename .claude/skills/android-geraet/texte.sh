#!/bin/sh
# Alle sichtbaren Texte auf dem Bildschirm des verbundenen Geraets (uiautomator).
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
"$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
"$ADB" shell cat /sdcard/ui.xml | python3 -c "
import sys, re; print('\n'.join(sorted(set(re.findall(r'text=\"([^\"]+)\"', sys.stdin.read())))))"
