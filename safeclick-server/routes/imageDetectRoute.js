const express = require('express');
const router = express.Router();
const { detectAIFromImageUrl } = require('../controllers/imageDetectController');

router.post('/', detectAIFromImageUrl);

module.exports = router;
