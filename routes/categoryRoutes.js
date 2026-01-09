const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  createCategory
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', getAllCategories);
router.post('/', protect, authorize('admin'), createCategory);

module.exports = router;

