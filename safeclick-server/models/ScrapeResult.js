// models/ScrapeResult.js
const mongoose = require('mongoose');

const scrapeResultSchema = new mongoose.Schema({
    url: String,
    text: String,
    images: [String],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ScrapeResult', scrapeResultSchema);
