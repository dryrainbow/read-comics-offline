const jsPDF = require('jspdf').jsPDF
const puppeteer = require('puppeteer');
const prompts = require('prompts');

const SELECTORS = {
    IMAGES: () => '#divImage img',
    IMAGES_WITH_SRC: (src) => `#divImage img[src="${src}"]`
};

(async () => {
    let {
        filename,
        url,
        quality
    } = await getConfigOfLoading()
    url = transformUrl(url, quality)
    filename = transformFileName(filename)

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
    await page.goto(url, {waitUntil: "domcontentloaded"});
    await waitForImages(page, SELECTORS.IMAGES);
    const imagesElements = await page.$$(SELECTORS.IMAGES());
    // insurance for async bufferizing images
    let interval = setInterval(async () => {
        if (Object.keys(images).length < imagesElements.length) {
            return
        }
        clearInterval(interval)
        await buildPdf(filename, page, images);
        console.log(`Comics ${filename} saved, pages: ${Object.keys(images).length}`)
        await browser.close()
    }, 500)
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

function transformUrl(url, quality) {
    let u = new URL(url)
    u.searchParams.set('readType', '1')
    u.searchParams.set('quality', quality)
    return u.toString();
}
function transformFileName(filename) {
    if (!/.*(\.pdf)$/.test(filename)) {
        filename += '.pdf'
    }
    return filename
}

async function buildPdf(filename, page, images) {
    const docTest = new jsPDF();
    const elements = await page.$$(SELECTORS.IMAGES());
    let pageNumber = 0;
    for (const el of elements) {
        const src = await page.evaluate(el => el.getAttribute("src"), el);
        const width = await page.evaluate(el => el.clientWidth, el);
        const height = await page.evaluate(el => el.clientHeight, el);
        docTest.addPage([width, height], getOrientation(width, height))
        pageNumber += 1;
        docTest.setPage(pageNumber + 1)
        const image = images[src];
        docTest.addImage(image.content, image.type, 0, 0, width, height, null, 'NONE')
    }
    docTest.deletePage(1)
    docTest.save(filename)
}

function getOrientation(width, height) {
    if (width > height) {
        return 'landscape'
    } else {
        return 'portrait'
    }
}

async function waitForImages(page) {
    await page.evaluate(async (selector) => {
        const selectors = Array.from(document.querySelectorAll(selector));
        await Promise.all(selectors.map(img => {
            if (img.complete) return;
            return new Promise((resolve, reject) => {
                img.addEventListener('load', resolve);
                img.addEventListener('error', reject);
            });
        }));
    }, SELECTORS.IMAGES())
}


async function getConfigOfLoading() {
    return await prompts([
        {
            type: 'text',
            name: 'url',
            message: 'Enter a link to comics',
            validate: value => isInvalidUrl(value) ? `Please, enter a valid url` : true
        },
        {
            type: 'text',
            name: 'filename',
            message: 'Enter a filename for pdf',
            validate: value => value.length === 0 ? `Please, enter a valid name` : true
        },
        {
            type: 'select',
            name: 'quality',
            message: 'Pick quality',
            choices: [
                { title: 'Low', value: 'lq' },
                { title: 'High', value: 'hq' },
            ],
        }
    ]);
}