import React, { useEffect, useRef, useState } from 'react'
import { Designer } from '@pdfme/ui'
import { generate } from '@pdfme/generator'
import { text, image, barcodes } from '@pdfme/schemas'

const API_BASE = 'https://api.fwv-raura.ch'

// Default A4 Template
const getDefaultTemplate = () => ({
  basePdf: { width: 210, height: 297, padding: [20, 20, 20, 20] },
  schemas: [
    [
      {
        name: 'logo',
        type: 'image',
        position: { x: 20, y: 15 },
        width: 40,
        height: 20,
      },
      {
        name: 'organisation',
        type: 'text',
        position: { x: 140, y: 15 },
        width: 50,
        height: 20,
        fontSize: 10,
        alignment: 'right',
      },
      {
        name: 'titel',
        type: 'text',
        position: { x: 20, y: 50 },
        width: 170,
        height: 12,
        fontSize: 18,
        fontWeight: 'bold',
      },
      {
        name: 'inhalt',
        type: 'text',
        position: { x: 20, y: 70 },
        width: 170,
        height: 180,
        fontSize: 11,
      },
      {
        name: 'fusszeile',
        type: 'text',
        position: { x: 20, y: 280 },
        width: 170,
        height: 8,
        fontSize: 8,
        alignment: 'center',
      },
    ],
  ],
})

// Sample inputs for preview
const getSampleInputs = () => [
  {
    logo: '',
    organisation: 'Feuerwehrverein Raura\n6017 Ruswil',
    titel: 'Beispiel-Dokument',
    inhalt: 'Hier kommt der Inhalt des Dokuments...\n\nMit mehreren Zeilen und Absätzen.',
    fusszeile: 'Feuerwehrverein Raura | www.fwv-raura.ch | info@fwv-raura.ch',
  },
]

