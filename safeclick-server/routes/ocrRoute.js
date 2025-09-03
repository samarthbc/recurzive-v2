const express = require('express');
const multer = require('multer');
const router = express.Router();
const { performOCR } = require('../controllers/ocrController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept image files only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// OCR endpoint - accepts file upload, image URL, or base64
router.post('/', upload.single('image'), performOCR);

module.exports = router;
