const express = require('express');
const router = express.Router();
const {
  getAllTags,
  createTag
} = require('../controllers/tagController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', getAllTags);
router.post('/', protect, authorize('admin'), createTag);

module.exports = router;

