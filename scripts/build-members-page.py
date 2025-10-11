#!/usr/bin/env python3
"""
Build script für Mitgliederseite
Ersetzt Passwort-Platzhalter mit Secret aus Environment
"""

import os
import sys

def main():
    # Lese Template
    template_path = 'mitglieder/mitglieder-template.html'
    output_path = 'mitglieder.html'
    
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"❌ FEHLER: Template nicht gefunden: {template_path}")
        sys.exit(1)
    
    # Hole Passwort aus Environment
    password = os.environ.get('MEMBERS_PASSWORD', '')
    
    if not password:
        print("❌ FEHLER: MEMBERS_PASSWORD Environment Variable nicht gesetzt!")
        sys.exit(1)
    
    # Prüfe ob Platzhalter vorhanden
    placeholder = 'MEMBERS_PASSWORD_PLACEHOLDER'
    if placeholder not in content:
        print(f"⚠️  WARNUNG: Platzhalter '{placeholder}' nicht im Template gefunden!")
    
    # Ersetze Platzhalter
    content = content.replace(placeholder, password)
    
    # Schreibe Output
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        print(f"❌ FEHLER beim Schreiben: {e}")
        sys.exit(1)
    
    # Erfolg
    print("✅ Mitgliederseite erfolgreich gebaut")
    print(f"✅ Template: {template_path}")
    print(f"✅ Output: {output_path}")
    print(f"✅ Passwort-Länge: {len(password)} Zeichen")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
