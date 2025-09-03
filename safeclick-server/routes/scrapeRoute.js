// routes/scrapeRoute.js
const express = require('express');
const router = express.Router();
const { scrapeContent } = require('../controllers/scrapeController');

router.post('/', scrapeContent);

module.exports = router;
