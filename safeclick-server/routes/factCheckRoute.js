const express = require('express');
const router = express.Router();
const { factCheck } = require('../controllers/factCheckController');

router.post('/', factCheck);

module.exports = router;