function App() {
  const designerRef = useRef(null)
  const designerInstance = useRef(null)
  const [templates, setTemplates] = useState([])
  const [currentTemplate, setCurrentTemplate] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [templateCategory, setTemplateCategory] = useState('allgemein')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Check authentication
  useEffect(() => {
    // Check for token in URL (cross-subdomain auth)
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken) {
      localStorage.setItem('vorstand_token', urlToken)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    const token = urlToken || localStorage.getItem('vorstand_token')
    if (token) {
      // Verify token and check permissions
      fetch(`${API_BASE}/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            // Check if user has access (Vorstand or Social Media function)
            const hasAccess =
              data.roles?.includes('admin') ||
              data.roles?.includes('vorstand') ||
              data.funktion?.toLowerCase().includes('social media')
            if (hasAccess) {
              setIsAuthenticated(true)
              setUser(data)
            }
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
      const template = currentTemplate?.template_schema || getDefaultTemplate()

      designerInstance.current = new Designer({
        domContainer: designerRef.current,
        template,
        inputs: getSampleInputs(),
        plugins: { text, image, ...barcodes },
      })
    }

    return () => {
      if (designerInstance.current) {
        designerInstance.current.destroy()
        designerInstance.current = null
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
    setTemplateCategory(template.category || 'allgemein')

    if (designerInstance.current) {
      designerInstance.current.updateTemplate(template.template_schema)
    }
  }

  const createNewTemplate = () => {
    setCurrentTemplate(null)
    setTemplateName('')
    setTemplateCategory('allgemein')

    if (designerInstance.current) {
      designerInstance.current.updateTemplate(getDefaultTemplate())
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

      const body = {
        name: templateName,
        slug,
        category: templateCategory,
        template_schema: templateSchema,
        variables: extractVariables(templateSchema),
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
        throw new Error('Speichern fehlgeschlagen')
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
    try {
      const template = designerInstance.current.getTemplate()
      const pdf = await generate({
        template,
        inputs: getSampleInputs(),
        plugins: { text, image, ...barcodes },
      })

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      alert('Fehler bei der Vorschau: ' + err.message)
    }
  }

  const extractVariables = (template) => {
    const vars = []
    if (template.schemas) {
      template.schemas.forEach((page) => {
        page.forEach((field) => {
          if (field.name && !vars.includes(field.name)) {
            vars.push(field.name)
          }
        })
      })
    }
    return vars
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
            className="block w-full bg-fire-600 text-white text-center py-3 rounded-lg hover:bg-fire-700 transition"
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
              {user?.vorname} {user?.nachname}
            </span>
            <a
              href="https://www.fwv-raura.ch/vorstand.html"
              className="text-sm text-fire-600 hover:text-fire-700"
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
                placeholder="z.B. Mitgliederbeitrags-Rechnung"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fire-500 focus:border-fire-500"
              />
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie
              </label>
              <select
                value={templateCategory}
                onChange={(e) => setTemplateCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fire-500"
              >
                <option value="allgemein">Allgemein</option>
                <option value="rechnung">Rechnung</option>
                <option value="arbeitsplan">Arbeitsplan</option>
                <option value="mitgliederliste">Mitgliederliste</option>
                <option value="teilnehmerliste">Teilnehmerliste</option>
                <option value="brief">Brief</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="flex-1 bg-fire-600 text-white py-2 rounded-lg hover:bg-fire-700 disabled:opacity-50"
              >
                {saving ? 'Speichern...' : 'Speichern'}
              </button>
              <button
                onClick={generatePreview}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title="Vorschau"
              >
                👁
              </button>
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Templates</h3>
                <button
                  onClick={createNewTemplate}
                  className="text-sm text-fire-600 hover:text-fire-700"
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
                        ? 'border-fire-500 bg-fire-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => loadTemplate(t)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-gray-500">{t.category}</div>
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

          {/* Variables Info - context-sensitive */}
          <div className="p-4 border-t bg-gray-50 overflow-y-auto" style={{ maxHeight: '300px' }}>
            <h4 className="text-xs font-semibold text-gray-600 mb-2">
              Verfügbare Variablen
            </h4>
            <p className="text-xs text-gray-400 mb-2">
              Felder für "{templateCategory}":
            </p>

            {/* Layout - immer verfügbar */}
            <div className="mb-3">
              <div className="text-xs font-semibold text-purple-600">Layout</div>
              <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                <div>logo</div>
                <div>organisation</div>
                <div>titel</div>
                <div>datum</div>
                <div>fusszeile</div>
              </div>
            </div>

            {/* Mitglied - für brief, rechnung, mitgliederliste */}
            {['brief', 'rechnung', 'mitgliederliste', 'allgemein'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-blue-600">Mitglied</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>vorname</div>
                  <div>nachname</div>
                  <div>anrede</div>
                  <div>strasse</div>
                  <div>plz</div>
                  <div>ort</div>
                  <div>email</div>
                  <div>status</div>
                </div>
              </div>
            )}

            {/* Finanzen - für rechnung */}
            {['rechnung'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-amber-600">Finanzen</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>betrag</div>
                  <div>jahr</div>
                  <div>zahlungsfrist</div>
                  <div>iban</div>
                  <div>referenz</div>
                  <div>qr_payload</div>
                </div>
              </div>
            )}

            {/* Event - für arbeitsplan, teilnehmerliste */}
            {['arbeitsplan', 'teilnehmerliste', 'allgemein'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-green-600">Event</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>event_titel</div>
                  <div>event_datum</div>
                  <div>event_zeit</div>
                  <div>event_ort</div>
                </div>
              </div>
            )}

            {/* Schichten - für arbeitsplan */}
            {['arbeitsplan'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-orange-600">Schichten</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>schichten_tabelle</div>
                  <div>total_schichten</div>
                </div>
              </div>
            )}

            {/* Teilnehmer - für teilnehmerliste */}
            {['teilnehmerliste'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-teal-600">Teilnehmer</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>teilnehmer_tabelle</div>
                  <div>total_teilnehmer</div>
                </div>
              </div>
            )}

            {/* Mitglieder-Liste - für mitgliederliste */}
            {['mitgliederliste'].includes(templateCategory) && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-indigo-600">Liste</div>
                <div className="text-xs text-gray-500 grid grid-cols-2 gap-1 mt-1">
                  <div>mitglieder_tabelle</div>
                  <div>total_mitglieder</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Designer Area */}
        <div className="flex-1 p-4">
          <div
            ref={designerRef}
            className="pdfme-designer bg-white rounded-lg shadow-lg overflow-hidden"
          />
        </div>
      </div>
    </div>
  )
}

export default App
