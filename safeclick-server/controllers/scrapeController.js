const puppeteer = require('puppeteer');
// const ScrapeResult = require('../models/ScrapeResult'); // COMMENTED OUT: MongoDB model removed

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let lastHeight = document.body.scrollHeight;
            let totalTries = 0;

            const timer = setInterval(() => {
                window.scrollBy(0, window.innerHeight);
                let newHeight = document.body.scrollHeight;

                if (newHeight === lastHeight) {
                    totalTries++;
                } else {
                    totalTries = 0;
                    lastHeight = newHeight;
                }

                // If page hasn't grown in 3 tries (~3s), we assume it's fully loaded
                if (totalTries > 3) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1000); // Wait 1s between scrolls to let content load
        });
    });
}


exports.scrapeContent = async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

        // 👇 Auto-scroll to load lazy content
        await autoScroll(page);

        const text = await page.evaluate(() => {
            return document.body.innerText.replace(/\s+/g, ' ').trim();
        });

        const images = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.map(img => img.src);
        });

        await browser.close();

        // COMMENTED OUT: MongoDB save operation bypassed
        /*
        const result = new ScrapeResult({ url, text, images });
        await result.save();
        */
        
        // DIRECT RESPONSE: Return data without saving to database
        console.log(`Scraped content from ${url} - ${text.length} characters, ${images.length} images`);

        res.json({
            url,
            text: text, // increase if needed
            images
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to scrape the page with Puppeteer" });
    }
};
