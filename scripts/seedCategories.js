const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('../models/Category');

const categories = [
  'Asian',
  'Romance',
  'CEO/Billionaire',
  'Drama',
  'Fantasy',
  'Werewolf/Alpha',
  'Revenge And Redemption',
  'Mafia/Crime',
  'Pregnancy And Secret Heirs',
  'New'
];

const seedCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shorts_video');
    console.log('Connected to MongoDB');

    // Clear existing categories (optional - comment out if you want to keep existing)
    // await Category.deleteMany({});
    // console.log('Cleared existing categories');

    // Insert categories
    let created = 0;
    let skipped = 0;

    for (const categoryName of categories) {
      try {
        const category = await Category.create({ name: categoryName });
        console.log(`✓ Created category: ${categoryName}`);
        created++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⊘ Category already exists: ${categoryName}`);
          skipped++;
        } else {
          console.error(`✗ Error creating category ${categoryName}:`, error.message);
        }
      }
    }

    console.log('\n=== Seed Summary ===');
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Total: ${categories.length}`);

    // Display all categories
    const allCategories = await Category.find().sort({ name: 1 });
    console.log('\n=== All Categories in Database ===');
    allCategories.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.name}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  }
};

seedCategories();

