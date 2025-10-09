class EventsManager {
    constructor() {
        this.events = [];
        this.filteredEvents = [];
        this.currentFilter = 'all';
        this.selectedEvent = null;
        this.selectedShifts = [];
        this.arbeitsplanData = {};
        
        this.init();
    }

    async init() {
        await this.loadEvents();
        this.setupEventListeners();
        this.filterEvents();
        this.renderEvents();
        document.getElementById('loading').classList.add('hidden');
    }

    async loadEvents() {
        try {
            this.events = await this.loadEventsFromMarkdown();
            await this.loadArbeitsplanData();
        } catch (error) {
            console.error('Fehler beim Laden der Veranstaltungen:', error);
            this.events = [];
        }
    }

    async loadEventsFromMarkdown() {
        // Lade die automatisch generierte Event-Liste
        let eventFiles = [];
        try {
            const listResponse = await fetch('events-list.json');
            if (listResponse.ok) {
                const listData = await listResponse.json();
                eventFiles = listData.files;
                console.log(`📋 Event-Liste geladen: ${eventFiles.length} Dateien`);
            } else {
                console.warn('⚠️ events-list.json nicht gefunden, verwende Fallback');
                eventFiles = [
                    'events/chilbi-2025.md',
                    'events/grillplausch-sommer-2024.md'
                ];
            }
        } catch (error) {
            console.warn('⚠️ Fehler beim Laden der Event-Liste:', error);
            eventFiles = [
                'events/chilbi-2025.md',
                'events/grillplausch-sommer-2024.md'
            ];
        }

        const events = [];
        
        for (const file of eventFiles) {
            try {
                console.log(`📄 Lade Event: ${file}`);
                const response = await fetch(file);
                
                if (!response.ok) {
                    console.warn(`⚠️ ${file}: HTTP ${response.status} ${response.statusText}`);
                    continue;
                }
                
                const content = await response.text();
                console.log(`✅ ${file}: ${content.length} Zeichen geladen`);
                
                if (!content.trim()) {
                    console.warn(`⚠️ ${file}: Datei ist leer`);
                    continue;
                }
                
                const event = this.parseMarkdownEvent(content, file);
                if (event) {
                    console.log(`👤 Parsed Event: ${event.title} mit ${event.shifts?.length || 0} Schichten`);
                    events.push(event);
                } else {
                    console.warn(`⚠️ ${file}: Konnte nicht geparst werden`);
                }
                
            } catch (error) {
                console.error(`❌ Fehler beim Laden von ${file}:`, error);
                continue;
            }
        }

        if (events.length === 0) {
            console.warn('⚠️ Keine Events geladen - verwende Fallback-Daten');
            return this.getFallbackEvents();
        }

        return events;
    }

    parseMarkdownEvent(content, filename = '') {
        try {
            const patterns = [
                /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/,
                /^---\r?\n([\s\S]*?)\r?\n---\r?\n?$/,
                /^([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
            ];

            let frontmatterMatch = null;
            for (const pattern of patterns) {
                frontmatterMatch = content.match(pattern);
                if (frontmatterMatch) break;
            }

            if (!frontmatterMatch) {
                console.warn(`⚠️ ${filename}: Kein Frontmatter gefunden`);
                return null;
            }

            const [, frontmatterStr, description = ''] = frontmatterMatch;
            const frontmatter = this.parseFrontmatter(frontmatterStr);
            
            if (!frontmatter.id || !frontmatter.title) {
                console.warn(`⚠️ ${filename}: Pflichtfelder fehlen`);
                return null;
            }
            
            const startDate = frontmatter.startDate ? new Date(frontmatter.startDate) : null;
            const endDate = frontmatter.endDate ? new Date(frontmatter.endDate) : null;
            const registrationDeadline = frontmatter.registrationDeadline ? new Date(frontmatter.registrationDeadline) : null;

            const hasShifts = frontmatter.shifts && Array.isArray(frontmatter.shifts) && frontmatter.shifts.length > 0;
            
            return {
                id: frontmatter.id,
                title: frontmatter.title,
                subtitle: frontmatter.subtitle || '',
                description: description.trim(),
                startDate: startDate,
                endDate: endDate,
                location: frontmatter.location || '',
                category: frontmatter.category || 'Sonstige',
                organizer: frontmatter.organizer || 'Vereinsvorstand',
                email: frontmatter.email || 'kontakt@fwv-raura.ch',
                status: frontmatter.status || 'confirmed',
                registrationRequired: frontmatter.registrationRequired === true,
                registrationDeadline: registrationDeadline,
                cost: frontmatter.cost || 'Kostenlos',
                tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
                hasShifts: hasShifts,
                shifts: frontmatter.shifts || [],
                participantRegistration: frontmatter.participantRegistration === true,
                arbeitsplanFile: hasShifts ? `events/${frontmatter.id}-assignments.md` : null,
                _source: filename
            };
            
        } catch (error) {
            console.error(`❌ ${filename}: Parse-Fehler:`, error);
            return null;
        }
    }

    parseFrontmatter(frontmatterStr) {
        const result = {};
        const lines = frontmatterStr.split(/\r?\n/).filter(line => line.trim());
        
        let inShifts = false;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('#') || !trimmedLine) continue;
            
            if (trimmedLine === 'shifts:') {
                inShifts = true;
                result.shifts = [];
                continue;
            }
            
            if (inShifts) {
                if (trimmedLine.startsWith('- id:')) {
                    const currentShift = {};
                    result.shifts.push(currentShift);
                } else if (trimmedLine.startsWith('- ') && result.shifts.length > 0) {
                    const currentShift = result.shifts[result.shifts.length - 1];
                    const [key, ...valueParts] = trimmedLine.substring(2).split(':');
                    if (key && valueParts.length > 0) {
                        let value = valueParts.join(':').trim();
                        
                        if (key.trim() === 'needed' && !isNaN(value)) {
                            value = parseInt(value);
                        }
                        
                        currentShift[key.trim()] = value;
                    }
                } else if (!trimmedLine.startsWith(' ') && !trimmedLine.startsWith('-')) {
                    inShifts = false;
                }
                
                if (!inShifts) {
                    this.processFrontmatterLine(trimmedLine, result);
                }
                continue;
            }
            
            this.processFrontmatterLine(trimmedLine, result);
        }
        
        return result;
    }

    processFrontmatterLine(line, result) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return;
        
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        
        if (!key) return;
        
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(s => s.trim());
        }
        
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        
        if (key === 'order' && !isNaN(value) && value !== '') {
            value = parseInt(value);
        }
        
        result[key] = value;
    }

    getFallbackEvents() {
        console.log('📋 Verwende Fallback-Events');
        return [
            {
                id: 'chilbi-2025-fallback',
                title: 'Chilbi 2025 (Fallback)',
                subtitle: 'Traditionelle Dorfchilbi',
                description: 'Unsere traditionelle Chilbi findet auch dieses Jahr wieder im Roten Schopf statt.',
                startDate: new Date(2025, 9, 18, 12, 0),
                endDate: new Date(2025, 9, 19, 22, 0),
                location: 'Roter Schopf, Kaiseraugst',
                category: 'Hauptveranstaltung',
                organizer: 'Stefan Müller',
                email: 'aktuar@fwv-raura.ch',
                status: 'confirmed',
                registrationRequired: true,
                registrationDeadline: new Date(2025, 9, 4),
                cost: 'Kostenlos',
                tags: ['Chilbi', 'Familie', 'Fallback'],
                hasShifts: false,
                shifts: [],
                participantRegistration: false,
                arbeitsplanFile: null,
                _source: 'fallback'
            }
        ];
    }

    async loadArbeitsplanData() {
        for (const event of this.events) {
            if (event.hasShifts && event.arbeitsplanFile) {
                try {
                    console.log(`📋 Lade Arbeitsplan: ${event.arbeitsplanFile}`);
                    const response = await fetch(event.arbeitsplanFile);
                    
                    if (!response.ok) {
                        console.warn(`⚠️ ${event.arbeitsplanFile}: HTTP ${response.status}`);
                        this.createEmptyArbeitsplan(event);
                        continue;
                    }
                    
                    const content = await response.text();
                    console.log(`✅ ${event.arbeitsplanFile}: ${content.length} Zeichen geladen`);
                    
                    const arbeitsplan = this.parseArbeitsplanMarkdown(content, event);
                    this.arbeitsplanData[event.id] = arbeitsplan;
                    
                    console.log(`📊 Arbeitsplan ${event.id}: ${arbeitsplan.filledShifts}/${arbeitsplan.totalShifts} Schichten besetzt`);
                    
                } catch (error) {
                    console.warn(`❌ Fehler beim Laden von ${event.arbeitsplanFile}:`, error);
                    this.createEmptyArbeitsplan(event);
                }
            }
        }
    }

    createEmptyArbeitsplan(event) {
        this.arbeitsplanData[event.id] = {
            assignments: {},
            lastUpdated: new Date(),
            totalShifts: event.shifts?.length || 0,
            filledShifts: 0
        };
    }

    parseArbeitsplanMarkdown(content, event) {
        const assignments = {};
        let filledShifts = 0;
        
        try {
            const lines = content.split('\n');
            let currentShiftId = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Erkenne Schicht-Header (### schicht-id)
                if (line.startsWith('### ')) {
                    const headerText = line.replace('### ', '').toLowerCase();
                    
                    // Suche nach passender Schicht-ID
                    if (event.shifts) {
                        for (const shift of event.shifts) {
                            if (headerText.includes(shift.id) || 
                                headerText.includes(shift.id.replace(/-/g, ''))) {
                                currentShiftId = shift.id;
                                assignments[currentShiftId] = assignments[currentShiftId] || [];
                                console.log(`📋 Gefundene Schicht: ${shift.id}`);
                                break;
                            }
                        }
                    }
                }
                
                // Sammle zugeteilte Personen
                if (currentShiftId && line.startsWith('- ') && 
                    !line.includes('**[OFFEN') && 
                    !line.includes('Personen benötigt')) {
                    
                    let name = line.replace('- ', '').trim();
                    
                    // Entferne ✅ falls vorhanden
                    if (name.startsWith('✅')) {
                        name = name.replace('✅', '').trim();
                    }
                    
                    // Ignoriere leere Namen oder OFFEN-Plätze
                    if (name && 
                        !name.includes('[OFFEN') && 
                        !name.includes('**[OFFEN') && 
                        name !== '**[OFFEN - 2 Plätze]**' &&
                        !assignments[currentShiftId].includes(name)) {
                        
                        assignments[currentShiftId].push(name);
                        console.log(`👤 ${currentShiftId}: ${name}`);
                    }
                }
                
                // Reset bei neuen Sections
                if (line.startsWith('##') || line.startsWith('---')) {
                    currentShiftId = null;
                }
            }
            
            // Berechne Gesamtzahl zugeteilter Schichten
            filledShifts = Object.values(assignments).reduce((sum, arr) => sum + arr.length, 0);
            
            console.log(`📊 Arbeitsplan geparst: ${filledShifts} Personen auf ${Object.keys(assignments).length} Schichten verteilt`);
            
        } catch (error) {
            console.error('Fehler beim Parsen des Arbeitsplans:', error);
        }
        
        return {
            assignments: assignments,
            lastUpdated: new Date(),
            totalShifts: event.shifts?.length || 0,
            filledShifts: filledShifts
        };
    }

    setupEventListeners() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter = e.target.dataset.filter;
                this.updateFilterButtons();
                this.filterEvents();
                this.renderEvents();
            });
        });

        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('close-modal-btn').addEventListener('click', () => this.closeModal());
        document.getElementById('download-event-ics').addEventListener('click', () => this.downloadEventICS());
        document.getElementById('share-event').addEventListener('click', () => this.shareEvent());
        document.getElementById('send-registration-email').addEventListener('click', () => this.sendRegistrationEmail());
        document.getElementById('view-arbeitsplan').addEventListener('click', () => this.showArbeitsplanModal());
        document.getElementById('download-arbeitsplan-pdf').addEventListener('click', () => this.generateArbeitsplanPDF());
        document.getElementById('download-arbeitsplan-pdf-2').addEventListener('click', () => this.generateArbeitsplanPDF());
        document.getElementById('close-arbeitsplan-modal').addEventListener('click', () => this.closeArbeitsplanModal());
        document.getElementById('close-arbeitsplan-modal-btn').addEventListener('click', () => this.closeArbeitsplanModal());
        document.getElementById('edit-arbeitsplan').addEventListener('click', () => this.editArbeitsplan());
        
        document.getElementById('event-modal').addEventListener('click', (e) => {
            if (e.target.id === 'event-modal') this.closeModal();
        });
        
        document.getElementById('arbeitsplan-modal').addEventListener('click', (e) => {
            if (e.target.id === 'arbeitsplan-modal') this.closeArbeitsplanModal();
        });
    }

    updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const isActive = btn.dataset.filter === this.currentFilter;
            btn.className = isActive 
                ? 'filter-btn active bg-white text-fire-700 px-6 py-3 rounded-lg font-semibold hover:bg-fire-50 transition-colors'
                : 'filter-btn border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-fire-700 transition-colors';
        });
    }

    filterEvents() {
        const now = new Date();
        let filtered = [...this.events];

        if (this.currentFilter === 'upcoming') {
            filtered = filtered.filter(event => event.startDate > now);
        } else if (this.currentFilter === 'past') {
            filtered = filtered.filter(event => event.endDate < now);
        }

        filtered.sort((a, b) => {
            if (this.currentFilter === 'past') {
                return b.startDate - a.startDate;
            }
            return a.startDate - b.startDate;
        });

        this.filteredEvents = filtered;
    }

    renderEvents() {
        const container = document.getElementById('events-container');
        const noEventsMsg = document.getElementById('no-events');

        if (this.filteredEvents.length === 0) {
            container.innerHTML = '';
            noEventsMsg.classList.remove('hidden');
            return;
        }

        noEventsMsg.classList.add('hidden');
        container.className = 'space-y-6';
        container.innerHTML = this.filteredEvents.map(event => this.createEventListItem(event)).join('');

        container.querySelectorAll('[data-event-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                const eventId = e.currentTarget.dataset.eventId;
                this.showEventModal(eventId);
            });
        });
    }

    createEventListItem(event) {
        const isPast = event.endDate < new Date();
        const statusBadge = this.getStatusBadge(event);
        const registrationBadge = this.getRegistrationBadge(event);
        const shiftBadge = this.getShiftBadge(event);
        
        return `
            <div class="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden ${isPast ? 'opacity-75' : ''}" 
                 data-event-id="${event.id}">
                <div class="p-6">
                    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                        <div class="flex-1">
                            <div class="flex items-start justify-between mb-3">
                                <div>
                                    <h3 class="text-xl font-bold text-gray-800 mb-1">${event.title}</h3>
                                    <p class="text-fire-600 font-medium">${event.subtitle}</p>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    ${statusBadge}
                                    ${registrationBadge}
                                    ${shiftBadge}
                                </div>
                            </div>
                            
                            <div class="prose prose-sm max-w-none mb-4 text-gray-600">
                                ${this.truncateText(event.description, 200)}
                            </div>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-500 mb-4">
                                <div class="space-y-2">
                                    <div class="flex items-center">
                                        <span class="mr-2">📅</span>
                                        <span>${this.formatDate(event.startDate)}</span>
                                    </div>
                                    <div class="flex items-center">
                                        <span class="mr-2">⏰</span>
                                        <span>${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}</span>
                                    </div>
                                </div>
                                <div class="space-y-2">
                                    <div class="flex items-center">
                                        <span class="mr-2">📍</span>
                                        <span>${event.location}</span>
                                    </div>
                                    <div class="flex items-center">
                                        <span class="mr-2">👤</span>
                                        <span>${event.organizer}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex flex-wrap gap-2">
                                ${event.tags.map(tag => `
                                    <span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                                        ${tag}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="mt-4 lg:mt-0 lg:ml-6 flex-shrink-0">
                            <span class="inline-block px-3 py-1 bg-fire-100 text-fire-800 rounded-full text-sm font-medium">
                                ${event.category}
                            </span>
                            ${event.cost !== 'Kostenlos' ? `
                                <div class="mt-2 text-lg font-bold text-fire-600">
                                    ${event.cost}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getStatusBadge(event) {
        const now = new Date();
        
        if (event.endDate < now) {
            return '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Vergangen</span>';
        } else if (event.startDate <= now && event.endDate >= now) {
            return '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium animate-pulse">Läuft</span>';
        } else if (event.registrationRequired && event.registrationDeadline && event.registrationDeadline < now) {
            return '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Anmeldung geschlossen</span>';
        } else {
            return '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Geplant</span>';
        }
    }

    getRegistrationBadge(event) {
        if (!event.registrationRequired) return '';
        
        const now = new Date();
        if (event.registrationDeadline && event.registrationDeadline < now) return '';
        if (event.endDate < now) return '';
        
        if (event.shifts && event.shifts.length > 0) {
            return '<span class="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">👷 Helfer gesucht</span>';
        } else if (event.participantRegistration) {
            return '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">📧 Anmeldung möglich</span>';
        }
        
        return '';
    }

    getShiftBadge(event) {
        if (!event.hasShifts || !event.shifts) return '';
        
        const arbeitsplan = this.arbeitsplanData[event.id];
        if (!arbeitsplan) return '';
        
        const totalShifts = arbeitsplan.totalShifts;
        const filledShifts = arbeitsplan.filledShifts;
        const percentage = totalShifts > 0 ? Math.round((filledShifts / totalShifts) * 100) : 0;
        
        let badgeClass = 'bg-red-100 text-red-800';
        if (percentage >= 80) badgeClass = 'bg-green-100 text-green-800';
        else if (percentage >= 50) badgeClass = 'bg-yellow-100 text-yellow-800';
        
        return `<span class="px-2 py-1 ${badgeClass} rounded-full text-xs font-medium">📋 ${percentage}% besetzt</span>`;
    }

    showEventModal(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        this.selectedEvent = event;
        this.selectedShifts = [];
        
        document.getElementById('modal-title').textContent = event.title;
        document.getElementById('modal-meta').innerHTML = `
            <span>📅 ${this.formatDate(event.startDate)}</span>
            <span>⏰ ${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}</span>
            <span>📍 ${event.location}</span>
            <span>👤 ${event.organizer}</span>
        `;

        document.getElementById('modal-content').innerHTML = `
            <div class="mb-6">
                <h3 class="text-lg font-semibold text-gray-800 mb-2">${event.subtitle}</h3>
                <div class="prose max-w-none">
                    ${this.parseMarkdown(event.description)}
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div class="space-y-3">
                    <h4 class="font-semibold text-gray-800">Veranstaltungsdetails</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Kategorie:</span>
                            <span class="px-2 py-1 bg-fire-100 text-fire-800 rounded text-xs">${event.category}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Kosten:</span>
                            <span class="font-medium">${event.cost}</span>
                        </div>
                        ${event.registrationRequired ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Anmeldung:</span>
                                <span class="text-fire-600">Erforderlich</span>
                            </div>
                        ` : ''}
                        ${event.registrationDeadline ? `
                            <div class="flex justify-between">
                                <span class="text-gray-600">Anmeldeschluss:</span>
                                <span>${this.formatDate(event.registrationDeadline)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="space-y-3">
                    <h4 class="font-semibold text-gray-800">Kontakt</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Organisator:</span>
                            <span class="font-medium">${event.organizer}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">E-Mail:</span>
                            <a href="mailto:${event.email}" class="text-fire-600 hover:text-fire-700">${event.email}</a>
                        </div>
                    </div>
                </div>
            </div>
            
            ${event.tags.length > 0 ? `
                <div class="mb-6">
                    <h4 class="font-semibold text-gray-800 mb-2">Tags</h4>
                    <div class="flex flex-wrap gap-2">
                        ${event.tags.map(tag => `
                            <span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                                ${tag}
                            </span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        this.setupShiftPlanningSection(event);
        this.setupRegistrationSection(event);
        
        document.getElementById('event-modal').classList.remove('hidden');
    }

    setupShiftPlanningSection(event) {
        const shiftPlanningSection = document.getElementById('shift-planning-section');
        
        if (!event.hasShifts || !event.shifts) {
            shiftPlanningSection.classList.add('hidden');
            return;
        }
        
        shiftPlanningSection.classList.remove('hidden');
        
        const arbeitsplan = this.arbeitsplanData[event.id] || { 
            totalShifts: event.shifts.length, 
            filledShifts: 0 
        };
        
        const shiftOverview = document.getElementById('shift-overview');
        shiftOverview.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div class="text-2xl font-bold text-blue-600">${arbeitsplan.totalShifts}</div>
                <div class="text-sm text-blue-800">Schichten gesamt</div>
            </div>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div class="text-2xl font-bold text-green-600">${arbeitsplan.filledShifts}</div>
                <div class="text-sm text-green-800">Besetzt</div>
            </div>
            <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <div class="text-2xl font-bold text-red-600">${arbeitsplan.totalShifts - arbeitsplan.filledShifts}</div>
                <div class="text-sm text-red-800">Offen</div>
            </div>
        `;
        
        const criticalShifts = event.shifts.filter(shift => {
            const assignments = arbeitsplan.assignments[shift.id] || [];
            return assignments.length === 0;
        });
        
        const criticalShiftsDiv = document.getElementById('critical-shifts');
        if (criticalShifts.length > 0) {
            criticalShiftsDiv.classList.remove('hidden');
            document.getElementById('critical-shifts-list').innerHTML = 
                criticalShifts.map(shift => `• ${shift.name} (${shift.date}, ${shift.time})`).join('<br>');
        } else {
            criticalShiftsDiv.classList.add('hidden');
        }
    }

    setupRegistrationSection(event) {
        const registrationSection = document.getElementById('registration-section');
        const shiftSelection = document.getElementById('shift-selection');
        const participantsSection = document.getElementById('participants-section');

        const now = new Date();
        const canRegister = event.registrationRequired && 
            (!event.registrationDeadline || event.registrationDeadline > now) &&
            event.endDate > now;

        if (!canRegister) {
            registrationSection.classList.add('hidden');
            return;
        }

        registrationSection.classList.remove('hidden');

        if (event.shifts && event.shifts.length > 0) {
            shiftSelection.classList.remove('hidden');
            participantsSection.classList.add('hidden');
            
            const arbeitsplan = this.arbeitsplanData[event.id] || { assignments: {} };
            
            const shiftsContainer = document.getElementById('shifts-container');
            shiftsContainer.innerHTML = event.shifts.map(shift => {
                const assignments = arbeitsplan.assignments[shift.id] || [];
                const remainingSpots = shift.needed - assignments.length;
                const isFullyBooked = remainingSpots <= 0;
                
                let assignedHTML = '';
                if (assignments.length > 0) {
                    assignedHTML = `
                        <div class="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <p class="font-medium text-green-800 mb-1">Bereits zugewiesen:</p>
                            ${assignments.map(person => `<span class="text-green-700">✅ ${person}</span>`).join('<br>')}
                        </div>
                    `;
                }
                
                return `
                    <label class="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg ${isFullyBooked ? 'bg-gray-100 opacity-75' : 'hover:bg-gray-50 cursor-pointer'} transition-colors">
                        <input type="checkbox" value="${shift.id}" class="shift-checkbox mt-1 text-fire-500 focus:ring-fire-500" 
                               ${isFullyBooked ? 'disabled' : ''} 
                               onchange="window.eventsManager.toggleShift('${shift.id}')">
                        <div class="flex-1">
                            <div class="flex justify-between items-start">
                                <div class="flex-1">
                                    <p class="font-medium text-gray-800">${shift.name}</p>
                                    <p class="text-sm text-gray-600">${shift.date} • ${shift.time}</p>
                                    <p class="text-xs text-gray-500">${shift.description}</p>
                                    ${assignedHTML}
                                </div>
                                <div class="ml-3 text-right">
                                    <span class="text-xs ${isFullyBooked ? 'bg-red-100 text-red-800' : remainingSpots <= 2 ? 'bg-yellow-100 text-yellow-800' : 'bg-fire-100 text-fire-800'} px-2 py-1 rounded-full block mb-1">
                                        ${isFullyBooked ? 'Voll besetzt' : `${remainingSpots} offen`}
                                    </span>
                                    <span class="text-xs text-gray-500">
                                        ${shift.needed} gesamt
                                    </span>
                                </div>
                            </div>
                        </div>
                    </label>
                `;
            }).join('');
        } else if (event.participantRegistration) {
            shiftSelection.classList.add('hidden');
            participantsSection.classList.remove('hidden');
        } else {
            shiftSelection.classList.add('hidden');
            participantsSection.classList.add('hidden');
        }

        window.eventsManager = this;
    }

    showArbeitsplanModal() {
        if (!this.selectedEvent || !this.selectedEvent.hasShifts) return;
        
        const event = this.selectedEvent;
        const arbeitsplan = this.arbeitsplanData[event.id];
        
        document.getElementById('arbeitsplan-title').textContent = `Arbeitsplan ${event.title}`;
        document.getElementById('arbeitsplan-status').textContent = 
            `Stand: ${new Date().toLocaleDateString('de-DE')} • ${arbeitsplan?.filledShifts || 0} von ${arbeitsplan?.totalShifts || 0} Schichten besetzt`;
        
        const content = this.generateArbeitsplanHTML(event);
        document.getElementById('arbeitsplan-content').innerHTML = content;
        
        document.getElementById('arbeitsplan-modal').classList.remove('hidden');
    }

    generateArbeitsplanHTML(event) {
        const arbeitsplan = this.arbeitsplanData[event.id] || { assignments: {} };
        
        let html = `
            <div class="mb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">📊 Übersicht</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-blue-600">${event.shifts?.length || 0}</div>
                        <div class="text-sm text-blue-800">Schichten gesamt</div>
                    </div>
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-green-600">${arbeitsplan.filledShifts || 0}</div>
                        <div class="text-sm text-green-800">Besetzt</div>
                    </div>
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-red-600">${(event.shifts?.length || 0) - (arbeitsplan.filledShifts || 0)}</div>
                        <div class="text-sm text-red-800">Offen</div>
                    </div>
                </div>
            </div>
        `;
        
        const shiftsByDate = {};
        if (event.shifts) {
            event.shifts.forEach(shift => {
                if (!shiftsByDate[shift.date]) {
                    shiftsByDate[shift.date] = {};
                }
                
                const timeMatch = shift.time.match(/(\d+:\d+)-(\d+:\d+|Open End)/);
                const time = timeMatch ? timeMatch[0] : shift.time;
                
                if (!shiftsByDate[shift.date][time]) {
                    shiftsByDate[shift.date][time] = {};
                }
                
                let type = 'Sonstige';
                if (shift.name.toLowerCase().includes('bar')) type = 'Bar';
                else if (shift.name.toLowerCase().includes('küche')) type = 'Küche';
                else if (shift.name.toLowerCase().includes('kasse')) type = 'Kasse';
                else if (shift.name.toLowerCase().includes('aufbau')) type = 'Aufbau';
                else if (shift.name.toLowerCase().includes('abbau')) type = 'Abbau';
                
                shiftsByDate[shift.date][time][type] = {
                    shift: shift,
                    assignments: arbeitsplan.assignments[shift.id] || []
                };
            });
        }
        
        Object.keys(shiftsByDate).sort().forEach(date => {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'long' });
            const formattedDate = dateObj.toLocaleDateString('de-DE');
            
            html += `
                <div class="mb-8">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">${dayName}, ${formattedDate}</h3>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full border-collapse border border-gray-300">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="border border-gray-300 px-4 py-2 text-left">Zeit</th>
                                    <th class="border border-gray-300 px-4 py-2 text-left">Küche</th>
                                    <th class="border border-gray-300 px-4 py-2 text-left">Bar</th>
                                    <th class="border border-gray-300 px-4 py-2 text-left">Service / Kasse</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            Object.keys(shiftsByDate[date]).sort().forEach(time => {
                const timeShifts = shiftsByDate[date][time];
                
                html += `
                    <tr>
                        <td class="border border-gray-300 px-4 py-2 font-medium">${time}</td>
                        <td class="border border-gray-300 px-4 py-2">
                            ${this.formatShiftAssignments(timeShifts['Küche'])}
                        </td>
                        <td class="border border-gray-300 px-4 py-2">
                            ${this.formatShiftAssignments(timeShifts['Bar'])}
                        </td>
                        <td class="border border-gray-300 px-4 py-2">
                            ${this.formatShiftAssignments(timeShifts['Kasse'])}
                        </td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
        
        return html;
    }

    formatShiftAssignments(shiftData) {
        if (!shiftData) return '-';
        
        const assignments = shiftData.assignments || [];
        const needed = shiftData.shift.needed;
        
        let html = '';
        
        assignments.forEach(person => {
            html += `<div class="text-green-600">✅ ${person}</div>`;
        });
        
        const openPositions = needed - assignments.length;
        for (let i = 0; i < openPositions; i++) {
            html += `<div class="text-red-600">❌ Offen</div>`;
        }
        
        if (html === '') {
            html = `<div class="text-red-600">❌ ${needed} Helfer gesucht</div>`;
        }
        
        return html;
    }

    async generateArbeitsplanPDF() {
        if (!this.selectedEvent || !this.selectedEvent.hasShifts) return;
        
        const event = this.selectedEvent;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        try {
            await this.addLogoToPDF(doc);
        } catch (error) {
            console.warn('Logo konnte nicht geladen werden:', error);
        }
        
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Feuerwehrverein Raura, Kaiseraugst', 60, 25);
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'normal');
        doc.text(`Arbeitsplan ${event.title}`, 60, 35);
        
        doc.setFontSize(10);
        doc.text(`Datum: ${event.startDate.toLocaleDateString('de-DE')} - ${event.endDate.toLocaleDateString('de-DE')}`, 60, 45);
        doc.text(`Ort: ${event.location}`, 60, 52);
        doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE')}`, 60, 59);
        
        let yPos = 75;
        
        const aufbauShifts = event.shifts.filter(s => s.name.toLowerCase().includes('aufbau'));
        if (aufbauShifts.length > 0) {
            yPos = this.addAufbauSection(doc, aufbauShifts, event, yPos);
        }
        
        const dates = [...new Set(event.shifts.map(s => s.date))].sort();
        
        dates.forEach(date => {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'long' });
            const formattedDate = dateObj.toLocaleDateString('de-DE');
            
            const dayShifts = event.shifts.filter(s => s.date === date && 
                !s.name.toLowerCase().includes('aufbau') && 
                !s.name.toLowerCase().includes('abbau'));
            
            if (dayShifts.length === 0) return;
            
            if (yPos > 200) {
                doc.addPage();
                yPos = 20;
            }
            
            yPos = this.addDayShiftTable(doc, dayShifts, event, dayName, formattedDate, yPos);
        });
        
        const abbauShifts = event.shifts.filter(s => s.name.toLowerCase().includes('abbau'));
        if (abbauShifts.length > 0) {
            yPos = this.addAbbauSection(doc, abbauShifts, event, yPos);
        }
        
        doc.save(`Arbeitsplan_${event.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    async addLogoToPDF(doc) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    ctx.drawImage(img, 0, 0);
                    
                    const dataURL = canvas.toDataURL('image/png');
                    
                    doc.addImage(dataURL, 'PNG', 10, 10, 40, 40);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            
            img.onerror = () => reject(new Error('Logo could not be loaded'));
            
            img.src = 'images/logo.png';
            
            setTimeout(() => reject(new Error('Logo loading timeout')), 3000);
        });
    }

    addAufbauSection(doc, aufbauShifts, event, yPos) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Aufbau', 20, yPos);
        yPos += 8;
        
        aufbauShifts.forEach(shift => {
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.text(`${shift.date} ab ${shift.time} (${shift.needed} Personen benötigt)`, 20, yPos);
            yPos += 6;
            
            const assignments = this.arbeitsplanData[event.id]?.assignments[shift.id] || [];
            
            const tableData = [];
            
            assignments.forEach(person => {
                tableData.push([person]);
            });
            
            const openPositions = shift.needed - assignments.length;
            for (let i = 0; i < openPositions; i++) {
                tableData.push(['[OFFEN]']);
            }
            
            tableData.forEach((row, index) => {
                doc.rect(25, yPos, 60, 6);
                doc.text(`- ${row[0]}`, 27, yPos + 4);
                yPos += 6;
            });
        });
        
        return yPos + 10;
    }

    addDayShiftTable(doc, dayShifts, event, dayName, formattedDate, yPos) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${dayName}, ${formattedDate}`, 20, yPos);
        yPos += 10;
        
        const tableStartX = 20;
        const tableWidth = 170;
        const colWidths = [30, 46, 46, 48];
        const rowHeight = 8;
        
        doc.setFillColor(240, 240, 240);
        doc.rect(tableStartX, yPos, tableWidth, rowHeight, 'F');
        
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        
        let currentX = tableStartX;
        const headers = ['Zeit', 'Küche', 'Bar', 'Service / Kasse'];
        headers.forEach((header, index) => {
            doc.rect(currentX, yPos, colWidths[index], rowHeight);
            doc.text(header, currentX + 2, yPos + 5.5);
            currentX += colWidths[index];
        });
        
        yPos += rowHeight;
        
        const timeGroups = {};
        dayShifts.forEach(shift => {
            if (!timeGroups[shift.time]) {
                timeGroups[shift.time] = { küche: [], bar: [], kasse: [] };
            }
            
            const assignments = this.arbeitsplanData[event.id]?.assignments[shift.id] || [];
            
            if (shift.name.toLowerCase().includes('küche')) {
                timeGroups[shift.time].küche = assignments;
            } else if (shift.name.toLowerCase().includes('bar')) {
                timeGroups[shift.time].bar = assignments;
            } else if (shift.name.toLowerCase().includes('kasse')) {
                timeGroups[shift.time].kasse = assignments;
            }
        });
        
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        
        Object.keys(timeGroups).sort().forEach(time => {
            const group = timeGroups[time];
            
            const maxItems = Math.max(
                group.küche.length || 1,
                group.bar.length || 1,
                group.kasse.length || 1
            );
            const dynamicRowHeight = Math.max(rowHeight, maxItems * 4 + 4);
            
            currentX = tableStartX;
            
            headers.forEach((header, index) => {
                doc.rect(currentX, yPos, colWidths[index], dynamicRowHeight);
                currentX += colWidths[index];
            });
            
            currentX = tableStartX;
            
            doc.text(time, currentX + 2, yPos + 5.5);
            currentX += colWidths[0];
            
            if (group.küche.length > 0) {
                group.küche.forEach((person, index) => {
                    doc.text(`- ${person}`, currentX + 2, yPos + 5.5 + (index * 4));
                });
            } else {
                doc.text('-', currentX + 2, yPos + 5.5);
            }
            currentX += colWidths[1];
            
            if (group.bar.length > 0) {
                group.bar.forEach((person, index) => {
                    doc.text(`- ${person}`, currentX + 2, yPos + 5.5 + (index * 4));
                });
            } else {
                doc.text('-', currentX + 2, yPos + 5.5);
            }
            currentX += colWidths[2];
            
            if (group.kasse.length > 0) {
                group.kasse.forEach((person, index) => {
                    doc.text(`- ${person}`, currentX + 2, yPos + 5.5 + (index * 4));
                });
            } else {
                doc.text('-', currentX + 2, yPos + 5.5);
            }
            
            yPos += dynamicRowHeight;
        });
        
        return yPos + 15;
    }

    addAbbauSection(doc, abbauShifts, event, yPos) {
        if (yPos > 230) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Abbau', 20, yPos);
        yPos += 8;
        
        abbauShifts.forEach(shift => {
            doc.setFont(undefined, 'normal');
            doc.setFontSize(10);
            doc.text(`${shift.date} ab ${shift.time} (${shift.needed} Personen benötigt)`, 20, yPos);
            yPos += 6;
            
            const assignments = this.arbeitsplanData[event.id]?.assignments[shift.id] || [];
            
            const tableData = [];
            
            assignments.forEach(person => {
                tableData.push([person]);
            });
            
            const openPositions = shift.needed - assignments.length;
            for (let i = 0; i < openPositions; i++) {
                tableData.push(['[OFFEN]']);
            }
            
            tableData.forEach((row, index) => {
                doc.rect(25, yPos, 60, 6);
                doc.text(`- ${row[0]}`, 27, yPos + 4);
                yPos += 6;
            });
        });
        
        return yPos + 10;
    }

    closeArbeitsplanModal() {
        document.getElementById('arbeitsplan-modal').classList.add('hidden');
    }

    editArbeitsplan() {
        const event = this.selectedEvent;
        if (!event || !event.arbeitsplanFile) return;
        
        alert(`Um den Arbeitsplan zu bearbeiten, öffnen Sie die Datei:\n\n${event.arbeitsplanFile}\n\nTragen Sie die Helfer manuell in die entsprechenden Schichten ein und speichern Sie die Datei.`);
    }

    toggleShift(shiftId) {
        const index = this.selectedShifts.indexOf(shiftId);
        if (index > -1) {
            this.selectedShifts.splice(index, 1);
        } else {
            this.selectedShifts.push(shiftId);
        }
    }

    sendRegistrationEmail() {
        const event = this.selectedEvent;
        if (!event) return;

        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const notes = document.getElementById('reg-notes').value.trim();

        if (!name || !email) {
            alert('Bitte füllen Sie mindestens Name und E-Mail aus.');
            return;
        }

        let subject, body;

        if (event.shifts && event.shifts.length > 0 && this.selectedShifts.length > 0) {
            subject = `Helfer-Anmeldung: ${event.title}`;
            
            const selectedShiftDetails = event.shifts
                .filter(shift => this.selectedShifts.includes(shift.id))
                .map(shift => `• ${shift.name} (${shift.date}, ${shift.time}) - ${shift.description}`)
                .join('\n');

            body = `Hallo ${event.organizer},

hiermit melde ich mich als Helfer für folgende Schichten an:

VERANSTALTUNG: ${event.title}
DATUM: ${this.formatDate(event.startDate)}
ORT: ${event.location}

GEWÄHLTE SCHICHTEN:
${selectedShiftDetails}

MEINE KONTAKTDATEN:
Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}

${notes ? `BEMERKUNGEN:\n${notes}` : ''}

Vielen Dank für die Organisation!

Mit freundlichen Grüssen
${name}`;

        } else if (event.participantRegistration) {
            const participants = document.getElementById('reg-participants').value || '1';
            subject = `Anmeldung: ${event.title}`;
            
            body = `Hallo ${event.organizer},

hiermit melde ich mich für die Veranstaltung an:

VERANSTALTUNG: ${event.title}
DATUM: ${this.formatDate(event.startDate)}
ZEIT: ${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}
ORT: ${event.location}
${event.cost !== 'Kostenlos' ? `KOSTEN: ${event.cost}` : ''}

ANMELDUNG:
Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}
${event.participantRegistration && participants !== '1' ? `Anzahl Personen: ${participants}` : ''}

${notes ? `BEMERKUNGEN:\n${notes}` : ''}

Vielen Dank für die Organisation!

Mit freundlichen Grüssen
${name}`;

        } else {
            subject = `Anmeldung: ${event.title}`;
            body = `Hallo ${event.organizer},

hiermit melde ich mich für die Veranstaltung an:

VERANSTALTUNG: ${event.title}
DATUM: ${this.formatDate(event.startDate)}

KONTAKTDATEN:
Name: ${name}
E-Mail: ${email}
${phone ? `Telefon: ${phone}` : ''}

${notes ? `BEMERKUNGEN:\n${notes}` : ''}

Mit freundlichen Grüssen
${name}`;
        }

        const mailtoLink = `mailto:${event.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        window.location.href = mailtoLink;

        setTimeout(() => {
            alert('E-Mail-Client wurde geöffnet. Bitte senden Sie die E-Mail ab.');
        }, 500);
    }

    closeModal() {
        document.getElementById('event-modal').classList.add('hidden');
        this.selectedEvent = null;
        this.selectedShifts = [];
        
        document.getElementById('reg-name').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-phone').value = '';
        document.getElementById('reg-notes').value = '';
        
        document.querySelectorAll('.shift-checkbox').forEach(cb => cb.checked = false);
    }

    downloadEventICS() {
        if (!this.selectedEvent) return;
        const icsData = this.generateICS([this.selectedEvent]);
        this.downloadICS(icsData, `${this.selectedEvent.id}.ics`);
    }

    shareEvent() {
        if (!this.selectedEvent) return;
        
        const url = `${window.location.origin}${window.location.pathname}#event-${this.selectedEvent.id}`;
        const text = `${this.selectedEvent.title} - ${this.formatDate(this.selectedEvent.startDate)}`;
        
        if (navigator.share) {
            navigator.share({
                title: this.selectedEvent.title,
                text: text,
                url: url
            });
        } else {
            navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
                alert('Link wurde in die Zwischenablage kopiert!');
            });
        }
    }

    generateICS(events) {
        const now = new Date();
        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Feuerwehrverein Raura Kaiseraugst//Vereinskalender//DE',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Feuerwehrverein Raura Kaiseraugst',
            'X-WR-CALDESC:Termine und Veranstaltungen des Feuerwehrvereins Raura Kaiseraugst',
            'X-WR-TIMEZONE:Europe/Zurich'
        ];

        events.forEach(event => {
            const uid = `${event.id}@feuerwehrverein-raura.ch`;
            const dtstart = this.formatDateForICS(event.startDate);
            const dtend = this.formatDateForICS(event.endDate);
            const dtstamp = this.formatDateForICS(now);
            const description = event.description.replace(/\n/g, '\\n');

            ics.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART:${dtstart}`,
                `DTEND:${dtend}`,
                `SUMMARY:${event.title}`,
                `DESCRIPTION:${description}`,
                `LOCATION:${event.location}`,
                `ORGANIZER;CN=${event.organizer}:mailto:${event.email}`,
                `CATEGORIES:${event.category}`,
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        ics.push('END:VCALENDAR');
        return ics.join('\r\n');
    }

    downloadICS(icsData, filename) {
        const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    parseMarkdown(text) {
        return text
            .replace(/\n\n/g, '</p><p class="mb-3">')
            .replace(/\n- /g, '</p><li class="ml-4">• ')
            .replace(/\n/g, '<br>')
            .replace(/^(.+)$/gm, '<p class="mb-3">$1</p>')
            .replace(/(<li.*<\/li>)/gs, '<ul class="mb-3 list-none">$1</ul>')
            .replace(/<p class="mb-3"><\/p>/g, '');
    }

    truncateText(text, maxLength) {
        const plainText = text.replace(/\n/g, ' ').trim();
        if (plainText.length <= maxLength) return plainText;
        return plainText.substring(0, maxLength) + '...';
    }

    formatDate(date) {
        return new Intl.DateTimeFormat('de-DE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        }).format(date);
    }

    formatTime(date) {
        return new Intl.DateTimeFormat('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    formatDateForICS(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }
}

// Initialize events manager when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔥 Feuerwehrverein Raura - Website gestartet');
    new EventsManager();
});
