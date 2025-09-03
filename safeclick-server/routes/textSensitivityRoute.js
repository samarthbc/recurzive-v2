const express = require('express');
const router = express.Router();
const { analyzeSensitivity } = require('../controllers/textSensitivityController');

router.post('/', analyzeSensitivity);

module.exports = router;
