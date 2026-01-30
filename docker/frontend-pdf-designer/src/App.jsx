import React, { useEffect, useRef, useState } from 'react'
import { Designer } from '@pdfme/ui'
import { generate } from '@pdfme/generator'
import { text, image, barcodes } from '@pdfme/schemas'
import { BLANK_PDF } from '@pdfme/common'

const API_BASE = 'https://api.fwv-raura.ch'

// Default A4 Brief Template
const getDefaultTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Absender oben rechts
      absender: {
        type: 'text',
        position: { x: 120, y: 15 },
        width: 75,
        height: 25,
        fontSize: 9,
        lineHeight: 1.2,
      },
      // Empfänger Adresse
      empfaenger: {
        type: 'text',
        position: { x: 25, y: 50 },
        width: 80,
        height: 30,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Ort und Datum
      ort_datum: {
        type: 'text',
        position: { x: 120, y: 85 },
        width: 70,
        height: 8,
        fontSize: 10,
        alignment: 'right',
      },
      // Betreff
      betreff: {
        type: 'text',
        position: { x: 25, y: 100 },
        width: 160,
        height: 10,
        fontSize: 12,
        fontWeight: 'bold',
      },
      // Anrede
      anrede: {
        type: 'text',
        position: { x: 25, y: 115 },
        width: 160,
        height: 8,
        fontSize: 11,
      },
      // Inhalt
      inhalt: {
        type: 'text',
        position: { x: 25, y: 128 },
        width: 160,
        height: 100,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Grussformel
      gruss: {
        type: 'text',
        position: { x: 25, y: 235 },
        width: 160,
        height: 25,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Fusszeile
      fusszeile: {
        type: 'text',
        position: { x: 25, y: 280 },
        width: 160,
        height: 8,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
})

// Rechnungs-Template mit QR-Bereich
const getInvoiceTemplate = () => ({
  basePdf: BLANK_PDF,
  schemas: [
    {
      // Logo
      logo: {
        type: 'image',
        position: { x: 25, y: 10 },
        width: 35,
        height: 18,
      },
      // Absender
      absender: {
        type: 'text',
        position: { x: 120, y: 15 },
        width: 75,
        height: 25,
        fontSize: 9,
        lineHeight: 1.2,
      },
      // Empfänger
      empfaenger: {
        type: 'text',
        position: { x: 25, y: 50 },
        width: 80,
        height: 30,
        fontSize: 11,
        lineHeight: 1.3,
      },
      // Titel
      titel: {
        type: 'text',
        position: { x: 25, y: 90 },
        width: 160,
        height: 10,
        fontSize: 14,
        fontWeight: 'bold',
      },
      // Rechnungsnummer & Datum
      rechnung_info: {
        type: 'text',
        position: { x: 25, y: 105 },
        width: 160,
        height: 15,
        fontSize: 10,
        lineHeight: 1.4,
      },
      // Rechnungstext
      text: {
        type: 'text',
        position: { x: 25, y: 125 },
        width: 160,
        height: 50,
        fontSize: 11,
        lineHeight: 1.4,
      },
      // Betrag gross
      betrag: {
        type: 'text',
        position: { x: 130, y: 180 },
        width: 55,
        height: 12,
        fontSize: 16,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // QR-Code Bereich (wird vom Backend mit swissqrbill gefüllt)
      qr_code: {
        type: 'image',
        position: { x: 25, y: 200 },
        width: 46,
        height: 46,
      },
      // Zahlungsinformationen
      zahlungsinfo: {
        type: 'text',
        position: { x: 80, y: 200 },
        width: 105,
        height: 45,
        fontSize: 9,
        lineHeight: 1.3,
      },
      // Fusszeile
      fusszeile: {
        type: 'text',
        position: { x: 25, y: 280 },
        width: 160,
        height: 8,
        fontSize: 8,
        alignment: 'center',
        fontColor: '#666666',
      },
    },
  ],
})

// Sample inputs for preview
const getSampleInputs = (category) => {
  if (category === 'rechnung') {
    return [{
      logo: '',
      absender: 'Feuerwehrverein Raura\nMusterstrasse 1\n6017 Ruswil',
      empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
      titel: 'Mitgliederbeitrag 2026',
      rechnung_info: 'Rechnungsnummer: 2026-001\nDatum: 30.01.2026',
      text: 'Wir erlauben uns, Ihnen den Mitgliederbeitrag für das Jahr 2026 in Rechnung zu stellen.\n\nBitte überweisen Sie den Betrag innert 30 Tagen.',
      betrag: 'CHF 50.00',
      qr_code: '',
      zahlungsinfo: 'Konto: CH93 0076 2011 6238 5295 7\nZahlbar innert 30 Tagen\nReferenz: RF26 0001',
      fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
    }]
  }
  return [{
    absender: 'Feuerwehrverein Raura\nMusterstrasse 1\n6017 Ruswil',
    empfaenger: 'Max Mustermann\nBeispielweg 42\n6000 Luzern',
    ort_datum: 'Ruswil, 30. Januar 2026',
    betreff: 'Einladung zur Generalversammlung',
    anrede: 'Sehr geehrter Herr Mustermann',
    inhalt: 'Wir laden Sie herzlich zu unserer diesjährigen Generalversammlung ein.\n\nDie Versammlung findet am Samstag, 15. März 2026 um 19:00 Uhr im Vereinslokal statt.\n\nWir freuen uns auf Ihre Teilnahme.',
    gruss: 'Freundliche Grüsse\n\nFeuerwehrverein Raura\nDer Präsident',
    fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
  }]
}

// Plugin configuration
const plugins = { text, image, ...barcodes }

function App() {
  const designerRef = useRef(null)
  const designerInstance = useRef(null)
  const [templates, setTemplates] = useState([])
  const [currentTemplate, setCurrentTemplate] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('brief')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [designerReady, setDesignerReady] = useState(false)

  // Helper to get cookie value
  const getCookie = (name) => {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop().split(';').shift()
    return null
  }

  // Check authentication
  useEffect(() => {
    let token = localStorage.getItem('vorstand_token')
    if (!token) {
      token = getCookie('vorstand_token')
      if (token) {
        localStorage.setItem('vorstand_token', token)
      }
    }
    if (token) {
      fetch(`${API_BASE}/auth/vorstand/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error('Not authenticated')
          return res.json()
        })
        .then((data) => {
          const hasAccess =
            data.role === 'admin' ||
            data.groups?.includes('vorstand') ||
            data.funktion?.toLowerCase().includes('social media')
          if (hasAccess) {
            setIsAuthenticated(true)
            setUser(data)
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Load templates
  useEffect(() => {
    if (isAuthenticated) {
      loadTemplates()
    }
  }, [isAuthenticated])

  // Initialize pdfme Designer
  useEffect(() => {
    if (isAuthenticated && designerRef.current && !designerInstance.current) {
      try {
        const template = currentTemplate?.template_schema || getDefaultTemplate()

        designerInstance.current = new Designer({
          domContainer: designerRef.current,
          template,
          plugins,
        })
        setDesignerReady(true)
      } catch (err) {
        console.error('Designer init error:', err)
      }
    }

    return () => {
      if (designerInstance.current) {
        designerInstance.current.destroy()
        designerInstance.current = null
        setDesignerReady(false)
      }
    }
  }, [isAuthenticated])

  const loadTemplates = async () => {
    try {
      const token = localStorage.getItem('vorstand_token')
      const res = await fetch(`${API_BASE}/pdf-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
      }
    } catch (err) {
      console.error('Error loading templates:', err)
    }
  }

  const loadTemplate = (template) => {
    setCurrentTemplate(template)
    setTemplateName(template.name)
    setTemplateCategory(template.category || 'brief')

    if (designerInstance.current && template.template_schema) {
      try {
        designerInstance.current.updateTemplate(template.template_schema)
      } catch (err) {
        console.error('Error loading template:', err)
      }
    }
  }

  const createNewTemplate = (category = 'brief') => {
    setCurrentTemplate(null)
    setTemplateName('')
    setTemplateCategory(category)

    const template = category === 'rechnung' ? getInvoiceTemplate() : getDefaultTemplate()

    if (designerInstance.current) {
      try {
        designerInstance.current.updateTemplate(template)
      } catch (err) {
        console.error('Error creating template:', err)
      }
    }
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Bitte einen Namen eingeben')
      return
    }

    setSaving(true)
    try {
      const token = localStorage.getItem('vorstand_token')
      const templateSchema = designerInstance.current.getTemplate()

      const slug = templateName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')

      // Extract variable names from schema
      const variables = []
      if (templateSchema.schemas) {
        templateSchema.schemas.forEach((page) => {
          Object.keys(page).forEach((fieldName) => {
            if (!variables.includes(fieldName)) {
              variables.push(fieldName)
            }
          })
        })
      }

      const body = {
        name: templateName,
        slug,
        category: templateCategory,
        template_schema: templateSchema,
        variables,
      }

      const url = currentTemplate
        ? `${API_BASE}/pdf-templates/${currentTemplate.id}`
        : `${API_BASE}/pdf-templates`

      const method = currentTemplate ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const saved = await res.json()
        setCurrentTemplate(saved)
        loadTemplates()
        alert('Template gespeichert!')
      } else {
        const error = await res.json()
        throw new Error(error.error || 'Speichern fehlgeschlagen')
      }
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async (id) => {
    if (!confirm('Template wirklich löschen?')) return

    try {
      const token = localStorage.getItem('vorstand_token')
      const res = await fetch(`${API_BASE}/pdf-templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        if (currentTemplate?.id === id) {
          createNewTemplate()
        }
        loadTemplates()
      }
    } catch (err) {
      alert('Fehler beim Löschen')
    }
  }

  const generatePreview = async () => {
    if (!designerInstance.current) return

    try {
      const template = designerInstance.current.getTemplate()
      const inputs = getSampleInputs(templateCategory)

      const pdf = await generate({
        template,
        inputs,
        plugins,
      })

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Preview error:', err)
      alert('Fehler bei der Vorschau: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Laden...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <img
              src="https://www.fwv-raura.ch/images/logo.png"
              alt="FWV Raura"
              className="h-16 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-800">PDF-Designer</h1>
            <p className="text-gray-600 mt-2">Zugriff nur für Vorstand</p>
          </div>
          <a
            href={`https://www.fwv-raura.ch/vorstand.html?redirect=${encodeURIComponent(window.location.href)}`}
            className="block w-full bg-red-600 text-white text-center py-3 rounded-lg hover:bg-red-700 transition"
          >
            Zum Vorstand-Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <img
              src="https://www.fwv-raura.ch/images/logo.png"
              alt="FWV Raura"
              className="h-8"
            />
            <h1 className="text-xl font-bold text-gray-800">PDF-Designer</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {user?.vorname || user?.name} {user?.nachname || ''}
            </span>
            <a
              href="https://www.fwv-raura.ch/vorstand.html"
              className="text-sm text-red-600 hover:text-red-700"
            >
              Zurück zum Vorstand
            </a>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <div className="w-72 bg-white border-r flex flex-col">
          {/* Template Info */}
          <div className="p-4 border-b">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template-Name
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="z.B. Mitgliederbeitrag-Rechnung"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie
              </label>
              <select
                value={templateCategory}
                onChange={(e) => {
                  setTemplateCategory(e.target.value)
                  if (!currentTemplate) {
                    createNewTemplate(e.target.value)
                  }
                }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
              >
                <option value="brief">Brief</option>
                <option value="rechnung">Rechnung (QR)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveTemplate}
                disabled={saving || !designerReady}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={generatePreview}
                disabled={!designerReady}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Vorschau generieren"
              >
                📄
              </button>
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Templates</h3>
                <button
                  onClick={() => createNewTemplate(templateCategory)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  + Neu
                </button>
              </div>
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-lg cursor-pointer border ${
                      currentTemplate?.id === t.id
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => loadTemplate(t)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-gray-500 capitalize">{t.category}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTemplate(t.id)
                        }}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Keine Templates vorhanden
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Variables Info */}
          <div className="p-4 border-t bg-gray-50 max-h-64 overflow-y-auto">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">
              Verfügbare Variablen ({templateCategory})
            </h4>

            {templateCategory === 'brief' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>absender</span>
                  <span>empfaenger</span>
                  <span>ort_datum</span>
                  <span>betreff</span>
                  <span>anrede</span>
                  <span>inhalt</span>
                  <span>gruss</span>
                  <span>fusszeile</span>
                </div>
                <p className="mt-2 text-gray-400">
                  Diese Felder werden beim Versand automatisch mit Mitgliederdaten gefüllt.
                </p>
              </div>
            )}

            {templateCategory === 'rechnung' && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <span>logo</span>
                  <span>absender</span>
                  <span>empfaenger</span>
                  <span>titel</span>
                  <span>rechnung_info</span>
                  <span>text</span>
                  <span>betrag</span>
                  <span>qr_code</span>
                  <span>zahlungsinfo</span>
                  <span>fusszeile</span>
                </div>
                <p className="mt-2 text-gray-400">
                  QR-Code wird automatisch mit swissqrbill generiert.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Designer Area */}
        <div className="flex-1 overflow-hidden bg-gray-200">
          <div
            ref={designerRef}
            className="w-full h-full"
            style={{ minHeight: '100%' }}
          />
        </div>
      </div>
    </div>
  )
}

export default App
