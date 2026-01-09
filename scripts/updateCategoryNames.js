const mongoose = require('mongoose');
require('dotenv').config();
const Series = require('../models/Series');
const ComingSoonSeries = require('../models/ComingSoonSeries');
const Category = require('../models/Category');

// Category name mappings: old name -> new name
const categoryMappings = {
  'Pregnancy & Secret Heirs': 'Pregnancy And Secret Heirs',
  'Revenge & Redemption': 'Revenge And Redemption'
};

const updateCategoryNames = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shorts_video');
    console.log('Connected to MongoDB\n');

    let seriesUpdated = 0;
    let comingSoonUpdated = 0;
    let categoryUpdated = 0;

    // Update Series collection
    console.log('Updating Series collection...');
    const allSeries = await Series.find({});
    
    for (const series of allSeries) {
      let updated = false;
      const newCategories = series.category.map(cat => {
        if (categoryMappings[cat]) {
          updated = true;
          return categoryMappings[cat];
        }
        return cat;
      });

      if (updated) {
        await Series.findByIdAndUpdate(series._id, { category: newCategories });
        seriesUpdated++;
        console.log(`  ✓ Updated Series: ${series.title} (ID: ${series._id})`);
      }
    }
    console.log(`\nSeries updated: ${seriesUpdated} documents\n`);

    // Update ComingSoonSeries collection
    console.log('Updating ComingSoonSeries collection...');
    const allComingSoonSeries = await ComingSoonSeries.find({});
    
    for (const series of allComingSoonSeries) {
      let updated = false;
      const newCategories = series.category.map(cat => {
        if (categoryMappings[cat]) {
          updated = true;
          return categoryMappings[cat];
        }
        return cat;
      });

      if (updated) {
        await ComingSoonSeries.findByIdAndUpdate(series._id, { category: newCategories });
        comingSoonUpdated++;
        console.log(`  ✓ Updated ComingSoonSeries: ${series.title} (ID: ${series._id})`);
      }
    }
    console.log(`\nComingSoonSeries updated: ${comingSoonUpdated} documents\n`);

    // Update Category collection
    console.log('Updating Category collection...');
    for (const [oldName, newName] of Object.entries(categoryMappings)) {
      const oldCategory = await Category.findOne({ name: oldName });
      if (oldCategory) {
        // Check if new category already exists
        const existingNewCategory = await Category.findOne({ name: newName });
        if (existingNewCategory) {
          console.log(`  ⊘ Category "${newName}" already exists, skipping update`);
        } else {
          await Category.findByIdAndUpdate(oldCategory._id, { name: newName });
          categoryUpdated++;
          console.log(`  ✓ Updated Category: "${oldName}" → "${newName}"`);
        }
      } else {
        // Create new category if old one doesn't exist
        const existingNewCategory = await Category.findOne({ name: newName });
        if (!existingNewCategory) {
          await Category.create({ name: newName });
          categoryUpdated++;
          console.log(`  ✓ Created Category: "${newName}"`);
        }
      }
    }
    console.log(`\nCategories updated: ${categoryUpdated} documents\n`);

    console.log('=== Migration Summary ===');
    console.log(`Series documents updated: ${seriesUpdated}`);
    console.log(`ComingSoonSeries documents updated: ${comingSoonUpdated}`);
    console.log(`Category documents updated: ${categoryUpdated}`);
    console.log('\n✓ Migration completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Error updating category names:', error);
    process.exit(1);
  }
};

updateCategoryNames();
