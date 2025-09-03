const express = require('express');
const router = express.Router();
const { detectAIText } = require('../controllers/detectController');

router.post('/', detectAIText);

module.exports = router;
