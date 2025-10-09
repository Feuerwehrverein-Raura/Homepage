const SimplePDFGenerator = require('./simple-pdf-generator');
const fs = require('fs');
const path = require('path');

async function testPDFGeneration() {
    console.log('🧪 Testing PDF Generation...');
    
    const pdfGenerator = new SimplePDFGenerator();
    
    try {
        // Initialize PDF generator
        await pdfGenerator.initialize();
        console.log('✅ PDF generator initialized');

        // Test event data
        const testEvent = {
            id: 'test-event',
            title: 'Test Chilbi 2025',
            subtitle: 'Test Event für PDF Generation',
            startDate: '2025-10-18T12:00:00',
            endDate: '2025-10-19T22:00:00',
            location: 'Test Location, Kaiseraugst',
            organizer: 'Test Organizer',
            email: 'test@fwv-raura.ch',
            registrationDeadline: '2025-10-17T23:59:59',
            status: 'confirmed',
            shifts: [
                {
                    id: 'aufbau',
                    name: 'Aufbau',
                    date: '2025-10-16',
                    time: '17:00-20:00',
                    needed: 3,
                    description: 'Grundaufbau und Vorbereitung'
                },
                {
                    id: 'samstag-bar-12-14',
                    name: 'Bar Samstag 12:00-14:00',
                    date: '2025-10-18',
                    time: '12:00-14:00',
                    needed: 2,
                    description: 'Bar - Getränke ausgeben und zubereiten'
                },
                {
                    id: 'samstag-kueche-12-14',
                    name: 'Küche Samstag 12:00-14:00',
                    date: '2025-10-18',
                    time: '12:00-14:00',
                    needed: 2,
                    description: 'Küche - Essen zubereiten und ausgeben'
                },
                {
                    id: 'samstag-bar-16-18',
                    name: 'Bar Samstag 16:00-18:00',
                    date: '2025-10-18',
                    time: '16:00-18:00',
                    needed: 2,
                    description: 'Bar - Getränke ausgeben und zubereiten'
                },
                {
                    id: 'abbau',
                    name: 'Abbau',
                    date: '2025-10-20',
                    time: '18:00-21:00',
                    needed: 4,
                    description: 'Abbau und Aufräumarbeiten'
                }
            ]
        };

        // Test assignments
        const testAssignments = [
            { shiftId: 'aufbau', name: 'Stefan Müller', email: 'stefan@example.com', timestamp: '2024-09-15T10:30:00Z' },
            { shiftId: 'aufbau', name: 'René Käslin', email: 'rene@example.com', timestamp: '2024-09-15T11:15:00Z' },
            { shiftId: 'samstag-bar-12-14', name: 'Giuseppe Costanza', email: 'giuseppe@example.com', timestamp: '2024-09-16T14:20:00Z' },
            { shiftId: 'samstag-kueche-12-14', name: 'Brigitte Käslin', email: 'brigitte@example.com', timestamp: '2024-09-16T14:25:00Z' },
            { shiftId: 'samstag-bar-16-18', name: 'Ramon Kahl', email: 'ramon@example.com', timestamp: '2024-09-17T09:45:00Z' }
        ];

        // Test single event PDF generation
        console.log('📄 Generating single event PDF...');
        const eventPdfPath = await pdfGenerator.generateShiftPlanPDF(testEvent, testAssignments, '');
        console.log(`✅ Event PDF created: ${eventPdfPath}`);

        // Test overview PDF generation
        console.log('📄 Generating overview PDF...');
        const overviewPdfPath = await pdfGenerator.generateOverviewPDF([testEvent], { 'test-event': testAssignments });
        console.log(`✅ Overview PDF created: ${overviewPdfPath}`);

        // Close PDF generator
        await pdfGenerator.close();
        console.log('✅ PDF generator closed');

        console.log('\n🎉 PDF Generation Test Complete!');
        console.log('\nGenerated files:');
        console.log(`- Event PDF: ${path.relative(process.cwd(), eventPdfPath)}`);
        console.log(`- Overview PDF: ${path.relative(process.cwd(), overviewPdfPath)}`);

        // Check file sizes
        const eventStats = fs.statSync(eventPdfPath);
        const overviewStats = fs.statSync(overviewPdfPath);
        
        console.log('\nFile information:');
        console.log(`- Event PDF: ${(eventStats.size / 1024).toFixed(1)} KB`);
        console.log(`- Overview PDF: ${(overviewStats.size / 1024).toFixed(1)} KB`);

    } catch (error) {
        console.error('❌ Test failed:', error);
        await pdfGenerator.close();
        process.exit(1);
    }
}

// Test helper function to validate HTML output (printable to PDF)
async function validateHTMLFiles() {
    const pdfDir = path.join(__dirname, '..', 'pdfs');
    
    if (!fs.existsSync(pdfDir)) {
        console.log('❌ PDFs directory not found');
        return false;
    }

    const htmlFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.html'));
    const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
    
    console.log(`✅ Found ${htmlFiles.length} HTML files and ${pdfFiles.length} PDF files:`);
    
    [...htmlFiles, ...pdfFiles].forEach(file => {
        const filePath = path.join(pdfDir, file);
        const stats = fs.statSync(filePath);
        const type = file.endsWith('.html') ? 'HTML (printable)' : 'PDF';
        console.log(`  - ${file} (${(stats.size / 1024).toFixed(1)} KB) - ${type}`);
    });

    return htmlFiles.length > 0 || pdfFiles.length > 0;
}

// Run test if called directly
if (require.main === module) {
    testPDFGeneration()
        .then(() => {
            console.log('\n📋 Validating generated files...');
            return validateHTMLFiles();
        })
        .then((valid) => {
            if (valid) {
                console.log('\n✅ All tests passed successfully!');
            } else {
                console.log('\n❌ File validation failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testPDFGeneration, validateHTMLFiles };
