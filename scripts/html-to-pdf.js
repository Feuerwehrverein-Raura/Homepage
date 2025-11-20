const puppeteer = require('puppeteer');
const path = require('path');

async function generatePDF() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Load the HTML file
    const htmlPath = path.join(__dirname, '..', 'calendar-events.html');
    await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdfPath = path.join(__dirname, '..', 'calendar-events.pdf');
    await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: {
            top: '2cm',
            right: '2cm',
            bottom: '2cm',
            left: '2cm'
        },
        printBackground: true
    });

    await browser.close();

    console.log(`PDF generated: ${pdfPath}`);
}

generatePDF().catch(error => {
    console.error('Error generating PDF:', error);
    process.exit(1);
});
