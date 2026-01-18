#!/bin/bash
# Test-Script für Admin-Login (vermeidet Shell-Escaping-Probleme)

API_URL="${1:-https://api.fwv-raura.ch}"

curl -s -X POST "$API_URL/auth/vorstand/login" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{"email":"admin@fwv-raura.ch","password":"FWVRaura2024!"}
EOF
