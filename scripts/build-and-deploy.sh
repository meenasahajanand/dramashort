#!/bin/bash

echo "🚀 Building and Deploying Drama Shorts Admin Panel..."
echo ""

# Step 1: Build React Admin Panel
echo "📦 Step 1: Building React Admin Panel..."
cd admin-react
npm install
npm run build

if [ $? -ne 0 ]; then
    echo "❌ React build failed!"
    exit 1
fi

echo "✅ React build completed!"
cd ..

# Step 2: Check if build exists
if [ ! -d "admin-react/dist" ]; then
    echo "❌ Build directory not found!"
    exit 1
fi

echo ""
echo "✅ Build successful! Files are in admin-react/dist/"
echo ""
echo "📋 Next steps:"
echo "   1. Make sure .env file is configured"
echo "   2. Start server: npm start"
echo "   3. Or use PM2: pm2 start server.js --name dramashorts-api"
echo ""
echo "🌐 Admin Panel will be available at: http://your-server:3000"

