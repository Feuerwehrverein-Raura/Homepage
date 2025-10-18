// Events Management System - Feuerwehrverein Raura
// Version 2.0 - Mit Arbeitsplan-Fix

class EventsManager {
    constructor() {
        this.events = [];
        this.selectedEvent = null;
        this.selectedShifts = [];
        this.currentFilter = 'all';
        this.viewMode = 'grid';
        this.searchQuery = '';
        this.currentCategory = '';
        this.arbeitsplanData = {};
    }

    async init() {
        console.log('🚀 Initialisiere Events Manager...');
        await this.loadEvents();
        await this.loadArbeitsplanData();
        this.setupEventListeners();
        this.filterEvents();
        this.renderEvents();
        
        // Hide loading indicator
        const loading = document.getElementById('loading-events');
        if (loading) loading.classList.add('hidden');
    }

    async loadEvents() {
        try {
            const response = await fetch('./calendar.ics');
            const icsText = await response.text();
            this.events = await this.parseICS(icsText);
            console.log(`✅ ${this.events.length} Events aus ICS geladen`);
        } catch (error) {
            console.error('❌ Fehler beim Laden der Events:', error);
            // Try loading from events folder as fallback
            await this.loadEventsFromMarkdown();
        }
    }

    async loadEventsFromMarkdown() {
        // This would load events from markdown files in the events folder
        // Implementation depends on your setup
        console.log('📁 Lade Events aus Markdown-Dateien...');
    }

    async parseICS(icsText) {
        const events = [];
        const vevents = icsText.split('BEGIN:VEVENT');
        
        for (let i = 1; i < vevents.length; i++) {
            const vevent = vevents[i];
            const event = this.parseVEvent(vevent);
            if (event) {
                events.push(event);
            }
        }
        
        return events;
    }

    parseVEvent(veventText) {
        const getField = (field) => {
            const regex = new RegExp(`${field}:(.*)`, 'i');
            const match = veventText.match(regex);
            return match ? match[1].trim() : '';
        };

        const parseDateTime = (dtString) => {
            // Format: 20251018T120000Z
            if (!dtString) return null;
            const year = parseInt(dtString.substr(0, 4));
            const month = parseInt(dtString.substr(4, 2)) - 1;
            const day = parseInt(dtString.substr(6, 2));
            const hour = parseInt(dtString.substr(9, 2));
            const minute = parseInt(dtString.substr(11, 2));
            return new Date(year, month, day, hour, minute);
        };

        const uid = getField('UID');
        if (!uid) return null;

        const event = {
            id: uid,
            title: getField('SUMMARY'),
            description: getField('DESCRIPTION').replace(/\\n/g, '\n'),
            location: getField('LOCATION'),
            startDate: parseDateTime(getField('DTSTART')),
            endDate: parseDateTime(getField('DTEND')),
            organizer: getField('ORGANIZER')?.replace('mailto:', ''),
            category: getField('CATEGORIES'),
            status: getField('STATUS'),
            registrationRequired: getField('X-REGISTRATION-REQUIRED') === 'TRUE',
            registrationDeadline: parseDateTime(getField('X-REGISTRATION-DEADLINE')),
            cost: getField('X-COST') || 'Kostenlos',
            maxParticipants: parseInt(getField('X-MAX-PARTICIPANTS')) || null,
            participantRegistration: getField('X-PARTICIPANT-REGISTRATION') === 'TRUE',
            tags: [],
            shifts: []
        };

        // Parse custom fields for shifts
        const shiftsData = getField('X-SHIFTS');
        if (shiftsData) {
            try {
                event.shifts = JSON.parse(shiftsData);
                event.hasShifts = true;
            } catch (e) {
                console.warn('Could not parse shifts data:', e);
            }
        }

        // Parse tags
        const tagsData = getField('X-TAGS');
        if (tagsData) {
            event.tags = tagsData.split(',').map(tag => tag.trim());
        }

        // Assignments file
        event.assignmentsFile = getField('X-ASSIGNMENTS-FILE');

        return event;
    }

