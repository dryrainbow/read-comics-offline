var PdfPrinter = require('pdfmake');
var fs = require('fs');
const puppeteer = require('puppeteer');
const prompts = require('prompts');

const SELECTORS = {
    IMAGES: () => '#divImage img',
    IMAGES_WITH_SRC: (src) => `#divImage img[src="${src}"]`
};

(async () => {
    let { url } = await prompts({
        type: 'text',
        name: 'url',
        message: 'Enter a link to comics',
        validate: value => isInvalidUrl(value) ? `Please, enter a valid url` : true
    });

    url = transformUrl(url)

    let { filename } = await prompts({
        type: 'text',
        name: 'filename',
        message: 'Enter a filename for pdf',
        validate: value => value.length === 0 ? `Please, enter a valid name` : true
    });

    if (!/.*(\.pdf)$/.test(filename)) {
        filename += '.pdf'
    }

    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: './user_data'
    });
    const page = await browser.newPage();
    const images = {}
    page.on('response', async (response) => {
        const image = await interseptImages(page, response)
        if (image !== null) {
            images[image.url] = image;
        }
    })

    await page.goto(url, { waitUntil: "networkidle0" });
    await buildPdf(filename, page, images);
    console.log(`Comics ${filename} saved, pages: ${Object.keys(images).length}`)
    browser.close()
})();


async function interseptImages(page, response) {
    if (response.request().resourceType() === 'image') {
        const element = await page.$(SELECTORS.IMAGES_WITH_SRC(response.request().url()));
        if (element && response.buffer) {
            const buffer = await response.buffer()
            const contentType = response.headers()['content-type']
            const imageType = contentType.split('/')[1].toUpperCase()
            const base64 = buffer.toString('base64')
            return {
                type: imageType,
                content: `data:${contentType};base64,${base64}`,
                url: response.request().url()
            }
        }
    }
    return null
}

function isInvalidUrl(url) {
    try {
        url = new URL(url);
        return false
    } catch (_) {
        return true;
    }
}

function transformUrl(url) {
    let u = new URL(url)
    u.searchParams.set('readType', '1')
    return u.toString();
}

async function buildPdf(filename, page, images) {
    const doc = { content: [] }
    const elements = await page.$$(SELECTORS.IMAGES());
    for (const el of elements) {
        const src = await page.evaluate(el => el.getAttribute("src"), el);
        doc.content.push({
            image: images[src].content,
            fit: [595, 800]
        })
    }

    var printer = new PdfPrinter();
    var pdfDoc = printer.createPdfKitDocument(doc);
    pdfDoc.pipe(fs.createWriteStream(filename));
    pdfDoc.end();
}