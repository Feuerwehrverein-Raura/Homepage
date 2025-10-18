// Fixed version of events.js - Arbeitsplan remains viewable after registration deadline

class EventsManager {
    constructor() {
        this.events = [];
        this.selectedEvent = null;
        this.selectedShifts = [];
        this.currentFilter = 'all';
        this.viewMode = 'grid';
        this.arbeitsplanData = {};
    }

    async init() {
        console.log('🚀 Initialisiere Events Manager...');
        await this.loadEvents();
        await this.loadArbeitsplanData();
        this.setupEventListeners();
        this.renderEvents();
    }

    async loadEvents() {
        try {
            const response = await fetch('./calendar.ics');
            const icsText = await response.text();
            this.events = await this.parseICS(icsText);
            console.log(`✅ ${this.events.length} Events geladen`);
        } catch (error) {
            console.error('❌ Fehler beim Laden der Events:', error);
        }
    }

    async loadArbeitsplanData() {
        // Load assignment data for events with shifts
        for (const event of this.events) {
            if (event.shifts && event.shifts.length > 0 && event.assignmentsFile) {
                try {
                    const response = await fetch(event.assignmentsFile);
                    const text = await response.text();
                    this.arbeitsplanData[event.id] = this.parseAssignments(text);
                    console.log(`✅ Arbeitsplan geladen für: ${event.title}`);
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

        // Parse markdown content for assignments
        const lines = markdownContent.split('\n');
        let currentShift = null;

        lines.forEach(line => {
            // Match shift headers like: ### shift-id (Date, Time) - X Personen benötigt
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

    setupRegistrationSection(event) {
        const registrationSection = document.getElementById('registration-section');
        const shiftSelection = document.getElementById('shift-selection');
        const shiftsContainer = document.getElementById('shifts-container');
        const participantsSection = document.getElementById('participants-section');
        const arbeitsplanButton = document.getElementById('view-arbeitsplan');

        console.log('🔄 Setup Registration für Event:', event.title);

        const now = new Date();
        
        // WICHTIGE ÄNDERUNG: Arbeitsplan-Button separat behandeln
        // Der Arbeitsplan soll IMMER sichtbar sein, wenn es Schichten gibt
        if (event.shifts && event.shifts.length > 0) {
            if (arbeitsplanButton) {
                arbeitsplanButton.classList.remove('hidden');
                arbeitsplanButton.onclick = () => this.showArbeitsplanModal();
            }
        } else {
            if (arbeitsplanButton) {
                arbeitsplanButton.classList.add('hidden');
            }
        }

        // Check if registration is still possible
        const canRegister = event.registrationRequired && 
            (!event.registrationDeadline || event.registrationDeadline > now) &&
            event.endDate > now;

        if (!canRegister) {
            console.log('❌ Anmeldung nicht mehr möglich für:', event.title);
            registrationSection.classList.add('hidden');
            
            // Zeige Info wenn Anmeldefrist abgelaufen ist
            if (event.registrationDeadline && event.registrationDeadline < now) {
                const infoDiv = document.createElement('div');
                infoDiv.className = 'bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg mt-4';
                infoDiv.innerHTML = `
                    <p class="font-semibold">⚠️ Anmeldefrist abgelaufen</p>
                    <p class="text-sm mt-1">Die Anmeldefrist endete am ${this.formatDate(event.registrationDeadline)}.</p>
                    ${event.shifts && event.shifts.length > 0 ? 
                        '<p class="text-sm mt-2">Sie können den Arbeitsplan weiterhin einsehen.</p>' : ''}
                `;
                
                const modalContent = document.getElementById('modal-content');
                if (modalContent && !modalContent.querySelector('.bg-yellow-50')) {
                    modalContent.appendChild(infoDiv);
                }
            }
            return;
        }

        registrationSection.classList.remove('hidden');

        // Setup shifts if available
        if (event.shifts && Array.isArray(event.shifts) && event.shifts.length > 0) {
            console.log(`✅ ${event.shifts.length} Schichten gefunden, zeige Schichtauswahl`);
            shiftSelection.classList.remove('hidden');
            participantsSection.classList.add('hidden');
            
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
                            <div class="mt-1 flex items-center space-x-2">
                                <div>
                                    <span class="text-xs ${isFullyBooked ? 
                                        'bg-red-100 text-red-800' : remainingSpots <= 2 ? 
                                        'bg-yellow-100 text-yellow-800' : 
                                        'bg-fire-100 text-fire-800'} px-2 py-1 rounded-full block mb-1">
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

        // Main event content
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
            
            ${event.tags && event.tags.length > 0 ? `
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

        // Show registration section if applicable
        this.setupRegistrationSection(event);
        
        document.getElementById('event-modal').classList.remove('hidden');
    }

    showArbeitsplanModal() {
        if (!this.selectedEvent || !this.selectedEvent.shifts || this.selectedEvent.shifts.length === 0) {
            console.log('❌ Kein Arbeitsplan verfügbar');
            return;
        }
        
        const event = this.selectedEvent;
        const arbeitsplan = this.arbeitsplanData[event.id];
        
        console.log('📋 Zeige Arbeitsplan für:', event.title);
        
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
                        <div class="text-sm text-green-800">Schichten besetzt</div>
                    </div>
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                        <div class="text-2xl font-bold text-orange-600">${(arbeitsplan.totalShifts || 0) - (arbeitsplan.filledShifts || 0)}</div>
                        <div class="text-sm text-orange-800">Noch offen</div>
                    </div>
                </div>
            </div>
        `;

        // Group shifts by category
        const aufbauShifts = event.shifts.filter(s => s.id.includes('aufbau'));
        const betriebShifts = event.shifts.filter(s => !s.id.includes('aufbau') && !s.id.includes('abbau'));
        const abbauShifts = event.shifts.filter(s => s.id.includes('abbau'));

        // Render each category
        if (aufbauShifts.length > 0) {
            html += this.renderShiftCategory('Aufbau', aufbauShifts, arbeitsplan.assignments);
        }
        if (betriebShifts.length > 0) {
            html += this.renderShiftCategory('Betrieb', betriebShifts, arbeitsplan.assignments);
        }
        if (abbauShifts.length > 0) {
            html += this.renderShiftCategory('Abbau', abbauShifts, arbeitsplan.assignments);
        }

        return html;
    }

    renderShiftCategory(title, shifts, assignments) {
        let html = `
            <div class="mb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">🔧 ${title}</h3>
                <div class="space-y-4">
        `;

        shifts.forEach(shift => {
            const assigned = assignments[shift.id] || [];
            const remaining = shift.needed - assigned.length;
            const percentage = (assigned.length / shift.needed) * 100;

            html += `
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
                        <div class="bg-${percentage === 100 ? 'green' : percentage >= 50 ? 'blue' : 'orange'}-500 h-2 rounded-full" style="width: ${percentage}%"></div>
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
                    ` : ''}
                    
                    ${remaining > 0 ? `
                        <div class="mt-2 text-sm text-orange-600 font-medium">
                            ⚠️ Noch ${remaining} ${remaining === 1 ? 'Helfer' : 'Helfer'} benötigt
                        </div>
                    ` : ''}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    closeModal() {
        document.getElementById('event-modal').classList.add('hidden');
    }

    closeArbeitsplanModal() {
        document.getElementById('arbeitsplan-modal').classList.add('hidden');
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

    toggleShift(shiftId) {
        const index = this.selectedShifts.indexOf(shiftId);
        if (index > -1) {
            this.selectedShifts.splice(index, 1);
        } else {
            this.selectedShifts.push(shiftId);
        }
    }

    // Additional methods for event parsing, rendering, etc...
    // These would be the same as in the original file
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const eventsManager = new EventsManager();
    eventsManager.init();
});
