# PowerShell script for building and deploying

Write-Host "🚀 Building and Deploying Drama Shorts Admin Panel..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Build React Admin Panel
Write-Host "📦 Step 1: Building React Admin Panel..." -ForegroundColor Yellow
Set-Location admin-react

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed!" -ForegroundColor Red
    exit 1
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ React build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "✅ React build completed!" -ForegroundColor Green
Set-Location ..

# Step 2: Check if build exists
if (-not (Test-Path "admin-react\dist")) {
    Write-Host "❌ Build directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build successful! Files are in admin-react\dist\" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Make sure .env file is configured"
Write-Host "   2. Start server: npm start"
Write-Host "   3. Or use PM2: pm2 start server.js --name dramashorts-api"
Write-Host ""
Write-Host "🌐 Admin Panel will be available at: http://your-server:3000" -ForegroundColor Green

