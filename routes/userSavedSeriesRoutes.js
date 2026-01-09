const express = require('express');
const router = express.Router();
const {
  toggleSavedSeries,
  getSavedSeries
} = require('../controllers/userSavedSeriesController');

// toggle save/unsave a series (userId in body, no token required)
router.post('/', toggleSavedSeries);

// list saved series for user (userId in query, no token required)
router.get('/', getSavedSeries);

module.exports = router;

