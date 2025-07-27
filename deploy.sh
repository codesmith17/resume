#!/bin/bash

# Resume Tracker Deployment Script for Vercel

echo "🚀 Resume Tracker - Vercel Deployment Helper"
echo "============================================"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please run 'git init' first."
    exit 1
fi

# Check if files exist
if [ ! -f "index.js" ]; then
    echo "❌ Error: index.js not found. Make sure you're in the correct directory."
    exit 1
fi

if [ ! -f "vercel.json" ]; then
    echo "❌ Error: vercel.json not found. Make sure you're in the correct directory."
    exit 1
fi

echo "✅ Files check passed"
echo ""

# Ask about environment setup
echo "🔧 Environment Setup:"
echo "Do you have Google Sheets credentials ready? (y/n)"
read -r has_credentials

if [ "$has_credentials" = "y" ] || [ "$has_credentials" = "Y" ]; then
    echo "📊 You'll deploy in PRODUCTION mode with Google Sheets integration"
    DEPLOY_MODE="production"
else
    echo "🧪 You'll deploy in DEVELOPMENT mode (no Google Sheets required)"
    DEPLOY_MODE="development"
fi

echo ""

# Check git status
echo "📋 Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 You have uncommitted changes. Committing them now..."
    git add .
    git commit -m "Prepare for Vercel deployment - $(date)"
    echo "✅ Changes committed"
else
    echo "✅ Working directory clean"
fi

echo ""

# Push to GitHub
echo "📤 Pushing to GitHub..."
if git push origin main 2>/dev/null || git push origin master 2>/dev/null; then
    echo "✅ Pushed to GitHub successfully"
else
    echo "⚠️  Push failed or no remote configured. You may need to:"
    echo "   - Create a GitHub repository"
    echo "   - Add remote: git remote add origin https://github.com/username/repo.git"
    echo "   - Push manually: git push -u origin main"
fi

echo ""
echo "🎯 Next Steps:"
echo "=============="

if [ "$DEPLOY_MODE" = "production" ]; then
    echo "1. Go to https://vercel.com and import your GitHub repository"
    echo "2. Add these environment variables in Vercel:"
    echo "   - GOOGLE_CREDENTIALS (your service account JSON)"
    echo "   - SHEET_ID (your Google Sheet ID)"
    echo "   - RESUME_URL (https://codesmith17.github.io/resume/resume.pdf)"
    echo "3. Deploy and test your endpoints"
else
    echo "1. Go to https://vercel.com and import your GitHub repository"
    echo "2. Add these environment variables in Vercel:"
    echo "   - NODE_ENV = development"
    echo "   - RESUME_URL = https://codesmith17.github.io/resume/resume.pdf"
    echo "3. Deploy and test your endpoints"
fi

echo ""
echo "📊 After deployment, test these URLs:"
echo "- https://your-app.vercel.app/health"
echo "- https://your-app.vercel.app/track"
echo "- https://your-app.vercel.app/track-email?email=test@company.com"
echo "- https://your-app.vercel.app/stats"
echo ""

echo "📖 For detailed instructions, see VERCEL-DEPLOY.md"
echo ""
echo "🎯 Once deployed, share this URL instead of your direct resume link:"
echo "   https://your-app.vercel.app/track"
echo ""

echo "✅ Deployment preparation complete!"
echo "Happy tracking! 🎯" 