    async loadArbeitsplanData() {
        // Load assignment data for events with shifts
        for (const event of this.events) {
            if (event.shifts && event.shifts.length > 0) {
                try {
                    const assignmentsFile = event.assignmentsFile || `events/${event.id}-assignments.md`;
                    const response = await fetch(assignmentsFile);
                    if (response.ok) {
                        const text = await response.text();
                        this.arbeitsplanData[event.id] = this.parseAssignments(text);
                        console.log(`✅ Arbeitsplan geladen für: ${event.title}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Kein Arbeitsplan gefunden für: ${event.title}`);
                }
            }
        }
    }

    parseAssignments(markdownContent) {
        const assignments = {};
        let totalShifts = 0;
        let filledShifts = 0;

        const lines = markdownContent.split('\n');
        let currentShift = null;

        lines.forEach(line => {
            // Match shift headers
            const shiftMatch = line.match(/###\s+([a-z0-9-]+)\s+\(.*?\)\s+-\s+(\d+)\s+Personen/i);
            if (shiftMatch) {
                currentShift = shiftMatch[1];
                assignments[currentShift] = [];
                totalShifts++;
            }
            // Match person assignments
            else if (currentShift && line.match(/^-\s+[A-Za-z]/)) {
                const person = line.replace(/^-\s+/, '').trim();
                if (!person.includes('[OFFEN]')) {
                    assignments[currentShift].push(person);
                    filledShifts++;
                }
            }
        });

        return { assignments, totalShifts, filledShifts };
    }

    setupEventListeners() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter = e.target.dataset.filter;
                this.updateFilterButtons();
                this.filterEvents();
                this.renderEvents();
            });
        });

        // Search and filters
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.filterEvents();
                this.renderEvents();
            });
        }

        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.currentCategory = e.target.value;
                this.filterEvents();
                this.renderEvents();
            });
        }

        // View mode buttons
        const listViewBtn = document.getElementById('list-view-btn');
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => {
                this.viewMode = 'list';
                this.updateViewButtons();
                this.renderEvents();
            });
        }

        const gridViewBtn = document.getElementById('grid-view-btn');
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => {
                this.viewMode = 'grid';
                this.updateViewButtons();
                this.renderEvents();
            });
        }

        // Modal controls
        this.setupModalListeners();
        
        // Make manager globally accessible
        window.eventsManager = this;
    }

    setupModalListeners() {
        // Event Modal
        const closeModal = document.getElementById('close-modal');
        if (closeModal) {
            closeModal.addEventListener('click', () => this.closeModal());
        }
        
        const closeModalBtn = document.getElementById('close-modal-btn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }

        // Arbeitsplan Modal
        const closeArbeitsplanModal = document.getElementById('close-arbeitsplan-modal');
        if (closeArbeitsplanModal) {
            closeArbeitsplanModal.addEventListener('click', () => this.closeArbeitsplanModal());
        }
        
        const closeArbeitsplanModalBtn = document.getElementById('close-arbeitsplan-modal-btn');
        if (closeArbeitsplanModalBtn) {
            closeArbeitsplanModalBtn.addEventListener('click', () => this.closeArbeitsplanModal());
        }

        // Other buttons
        const downloadICS = document.getElementById('download-event-ics');
        if (downloadICS) {
            downloadICS.addEventListener('click', () => this.downloadEventICS());
        }

        const shareEvent = document.getElementById('share-event');
        if (shareEvent) {
            shareEvent.addEventListener('click', () => this.shareEvent());
        }

        const sendRegistration = document.getElementById('send-registration-email');
        if (sendRegistration) {
            sendRegistration.addEventListener('click', () => this.sendRegistrationEmail());
        }

        const downloadPDF = document.getElementById('download-arbeitsplan-pdf');
        if (downloadPDF) {
            downloadPDF.addEventListener('click', () => this.downloadArbeitsplanPDF());
        }

        const editArbeitsplan = document.getElementById('edit-arbeitsplan');
        if (editArbeitsplan) {
            editArbeitsplan.addEventListener('click', () => this.editArbeitsplan());
        }

        // Modal background click to close
        const eventModal = document.getElementById('event-modal');
        if (eventModal) {
            eventModal.addEventListener('click', (e) => {
                if (e.target.id === 'event-modal') this.closeModal();
            });
        }

        const arbeitsplanModal = document.getElementById('arbeitsplan-modal');
        if (arbeitsplanModal) {
            arbeitsplanModal.addEventListener('click', (e) => {
                if (e.target.id === 'arbeitsplan-modal') this.closeArbeitsplanModal();
            });
        }
    }

    updateFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const isActive = btn.dataset.filter === this.currentFilter;
            if (isActive) {
                btn.classList.add('bg-white', 'text-fire-700');
                btn.classList.remove('border-2', 'border-white', 'text-white');
            } else {
                btn.classList.remove('bg-white', 'text-fire-700');
                btn.classList.add('border-2', 'border-white', 'text-white');
            }
        });
    }

    updateViewButtons() {
        const listBtn = document.getElementById('list-view-btn');
        const gridBtn = document.getElementById('grid-view-btn');
        
        if (this.viewMode === 'list') {
            listBtn?.classList.add('bg-fire-500', 'text-white');
            listBtn?.classList.remove('border', 'border-gray-300', 'text-gray-600');
            gridBtn?.classList.remove('bg-fire-500', 'text-white');
            gridBtn?.classList.add('border', 'border-gray-300', 'text-gray-600');
        } else {
            gridBtn?.classList.add('bg-fire-500', 'text-white');
            gridBtn?.classList.remove('border', 'border-gray-300', 'text-gray-600');
            listBtn?.classList.remove('bg-fire-500', 'text-white');
            listBtn?.classList.add('border', 'border-gray-300', 'text-gray-600');
        }
    }

    filterEvents() {
        const now = new Date();
        let filtered = [...this.events];

        // Time filter
        if (this.currentFilter === 'upcoming') {
            filtered = filtered.filter(event => event.startDate > now);
        } else if (this.currentFilter === 'past') {
            filtered = filtered.filter(event => event.endDate < now);
        }

        // Search filter
        if (this.searchQuery) {
            filtered = filtered.filter(event => 
                event.title.toLowerCase().includes(this.searchQuery) ||
                event.description?.toLowerCase().includes(this.searchQuery) ||
                event.location?.toLowerCase().includes(this.searchQuery)
            );
        }

        // Category filter
        if (this.currentCategory) {
            filtered = filtered.filter(event => event.category === this.currentCategory);
        }

        // Sort by date (upcoming first)
        filtered.sort((a, b) => {
            const aDate = a.startDate;
            const bDate = b.startDate;
            if (this.currentFilter === 'past') {
                return bDate - aDate; // Newest first for past events
            }
            return aDate - bDate; // Earliest first for upcoming
        });

        this.filteredEvents = filtered;
    }

    renderEvents() {
        const container = document.getElementById('events-container');
        if (!container) return;

        if (this.filteredEvents.length === 0) {
            container.innerHTML = '';
            document.getElementById('no-events')?.classList.remove('hidden');
            return;
        }

        document.getElementById('no-events')?.classList.add('hidden');

        if (this.viewMode === 'grid') {
            container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
            container.innerHTML = this.filteredEvents.map(event => this.renderEventCard(event)).join('');
        } else {
            container.className = 'space-y-4';
            container.innerHTML = this.filteredEvents.map(event => this.renderEventListItem(event)).join('');
        }
    }

    renderEventCard(event) {
        const now = new Date();
        const isPast = event.endDate < now;
        const isRunning = event.startDate <= now && event.endDate >= now;
        const registrationClosed = event.registrationDeadline && event.registrationDeadline < now;

        return `
            <div class="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer ${isPast ? 'opacity-75' : ''}"
                 onclick="window.eventsManager.showEventModal('${event.id}')">
                <div class="p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-2">${event.title}</h3>
                    ${event.subtitle ? `<p class="text-gray-600 mb-3">${event.subtitle}</p>` : ''}
                    
                    <div class="space-y-2 text-sm text-gray-600">
                        <div class="flex items-center">
                            <span class="mr-2">📅</span>
                            <span>${this.formatDate(event.startDate)}</span>
                        </div>
                        <div class="flex items-center">
                            <span class="mr-2">⏰</span>
                            <span>${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}</span>
                        </div>
                        <div class="flex items-center">
                            <span class="mr-2">📍</span>
                            <span>${event.location}</span>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap gap-2 mt-4">
                        ${isPast ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">Vergangen</span>' : ''}
                        ${isRunning ? '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs animate-pulse">Läuft</span>' : ''}
                        ${event.shifts && event.shifts.length > 0 ? '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">📋 Arbeitsplan</span>' : ''}
                        ${event.registrationRequired && !registrationClosed && !isPast ? '<span class="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">📧 Anmeldung möglich</span>' : ''}
                        ${registrationClosed && !isPast ? '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Anmeldung geschlossen</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderEventListItem(event) {
        const now = new Date();
        const isPast = event.endDate < now;
        const isRunning = event.startDate <= now && event.endDate >= now;
        const registrationClosed = event.registrationDeadline && event.registrationDeadline < now;

        return `
            <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer ${isPast ? 'opacity-75' : ''}"
                 onclick="window.eventsManager.showEventModal('${event.id}')">
                <div class="flex flex-col md:flex-row justify-between">
                    <div class="flex-1">
                        <h3 class="text-xl font-bold text-gray-800 mb-2">${event.title}</h3>
                        ${event.subtitle ? `<p class="text-gray-600 mb-3">${event.subtitle}</p>` : ''}
                        
                        <div class="flex flex-wrap gap-4 text-sm text-gray-600">
                            <span>📅 ${this.formatDate(event.startDate)}</span>
                            <span>⏰ ${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}</span>
                            <span>📍 ${event.location}</span>
                            <span>👤 ${event.organizer}</span>
                        </div>
                    </div>
                    
                    <div class="flex flex-col justify-center mt-4 md:mt-0 md:ml-6">
                        <div class="flex flex-wrap gap-2">
                            ${isPast ? '<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">Vergangen</span>' : ''}
                            ${isRunning ? '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs animate-pulse">Läuft</span>' : ''}
                            ${event.shifts && event.shifts.length > 0 ? '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">📋 Arbeitsplan</span>' : ''}
                            ${event.registrationRequired && !registrationClosed && !isPast ? '<span class="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">📧 Anmeldung</span>' : ''}
                            ${registrationClosed && !isPast ? '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Geschlossen</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    showEventModal(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;

        this.selectedEvent = event;
        this.selectedShifts = [];
        
        console.log('📋 Öffne Modal für Event:', event.title);
        console.log('🔧 Event hat Schichten:', event.shifts?.length || 0);
        
        // Set modal header
        document.getElementById('modal-title').textContent = event.title;
        document.getElementById('modal-meta').innerHTML = `
            <span>📅 ${this.formatDate(event.startDate)}</span>
            <span>⏰ ${this.formatTime(event.startDate)} - ${this.formatTime(event.endDate)}</span>
            <span>📍 ${event.location}</span>
            <span>👤 ${event.organizer}</span>
        `;

        // Set modal content
        document.getElementById('modal-content').innerHTML = `
            ${event.subtitle ? `<p class="text-lg text-gray-700 mb-4 italic">${event.subtitle}</p>` : ''}
            ${event.description ? `<div class="prose max-w-none mb-6">${event.description}</div>` : ''}
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t pt-6">
                <div class="space-y-3">
                    <h4 class="font-semibold text-gray-800">Details</h4>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Kategorie:</span>
                            <span>${event.category || 'Allgemein'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Kosten:</span>
                            <span class="font-medium">${event.cost || 'Kostenlos'}</span>
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
                                <span class="${new Date(event.registrationDeadline) < new Date() ? 'text-red-600 font-bold' : ''}">${this.formatDate(event.registrationDeadline)}</span>
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
            
            ${event.tags && event.tags.length > 0 ? `
                <div class="mt-6">
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

        // Setup Arbeitsplan and Registration sections
        this.setupArbeitsplanSection(event);
        this.setupRegistrationSection(event);
        
        // Show modal
        document.getElementById('event-modal').classList.remove('hidden');
    }

    setupArbeitsplanSection(event) {
        const arbeitsplanSection = document.getElementById('arbeitsplan-section');
        const arbeitsplanButton = document.getElementById('view-arbeitsplan');
        
        console.log('🔧 Setup Arbeitsplan für:', event.title);
        console.log('📊 Schichten vorhanden:', event.shifts?.length || 0);
        
        // WICHTIG: Arbeitsplan-Section IMMER anzeigen wenn Schichten vorhanden
        if (event.shifts && event.shifts.length > 0) {
            console.log('✅ Zeige Arbeitsplan-Button');
            
            if (arbeitsplanSection) {
                arbeitsplanSection.classList.remove('hidden');
            }
            
            if (arbeitsplanButton) {
                arbeitsplanButton.onclick = () => this.showArbeitsplanModal();
            }
            
            // Add statistics if data available
            const arbeitsplan = this.arbeitsplanData[event.id];
            if (arbeitsplan && arbeitsplanSection) {
                const existingStats = arbeitsplanSection.querySelector('.stats-info');
                if (!existingStats) {
                    const statsHtml = `
                        <div class="stats-info flex justify-between text-sm mt-2 mb-4">
                            <span class="text-gray-600">Status:</span>
                            <span class="font-medium">${arbeitsplan.filledShifts || 0} von ${arbeitsplan.totalShifts || 0} Schichten besetzt</span>
                        </div>
                    `;
                    const button = arbeitsplanSection.querySelector('#view-arbeitsplan');
                    if (button) {
                        const div = document.createElement('div');
                        div.innerHTML = statsHtml;
                        button.parentNode.insertBefore(div.firstElementChild, button);
                    }
                }
            }
        } else {
            console.log('❌ Keine Schichten - verstecke Arbeitsplan');
            if (arbeitsplanSection) {
                arbeitsplanSection.classList.add('hidden');
            }
        }
    }

    setupRegistrationSection(event) {
        const registrationSection = document.getElementById('registration-section');
        const deadlineInfo = document.getElementById('deadline-info');
        const shiftSelection = document.getElementById('shift-selection');
        const shiftsContainer = document.getElementById('shifts-container');
        const participantsSection = document.getElementById('participants-section');
        
        console.log('📧 Setup Registration für:', event.title);
        
        const now = new Date();
        
        // Check if registration is possible
        const canRegister = event.registrationRequired && 
            (!event.registrationDeadline || event.registrationDeadline > now) &&
            event.endDate > now;
        
        if (!canRegister) {
            console.log('❌ Anmeldung nicht mehr möglich');
            
            if (registrationSection) {
                registrationSection.classList.add('hidden');
            }
            
            // Show info if deadline passed
            if (event.registrationDeadline && event.registrationDeadline < now) {
                if (deadlineInfo) {
                    deadlineInfo.classList.remove('hidden');
                    
                    const deadlineDate = document.getElementById('deadline-date');
                    if (deadlineDate) {
                        deadlineDate.textContent = `Die Anmeldefrist endete am ${this.formatDate(event.registrationDeadline)}.`;
                    }
                    
                    const arbeitsplanHint = document.getElementById('arbeitsplan-hint');
                    if (arbeitsplanHint && event.shifts && event.shifts.length > 0) {
                        arbeitsplanHint.textContent = 'Sie können den Arbeitsplan weiterhin einsehen.';
                    } else if (arbeitsplanHint) {
                        arbeitsplanHint.textContent = '';
                    }
                }
            }
            return;
        }
        
        console.log('✅ Anmeldung möglich - zeige Formular');
        
        if (deadlineInfo) {
            deadlineInfo.classList.add('hidden');
        }
        
        if (registrationSection) {
            registrationSection.classList.remove('hidden');
        }
        
        // Setup shifts or participant registration
        if (event.shifts && event.shifts.length > 0) {
            // Shift registration
            if (shiftSelection) shiftSelection.classList.remove('hidden');
            if (participantsSection) participantsSection.classList.add('hidden');
            
            if (shiftsContainer) {
                const arbeitsplan = this.arbeitsplanData[event.id] || { assignments: {} };
                
                shiftsContainer.innerHTML = event.shifts.map(shift => {
                    const assignments = arbeitsplan.assignments[shift.id] || [];
                    const remainingSpots = shift.needed - assignments.length;
                    const isFullyBooked = remainingSpots <= 0;
                    
                    return `
                        <label class="shift-option block p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${isFullyBooked ? 'opacity-50 cursor-not-allowed' : ''}">
                            <input type="checkbox" 
                                id="shift-${shift.id}" 
                                value="${shift.id}" 
                                onchange="window.eventsManager.toggleShift('${shift.id}')"
                                ${isFullyBooked ? 'disabled' : ''}
                                class="mr-2">
                            <div class="inline-block">
                                <span class="font-medium">${shift.name}</span>
                                <div class="text-sm text-gray-600">
                                    📅 ${shift.date} | ⏰ ${shift.time}
                                    ${shift.description ? `<br>📝 ${shift.description}` : ''}
                                </div>
                                <div class="mt-1">
                                    <span class="text-xs ${isFullyBooked ? 'bg-red-100 text-red-800' : remainingSpots <= 2 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'} px-2 py-1 rounded-full">
                                        ${isFullyBooked ? 'Voll besetzt' : `${remainingSpots} offen`}
                                    </span>
                                </div>
                            </div>
                        </label>
                    `;
                }).join('');
            }
        } else if (event.participantRegistration) {
            // Participant registration
            if (shiftSelection) shiftSelection.classList.add('hidden');
            if (participantsSection) participantsSection.classList.remove('hidden');
        } else {
            // Simple registration
            if (shiftSelection) shiftSelection.classList.add('hidden');
            if (participantsSection) participantsSection.classList.add('hidden');
        }
    }

    showArbeitsplanModal() {
        if (!this.selectedEvent || !this.selectedEvent.shifts) {
            console.error('❌ Kein Event oder keine Schichten vorhanden');
            return;
        }
        
        const event = this.selectedEvent;
        const arbeitsplan = this.arbeitsplanData[event.id] || { assignments: {}, totalShifts: 0, filledShifts: 0 };
        
        console.log('📊 Öffne Arbeitsplan für:', event.title);
        
        const title = document.getElementById('arbeitsplan-title');
        if (title) {
            title.textContent = `Arbeitsplan ${event.title}`;
        }
        
        const status = document.getElementById('arbeitsplan-status');
        if (status) {
            status.textContent = `Stand: ${new Date().toLocaleDateString('de-DE')} • ${arbeitsplan.filledShifts} von ${event.shifts.length} Schichten besetzt`;
        }
        
        const content = document.getElementById('arbeitsplan-content');
        if (content) {
            content.innerHTML = this.generateArbeitsplanHTML(event);
        }
        
        const modal = document.getElementById('arbeitsplan-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    generateArbeitsplanHTML(event) {
        const arbeitsplan = this.arbeitsplanData[event.id] || { assignments: {} };
        
        let html = `
            <div class="mb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">📊 Übersicht</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-blue-600">${event.shifts.length}</div>
                        <div class="text-sm text-blue-800">Schichten gesamt</div>
                    </div>
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-green-600">${arbeitsplan.filledShifts || 0}</div>
                        <div class="text-sm text-green-800">Schichten besetzt</div>
                    </div>
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-orange-600">${event.shifts.length - (arbeitsplan.filledShifts || 0)}</div>
                        <div class="text-sm text-orange-800">Noch offen</div>
                    </div>
                </div>
            </div>
            
            <div class="mb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">📋 Schichtdetails</h3>
                <div class="space-y-4">
        `;
        
        // Group shifts by category if needed
        const aufbauShifts = event.shifts.filter(s => s.id.includes('aufbau'));
        const abbauShifts = event.shifts.filter(s => s.id.includes('abbau'));
        const betriebShifts = event.shifts.filter(s => !s.id.includes('aufbau') && !s.id.includes('abbau'));
        
        // Render Aufbau
        if (aufbauShifts.length > 0) {
            html += '<h4 class="font-semibold text-gray-700 mt-4 mb-2">🔧 Aufbau</h4>';
            aufbauShifts.forEach(shift => {
                html += this.renderShiftDetail(shift, arbeitsplan.assignments[shift.id] || []);
            });
        }
        
        // Render Betrieb
        if (betriebShifts.length > 0) {
            html += '<h4 class="font-semibold text-gray-700 mt-4 mb-2">🎪 Betrieb</h4>';
            betriebShifts.forEach(shift => {
                html += this.renderShiftDetail(shift, arbeitsplan.assignments[shift.id] || []);
            });
        }
        
        // Render Abbau
        if (abbauShifts.length > 0) {
            html += '<h4 class="font-semibold text-gray-700 mt-4 mb-2">📦 Abbau</h4>';
            abbauShifts.forEach(shift => {
                html += this.renderShiftDetail(shift, arbeitsplan.assignments[shift.id] || []);
            });
        }
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }

    renderShiftDetail(shift, assigned) {
        const remaining = shift.needed - assigned.length;
        const percentage = (assigned.length / shift.needed) * 100;
        
        return `
            <div class="border rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-semibold">${shift.name}</h4>
                        <p class="text-sm text-gray-600">📅 ${shift.date} | ⏰ ${shift.time}</p>
                        ${shift.description ? `<p class="text-sm text-gray-500 mt-1">${shift.description}</p>` : ''}
                    </div>
                    <div class="text-right">
                        <span class="text-sm font-medium ${remaining === 0 ? 'text-green-600' : remaining <= 2 ? 'text-orange-600' : 'text-gray-600'}">
                            ${assigned.length}/${shift.needed} besetzt
                        </span>
                    </div>
                </div>
                
                <div class="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div class="bg-${percentage === 100 ? 'green' : percentage >= 50 ? 'blue' : 'orange'}-500 h-2 rounded-full transition-all" style="width: ${percentage}%"></div>
                </div>
                
                ${assigned.length > 0 ? `
                    <div class="mt-3">
                        <p class="text-sm font-medium text-gray-700 mb-2">Zugeteilte Helfer:</p>
                        <div class="flex flex-wrap gap-2">
                            ${assigned.map(person => `
                                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                                    👤 ${person}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="mt-3 text-sm text-gray-500 italic">
                        Noch keine Helfer zugeteilt
                    </div>
                `}
                
                ${remaining > 0 ? `
                    <div class="mt-2 text-sm text-orange-600 font-medium">
                        ⚠️ Noch ${remaining} ${remaining === 1 ? 'Helfer' : 'Helfer'} benötigt
                    </div>
                ` : `
                    <div class="mt-2 text-sm text-green-600 font-medium">
                        ✅ Vollständig besetzt
                    </div>
                `}
            </div>
        `;
    }

    closeModal() {
        document.getElementById('event-modal')?.classList.add('hidden');
    }

    closeArbeitsplanModal() {
        document.getElementById('arbeitsplan-modal')?.classList.add('hidden');
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

        const name = document.getElementById('reg-name')?.value.trim();
        const email = document.getElementById('reg-email')?.value.trim();
        const phone = document.getElementById('reg-phone')?.value.trim();
        const notes = document.getElementById('reg-notes')?.value.trim();

        if (!name || !email) {
            alert('Bitte füllen Sie mindestens Name und E-Mail aus.');
            return;
        }

        let subject, body;

        if (event.shifts && event.shifts.length > 0 && this.selectedShifts.length > 0) {
            // Helper registration with shifts
            subject = `Helfer-Anmeldung: ${event.title}`;
            
            const selectedShiftDetails = event.shifts
                .filter(shift => this.selectedShifts.includes(shift.id))
                .map(shift => `• ${shift.name} (${shift.date}, ${shift.time})`)
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

Mit freundlichen Grüssen
${name}`;

        } else if (event.participantRegistration) {
            // Participant registration
            const participants = document.getElementById('reg-participants')?.value || '1';
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
Anzahl Personen: ${participants}

${notes ? `BEMERKUNGEN:\n${notes}` : ''}

Mit freundlichen Grüssen
${name}`;

        } else {
            // Simple registration
            subject = `Anmeldung: ${event.title}`;
            body = `Hallo ${event.organizer},

hiermit melde ich mich für die Veranstaltung an:

VERANSTALTUNG: ${event.title}
DATUM: ${this.formatDate(event.startDate)}
ORT: ${event.location}

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
            this.closeModal();
        }, 500);
    }

    downloadEventICS() {
        // Implementation for ICS download
        console.log('📅 Download ICS for event:', this.selectedEvent?.title);
    }

    shareEvent() {
        // Implementation for sharing
        console.log('📤 Share event:', this.selectedEvent?.title);
    }

    downloadArbeitsplanPDF() {
        // Implementation for PDF download
        console.log('📄 Download PDF for event:', this.selectedEvent?.title);
    }

    editArbeitsplan() {
        // Implementation for editing
        console.log('✏️ Edit Arbeitsplan for event:', this.selectedEvent?.title);
        alert('Der Schichtplan-Manager wird geöffnet...');
        window.open('schichtplan-manager.html', '_blank');
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    formatTime(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('de-DE', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 DOM geladen - starte EventsManager');
    const eventsManager = new EventsManager();
    eventsManager.init();
});
